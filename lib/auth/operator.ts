import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { currentUser } from './current-user'
import { ALL_CAPABILITIES, normalise } from './capabilities'

export interface Operator {
  isStaff: boolean
  isRoot: boolean
  staffId: string | null
  userId: string | null
  name: string | null
  email: string | null
  capabilities: string[]
}

const NONE: Operator = { isStaff: false, isRoot: false, staffId: null, userId: null, name: null, email: null, capabilities: [] }

/**
 * Who the caller is, operationally. Fails closed.
 *
 * `staff_link()` (0016) links a pending invite row to the signed-in account
 * by email on first sign-in and returns the staff row either way. Memoised
 * per request so the layout, the page guard and the action share one read.
 */
export const getOperator = cache(async function getOperator(): Promise<Operator> {
  const user = await currentUser()
  if (!user) return NONE
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('staff_link')
  if (error) { console.error('staff_link failed — denying:', error.message); return NONE }
  const row = data as { id: string; user_id: string; name: string | null; email: string; role: 'root' | 'staff'; capabilities: string[]; deactivated_at: string | null } | null
  if (!row || row.deactivated_at) return NONE
  const isRoot = row.role === 'root'
  return {
    isStaff: true, isRoot, staffId: row.id, userId: row.user_id, name: row.name, email: row.email,
    capabilities: isRoot ? ALL_CAPABILITIES : normalise(row.capabilities ?? []),
  }
})

export function can(op: Operator, capability: string): boolean {
  return op.isRoot || op.capabilities.includes(capability)
}

/** For a page: 404 (not redirect) when the caller may not open it. */
export async function requireCap(capability: string): Promise<Operator> {
  const { notFound } = await import('next/navigation')
  const op = await getOperator()
  if (!can(op, capability)) notFound()
  return op
}

/** For an action: throw, so the POST fails even when no page ran. */
export async function assertCap(capability: string): Promise<Operator> {
  const op = await getOperator()
  if (!can(op, capability)) throw new Error('Not allowed')
  return op
}
