'use client'

import { useMemo } from 'react'
import { useTable } from '@/lib/store/OpsStore'
import { PageTitle, when } from '@/components/ops/table'
import { Section } from '@/components/ops/layout'
import { Switch } from '@/components/ops/Switch'
import { SecretRows } from '@/components/ops/SecretRows'
import { useSecrets } from '@/components/screens/secrets'
import { OpsSettingsForm, PlatformSettingRow } from '@/components/screens/SettingsForms'
import { setPlatformSetting } from '@/app/actions/doka'

const OPS_FIELDS = [
  { key: 'manager_pin_rotation_days', label: 'Manager PIN rotates every', help: 'How often a manager’s override PIN changes.', unit: 'days' },
  { key: 'subscription_grace_days', label: 'Grace after expiry', help: 'Normal use continues this long after a subscription expires.', unit: 'days' },
  { key: 'read_only_window_days', label: 'Read-only window', help: 'After grace: terminals can look but not sell, for this long, then lock.', unit: 'days' },
  { key: 'mandatory_sync_days', label: 'Must sync at least every', help: 'A terminal offline longer than this goes read-only until it syncs.', unit: 'days' },
  { key: 'sync_warning_days', label: 'Start warning at', help: 'Days offline before the terminal starts nagging.', unit: 'days' },
  { key: 'clock_skew_tolerance_hours', label: 'Clock skew tolerance', help: 'A device clock further off than this is flagged.', unit: 'hours' },
]

type PS = { key: string; value: unknown; description: string; updated_at: string }
type Hist = { id: number; key: string; old_value: unknown; new_value: unknown; changed_at: string }

/** Doka settings: keys, which payment provider is on, platform switches, and the §5.1 operational values. */
export function Settings() {
  const ps = useTable<PS>('platform_settings'), hist = useTable<Hist>('platform_settings_history'), os = useTable<{ id: number; settings: Record<string, number>; updated_at: string }>('operational_settings')
  const secrets = useSecrets('doka')
  const provider = String((ps.find((s) => s.key === 'payments.provider')?.value as string | undefined) ?? '')
  const others = useMemo(() => ps.filter((s) => s.key !== 'payments.provider').sort((a, b) => a.key.localeCompare(b.key)), [ps])
  const history = useMemo(() => [...hist].sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, 20), [hist])
  const isSet = (k: string) => secrets.some((s) => s.key === k && s.isSet)
  const op = os[0]
  const providers: { key: 'paystack' | 'flutterwave'; name: string; ready: boolean; needs: string }[] = [
    { key: 'paystack', name: 'Paystack', ready: isSet('paystack_secret_key'), needs: 'paystack_secret_key' },
    { key: 'flutterwave', name: 'Flutterwave', ready: isSet('flutterwave_secret_key') && isSet('flutterwave_secret_hash'), needs: 'flutterwave_secret_key + flutterwave_secret_hash' },
  ]
  return (
    <>
      <PageTitle title="Doka settings" subtitle="Business-side keys and switches. Changes apply to every shop immediately and are logged." />
      <Section title="Payments" note="Which provider takes subscription payments. Keys alone do nothing: a provider is used only while its switch is on, and only one can be on. Off = the Pay button tells owners payments are not switched on yet." first>
        <div style={{ display: 'grid', gap: 8 }}>
          {providers.map((p) => {
            const on = provider === p.key
            return (
              <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--r-md)', fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name} {on && <span className="pill pill-good" style={{ marginLeft: 6 }}>active</span>}</div>
                  <div style={{ color: 'var(--app-text-muted)', fontSize: 12 }}>{p.ready ? 'Keys are set.' : `Set ${p.needs} below before switching on.`}</div>
                </div>
                <Switch on={on} disabled={!p.ready && !on} label={`${p.name} active`} onChange={(next) => setPlatformSetting('payments.provider', next ? p.key : '')} />
              </div>
            )
          })}
          {!provider && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--status-approaching-fg)' }}>No provider is on. Owners cannot pay online until one is.</p>}
        </div>
      </Section>
      <Section title="Keys" note="Third-party keys Doka uses. Write-only — a key can be replaced or cleared, never read back. Company-wide keys such as Resend live under Zogal Business → Keys.">
        <SecretRows product="doka" secrets={secrets} />
      </Section>
      <Section title="Platform settings" note="Feature switches and allowances. The partner web shop-app switch lives here (pos_web.enabled).">
        <div style={{ display: 'grid', gap: 8 }}>{others.map((s) => <PlatformSettingRow key={s.key} setting={s} />)}</div>
      </Section>
      <Section title="Operational settings" note="How the terminals behave around sync, expiry and PINs. Terminals receive them at their next sync.">
        {op ? <OpsSettingsForm fields={OPS_FIELDS} settings={op.settings ?? {}} updatedAt={op.updated_at} /> : <p style={{ fontSize: 13, color: 'var(--app-text-muted)' }}>Loading…</p>}
      </Section>
      <Section title="Recent changes">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
          {history.map((h) => <li key={h.id}><span className="tabular" style={{ color: 'var(--app-text-muted)' }}>{when(h.changed_at)}</span> · <code>{h.key}</code> {h.old_value === null ? '(new)' : JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}</li>)}
          {history.length === 0 && <li style={{ color: 'var(--app-text-muted)' }}>None.</li>}
        </ul>
      </Section>
    </>
  )
}
