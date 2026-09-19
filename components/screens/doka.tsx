'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { A } from '@/lib/nav'
import { useCan, useRpc, useTable } from '@/lib/store/OpsStore'
import { byNewest, online, useOwnerByShop, useRolesById, useShopsById, useSubsByShop, useUsersById, type Conflict, type Device, type Member, type Message, type Shop, type Signin, type Subscription, type User } from '@/lib/store/selectors'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Fact, Facts, Section, Stat, Stats } from '@/components/ops/layout'
import { WorldMap } from '@/components/screens/WorldMap'
import { ImpersonateButton, MessageButton, RevokeButton, ShopActiveButton, SubscriptionEditor } from '@/components/screens/Controls'
import { geolocatePending } from '@/app/actions/doka'

const surface = (s: string) => (s === 'desktop' ? 'shop app' : s === 'web' ? 'dashboard' : 'web shop app')

/**
 * Doka's front page IS the map: where people are signed in from, app and
 * shop computer. A new sign-in lands on the map the moment it happens.
 */
export function WhereTheyAre() {
  const events = useTable<Signin>('signin_events'), shops = useTable<Shop>('shops'), devices = useTable<Device>('devices')
  const users = useUsersById(), shopsById = useShopsById()
  const sales = useRpc<{ count_24h: number }>('ops_sales_summary', {}, ['devices'])
  const since = Date.now() - 30 * 86_400_000
  const recent = useMemo(() => events.filter((e) => Date.parse(e.created_at) >= since).sort(byNewest), [events, since])
  // Sign-ins without a place: ask the server to look them up (once per batch, not on a timer).
  const pending = recent.filter((e) => !e.country).length
  const asked = useRef(0)
  useEffect(() => { if (pending && pending !== asked.current) { asked.current = pending; void geolocatePending() } }, [pending])
  const list = useMemo(() => {
    const places = new Map<string, { city: string; country: string; lat: number; lng: number; n: number; last: string }>()
    for (const e of recent) {
      if (e.lat == null || e.lng == null) continue
      const k = `${e.city ?? '?'}|${e.country ?? '?'}`
      const p = places.get(k) ?? { city: e.city ?? 'Unknown', country: e.country ?? '', lat: e.lat, lng: e.lng, n: 0, last: e.created_at }
      p.n += 1; if (e.created_at > p.last) p.last = e.created_at
      places.set(k, p)
    }
    return [...places.values()].sort((a, b) => b.n - a.n)
  }, [recent])
  return (
    <>
      <PageTitle title="Doka · where they are" subtitle="Sign-ins to the dashboard and the shop computer over the last 30 days, by place." />
      <Stats>
        <Stat label="Active shops" value={shops.filter((s) => s.is_active).length} />
        <Stat label="Terminals online now" value={devices.filter(online).length} tone="good" />
        <Stat label="Sales, 24 h" value={sales.data?.count_24h ?? '…'} />
        <Stat label="Sign-ins, 30 days" value={recent.length} />
        <Stat label="Places" value={list.length} />
      </Stats>
      <Section title="Map" first><WorldMap points={list} /></Section>
      <Section title="By place">
        {list.length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No located sign-ins yet. Places appear once the apps record sign-ins and their addresses are looked up.</p> : (
          <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            {list.slice(0, 30).map((p) => (
              <div key={`${p.city}|${p.country}`} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px', gap: 12, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)' }}>
                <span style={{ fontWeight: 600 }}>{p.city}<span style={{ color: 'var(--app-text-muted)', fontWeight: 400 }}>, {p.country}</span></span>
                <span className="tabular">{p.n} sign-in{p.n === 1 ? '' : 's'}</span>
                <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>last {when(p.last)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section title="Latest sign-ins">
        <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
          {recent.slice(0, 20).map((e) => (
            <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 90px', gap: 12, padding: '6px 12px' }}>
              <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(e.created_at)}</span>
              <span>{(e.user_id && users.get(e.user_id)?.full_name) ?? '—'}{e.shop_id && shopsById.get(e.shop_id) ? <span style={{ color: 'var(--app-text-muted)' }}> · {shopsById.get(e.shop_id)!.name}</span> : null}</span>
              <span style={{ color: 'var(--app-text-muted)' }}>{e.city ? `${e.city}, ${e.country}` : e.country ?? 'locating…'}</span>
              <span className="pill pill-plain">{surface(e.surface)}</span>
            </div>
          ))}
          {recent.length === 0 && <p style={{ fontSize: 13, color: 'var(--app-text-muted)', margin: 0 }}>None yet.</p>}
        </div>
      </Section>
    </>
  )
}

export function Shops() {
  const shops = useTable<Shop>('shops'); const subs = useSubsByShop(); const owners = useOwnerByShop(); const users = useUsersById()
  const [q, setQ] = useState('')
  const rows = useMemo(() => [...shops].sort(byNewest).filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase())), [shops, q])
  return (
    <>
      <PageTitle title="Shops" subtitle={`${shops.length} shops on Doka`} />
      <div style={{ marginBottom: 14, maxWidth: 360 }}><input className="ops-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by shop name…" /></div>
      <OpsTable headers={['Shop', 'Owner', 'Subscription', 'Since', '']} empty="No shops.">
        {rows.map((s) => {
          const o = owners.get(s.id); const owner = o ? users.get(o.user_id) : undefined; const sub = subs.get(s.id)
          const d = sub?.expires_at ? Math.ceil((Date.parse(sub.expires_at) - Date.now()) / 86_400_000) : null
          return (
            <tr key={s.id}>
              <Td><A href={`/ops/doka/shops/${s.id}`} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>{s.name}</A>{!s.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
              <Td>{owner ? <A href={`/ops/doka/users/${owner.id}`} style={{ color: 'inherit' }}>{owner.full_name}</A> : <span style={{ color: 'var(--app-text-muted)' }}>—</span>}</Td>
              <Td><span className={`pill ${sub?.status === 'active' ? 'pill-good' : 'pill-warn'}`}>{sub?.status ?? 'none'}</span> <span style={{ color: 'var(--app-text-muted)' }}>{sub?.plan}{d !== null ? ` · ${d >= 0 ? `${d} days left` : `expired ${-d}d ago`}` : ' · no expiry'}</span></Td>
              <Td mono muted nowrap>{when(s.created_at, true)}</Td>
              <Td><A href={`/ops/doka/shops/${s.id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</A></Td>
            </tr>
          )
        })}
      </OpsTable>
    </>
  )
}

/** One shop: owner, staff, terminals, subscription — and the actions on it. */
export function ShopDetail({ id }: { id: string }) {
  const can = useCan()
  const shop = useShopsById().get(id); const sub = useSubsByShop().get(id)
  const members = useTable<Member>('shop_members'), devices = useTable<Device>('devices'), conflicts = useTable<Conflict>('sync_conflicts')
  const users = useUsersById(), roles = useRolesById()
  const sales = useRpc<{ by_shop: Record<string, { total: number; receipts: number }> }>('ops_sales_summary', {}, ['shops'])
  if (!shop) return <PageTitle title="No such shop" subtitle="It may have been removed, or the link is wrong." />
  const staff = members.filter((m) => m.shop_id === id).map((m) => ({ ...m, user: users.get(m.user_id), role: roles.get(m.role_id) }))
  const devs = devices.filter((d) => d.shop_id === id).sort((a, b) => a.activated_at.localeCompare(b.activated_at))
  const mine = sales.data?.by_shop?.[id]
  const open = conflicts.filter((c) => c.shop_id === id).length
  return (
    <>
      <PageTitle title={shop.name} subtitle={`Shop · ${shop.timezone} · since ${when(shop.created_at, true)}${shop.is_active ? '' : ' · DEACTIVATED'}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {can('doka.users.message') && <MessageButton shopId={shop.id} label={`Message everyone at ${shop.name}`} />}
        {can('doka.shops.manage') && <ShopActiveButton shopId={shop.id} active={shop.is_active} name={shop.name} />}
      </div>
      <Stats>
        <Stat label="Sales, 30 days" value={mine ? `₦${Math.round(Number(mine.total)).toLocaleString('en-NG')}` : sales.loading ? '…' : '₦0'} note={mine ? `${mine.receipts} receipts` : undefined} />
        <Stat label="Staff" value={staff.filter((m) => m.is_active).length} />
        <Stat label="Terminals" value={`${devs.filter(online).length} / ${devs.filter((d) => !d.revoked_at).length} online`} />
        <Stat label="Sync issues" value={open} tone={open > 0 ? 'warn' : 'plain'} />
      </Stats>
      <Section title="Subscription" note="What the terminals enforce offline. Invoices and payments are under Finance; this sets it by hand.">
        <Facts>
          <Fact label="Status" value={sub?.status ?? 'none'} />
          <Fact label="Plan" value={sub?.plan ?? '—'} />
          <Fact label="Expires" value={sub?.expires_at ? when(sub.expires_at, true) : 'no expiry'} />
        </Facts>
        {can('doka.finance.subscriptions') && <div style={{ marginTop: 10 }}><SubscriptionEditor shopId={shop.id} current={sub ?? null} /></div>}
      </Section>
      <Section title="People" note="Who works here and what they are. Open a person for their permissions and history.">
        <OpsTable headers={['Name', 'Role', 'Since', '']} empty="Nobody yet.">
          {staff.map((m) => (
            <tr key={m.user_id}>
              <Td><A href={`/ops/doka/users/${m.user_id}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{m.user?.full_name ?? m.user_id}</A><div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{m.user?.email}</div></Td>
              <Td>{m.role?.name ?? '—'}{!m.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
              <Td mono muted nowrap>{when(m.joined_at, true)}</Td>
              <Td><A href={`/ops/doka/users/${m.user_id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</A></Td>
            </tr>
          ))}
        </OpsTable>
      </Section>
      <Section title="Terminals">
        <TerminalRows rows={devs} showShop={false} />
      </Section>
    </>
  )
}

function TerminalRows({ rows, showShop }: { rows: Device[]; showShop: boolean }) {
  const can = useCan(); const shops = useShopsById()
  return (
    <OpsTable headers={showShop ? ['Terminal', 'Shop', 'Status', 'Last sync', 'Activated', ''] : ['Terminal', 'Status', 'Last sync', 'Activated', '']} empty="No terminals.">
      {rows.map((d) => (
        <tr key={d.id}>
          <Td>{d.name}</Td>
          {showShop && <Td>{shops.get(d.shop_id) ? <A href={`/ops/doka/shops/${d.shop_id}`} style={{ color: 'var(--accent)' }}>{shops.get(d.shop_id)!.name}</A> : '—'}</Td>}
          <Td>{d.revoked_at ? <span className="pill pill-bad">revoked</span> : online(d) ? <span className="pill pill-good">online</span> : <span className="pill pill-plain">offline</span>}</Td>
          <Td mono muted nowrap>{d.last_sync_at ? when(d.last_sync_at) : 'never'}</Td>
          <Td mono muted nowrap>{when(d.activated_at, true)}</Td>
          <Td>{!d.revoked_at && can('doka.terminals.manage') && <RevokeButton deviceId={d.id} name={d.name} />}</Td>
        </tr>
      ))}
    </OpsTable>
  )
}

export function Terminals() {
  const devices = useTable<Device>('devices')
  const rows = useMemo(() => [...devices].sort((a, b) => (b.last_sync_at ?? '').localeCompare(a.last_sync_at ?? '')), [devices])
  const active = rows.filter((d) => !d.revoked_at)
  return (
    <>
      <PageTitle title="Terminals" subtitle="Every shop computer running Doka. Online = synced in the last 5 minutes. Status changes as terminals sync." />
      <Stats>
        <Stat label="Active" value={active.length} />
        <Stat label="Online now" value={active.filter(online).length} tone="good" />
        <Stat label="Silent > 24 h" value={active.filter((d) => !d.last_sync_at || Date.now() - Date.parse(d.last_sync_at) > 86_400_000).length} tone="warn" />
      </Stats>
      <TerminalRows rows={rows} showShop />
    </>
  )
}

export function Users() {
  const members = useTable<Member>('shop_members'); const users = useUsersById(); const shops = useShopsById(); const roles = useRolesById(); const owners = useOwnerByShop()
  const [q, setQ] = useState('')
  const rows = useMemo(() => members.map((m) => ({ ...m, user: users.get(m.user_id), shop: shops.get(m.shop_id), role: roles.get(m.role_id), owner: owners.get(m.shop_id) }))
    .filter((r) => !q || [r.user?.full_name, r.user?.email, r.shop?.name].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.joined_at.localeCompare(a.joined_at)), [members, users, shops, roles, owners, q])
  return (
    <>
      <PageTitle title="Users" subtitle="Everyone on Doka. A person can belong to more than one shop; each membership is a row." />
      <div style={{ marginBottom: 14, maxWidth: 360 }}><input className="ops-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or shop…" /></div>
      <OpsTable headers={['Person', 'Shop', 'Role', 'Linked to', 'Since', '']} empty="No users match.">
        {rows.map((r) => (
          <tr key={`${r.user_id}-${r.shop_id}`}>
            <Td><A href={`/ops/doka/users/${r.user_id}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>{r.user?.full_name ?? '—'}</A><div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{r.user?.email}</div></Td>
            <Td><A href={`/ops/doka/shops/${r.shop_id}`} style={{ color: 'inherit' }}>{r.shop?.name ?? '—'}</A></Td>
            <Td>{r.role?.name ?? '—'}{!r.is_active && <span className="pill pill-bad" style={{ marginLeft: 8 }}>deactivated</span>}</Td>
            <Td muted>{r.role?.key === 'owner' ? 'is the owner' : r.owner ? <A href={`/ops/doka/users/${r.owner.user_id}`} style={{ color: 'inherit' }}>{users.get(r.owner.user_id)?.full_name}</A> : '—'}</Td>
            <Td mono muted nowrap>{when(r.joined_at, true)}</Td>
            <Td><A href={`/ops/doka/users/${r.user_id}`} style={{ fontSize: 12.5, color: 'var(--accent)' }}>Open</A></Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}

/** One person: who, which shops, what role, exactly which permissions, who their owner is, what they did. */
export function UserDetail({ id }: { id: string }) {
  const can = useCan()
  const u = useUsersById().get(id); const shops = useShopsById(); const roles = useRolesById(); const owners = useOwnerByShop(); const users = useUsersById()
  const members = useTable<Member>('shop_members'), signins = useTable<Signin>('signin_events'), messages = useTable<Message>('messages')
  const detail = useRpc<{ permissions: Record<string, string[]>; overrides: { shop_id: string; permission_key: string; allowed: boolean }[]; sales: { id: string; total: string; sold_at: string; shop_id: string; terminal: string | null }[]; terminals: string[] }>('ops_user_detail', { p_user_id: id }, ['shop_members'])
  if (!u) return <PageTitle title="No such user" subtitle="They may have been removed, or the link is wrong." />
  const mem = members.filter((m) => m.user_id === id)
  const mySignins = signins.filter((s) => s.user_id === id).sort(byNewest).slice(0, 10)
  const myMsgs = messages.filter((m) => m.to_user_id === id).sort(byNewest).slice(0, 10)
  return (
    <>
      <PageTitle title={u.full_name} subtitle={`${u.email}${u.phone ? ` · ${u.phone}` : ''} · on Doka since ${when(u.created_at, true)}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {can('doka.users.message') && <MessageButton userId={u.id} label={`Message ${u.full_name.split(' ')[0]}`} />}
        {can('doka.users.impersonate') && <ImpersonateButton userId={u.id} name={u.full_name.split(' ')[0]} />}
      </div>
      <Section title="Linked to" note="Each shop this person belongs to, their role there, and the owner of that shop." first>
        {mem.length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Not a member of any shop.</p> : mem.map((m) => {
          const role = roles.get(m.role_id); const isOwner = role?.key === 'owner'; const owner = owners.get(m.shop_id)
          const perms = detail.data?.permissions?.[m.shop_id] ?? []; const ov = (detail.data?.overrides ?? []).filter((o) => o.shop_id === m.shop_id)
          return (
            <div key={m.shop_id} style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 14, marginBottom: 10 }}>
              <Facts>
                <Fact label="Shop" value={<A href={`/ops/doka/shops/${m.shop_id}`} style={{ color: 'var(--accent)' }}>{shops.get(m.shop_id)?.name ?? '—'}</A>} />
                <Fact label="Role" value={`${role?.name ?? '—'}${m.is_active ? '' : ' (deactivated)'}`} />
                <Fact label="Owner" value={isOwner ? 'This person owns the shop' : owner ? <A href={`/ops/doka/users/${owner.user_id}`} style={{ color: 'var(--accent)' }}>{users.get(owner.user_id)?.full_name}</A> : '—'} />
                <Fact label="Since" value={when(m.joined_at, true)} />
              </Facts>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <span style={{ color: 'var(--app-text-muted)' }}>Can: </span>
                {isOwner ? 'everything (owner)' : detail.loading ? '…' : perms.join(' · ') || 'nothing'}
                {ov.length > 0 && <div style={{ marginTop: 4, color: 'var(--app-text-muted)' }}>Per-person: {ov.map((o) => `${o.allowed ? '+' : '−'}${o.permission_key}`).join(' · ')}</div>}
              </div>
            </div>
          )
        })}
      </Section>
      <Section title="Sign-ins">
        <OpsTable headers={['When', 'From', 'Where']} empty="No sign-ins recorded yet.">
          {mySignins.map((s) => <tr key={s.id}><Td mono nowrap>{when(s.created_at)}</Td><Td>{surface(s.surface)}</Td><Td muted>{s.city ? `${s.city}, ${s.country}` : s.country ?? 'locating…'}</Td></tr>)}
        </OpsTable>
      </Section>
      <Section title="Sales they recorded" note={detail.data?.terminals?.length ? `On: ${detail.data.terminals.join(', ')}` : undefined}>
        <OpsTable headers={['When', 'Total', 'Terminal']} empty={detail.loading ? 'Loading…' : 'None.'}>
          {(detail.data?.sales ?? []).map((s) => <tr key={s.id}><Td mono nowrap>{when(s.sold_at)}</Td><Td mono>₦{Math.round(Number(s.total)).toLocaleString('en-NG')}</Td><Td muted>{s.terminal ?? '—'}</Td></tr>)}
        </OpsTable>
      </Section>
      <Section title="Messages sent to them">
        <OpsTable headers={['When', 'Subject', 'How', 'Status']} empty="None.">
          {myMsgs.map((m) => <tr key={m.id}><Td mono nowrap>{when(m.created_at)}</Td><Td>{m.subject}</Td><Td muted>{m.channels.join(' + ')}</Td><Td><span className={`pill ${m.status === 'sent' ? 'pill-good' : m.status === 'failed' ? 'pill-bad' : 'pill-warn'}`}>{m.status}</span></Td></tr>)}
        </OpsTable>
      </Section>
    </>
  )
}

/** Sync issues across every shop — the owner resolves them; here we see who has a pile. */
export function Conflicts() {
  const conflicts = useTable<Conflict>('sync_conflicts'); const shops = useShopsById(); const devices = useTable<Device>('devices')
  const devById = useMemo(() => new Map(devices.map((d) => [d.id, d])), [devices])
  const rows = useMemo(() => [...conflicts].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [conflicts])
  const byShop = new Set(rows.map((r) => r.shop_id))
  return (
    <>
      <PageTitle title="Sync issues" subtitle={`${rows.length} unresolved across ${byShop.size} shop${byShop.size === 1 ? '' : 's'}. Owners resolve these in their dashboard; a pile means a shop needs a call.`} />
      <OpsTable headers={['When', 'Shop', 'Terminal', 'Kind', 'Detail']} empty="Nothing unresolved. Every offline sale matched the server.">
        {rows.map((r) => (
          <tr key={r.id}>
            <Td mono nowrap>{when(r.occurred_at)}</Td>
            <Td>{shops.get(r.shop_id) ? <A href={`/ops/doka/shops/${r.shop_id}`} style={{ color: 'var(--accent)' }}>{shops.get(r.shop_id)!.name}</A> : '—'}</Td>
            <Td muted>{(r.device_id && devById.get(r.device_id)?.name) ?? '—'}</Td>
            <Td><span className="pill pill-warn">{r.kind.replace('_', ' ')}</span></Td>
            <Td muted>{Object.entries(r.detail ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</Td>
          </tr>
        ))}
      </OpsTable>
    </>
  )
}

export type { Subscription }
