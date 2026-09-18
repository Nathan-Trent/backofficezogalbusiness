import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle, when } from '@/components/ops/table'
import { Section, Stat, Stats } from '@/components/ops/layout'
import { geolocatePending } from '@/app/actions/doka'
import { WorldMap } from './WorldMap'

export const dynamic = 'force-dynamic'

/**
 * Doka's front page IS the map (Nathan): where people are signed in from,
 * app and shop computer — not marketing visits. Counts by place, recency.
 */
export default async function DokaPage() {
  await requireCap('doka.ops.view')
  await geolocatePending()
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [{ data: ev, error }, shops, online, sales] = await Promise.all([
    admin.from('signin_events').select('city, region, country, lat, lng, surface, created_at, user:user_id(full_name), shop:shop_id(name)').eq('product', 'doka').gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
    admin.from('shops').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('devices').select('id', { count: 'exact', head: true }).is('revoked_at', null).gte('last_sync_at', new Date(Date.now() - 5 * 60_000).toISOString()),
    admin.from('sales').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('sold_at', new Date(Date.now() - 86_400_000).toISOString()),
  ])
  const events = (ev ?? []) as unknown as { city: string | null; region: string | null; country: string | null; lat: number | null; lng: number | null; surface: string; created_at: string; user: { full_name: string } | null; shop: { name: string } | null }[]
  const places = new Map<string, { city: string; country: string; lat: number; lng: number; n: number; last: string }>()
  for (const e of events) {
    if (e.lat == null || e.lng == null) continue
    const k = `${e.city ?? '?'}|${e.country ?? '?'}`
    const p = places.get(k) ?? { city: e.city ?? 'Unknown', country: e.country ?? '', lat: e.lat, lng: e.lng, n: 0, last: e.created_at }
    p.n += 1; if (e.created_at > p.last) p.last = e.created_at
    places.set(k, p)
  }
  const list = [...places.values()].sort((a, b) => b.n - a.n)
  return (
    <>
      <PageTitle title="Doka · where they are" subtitle="Sign-ins to the dashboard and the shop computer over the last 30 days, by place." />
      {error && <p style={{ color: 'var(--status-critical-fg)', fontSize: 13 }}>{error.message}</p>}
      <Stats>
        <Stat label="Active shops" value={shops.count ?? 0} />
        <Stat label="Terminals online now" value={online.count ?? 0} tone="good" />
        <Stat label="Sales, 24 h" value={sales.count ?? 0} />
        <Stat label="Sign-ins, 30 days" value={events.length} />
        <Stat label="Places" value={list.length} />
      </Stats>
      <Section title="Map" first>
        <WorldMap points={list} />
      </Section>
      <Section title="By place">
        {list.length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No located sign-ins yet. Places appear once the apps record sign-ins (v0.3.3+) and their addresses are looked up.</p> : (
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
          {events.slice(0, 20).map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr 90px', gap: 12, padding: '6px 12px' }}>
              <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(e.created_at)}</span>
              <span>{e.user?.full_name ?? '—'}{e.shop ? <span style={{ color: 'var(--app-text-muted)' }}> · {e.shop.name}</span> : null}</span>
              <span style={{ color: 'var(--app-text-muted)' }}>{e.city ? `${e.city}, ${e.country}` : e.country ?? 'locating…'}</span>
              <span className="pill pill-plain">{e.surface === 'desktop' ? 'shop app' : e.surface === 'web' ? 'dashboard' : 'web shop app'}</span>
            </div>
          ))}
          {events.length === 0 && <p style={{ fontSize: 13, color: 'var(--app-text-muted)', margin: 0 }}>None yet.</p>}
        </div>
      </Section>
    </>
  )
}
