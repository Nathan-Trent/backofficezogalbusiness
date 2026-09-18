import { requireCap } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'

export default async function Page() {
  await requireCap('doka.finance.view')
  return <><PageTitle title="Doka subscriptions" subtitle="Not built yet." /><p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Subscriptions, invoices, receipts and payments arrive in the Finance slice. Until then, set a shop&apos;s subscription from its page.</p></>
}
