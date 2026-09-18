import { requireCap } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'

export default async function Page() {
  await requireCap('doka.finance.edit')
  return <><PageTitle title="Plans & prices" subtitle="Not built yet." /><p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Draft → publish plan editing arrives in the Finance slice. Until then, edit pricing_plans from doka.zogal.app/admin/pricing.</p></>
}
