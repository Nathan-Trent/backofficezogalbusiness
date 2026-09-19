import { NextResponse } from 'next/server'
import { activeProvider, cors, selfServiceInvoice, startCheckout } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * POST { shop_id, plan_key } with the dashboard user's JWT. Self-service
 * plan change: raises a one-month invoice for the chosen plan under the
 * caller's own shop (has_permission shop.settings, checked as them — not
 * staff), then starts a checkout for it straight away. Paying it is what
 * actually changes the subscription (apply_payment), same as any invoice.
 */
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) }) }

export async function POST(req: Request) {
  const headers = cors(req.headers.get('origin'))
  const body = (await req.json().catch(() => null)) as { shop_id?: string; plan_key?: string } | null
  if (!body?.shop_id || !body.plan_key) return NextResponse.json({ error: 'shop_id and plan_key are needed' }, { status: 400, headers })
  const r = await selfServiceInvoice(req.headers.get('authorization'), body.shop_id, body.plan_key)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status, headers })
  const provider = await activeProvider()
  if (!provider) return NextResponse.json({ error: 'Online payment is not switched on yet. Write to hello@getzogal.com and we will sort it out.' }, { status: 409, headers })
  const c = await startCheckout(provider, r.invoice, r.email)
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400, headers })
  return NextResponse.json({ url: c.url, reference: c.reference, provider, invoice_number: r.invoice.number }, { headers })
}
