import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Fact, Facts, Section } from '@/components/ops/layout'
import { ImpersonateButton, MessageButton } from '../../Controls'

export const dynamic = 'force-dynamic'

/**
 * One person on Doka: who they are, which shop(s), what role, exactly which
 * permissions (role + per-person switches), who their owner is, what they've
 * done — and the actions: Message, Sign in as.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const op = await requireCap('doka.users.view')
  const { id } = await params
  const admin = createAdminClient()
  const [user, memberships, overrides, signins, sales, messages, devices] = await Promise.all([
    admin.from('users').select('id, email, full_name, phone, created_at').eq('id', id).maybeSingle(),
    admin.from('ops_user_memberships').select('shop_id, shop_name, role_name, role_key, is_active, joined_at, owner_name, owner_id').eq('user_id', id),
    admin.from('member_permission_overrides').select('shop_id, permission_key, allowed').eq('user_id', id),
    admin.from('signin_events').select('created_at, surface, city, country').eq('user_id', id).order('created_at', { ascending: false }).limit(10),
    admin.from('sales').select('id, total, sold_at, shop_id, devices(name)').eq('sold_by', id).eq('status', 'completed').order('sold_at', { ascending: false }).limit(10),
    admin.from('messages').select('subject, status, channels, created_at').eq('to_user_id', id).order('created_at', { ascending: false }).limit(10),
    admin.from('sales').select('device_id, devices(name)').eq('sold_by', id).not('device_id', 'is', null).limit(200),
  ])
  if (user.error) return <p style={{ color: 'var(--status-critical-fg)' }}>{user.error.message}</p>
  if (!user.data) notFound()
  const u = user.data
  const mem = (memberships.data ?? []) as { shop_id: string; shop_name: string; role_name: string; role_key: string; is_active: boolean; joined_at: string; owner_name: string | null; owner_id: string | null }[]
  const ov = (overrides.data ?? []) as { shop_id: string; permission_key: string; allowed: boolean }[]

  // Effective permissions per shop: role permissions ± overrides.
  const roleIds = new Map<string, string>()
  const { data: rp, error: rpErr } = await admin.from('shop_members').select('shop_id, role_id, roles(role_permissions(permission_key))').eq('user_id', id)
  if (rpErr) console.error(rpErr.message)
  const rolePerms = new Map<string, string[]>()
  for (const r of (rp ?? []) as unknown as { shop_id: string; role_id: string; roles: { role_permissions: { permission_key: string }[] } | null }[]) {
    roleIds.set(r.shop_id, r.role_id)
    rolePerms.set(r.shop_id, (r.roles?.role_permissions ?? []).map((x) => x.permission_key))
  }
  const terminals = [...new Map(((devices.data ?? []) as unknown as { device_id: string; devices: { name: string } | null }[]).map((d) => [d.device_id, d.devices?.name ?? d.device_id])).values()]

  return (
    <>
      <PageTitle title={u.full_name} subtitle={`${u.email}${u.phone ? ` · ${u.phone}` : ''} · on Doka since ${when(u.created_at, true)}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {can(op, 'doka.users.message') && <MessageButton userId={u.id} label={`Message ${u.full_name.split(' ')[0]}`} />}
        {can(op, 'doka.users.impersonate') && <ImpersonateButton userId={u.id} name={u.full_name.split(' ')[0]} />}
      </div>

      <Section title="Linked to" note="Each shop this person belongs to, their role there, and the owner of that shop." first>
        {mem.length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Not a member of any shop.</p> : mem.map((m) => {
          const perms = new Set(rolePerms.get(m.shop_id) ?? [])
          const shopOv = ov.filter((o) => o.shop_id === m.shop_id)
          for (const o of shopOv) if (o.allowed) perms.add(o.permission_key); else perms.delete(o.permission_key)
          const isOwner = m.role_key === 'owner'
          return (
            <div key={m.shop_id} style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 14, marginBottom: 10 }}>
              <Facts>
                <Fact label="Shop" value={<Link href={`/ops/doka/shops/${m.shop_id}`} style={{ color: 'var(--accent)' }}>{m.shop_name}</Link>} />
                <Fact label="Role" value={`${m.role_name}${m.is_active ? '' : ' (deactivated)'}`} />
                <Fact label="Owner" value={isOwner ? 'This person owns the shop' : m.owner_id ? <Link href={`/ops/doka/users/${m.owner_id}`} style={{ color: 'var(--accent)' }}>{m.owner_name}</Link> : '—'} />
                <Fact label="Since" value={when(m.joined_at, true)} />
              </Facts>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <span style={{ color: 'var(--app-text-muted)' }}>Can: </span>
                {isOwner ? 'everything (owner)' : [...perms].sort().join(' · ') || 'nothing'}
                {shopOv.length > 0 && <div style={{ marginTop: 4, color: 'var(--app-text-muted)' }}>Per-person: {shopOv.map((o) => `${o.allowed ? '+' : '−'}${o.permission_key}`).join(' · ')}</div>}
              </div>
            </div>
          )
        })}
      </Section>

      <Section title="Sign-ins">
        <OpsTable headers={['When', 'From', 'Where']} empty="No sign-ins recorded yet.">
          {((signins.data ?? []) as { created_at: string; surface: string; city: string | null; country: string | null }[]).map((s, i) => (
            <tr key={i}><Td mono nowrap>{when(s.created_at)}</Td><Td>{s.surface === 'desktop' ? 'shop app' : s.surface === 'web' ? 'dashboard' : 'web shop app'}</Td><Td muted>{s.city ? `${s.city}, ${s.country}` : s.country ?? 'locating…'}</Td></tr>
          ))}
        </OpsTable>
      </Section>

      <Section title="Sales they recorded" note={terminals.length ? `On: ${terminals.join(', ')}` : undefined}>
        <OpsTable headers={['When', 'Total', 'Terminal']} empty="None.">
          {((sales.data ?? []) as unknown as { id: string; total: string; sold_at: string; devices: { name: string } | null }[]).map((s) => (
            <tr key={s.id}><Td mono nowrap>{when(s.sold_at)}</Td><Td mono>₦{Math.round(Number(s.total)).toLocaleString('en-NG')}</Td><Td muted>{s.devices?.name ?? '—'}</Td></tr>
          ))}
        </OpsTable>
      </Section>

      <Section title="Messages sent to them">
        <OpsTable headers={['When', 'Subject', 'How', 'Status']} empty="None.">
          {((messages.data ?? []) as { subject: string; status: string; channels: string[]; created_at: string }[]).map((m, i) => (
            <tr key={i}><Td mono nowrap>{when(m.created_at)}</Td><Td>{m.subject}</Td><Td muted>{m.channels.join(' + ')}</Td><Td><span className={`pill ${m.status === 'sent' ? 'pill-good' : m.status === 'failed' ? 'pill-bad' : 'pill-warn'}`}>{m.status}</span></Td></tr>
          ))}
        </OpsTable>
      </Section>
    </>
  )
}
