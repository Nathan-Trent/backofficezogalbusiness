import { NextResponse } from 'next/server'
import { cors, invoiceForUser, settle, verifyFlutterwave, verifyPaystack, type Provider } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * POST { invoice_id, provider, reference, transaction_id? } when the payer
 * lands back on the dashboard. Verifies with the provider and settles, so
 * the owner sees "paid" at once instead of waiting for the webhook. The
 * webhook still runs and is a no-op thanks to apply_payment's idempotence.
 */
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) }) }

export async function POST(req: Request) {
  const headers = cors(req.headers.get('origin'))
  const body = (await req.json().catch(() => null)) as { invoice_id?: string; provider?: Provider; reference?: string; transaction_id?: string } | null
  if (!body?.invoice_id || !body.reference || (body.provider !== 'paystack' && body.provider !== 'flutterwave')) return NextResponse.json({ error: 'invoice_id, provider and reference are needed' }, { status: 400, headers })
  const r = await invoiceForUser(req.headers.get('authorization'), body.invoice_id)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status, headers })
  if (r.invoice.status === 'paid') return NextResponse.json({ ok: true, status: 'paid' }, { headers })
  const v = body.provider === 'paystack' ? await verifyPaystack(r.invoice.product, body.reference) : await verifyFlutterwave(r.invoice.product, body.reference, body.transaction_id)
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 402, headers })
  if (v.invoiceId && v.invoiceId !== r.invoice.id) return NextResponse.json({ ok: false, error: 'That payment is for a different invoice' }, { status: 400, headers })
  const s = await settle(r.invoice.id, body.provider, v)
  if (!s.ok) return NextResponse.json({ ok: false, error: s.error }, { status: 400, headers })
  return NextResponse.json({ ok: true, status: 'paid' }, { headers })
}
