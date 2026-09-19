'use client'

import { useMemo, useState } from 'react'
import { useCan, useRpc, useTable } from '@/lib/store/OpsStore'
import { byNewest, useStaffByUserId } from '@/lib/store/selectors'
import { PageTitle, when } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { Switch } from '@/components/ops/Switch'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { useAct } from '@/lib/act'
import { addTaxRule, setCategoryTaxTypes, unverifyTaxRule, verifyTaxRule, type RuleParams } from '@/app/actions/tax'

interface TaxType { key: string; name: string; authority: string; period: 'monthly' | 'annual'; basis: 'turnover' | 'net_profit'; description: string; sort_order: number }
interface BusinessCategory { key: string; name: string; description: string; sort_order: number }
interface CategoryMap { category_key: string; tax_type_key: string }
interface Rule {
  id: string; tax_type_key: string; kind: 'rate' | 'threshold' | 'bands' | 'filing_due'
  effective_from: string; effective_to: string | null; params: Record<string, unknown>
  verified: boolean; verified_by: string | null; verified_at: string | null
  source: string; note: string | null; created_by: string | null; created_at: string
}
interface HistoryRow { id: string; rule_id: string; action: 'insert' | 'update' | 'delete'; old_row: Record<string, unknown> | null; new_row: Record<string, unknown> | null; changed_by: string | null; changed_at: string }

const KINDS: { key: Rule['kind']; label: string }[] = [
  { key: 'threshold', label: 'Threshold' }, { key: 'rate', label: 'Rate' },
  { key: 'bands', label: 'Bands' }, { key: 'filing_due', label: 'Filing due' },
]
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const naira = (n: number) => `₦${Number(n).toLocaleString('en-NG')}`
const pct = (n: number) => `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}%`

function describe(kind: Rule['kind'], p: Record<string, unknown>): string {
  if (kind === 'rate') return pct(p.rate as number)
  if (kind === 'threshold') return `Exempt below ${naira(p.amount as number)}`
  if (kind === 'bands') return ((p.bands as { upto: number | null; rate: number }[]) ?? []).map((b) => `${b.upto === null ? 'above' : `up to ${naira(b.upto)}`}: ${pct(b.rate)}`).join(' · ')
  const dayOf = `day ${p.day as number}`
  return p.months_after !== undefined && p.months_after !== null
    ? `${dayOf} of the month, ${p.months_after} month${p.months_after === 1 ? '' : 's'} after the period ends`
    : `${MONTHS[p.month as number] ?? p.month}, ${dayOf}, ${p.years_after} year${p.years_after === 1 ? '' : 's'} after the year ends`
}

/**
 * §8.1: thresholds, rates, bands and filing dates — versioned and human-
 * gated. Save is never an edit in place: a new rule closes whatever was
 * open and takes over from its effective date, so last year's rules stay
 * exactly what they were for last year's figures.
 */
export function TaxRules() {
  const can = useCan()
  const canManage = can('doka.tax.manage')
  const types = useTable<TaxType>('tax_types'), categories = useTable<BusinessCategory>('business_categories')
  const map = useTable<CategoryMap>('business_category_tax_types'), rules = useTable<Rule>('tax_rules')
  const history = useRpc<HistoryRow[]>('tax_rules_history_list', { p_tax_type_key: null }, ['tax_rules'])
  const staff = useStaffByUserId()

  const byTypeKind = useMemo(() => {
    const m = new Map<string, Rule[]>()
    for (const r of rules) { const k = `${r.tax_type_key}|${r.kind}`; m.set(k, [...(m.get(k) ?? []), r]) }
    for (const arr of m.values()) arr.sort((a, b) => b.effective_from.localeCompare(a.effective_from))
    return m
  }, [rules])
  const sortedTypes = useMemo(() => [...types].sort((a, b) => a.sort_order - b.sort_order), [types])
  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.sort_order - b.sort_order), [categories])
  const anyUnverified = rules.some((r) => !r.verified && r.effective_to === null)

  return (
    <>
      <PageTitle title="Tax rules" subtitle="Thresholds, rates and filing dates behind the tax widget shops see. A new figure is a new effective-dated row — nothing is overwritten, so last year's numbers use last year's rules automatically." />
      {anyUnverified && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--status-approaching-bg, rgba(242,193,78,.12))', border: '1px solid var(--status-approaching-fg)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--status-approaching-fg)' }}>
          At least one rule in force has not been verified — shops see its figures labelled as an estimate until it is.
        </div>
      )}
      {sortedTypes.map((t, i) => (
        <Section key={t.key} title={`${t.name} · ${t.authority}`} note={t.description} first={i === 0}>
          <div style={{ display: 'grid', gap: 8 }}>
            {KINDS.map((k) => <KindRow key={k.key} taxType={t} kind={k.key} label={k.label} rows={byTypeKind.get(`${t.key}|${k.key}`) ?? []} canManage={canManage} staff={staff} />)}
          </div>
        </Section>
      ))}
      <Section title="Business categories" note="What a shop owner declares at setup; the mapping decides which taxes they are told about. Nothing is inferred from their sales.">
        <div style={{ display: 'grid', gap: 10 }}>
          {sortedCats.map((c) => <CategoryRow key={c.key} category={c} types={sortedTypes} mine={map.filter((m) => m.category_key === c.key).map((m) => m.tax_type_key)} canManage={canManage} />)}
        </div>
      </Section>
      <Section title="Recent changes">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {(history.data ?? []).slice(0, 30).map((h) => {
            const row = h.new_row ?? h.old_row
            const who = h.changed_by ? (staff.get(h.changed_by)?.name ?? staff.get(h.changed_by)?.email) : null
            return <li key={h.id}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(h.changed_at)}</span> · {row?.tax_type_key as string} {row?.kind as string} · {h.action}{who ? ` · ${who}` : ''}</li>
          })}
          {(history.data ?? []).length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>{history.loading ? 'Loading…' : 'Nothing yet.'}</li>}
        </ul>
      </Section>
    </>
  )
}

function KindRow({ taxType, kind, label, rows, canManage, staff }: {
  taxType: TaxType; kind: Rule['kind']; label: string; rows: Rule[]; canManage: boolean
  staff: Map<string, { name: string | null; email: string }>
}) {
  const current = rows.find((r) => r.effective_to === null) ?? null
  const past = rows.filter((r) => r !== current)
  const [showHistory, setShowHistory] = useState(false)
  const [adding, setAdding] = useState(false)
  const { run } = useAct()
  return (
    <div style={{ padding: '10px 14px', background: 'var(--surface)', border: `1px solid ${current && !current.verified ? 'var(--status-approaching-fg)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-md)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ minWidth: 90 }}>{label}</b>
        {current ? (
          <>
            <span style={{ flex: 1 }}>{describe(kind, current.params)}</span>
            <span style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>since {current.effective_from}</span>
            {canManage ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <Switch on={current.verified} onChange={(on) => (on ? verifyTaxRule(current.id) : unverifyTaxRule(current.id))} label={`${label} verified`} />
                {current.verified ? 'Verified' : 'Unverified'}
              </label>
            ) : <span className={`pill ${current.verified ? 'pill-good' : 'pill-warn'}`}>{current.verified ? 'Verified' : 'Unverified'}</span>}
          </>
        ) : <span style={{ flex: 1, color: 'var(--app-text-muted)' }}>Not set.</span>}
        {past.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHistory((s) => !s)}>{showHistory ? 'Hide history' : `History (${past.length})`}</button>}
        {canManage && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>{current ? 'Replace' : 'Add'}</button>}
      </div>
      {current?.source && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--app-text-muted)' }}>Source: {current.source}{current.note ? ` — ${current.note}` : ''}{current.verified && current.verified_at ? ` · verified ${when(current.verified_at, true)}` : ''}</div>}
      {showHistory && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'grid', gap: 4 }}>
          {past.map((r) => (
            <div key={r.id} style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>
              {r.effective_from} → {r.effective_to} · {describe(kind, r.params)} · {r.verified ? 'was verified' : 'was unverified'}{r.source ? ` · ${r.source}` : ''}
            </div>
          ))}
        </div>
      )}
      {adding && <RuleForm taxType={taxType} kind={kind} label={label} onClose={() => setAdding(false)} run={run} />}
    </div>
  )
}

function RuleForm({ taxType, kind, label, onClose, run }: { taxType: TaxType; kind: Rule['kind']; label: string; onClose: () => void; run: ReturnType<typeof useAct>['run'] }) {
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [source, setSource] = useState('')
  const [note, setNote] = useState('')
  const [rate, setRate] = useState('')
  const [amount, setAmount] = useState('')
  const [bands, setBands] = useState<{ upto: string; rate: string }[]>([{ upto: '', rate: '' }])
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('1')
  const [monthsAfter, setMonthsAfter] = useState('1')
  const [yearsAfter, setYearsAfter] = useState('1')
  const [busy, setBusy] = useState(false)

  const buildParams = (): RuleParams | null => {
    if (kind === 'rate') { const r = Number(rate) / 100; return Number.isFinite(r) ? { kind, rate: r } : null }
    if (kind === 'threshold') { const a = Number(amount); return Number.isFinite(a) ? { kind, amount: a, basis: 'annual_turnover', below: 'exempt' } : null }
    if (kind === 'bands') {
      const parsed = bands.map((b, i) => ({ upto: i === bands.length - 1 ? null : Number(b.upto), rate: Number(b.rate) / 100 }))
      if (parsed.some((b) => !Number.isFinite(b.rate) || (b.upto !== null && !Number.isFinite(b.upto)))) return null
      return { kind, basis: 'annual_net_profit', bands: parsed }
    }
    const d = Number(day); if (!Number.isFinite(d)) return null
    return taxType.period === 'monthly' ? { kind, day: d, months_after: Number(monthsAfter) } : { kind, day: d, month: Number(month), years_after: Number(yearsAfter) }
  }

  const submit = async () => {
    const params = buildParams()
    if (!params) return
    setBusy(true)
    const r = await run(() => addTaxRule({ taxTypeKey: taxType.key, effectiveFrom, params, source, note }), `${label} rule saved, effective ${effectiveFrom}`)
    setBusy(false)
    if (r.ok) onClose()
  }

  return (
    <ConfirmDialog open wide title={`${taxType.name} — ${label.toLowerCase()}`} confirmLabel={busy ? 'Saving…' : 'Save'} busy={busy} onCancel={onClose} onConfirm={submit}
      body={<div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        <label>Effective from<input className="ops-input" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} /></label>

        {kind === 'rate' && <label>Rate (%)<input className="ops-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="7.5" /></label>}
        {kind === 'threshold' && <label>Exempt below (₦)<input className="ops-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25000000" /></label>}
        {kind === 'bands' && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Bands (the last has no upper limit)</span>
            {bands.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input className="ops-input" style={{ maxWidth: 200 }} inputMode="decimal" placeholder={i === bands.length - 1 ? 'and above' : 'up to ₦'} disabled={i === bands.length - 1} value={i === bands.length - 1 ? '' : b.upto} onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, upto: e.target.value } : x)))} />
                <input className="ops-input" style={{ maxWidth: 120 }} inputMode="decimal" placeholder="rate %" value={b.rate} onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
                {bands.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBands((bs) => bs.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => setBands((bs) => [...bs, { upto: '', rate: '' }])}>+ Add band</button>
          </div>
        )}
        {kind === 'filing_due' && taxType.period === 'monthly' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <label>Day of month<input className="ops-input" style={{ maxWidth: 100 }} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="21" /></label>
            <label>Months after the period ends<input className="ops-input" style={{ maxWidth: 100 }} inputMode="numeric" value={monthsAfter} onChange={(e) => setMonthsAfter(e.target.value)} /></label>
          </div>
        )}
        {kind === 'filing_due' && taxType.period === 'annual' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label>Month<select className="ops-input" style={{ maxWidth: 160 }} value={month} onChange={(e) => setMonth(e.target.value)}>{MONTHS.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></label>
            <label>Day<input className="ops-input" style={{ maxWidth: 90 }} inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} placeholder="31" /></label>
            <label>Years after the year ends<input className="ops-input" style={{ maxWidth: 100 }} inputMode="numeric" value={yearsAfter} onChange={(e) => setYearsAfter(e.target.value)} /></label>
          </div>
        )}

        <label>Source<input className="ops-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Nigeria Tax Act 2025 §… / accountant's note" /></label>
        <label>Note <span style={{ color: 'var(--app-text-muted)', fontWeight: 400 }}>(optional)</span><textarea className="ops-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted)' }}>Saved as unverified. Shops see this figure labelled an estimate until it is confirmed.</p>
      </div>} />
  )
}

function CategoryRow({ category, types, mine, canManage }: { category: BusinessCategory; types: TaxType[]; mine: string[]; canManage: boolean }) {
  const [selected, setSelected] = useState(new Set(mine))
  const dirty = selected.size !== mine.length || mine.some((k) => !selected.has(k))
  const { busy, run } = useAct()
  return (
    <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{category.name}</div>
      <div style={{ fontSize: 12, color: 'var(--app-text-muted)', marginBottom: 8 }}>{category.description}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {types.map((t) => (
          <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" disabled={!canManage} checked={selected.has(t.key)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(t.key); else n.delete(t.key); return n })} />
            {t.name}
          </label>
        ))}
      </div>
      {canManage && dirty && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" data-busy={busy} disabled={busy} onClick={() => void run(() => setCategoryTaxTypes(category.key, [...selected]), 'Saved')}>{busy ? <span className="spinner" /> : 'Save'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(mine))}>Undo</button>
        </div>
      )}
    </div>
  )
}
