import { requireCap } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'

export default async function Page() {
  await requireCap('marketing.view')
  return <><PageTitle title="Doka page" subtitle="Not built yet." /><p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Every word on business.getzogal.com/doka, editable here in the Marketing slice.</p></>
}
