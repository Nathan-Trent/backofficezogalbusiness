import { requireCap } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'

export default async function Page() {
  await requireCap('marketing.view')
  return <><PageTitle title="Zogal Business site" subtitle="Not built yet." /><p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Site content — draft and publish — arrives in the Marketing slice.</p></>
}
