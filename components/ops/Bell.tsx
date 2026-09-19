'use client'

import { useState } from 'react'
import { IconBell } from '@tabler/icons-react'
import { A } from '@/lib/nav'
import { useOps, useTable } from '@/lib/store/OpsStore'

type Item = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

/** The bell: what Who-is-told delivered to this person. Rows arrive by push; marking read is the operator's own row (RLS). */
export function Bell() {
  const { supabase } = useOps()
  const items = useTable<Item>('ops_notifications').sort((a, b) => b.created_at.localeCompare(a.created_at))
  const unread = items.filter((i) => !i.read_at).length
  const [open, setOpen] = useState(false)
  const markRead = () => { void supabase.from('ops_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null) }
  return (
    <span style={{ position: 'relative' }}>
      <button type="button" onClick={() => { setOpen((o) => !o); if (!open && unread) markRead() }} aria-label="Notifications"
        style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 999, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--app-text-primary)', cursor: 'pointer' }}>
        <IconBell size={18} />
        {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--accent)', color: 'var(--btn-primary-fg)', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 44, width: 340, maxHeight: 420, overflowY: 'auto', background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', boxShadow: '0 12px 32px rgba(0,0,0,.4)', zIndex: 50 }}>
          {items.length === 0 ? <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--app-text-muted)' }}>Nothing yet.</p> : items.map((n) => (
            <A key={n.id} href={n.link ?? '#'} onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', textDecoration: 'none', opacity: n.read_at ? 0.6 : 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12.5, color: 'var(--app-text-muted)', marginTop: 2 }}>{n.body}</div>}
              <div style={{ fontSize: 11, color: 'var(--app-text-tertiary)', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
            </A>
          ))}
        </div>
      )}
    </span>
  )
}
