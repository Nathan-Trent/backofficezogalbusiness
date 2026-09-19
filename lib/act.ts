'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

type Result<T = unknown> = { ok: true; data?: T } | { ok: false; error: string }

/**
 * Run a server action from a button without freezing anything: the button
 * shows its own busy text, the rest of the page stays live, and the result
 * is a toast. The row that changed arrives through Realtime — no refresh.
 */
export function useAct() {
  const [busy, setBusy] = useState(false)
  const run = useCallback(async <T,>(action: () => Promise<Result<T>>, success?: string | ((d: T | undefined) => string)): Promise<Result<T>> => {
    setBusy(true)
    try {
      const r = await action()
      if (r.ok) { if (success) toast.success(typeof success === 'function' ? success(r.data) : success) } else toast.error(r.error)
      return r
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e); toast.error(msg); return { ok: false, error: msg }
    } finally { setBusy(false) }
  }, [])
  return { busy, run }
}
