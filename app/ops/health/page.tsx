import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle, when } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'

export const dynamic = 'force-dynamic'

/**
 * Health — per FEATURE, not per job (Nathan): is each thing working, when it
 * last worked, what failed. Green/amber/red on a fact, never a guess.
 */
type Check = { name: string; ok: boolean | null; note: string }

async function checks(): Promise<Check[]> {
  const admin = createAdminClient()
  const out: Check[] = []
  const ago = (iso: string | null | undefined) => (iso ? `${Math.round((Date.now() - Date.parse(iso)) / 60000)} min ago` : 'never')

  // Database reachable at all
  const t0 = Date.now()
  const { error: dbErr } = await admin.from('products').select('key', { head: true, count: 'exact' })
  out.push({ name: 'Database', ok: !dbErr, note: dbErr ? dbErr.message : `answering in ${Date.now() - t0} ms` })

  // Sign-in (auth) — a sign-in event in the last day means the door works
  const { data: si, error: siErr } = await admin.from('signin_events').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
  out.push({ name: 'Sign-in', ok: siErr ? false : si ? Date.now() - Date.parse(si.created_at) < 86_400_000 : null, note: siErr ? siErr.message : `last sign-in ${ago(si?.created_at)}` })

  // Sync — a terminal heartbeat in the last 15 minutes
  const { data: dv, error: dvErr } = await admin.from('devices').select('last_sync_at').is('revoked_at', null).order('last_sync_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle()
  out.push({ name: 'Terminal sync', ok: dvErr ? false : dv?.last_sync_at ? Date.now() - Date.parse(dv.last_sync_at) < 15 * 60_000 : null, note: dvErr ? dvErr.message : `last heartbeat ${ago(dv?.last_sync_at)}` })

  // Selling — a completed sale in the last day
  const { data: sl, error: slErr } = await admin.from('sales').select('sold_at').eq('status', 'completed').order('sold_at', { ascending: false }).limit(1).maybeSingle()
  out.push({ name: 'Selling', ok: slErr ? false : sl ? Date.now() - Date.parse(sl.sold_at) < 86_400_000 : null, note: slErr ? slErr.message : `last sale ${ago(sl?.sold_at)}` })

  // Sync conflicts piling up
  const { count, error: cErr } = await admin.from('sync_conflicts').select('id', { count: 'exact', head: true }).is('resolved_at', null)
  out.push({ name: 'Sync conflicts', ok: cErr ? false : (count ?? 0) < 20, note: cErr ? cErr.message : `${count ?? 0} unresolved across all shops` })

  // Notebook scans (AI) — last scan outcome
  const { data: sc, error: scErr } = await admin.from('notebook_scans').select('status, created_at, error').order('created_at', { ascending: false }).limit(1).maybeSingle()
  out.push({ name: 'Notebook scanning', ok: scErr ? false : sc ? sc.status !== 'failed' : null, note: scErr ? scErr.message : sc ? `last scan ${sc.status} ${ago(sc.created_at)}${sc.error ? ` — ${sc.error}` : ''}` : 'no scans yet' })

  // Mail
  const { data: ml, error: mlErr } = await admin.from('messages').select('status, error, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
  out.push({ name: 'Email sending', ok: mlErr ? false : ml ? ml.status !== 'failed' : (process.env.RESEND_API_KEY ? null : false), note: mlErr ? mlErr.message : ml ? `last message ${ml.status} ${ago(ml.created_at)}${ml.error ? ` — ${ml.error}` : ''}` : process.env.RESEND_API_KEY ? 'no messages sent yet' : 'RESEND_API_KEY not set' })

  return out
}

export default async function HealthPage() {
  await requireCap('company.health.view')
  const list = await checks()
  const admin = createAdminClient()
  const { data: failures, error: fErr } = await admin.from('ops_audit_log').select('summary, created_at').ilike('action', '%fail%').order('created_at', { ascending: false }).limit(10)
  const tone = (ok: boolean | null) => (ok === true ? 'pill-good' : ok === false ? 'pill-bad' : 'pill-warn')
  const word = (ok: boolean | null) => (ok === true ? 'Working' : ok === false ? 'Failing' : 'Quiet')
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
      <Section title="Recent failures" note="Anything the audit log recorded as failed.">
        {fErr ? <p style={{ color: 'var(--status-critical-fg)' }}>{fErr.message}</p> : (failures ?? []).length === 0 ? <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>None recorded.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{(failures ?? []).map((f, i) => <li key={i}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(f.created_at as string)}</span> · {f.summary as string}</li>)}</ul>
        )}
      </Section>
    </>
  )
}
