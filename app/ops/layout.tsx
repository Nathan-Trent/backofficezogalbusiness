import { notFound, redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/current-user'
import { getOperator } from '@/lib/auth/operator'
import { OpsChrome } from '@/components/ops/OpsChrome'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The gate. Runs for every page under /ops. Not staff → 404, never a
 * redirect: the surface is not confirmed to exist. What a person may DO is
 * decided per screen and per action by capability.
 */
export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')
  const op = await getOperator()
  if (!op.isStaff) notFound()

  const admin = createAdminClient()
  const [{ data: products, error: pErr }, { data: bell, error: bErr }] = await Promise.all([
    admin.from('products').select('key, name, colour').eq('is_active', true).order('sort_order'),
    admin.from('ops_notifications').select('id, title, body, link, read_at, created_at').eq('staff_id', op.staffId!).order('created_at', { ascending: false }).limit(30),
  ])
  if (pErr) console.error('products read failed:', pErr.message)
  if (bErr) console.error('bell read failed:', bErr.message)
  const items = (bell ?? []) as { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]

  return (
    <OpsChrome capabilities={op.capabilities} isRoot={op.isRoot} operatorName={op.name ?? op.email} products={(products ?? []) as { key: string; name: string; colour: string }[]} bell={{ items, unread: items.filter((i) => !i.read_at).length }}>
      {children}
    </OpsChrome>
  )
}
