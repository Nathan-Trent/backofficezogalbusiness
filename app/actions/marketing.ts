'use server'

import { assertCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { enqueue } from '@/lib/jobs'
import { PAGES } from '@/lib/content-schema'

type Result = { ok: true; data?: unknown } | { ok: false; error: string }

const capsFor = (page: string) => (page === 'home' ? { edit: 'marketing.edit', publish: 'marketing.publish' } : { edit: `marketing.${page}.edit`, publish: `marketing.${page}.publish` })
const pathFor = (page: string) => (page === 'home' ? '/' : `/${page}`)

/** Save one field to the draft. The site does not change. */
export async function saveContentDraft(input: { page: string; key: string; value: unknown }): Promise<Result> {
  const schema = PAGES.find((p) => p.page === input.page)
  const field = schema?.sections.flatMap((s) => s.fields).find((f) => f.key === input.key)
  if (!schema || !field) return { ok: false, error: 'No such field' }
  const op = await assertCap(capsFor(input.page).edit).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  // Shape check against the schema so the site never gets something it cannot render.
  const v = input.value
  const okShape = field.kind === 'text' || field.kind === 'long' ? typeof v === 'string'
    : field.kind === 'list' ? Array.isArray(v) && v.every((x) => typeof x === 'string')
    : field.kind === 'pairs' ? Array.isArray(v) && v.every((x) => Array.isArray(x) && x.length === 2 && x.every((y) => typeof y === 'string'))
    : Array.isArray(v) && v.every((x) => Array.isArray(x) && x.length === 3 && x.every((y) => typeof y === 'string'))
  if (!okShape) return { ok: false, error: 'That is not the right shape for this field' }
  if (field.kind === 'text' && (v as string).length > 300) return { ok: false, error: 'Keep this line under 300 characters' }
  const { error } = await createAdminClient().from('site_content_draft').upsert({ page: input.page, key: input.key, value: v, updated_by: op.userId, updated_at: new Date().toISOString() })
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'site.draft', summary: `Drafted ${input.page} · ${field.label}`, targetType: 'site_content', targetId: `${input.page}/${input.key}` })
  return { ok: true }
}

/** Put the draft back to what is live for one page. */
export async function discardContentDraft(page: string): Promise<Result> {
  const op = await assertCap(capsFor(page).edit).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { error: dErr } = await admin.from('site_content_draft').delete().eq('page', page)
  if (dErr) return { ok: false, error: dErr.message }
  const { data: live, error: lErr } = await admin.from('site_content').select('*').eq('page', page)
  if (lErr) return { ok: false, error: lErr.message }
  if (live?.length) { const { error } = await admin.from('site_content_draft').insert(live); if (error) return { ok: false, error: error.message } }
  await recordAction(op, { action: 'site.draft_discard', summary: `Discarded ${page} draft` })
  return { ok: true }
}

/** Draft → live for one page, versioned; the site is told to re-render now. */
export async function publishContent(input: { page: string; note: string }): Promise<Result> {
  const op = await assertCap(capsFor(input.page).publish).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data: version, error } = await admin.rpc('publish_site', { p_page: input.page, p_note: input.note.trim() || null })
  if (error) return { ok: false, error: error.message }
  await admin.from('site_publish').update({ published_by: op.userId }).eq('page', input.page).eq('version', version as number)
  await recordAction(op, { action: 'site.publish', summary: `Published ${input.page} page, version ${version}${input.note ? ` — ${input.note.trim()}` : ''}` })
  await notify('marketing.published', { title: `Site published: ${input.page} (v${version})`, body: input.note.trim() || `by ${op.name ?? op.email}`, link: input.page === 'home' ? '/ops/marketing' : `/ops/marketing/${input.page}` })
  await enqueue('revalidate_site', { path: pathFor(input.page) }, { createdBy: op.userId, maxAttempts: 3 })
  return { ok: true, data: { version } }
}

// ---- Inbox --------------------------------------------------------------------

/** Reply by email (wearing the product's identity when the message came from a product page), mark answered. */
export async function replyContact(input: { id: string; reply: string }): Promise<Result> {
  const op = await assertCap('marketing.inbox').catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const reply = input.reply.trim()
  if (reply.length < 2) return { ok: false, error: 'Write the reply first' }
  const admin = createAdminClient()
  const { data: m, error } = await admin.from('contact_messages').select('id, name, email, message, product, status').eq('id', input.id).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!m) return { ok: false, error: 'No such message' }
  const identity = (m.product as string | null) ?? 'business'
  await enqueue('send_email', { to: m.email, identity, subject: `Re: your message to ${identity === 'business' ? 'Zogal Business' : 'Doka'}`, text: `${reply}\n\n— ${op.name ?? 'Zogal'}\n\n----\nYou wrote:\n${m.message}` }, { product: m.product as string | null, createdBy: op.userId })
  const { error: uErr } = await admin.from('contact_messages').update({ status: 'answered', reply, answered_by: op.userId, answered_at: new Date().toISOString() }).eq('id', m.id)
  if (uErr) return { ok: false, error: uErr.message }
  await recordAction(op, { action: 'contact.reply', summary: `Replied to ${m.name} (${m.email})`, targetType: 'contact_message', targetId: m.id as string })
  await notify('marketing.answered', { title: `${op.name ?? op.email} answered ${m.name}`, body: reply.slice(0, 140), link: '/ops/marketing/inbox' })
  return { ok: true }
}

export async function setContactStatus(input: { id: string; status: 'new' | 'archived' }): Promise<Result> {
  const op = await assertCap('marketing.inbox').catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const { error } = await createAdminClient().from('contact_messages').update({ status: input.status }).eq('id', input.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
