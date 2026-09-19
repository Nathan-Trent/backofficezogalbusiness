import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/current-user'
import { getOperator } from '@/lib/auth/operator'
import { OpsChrome } from '@/components/ops/OpsChrome'
import { OpsProvider } from '@/lib/store/OpsStore'

/**
 * The gate — the only server work in the back office. Not staff → 404,
 * never a redirect: the surface is not confirmed to exist. From here on the
 * browser owns everything: one load, then Realtime (see lib/store).
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const op = await getOperator()
  if (!op.isStaff) notFound()
  return (
    <OpsProvider operator={{ isRoot: op.isRoot, staffId: op.staffId!, userId: op.userId!, name: op.name, email: op.email!, capabilities: op.capabilities }}>
      <OpsChrome>{children}</OpsChrome>
    </OpsProvider>
  )
}
