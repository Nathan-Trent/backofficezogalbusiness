import { NextResponse } from 'next/server'
import { cors, invoiceForUser, startCheckout, type Provider } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * POST { invoice_id, provider } with the dashboard user's JWT.
 * Returns { url } to send the payer to. The invoice is read AS THE USER
 * (RLS), so only someone with shop.settings on that shop can start it.
 */
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) }) }

export async function POST(req: Request) {
  const headers = cors(req.headers.get('origin'))
  const body = (await req.json().catch(() => null)) as { invoice_id?: string; provider?: Provider } | null
  if (!body?.invoice_id || (body.provider !== 'paystack' && body.provider !== 'flutterwave')) return NextResponse.json({ error: 'invoice_id and provider are needed' }, { status: 400, headers })
  const r = await invoiceForUser(req.headers.get('authorization'), body.invoice_id)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status, headers })
  const c = await startCheckout(body.provider, r.invoice, r.email)
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400, headers })
  return NextResponse.json({ url: c.url, reference: c.reference }, { headers })
}
