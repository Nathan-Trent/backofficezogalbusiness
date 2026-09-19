'use server'

import { revalidatePath } from 'next/cache'
import { assertCap, getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'

type Result = { ok: true } | { ok: false; error: string }

/**
 * Set or clear one key. Write-only: the value is never returned, and the
 * audit line says WHICH key changed, never what it became. Company-wide
 * keys ('' product) are Root's; product keys need <product>.settings.manage.
 */
async function allowed(product: string) {
  if (product === '') { const op = await getOperator(); return op.isRoot ? op : null }
  return assertCap(`${product}.settings.manage`).catch(() => null)
}

export async function setSecret(input: { product: string; key: string; value: string }): Promise<Result> {
  const op = await allowed(input.product)
  if (!op) return { ok: false, error: 'Not allowed' }
  const value = input.value.trim()
  if (!value) return { ok: false, error: 'Paste the key first' }
  if (/\s/.test(value)) return { ok: false, error: 'A key has no spaces — check the paste' }
  const admin = createAdminClient()
  const { error } = await admin.from('product_secrets').update({ value, updated_by: op.userId, updated_at: new Date().toISOString() }).eq('product', input.product).eq('key', input.key)
  if (error) return { ok: false, error: error.message }
  const where = input.product || 'company'
  await recordAction(op, { action: 'secret.set', product: input.product || null, summary: `Set key ${input.key} (${where}) — ends …${value.slice(-4)}`, targetType: 'secret', targetId: `${where}/${input.key}` })
  await notify(input.product ? `${input.product}.settings` : 'company.settings', { title: `Key ${input.key} changed`, body: `${where} · by ${op.name ?? op.email}`, link: input.product ? `/ops/${input.product}/settings` : '/ops/keys', product: input.product || null })
  revalidatePath(input.product ? `/ops/${input.product}/settings` : '/ops/keys')
  return { ok: true }
}

export async function clearSecret(input: { product: string; key: string }): Promise<Result> {
  const op = await allowed(input.product)
  if (!op) return { ok: false, error: 'Not allowed' }
  const { error } = await createAdminClient().from('product_secrets').update({ value: '', updated_by: op.userId, updated_at: new Date().toISOString() }).eq('product', input.product).eq('key', input.key)
  if (error) return { ok: false, error: error.message }
  const where = input.product || 'company'
  await recordAction(op, { action: 'secret.clear', product: input.product || null, summary: `Cleared key ${input.key} (${where})`, targetType: 'secret', targetId: `${where}/${input.key}` })
  revalidatePath(input.product ? `/ops/${input.product}/settings` : '/ops/keys')
  return { ok: true }
}
