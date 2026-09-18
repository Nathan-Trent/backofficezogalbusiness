'use server'

import { revalidatePath } from 'next/cache'
import { getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'
import { ALL_CAPABILITIES } from '@/lib/auth/capabilities'
import { sendMail } from '@/lib/mail'

type Result = { ok: true } | { ok: false; error: string }

/**
 * Invite: Root enters an email and switches. A staff row is created, and a
 * Supabase auth invite goes to the address (they set a password and land
 * signed in). staff_link() joins the two on their first sign-in.
 */
export async function inviteStaff(input: { email: string; name: string; capabilities: string[] }): Promise<Result> {
  const op = await getOperator()
  if (!op.isRoot) return { ok: false, error: 'Root only' }
  const email = input.email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'That is not an email address' }
  const caps = input.capabilities.filter((c) => ALL_CAPABILITIES.includes(c))
  const admin = createAdminClient()

  const { error: sErr } = await admin.from('staff').upsert({ email, name: input.name.trim() || null, role: 'staff', capabilities: caps, invited_by: op.userId, deactivated_at: null }, { onConflict: 'email' })
  if (sErr) return { ok: false, error: sErr.message }

  // Supabase sends the invite email with a set-password link; if the address
  // already has an account, they just sign in and are linked by email.
  const { error: iErr } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: input.name.trim() }, redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/login` })
  if (iErr && !/already/i.test(iErr.message)) return { ok: false, error: `Staff row saved, but the invite email failed: ${iErr.message}` }
  if (iErr) {
    await sendMail({ to: email, subject: 'You have access to the Zogal Business back office', text: `${op.name ?? 'Zogal'} added you to the Zogal Business back office. Sign in with your existing Zogal account at ${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/login.`, identity: 'business' })
  }

  await recordAction(op, { action: 'staff.invite', summary: `Invited ${email} with ${caps.length} switch${caps.length === 1 ? '' : 'es'}`, targetType: 'staff', targetId: email, detail: { capabilities: caps } })
  await notify('company.staff', { title: `Staff: ${email} invited`, body: `By ${op.name ?? op.email}. ${caps.length} switches.`, link: '/ops/staff' })
  revalidatePath('/ops/staff')
  return { ok: true }
}

export async function setStaffCapabilities(staffId: string, capabilities: string[]): Promise<Result> {
  const op = await getOperator()
  if (!op.isRoot) return { ok: false, error: 'Root only' }
  const caps = capabilities.filter((c) => ALL_CAPABILITIES.includes(c))
  const admin = createAdminClient()
  const { data: row, error: rErr } = await admin.from('staff').select('email, role').eq('id', staffId).maybeSingle()
  if (rErr) return { ok: false, error: rErr.message }
  if (!row) return { ok: false, error: 'No such staff' }
  if (row.role === 'root') return { ok: false, error: 'Root holds everything; nothing to set' }
  const { error } = await admin.from('staff').update({ capabilities: caps }).eq('id', staffId)
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'staff.capabilities', summary: `Set ${caps.length} switches for ${row.email}`, targetType: 'staff', targetId: staffId, detail: { capabilities: caps } })
  revalidatePath('/ops/staff')
  return { ok: true }
}

export async function setStaffActive(staffId: string, active: boolean): Promise<Result> {
  const op = await getOperator()
  if (!op.isRoot) return { ok: false, error: 'Root only' }
  if (staffId === op.staffId) return { ok: false, error: 'You cannot deactivate yourself' }
  const admin = createAdminClient()
  const { data: row, error: rErr } = await admin.from('staff').select('email').eq('id', staffId).maybeSingle()
  if (rErr) return { ok: false, error: rErr.message }
  const { error } = await admin.from('staff').update({ deactivated_at: active ? null : new Date().toISOString() }).eq('id', staffId)
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: active ? 'staff.reactivate' : 'staff.deactivate', summary: `${active ? 'Reactivated' : 'Deactivated'} ${row?.email ?? staffId}`, targetType: 'staff', targetId: staffId })
  await notify('company.staff', { title: `Staff: ${row?.email ?? staffId} ${active ? 'reactivated' : 'deactivated'}`, body: `By ${op.name ?? op.email}.`, link: '/ops/staff' })
  revalidatePath('/ops/staff')
  return { ok: true }
}
