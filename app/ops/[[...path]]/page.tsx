'use client'

import { useOpsPath } from '@/lib/nav'
import { useCan, useOps } from '@/lib/store/OpsStore'
import { Activity, Health, Keys, Overview, Staff, WhoIsTold } from '@/components/screens/company'
import { Inbox, SitePage } from '@/components/screens/marketing'
import { Conflicts, WhereTheyAre, ShopDetail, Shops, Terminals, UserDetail, Users } from '@/components/screens/doka'
import { Finance, Plans } from '@/components/screens/finance'
import { Settings } from '@/components/screens/settings'

/**
 * Every screen under /ops, chosen from the URL in the browser. Moving
 * between screens is a state change, not a request. The same three gates
 * as before: the nav hides, this 404s (a plain "not here"), the action refuses.
 */
export default function OpsPage() {
  const path = useOpsPath()
  const { operator, ready, error } = useOps()
  const can = useCan()
  const gate = (cap: string | 'root', el: React.ReactNode) => (cap === 'root' ? operator.isRoot : can(cap)) ? el : <NotHere />
  const [a, b, c] = path

  let screen: React.ReactNode
  if (!a) screen = gate('company.overview', <Overview />)
  else if (a === 'health') screen = gate('company.health.view', <Health />)
  else if (a === 'audit') screen = gate('company.audit.view', <Activity />)
  else if (a === 'staff') screen = gate('root', <Staff />)
  else if (a === 'notify') screen = gate('root', <WhoIsTold />)
  else if (a === 'keys') screen = gate('root', <Keys />)
  else if (a === 'marketing') screen = b === 'inbox' ? gate('marketing.inbox', <Inbox />) : gate('marketing.view', <SitePage page={b ?? 'home'} />)
  else if (a === 'doka') {
    if (!b) screen = gate('doka.ops.view', <WhereTheyAre />)
    else if (b === 'shops') screen = gate('doka.ops.view', c ? <ShopDetail id={c} /> : <Shops />)
    else if (b === 'users') screen = gate('doka.users.view', c ? <UserDetail id={c} /> : <Users />)
    else if (b === 'terminals') screen = gate('doka.ops.view', <Terminals />)
    else if (b === 'conflicts') screen = gate('doka.ops.view', <Conflicts />)
    else if (b === 'finance') screen = c === 'plans' ? gate('doka.finance.edit', <Plans />) : gate('doka.finance.view', <Finance />)
    else if (b === 'settings') screen = gate('doka.settings.manage', <Settings />)
    else screen = <NotHere />
  } else screen = <NotHere />

  return (
    <>
      {error && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--status-critical-fg)' }}>Some data could not be loaded: {error}</p>}
      {!ready && <div aria-hidden style={{ display: 'grid', gap: 10, marginBottom: 16 }}><div className="skeleton" style={{ height: 28, width: 260 }} /><div className="skeleton" style={{ height: 14, width: 420 }} /></div>}
      <div style={{ opacity: ready ? 1 : 0.5, transition: 'opacity 150ms' }}>{screen}</div>
    </>
  )
}

function NotHere() {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--app-text-muted)', fontSize: 14 }}>Nothing here.</div>
}
