import Link from 'next/link'
import { can, requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Stat, Stats } from '@/components/ops/layout'
import { RevokeButton } from '../Controls'

export const dynamic = 'force-dynamic'

export default async function TerminalsPage() {
  const op = await requireCap('doka.ops.view')
  const { data, error } = await createAdminClient().from('devices').select('id, name, last_sync_at, revoked_at, activated_at, shops(id, name)').order('last_sync_at', { ascending: false, nullsFirst: false }).limit(500)
  if (error) return <p style={{ color: 'var(--status-critical-fg)' }}>{error.message}</p>
  const rows = (data ?? []) as unknown as { id: string; name: string; last_sync_at: string | null; revoked_at: string | null; activated_at: string; shops: { id: string; name: string } | null }[]
  const online = (d: typeof rows[number]) => !d.revoked_at && !!d.last_sync_at && Date.now() - Date.parse(d.last_sync_at) < 5 * 60_000
  const active = rows.filter((d) => !d.revoked_at)
  return (
    <>
      <PageTitle title="Terminals" subtitle="Every shop computer running Doka. Online = synced in the last 5 minutes." />
      <Stats>
        <Stat label="Active" value={active.length} />
        <Stat label="Online now" value={active.filter(online).length} tone="good" />
        <Stat label="Silent > 24 h" value={active.filter((d) => !d.last_sync_at || Date.now() - Date.parse(d.last_sync_at) > 86_400_000).length} tone="warn" />
      </Stats>
      <OpsTable headers={['Terminal', 'Shop', 'Status', 'Last sync', 'Activated', '']} empty="No terminals.">
        {rows.map((d) => (
          <tr key={d.id}>
            <Td>{d.name}</Td>
            <Td>{d.shops ? <Link href={`/ops/doka/shops/${d.shops.id}`} style={{ color: 'var(--accent)' }}>{d.shops.name}</Link> : '—'}</Td>
            <Td>{d.revoked_at ? <span className="pill pill-bad">revoked</span> : online(d) ? <span className="pill pill-good">online</span> : <span className="pill pill-plain">offline</span>}</Td>
            <Td mono muted nowrap>{d.last_sync_at ? when(d.last_sync_at) : 'never'}</Td>
            <Td mono muted nowrap>{when(d.activated_at, true)}</Td>
            <Td>{!d.revoked_at && can(op, 'doka.terminals.manage') && <RevokeButton deviceId={d.id} name={d.name} />}</Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}
