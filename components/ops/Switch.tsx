'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

type Result = { ok: true } | { ok: false; error: string }

/**
 * A switch that flips the moment you click it (optimistic), shows a ring
 * while the server confirms, and flips back with a message if refused.
 * Nothing waits: the page, the cursor and the other switches stay free.
 * `on` is the truth from the store; when the pushed row arrives it wins.
 */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (next: boolean) => Promise<Result> | void; label?: string; disabled?: boolean }) {
  const [shown, setShown] = useState(on)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (!saving) setShown(on) }, [on, saving])
  const click = async () => {
    if (disabled || saving) return
    const next = !shown; setShown(next)
    const r = onChange(next)
    if (!r) return
    setSaving(true)
    try {
      const res = await r
      if (!res.ok) { setShown(!next); toast.error(res.error) }
    } catch (e) { setShown(!next); toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }
  return <button type="button" className="switch" data-on={shown ? 'true' : 'false'} data-saving={saving ? 'true' : 'false'} disabled={disabled} role="switch" aria-checked={shown} aria-busy={saving} aria-label={label} onClick={() => void click()} />
}
