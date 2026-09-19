import { Resend } from 'resend'

/**
 * Every email leaves from the same Zogal address, but the BODY wears the
 * identity of who is speaking: Zogal Business (ink + amber) or a product
 * (its own name and colour). Nathan, 2026-09-18.
 */
export interface Identity { name: string; colour: string; sub: string }

const BUSINESS: Identity = { name: 'Zogal Business', colour: '#E3B341', sub: 'A Zogal company' }

export async function identityFor(product: string | 'business'): Promise<Identity> {
  if (product === 'business') return BUSINESS
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient().from('products').select('name, colour').eq('key', product).maybeSingle()
  if (error || !data) return BUSINESS
  return { name: data.name as string, colour: data.colour as string, sub: 'by Zogal' }
}

export function renderEmail(id: Identity, subject: string, text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const paras = esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#14181C">${p.replace(/\n/g, '<br/>')}</p>`).join('')
  return `<!doctype html><html><body style="margin:0;background:#FBF8F1;font-family:Manrope,Inter,system-ui,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="background:#0E1B2B;border-radius:16px 16px 0 0;padding:22px 26px;color:#fff">
    <div style="font-size:20px;font-weight:800;letter-spacing:-0.02em">${esc(id.name)} <span style="font-weight:600;color:rgba(255,255,255,.55);font-size:13px">${esc(id.sub)}</span></div>
  </div>
  <div style="background:#fff;border:1px solid rgba(14,27,43,.1);border-top:4px solid ${id.colour};border-radius:0 0 16px 16px;padding:26px">
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#0E1B2B">${esc(subject)}</h1>
    ${paras}
  </div>
  <p style="margin:18px 0 0;font-size:12px;color:#6B6760">Sent by Zogal on behalf of ${esc(id.name)}. hello@getzogal.com</p>
</div></body></html>`
}

export async function sendMail(input: { to: string; subject: string; text: string; identity: string | 'business' }): Promise<{ ok: boolean; error?: string }> {
  // Key from product_secrets (product's own, else company-wide), env as fallback.
  const { getSecret } = await import('@/lib/secrets')
  const key = await getSecret(input.identity === 'business' ? '' : input.identity, 'resend_api_key')
  const from = process.env.MAIL_FROM ?? 'Zogal <hello@getzogal.com>'
  if (!key) return { ok: false, error: 'Resend key not set — Zogal Business → Keys' }
  try {
    const id = await identityFor(input.identity)
    const resend = new Resend(key)
    const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, html: renderEmail(id, input.subject, input.text), text: input.text })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}
