import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'
import { paystackSignatureOk, settle, verifyPaystack } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * Paystack webhook. Set in the Paystack dashboard to
 * https://ops.business.zogal.app/api/pay/webhook/paystack
 * Signature checked against the product's secret key; then the transaction
 * is re-verified with Paystack before anything is applied. Always 200 once
 * understood, so Paystack stops retrying.
 */
export async function POST(req: Request) {
  const raw = await req.text()
  const secret = await getSecret('doka', 'paystack_secret_key')
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 })
  if (!paystackSignatureOk(raw, req.headers.get('x-paystack-signature'), secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  const ev = JSON.parse(raw) as { event?: string; data?: { reference?: string; metadata?: { invoice_id?: string } } }
  if (ev.event !== 'charge.success' || !ev.data?.reference) return NextResponse.json({ ok: true, ignored: ev.event })
  const v = await verifyPaystack('doka', ev.data.reference)
  if (!v.ok) { console.error('paystack webhook verify:', v.error); return NextResponse.json({ ok: false }) }
  const invoiceId = v.invoiceId ?? ev.data.metadata?.invoice_id
  if (!invoiceId) return NextResponse.json({ ok: true, ignored: 'no invoice' })
  const s = await settle(invoiceId, 'paystack', v)
  if (!s.ok) console.error('paystack settle:', s.error)
  return NextResponse.json({ ok: s.ok })
}
