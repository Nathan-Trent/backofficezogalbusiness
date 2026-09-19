'use client'

import { useMemo, useState } from 'react'
import { A } from '@/lib/nav'
import { useCan, useTable } from '@/lib/store/OpsStore'
import { byNewest, useShopsById, useStaffByUserId, type Invoice, type Plan, type Shop, type Subscription } from '@/lib/store/selectors'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Section, Stat, Stats } from '@/components/ops/layout'
import { InvoiceActions, NewInvoiceButton } from '@/components/screens/InvoiceControls'
import { PlansEditor } from '@/components/screens/PlansEditor'

/**
 * Doka subscriptions and invoices. Summary first (what is due, who is
 * expiring), then the invoice list with the action beside each row. A
 * payment lands here the second the webhook settles it.
 */
export function Finance() {
  const can = useCan()
  const invoices = useTable<Invoice>('invoices'), subs = useTable<Subscription>('subscriptions'), plans = useTable<Plan>('pricing_plans'), shopRows = useTable<Shop>('shops')
  const shops = useShopsById()
  const [status, setStatus] = useState<string | null>(null)
  const soon = Date.now() + 14 * 86_400_000
  const active = useMemo(() => subs.filter((s) => shops.get(s.shop_id)?.is_active), [subs, shops])
  const expiring = active.filter((s) => s.expires_at && Date.parse(s.expires_at) <= soon && Date.parse(s.expires_at) >= Date.now())
  const expired = active.filter((s) => s.expires_at && Date.parse(s.expires_at) < Date.now())
  const list = useMemo(() => [...invoices].sort(byNewest).filter((i) => !status || i.status === status), [invoices, status])
  const unpaid = invoices.filter((i) => i.status === 'unpaid')
  const due = unpaid.reduce((a, i) => a + Number(i.amount), 0)
  const canManage = can('doka.finance.subscriptions')
  const livePlans = plans.filter((p) => p.product === 'doka' && p.is_visible).sort((a, b) => a.sort_order - b.sort_order)
  const activeShops = shopRows.filter((s) => s.is_active).sort((a, b) => a.name.localeCompare(b.name))
  const byPlan = new Map<string, number>(); for (const s of active) byPlan.set(s.plan, (byPlan.get(s.plan) ?? 0) + 1)
  return (
    <>
      <PageTitle title="Doka subscriptions" subtitle={`${active.length} active shops · ${[...byPlan].map(([k, n]) => `${n} on ${k}`).join(', ') || 'no plans yet'}`} />
      <Stats>
        <Stat label="Unpaid invoices" value={unpaid.length} note={due ? `₦${due.toLocaleString()} due` : undefined} tone={unpaid.length ? 'warn' : 'plain'} />
        <Stat label="Expiring in 14 days" value={expiring.length} tone={expiring.length ? 'warn' : 'plain'} />
        <Stat label="Expired" value={expired.length} tone={expired.length ? 'bad' : 'good'} />
        <Stat label="No expiry (pre-billing)" value={active.filter((s) => !s.expires_at).length} />
      </Stats>
      {(expiring.length > 0 || expired.length > 0) && (
        <Section title="Needs attention" note="Expiring or expired. Raise an invoice; the owner pays from their dashboard. Or set the subscription from the shop page.">
          <OpsTable headers={['Shop', 'Plan', 'Expires', '']}>
            {[...expired, ...expiring].map((s) => {
              const d = Math.ceil((Date.parse(s.expires_at!) - Date.now()) / 86_400_000); const shop = shops.get(s.shop_id)
              return (
                <tr key={s.shop_id}>
                  <Td><A href={`/ops/doka/shops/${s.shop_id}`} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>{shop?.name}</A></Td>
                  <Td>{s.plan}</Td>
                  <Td><span className={`pill ${d < 0 ? 'pill-bad' : 'pill-warn'}`}>{d < 0 ? `expired ${-d}d ago` : `${d} days`}</span></Td>
                  <Td>{canManage && <NewInvoiceButton shops={[{ id: s.shop_id, name: shop?.name ?? '' }]} plans={livePlans} presetShop={s.shop_id} presetPlan={s.plan} presetStart={d < 0 ? new Date().toISOString().slice(0, 10) : s.expires_at!.slice(0, 10)} small />}</Td>
                </tr>
              )
            })}
          </OpsTable>
        </Section>
      )}
      <Section title="Invoices" note="Each invoice is for one shop, one plan, one period. Paid ones extend the subscription to the period end.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <FilterChips current={status} onChange={setStatus} options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }]} />
          <span style={{ flex: 1 }} />
          {canManage && <NewInvoiceButton shops={activeShops} plans={livePlans} />}
        </div>
        <OpsTable headers={['Invoice', 'Shop', 'Plan · period', 'Amount', 'Status', '']} empty="No invoices yet.">
          {list.map((i) => (
            <tr key={i.id}>
              <Td mono>{i.number}<div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }}>{when(i.created_at, true)}</div></Td>
              <Td><A href={`/ops/doka/shops/${i.shop_id}`} style={{ color: 'inherit' }}>{shops.get(i.shop_id)?.name ?? '—'}</A></Td>
              <Td>{i.plan_key}<div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }} className="tabular">{i.period_start} → {i.period_end}</div></Td>
              <Td mono nowrap>₦{Number(i.amount).toLocaleString()}</Td>
              <Td><span className={`pill ${i.status === 'paid' ? 'pill-good' : i.status === 'void' ? 'pill-plain' : 'pill-warn'}`}>{i.status}</span>{i.status === 'paid' && <div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }}>{i.provider} · {i.provider_ref} · {i.paid_at ? when(i.paid_at, true) : ''}</div>}</Td>
              <Td>{canManage && <InvoiceActions id={i.id} status={i.status} />}</Td>
            </tr>
          ))}
        </OpsTable>
      </Section>
    </>
  )
}

/** In-memory filter chips (the URL is not the state here; the screen is). */
function FilterChips({ current, onChange, options }: { current: string | null; onChange: (v: string | null) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button type="button" className={`pill ${current === null ? 'pill-good' : 'pill-plain'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => onChange(null)}>All</button>
      {options.map((o) => <button key={o.value} type="button" className={`pill ${current === o.value ? 'pill-good' : 'pill-plain'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  )
}

/** Plans & prices: DRAFT vs LIVE; Save changes the draft, Publish copies it live. */
export function Plans() {
  const can = useCan()
  const draft = useTable<Plan>('pricing_plans_draft'), live = useTable<Plan>('pricing_plans')
  const pubs = useTable<{ version: number; published_at: string; note: string | null; published_by: string | null }>('catalogue_publish')
  const staff = useStaffByUserId()
  const sortP = (a: Plan, b: Plan) => a.sort_order - b.sort_order || Number(a.price_monthly) - Number(b.price_monthly)
  const d = useMemo(() => draft.filter((p) => p.product === 'doka').sort(sortP), [draft])
  const l = useMemo(() => live.filter((p) => p.product === 'doka').sort(sortP), [live])
  const history = useMemo(() => [...pubs].sort((a, b) => b.version - a.version), [pubs])
  const last = history[0]
  return (
    <>
      <PageTitle title="Plans & prices" subtitle={last ? `Live version ${last.version}, published ${when(last.published_at)}` : 'Never published from here — live plans came from the old admin.'} />
      <PlansEditor draft={d} live={l} canPublish={can('doka.finance.publish')} />
      <Section title="Publish history" note="Every time the draft went live.">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {history.map((p) => <li key={p.version}><b>v{p.version}</b> · <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(p.published_at)}</span> · {(p.published_by && staff.get(p.published_by)?.name) ?? 'staff'}{p.note ? ` — ${p.note}` : ''}</li>)}
          {history.length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>None yet.</li>}
        </ul>
      </Section>
    </>
  )
}
