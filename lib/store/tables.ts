/**
 * What the back office holds in memory, and who may hold it.
 *
 * Client-first (Nathan, 2026-09-19): on load, each table the operator's
 * switches allow is read ONCE through their own session (RLS from 0018
 * decides what comes back), then Supabase Realtime pushes every later
 * change. Nothing polls. Navigation never touches the server.
 *
 * `cap` mirrors the select policy in 0018 — the client skips tables it
 * cannot read instead of asking and being refused.
 */
export type Row = Record<string, unknown>

export interface TableDef {
  name: string
  /** Capability needed; 'staff' = any staff, 'root' = Root, 'public' = anyone signed in. */
  cap: string
  /** Primary key column(s). Default ['id']. */
  key?: string[]
  /** Newest-first cap for big tables; the rest load in full. */
  order?: { column: string; limit: number }
  /** Extra filter applied on the initial read (PostgREST syntax). */
  filter?: [string, string, string]
}

export const TABLES: TableDef[] = [
  // Company
  { name: 'products', cap: 'staff' },
  { name: 'staff', cap: 'staff' },
  { name: 'ops_notifications', cap: 'staff', order: { column: 'created_at', limit: 50 } },
  { name: 'ops_audit_log', cap: 'company.audit.view', order: { column: 'created_at', limit: 500 } },
  { name: 'ops_notify', cap: 'root', key: ['staff_id', 'event'] },
  { name: 'jobs', cap: 'company.health.view', order: { column: 'created_at', limit: 200 } },
  // Marketing
  { name: 'site_content', cap: 'public', key: ['page', 'key'] },
  { name: 'site_content_draft', cap: 'marketing.view', key: ['page', 'key'] },
  { name: 'site_publish', cap: 'marketing.view', order: { column: 'published_at', limit: 50 } },
  { name: 'contact_messages', cap: 'marketing.inbox', order: { column: 'created_at', limit: 500 } },
  // Doka — operations
  { name: 'shops', cap: 'doka.ops.view' },
  { name: 'subscriptions', cap: 'doka.ops.view', key: ['shop_id'] },
  { name: 'devices', cap: 'doka.ops.view' },
  { name: 'shop_members', cap: 'doka.ops.view', key: ['shop_id', 'user_id'] },
  { name: 'shop_invitations', cap: 'doka.ops.view' },
  { name: 'roles', cap: 'doka.ops.view' },
  { name: 'sync_conflicts', cap: 'doka.ops.view', order: { column: 'occurred_at', limit: 500 }, filter: ['resolved_at', 'is', 'null'] },
  { name: 'signin_events', cap: 'doka.ops.view', order: { column: 'created_at', limit: 3000 } },
  // Doka — users
  { name: 'users', cap: 'doka.users.view' },
  { name: 'messages', cap: 'doka.users.message', order: { column: 'created_at', limit: 500 } },
  { name: 'impersonations', cap: 'doka.users.impersonate', order: { column: 'started_at', limit: 200 } },
  // Doka — finance
  { name: 'pricing_plans', cap: 'public' },
  { name: 'pricing_plans_draft', cap: 'doka.finance.view' },
  { name: 'catalogue_publish', cap: 'doka.finance.view', order: { column: 'version', limit: 50 } },
  { name: 'invoices', cap: 'doka.finance.view', order: { column: 'created_at', limit: 500 } },
  { name: 'payment_methods', cap: 'doka.finance.view' },
  // Doka — settings
  { name: 'platform_settings', cap: 'doka.settings.manage', key: ['key'] },
  { name: 'platform_settings_history', cap: 'doka.settings.manage', order: { column: 'changed_at', limit: 50 } },
  { name: 'operational_settings', cap: 'doka.settings.manage' },
]

export function keyOf(def: TableDef, row: Row): string {
  return (def.key ?? ['id']).map((k) => String(row[k])).join('|')
}
