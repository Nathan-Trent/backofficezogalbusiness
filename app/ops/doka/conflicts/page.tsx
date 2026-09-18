import Link from 'next/link'
import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'

export const dynamic = 'force-dynamic'

/** Sync issues across every shop — the owner resolves them; here we see who has a pile. */
export default async function ConflictsPage() {
  await requireCap('doka.ops.view')
  const { data, error } = await createAdminClient().from('sync_conflicts').select('id, kind, detail, occurred_at, resolved_at, shops(id, name), devices(name)').is('resolved_at', null).order('occurred_at', { ascending: false }).limit(300)
  if (error) return <p style={{ color: 'var(--status-critical-fg)' }}>{error.message}</p>
  const rows = (data ?? []) as unknown as { id: string; kind: string; detail: Record<string, unknown>; occurred_at: string; shops: { id: string; name: string } | null; devices: { name: string } | null }[]
  const byShop = new Map<string, number>()
  for (const r of rows) byShop.set(r.shops?.name ?? '?', (byShop.get(r.shops?.name ?? '?') ?? 0) + 1)
  return (
    <>
      <PageTitle title="Sync issues" subtitle={`${rows.length} unresolved across ${byShop.size} shop${byShop.size === 1 ? '' : 's'}. Owners resolve these in their dashboard; a pile means a shop needs a call.`} />
      <OpsTable headers={['When', 'Shop', 'Terminal', 'Kind', 'Detail']} empty="Nothing unresolved. Every offline sale matched the server.">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td mono nowrap>{when(r.occurred_at)}</Td>
            <Td>{r.shops ? <Link href={`/ops/doka/shops/${r.shops.id}`} style={{ color: 'var(--accent)' }}>{r.shops.name}</Link> : '—'}</Td>
            <Td muted>{r.devices?.name ?? '—'}</Td>
            <Td><span className="pill pill-warn">{r.kind.replace('_', ' ')}</span></Td>
            <Td muted>{Object.entries(r.detail).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}
