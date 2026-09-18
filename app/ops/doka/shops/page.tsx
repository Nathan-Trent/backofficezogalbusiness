import Link from 'next/link'
import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'

export const dynamic = 'force-dynamic'

export default async function ShopsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCap('doka.ops.view')
  const { q } = await searchParams
  const admin = createAdminClient()
  // admin_list_shops() is definer-gated on is_platform_admin (Root); the service role bypasses RLS but not the function's own check, so read the tables directly.
  let sq = admin.from('shops').select('id, name, timezone, is_active, created_at, subscriptions(status, plan, expires_at)').order('created_at', { ascending: false }).limit(300)
  if (q) sq = sq.ilike('name', `%${q}%`)
  const [{ data, error }, { data: owners, error: oErr }] = await Promise.all([sq, admin.from('ops_user_memberships').select('shop_id, owner_name, owner_id').eq('role_key', 'owner')])
  if (error || oErr) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read: {(error ?? oErr)!.message}</p>
  const ownerOf = new Map((owners ?? []).map((o) => [o.shop_id as string, o]))
  const rows = (data ?? []) as unknown as { id: string; name: string; timezone: string; is_active: boolean; created_at: string; subscriptions: { status: string; plan: string; expires_at: string | null } | null }[]
  return (
    <>
      <PageTitle title="Shops" subtitle={`${rows.length} shops on Doka`} />
      <form style={{ marginBottom: 14, maxWidth: 360 }}><input className="ops-input" name="q" defaultValue={q ?? ''} placeholder="Search by shop name…" /></form>
      <OpsTable headers={['Shop', 'Owner', 'Subscription', 'Since', '']} empty="No shops.">
        {rows.map((s) => {
          const o = ownerOf.get(s.id); const sub = s.subscriptions
          const d = sub?.expires_at ? Math.ceil((Date.parse(sub.expires_at) - Date.now()) / 86_400_000) : null
          return (
            <tr key={s.id}>
              <Td><Link href={`/ops/doka/shops/${s.id}`} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>{s.name}</Link>{!s.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
              <Td>{o ? <Link href={`/ops/doka/users/${o.owner_id}`} style={{ color: 'inherit' }}>{o.owner_name as string}</Link> : <span style={{ color: 'var(--app-text-muted)' }}>—</span>}</Td>
              <Td><span className={`pill ${sub?.status === 'active' ? 'pill-good' : 'pill-warn'}`}>{sub?.status ?? 'none'}</span> <span style={{ color: 'var(--app-text-muted)' }}>{sub?.plan}{d !== null ? ` · ${d >= 0 ? `${d} days left` : `expired ${-d}d ago`}` : ' · no expiry'}</span></Td>
              <Td mono muted nowrap>{when(s.created_at, true)}</Td>
              <Td><Link href={`/ops/doka/shops/${s.id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</Link></Td>
            </tr>
          )
        })}
      </OpsTable>
    </>
  )
}
