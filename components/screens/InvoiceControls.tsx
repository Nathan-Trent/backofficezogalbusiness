'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { createInvoice, emailInvoice, markInvoicePaid, voidInvoice } from '@/app/actions/finance'

type Plan = { key: string; name: string; price_monthly: number | string; price_yearly: number | string | null }

/** Raise an invoice: shop, plan, 1 or 12 months, start date. Emails the owner. */
export function NewInvoiceButton({ shops, plans, presetShop, presetPlan, presetStart, small }: { shops: { id: string; name: string }[]; plans: Plan[]; presetShop?: string; presetPlan?: string; presetStart?: string; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const [shop, setShop] = useState(presetShop ?? shops[0]?.id ?? '')
  const [plan, setPlan] = useState(presetPlan && plans.some((p) => p.key === presetPlan) ? presetPlan : plans[0]?.key ?? '')
  const [months, setMonths] = useState<1 | 12>(1)
  const [start, setStart] = useState(presetStart ?? new Date().toISOString().slice(0, 10))
  const [pending, go] = useTransition()
  const p = plans.find((x) => x.key === plan)
  const amount = p ? (months === 12 ? (p.price_yearly ?? Number(p.price_monthly) * 12) : Number(p.price_monthly)) : 0
  return (
    <>
      <button className={`btn btn-primary${small ? ' btn-sm' : ''}`} onClick={() => setOpen(true)}>{small ? 'Invoice' : '+ Raise invoice'}</button>
      <ConfirmDialog open={open} wide title="Raise an invoice" confirmLabel={pending ? 'Raising…' : `Raise ₦${Number(amount).toLocaleString()} and email`} busy={pending} onCancel={() => setOpen(false)}
        onConfirm={() => go(async () => { const r = await createInvoice({ shopId: shop, planKey: plan, months, startDate: start }); if (r.ok) { toast.success(`Invoice ${(r.data as { number: string }).number} raised and emailed`); setOpen(false) } else toast.error(r.error) })}
        body={<div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
          <label>Shop<select className="ops-input" value={shop} onChange={(e) => setShop(e.target.value)} disabled={!!presetShop}>{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Plan<select className="ops-input" value={plan} onChange={(e) => setPlan(e.target.value)}>{plans.map((x) => <option key={x.key} value={x.key}>{x.name} — ₦{Number(x.price_monthly).toLocaleString()}/mo</option>)}</select></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>Period<select className="ops-input" value={months} onChange={(e) => setMonths(Number(e.target.value) as 1 | 12)}><option value={1}>1 month</option><option value={12}>12 months{p?.price_yearly == null ? ' (12 × monthly)' : ''}</option></select></label>
            <label>Starts<input className="ops-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          </div>
          <p style={{ margin: 0, color: 'var(--app-text-muted)' }}>The owner gets an email wearing Doka&apos;s identity with the amount and a link to pay from their dashboard. Paying extends the subscription to the period end.</p>
        </div>} />
    </>
  )
}

export function InvoiceActions({ id, status }: { id: string; status: string }) {
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [ref, setRef] = useState('')
  const [pending, go] = useTransition()
  const done = (msg: string) => { toast.success(msg); setPaying(false); setVoiding(false) }
  if (status === 'void') return null
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => go(async () => { const r = await emailInvoice(id); if (r.ok) toast.success(status === 'paid' ? 'Receipt sent' : 'Invoice sent'); else toast.error(r.error) })}>{status === 'paid' ? 'Resend receipt' : 'Resend'}</button>
      {status === 'unpaid' && <>
        <button className="btn btn-primary btn-sm" onClick={() => setPaying(true)}>Mark paid</button>
        <button className="btn btn-danger btn-sm" onClick={() => setVoiding(true)}>Void</button>
      </>}
      <ConfirmDialog open={paying} title="Mark this invoice paid?" confirmLabel={pending ? 'Saving…' : 'Mark paid, extend subscription'} busy={pending} onCancel={() => setPaying(false)}
        onConfirm={() => go(async () => { const r = await markInvoicePaid({ invoiceId: id, reference: ref }); if (r.ok) done('Paid — subscription extended, receipt emailed'); else toast.error(r.error) })}
        body={<div style={{ display: 'grid', gap: 8 }}><p style={{ margin: 0 }}>For money that arrived outside the app — bank transfer, cash. The subscription extends to the invoice&apos;s period end and the owner gets a receipt.</p><input className="ops-input" placeholder="Reference (transfer ref, teller no.)" value={ref} onChange={(e) => setRef(e.target.value)} /></div>} />
      <ConfirmDialog open={voiding} title="Void this invoice?" tone="danger" confirmLabel="Void" busy={pending} onCancel={() => setVoiding(false)}
        onConfirm={() => go(async () => { const r = await voidInvoice(id); if (r.ok) done('Voided'); else toast.error(r.error) })}
        body="It stays in the list as void and can no longer be paid. Raise a new one if the amount was wrong." />
    </div>
  )
}
