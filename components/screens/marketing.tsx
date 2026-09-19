'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useCan, useOps, useTable } from '@/lib/store/OpsStore'
import { byNewest, useStaffByUserId } from '@/lib/store/selectors'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { useAct } from '@/lib/act'
import { PAGES, defaultsFor, type Field, type PageSchema } from '@/lib/content-schema'
import { discardContentDraft, publishContent, replyContact, saveContentDraft, setContactStatus } from '@/app/actions/marketing'

type Row = { page: string; key: string; value: unknown; updated_at: string }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const SITE = 'https://business.getzogal.com'

/**
 * A page's copy. Every field shows its DRAFT; a field whose draft differs
 * from LIVE is marked. Save changes the draft only; Publish makes the page
 * change on the site within seconds.
 */
export function SitePage({ page }: { page: string }) {
  const schema = PAGES.find((p) => p.page === page)
  const can = useCan()
  const live = useTable<Row>('site_content'), draft = useTable<Row>('site_content_draft')
  const pubs = useTable<{ page: string; version: number; published_at: string; note: string | null; published_by: string | null }>('site_publish')
  const staff = useStaffByUserId()
  const { busy, run } = useAct()
  const [publishing, setPublishing] = useState(false), [discarding, setDiscarding] = useState(false), [note, setNote] = useState('')
  const defaults = useMemo(() => (schema ? defaultsFor(schema) : {}), [schema])
  const liveMap = useMemo(() => new Map(live.filter((r) => r.page === page).map((r) => [r.key, r.value])), [live, page])
  const draftMap = useMemo(() => new Map(draft.filter((r) => r.page === page).map((r) => [r.key, r.value])), [draft, page])
  if (!schema) return <PageTitle title="No such page" />
  const liveOf = (k: string) => (liveMap.has(k) ? liveMap.get(k) : defaults[k])
  const draftOf = (k: string) => (draftMap.has(k) ? draftMap.get(k) : liveOf(k))
  const fields = schema.sections.flatMap((s) => s.fields)
  const changed = fields.filter((f) => !same(draftOf(f.key), liveOf(f.key)))
  const history = pubs.filter((p) => p.page === page).sort((a, b) => b.version - a.version)
  const canPublish = can(page === 'home' ? 'marketing.publish' : `marketing.${page}.publish`)
  const canEdit = can(page === 'home' ? 'marketing.edit' : `marketing.${page}.edit`)
  const url = page === 'home' ? SITE : `${SITE}/${page}`
  return (
    <>
      <PageTitle title={schema.title} subtitle={`${url} · ${history[0] ? `live version ${history[0].version}, published ${when(history[0].published_at)}` : 'never published from here — the site shows its built-in copy'}`} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface)', border: `1px solid ${changed.length ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-md)', fontSize: 13 }}>
        <span style={{ flex: 1 }}>{changed.length ? <><b>{changed.length}</b> change{changed.length > 1 ? 's' : ''} in the draft, not yet on the site.</> : 'Draft matches the live site.'}</span>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open the live page ↗</a>
        {changed.length > 0 && canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setDiscarding(true)}>Discard draft</button>}
        {canPublish ? <button className="btn btn-primary btn-sm" disabled={!changed.length || busy} onClick={() => setPublishing(true)}>Publish {changed.length || ''}</button> : <span style={{ color: 'var(--app-text-muted)' }}>Publishing needs the Publish switch.</span>}
      </div>
      {schema.sections.map((sec, i) => (
        <Section key={sec.title} title={sec.title} first={i === 0}>
          <div style={{ display: 'grid', gap: 10 }}>
            {sec.fields.map((f) => <FieldEditor key={f.key} page={page} field={f} draft={draftOf(f.key)} live={liveOf(f.key)} canEdit={canEdit} />)}
          </div>
        </Section>
      ))}
      <Section title="Publish history">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {history.map((p) => <li key={p.version}><b>v{p.version}</b> · <span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(p.published_at)}</span> · {(p.published_by && staff.get(p.published_by)?.name) ?? 'staff'}{p.note ? ` — ${p.note}` : ''}</li>)}
          {history.length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>None yet.</li>}
        </ul>
      </Section>
      <ConfirmDialog open={publishing} wide title={`Publish the ${schema.title.toLowerCase()}?`} confirmLabel={busy ? 'Publishing…' : 'Publish — go live'} busy={busy} onCancel={() => setPublishing(false)}
        body={<div style={{ display: 'grid', gap: 10 }}><p style={{ margin: 0 }}>The live page changes within seconds. Nothing else on the site is touched.</p><ul style={{ margin: 0, paddingLeft: 18 }}>{changed.map((f) => <li key={f.key}>{f.label}</li>)}</ul><input className="ops-input" placeholder="Note for the history (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></div>}
        onConfirm={async () => { const r = await run(() => publishContent({ page, note }), (d) => `Published — version ${(d as { version: number }).version}`); if (r.ok) { setPublishing(false); setNote('') } }} />
      <ConfirmDialog open={discarding} title="Discard the draft?" tone="danger" confirmLabel="Discard" busy={busy} onCancel={() => setDiscarding(false)} body="Every unpublished change on this page goes. The draft becomes a copy of what is live."
        onConfirm={async () => { const r = await run(() => discardContentDraft(page), 'Draft reset to live'); if (r.ok) setDiscarding(false) }} />
    </>
  )
}

/** One field. Edits are local until Save; the pushed draft row wins after that. */
function FieldEditor({ page, field, draft, live, canEdit }: { page: string; field: Field; draft: unknown; live: unknown; canEdit: boolean }) {
  const [v, setV] = useState<unknown>(draft)
  useEffect(() => setV(draft), [draft])
  const { busy, run } = useAct()
  const dirty = !same(v, draft), pending = !same(draft, live)
  const save = () => void run(() => saveContentDraft({ page, key: field.key, value: v }), 'Saved to draft')
  return (
    <div style={{ padding: '10px 14px', background: 'var(--surface)', border: `1px solid ${pending ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-md)', fontSize: 13, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b>{field.label}</b>
        {pending && <span className="pill pill-warn">not yet live</span>}
        {field.help && <span style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{field.help}</span>}
        <span style={{ flex: 1 }} />
        {dirty && canEdit && <><button className="btn btn-primary btn-sm" data-busy={busy} disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save to draft'}</button><button className="btn btn-ghost btn-sm" onClick={() => setV(draft)}>Undo</button></>}
      </div>
      <Input field={field} value={v} onChange={setV} disabled={!canEdit} />
    </div>
  )
}

function Input({ field, value, onChange, disabled }: { field: Field; value: unknown; onChange: (v: unknown) => void; disabled: boolean }) {
  if (field.kind === 'text') return <input className="ops-input" value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  if (field.kind === 'long') return <textarea className="ops-input" style={{ minHeight: 80 }} value={String(value ?? '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  if (field.kind === 'list') {
    const items = Array.isArray(value) ? (value as string[]) : []
    return <textarea className="ops-input" style={{ minHeight: 80 }} placeholder="One per line" value={items.join('\n')} disabled={disabled} onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trimEnd()).filter((s, i, a) => s || i < a.length - 1))} />
  }
  const cols = field.kind === 'pairs' ? 2 : 3
  const rows = Array.isArray(value) ? (value as string[][]) : []
  const set = (r: number, c: number, s: string) => onChange(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? s : x)) : row)))
  const heads = field.kind === 'pairs' ? ['Title', 'Text'] : ['Left', 'Middle', 'Right']
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: cols === 2 ? '220px 1fr auto' : '90px 1fr 140px auto', gap: 6, alignItems: 'start' }}>
          {row.slice(0, cols).map((cell, c) => c === 1 && cols === 2
            ? <textarea key={c} className="ops-input" style={{ minHeight: 56 }} placeholder={heads[c]} value={cell} disabled={disabled} onChange={(e) => set(r, c, e.target.value)} />
            : <input key={c} className="ops-input" placeholder={heads[c]} value={cell} disabled={disabled} onChange={(e) => set(r, c, e.target.value)} />)}
          {!disabled && <button type="button" className="btn btn-ghost btn-sm" title="Remove this row" onClick={() => onChange(rows.filter((_, i) => i !== r))}>×</button>}
        </div>
      ))}
      {!disabled && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([...rows, Array(cols).fill('')])}>+ Add row</button></div>}
    </div>
  )
}

// ---- Inbox --------------------------------------------------------------------

type Contact = { id: string; name: string; email: string; phone: string | null; message: string; source: string; product: string | null; status: 'new' | 'answered' | 'archived'; reply: string | null; answered_by: string | null; answered_at: string | null; created_at: string }

export function Inbox() {
  const rows = useTable<Contact>('contact_messages')
  const staff = useStaffByUserId()
  const [filter, setFilter] = useState<'new' | 'answered' | 'archived'>('new')
  const [open, setOpen] = useState<Contact | null>(null)
  const list = useMemo(() => rows.filter((r) => r.status === filter).sort(byNewest), [rows, filter])
  const counts = { new: rows.filter((r) => r.status === 'new').length, answered: rows.filter((r) => r.status === 'answered').length, archived: rows.filter((r) => r.status === 'archived').length }
  return (
    <>
      <PageTitle title="Inbox" subtitle="Messages from the site's contact form. A reply goes by email wearing the identity of the page it came from, and the message is marked answered." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['new', 'answered', 'archived'] as const).map((s) => <button key={s} type="button" className={`pill ${filter === s ? 'pill-good' : 'pill-plain'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => setFilter(s)}>{s} · {counts[s]}</button>)}
      </div>
      <OpsTable headers={['When', 'From', 'Message', 'Page', '']} empty={filter === 'new' ? 'Nothing waiting.' : 'None.'}>
        {list.map((m) => (
          <tr key={m.id}>
            <Td mono nowrap>{when(m.created_at)}</Td>
            <Td nowrap><b>{m.name}</b><div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{m.email}{m.phone ? ` · ${m.phone}` : ''}</div></Td>
            <Td><div style={{ maxWidth: 520, whiteSpace: 'pre-wrap' }}>{m.message.length > 220 ? `${m.message.slice(0, 220)}…` : m.message}</div>{m.status === 'answered' && <div style={{ fontSize: 12, color: 'var(--app-text-muted)', marginTop: 4 }}>Answered {m.answered_at ? when(m.answered_at) : ''} by {(m.answered_by && staff.get(m.answered_by)?.name) ?? 'staff'}</div>}</Td>
            <Td><span className="pill pill-plain">{m.product ?? m.source}</span></Td>
            <Td><button className="btn btn-primary btn-sm" onClick={() => setOpen(m)}>{m.status === 'new' ? 'Reply' : 'Open'}</button></Td>
          </tr>
        ))}
      </OpsTable>
      {open && <ReplyDialog m={rows.find((r) => r.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </>
  )
}

function ReplyDialog({ m, onClose }: { m: Contact; onClose: () => void }) {
  const { operator } = useOps()
  const [reply, setReply] = useState(m.reply ?? `Hi ${m.name.split(' ')[0]},\n\n`)
  const { busy, run } = useAct()
  const identity = m.product ?? 'business'
  return (
    <ConfirmDialog open wide title={`${m.name} · ${m.email}`} confirmLabel={m.status === 'answered' ? 'Send another reply' : busy ? 'Sending…' : 'Send reply'} busy={busy} onCancel={onClose}
      onConfirm={async () => { const r = await run(() => replyContact({ id: m.id, reply }), 'Reply is on its way'); if (r.ok) onClose() }}
      body={<div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        <div style={{ padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', whiteSpace: 'pre-wrap' }}>{m.message}</div>
        <div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>From the {m.source} page · {when(m.created_at)}{m.phone ? ` · ${m.phone}` : ''}. Your reply goes as <b>{identity === 'business' ? 'Zogal Business' : 'Doka by Zogal'}</b>, signed {operator.name ?? operator.email}.</div>
        {m.status === 'answered' && m.reply && <div style={{ padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-sm)', whiteSpace: 'pre-wrap' }}><b>Previous reply</b><br />{m.reply}</div>}
        <textarea className="ops-input" style={{ minHeight: 140 }} value={reply} onChange={(e) => setReply(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          {m.status !== 'archived' ? <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const r = await setContactStatus({ id: m.id, status: 'archived' }); if (r.ok) { toast.success('Archived'); onClose() } else toast.error(r.error) }}>Archive without replying</button>
            : <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const r = await setContactStatus({ id: m.id, status: 'new' }); if (r.ok) { toast.success('Back in New'); onClose() } else toast.error(r.error) }}>Move back to New</button>}
        </div>
      </div>} />
  )
}

export type { PageSchema }
