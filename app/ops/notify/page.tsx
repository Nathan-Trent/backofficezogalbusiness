import { notFound } from 'next/navigation'
import { getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { EVENTS, GROUP_TITLES } from '@/lib/notify'
import { NotifyGrid } from './NotifyGrid'

export const dynamic = 'force-dynamic'

/** Who is told — per person, per event, by bell and/or email. Root sets it. */
export default async function NotifyPage() {
  const op = await getOperator()
  if (!op.isRoot) notFound()
  const admin = createAdminClient()
  const [{ data: staff, error: sErr }, { data: rows, error: nErr }] = await Promise.all([
    admin.from('staff').select('id, email, name, role').is('deactivated_at', null).order('role').order('invited_at'),
    admin.from('ops_notify').select('staff_id, event, email, bell'),
  ])
  if (sErr || nErr) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read: {(sErr ?? nErr)!.message}</p>
  const groups = Object.keys(GROUP_TITLES) as (keyof typeof GROUP_TITLES)[]
  return (
    <>
      <PageTitle title="Who is told" subtitle="Each event, each person, by bell (inside the back office) and email. Nobody is told anything they didn&apos;t ask for." />
      {groups.map((g, i) => (
        <Section key={g} title={GROUP_TITLES[g]} first={i === 0}>
          <NotifyGrid staff={(staff ?? []) as { id: string; email: string; name: string | null; role: string }[]} events={EVENTS.filter((e) => e.group === g)} rows={(rows ?? []) as { staff_id: string; event: string; email: boolean; bell: boolean }[]} />
        </Section>
      ))}
    </>
  )
}
