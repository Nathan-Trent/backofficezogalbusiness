import { notFound } from 'next/navigation'
import { getOperator } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { StaffEditor, InviteForm } from './StaffEditor'

export const dynamic = 'force-dynamic'

/** Staff & permissions — the ONE place switches are granted, by Root only. */
export default async function StaffPage() {
  const op = await getOperator()
  if (!op.isRoot) notFound()
  const { data, error } = await createAdminClient().from('staff').select('id, email, name, role, capabilities, invited_at, accepted_at, deactivated_at').order('role').order('invited_at')
  if (error) return <p style={{ color: 'var(--status-critical-fg)' }}>Could not read staff: {error.message}</p>
  const rows = (data ?? []) as { id: string; email: string; name: string | null; role: 'root' | 'staff'; capabilities: string[]; invited_at: string; accepted_at: string | null; deactivated_at: string | null }[]
  return (
    <>
      <PageTitle title="Staff & permissions" subtitle="One switch per thing a person may do. Root holds everything and is the only one who grants." />
      <Section title="Invite someone" note="They get an email to set a password and land signed in with exactly these switches. Nothing held in one product or area implies anything in another." first>
        <InviteForm />
      </Section>
      <Section title={`${rows.filter((r) => !r.deactivated_at).length} people`}>
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => <StaffEditor key={r.id} row={r} self={r.id === op.staffId} />)}
        </div>
      </Section>
    </>
  )
}
