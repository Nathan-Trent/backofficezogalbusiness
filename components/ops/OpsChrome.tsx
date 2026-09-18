'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from './Bell'

/**
 * The operator's frame — the sidebar rule from zogal.app kept exactly:
 *
 *   A sidebar entry is EITHER a link OR a heading. A heading opens and
 *   closes to show its pages; it never goes anywhere itself. The heading
 *   holding the page you are on is always open.
 *
 * Two levels here, not three worlds side by side (Nathan, 2026-09-18):
 *   ZOGAL BUSINESS — the company: overview, marketing (site + product pages),
 *                    staff, who is told, audit, health
 *   PRODUCTS       — Doka: its own world, its own colour on the frame
 *
 * Hiding what somebody cannot reach is a courtesy, not the control: every
 * page 404s and every action refuses on its own.
 */
export type NavLink = { href: string; label: string; needs: string | null; rootOnly?: boolean }
export type NavGroup = { heading: string; links: NavLink[] }
export type Product = { key: string; name: string; colour: string }

export function companyNav(products: Product[]): NavGroup[] {
  return [
    { heading: 'Company', links: [
      { href: '/ops', label: 'Overview', needs: 'company.overview' },
      { href: '/ops/health', label: 'Health', needs: 'company.health.view' },
      { href: '/ops/audit', label: 'Activity', needs: 'company.audit.view' },
    ] },
    { heading: 'Marketing', links: [
      { href: '/ops/marketing', label: 'Zogal Business site', needs: 'marketing.view' },
      ...products.map((p) => ({ href: `/ops/marketing/${p.key}`, label: `${p.name} page`, needs: 'marketing.view' })),
      { href: '/ops/marketing/inbox', label: 'Inbox', needs: 'marketing.inbox' },
    ] },
    { heading: 'People', links: [
      { href: '/ops/staff', label: 'Staff & permissions', needs: null, rootOnly: true },
      { href: '/ops/notify', label: 'Who is told', needs: null, rootOnly: true },
    ] },
  ]
}

export function productNav(p: Product): NavGroup[] {
  const k = p.key
  return [
    { heading: 'Watch', links: [
      { href: `/ops/${k}`, label: 'Where they are', needs: `${k}.ops.view` },
      { href: `/ops/${k}/shops`, label: 'Shops', needs: `${k}.ops.view` },
      { href: `/ops/${k}/users`, label: 'Users', needs: `${k}.users.view` },
      { href: `/ops/${k}/terminals`, label: 'Terminals', needs: `${k}.ops.view` },
      { href: `/ops/${k}/conflicts`, label: 'Sync issues', needs: `${k}.ops.view` },
    ] },
    { heading: 'Finance', links: [
      { href: `/ops/${k}/finance`, label: 'Subscriptions', needs: `${k}.finance.view` },
      { href: `/ops/${k}/finance/plans`, label: 'Plans & prices', needs: `${k}.finance.edit` },
    ] },
    { heading: 'Configure', links: [
      { href: `/ops/${k}/settings`, label: 'Settings', needs: `${k}.settings.manage` },
    ] },
  ]
}

export function OpsChrome({ children, capabilities, isRoot, operatorName, products, bell }: {
  children: React.ReactNode; capabilities: string[]; isRoot: boolean; operatorName: string | null; products: Product[]
  bell: { items: { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }[]; unread: number }
}) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [closed, setClosed] = useState<string[]>([])
  useEffect(() => { try { const raw = localStorage.getItem('zb-nav-closed'); if (raw) setClosed(JSON.parse(raw)) } catch {} }, [])
  useEffect(() => setMenuOpen(false), [pathname])
  const toggle = (key: string) => setClosed((prev) => { const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]; try { localStorage.setItem('zb-nav-closed', JSON.stringify(next)) } catch {}; return next })

  const product = products.find((p) => pathname === `/ops/${p.key}` || pathname.startsWith(`/ops/${p.key}/`)) ?? null
  const allowed = (l: NavLink) => (l.rootOnly ? isRoot : l.needs === null || capabilities.includes(l.needs))
  const groups = (product ? productNav(product) : companyNav(products)).map((g) => ({ ...g, links: g.links.filter(allowed) })).filter((g) => g.links.length)
  const home = product ? `/ops/${product.key}` : '/ops'
  const brand = product ? product.name : 'Zogal Business'
  const isActive = (href: string) => (href === home ? pathname === href : pathname.startsWith(href))

  // Doors: from the company into each product you may open; from a product back to the company.
  const doors: { href: string; label: string }[] = []
  if (product) doors.push({ href: '/ops', label: '← Zogal Business' })
  for (const p of products) if (p.key !== product?.key && capabilities.some((c) => c.startsWith(`${p.key}.`))) doors.push({ href: `/ops/${p.key}`, label: `${p.name} →` })

  const brandStyle: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', textDecoration: 'none' }
  const frameStyle = product ? ({ '--product-colour': product.colour } as React.CSSProperties) : undefined

  return (
    <div className={`ops-frame${product ? ' product-world' : ''}`} style={frameStyle}>
      <header className="ops-bar">
        <Link href={home} style={brandStyle}>{brand}</Link>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}><Bell items={bell.items} unread={bell.unread} /></span>
        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, marginRight: -10, fontSize: 18, background: 'transparent', border: 'none', color: 'var(--app-text-primary)', cursor: 'pointer' }}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      <nav className="ops-nav" data-open={menuOpen ? 'true' : 'false'} style={{ padding: '22px 16px', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <Link href={home} className="ops-nav-brand" style={{ ...brandStyle, marginBottom: 6 }}>{brand}</Link>
        <span className="ops-nav-brand" style={{ fontSize: 11, color: 'var(--app-text-muted)', marginBottom: 22 }}>{product ? 'A Zogal Business product' : 'Back office'}</span>

        {groups.map((group) => {
          const key = `${product?.key ?? 'company'}:${group.heading}`
          const holds = group.links.some((l) => isActive(l.href))
          const open = holds || !closed.includes(key)
          return (
            <div key={group.heading} style={{ marginBottom: open ? 18 : 8 }}>
              <button type="button" onClick={() => toggle(key)} aria-expanded={open}
                style={{ display: 'flex', alignItems: 'center', width: '100%', margin: '0 0 4px', padding: '6px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', borderRadius: 'var(--r-sm)', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ flex: 1 }}>{group.heading}</span>
                <span aria-hidden style={{ fontSize: 10, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }}>▶</span>
              </button>
              {open ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
                  {group.links.map((l) => {
                    const on = isActive(l.href)
                    return (
                      <li key={l.href}>
                        <Link href={l.href} aria-current={on ? 'page' : undefined}
                          style={{ display: 'block', padding: '7px 10px', fontSize: 14, fontWeight: on ? 600 : 400, borderRadius: 'var(--r-sm)', textDecoration: 'none', color: on ? 'var(--accent)' : 'var(--app-text-secondary)', background: on ? 'var(--accent-dim)' : 'transparent' }}>
                          {l.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          )
        })}

        {!product && products.length > 0 ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--app-text-muted)' }}>Products</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
              {products.filter((p) => capabilities.some((c) => c.startsWith(`${p.key}.`))).map((p) => (
                <li key={p.key}>
                  <Link href={`/ops/${p.key}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', fontSize: 14, fontWeight: 600, borderRadius: 'var(--r-sm)', textDecoration: 'none', color: 'var(--app-text-primary)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: p.colour, display: 'inline-block' }} />{p.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {doors.length > 0 ? (
          <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border-subtle)', display: 'grid', gap: 2 }}>
            {doors.map((d) => <Link key={d.href} href={d.href} style={{ display: 'block', padding: '7px 10px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--r-sm)', textDecoration: 'none', color: 'var(--app-text-primary)' }}>{d.label}</Link>)}
          </div>
        ) : null}
      </nav>

      <main className="ops-main">
        <div className="ops-top">
          <span style={{ fontSize: 12.5, color: 'var(--app-text-muted)' }}>{operatorName ? `Signed in as ${operatorName}` : ''}{isRoot ? ' · root' : ''}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell items={bell.items} unread={bell.unread} />
            <form action="/ops/signout" method="post"><button className="btn btn-ghost btn-sm" type="submit">Sign out</button></form>
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}
