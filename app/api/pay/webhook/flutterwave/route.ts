import { NextResponse } from 'next/server'
import { getSecret } from '@/lib/secrets'
import { settle, verifyFlutterwave } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * Flutterwave webhook. Set in the Flutterwave dashboard to
 * https://ops.business.zogal.app/api/pay/webhook/flutterwave with the
 * secret hash that is stored as flutterwave_secret_hash. The verif-hash
 * header must match; then the transaction is re-verified with Flutterwave.
 */
export async function POST(req: Request) {
  const hash = await getSecret('doka', 'flutterwave_secret_hash')
  if (!hash) return NextResponse.json({ error: 'not configured' }, { status: 503 })
  if (req.headers.get('verif-hash') !== hash) return NextResponse.json({ error: 'bad hash' }, { status: 401 })
  const ev = (await req.json().catch(() => null)) as { event?: string; data?: { id?: number; tx_ref?: string; status?: string; meta?: { invoice_id?: string } } } | null
  if (!ev?.data?.tx_ref || ev.data.status !== 'successful') return NextResponse.json({ ok: true, ignored: ev?.event })
  const v = await verifyFlutterwave('doka', ev.data.tx_ref, ev.data.id)
  if (!v.ok) { console.error('flutterwave webhook verify:', v.error); return NextResponse.json({ ok: false }) }
  const invoiceId = v.invoiceId ?? ev.data.meta?.invoice_id
  if (!invoiceId) return NextResponse.json({ ok: true, ignored: 'no invoice' })
  const s = await settle(invoiceId, 'flutterwave', v)
  if (!s.ok) console.error('flutterwave settle:', s.error)
  return NextResponse.json({ ok: s.ok })
}
