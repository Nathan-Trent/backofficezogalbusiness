import { NextResponse } from 'next/server'
import { activeProvider, cors, invoiceForUser, startCheckout } from '@/lib/pay'

export const dynamic = 'force-dynamic'

/**
 * POST { invoice_id } with the dashboard user's JWT. The provider is the
 * one switched on in the back office — the payer never chooses. Returns
 * { url } to send them to. The invoice is read AS THE USER (RLS), so only
 * someone with shop.settings on that shop can start it.
 */
export async function OPTIONS(req: Request) { return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) }) }

export async function POST(req: Request) {
  const headers = cors(req.headers.get('origin'))
  const body = (await req.json().catch(() => null)) as { invoice_id?: string } | null
  if (!body?.invoice_id) return NextResponse.json({ error: 'invoice_id is needed' }, { status: 400, headers })
  const r = await invoiceForUser(req.headers.get('authorization'), body.invoice_id)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status, headers })
  const provider = await activeProvider()
  if (!provider) return NextResponse.json({ error: 'Online payment is not switched on yet. Write to hello@getzogal.com and we will sort it out.' }, { status: 409, headers })
  const c = await startCheckout(provider, r.invoice, r.email)
  if ('error' in c) return NextResponse.json({ error: c.error }, { status: 400, headers })
  return NextResponse.json({ url: c.url, reference: c.reference, provider }, { headers })
}
