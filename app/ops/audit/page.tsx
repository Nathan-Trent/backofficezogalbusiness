import Link from 'next/link'
import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'

export const dynamic = 'force-dynamic'

/** Activity: what operators did, one plain line each, filterable by product. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  await requireCap('company.audit.view')
  const { product } = await searchParams
  const admin = createAdminClient()
  let q = admin.from('ops_audit_log').select('id, actor_role, product, action, summary, created_at, actor:actor_id(full_name, email)').order('created_at', { ascending: false }).limit(200)
  if (product === 'company') q = q.is('product', null)
  else if (product) q = q.eq('product', product)
  const { data, error } = await q
  if (error) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read: {error.message}</p>
  const rows = (data ?? []) as unknown as { id: string; actor_role: string; product: string | null; action: string; summary: string; created_at: string; actor: { full_name: string; email: string } | null }[]
  const chips: [string, string][] = [['', 'All'], ['company', 'Zogal Business'], ['doka', 'Doka']]
  return (
    <>
      <PageTitle title="Activity" subtitle="Every change an operator made, in the words written at the time." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {chips.map(([v, l]) => <Link key={v} href={v ? `/ops/audit?product=${v}` : '/ops/audit'} className={`pill ${(product ?? '') === v ? 'pill-good' : 'pill-plain'}`} style={{ textDecoration: 'none' }}>{l}</Link>)}
      </div>
      <OpsTable headers={['When', 'Who', 'Where', 'What']} empty="Nothing yet.">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td mono nowrap>{when(r.created_at)}</Td>
            <Td nowrap>{r.actor?.full_name ?? r.actor?.email ?? '—'} <span style={{ color: 'var(--app-text-muted)' }}>· {r.actor_role}</span></Td>
            <Td nowrap>{r.product ?? 'Zogal Business'}</Td>
            <Td>{r.summary} <span style={{ color: 'var(--app-text-tertiary)', fontSize: 11 }}>{r.action}</span></Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}
