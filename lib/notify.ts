import { createAdminClient } from '@/lib/supabase/admin'
import { enqueue, SITE_URL } from '@/lib/jobs'

/**
 * Who is told. Every event somebody can be told about, in one list; the
 * switches on the Who-is-told screen set ops_notify rows; `notify()` reads
 * them and delivers by bell (ops_notifications) and/or email.
 */
export interface EventDef { key: string; group: 'company' | 'marketing' | 'doka'; label: string; help: string }

export const EVENTS: EventDef[] = [
  { key: 'company.failure', group: 'company', label: 'Something failed', help: 'A send, a job, a server error. What the Health screen shows.' },
  { key: 'company.staff', group: 'company', label: 'Staff changed', help: 'Someone was invited, changed or deactivated.' },
  { key: 'company.settings', group: 'company', label: 'A company key changed', help: 'A company-wide key (Resend) was set or cleared.' },
  { key: 'doka.signup', group: 'doka', label: 'A new Doka shop', help: 'Someone created a shop.' },
  { key: 'doka.signin', group: 'doka', label: 'A Doka sign-in', help: 'Someone signed in to the dashboard or the shop app. Noisy — bell only is wise.' },
  { key: 'doka.payment', group: 'doka', label: 'A Doka payment', help: 'A subscription was paid.' },
  { key: 'doka.subscription', group: 'doka', label: 'A Doka subscription changed', help: 'Set, extended, cancelled or expired.' },
  { key: 'doka.sync_conflicts', group: 'doka', label: 'Doka sync issues piling up', help: 'A shop has 5 or more unresolved sync conflicts.' },
  { key: 'doka.impersonation', group: 'doka', label: 'Someone signed in as a Doka user', help: 'Every impersonation, with who and why.' },
  { key: 'doka.settings', group: 'doka', label: 'A Doka key or setting changed', help: 'A payment, Anthropic or other key was set or cleared.' },
  { key: 'doka.published', group: 'doka', label: 'Doka plans published', help: 'Plans and prices went live for the app and the site.' },
  { key: 'marketing.contact', group: 'marketing', label: 'A message from the site', help: 'Someone wrote through the contact form.' },
  { key: 'marketing.published', group: 'marketing', label: 'The site was published', help: 'Someone made site changes live.' },
  { key: 'marketing.answered', group: 'marketing', label: 'A site message was answered', help: 'Someone replied from the inbox.' },
]

export const GROUP_TITLES = { company: 'Zogal Business', marketing: 'Marketing', doka: 'Doka' } as const

/** Deliver an event to everyone who asked for it. Never throws. */
export async function notify(event: string, payload: { title: string; body?: string; link?: string; product?: string | null }): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('ops_notify').select('staff_id, email, bell, staff:staff_id(email, name, deactivated_at)').eq('event', event)
    if (error) { console.error('notify read failed:', error.message); return }
    const rows = (data ?? []) as unknown as { staff_id: string; email: boolean; bell: boolean; staff: { email: string; name: string | null; deactivated_at: string | null } | null }[]
    for (const r of rows) {
      if (!r.staff || r.staff.deactivated_at) continue
      if (r.bell) {
        const { error: e2 } = await admin.from('ops_notifications').insert({ staff_id: r.staff_id, event, product: payload.product ?? null, title: payload.title, body: payload.body ?? null, link: payload.link ?? null })
        if (e2) console.error('bell insert failed:', e2.message)
      }
      if (r.email) await enqueue('send_email', { to: r.staff.email, subject: payload.title, text: [payload.body, payload.link ? `${SITE_URL}${payload.link}` : null].filter(Boolean).join('\n\n') || payload.title, identity: (payload.product as string | null) ?? 'business' }, { product: payload.product ?? null })
    }
  } catch (e) { console.error('notify threw:', e) }
}
