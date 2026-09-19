import { createAdminClient } from '@/lib/supabase/admin'
import { getSecret } from '@/lib/secrets'
import { notify } from '@/lib/notify'
import { activeProvider, settle, verifyFlutterwave, verifyPaystack, APP_URL, type Provider } from '@/lib/pay'
import { enqueue } from '@/lib/jobs'

/**
 * Recurring billing (Nathan, 2026-09-19): "how do we continuously charge a
 * card when it's due rather than asking the customer to always enter it."
 *
 *   renew   — daily. For each shop expiring within 3 days (or in grace) with
 *             auto-renew on and a card on file: raise the next invoice, charge
 *             the card with the ACTIVE provider's token, settle. A failed
 *             charge leaves the invoice unpaid, emails the owner a pay link,
 *             and is retried on the next daily run — three times, then it
 *             stops and staff are told.
 *   remind  — daily. Shops WITHOUT a card on file get an email at 7, 1 and 0
 *             days before expiry, once each per expiry date.
 *
 * Both are idempotent: running twice in a day does nothing the second time.
 */
const P = 'doka'
const MAX_CHARGE_ATTEMPTS = 3

interface Due { shop_id: string; plan: string; expires_at: string; method_id: string; provider: Provider; token: string; email: string }

export async function runRenewals(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const provider = await activeProvider()
  const { data: due, error } = await admin.rpc('renewals_due', { p_days: 3 })
  if (error) throw new Error(error.message)
  const out = { raised: 0, charged: 0, failed: 0, retried: 0, skipped: [] as string[] }

  // 1. Raise renewal invoices for shops that are due and have none yet.
  for (const d of (due ?? []) as Due[]) {
    const { data: plan, error: pErr } = await admin.from('pricing_plans').select('key, name, price_monthly, currency').eq('product', P).eq('key', d.plan).maybeSingle()
    if (pErr || !plan) { out.skipped.push(`${d.shop_id}: ${pErr?.message ?? `plan ${d.plan} not live`}`); continue }
    const start = new Date(d.expires_at); start.setUTCHours(0, 0, 0, 0)   // expires_at is period_end + 1 → next period starts that day
    const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(end.getUTCDate() - 1)
    const { data: number, error: nErr } = await admin.rpc('next_invoice_number', { p_product: P })
    if (nErr) { out.skipped.push(`${d.shop_id}: ${nErr.message}`); continue }
    const { error: iErr } = await admin.from('invoices').insert({ number, product: P, shop_id: d.shop_id, plan_key: plan.key, period_start: start.toISOString().slice(0, 10), period_end: end.toISOString().slice(0, 10), amount: Number(plan.price_monthly), currency: plan.currency, kind: 'renewal' })
    if (iErr) { out.skipped.push(`${d.shop_id}: ${iErr.message}`); continue }
    out.raised++
  }

  // 2. Charge every unpaid renewal invoice that still has attempts left and a card on file.
  const { data: open, error: oErr } = await admin.from('invoices').select('id, number, shop_id, amount, currency, charge_attempts, shops(name)').eq('product', P).eq('status', 'unpaid').eq('kind', 'renewal').lt('charge_attempts', MAX_CHARGE_ATTEMPTS)
  if (oErr) throw new Error(oErr.message)
  for (const inv of open ?? []) {
    if (!provider) { out.skipped.push(`${inv.number}: no provider switched on`); continue }
    const { data: pm, error: pmErr } = await admin.from('payment_methods').select('id, token, email').eq('shop_id', inv.shop_id).eq('provider', provider).is('revoked_at', null).eq('reusable', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (pmErr || !pm) { out.skipped.push(`${inv.number}: ${pmErr?.message ?? `no card on file for ${provider}`}`); continue }
    const attempt = (inv.charge_attempts as number) + 1
    if (attempt > 1) out.retried++
    const r = await chargeToken(provider, { token: pm.token as string, email: pm.email as string, amount: Number(inv.amount), currency: inv.currency as string, invoiceId: inv.id as string, number: inv.number as string })
    const shop = (inv.shops as unknown as { name: string } | null)?.name ?? inv.shop_id
    if (r.ok) {
      const v = provider === 'paystack' ? await verifyPaystack(P, r.reference) : await verifyFlutterwave(P, r.reference, r.txId)
      if (v.ok) { const s = await settle(inv.id as string, provider, v); if (s.ok) { out.charged++; await admin.from('invoices').update({ charge_attempts: attempt, last_charge_error: null }).eq('id', inv.id); continue } }
    }
    const reason = r.ok ? 'charged but could not verify' : r.error
    out.failed++
    await admin.from('invoices').update({ charge_attempts: attempt, last_charge_error: reason }).eq('id', inv.id)
    // Tell the owner (first failure and last), and staff on the last.
    if (attempt === 1 || attempt >= MAX_CHARGE_ATTEMPTS) {
      const { data: owner, error: ownErr } = await admin.from('ops_user_memberships').select('email').eq('shop_id', inv.shop_id).eq('role_key', 'owner').eq('is_active', true).limit(1).maybeSingle()
      if (ownErr) console.error('owner lookup:', ownErr.message)
      if (owner?.email) await enqueue('send_email', { to: owner.email, identity: P, subject: `We couldn't renew Doka for ${shop}`, text: `Invoice ${inv.number} (₦${Number(inv.amount).toLocaleString()}) could not be charged to your card on file: ${reason}.\n\nPay it from your dashboard, or add a different card there: ${APP_URL}/subscription\n\n${attempt >= MAX_CHARGE_ATTEMPTS ? 'We will not try this card again.' : 'We will try once more tomorrow.'} Your shop keeps working through the grace period.` }, { product: P })
    }
    if (attempt >= MAX_CHARGE_ATTEMPTS) await notify(`${P}.payment`, { title: `Renewal failed 3 times: ${shop}`, body: `${inv.number} · ${reason}`, link: `/ops/${P}/shops/${inv.shop_id}`, product: P })
  }
  return out
}

/** Charge a stored token. Reference is unique per attempt so the provider never confuses retries. */
async function chargeToken(provider: Provider, c: { token: string; email: string; amount: number; currency: string; invoiceId: string; number: string }): Promise<{ ok: true; reference: string; txId?: number } | { ok: false; error: string }> {
  const reference = `${c.number}-R${Date.now().toString(36)}`.replace(/[^A-Za-z0-9-]/g, '')
  try {
    if (provider === 'paystack') {
      const key = await getSecret(P, 'paystack_secret_key'); if (!key) return { ok: false, error: 'Paystack key missing' }
      const res = await fetch('https://api.paystack.co/transaction/charge_authorization', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ authorization_code: c.token, email: c.email, amount: Math.round(c.amount * 100), currency: c.currency, reference, metadata: { invoice_id: c.invoiceId, invoice_number: c.number, product: P, renewal: true } }) })
      const j = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { status?: string; gateway_response?: string; reference?: string } } | null
      if (!res.ok || !j?.status || !j.data) return { ok: false, error: j?.message ?? `Paystack said ${res.status}` }
      if (j.data.status !== 'success') return { ok: false, error: j.data.gateway_response ?? j.data.status ?? 'declined' }
      return { ok: true, reference: j.data.reference ?? reference }
    }
    const key = await getSecret(P, 'flutterwave_secret_key'); if (!key) return { ok: false, error: 'Flutterwave key missing' }
    const res = await fetch('https://api.flutterwave.com/v3/tokenized-charges', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ token: c.token, currency: c.currency, country: 'NG', amount: c.amount, email: c.email, tx_ref: reference, narration: `Doka renewal ${c.number}`, meta: { invoice_id: c.invoiceId, invoice_number: c.number, product: P, renewal: true } }) })
    const j = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { id?: number; status?: string; tx_ref?: string; processor_response?: string } } | null
    if (!res.ok || j?.status !== 'success' || !j.data) return { ok: false, error: j?.message ?? `Flutterwave said ${res.status}` }
    if (j.data.status !== 'successful') return { ok: false, error: j.data.processor_response ?? j.data.status ?? 'declined' }
    return { ok: true, reference: j.data.tx_ref ?? reference, txId: j.data.id }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** 7 / 1 / 0 days before expiry, for shops with no card on file (or auto-renew off). Once per mark per expiry date. */
export async function runReminders(): Promise<Record<string, unknown>> {
  const admin = createAdminClient()
  const { data: subs, error } = await admin.from('subscriptions').select('shop_id, plan, expires_at, auto_renew, reminded, shops(name, is_active)').not('expires_at', 'is', null).neq('status', 'cancelled').lte('expires_at', new Date(Date.now() + 8 * 86_400_000).toISOString())
  if (error) throw new Error(error.message)
  const { data: cards, error: cErr } = await admin.from('payment_methods').select('shop_id').is('revoked_at', null).eq('reusable', true)
  if (cErr) throw new Error(cErr.message)
  const withCard = new Set((cards ?? []).map((c) => c.shop_id as string))
  let sent = 0
  for (const s of subs ?? []) {
    const shop = s.shops as unknown as { name: string; is_active: boolean } | null
    if (!shop?.is_active) continue
    if (s.auto_renew && withCard.has(s.shop_id as string)) continue   // the renewal job handles these
    const days = Math.ceil((Date.parse(s.expires_at as string) - Date.now()) / 86_400_000)
    const mark = days <= 0 ? '0' : days <= 1 ? '1' : days <= 7 ? '7' : null
    if (!mark) continue
    const reminded = (s.reminded ?? {}) as Record<string, string>
    const expiryDate = (s.expires_at as string).slice(0, 10)
    if (reminded[mark] === expiryDate) continue
    const { data: owner, error: ownErr } = await admin.from('ops_user_memberships').select('email').eq('shop_id', s.shop_id).eq('role_key', 'owner').eq('is_active', true).limit(1).maybeSingle()
    if (ownErr || !owner?.email) continue
    const when = mark === '0' ? 'today' : mark === '1' ? 'tomorrow' : `in ${days} days`
    await enqueue('send_email', { to: owner.email, identity: P, subject: `Doka for ${shop.name} renews ${when}`, text: `Your Doka subscription (${s.plan}) for ${shop.name} ends ${when}, on ${expiryDate}.\n\nRenew from your dashboard — after you pay once with a card, we can renew it for you automatically: ${APP_URL}/subscription\n\nAfter expiry there is a short grace period, then terminals go read-only until it is renewed.` }, { product: P })
    await admin.from('subscriptions').update({ reminded: { ...reminded, [mark]: expiryDate } }).eq('shop_id', s.shop_id)
    sent++
  }
  return { sent }
}

/** The runner calls this every tick: make sure today's renew and remind jobs exist. Idempotent. */
export async function ensureDailyJobs(): Promise<void> {
  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  for (const kind of ['renew', 'remind'] as const) {
    const { data, error } = await admin.from('jobs').select('id').eq('kind', kind).gte('created_at', `${today}T00:00:00Z`).limit(1)
    if (error) { console.error('ensureDailyJobs read:', error.message); continue }
    if (!data?.length) await admin.from('jobs').insert({ kind, product: P, payload: { day: today }, max_attempts: 3 })
  }
}
