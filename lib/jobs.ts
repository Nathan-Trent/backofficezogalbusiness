import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/mail'

/**
 * Background jobs with retries (Nathan, 2026-09-19: "custom processing and
 * background job kind of a thing so the system works without me waiting").
 *
 * enqueue() writes a row and returns at once; the screen moves on. The
 * runner (/api/jobs/run, called by QStash every minute and kicked right
 * after an enqueue) claims due jobs, runs them, and on failure schedules a
 * retry with a growing gap: 1, 4, 9, 16 minutes… then marks the job dead
 * after max_attempts. Dead jobs show on Health for a person to look at.
 */
export type JobKind = 'send_email' | 'geolocate' | 'revalidate_site' | 'renew' | 'remind'
export interface Job { id: string; kind: JobKind; product: string | null; payload: Record<string, unknown>; attempts: number; max_attempts: number }

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ops.business.zogal.app'

export async function enqueue(kind: JobKind, payload: Record<string, unknown>, opts: { product?: string | null; createdBy?: string | null; runAt?: Date; maxAttempts?: number } = {}): Promise<string | null> {
  const { data, error } = await createAdminClient().from('jobs').insert({ kind, payload, product: opts.product ?? null, created_by: opts.createdBy ?? null, next_run_at: (opts.runAt ?? new Date()).toISOString(), max_attempts: opts.maxAttempts ?? 5 }).select('id').single()
  if (error) { console.error('enqueue failed:', kind, error.message); return null }
  if (!opts.runAt) kick()
  return data.id as string
}

/** Ask the runner to start now rather than at the next tick. Fire and forget. */
export function kick() {
  const secret = process.env.JOBS_SECRET
  if (!secret) return
  fetch(`${SITE_URL}/api/jobs/run`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } }).catch(() => { /* the schedule will get it */ })
}

const HANDLERS: Record<JobKind, (job: Job) => Promise<Record<string, unknown> | void>> = {
  async send_email(job) {
    const p = job.payload as { to: string; subject: string; text: string; identity: string; message_id?: string }
    const r = await sendMail(p)
    if (!r.ok) throw new Error(r.error ?? 'email failed')
    if (p.message_id) await createAdminClient().from('messages').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('id', p.message_id)
  },
  async geolocate() {
    const { geolocateBatch } = await import('@/lib/geo')
    return { located: await geolocateBatch() }
  },
  async revalidate_site(job) {
    const token = process.env.SITE_REVALIDATE_TOKEN, site = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'https://business.getzogal.com'
    if (!token) return { skipped: 'SITE_REVALIDATE_TOKEN not set' }
    const res = await fetch(`${site}/api/revalidate?token=${encodeURIComponent(token)}&path=${encodeURIComponent(String(job.payload.path ?? '/'))}`, { method: 'POST' })
    if (!res.ok) throw new Error(`site said ${res.status}`)
  },
  async renew() { const { runRenewals } = await import('@/lib/billing'); return runRenewals() },
  async remind() { const { runReminders } = await import('@/lib/billing'); return runReminders() },
}

/** Claim and run due jobs. Returns what happened, for the caller's log. */
export async function runDueJobs(limit = 20): Promise<{ ran: number; failed: number }> {
  const admin = createAdminClient()
  // Daily billing work is queued by the runner itself, so a schedule that only says "tick" is enough.
  try { const { ensureDailyJobs } = await import('@/lib/billing'); await ensureDailyJobs() } catch (e) { console.error('ensureDailyJobs:', e) }
  const { data, error } = await admin.rpc('claim_jobs', { p_limit: limit })
  if (error) { console.error('claim_jobs:', error.message); return { ran: 0, failed: 0 } }
  let failed = 0
  for (const j of (data ?? []) as Job[]) {
    const handler = HANDLERS[j.kind]
    try {
      if (!handler) throw new Error(`unknown job kind ${j.kind}`)
      const result = await handler(j)
      await admin.from('jobs').update({ status: 'done', result: result ?? null, locked_at: null, last_error: null }).eq('id', j.id)
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      const dead = j.attempts >= j.max_attempts
      const delayMin = j.attempts * j.attempts
      await admin.from('jobs').update({ status: dead ? 'dead' : 'failed', last_error: msg, locked_at: null, next_run_at: new Date(Date.now() + delayMin * 60_000).toISOString() }).eq('id', j.id)
      if (dead) {
        if (j.kind === 'send_email' && j.payload.message_id) await admin.from('messages').update({ status: 'failed', error: msg }).eq('id', j.payload.message_id as string)
        const { notify } = await import('@/lib/notify'); await notify('company.failure', { title: `Job ${j.kind} gave up after ${j.attempts} tries`, body: msg, link: '/ops/health', product: j.product })
      }
    }
  }
  return { ran: (data ?? []).length, failed }
}
