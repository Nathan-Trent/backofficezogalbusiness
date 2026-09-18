import Link from 'next/link'
import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle, when } from '@/components/ops/table'
import { Section, Stat, Stats } from '@/components/ops/layout'

export const dynamic = 'force-dynamic'

/** Company overview: totals across products, and what happened last. */
export default async function OverviewPage() {
  await requireCap('company.overview')
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const [shops, active, sales, signins, staff, audit, products] = await Promise.all([
    admin.from('shops').select('id', { count: 'exact', head: true }),
    admin.from('subscriptions').select('shop_id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('sales').select('total').eq('status', 'completed').gte('sold_at', since),
    admin.from('signin_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('staff').select('id', { count: 'exact', head: true }).is('deactivated_at', null),
    admin.from('ops_audit_log').select('summary, created_at, product').order('created_at', { ascending: false }).limit(8),
    admin.from('products').select('key, name, colour, tagline').eq('is_active', true).order('sort_order'),
  ])
  const errors = [shops.error, active.error, sales.error, signins.error, staff.error, audit.error, products.error].filter(Boolean)
  const revenue = (sales.data ?? []).reduce((s, r) => s + Number((r as { total: string }).total), 0)
  return (
    <>
      <PageTitle title="Zogal Business" subtitle="The company at a glance. Products have their own pages." />
      {errors.length > 0 && <p style={{ color: 'var(--status-critical-fg)', fontSize: 13 }}>Some figures failed to load: {errors.map((e) => e!.message).join('; ')}</p>}
      <Stats>
        <Stat label="Shops" value={shops.count ?? 0} note="on Doka" />
        <Stat label="Active subscriptions" value={active.count ?? 0} tone="good" />
        <Stat label="Sales through Doka, 30 days" value={`₦${Math.round(revenue).toLocaleString('en-NG')}`} note="what shops sold, not what Zogal earned" />
        <Stat label="Sign-ins, 30 days" value={signins.count ?? 0} />
        <Stat label="Staff" value={staff.count ?? 0} href="/ops/staff" />
      </Stats>
      <Section title="Products">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {(products.data ?? []).map((p) => (
            <Link key={p.key as string} href={`/ops/${p.key}`} style={{ display: 'block', padding: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${p.colour}`, borderRadius: 'var(--r-md)', textDecoration: 'none' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name as string}</div>
              <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>{p.tagline as string}</div>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Latest activity" actions={<Link href="/ops/audit" style={{ fontSize: 13, color: 'var(--accent)' }}>All activity</Link>}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, fontSize: 13 }}>
          {(audit.data ?? []).map((a, i) => <li key={i}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(a.created_at as string)}</span> · {a.product ? `${a.product} · ` : ''}{a.summary as string}</li>)}
          {(audit.data ?? []).length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>Nothing yet.</li>}
        </ul>
      </Section>
    </>
  )
}
