'use client'

import { useMemo, useState } from 'react'
import { A } from '@/lib/nav'
import { useOps, useRpc, useTable } from '@/lib/store/OpsStore'
import { byNewest, online, useStaffByUserId, type Audit, type Device, type Job, type Shop, type StaffRow, type Subscription, type Signin, type Conflict, type Message } from '@/lib/store/selectors'
import { OpsTable, PageTitle, Td, when } from '@/components/ops/table'
import { Section, Stat, Stats } from '@/components/ops/layout'
import { SecretRows } from '@/components/ops/SecretRows'
import { StaffEditor, InviteForm } from '@/components/screens/staff'
import { NotifyGrid } from '@/components/screens/notify'
import { EVENTS, GROUP_TITLES } from '@/lib/notify'
import { useSecrets } from '@/components/screens/secrets'

/** Company overview: totals across products, and what happened last. All from memory. */
export function Overview() {
  const shops = useTable<Shop>('shops'), subs = useTable<Subscription>('subscriptions'), staff = useTable<StaffRow>('staff'), audit = useTable<Audit>('ops_audit_log'), signins = useTable<Signin>('signin_events')
  const products = useTable<{ key: string; name: string; colour: string; tagline: string; is_active: boolean }>('products')
  const sales = useRpc<{ total_30d: number; count_24h: number }>('ops_sales_summary', {}, ['shops'])
  const since = Date.now() - 30 * 86_400_000
  const latest = useMemo(() => [...audit].sort(byNewest).slice(0, 8), [audit])
  return (
    <>
      <PageTitle title="Zogal Business" subtitle="The company at a glance. Products have their own pages." />
      <Stats>
        <Stat label="Shops" value={shops.length} note="on Doka" />
        <Stat label="Active subscriptions" value={subs.filter((s) => s.status === 'active').length} tone="good" />
        <Stat label="Sales through Doka, 30 days" value={sales.data ? `₦${Math.round(Number(sales.data.total_30d)).toLocaleString('en-NG')}` : '…'} note="what shops sold, not what Zogal earned" />
        <Stat label="Sign-ins, 30 days" value={signins.filter((s) => Date.parse(s.created_at) >= since).length} />
        <Stat label="Staff" value={staff.filter((s) => !s.deactivated_at).length} href="/ops/staff" />
      </Stats>
      <Section title="Products">
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {products.filter((p) => p.is_active).map((p) => (
            <A key={p.key} href={`/ops/${p.key}`} style={{ display: 'block', padding: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${p.colour}`, borderRadius: 'var(--r-md)', textDecoration: 'none' }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>{p.tagline}</div>
            </A>
          ))}
        </div>
      </Section>
      <Section title="Latest activity" actions={<A href="/ops/audit" style={{ fontSize: 13, color: 'var(--accent)' }}>All activity</A>}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6, fontSize: 13 }}>
          {latest.map((a) => <li key={a.id}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(a.created_at)}</span> · {a.product ? `${a.product} · ` : ''}{a.summary}</li>)}
          {latest.length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>Nothing yet.</li>}
        </ul>
      </Section>
    </>
  )
}

/** Activity: what operators did, one plain line each, filterable by product. */
export function Activity() {
  const audit = useTable<Audit>('ops_audit_log')
  const staffByUser = useStaffByUserId()
  const [product, setProduct] = useState('')
  const rows = useMemo(() => [...audit].sort(byNewest).filter((r) => product === '' ? true : product === 'company' ? r.product === null : r.product === product), [audit, product])
  const chips: [string, string][] = [['', 'All'], ['company', 'Zogal Business'], ['doka', 'Doka']]
  return (
    <>
      <PageTitle title="Activity" subtitle="Every change an operator made, in the words written at the time. New lines appear as they happen." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {chips.map(([v, l]) => <button key={v} type="button" onClick={() => setProduct(v)} className={`pill ${product === v ? 'pill-good' : 'pill-plain'}`} style={{ border: 'none', cursor: 'pointer' }}>{l}</button>)}
      </div>
      <OpsTable headers={['When', 'Who', 'Where', 'What']} empty="Nothing yet.">
        {rows.map((r) => {
          const who = staffByUser.get(r.actor_id)
          return (
            <tr key={r.id}>
              <Td mono nowrap>{when(r.created_at)}</Td>
              <Td nowrap>{who?.name ?? who?.email ?? '—'} <span style={{ color: 'var(--app-text-muted)' }}>· {r.actor_role}</span></Td>
              <Td nowrap>{r.product ?? 'Zogal Business'}</Td>
              <Td>{r.summary} <span style={{ color: 'var(--app-text-tertiary)', fontSize: 11 }}>{r.action}</span></Td>
            </tr>
          )
        })}
      </OpsTable>
    </>
  )
}

/**
 * Health — per FEATURE: is each thing working, when it last worked, what
 * failed. Computed from what is in memory plus two facts from the server.
 * It changes on screen the moment a terminal syncs or a job fails.
 */
export function Health() {
  const { live } = useOps()
  const devices = useTable<Device>('devices'), signins = useTable<Signin>('signin_events'), conflicts = useTable<Conflict>('sync_conflicts'), messages = useTable<Message>('messages'), jobs = useTable<Job>('jobs'), audit = useTable<Audit>('ops_audit_log')
  const facts = useRpc<{ last_sale_at: string | null; last_scan: { status: string; created_at: string; error: string | null } | null; db_now: string }>('ops_health_facts', {}, ['devices'])
  const ago = (iso: string | null | undefined) => (iso ? `${Math.round((Date.now() - Date.parse(iso)) / 60000)} min ago` : 'never')
  const newest = <T,>(rows: T[], key: (r: T) => string | null) => rows.reduce<string | null>((m, r) => { const v = key(r); return v && (!m || v > m) ? v : m }, null)
  const lastSignin = newest(signins, (s) => s.created_at), lastSync = newest(devices.filter((d) => !d.revoked_at), (d) => d.last_sync_at)
  const lastMsg = [...messages].sort(byNewest)[0]
  const failedJobs = jobs.filter((j) => j.status === 'failed' || j.status === 'dead')
  const list: { name: string; ok: boolean | null; note: string }[] = [
    { name: 'Live connection', ok: live === 'live' ? true : live === 'lost' ? false : null, note: live === 'live' ? 'changes arrive as they happen' : live === 'lost' ? 'lost — reconnecting' : 'connecting' },
    { name: 'Database', ok: facts.error ? false : facts.data ? true : null, note: facts.error ?? (facts.data ? 'answering' : 'asking…') },
    { name: 'Sign-in', ok: lastSignin ? Date.now() - Date.parse(lastSignin) < 86_400_000 : null, note: `last sign-in ${ago(lastSignin)}` },
    { name: 'Terminal sync', ok: lastSync ? Date.now() - Date.parse(lastSync) < 15 * 60_000 : null, note: `last heartbeat ${ago(lastSync)} · ${devices.filter(online).length} online now` },
    { name: 'Selling', ok: facts.data?.last_sale_at ? Date.now() - Date.parse(facts.data.last_sale_at) < 86_400_000 : null, note: `last sale ${ago(facts.data?.last_sale_at)}` },
    { name: 'Sync conflicts', ok: conflicts.length < 20, note: `${conflicts.length} unresolved across all shops` },
    { name: 'Notebook scanning', ok: facts.data?.last_scan ? facts.data.last_scan.status !== 'failed' : null, note: facts.data?.last_scan ? `last scan ${facts.data.last_scan.status} ${ago(facts.data.last_scan.created_at)}${facts.data.last_scan.error ? ` — ${facts.data.last_scan.error}` : ''}` : 'no scans yet' },
    { name: 'Email sending', ok: lastMsg ? lastMsg.status !== 'failed' : null, note: lastMsg ? `last message ${lastMsg.status} ${ago(lastMsg.created_at)}${lastMsg.error ? ` — ${lastMsg.error}` : ''}` : 'no messages sent yet' },
    { name: 'Background jobs', ok: failedJobs.length === 0 ? (jobs.length ? true : null) : false, note: jobs.length ? `${jobs.filter((j) => j.status === 'queued').length} queued · ${jobs.filter((j) => j.status === 'done').length} done · ${failedJobs.length} failed` : 'none yet' },
  ]
  const tone = (ok: boolean | null) => (ok === true ? 'pill-good' : ok === false ? 'pill-bad' : 'pill-warn')
  const word = (ok: boolean | null) => (ok === true ? 'Working' : ok === false ? 'Failing' : 'Quiet')
  const failures = useMemo(() => [...audit].filter((a) => /fail/i.test(a.action)).sort(byNewest).slice(0, 10), [audit])
  return (
    <>
      <PageTitle title="Health" subtitle="Each feature: working, quiet, or failing — and when it last worked. Quiet means nothing has used it recently, not that it is broken." />
      <Section title="Features" first>
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map((c) => (
            <div key={c.name} style={{ display: 'grid', gridTemplateColumns: '200px 100px 1fr', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
              <span style={{ fontWeight: 700 }}>{c.name}</span>
              <span className={`pill ${tone(c.ok)}`}>{word(c.ok)}</span>
              <span style={{ color: 'var(--app-text-muted)' }}>{c.note}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Background jobs" note="Emails, publishes, renewals. A failed job retries by itself with growing gaps; dead means it gave up and needs a person.">
        <OpsTable headers={['When', 'Job', 'Status', 'Attempts', 'Next / error']} empty="No jobs yet.">
          {[...jobs].sort(byNewest).slice(0, 40).map((j) => (
            <tr key={j.id}>
              <Td mono nowrap>{when(j.created_at)}</Td>
              <Td>{j.kind}{j.product ? <span style={{ color: 'var(--app-text-muted)' }}> · {j.product}</span> : null}</Td>
              <Td><span className={`pill ${j.status === 'done' ? 'pill-good' : j.status === 'dead' ? 'pill-bad' : j.status === 'failed' ? 'pill-warn' : 'pill-plain'}`}>{j.status}</span></Td>
              <Td mono>{j.attempts}/{j.max_attempts}</Td>
              <Td muted>{j.status === 'failed' ? `retry ${when(j.next_run_at)} — ` : ''}{j.last_error ?? ''}</Td>
            </tr>
          ))}
        </OpsTable>
      </Section>
      <Section title="Recent failures" note="Anything the audit log recorded as failed.">
        {failures.length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>None recorded.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{failures.map((f) => <li key={f.id}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(f.created_at)}</span> · {f.summary}</li>)}</ul>
        )}
      </Section>
    </>
  )
}

/** Staff & permissions — the ONE place switches are granted, by Root only. */
export function Staff() {
  const { operator } = useOps()
  const rows = useTable<StaffRow>('staff')
  const sorted = useMemo(() => [...rows].sort((a, b) => a.role.localeCompare(b.role) || a.invited_at.localeCompare(b.invited_at)), [rows])
  return (
    <>
      <PageTitle title="Staff & permissions" subtitle="One switch per thing a person may do. Root holds everything and is the only one who grants." />
      <Section title="Invite someone" note="They get an email to set a password and land signed in with exactly these switches. Nothing held in one product or area implies anything in another." first>
        <InviteForm />
      </Section>
      <Section title={`${sorted.filter((r) => !r.deactivated_at).length} people`}>
        <div style={{ display: 'grid', gap: 12 }}>
          {sorted.map((r) => <StaffEditor key={r.id} row={r} self={r.id === operator.staffId} />)}
        </div>
      </Section>
    </>
  )
}

/** Who is told — per person, per event, by bell and/or email. Root sets it. */
export function WhoIsTold() {
  const staff = useTable<StaffRow>('staff')
  const rows = useTable<{ staff_id: string; event: string; email: boolean; bell: boolean }>('ops_notify')
  const people = useMemo(() => staff.filter((s) => !s.deactivated_at).sort((a, b) => a.role.localeCompare(b.role) || a.invited_at.localeCompare(b.invited_at)), [staff])
  const groups = Object.keys(GROUP_TITLES) as (keyof typeof GROUP_TITLES)[]
  return (
    <>
      <PageTitle title="Who is told" subtitle="Each event, each person, by bell (inside the back office) and email. Nobody is told anything they didn't ask for." />
      {groups.map((g, i) => (
        <Section key={g} title={GROUP_TITLES[g]} first={i === 0}>
          <NotifyGrid staff={people} events={EVENTS.filter((e) => e.group === g)} rows={rows} />
        </Section>
      ))}
    </>
  )
}

/** Company-wide keys (Resend today). Root only; product keys sit in each product's Settings. */
export function Keys() {
  const secrets = useSecrets('')
  return (
    <>
      <PageTitle title="Keys" subtitle="Keys every product shares. Each product's own keys (payments, AI) live in that product's Settings." />
      <Section title="Company-wide" note="Write-only: a key can be replaced or cleared, never read back. 'From server env' means it still comes from the hosting environment — paste it here to move it under back-office control." first>
        <SecretRows product="" secrets={secrets} />
      </Section>
    </>
  )
}
