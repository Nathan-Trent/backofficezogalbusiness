import { useMemo } from 'react'
import { useTable } from './OpsStore'

/** Row shapes as the store holds them (what the tables actually contain). */
export interface Shop { id: string; name: string; timezone: string; is_active: boolean; created_at: string }
export interface Subscription { shop_id: string; status: 'active' | 'past_due' | 'cancelled'; plan: string; expires_at: string | null; auto_renew: boolean }
export interface PaymentMethod { id: string; shop_id: string; provider: string; brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null; revoked_at: string | null; created_at: string }
export interface Device { id: string; shop_id: string; name: string; last_sync_at: string | null; revoked_at: string | null; activated_at: string }
export interface Member { shop_id: string; user_id: string; role_id: string; is_active: boolean; joined_at: string }
export interface Role { id: string; key: string; name: string }
export interface User { id: string; email: string; full_name: string; phone: string | null; created_at: string }
export interface StaffRow { id: string; email: string; name: string | null; role: 'root' | 'staff'; capabilities: string[]; invited_at: string; accepted_at: string | null; deactivated_at: string | null; user_id: string | null }
export interface Audit { id: string; actor_id: string; actor_role: string; product: string | null; action: string; summary: string; created_at: string }
export interface Signin { id: string; user_id: string | null; shop_id: string | null; surface: string; city: string | null; region: string | null; country: string | null; lat: number | null; lng: number | null; created_at: string }
export interface Conflict { id: string; shop_id: string; device_id: string | null; kind: string; detail: Record<string, unknown>; occurred_at: string; resolved_at: string | null }
export interface Invoice { id: string; number: string; shop_id: string; plan_key: string; period_start: string; period_end: string; amount: number | string; currency: string; status: 'unpaid' | 'paid' | 'void'; provider: string | null; provider_ref: string | null; paid_at: string | null; created_at: string; kind?: 'manual' | 'renewal'; charge_attempts?: number; last_charge_error?: string | null }
export interface Plan { id: string; product: string; key: string; name: string; tagline: string | null; price_monthly: number | string; price_yearly: number | string | null; currency: string; features: string[]; limits: Record<string, number>; highlight: boolean; is_visible: boolean; sort_order: number; updated_at: string }
export interface Message { id: string; to_user_id: string | null; to_shop_id: string | null; subject: string; status: string; channels: string[]; error: string | null; created_at: string }
export interface Job { id: string; kind: string; product: string | null; status: string; attempts: number; max_attempts: number; next_run_at: string; last_error: string | null; created_at: string; updated_at: string }

export const OWNER_ROLE_ID = '00000000-0000-0000-0000-000000000001'
export const byNewest = <T extends { created_at: string }>(a: T, b: T) => b.created_at.localeCompare(a.created_at)
export const online = (d: Device) => !d.revoked_at && !!d.last_sync_at && Date.now() - Date.parse(d.last_sync_at) < 5 * 60_000

/** Maps rebuilt only when their table changes. */
export function useShopsById() { const shops = useTable<Shop>('shops'); return useMemo(() => new Map(shops.map((s) => [s.id, s])), [shops]) }
export function useUsersById() { const users = useTable<User>('users'); return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]) }
export function useSubsByShop() { const subs = useTable<Subscription>('subscriptions'); return useMemo(() => new Map(subs.map((s) => [s.shop_id, s])), [subs]) }
export function useRolesById() { const roles = useTable<Role>('roles'); return useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]) }
export function useStaffById() { const staff = useTable<StaffRow>('staff'); return useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]) }
export function useStaffByUserId() { const staff = useTable<StaffRow>('staff'); return useMemo(() => new Map(staff.filter((s) => s.user_id).map((s) => [s.user_id!, s])), [staff]) }

/** The active owner of each shop (earliest-joined active member with the owner role). */
export function useOwnerByShop() {
  const members = useTable<Member>('shop_members')
  return useMemo(() => {
    const m = new Map<string, Member>()
    for (const r of members) if (r.role_id === OWNER_ROLE_ID && r.is_active) { const cur = m.get(r.shop_id); if (!cur || r.joined_at < cur.joined_at) m.set(r.shop_id, r) }
    return m
  }, [members])
}
