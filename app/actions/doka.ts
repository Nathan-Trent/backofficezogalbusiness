'use server'

import { assertCap, getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'

type Result = { ok: true; data?: unknown } | { ok: false; error: string }
const P = 'doka'

// ---- Messages ------------------------------------------------------------

/**
 * Message a user or a shop, on behalf of Doka. Email and/or in-app (a notice
 * they see next time they open the dashboard or the shop app). Logged.
 */
export async function sendMessage(input: { toUserId?: string; toShopId?: string; channels: ('email' | 'in_app')[]; subject: string; body: string }): Promise<Result> {
  const op = await assertCap(`${P}.users.message`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const subject = input.subject.trim(), body = input.body.trim()
  if (!subject || !body) return { ok: false, error: 'Subject and message are needed' }
  if (!input.channels.length) return { ok: false, error: 'Choose email, in-app, or both' }

  // Recipients: one user, or every active member of a shop.
  let users: { id: string; email: string; full_name: string }[] = []
  if (input.toUserId) {
    const { data, error } = await admin.from('users').select('id, email, full_name').eq('id', input.toUserId).maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (data) users = [data as typeof users[number]]
  } else if (input.toShopId) {
    const { data, error } = await admin.from('shop_members').select('users(id, email, full_name)').eq('shop_id', input.toShopId).eq('is_active', true)
    if (error) return { ok: false, error: error.message }
    users = (data ?? []).map((r) => (r as unknown as { users: typeof users[number] }).users).filter(Boolean)
  }
  if (users.length === 0) return { ok: false, error: 'Nobody to send to' }

  const { data: msg, error: mErr } = await admin.from('messages').insert({
    product: P, sent_by: op.userId, to_user_id: input.toUserId ?? null, to_shop_id: input.toShopId ?? null, channels: input.channels, subject, body, status: 'queued',
  }).select('id').single()
  if (mErr) return { ok: false, error: mErr.message }

  // In-app notices land now; emails go out as background jobs (retried, never block the screen).
  let failed: string | null = null
  const { enqueue } = await import('@/lib/jobs')
  for (const u of users) {
    if (input.channels.includes('in_app')) {
      const { error } = await admin.from('user_notices').insert({ user_id: u.id, product: P, message_id: msg.id, title: subject, body })
      if (error) failed = error.message
    }
    if (input.channels.includes('email')) await enqueue('send_email', { to: u.email, subject, text: body, identity: P, message_id: msg.id }, { product: P, createdBy: op.userId })
  }
  if (!input.channels.includes('email')) await admin.from('messages').update({ status: failed ? 'failed' : 'sent', error: failed, sent_at: new Date().toISOString() }).eq('id', msg.id)
  await recordAction(op, { action: failed ? 'message.failed' : 'message.sent', product: P, summary: `Messaged ${users.length === 1 ? users[0].email : `${users.length} people at a shop`}: "${subject}"${failed ? ` — ${failed}` : ''}`, targetType: input.toUserId ? 'user' : 'shop', targetId: input.toUserId ?? input.toShopId })
  return failed ? { ok: false, error: `Sent with problems: ${failed}` } : { ok: true }
}

// ---- Sign in as ----------------------------------------------------------

/**
 * Sign in as a Doka user. Root-granted capability. Reason required, 30 min,
 * logged and notified. The app checks current_impersonation() for the red
 * bar and blocks money actions. The session is minted server-side from a
 * magic link — nobody learns the user's password.
 */
export async function impersonate(input: { userId: string; reason: string }): Promise<Result> {
  const op = await assertCap(`${P}.users.impersonate`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const reason = input.reason.trim()
  if (reason.length < 5) return { ok: false, error: 'Say why, in a few words' }
  const admin = createAdminClient()
  const { data: u, error: uErr } = await admin.from('users').select('id, email, full_name, auth_user_id').eq('id', input.userId).maybeSingle()
  if (uErr) return { ok: false, error: uErr.message }
  if (!u) return { ok: false, error: 'No such user' }

  const { error: iErr } = await admin.from('impersonations').insert({ staff_id: op.staffId, user_id: u.id, product: P, reason })
  if (iErr) return { ok: false, error: iErr.message }

  const appUrl = process.env.DOKA_APP_URL ?? 'https://doka.zogal.app'
  const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.email, options: { redirectTo: appUrl } })
  if (lErr) return { ok: false, error: lErr.message }

  await recordAction(op, { action: 'user.impersonate', product: P, summary: `Signed in as ${u.full_name} (${u.email}) — ${reason}`, targetType: 'user', targetId: u.id })
  await notify(`${P}.impersonation`, { title: `${op.name ?? op.email} signed in as ${u.full_name}`, body: reason, link: `/ops/${P}/users/${u.id}`, product: P })
  return { ok: true, data: { url: link.properties.action_link } }
}

// ---- Terminals -----------------------------------------------------------

export async function revokeTerminal(deviceId: string): Promise<Result> {
  const op = await assertCap(`${P}.terminals.manage`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('devices').update({ revoked_at: new Date().toISOString() }).eq('id', deviceId).select('name, shop_id').single()
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'terminal.revoke', product: P, summary: `Revoked terminal "${data.name}"`, targetType: 'device', targetId: deviceId })
  return { ok: true }
}

// ---- Subscriptions (until Finance slice: set by hand) ----------------------

export async function setSubscription(input: { shopId: string; status: 'active' | 'past_due' | 'cancelled'; plan: string; expiresAt: string | null }): Promise<Result> {
  const op = await assertCap(`${P}.finance.subscriptions`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { error } = await admin.from('subscriptions').upsert({ shop_id: input.shopId, status: input.status, plan: input.plan || 'standard', expires_at: input.expiresAt })
  if (error) return { ok: false, error: error.message }
  const { data: shop, error: nErr } = await admin.from('shops').select('name').eq('id', input.shopId).maybeSingle()
  if (nErr) console.error(nErr.message)
  await recordAction(op, { action: 'subscription.set', product: P, summary: `${shop?.name ?? input.shopId}: ${input.status}, ${input.plan}, ${input.expiresAt ? `expires ${input.expiresAt.slice(0, 10)}` : 'no expiry'}`, targetType: 'shop', targetId: input.shopId })
  await notify(`${P}.subscription`, { title: `${shop?.name ?? 'A shop'}: subscription ${input.status}`, body: `${input.plan} · ${input.expiresAt ? `expires ${input.expiresAt.slice(0, 10)}` : 'no expiry'} · by ${op.name ?? op.email}`, link: `/ops/${P}/shops/${input.shopId}`, product: P })
  return { ok: true }
}

export async function setShopActive(shopId: string, active: boolean): Promise<Result> {
  const op = await assertCap(`${P}.shops.manage`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('shops').update({ is_active: active }).eq('id', shopId).select('name').single()
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: active ? 'shop.activate' : 'shop.deactivate', product: P, summary: `${active ? 'Reactivated' : 'Deactivated'} shop "${data.name}"`, targetType: 'shop', targetId: shopId })
  return { ok: true }
}

// ---- Settings (platform + operational) -------------------------------------

export async function setPlatformSetting(key: string, value: unknown): Promise<Result> {
  const op = await assertCap(`${P}.settings.manage`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { error } = await admin.from('platform_settings').update({ value, updated_by: op.userId }).eq('key', key)
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'platform_setting.set', product: P, summary: `Platform setting ${key} → ${JSON.stringify(value)}`, targetType: 'platform_setting', targetId: key })
  return { ok: true }
}

export async function patchOperationalSettings(patch: Record<string, number>): Promise<Result> {
  const op = await assertCap(`${P}.settings.manage`).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data: cur, error: rErr } = await admin.from('operational_settings').select('settings').eq('id', 1).single()
  if (rErr) return { ok: false, error: rErr.message }
  const { error } = await admin.from('operational_settings').update({ settings: { ...(cur.settings as object), ...patch }, updated_by: op.userId }).eq('id', 1)
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'operational_settings.set', product: P, summary: `Operational settings: ${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`, detail: patch })
  return { ok: true }
}

/** The map asks for this when it sees sign-ins without a place. Queues one lookup job; never blocks. */
export async function geolocatePending(): Promise<void> {
  const op = await getOperator()
  if (!op.isStaff) return
  const { enqueue } = await import('@/lib/jobs')
  await enqueue('geolocate', {}, { product: P, createdBy: op.userId, maxAttempts: 2 })
}
