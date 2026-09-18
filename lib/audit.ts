import { createAdminClient } from '@/lib/supabase/admin'
import type { Operator } from '@/lib/auth/operator'

/**
 * Record what an operator just did. Service role (the log has no insert
 * policy). Never throws: losing the entry is bad, failing the thing the
 * operator asked for because the log failed is worse. Call AFTER the write.
 */
export async function recordAction(op: Operator, input: {
  action: string; summary: string; product?: string | null; targetType?: string; targetId?: string; detail?: Record<string, unknown>
}): Promise<void> {
  if (!op.userId) return
  try {
    const { error } = await createAdminClient().from('ops_audit_log').insert({
      actor_id: op.userId, actor_role: op.isRoot ? 'root' : 'staff', product: input.product ?? null,
      action: input.action, summary: input.summary, target_type: input.targetType ?? null, target_id: input.targetId ?? null, detail: input.detail ?? {},
    })
    if (error) console.error('audit write failed:', input.action, error.message)
  } catch (e) { console.error('audit write threw:', input.action, e) }
}
