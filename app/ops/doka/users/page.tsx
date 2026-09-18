import Link from 'next/link'
import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'

export const dynamic = 'force-dynamic'

/** Every person on Doka, with the shop and owner they are linked to. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireCap('doka.users.view')
  const { q } = await searchParams
  const admin = createAdminClient()
  let query = admin.from('ops_user_memberships').select('user_id, email, full_name, shop_id, shop_name, role_name, role_key, is_active, joined_at, owner_name, owner_id').order('joined_at', { ascending: false }).limit(500)
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,shop_name.ilike.%${q}%`)
  const { data, error } = await query
  if (error) return <p style={{ color: 'var(--status-critical-fg)' }}>{error.message}</p>
  const rows = (data ?? []) as { user_id: string; email: string; full_name: string; shop_id: string; shop_name: string; role_name: string; role_key: string; is_active: boolean; joined_at: string; owner_name: string | null; owner_id: string | null }[]
  return (
    <>
      <PageTitle title="Users" subtitle="Everyone on Doka. A person can belong to more than one shop; each membership is a row." />
      <form style={{ marginBottom: 14, maxWidth: 360 }}><input className="ops-input" name="q" defaultValue={q ?? ''} placeholder="Name, email or shop…" /></form>
      <OpsTable headers={['Person', 'Shop', 'Role', 'Linked to', 'Since', '']} empty="No users match.">
        {rows.map((r) => (
          <tr key={`${r.user_id}-${r.shop_id}`}>
            <Td><Link href={`/ops/doka/users/${r.user_id}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{r.full_name}</Link><div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{r.email}</div></Td>
            <Td><Link href={`/ops/doka/shops/${r.shop_id}`} style={{ color: 'inherit' }}>{r.shop_name}</Link></Td>
            <Td>{r.role_name}{!r.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
            <Td muted>{r.role_key === 'owner' ? 'is the owner' : r.owner_id ? <Link href={`/ops/doka/users/${r.owner_id}`} style={{ color: 'inherit' }}>{r.owner_name}</Link> : '—'}</Td>
            <Td mono muted nowrap>{when(r.joined_at, true)}</Td>
            <Td><Link href={`/ops/doka/users/${r.user_id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</Link></Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}
