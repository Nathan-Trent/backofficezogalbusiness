'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ops/Switch'
import { setNotify } from '@/app/actions/notify'
import type { EventDef } from '@/lib/notify'

type Row = { staff_id: string; event: string; email: boolean; bell: boolean }

export function NotifyGrid({ staff, events, rows }: { staff: { id: string; email: string; name: string | null; role: string }[]; events: EventDef[]; rows: Row[] }) {
  const [state, setState] = useState<Row[]>(rows)
  const [pending, start] = useTransition()
  const get = (s: string, e: string): Row => state.find((r) => r.staff_id === s && r.event === e) ?? { staff_id: s, event: e, email: false, bell: false }
  const set = (s: string, e: string, ch: 'email' | 'bell', on: boolean) => {
    setState((prev) => { const rest = prev.filter((r) => !(r.staff_id === s && r.event === e)); return [...rest, { ...get(s, e), [ch]: on }] })
    start(async () => { const r = await setNotify(s, e, ch, on); if (!r.ok) toast.error(r.error) })
  }
  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: 'var(--app-text-muted)', background: 'var(--surface-sunken)' }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>Event</th>
            {staff.map((s) => (
              <th key={s.id} style={{ ...th, textAlign: 'center' }}>
                {s.name ?? s.email}
                <div style={{ fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>bell · email</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.key} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '10px 12px', minWidth: 260 }}>
                <div style={{ fontWeight: 600 }}>{e.label}</div>
                <div style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{e.help}</div>
              </td>
              {staff.map((s) => {
                const r = get(s.id, e.key)
                return (
                  <td key={s.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', gap: 8 }}>
                      <Switch on={r.bell} busy={pending} onChange={(on) => set(s.id, e.key, 'bell', on)} label={`${s.email} bell ${e.label}`} />
                      <Switch on={r.email} busy={pending} onChange={(on) => set(s.id, e.key, 'email', on)} label={`${s.email} email ${e.label}`} />
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
