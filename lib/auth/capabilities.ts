/**
 * What a member of Zogal Business staff may do, one switch at a time.
 *
 * Two levels: the COMPANY (Zogal Business) and each PRODUCT (Doka today).
 * Nothing held at one level or in one product implies anything elsewhere.
 * A switch is one thing a person can see, edit, publish or configure; the
 * Staff & permissions screen lists every one per person, grouped.
 *
 * ROOT holds everything and is the only role that grants. There is no
 * switch that grants switches — that would equal holding all of them.
 *
 * Three gates, in order of importance (same as zogal.app):
 *   1. The nav hides what a person may not open — manners.
 *   2. The page returns 404 — manners with a lock.
 *   3. The server action refuses — the control.
 *
 * Stored as text[] on staff.capabilities; a new switch is a line here, not
 * a migration.
 */
export type Group = 'company' | 'marketing' | `product:${string}`

export interface CapDef { key: string; label: string; group: Group; sensitive?: boolean }

export const PRODUCTS = [{ key: 'doka', name: 'Doka' }] as const
export type ProductKey = (typeof PRODUCTS)[number]['key']

function productCaps(p: ProductKey, name: string): CapDef[] {
  const g: Group = `product:${p}`
  return [
    { key: `${p}.ops.view`, label: `Open ${name}: map, shops, terminals`, group: g },
    { key: `${p}.users.view`, label: `See ${name} users and their profiles`, group: g },
    { key: `${p}.users.message`, label: `Message ${name} users and shops`, group: g, sensitive: true },
    { key: `${p}.users.impersonate`, label: `Sign in as a ${name} user`, group: g, sensitive: true },
    { key: `${p}.shops.manage`, label: `Deactivate shops, rename, edit details`, group: g, sensitive: true },
    { key: `${p}.terminals.manage`, label: `Revoke and rename terminals`, group: g },
    { key: `${p}.settings.manage`, label: `Platform and operational settings for ${name}`, group: g, sensitive: true },
    { key: `${p}.finance.view`, label: `See ${name} subscriptions, invoices, payments`, group: g },
    { key: `${p}.finance.edit`, label: `Edit ${name} plans and prices (as drafts)`, group: g },
    { key: `${p}.finance.publish`, label: `Publish ${name} plans so the app and site use them`, group: g, sensitive: true },
    { key: `${p}.finance.subscriptions`, label: `Give plans, extend or cancel ${name} subscriptions`, group: g, sensitive: true },
    { key: `${p}.tax.manage`, label: `${name} tax rules — thresholds, rates and effective dates`, group: g, sensitive: true },
  ]
}

export const CAPABILITIES: CapDef[] = [
  // ---- Zogal Business (company) -----------------------------------------
  { key: 'company.overview', label: 'See the company overview', group: 'company' },
  { key: 'company.audit.view', label: 'See the activity log', group: 'company' },
  { key: 'company.health.view', label: 'See health: what is working and what failed', group: 'company' },
  // ---- Marketing (company-level, per page) ---------------------------------
  { key: 'marketing.view', label: 'Open Marketing and see site content', group: 'marketing' },
  { key: 'marketing.edit', label: 'Edit Zogal Business site content (as drafts)', group: 'marketing' },
  { key: 'marketing.publish', label: 'Publish site content so the live site changes', group: 'marketing', sensitive: true },
  { key: 'marketing.inbox', label: 'See and answer messages from the site', group: 'marketing' },
  ...PRODUCTS.flatMap((p) => [
    { key: `marketing.${p.key}.edit`, label: `Edit the ${p.name} page (as drafts)`, group: 'marketing' as Group },
    { key: `marketing.${p.key}.publish`, label: `Publish the ${p.name} page`, group: 'marketing' as Group, sensitive: true },
  ]),
  // ---- Products -----------------------------------------------------------
  ...PRODUCTS.flatMap((p) => productCaps(p.key, p.name)),
]

export const ALL_CAPABILITIES = CAPABILITIES.map((c) => c.key)

export const GROUP_LABELS: Record<string, string> = {
  company: 'Zogal Business',
  marketing: 'Marketing',
  ...Object.fromEntries(PRODUCTS.map((p) => [`product:${p.key}`, p.name])),
}

export function normalise(stored: string[]): string[] {
  return stored.filter((c) => ALL_CAPABILITIES.includes(c))
}
