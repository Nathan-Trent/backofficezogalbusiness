'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CAPABILITIES, GROUP_LABELS } from '@/lib/auth/capabilities'
import { Switch } from '@/components/ops/Switch'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { inviteStaff, setStaffActive, setStaffCapabilities } from '@/app/actions/staff'

type Row = { id: string; email: string; name: string | null; role: 'root' | 'staff'; capabilities: string[]; invited_at: string; accepted_at: string | null; deactivated_at: string | null }

const groups = [...new Set(CAPABILITIES.map((c) => c.group))]

function CapGrid({ value, onChange, disabled }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean }) {
  const toggle = (key: string, on: boolean) => onChange(on ? [...new Set([...value, key])] : value.filter((k) => k !== key))
  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      {groups.map((g) => (
        <div key={g} style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>{GROUP_LABELS[g] ?? g}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {CAPABILITIES.filter((c) => c.group === g).map((c) => (
              <label key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <Switch on={value.includes(c.key)} busy={disabled} onChange={(on) => toggle(c.key, on)} label={c.label} />
                <span style={{ flex: 1 }}>{c.label}{c.sensitive && <span className="pill pill-warn" style={{ marginLeft: 8 }}>sensitive</span>}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function InviteForm() {
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [caps, setCaps] = useState<string[]>([])
  const [open, setOpen] = useState(false); const [pending, start] = useTransition()
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 16, display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>Email<input className="ops-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@getzogal.com" /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>Name<input className="ops-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn btn-ghost" type="button" onClick={() => setOpen((o) => !o)}>{open ? 'Hide switches' : `Switches (${caps.length})`}</button>
      </div>
      {open && <CapGrid value={caps} onChange={setCaps} />}
      <div>
        <button className="btn btn-primary" disabled={pending || !email} onClick={() => start(async () => {
          const r = await inviteStaff({ email, name, capabilities: caps })
          if (r.ok) { toast.success(`Invite sent to ${email}`); setEmail(''); setName(''); setCaps([]); setOpen(false) } else toast.error(r.error)
        })}>{pending ? 'Sending…' : 'Send invite'}</button>
      </div>
    </div>
  )
}

export function StaffEditor({ row, self }: { row: Row; self: boolean }) {
  const [caps, setCaps] = useState<string[]>(row.capabilities)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify([...caps].sort()) !== JSON.stringify([...row.capabilities].sort())
  const active = !row.deactivated_at
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', padding: 14, opacity: active ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{row.name ?? row.email}{self && <span style={{ color: 'var(--app-text-muted)', fontWeight: 400 }}> · you</span>}</div>
          <div style={{ fontSize: 12.5, color: 'var(--app-text-muted)' }}>{row.email} · {row.role === 'root' ? 'Root — holds everything' : `${row.capabilities.length} switches`} · {row.accepted_at ? 'joined' : 'invited, not yet signed in'}</div>
        </div>
        {!active && <span className="pill pill-bad">Deactivated</span>}
        {row.role !== 'root' && <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>{open ? 'Hide switches' : 'Switches'}</button>}
        {!self && <button className={`btn btn-sm ${active ? 'btn-danger' : 'btn-ghost'}`} disabled={pending} onClick={() => setConfirm(true)}>{active ? 'Deactivate' : 'Reactivate'}</button>}
      </div>
      {open && row.role !== 'root' && (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          <CapGrid value={caps} onChange={setCaps} disabled={pending || !active} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={!dirty || pending} onClick={() => start(async () => { const r = await setStaffCapabilities(row.id, caps); if (r.ok) toast.success('Saved'); else toast.error(r.error) })}>{pending ? 'Saving…' : 'Save switches'}</button>
            {dirty && <button className="btn btn-ghost btn-sm" onClick={() => setCaps(row.capabilities)}>Undo</button>}
          </div>
        </div>
      )}
      <ConfirmDialog open={confirm} title={active ? `Deactivate ${row.name ?? row.email}?` : `Reactivate ${row.name ?? row.email}?`}
        body={active ? 'They lose access to the back office immediately. Their switches are kept, so reactivating restores them as they were.' : 'They regain access with the switches they had.'}
        confirmLabel={active ? 'Deactivate' : 'Reactivate'} tone={active ? 'danger' : 'normal'} busy={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => start(async () => { const r = await setStaffActive(row.id, !active); setConfirm(false); if (r.ok) toast.success('Done'); else toast.error(r.error) })} />
    </div>
  )
}
