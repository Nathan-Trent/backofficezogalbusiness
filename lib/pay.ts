import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSecret } from '@/lib/secrets'
import { notify } from '@/lib/notify'
import { emailInvoice } from '@/app/actions/finance'

/**
 * Payments for a product's invoices: Paystack and Flutterwave (Nathan,
 * 2026-09-18). The owner's dashboard (a static SPA, no server) asks THIS
 * server to start a checkout, because the provider secret keys live here —
 * in product_secrets, never in the dashboard's bundle.
 *
 * Money truth is one function: apply_payment() in Postgres. It is
 * idempotent, so the webhook and the return-from-checkout confirm can both
 * call it and the subscription extends once.
 */
export type Provider = 'paystack' | 'flutterwave'
export const APP_URL = process.env.DOKA_APP_URL ?? 'https://doka.zogal.app'

export interface Invoice { id: string; number: string; product: string; shop_id: string; amount: number; currency: string; status: string; period_end: string }

/** The signed-in dashboard user, and the invoice as RLS lets THEM see it (has_permission shop.settings). */
export async function invoiceForUser(authHeader: string | null, invoiceId: string): Promise<{ invoice: Invoice; email: string } | { error: string; status: number }> {
  if (!authHeader?.startsWith('Bearer ')) return { error: 'Sign in first', status: 401 }
  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: u, error: uErr } = await asUser.auth.getUser()
  if (uErr || !u.user?.email) return { error: 'Sign in first', status: 401 }
  const { data, error } = await asUser.from('invoices').select('id, number, product, shop_id, amount, currency, status, period_end').eq('id', invoiceId).maybeSingle()
  if (error) return { error: error.message, status: 500 }
  if (!data) return { error: 'No such invoice, or it is not yours to pay', status: 404 }
  return { invoice: { ...(data as Invoice), amount: Number(data.amount) }, email: u.user.email }
}

// ---- Start a checkout ------------------------------------------------------

export async function startCheckout(provider: Provider, inv: Invoice, email: string): Promise<{ url: string; reference: string } | { error: string }> {
  if (inv.status !== 'unpaid') return { error: inv.status === 'paid' ? 'Already paid' : 'This invoice was voided' }
  const reference = `${inv.number}-${Date.now().toString(36)}`.replace(/[^A-Za-z0-9-]/g, '')
  const returnUrl = `${APP_URL}/subscription?invoice=${inv.id}&provider=${provider}&reference=${encodeURIComponent(reference)}`
  if (provider === 'paystack') {
    const key = await getSecret(inv.product, 'paystack_secret_key')
    if (!key) return { error: 'Paystack is not switched on for this product yet' }
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email, amount: Math.round(inv.amount * 100), currency: inv.currency, reference, callback_url: returnUrl, metadata: { invoice_id: inv.id, invoice_number: inv.number, product: inv.product } }),
    })
    const j = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: { authorization_url?: string } } | null
    if (!res.ok || !j?.status || !j.data?.authorization_url) return { error: j?.message ?? `Paystack refused (${res.status})` }
    return { url: j.data.authorization_url, reference }
  }
  const key = await getSecret(inv.product, 'flutterwave_secret_key')
  if (!key) return { error: 'Flutterwave is not switched on for this product yet' }
  const res = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tx_ref: reference, amount: inv.amount, currency: inv.currency, redirect_url: returnUrl, customer: { email }, meta: { invoice_id: inv.id, invoice_number: inv.number, product: inv.product }, customizations: { title: 'Doka by Zogal', description: `Invoice ${inv.number}` } }),
  })
  const j = (await res.json().catch(() => null)) as { status?: string; message?: string; data?: { link?: string } } | null
  if (!res.ok || j?.status !== 'success' || !j.data?.link) return { error: j?.message ?? `Flutterwave refused (${res.status})` }
  return { url: j.data.link, reference }
}

// ---- Verify with the provider (never trust the browser's word) ---------------

type Verified = { ok: true; reference: string; amount: number; currency: string; invoiceId: string | null } | { ok: false; error: string }

export async function verifyPaystack(product: string, reference: string): Promise<Verified> {
  const key = await getSecret(product, 'paystack_secret_key')
  if (!key) return { ok: false, error: 'Paystack key missing' }
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { authorization: `Bearer ${key}` } })
  const j = (await res.json().catch(() => null)) as { status?: boolean; data?: { status?: string; reference?: string; amount?: number; currency?: string; metadata?: { invoice_id?: string } } } | null
  if (!res.ok || !j?.status || !j.data) return { ok: false, error: 'Paystack could not verify' }
  if (j.data.status !== 'success') return { ok: false, error: `Payment ${j.data.status}` }
  return { ok: true, reference: j.data.reference ?? reference, amount: (j.data.amount ?? 0) / 100, currency: j.data.currency ?? 'NGN', invoiceId: j.data.metadata?.invoice_id ?? null }
}

export async function verifyFlutterwave(product: string, txRef: string, txId?: string | number): Promise<Verified> {
  const key = await getSecret(product, 'flutterwave_secret_key')
  if (!key) return { ok: false, error: 'Flutterwave key missing' }
  const url = txId ? `https://api.flutterwave.com/v3/transactions/${txId}/verify` : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${key}` } })
  const j = (await res.json().catch(() => null)) as { status?: string; data?: { status?: string; tx_ref?: string; amount?: number; currency?: string; meta?: { invoice_id?: string } } } | null
  if (!res.ok || j?.status !== 'success' || !j.data) return { ok: false, error: 'Flutterwave could not verify' }
  if (j.data.status !== 'successful') return { ok: false, error: `Payment ${j.data.status}` }
  return { ok: true, reference: j.data.tx_ref ?? txRef, amount: j.data.amount ?? 0, currency: j.data.currency ?? 'NGN', invoiceId: j.data.meta?.invoice_id ?? null }
}

/** Paystack signs the raw body with HMAC-SHA512 of the secret key. */
export function paystackSignatureOk(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex')
  return expected.length === signature.length && timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// ---- Settle: the one door to "this invoice is paid" -------------------------

/**
 * Applies a verified payment. Checks the amount against the invoice (a
 * short payment is refused and flagged), then apply_payment() extends the
 * subscription, the owner gets a receipt, staff who asked are told.
 */
export async function settle(invoiceId: string, provider: Provider, v: Extract<Verified, { ok: true }>): Promise<{ ok: true; alreadyPaid: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: inv, error } = await admin.from('invoices').select('id, number, shop_id, amount, currency, status, shops(name)').eq('id', invoiceId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!inv) return { ok: false, error: 'No such invoice' }
  if (inv.status === 'paid') return { ok: true, alreadyPaid: true }
  if (v.currency !== inv.currency || v.amount + 0.005 < Number(inv.amount)) {
    await notify('doka.payment', { title: `Short or wrong-currency payment on ${inv.number}`, body: `Paid ${v.currency} ${v.amount} via ${provider} (${v.reference}); invoice is ${inv.currency} ${Number(inv.amount)}. Not applied.`, link: `/ops/doka/finance?status=unpaid`, product: 'doka' })
    return { ok: false, error: 'The amount paid does not match the invoice. Zogal has been told and will sort it out.' }
  }
  const { error: aErr } = await admin.rpc('apply_payment', { p_invoice_id: invoiceId, p_provider: provider, p_provider_ref: v.reference })
  if (aErr) return { ok: false, error: aErr.message }
  const shop = (inv.shops as unknown as { name: string } | null)?.name ?? inv.shop_id
  // No audit row: the log needs a staff actor. The invoice row (provider, ref, paid_at) and the payment notice are the record.
  await notify('doka.payment', { title: `${shop} paid ₦${Number(inv.amount).toLocaleString()}`, body: `${inv.number} · ${provider} · ${v.reference}`, link: `/ops/doka/shops/${inv.shop_id}`, product: 'doka' })
  await emailInvoice(invoiceId)
  return { ok: true, alreadyPaid: false }
}

/** CORS for the dashboard origin only. */
export function cors(origin: string | null): HeadersInit {
  const allowed = new Set([APP_URL, 'http://localhost:5173', 'http://localhost:1420'])
  const o = origin && allowed.has(origin) ? origin : APP_URL
  return { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
}
