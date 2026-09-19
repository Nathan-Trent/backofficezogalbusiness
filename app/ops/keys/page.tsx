import { notFound } from 'next/navigation'
import { getOperator } from '@/lib/auth/operator'
import { PageTitle } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { SecretRows } from '@/components/ops/SecretRows'
import { listSecrets } from '@/lib/secrets'

export const dynamic = 'force-dynamic'

/** Company-wide keys (Resend today). Root only; product keys sit in each product's Settings. */
export default async function KeysPage() {
  const op = await getOperator()
  if (!op.isRoot) notFound()
  const secrets = await listSecrets('').catch(() => [])
  return (
    <>
      <PageTitle title="Keys" subtitle="Keys every product shares. Each product's own keys (payments, AI) live in that product's Settings." />
      <Section title="Company-wide" note="Write-only: a key can be replaced or cleared, never read back. 'From server env' means it still comes from the hosting environment — paste it here to move it under back-office control." first>
        <SecretRows product="" secrets={secrets} />
      </Section>
    </>
  )
}
