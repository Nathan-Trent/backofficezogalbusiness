import { getOperator, requireCap, can } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle, when } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { PlansEditor, type PlanRow } from './PlansEditor'

export const dynamic = 'force-dynamic'

/**
 * Plans & prices. Two catalogues: DRAFT (what Finance is working on) and
 * LIVE (what the app's Subscription page and the site's Doka page show).
 * Save changes the draft; Publish copies draft → live and bumps a version.
 * Replaces doka.zogal.app/admin/pricing.
 */
export default async function PlansPage() {
  await requireCap('doka.finance.edit')
  const op = await getOperator()
  const admin = createAdminClient()
  const cols = 'id, key, name, tagline, price_monthly, price_yearly, currency, features, limits, highlight, is_visible, sort_order, updated_at'
  const [{ data: draft, error: dErr }, { data: live, error: lErr }, { data: pubs, error: pErr }] = await Promise.all([
    admin.from('pricing_plans_draft').select(cols).eq('product', 'doka').order('sort_order').order('price_monthly'),
    admin.from('pricing_plans').select(cols).eq('product', 'doka').order('sort_order').order('price_monthly'),
    admin.from('catalogue_publish').select('version, published_at, note, users:published_by(full_name)').eq('product', 'doka').order('version', { ascending: false }).limit(10),
  ])
  if (dErr || lErr || pErr) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read: {(dErr ?? lErr ?? pErr)!.message}</p>
  const last = pubs?.[0]
  return (
    <>
      <PageTitle title="Plans & prices" subtitle={last ? `Live version ${last.version}, published ${when(last.published_at as string)}` : 'Never published from here — live plans came from the old admin.'} />
      <PlansEditor draft={(draft ?? []) as unknown as PlanRow[]} live={(live ?? []) as unknown as PlanRow[]} canPublish={can(op, 'doka.finance.publish')} />
      <Section title="Publish history" note="Every time the draft went live.">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {(pubs ?? []).map((p) => <li key={p.version as number}><b>v{p.version as number}</b> · <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(p.published_at as string)}</span> · {((p.users as unknown as { full_name: string } | null)?.full_name) ?? 'staff'}{p.note ? ` — ${p.note as string}` : ''}</li>)}
          {(pubs ?? []).length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>None yet.</li>}
        </ul>
      </Section>
    </>
  )
}
