import Link from 'next/link'
import { can, getOperator, requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { OpsTable, PageTitle, Td, when, FilterLinks } from '@/components/ops/table'
import { Section, Stat, Stats } from '@/components/ops/layout'
import { InvoiceActions, NewInvoiceButton } from './InvoiceControls'

export const dynamic = 'force-dynamic'

/**
 * Doka subscriptions and invoices. Summary first (what is due, who is
 * expiring), then the invoice list with the action beside each row.
 * Payment itself happens in the owner's dashboard (Paystack/Flutterwave)
 * or by hand here; both go through apply_payment().
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireCap('doka.finance.view')
  const op = await getOperator()
  const { status } = await searchParams
  const admin = createAdminClient()
  let iq = admin.from('invoices').select('id, number, shop_id, plan_key, period_start, period_end, amount, currency, status, provider, provider_ref, paid_at, created_at, shops(name)').eq('product', 'doka').order('created_at', { ascending: false }).limit(200)
  if (status) iq = iq.eq('status', status)
  const soon = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const [{ data: invoices, error: iErr }, { data: subs, error: sErr }, { data: plans, error: pErr }, { data: shops, error: shErr }] = await Promise.all([
    iq,
    admin.from('subscriptions').select('shop_id, status, plan, expires_at, shops(name, is_active)').order('expires_at', { ascending: true, nullsFirst: false }),
    admin.from('pricing_plans').select('key, name, price_monthly, price_yearly').eq('product', 'doka').eq('is_visible', true).order('sort_order'),
    admin.from('shops').select('id, name').eq('is_active', true).order('name'),
  ])
  if (iErr || sErr || pErr || shErr) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read: {(iErr ?? sErr ?? pErr ?? shErr)!.message}</p>
  type Sub = { shop_id: string; status: string; plan: string; expires_at: string | null; shops: { name: string; is_active: boolean } | null }
  const S = (subs ?? []) as unknown as Sub[]
  const active = S.filter((s) => s.shops?.is_active)
  const expiring = active.filter((s) => s.expires_at && s.expires_at <= soon && Date.parse(s.expires_at) >= Date.now())
  const expired = active.filter((s) => s.expires_at && Date.parse(s.expires_at) < Date.now())
  const unpaid = (invoices ?? []).filter((i) => i.status === 'unpaid')
  const due = unpaid.reduce((a, i) => a + Number(i.amount), 0)
  const canManage = can(op, 'doka.finance.subscriptions')
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
              const d = Math.ceil((Date.parse(s.expires_at!) - Date.now()) / 86_400_000)
              return (
                <tr key={s.shop_id}>
                  <Td><Link href={`/ops/doka/shops/${s.shop_id}`} style={{ fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>{s.shops?.name}</Link></Td>
                  <Td>{s.plan}</Td>
                  <Td><span className={`pill ${d < 0 ? 'pill-bad' : 'pill-warn'}`}>{d < 0 ? `expired ${-d}d ago` : `${d} days`}</span></Td>
                  <Td>{canManage && <NewInvoiceButton shops={[{ id: s.shop_id, name: s.shops?.name ?? '' }]} plans={plans ?? []} presetShop={s.shop_id} presetPlan={s.plan} presetStart={d < 0 ? new Date().toISOString().slice(0, 10) : s.expires_at!.slice(0, 10)} small />}</Td>
                </tr>
              )
            })}
          </OpsTable>
        </Section>
      )}

      <Section title="Invoices" note="Each invoice is for one shop, one plan, one period. Paid ones extend the subscription to the period end.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <FilterLinks base="/ops/doka/finance" param="status" current={status ?? null} options={[{ value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }]} allLabel="All" />
          <span style={{ flex: 1 }} />
          {canManage && <NewInvoiceButton shops={(shops ?? []) as { id: string; name: string }[]} plans={plans ?? []} />}
        </div>
        <OpsTable headers={['Invoice', 'Shop', 'Plan · period', 'Amount', 'Status', '']} empty="No invoices yet.">
          {(invoices ?? []).map((i) => (
            <tr key={i.id as string}>
              <Td mono>{i.number as string}<div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }}>{when(i.created_at as string, true)}</div></Td>
              <Td><Link href={`/ops/doka/shops/${i.shop_id}`} style={{ color: 'inherit' }}>{(i.shops as unknown as { name: string } | null)?.name ?? '—'}</Link></Td>
              <Td>{i.plan_key as string}<div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }} className="tabular">{i.period_start as string} → {i.period_end as string}</div></Td>
              <Td mono nowrap>₦{Number(i.amount).toLocaleString()}</Td>
              <Td><span className={`pill ${i.status === 'paid' ? 'pill-good' : i.status === 'void' ? 'pill-plain' : 'pill-warn'}`}>{i.status as string}</span>{i.status === 'paid' && <div style={{ fontSize: 11.5, color: 'var(--app-text-muted)' }}>{i.provider as string} · {i.provider_ref as string} · {when(i.paid_at as string, true)}</div>}</Td>
              <Td>{canManage && <InvoiceActions id={i.id as string} status={i.status as string} />}</Td>
            </tr>
          ))}
        </OpsTable>
      </Section>
    </>
  )
}
