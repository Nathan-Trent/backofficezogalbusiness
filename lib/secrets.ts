import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Third-party keys live in product_secrets (0017), set from the back office
 * per product ('' = company-wide). Nathan, 2026-09-19: "Paystack, Flutterwave
 * and even the Anthropic key — settable from the back office and per product."
 *
 * Read order: the table first, then the environment as a fallback so nothing
 * that worked before 0017 stops working. Values never reach a client
 * component: this module is server-only by construction (admin client).
 */
const ENV_FALLBACK: Record<string, string | undefined> = {
  'resend_api_key': process.env.RESEND_API_KEY,
}

export async function getSecret(product: string, key: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('product_secrets').select('value').eq('product', product).eq('key', key).maybeSingle()
  if (error) console.error('secret read failed:', product, key, error.message)
  const v = (data?.value as string | undefined) ?? ''
  if (v) return v
  // Company-wide key as a fallback for a product asking for it (e.g. a product without its own Resend).
  if (product) {
    const { data: c, error: cErr } = await createAdminClient().from('product_secrets').select('value').eq('product', '').eq('key', key).maybeSingle()
    if (cErr) console.error('secret read failed:', key, cErr.message)
    if (c?.value) return c.value as string
  }
  return ENV_FALLBACK[key] || null
}

/** What the back office lists: name, description, set-or-not. Never the value. */
export async function listSecrets(product: string): Promise<{ key: string; description: string | null; isSet: boolean; updated_at: string; fromEnv: boolean }[]> {
  const { data, error } = await createAdminClient().from('product_secrets').select('key, description, value, updated_at').eq('product', product).order('key')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ key: r.key as string, description: r.description as string | null, isSet: !!(r.value as string), updated_at: r.updated_at as string, fromEnv: !(r.value as string) && !!ENV_FALLBACK[r.key as string] }))
}
