'use client'

import { useRpc } from '@/lib/store/OpsStore'
import type { SecretView } from '@/components/ops/SecretRows'

/**
 * Key status (set / not set), never values, through secrets_status() —
 * re-read when the audit log shows a key changed (the secrets table itself
 * pushes nothing to a user session, by design).
 */
export function useSecrets(product: string): SecretView[] {
  const r = useRpc<{ key: string; description: string | null; is_set: boolean; updated_at: string }[]>('secrets_status', { p_product: product }, ['ops_audit_log'])
  return (r.data ?? []).map((s) => ({ key: s.key, description: s.description, isSet: s.is_set, updated_at: s.updated_at, fromEnv: false }))
}
