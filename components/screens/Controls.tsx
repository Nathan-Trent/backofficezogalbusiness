'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ops/ConfirmDialog'
import { impersonate, revokeTerminal, sendMessage, setShopActive, setSubscription } from '@/app/actions/doka'

/** The actions on a Doka user or shop. Each says what it will do before it does it. */

export function MessageButton({ userId, shopId, label = 'Message' }: { userId?: string; shopId?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState(''); const [body, setBody] = useState('')
  const [email, setEmail] = useState(true); const [inApp, setInApp] = useState(true)
  const [pending, start] = useTransition()
  const channels = [email && 'email', inApp && 'in_app'].filter(Boolean) as ('email' | 'in_app')[]
  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>{label}</button>
      <ConfirmDialog open={open} wide title={label} confirmLabel={pending ? 'Sending…' : 'Send'} busy={pending || !subject.trim() || !body.trim() || channels.length === 0} onCancel={() => setOpen(false)}
        onConfirm={() => start(async () => {
          const r = await sendMessage({ ...(userId ? { toUserId: userId } : {}), ...(shopId ? { toShopId: shopId } : {}), channels, subject, body })
          if (r.ok) { toast.success('Sent, on behalf of Doka'); setOpen(false); setSubject(''); setBody('') } else toast.error(r.error)
        })}
        body={
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--app-text-muted)' }}>Goes out as <b>Doka by Zogal</b>. Email uses the Doka template; in-app shows next time they open Doka.</p>
            <input className="ops-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <textarea className="ops-input" placeholder="Write plainly. Blank line between paragraphs." value={body} onChange={(e) => setBody(e.target.value)} />
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={inApp} onChange={(e) => setInApp(e.target.checked)} /> In the app</label>
            </div>
          </div>
        } />
    </>
  )
}

export function ImpersonateButton({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Sign in as {name}</button>
      <ConfirmDialog open={open} tone="danger" title={`Sign in as ${name}?`} confirmLabel={pending ? 'Opening…' : 'Sign in as them'} busy={pending || reason.trim().length < 5} onCancel={() => setOpen(false)}
        onConfirm={() => start(async () => {
          const r = await impersonate({ userId, reason })
          if (r.ok) { window.open((r.data as { url: string }).url, '_blank'); setOpen(false); setReason(''); toast.success('Opened in a new tab. 30 minutes, logged.') } else toast.error(r.error)
        })}
        body={
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0, fontSize: 13 }}>You will see Doka exactly as they see it, for 30 minutes. They are not told. This is written to the activity log with your name and this reason, and Who-is-told sends it out. Money actions are blocked while you are them.</p>
            <input className="ops-input" placeholder="Why? (e.g. 'reported stock count wrong, ticket 42')" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        } />
    </>
  )
}

export function RevokeButton({ deviceId, name }: { deviceId: string; name: string }) {
  const [open, setOpen] = useState(false); const [pending, start] = useTransition()
  return (
    <>
      <button className="btn btn-danger btn-sm" onClick={() => setOpen(true)}>Revoke</button>
      <ConfirmDialog open={open} tone="danger" title={`Revoke "${name}"?`} confirmLabel="Revoke terminal" busy={pending} onCancel={() => setOpen(false)}
        body="That computer stops being able to record sales until the owner activates it again with a new code. Past sales are kept."
        onConfirm={() => start(async () => { const r = await revokeTerminal(deviceId); setOpen(false); if (r.ok) toast.success('Revoked'); else toast.error(r.error) })} />
    </>
  )
}

export function ShopActiveButton({ shopId, active, name }: { shopId: string; active: boolean; name: string }) {
  const [open, setOpen] = useState(false); const [pending, start] = useTransition()
  return (
    <>
      <button className={`btn btn-sm ${active ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setOpen(true)}>{active ? 'Deactivate shop' : 'Reactivate shop'}</button>
      <ConfirmDialog open={open} tone={active ? 'danger' : 'normal'} title={`${active ? 'Deactivate' : 'Reactivate'} ${name}?`} confirmLabel={active ? 'Deactivate' : 'Reactivate'} busy={pending} onCancel={() => setOpen(false)}
        body={active ? 'Nobody at this shop can sign in until it is reactivated. Nothing is deleted.' : 'Everyone at this shop can sign in again.'}
        onConfirm={() => start(async () => { const r = await setShopActive(shopId, !active); setOpen(false); if (r.ok) toast.success('Done'); else toast.error(r.error) })} />
    </>
  )
}

export function SubscriptionEditor({ shopId, current }: { shopId: string; current: { status: string; plan: string; expires_at: string | null } | null }) {
  const [status, setStatus] = useState<'active' | 'past_due' | 'cancelled'>((current?.status as 'active') ?? 'active')
  const [plan, setPlan] = useState(current?.plan ?? 'standard')
  const [expires, setExpires] = useState(current?.expires_at ? current.expires_at.slice(0, 10) : '')
  const [pending, start] = useTransition()
  const extend = (days: number) => { const base = expires && Date.parse(expires) > Date.now() ? new Date(expires) : new Date(); base.setDate(base.getDate() + days); setExpires(base.toISOString().slice(0, 10)) }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="ops-input" style={{ width: 130 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option></select>
      <input className="ops-input" style={{ width: 130 }} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="plan key" />
      <input className="ops-input" style={{ width: 160 }} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => extend(30)}>+30d</button>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => extend(365)}>+1y</button>
      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpires('')}>No expiry</button>
      <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
        const r = await setSubscription({ shopId, status, plan, expiresAt: expires ? new Date(expires + 'T23:59:59').toISOString() : null })
        if (r.ok) toast.success('Subscription saved — terminals pick it up on next sync'); else toast.error(r.error)
      })}>{pending ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
