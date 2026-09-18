'use server'

import { revalidatePath } from 'next/cache'
import { getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'

export async function markBellRead(): Promise<void> {
  const op = await getOperator()
  if (!op.isStaff) return
  const { error } = await createAdminClient().from('ops_notifications').update({ read_at: new Date().toISOString() }).eq('staff_id', op.staffId!).is('read_at', null)
  if (error) console.error('bell read failed:', error.message)
}

/** Root sets who is told: one row per (staff, event). */
export async function setNotify(staffId: string, event: string, channel: 'email' | 'bell', on: boolean): Promise<{ ok: boolean; error?: string }> {
  const op = await getOperator()
  if (!op.isRoot) return { ok: false, error: 'Root only' }
  const admin = createAdminClient()
  const { data: existing, error: rErr } = await admin.from('ops_notify').select('email, bell').eq('staff_id', staffId).eq('event', event).maybeSingle()
  if (rErr) return { ok: false, error: rErr.message }
  const row = { staff_id: staffId, event, email: existing?.email ?? false, bell: existing?.bell ?? false, [channel]: on }
  const { error } = row.email || row.bell
    ? await admin.from('ops_notify').upsert(row)
    : await admin.from('ops_notify').delete().eq('staff_id', staffId).eq('event', event)
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'notify.set', summary: `Who is told: ${event} ${channel} ${on ? 'on' : 'off'} for staff ${staffId}`, targetType: 'staff', targetId: staffId })
  revalidatePath('/ops/notify')
  return { ok: true }
}
