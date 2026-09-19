'use server'

import { assertCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAction } from '@/lib/audit'
import { notify } from '@/lib/notify'

type Result = { ok: true; data?: unknown } | { ok: false; error: string }
const P = 'doka'
const CAP = `${P}.tax.manage`

/**
 * §8.1: the write side of tax_rules. A change in the law is a NEW
 * effective-dated row (add_tax_rule closes whatever was open), never an
 * edit in place — that's what makes "apply last year's rules to last
 * year's data" automatic instead of a feature to build. Every write is
 * capability-gated and lands in ops_audit_log with who and what; the
 * pushed row is verified = false until a human confirms it, and the shop
 * app already labels anything built on an unverified rule as an estimate.
 */
export type RuleParams =
  | { kind: 'rate'; rate: number }
  | { kind: 'threshold'; amount: number; basis: 'annual_turnover'; below: 'exempt' }
  | { kind: 'bands'; basis: 'annual_net_profit'; bands: { upto: number | null; rate: number }[] }
  | { kind: 'filing_due'; day: number; months_after?: number; month?: number; years_after?: number }

function validateParams(p: RuleParams): string | null {
  const pct = (r: number) => !Number.isFinite(r) || r < 0 || r > 1
  if (p.kind === 'rate') { if (pct(p.rate)) return 'Rate must be between 0% and 100%' }
  else if (p.kind === 'threshold') { if (!Number.isFinite(p.amount) || p.amount < 0) return 'Threshold must be 0 or more' }
  else if (p.kind === 'bands') {
    if (p.bands.length === 0) return 'At least one band is needed'
    for (const b of p.bands) if (pct(b.rate)) return 'Every band rate must be between 0% and 100%'
    for (let i = 1; i < p.bands.length; i++) {
      const prev = p.bands[i - 1]!.upto
      if (prev !== null && p.bands[i]!.upto !== null && p.bands[i]!.upto! <= prev) return 'Bands must rise in order (each "up to" bigger than the last)'
    }
    if (p.bands[p.bands.length - 1]!.upto !== null) return 'The last band must have no upper limit (leave it blank)'
  } else if (p.kind === 'filing_due') {
    if (!Number.isInteger(p.day) || p.day < 1 || p.day > 31) return 'Day must be between 1 and 31'
    if (p.months_after !== undefined && (!Number.isInteger(p.months_after) || p.months_after < 0)) return 'Months after must be 0 or more'
    if (p.month !== undefined && (!Number.isInteger(p.month) || p.month < 1 || p.month > 12)) return 'Month must be between 1 and 12'
    if (p.years_after !== undefined && (!Number.isInteger(p.years_after) || p.years_after < 0)) return 'Years after must be 0 or more'
  }
  return null
}

/** Add a new effective-dated rule. Starts unverified — mark it verified once it's checked against a real source. */
export async function addTaxRule(input: { taxTypeKey: string; effectiveFrom: string; params: RuleParams; source: string; note: string }): Promise<Result> {
  const op = await assertCap(CAP).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const source = input.source.trim()
  if (!source) return { ok: false, error: 'Say where this figure came from (the act, a circular, an accountant’s note)' }
  if (!input.effectiveFrom) return { ok: false, error: 'An effective date is needed' }
  const bad = validateParams(input.params)
  if (bad) return { ok: false, error: bad }
  const { kind, ...rest } = input.params
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('add_tax_rule', {
    p_tax_type_key: input.taxTypeKey, p_kind: kind, p_effective_from: input.effectiveFrom,
    p_params: rest, p_source: source, p_note: input.note.trim() || null, p_created_by: op.userId,
  })
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'tax_rule.add', product: P, summary: `Added ${kind} rule for ${input.taxTypeKey}, effective ${input.effectiveFrom} — ${source}`, targetType: 'tax_rule', targetId: data as string })
  await notify('doka.tax', { title: `New ${kind} rule for ${input.taxTypeKey}`, body: `Effective ${input.effectiveFrom} · not yet verified · by ${op.name ?? op.email}`, link: `/ops/${P}/tax`, product: P })
  return { ok: true, data: { id: data } }
}

/** Confirm a rule against a real source — the human gate TRD §8.1 requires before it stops being labelled an estimate. */
export async function verifyTaxRule(id: string): Promise<Result> {
  const op = await assertCap(CAP).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('tax_rules').update({ verified: true, verified_by: op.userId, verified_at: new Date().toISOString() }).eq('id', id).eq('verified', false).select('tax_type_key, kind').maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Already verified, or no such rule' }
  await recordAction(op, { action: 'tax_rule.verify', product: P, summary: `Verified the ${data.kind} rule for ${data.tax_type_key}`, targetType: 'tax_rule', targetId: id })
  await notify('doka.tax', { title: `Verified: ${data.kind} rule for ${data.tax_type_key}`, body: `by ${op.name ?? op.email}`, link: `/ops/${P}/tax`, product: P })
  return { ok: true }
}

/** Undo a verify made in error. Never touches figures already shown as confirmed anywhere else — it's the flag that matters. */
export async function unverifyTaxRule(id: string): Promise<Result> {
  const op = await assertCap(CAP).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('tax_rules').update({ verified: false, verified_by: null, verified_at: null }).eq('id', id).select('tax_type_key, kind').maybeSingle()
  if (error) return { ok: false, error: error.message }
  await recordAction(op, { action: 'tax_rule.unverify', product: P, summary: `Marked the ${data?.kind} rule for ${data?.tax_type_key} unverified again`, targetType: 'tax_rule', targetId: id })
  return { ok: true }
}

/** Which tax types a business category maps to (TRD §8: owner picks a category, the mapping decides what they're told they owe). */
export async function setCategoryTaxTypes(categoryKey: string, taxTypeKeys: string[]): Promise<Result> {
  const op = await assertCap(CAP).catch(() => null)
  if (!op) return { ok: false, error: 'Not allowed' }
  const admin = createAdminClient()
  const { error: dErr } = await admin.from('business_category_tax_types').delete().eq('category_key', categoryKey)
  if (dErr) return { ok: false, error: dErr.message }
  if (taxTypeKeys.length) {
    const { error: iErr } = await admin.from('business_category_tax_types').insert(taxTypeKeys.map((k) => ({ category_key: categoryKey, tax_type_key: k })))
    if (iErr) return { ok: false, error: iErr.message }
  }
  await recordAction(op, { action: 'tax_category.map', product: P, summary: `${categoryKey}: applies to ${taxTypeKeys.join(', ') || 'nothing'}`, targetType: 'business_category', targetId: categoryKey })
  return { ok: true }
}
