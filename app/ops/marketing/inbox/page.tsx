import { requireCap } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'

export default async function Page() {
  await requireCap('marketing.inbox')
  return <><PageTitle title="Inbox" subtitle="Not built yet." /><p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Messages from the site&apos;s contact form arrive here in the Marketing slice.</p></>
}
