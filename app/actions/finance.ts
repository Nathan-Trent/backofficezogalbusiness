'use server'

import { assertCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'

type Result = { ok: true; data?: unknown } | { ok: false; error: string }
const P = 'doka'

// ---- Plans: Save is a draft, Publish is the promise ------------------------

export interface PlanDraft {
  id?: string; key: string; name: string; tagline: string | null; price_monthly: number; price_yearly: number | null
  features: string[]; limits: Record<string, number | null>; highlight: boolean; is_visible: boolean; sort_order: number
}

function validate(p: PlanDraft): string | null {
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(p.key)) return 'Key: lowercase letters, digits and _ only (e.g. standard)'
  if (!p.name.trim()) return 'Name is needed'
  if (!Number.isFinite(p.price_monthly) || p.price_monthly < 0) return 'Monthly price must be 0 or more'
  if (p.price_yearly !== null && (!Number.isFinite(p.price_yearly) || p.price_yearly < 0)) return 'Yearly price must be 0 or more, or empty'
  for (const [k, v] of Object.entries(p.limits)) if (v !== null && (!Number.isInteger(v) || v < 0)) return `Limit ${k} must be a whole number, or empty for unlimited`
  return null
}

/** Save one plan to the DRAFT catalogue. Nothing the app or the site shows changes. */
export async function savePlanDraft(p: PlanDraft): Promise<Result> {
  const op = await assertCap(`${P}.finance.edit`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const bad = validate(p); if (bad) return { ok: false, error: bad }
  const admin = createAdminClient()
  const limits = Object.fromEntries(Object.entries(p.limits).filter(([, v]) => v !== null))
  const row = { product: P, key: p.key, name: p.name.trim(), tagline: p.tagline?.trim() || null, price_monthly: p.price_monthly, price_yearly: p.price_yearly, features: p.features.map((f) => f.trim()).filter(Boolean), limits, highlight: p.highlight, is_visible: p.is_visible, sort_order: p.sort_order, updated_by: op.userId, updated_at: new Date().toISOString() }
  const q = p.id ? admin.from('pricing_plans_draft').update(row).eq('id', p.id).select('id').single() : admin.from('pricing_plans_draft').insert(row).select('id').single()
  const { data, error } = await q
  if (error) return { ok: false, error: error.message.includes('duplicate') ? `A plan with key "${p.key}" already exists` : error.message }
  await recordAction(op, { action: 'plan.draft', product: P, summary: `Drafted plan "${p.name}" (${p.key}) ₦${p.price_monthly}/mo`, targetType: 'plan', targetId: data.id as string })
  return { ok: true, data: { id: data.id } }
}

/** Remove a plan from the draft. On publish, the live copy is HIDDEN (subscriptions may still name it). */
export async function deletePlanDraft(id: string): Promise<Result> {
  const op = await assertCap(`${P}.finance.edit`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('pricing_plans_draft').delete().eq('id', id).eq('product', P).select('name, key').maybeSingle()
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'plan.draft_delete', product: P, summary: `Removed plan "${data?.name ?? id}" from the draft`, targetType: 'plan', targetId: id })
  return { ok: true }
}

/** Throw the draft away and start again from what is live. */
export async function discardPlanDrafts(): Promise<Result> {
  const op = await assertCap(`${P}.finance.edit`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { error: dErr } = await admin.from('pricing_plans_draft').delete().eq('product', P)
  if (dErr) return { ok: false, error: dErr.message }
  const { data: live, error: lErr } = await admin.from('pricing_plans').select('*').eq('product', P)
  if (lErr) return { ok: false, error: lErr.message }
  if (live?.length) { const { error } = await admin.from('pricing_plans_draft').insert(live); if (error) return { ok: false, error: error.message } }
  await recordAction(op, { action: 'plan.draft_discard', product: P, summary: 'Discarded plan drafts; draft now matches live' })
  return { ok: true }
}

/** Publish: draft → live in one call (publish_catalogue), version bumped, site revalidated. */
export async function publishPlans(note: string): Promise<Result> {
  const op = await assertCap(`${P}.finance.publish`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data: version, error } = await admin.rpc('publish_catalogue', { p_product: P, p_note: note.trim() || null })
  if (error) return { ok: false, error: error.message }
  // published_by: the RPC uses current_app_user_id(), which is null under the service role — stamp it here.
  await admin.from('catalogue_publish').update({ published_by: op.userId }).eq('product', P).eq('version', version as number)
  await recordAction(op, { action: 'plan.publish', product: P, summary: `Published Doka plans, version ${version}${note ? ` — ${note.trim()}` : ''}` })
  await notify(`${P}.published`, { title: `Doka plans published (v${version})`, body: note.trim() || `by ${op.name ?? op.email}`, link: `/ops/${P}/finance/plans`, product: P })
  // Ask the marketing site to drop its cached pricing — as a job, retried if the site is slow.
  const { enqueue } = await import('@/lib/jobs')
  await enqueue('revalidate_site', { path: '/doka' }, { product: P, createdBy: op.userId, maxAttempts: 3 })
  return { ok: true, data: { version } }
}

// ---- Invoices --------------------------------------------------------------

/** Raise an invoice for a shop for one period on a plan. Emailed to the owner with a pay link. */
export async function createInvoice(input: { shopId: string; planKey: string; months: 1 | 12; startDate: string }): Promise<Result> {
  const op = await assertCap(`${P}.finance.subscriptions`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data: plan, error: pErr } = await admin.from('pricing_plans').select('key, name, price_monthly, price_yearly, currency').eq('product', P).eq('key', input.planKey).maybeSingle()
  if (pErr) return { ok: false, error: pErr.message }
  if (!plan) return { ok: false, error: 'No such live plan' }
  const start = new Date(input.startDate + 'T00:00:00Z'); if (Number.isNaN(start.getTime())) return { ok: false, error: 'Start date is needed' }
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + input.months); end.setUTCDate(end.getUTCDate() - 1)
  const amount = input.months === 12 ? (plan.price_yearly ?? Number(plan.price_monthly) * 12) : Number(plan.price_monthly)
  const { data: number, error: nErr } = await admin.rpc('next_invoice_number', { p_product: P })
  if (nErr) return { ok: false, error: nErr.message }
  const { data: inv, error } = await admin.from('invoices').insert({ number, product: P, shop_id: input.shopId, plan_key: plan.key, period_start: input.startDate, period_end: end.toISOString().slice(0, 10), amount, currency: plan.currency, created_by: op.userId }).select('id, number').single()
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'invoice.create', product: P, summary: `Invoice ${inv.number}: ${plan.name} × ${input.months} month${input.months > 1 ? 's' : ''}, ₦${amount.toLocaleString()}`, targetType: 'invoice', targetId: inv.id as string })
  await emailInvoice(inv.id as string)
  return { ok: true, data: { id: inv.id, number: inv.number } }
}

/** Email the shop owner: what is due, until when, and where to pay (their dashboard). */
export async function emailInvoice(invoiceId: string): Promise<Result> {
  const admin = createAdminClient()
  const { data: inv, error } = await admin.from('invoices').select('id, number, shop_id, plan_key, period_start, period_end, amount, currency, status, shops(name)').eq('id', invoiceId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!inv) return { ok: false, error: 'No such invoice' }
  const { data: owner, error: oErr } = await admin.from('ops_user_memberships').select('email').eq('shop_id', inv.shop_id).eq('role_key', 'owner').eq('is_active', true).order('joined_at').limit(1).maybeSingle()
  if (oErr) return { ok: false, error: oErr.message }
  if (!owner?.email) return { ok: false, error: 'Shop has no owner email' }
  const shop = (inv.shops as unknown as { name: string } | null)?.name ?? 'your shop'
  const app = process.env.DOKA_APP_URL ?? 'https://doka.zogal.app'
  const paid = inv.status === 'paid'
  const text = paid
    ? `Receipt ${inv.number} for ${shop}.\n\nPlan: ${inv.plan_key}\nPeriod: ${inv.period_start} to ${inv.period_end}\nAmount: ₦${Number(inv.amount).toLocaleString()} — paid.\n\nThank you. Your subscription runs to ${inv.period_end}.`
    : `Invoice ${inv.number} for ${shop}.\n\nPlan: ${inv.plan_key}\nPeriod: ${inv.period_start} to ${inv.period_end}\nAmount due: ₦${Number(inv.amount).toLocaleString()}\n\nPay from your dashboard: ${app}/subscription\n\nYour shop keeps working during the grace period after expiry; after that terminals go read-only until it is paid.`
  const { enqueue } = await import('@/lib/jobs')
  const id = await enqueue('send_email', { to: owner.email as string, subject: paid ? `Receipt ${inv.number} — ${shop}` : `Invoice ${inv.number} — ${shop}`, text, identity: P }, { product: P })
  return id ? { ok: true } : { ok: false, error: 'could not queue the email' }
}

/** Mark paid by hand (bank transfer, cash). Same rule as the webhooks: apply_payment. */
export async function markInvoicePaid(input: { invoiceId: string; reference: string }): Promise<Result> {
  const op = await assertCap(`${P}.finance.subscriptions`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const ref = input.reference.trim(); if (!ref) return { ok: false, error: 'A reference is needed (transfer ref, receipt no.)' }
  const admin = createAdminClient()
  const { error } = await admin.rpc('apply_payment', { p_invoice_id: input.invoiceId, p_provider: 'manual', p_provider_ref: ref })
  if (error) return { ok: false, error: error.message }
  const { data: inv, error: iErr } = await admin.from('invoices').select('number, shop_id, amount, shops(name)').eq('id', input.invoiceId).single()
  if (iErr) return { ok: false, error: iErr.message }
  const shop = (inv.shops as unknown as { name: string } | null)?.name ?? inv.shop_id
  await recordAction(op, { action: 'invoice.paid_manual', product: P, summary: `${inv.number} marked paid by hand (${ref}) — ${shop}, ₦${Number(inv.amount).toLocaleString()}`, targetType: 'invoice', targetId: input.invoiceId })
  await notify(`${P}.payment`, { title: `${shop} paid ₦${Number(inv.amount).toLocaleString()}`, body: `${inv.number} · by hand · ref ${ref}`, link: `/ops/${P}/shops/${inv.shop_id}`, product: P })
  await emailInvoice(input.invoiceId)
  return { ok: true }
}

export async function voidInvoice(invoiceId: string): Promise<Result> {
  const op = await assertCap(`${P}.finance.subscriptions`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('invoices').update({ status: 'void' }).eq('id', invoiceId).eq('status', 'unpaid').select('number, shop_id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Only an unpaid invoice can be voided' }
  await recordAction(op, { action: 'invoice.void', product: P, summary: `Voided ${data.number}`, targetType: 'invoice', targetId: invoiceId })
  return { ok: true }
}
