'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { Section } from '@/components/ops/layout'
import { deletePlanDraft, discardPlanDrafts, publishPlans, savePlanDraft } from '@/app/actions/finance'
import { useTable } from '@/lib/store/OpsStore'

/**
 * A plan's entitlements (0027): one row per catalogue feature.
 *   toggle → on/off;  count → on/off + max at once;  quota → on/off + N per day/week/month/year.
 * Empty quantity = unlimited. The plan's marketing bullet list is generated
 * from this by the database, so the site can never promise an ungated thing.
 */
export interface Entitlement { enabled: boolean; quantity?: number | null; period?: 'day' | 'week' | 'month' | 'year' | null }
export type Entitlements = Record<string, Entitlement>
export interface Feature { product: string; key: string; name: string; description: string; kind: 'toggle' | 'count' | 'quota'; unit: string | null; sort_order: number }

export interface PlanRow {
  id: string; key: string; name: string; tagline: string | null; price_monthly: number | string; price_yearly: number | string | null; currency: string
  features: string[]; limits: Record<string, number>; entitlements: Entitlements; highlight: boolean; is_visible: boolean; sort_order: number; updated_at: string
}

const PERIODS = ['day', 'week', 'month', 'year'] as const

const entOf = (e: Entitlements | undefined, key: string): Entitlement => {
  const x = e?.[key]
  return x ? { enabled: x.enabled !== false, quantity: x.quantity ?? null, period: x.period ?? null } : { enabled: true, quantity: null, period: null }
}

/** Same wording the database generates for the plan's bullet list. */
function label(f: Feature, e: Entitlement): string {
  if (!e.enabled) return 'off'
  if (f.kind === 'toggle') return 'on'
  const unit = f.unit ?? ''
  if (e.quantity == null) return `unlimited ${unit}`
  const noun = e.quantity === 1 ? unit.replace(/s$/, '') : unit
  return f.kind === 'quota' ? `${e.quantity} ${noun} a ${e.period ?? 'month'}` : `${e.quantity} ${noun}`
}

function summary(features: Feature[], e: Entitlements | undefined): string {
  return features.map((f) => `${f.name.toLowerCase()} ${label(f, entOf(e, f.key))}`).join(' · ')
}

const naira = (v: number | string | null) => v === null ? '—' : `₦${Number(v).toLocaleString()}`

/** One line per plan, the diff against live beside it, an editor on click. */
export function PlansEditor({ draft, live, canPublish }: { draft: PlanRow[]; live: PlanRow[]; canPublish: boolean }) {
  const [editing, setEditing] = useState<PlanRow | 'new' | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [note, setNote] = useState('')
  const [pending, start] = useTransition()
  const features = [...useTable<Feature>('feature_catalogue')].filter((f) => f.product === 'doka').sort((a, b) => a.sort_order - b.sort_order)
  const liveById = new Map(live.map((p) => [p.id, p]))
  const draftIds = new Set(draft.map((p) => p.id))
  const changed = draft.filter((p) => { const l = liveById.get(p.id); return !l || fingerprint(l) !== fingerprint(p) })
  const dropped = live.filter((p) => !draftIds.has(p.id) && p.is_visible)
  const dirty = changed.length + dropped.length
  const refresh = () => {} // rows arrive by push

  return (
    <>
      <Section title="Draft" first note={dirty ? `${dirty} change${dirty > 1 ? 's' : ''} not yet live. Save edits here as often as you like; nothing changes for shops until Publish.` : 'Draft matches what is live.'}>
        <div style={{ display: 'grid', gap: 8 }}>
          {draft.map((p) => {
            const l = liveById.get(p.id); const isChanged = !l || fingerprint(l) !== fingerprint(p)
            return (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: `1px solid ${isChanged ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-md)', fontSize: 13 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b>{p.name}</b><code style={{ color: 'var(--app-text-muted)' }}>{p.key}</code>
                    <span className="tabular">{naira(p.price_monthly)}/mo{p.price_yearly !== null && <> · {naira(p.price_yearly)}/yr</>}</span>
                    {p.highlight && <span className="pill pill-good">recommended</span>}
                    {!p.is_visible && <span className="pill pill-plain">hidden</span>}
                    {!l && <span className="pill pill-warn">new</span>}
                    {l && isChanged && <span className="pill pill-warn">changed</span>}
                  </div>
                  <div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>
                    {summary(features, p.entitlements)}
                    {l && isChanged && <div>live: {naira(l.price_monthly)}/mo · {summary(features, l.entitlements)}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button>
                  <button className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(async () => { const r = await deletePlanDraft(p.id); if (r.ok) { toast.success('Removed from draft'); refresh() } else toast.error(r.error) })}>Remove</button>
                </div>
              </div>
            )
          })}
          {dropped.map((p) => (
            <div key={p.id} style={{ padding: '10px 14px', border: '1px dashed var(--status-critical-fg)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--app-text-muted)' }}>
              <b style={{ color: 'var(--app-text-primary)' }}>{p.name}</b> is live but not in the draft. Publishing hides it: shops on it keep it, nobody new can pick it.
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={() => setEditing('new')}>+ New plan</button>
          {dirty > 0 && <button className="btn btn-ghost" onClick={() => setDiscarding(true)}>Discard draft</button>}
          <span style={{ flex: 1 }} />
          {canPublish
            ? <button className="btn btn-primary" disabled={dirty === 0 || pending} onClick={() => setPublishing(true)}>Publish {dirty > 0 ? `${dirty} change${dirty > 1 ? 's' : ''}` : ''}</button>
            : <span style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>Publishing needs a person with the Publish switch.</span>}
        </div>
      </Section>

      <Section title="Live now" note="What the Doka app's Subscription page and business.getzogal.com/doka show.">
        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          {live.filter((p) => p.is_visible).map((p) => <div key={p.id}><b>{p.name}</b> <span className="tabular">{naira(p.price_monthly)}/mo</span> <span style={{ color: 'var(--app-text-muted)' }}>· {summary(features, p.entitlements)}</span></div>)}
          {live.filter((p) => p.is_visible).length === 0 && <span style={{ color: 'var(--app-text-muted)' }}>Nothing live — shops fall back to everything on, unlimited.</span>}
        </div>
      </Section>

      {editing && <PlanForm plan={editing === 'new' ? null : editing} nextOrder={draft.length} onClose={(saved) => { setEditing(null); if (saved) refresh() }} />}

      <ConfirmDialog open={publishing} wide title="Publish these plans?" tone="normal" busy={pending} confirmLabel="Publish — go live"
        body={<div style={{ display: 'grid', gap: 10 }}>
          <p style={{ margin: 0 }}>Every shop&apos;s Subscription page and the Doka page on the site change now. Limits apply immediately: a shop over a new limit cannot add terminals or staff until it upgrades (nothing already in use is removed).</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{changed.map((p) => <li key={p.id}>{p.name}: {liveById.get(p.id) ? 'changed' : 'new'}</li>)}{dropped.map((p) => <li key={p.id}>{p.name}: hidden</li>)}</ul>
          <input className="ops-input" placeholder="Note for the history (optional) — e.g. Raised Standard to ₦7,500" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>}
        onConfirm={() => start(async () => { const r = await publishPlans(note); if (r.ok) { toast.success(`Published — version ${(r.data as { version: number }).version}`); setNote(''); setPublishing(false); refresh() } else toast.error(r.error) })}
        onCancel={() => setPublishing(false)} />

      <ConfirmDialog open={discarding} title="Discard the draft?" tone="danger" busy={pending} confirmLabel="Discard"
        body="Every unpublished change goes. The draft becomes a copy of what is live."
        onConfirm={() => start(async () => { const r = await discardPlanDrafts(); if (r.ok) { toast.success('Draft reset to live'); setDiscarding(false); refresh() } else toast.error(r.error) })}
        onCancel={() => setDiscarding(false)} />
    </>
  )
}

function fingerprint(p: PlanRow): string {
  return JSON.stringify([p.key, p.name, p.tagline ?? '', Number(p.price_monthly), p.price_yearly === null ? null : Number(p.price_yearly), p.entitlements ?? {}, p.highlight, p.is_visible, p.sort_order])
}

/** Per-feature editor row state: quantity kept as typed so the box can be empty (= unlimited). */
type EntDraft = { enabled: boolean; quantity: string; period: 'day' | 'week' | 'month' | 'year' }

function PlanForm({ plan, nextOrder, onClose }: { plan: PlanRow | null; nextOrder: number; onClose: (saved: boolean) => void }) {
  const features = [...useTable<Feature>('feature_catalogue')].filter((f) => f.product === 'doka').sort((a, b) => a.sort_order - b.sort_order)
  const [f, setF] = useState({
    key: plan?.key ?? '', name: plan?.name ?? '', tagline: plan?.tagline ?? '',
    monthly: plan ? String(plan.price_monthly) : '', yearly: plan?.price_yearly != null ? String(plan.price_yearly) : '',
    highlight: plan?.highlight ?? false, visible: plan?.is_visible ?? true, order: String(plan?.sort_order ?? nextOrder),
  })
  const [ents, setEnts] = useState<Record<string, EntDraft>>(() => Object.fromEntries(features.map((ft) => {
    const e = entOf(plan?.entitlements, ft.key)
    return [ft.key, { enabled: e.enabled, quantity: e.quantity == null ? '' : String(e.quantity), period: e.period ?? 'month' }]
  })))
  const [pending, start] = useTransition()
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }))
  const setEnt = (key: string, patch: Partial<EntDraft>) => setEnts((s) => ({ ...s, [key]: { ...(s[key] ?? { enabled: true, quantity: '', period: 'month' }), ...patch } }))
  const toEntitlements = (): Entitlements => Object.fromEntries(features.map((ft) => {
    const d = ents[ft.key] ?? { enabled: true, quantity: '', period: 'month' }
    return [ft.key, {
      enabled: d.enabled,
      quantity: ft.kind === 'toggle' || d.quantity.trim() === '' ? null : Number(d.quantity),
      period: ft.kind === 'quota' ? d.period : null,
    }]
  }))
  const submit = () => start(async () => {
    const r = await savePlanDraft({
      ...(plan ? { id: plan.id } : {}), key: f.key.trim(), name: f.name, tagline: f.tagline || null,
      price_monthly: Number(f.monthly), price_yearly: f.yearly.trim() === '' ? null : Number(f.yearly),
      entitlements: toEntitlements(),
      highlight: f.highlight, is_visible: f.visible, sort_order: Number(f.order) || 0,
    })
    if (r.ok) { toast.success('Saved to draft'); onClose(true) } else toast.error(r.error)
  })
  const preview = features.map((ft) => { const e = entOf(toEntitlements(), ft.key); return e.enabled ? label(ft, e) : null }).filter(Boolean)
  const row = (label: string, help: string, input: React.ReactNode) => (
    <label style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 12, alignItems: 'start', fontSize: 13 }}>
      <span><b>{label}</b><div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{help}</div></span>{input}
    </label>
  )
  return (
    <ConfirmDialog open wide title={plan ? `Edit ${plan.name}` : 'New plan'} confirmLabel={pending ? 'Saving…' : 'Save to draft'} busy={pending} onConfirm={submit} onCancel={() => onClose(false)}
      body={<div style={{ display: 'grid', gap: 10 }}>
        {row('Key', 'Never shown to shops; subscriptions name it. Cannot change once shops are on it.', <input className="ops-input" value={f.key} disabled={!!plan} onChange={(e) => set('key', e.target.value.toLowerCase())} placeholder="standard" />)}
        {row('Name', 'What shops see.', <input className="ops-input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Standard" />)}
        {row('Tagline', 'One line under the name.', <input className="ops-input" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="For one shop with a few computers" />)}
        {row('Price per month', 'Naira. 0 = free.', <input className="ops-input" inputMode="decimal" value={f.monthly} onChange={(e) => set('monthly', e.target.value)} placeholder="5000" />)}
        {row('Price per year', 'Naira. Empty = no yearly option.', <input className="ops-input" inputMode="decimal" value={f.yearly} onChange={(e) => set('yearly', e.target.value)} placeholder="50000" />)}
        <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <b>What this plan includes</b>
          <div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>Every feature Doka can gate. Switch it off, or set how many — empty means unlimited. Enforced by the server and, through the signed token, on terminals even when they are offline.</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {features.map((ft) => {
              const d = ents[ft.key] ?? { enabled: true, quantity: '', period: 'month' as const }
              return (
                <div key={ft.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
                  <input type="checkbox" checked={d.enabled} onChange={(e) => setEnt(ft.key, { enabled: e.target.checked })} aria-label={`${ft.name} included`} />
                  <span><b>{ft.name}</b><div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{ft.description}</div></span>
                  {ft.kind !== 'toggle' && d.enabled && (
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <input className="ops-input" inputMode="numeric" style={{ width: 80 }} value={d.quantity} onChange={(e) => setEnt(ft.key, { quantity: e.target.value })} placeholder="∞" aria-label={`${ft.name} limit`} />
                      <span style={{ color: 'var(--app-text-muted)' }}>{ft.unit}</span>
                      {ft.kind === 'quota' && (
                        <select className="ops-input" value={d.period} onChange={(e) => setEnt(ft.key, { period: e.target.value as EntDraft['period'] })} aria-label={`${ft.name} period`}>
                          {PERIODS.map((p) => <option key={p} value={p}>per {p}</option>)}
                        </select>
                      )}
                    </span>
                  )}
                  {(ft.kind === 'toggle' || !d.enabled) && <span style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{d.enabled ? 'included' : 'not included'}</span>}
                </div>
              )
            })}
            {features.length === 0 && <span style={{ color: 'var(--app-text-muted)' }}>Feature catalogue not loaded — has migration 0027 been applied?</span>}
          </div>
        </div>
        {row('Shown as', 'The plan’s bullet list on the site and in the app — generated from the switches above.', <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>{preview.length ? preview.join(' · ') : '—'}</div>)}
        {row('Order', 'Lower shows first.', <input className="ops-input" inputMode="numeric" style={{ width: 80 }} value={f.order} onChange={(e) => set('order', e.target.value)} />)}
        <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.highlight} onChange={(e) => set('highlight', e.target.checked)} /> Recommended (highlighted)</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={f.visible} onChange={(e) => set('visible', e.target.checked)} /> Visible to shops</label>
        </div>
      </div>} />
  )
}
