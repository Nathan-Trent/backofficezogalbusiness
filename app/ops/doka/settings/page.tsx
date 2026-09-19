import { requireCap } from '@/lib/auth/operator'
import { createAdminClient } from '@/lib/supabase/admin'
import { PageTitle } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { OpsSettingsForm, PlatformSettingRow } from './Forms'
import { SecretRows } from '@/components/ops/SecretRows'
import { listSecrets } from '@/lib/secrets'

export const dynamic = 'force-dynamic'

const OPS_FIELDS = [
  { key: 'manager_pin_rotation_days', label: 'Manager PIN rotates every', help: 'How often a manager’s override PIN changes.', unit: 'days' },
  { key: 'subscription_grace_days', label: 'Grace after expiry', help: 'Normal use continues this long after a subscription expires.', unit: 'days' },
  { key: 'read_only_window_days', label: 'Read-only window', help: 'After grace: terminals can look but not sell, for this long, then lock.', unit: 'days' },
  { key: 'mandatory_sync_days', label: 'Must sync at least every', help: 'A terminal offline longer than this goes read-only until it syncs.', unit: 'days' },
  { key: 'sync_warning_days', label: 'Start warning at', help: 'Days offline before the terminal starts nagging.', unit: 'days' },
  { key: 'clock_skew_tolerance_hours', label: 'Clock skew tolerance', help: 'A device clock further off than this is flagged.', unit: 'hours' },
]

/** Doka settings: platform keys (scan allowance, model, web-till switch) and the §5.1 operational values. */
export default async function SettingsPage() {
  await requireCap('doka.settings.manage')
  const admin = createAdminClient()
  const [{ data: ps, error: pErr }, { data: os, error: oErr }, { data: hist, error: hErr }, secrets] = await Promise.all([
    admin.from('platform_settings').select('key, value, description, updated_at').order('key'),
    admin.from('operational_settings').select('settings, updated_at').eq('id', 1).single(),
    admin.from('platform_settings_history').select('key, old_value, new_value, changed_at').order('changed_at', { ascending: false }).limit(20),
    listSecrets('doka').catch(() => []),
  ])
  if (pErr || oErr || hErr) return <p style={{ color: 'var(--status-critical-fg)' }}>{(pErr ?? oErr ?? hErr)!.message}</p>
  return (
    <>
      <PageTitle title="Doka settings" subtitle="Business-side keys. Changes apply to every shop immediately and are logged." />
      <Section title="Keys" note="Third-party keys Doka uses: payments (Paystack, Flutterwave) and notebook reading (Anthropic). Write-only — a key can be replaced or cleared, never read back. Company-wide keys such as Resend live under Zogal Business → Keys." first>
        <SecretRows product="doka" secrets={secrets} />
      </Section>
      <Section title="Platform settings" note="Feature switches and allowances. The partner web shop-app switch lives here (pos_web.enabled).">
        <div style={{ display: 'grid', gap: 8 }}>
          {(ps ?? []).map((s) => <PlatformSettingRow key={s.key as string} setting={s as { key: string; value: unknown; description: string; updated_at: string }} />)}
        </div>
      </Section>
      <Section title="Operational settings" note="How the terminals behave around sync, expiry and PINs. Terminals receive them at their next sync.">
        <OpsSettingsForm fields={OPS_FIELDS} settings={(os?.settings ?? {}) as Record<string, number>} updatedAt={os?.updated_at as string} />
      </Section>
      <Section title="Recent changes">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {(hist ?? []).map((h, i) => <li key={i}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{new Date(h.changed_at as string).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })}</span> · <code>{h.key as string}</code> {h.old_value === null ? '(new)' : JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}</li>)}
          {(hist ?? []).length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>None.</li>}
        </ul>
      </Section>
    </>
  )
}
