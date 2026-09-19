'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { clearSecret, setSecret } from '@/app/actions/secrets'

export interface SecretView { key: string; description: string | null; isSet: boolean; updated_at: string; fromEnv: boolean }

/**
 * Keys are write-only. A row shows "Set" or "Not set", never the value —
 * the value cannot be read back even by Root (Nielsen: recognition of state;
 * security: nothing to shoulder-surf). Replacing needs a fresh paste;
 * clearing asks first because the feature stops the moment it is empty.
 */
export function SecretRows({ product, secrets }: { product: string; secrets: SecretView[] }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {secrets.map((s) => <SecretRow key={s.key} product={product} s={s} />)}
      {secrets.length === 0 && <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>No keys defined for this product yet.</p>}
    </div>
  )
}

function SecretRow({ product, s }: { product: string; s: SecretView }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [pending, start] = useTransition()
  const save = () => start(async () => {
    const r = await setSecret({ product, key: s.key, value })
    if (r.ok) { toast.success(`${s.key} saved`); setValue(''); setEditing(false) } else toast.error(r.error)
  })
  const clear = () => start(async () => {
    const r = await clearSecret({ product, key: s.key })
    if (r.ok) toast.success(`${s.key} cleared`); else toast.error(r.error)
    setConfirmClear(false)
  })
  const state = s.isSet ? { label: 'Set', colour: 'var(--status-on-track-fg)' } : s.fromEnv ? { label: 'From server env', colour: 'var(--status-approaching-fg)' } : { label: 'Not set', colour: 'var(--status-critical-fg)' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <code style={{ fontWeight: 700 }}>{s.key}</code>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: state.colour }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: 'currentColor' }} />{state.label}</span>
        </div>
        <div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{s.description}{s.isSet && <> · changed {new Date(s.updated_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos' })}</>}</div>
        {editing && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input className="ops-input" type="password" autoComplete="off" spellCheck={false} placeholder="Paste the key" value={value} autoFocus onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) save(); if (e.key === 'Escape') { setEditing(false); setValue('') } }} />
            <button className="btn btn-primary btn-sm" disabled={pending || !value.trim()} onClick={save}>{pending ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { setEditing(false); setValue('') }}>Cancel</button>
          </div>
        )}
      </div>
      {!editing && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>{s.isSet ? 'Replace' : 'Set'}</button>
          {s.isSet && <button className="btn btn-danger btn-sm" onClick={() => setConfirmClear(true)}>Clear</button>}
        </div>
      )}
      <ConfirmDialog open={confirmClear} title={`Clear ${s.key}?`} body="Whatever uses this key stops working the moment it is empty. You can paste a new one any time." confirmLabel="Clear the key" tone="danger" busy={pending} onConfirm={clear} onCancel={() => setConfirmClear(false)} />
    </div>
  )
}
