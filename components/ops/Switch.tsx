'use client'

export function Switch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (next: boolean) => void; label?: string }) {
  return <button type="button" className="switch" data-on={on ? 'true' : 'false'} disabled={busy} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
}
