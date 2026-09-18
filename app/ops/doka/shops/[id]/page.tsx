import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Fact, Facts, Section, Stat, Stats } from '@/components/ops/layout'
import { MessageButton, ShopActiveButton, SubscriptionEditor, RevokeButton } from '../../Controls'

export const dynamic = 'force-dynamic'

/** One shop: owner, staff, terminals, subscription, activity — and the actions on it. */
export default async function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireCap('doka.ops.view')
  const { id } = await params
  const admin = createAdminClient()
  const [shop, members, devices, sub, sales, conflicts] = await Promise.all([
    admin.from('shops').select('id, name, timezone, is_active, created_at').eq('id', id).maybeSingle(),
    admin.from('ops_user_memberships').select('user_id, full_name, email, role_name, is_active, joined_at').eq('shop_id', id),
    admin.from('devices').select('id, name, last_sync_at, revoked_at, activated_at').eq('shop_id', id).order('activated_at'),
    admin.from('subscriptions').select('status, plan, expires_at').eq('shop_id', id).maybeSingle(),
    admin.from('sales').select('total, sold_at').eq('shop_id', id).eq('status', 'completed').gte('sold_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    admin.from('sync_conflicts').select('id', { count: 'exact', head: true }).eq('shop_id', id).is('resolved_at', null),
  ])
  if (shop.error) return <p style={{ color: 'var(--status-critical-fg)' }}>{shop.error.message}</p>
  if (!shop.data) notFound()
  const s = shop.data
  const revenue = (sales.data ?? []).reduce((a, r) => a + Number((r as { total: string }).total), 0)
  const staff = (members.data ?? []) as { user_id: string; full_name: string; email: string; role_name: string; is_active: boolean; joined_at: string }[]
  const devs = (devices.data ?? []) as { id: string; name: string; last_sync_at: string | null; revoked_at: string | null; activated_at: string }[]
  const online = (d: typeof devs[number]) => !!d.last_sync_at && Date.now() - Date.parse(d.last_sync_at) < 5 * 60_000
  return (
    <>
      <PageTitle title={s.name} subtitle={`Shop · ${s.timezone} · since ${when(s.created_at, true)}${s.is_active ? '' : ' · DEACTIVATED'}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {can(op, 'doka.users.message') && <MessageButton shopId={s.id} label={`Message everyone at ${s.name}`} />}
        {can(op, 'doka.shops.manage') && <ShopActiveButton shopId={s.id} active={s.is_active} name={s.name} />}
      </div>
      <Stats>
        <Stat label="Sales, 30 days" value={`₦${Math.round(revenue).toLocaleString('en-NG')}`} note={`${(sales.data ?? []).length} receipts`} />
        <Stat label="Staff" value={staff.filter((m) => m.is_active).length} />
        <Stat label="Terminals" value={`${devs.filter((d) => !d.revoked_at && online(d)).length} / ${devs.filter((d) => !d.revoked_at).length} online`} />
        <Stat label="Sync issues" value={conflicts.count ?? 0} tone={(conflicts.count ?? 0) > 0 ? 'warn' : 'plain'} />
      </Stats>

      <Section title="Subscription" note="What the terminals enforce offline. Sets status, plan and expiry by hand until Finance takes over.">
        <Facts>
          <Fact label="Status" value={sub.data?.status ?? 'none'} />
          <Fact label="Plan" value={sub.data?.plan ?? '—'} />
          <Fact label="Expires" value={sub.data?.expires_at ? when(sub.data.expires_at, true) : 'no expiry'} />
        </Facts>
        {can(op, 'doka.finance.subscriptions') && <div style={{ marginTop: 10 }}><SubscriptionEditor shopId={s.id} current={sub.data ?? null} /></div>}
      </Section>

      <Section title="People" note="Who works here and what they are. Open a person for their permissions and history.">
        <OpsTable headers={['Name', 'Role', 'Since', '']} empty="Nobody yet.">
          {staff.map((m) => (
            <tr key={m.user_id}>
              <Td><Link href={`/ops/doka/users/${m.user_id}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{m.full_name}</Link><div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{m.email}</div></Td>
              <Td>{m.role_name}{!m.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
              <Td mono muted nowrap>{when(m.joined_at, true)}</Td>
              <Td><Link href={`/ops/doka/users/${m.user_id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</Link></Td>
            </tr>
          ))}
        </OpsTable>
      </Section>

      <Section title="Terminals">
        <OpsTable headers={['Terminal', 'Status', 'Last sync', 'Activated', '']} empty="No terminals activated.">
          {devs.map((d) => (
            <tr key={d.id}>
              <Td>{d.name}</Td>
              <Td>{d.revoked_at ? <span className="pill pill-bad">revoked</span> : online(d) ? <span className="pill pill-good">online</span> : <span className="pill pill-plain">offline</span>}</Td>
              <Td mono muted nowrap>{d.last_sync_at ? when(d.last_sync_at) : 'never'}</Td>
              <Td mono muted nowrap>{when(d.activated_at, true)}</Td>
              <Td>{!d.revoked_at && can(op, 'doka.terminals.manage') && <RevokeButton deviceId={d.id} name={d.name} />}</Td>
            </tr>
          ))}
        </OpsTable>
      </Section>
    </>
  )
}
