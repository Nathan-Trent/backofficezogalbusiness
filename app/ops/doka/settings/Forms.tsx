'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ops/Switch'
import { patchOperationalSettings, setPlatformSetting } from '@/app/actions/doka'

export function PlatformSettingRow({ setting }: { setting: { key: string; value: unknown; description: string; updated_at: string } }) {
  const isBool = typeof setting.value === 'boolean'
  const shown = typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value)
  const [draft, setDraft] = useState(shown)
  const [pending, start] = useTransition()
  const save = (value: unknown) => start(async () => { const r = await setPlatformSetting(setting.key, value); if (r.ok) toast.success(`${setting.key} saved`); else toast.error(r.error) })
  const parse = (raw: string): unknown => { try { return JSON.parse(raw) } catch { return raw } }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
      <div><code style={{ fontWeight: 700 }}>{setting.key}</code><div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{setting.description}</div></div>
      {isBool ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}><span style={{ color: 'var(--app-text-muted)' }}>{setting.value ? 'On' : 'Off'}</span><Switch on={setting.value as boolean} busy={pending} onChange={(on) => save(on)} label={setting.key} /></div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="ops-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(parse(draft)) }} />
          <button className="btn btn-primary btn-sm" disabled={pending || draft === shown} onClick={() => save(parse(draft))}>Save</button>
        </div>
      )}
    </div>
  )
}

export function OpsSettingsForm({ fields, settings, updatedAt }: { fields: { key: string; label: string; help: string; unit: string }[]; settings: Record<string, number>; updatedAt: string }) {
  const [draft, setDraft] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, String(settings[f.key] ?? '')])))
  const [pending, start] = useTransition()
  const changed = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== '' && String(settings[k]) !== v).map(([k, v]) => [k, Number(v)]))
  const n = Object.keys(changed).length
  const invalid = Object.values(changed).some((v) => !Number.isFinite(v) || v < 0)
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 720 }}>
      {fields.map((f) => (
        <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
          <div><div style={{ fontWeight: 600 }}>{f.label}</div><div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{f.help}</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input className="ops-input" style={{ width: 80 }} inputMode="numeric" value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} /><span style={{ color: 'var(--app-text-muted)' }}>{f.unit}</span></div>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" disabled={pending || invalid || n === 0} onClick={() => start(async () => { const r = await patchOperationalSettings(changed); if (r.ok) toast.success('Saved — terminals receive it on next sync'); else toast.error(r.error) })}>{pending ? 'Saving…' : n ? `Save ${n}` : 'Save'}</button>
        <span style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>Last changed {new Date(updatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })}</span>
      </div>
    </div>
  )
}
