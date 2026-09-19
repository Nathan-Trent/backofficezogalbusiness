'use client'

import { useState, type FormEvent } from 'react'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Sign-in that always says where it is (Nathan: "you don't know if the sign
 * in worked, you don't know if it's processing"). Four states, each visible:
 * idle → checking your details → signed in, opening… → (or) a plain reason.
 */
type Phase = { kind: 'idle' } | { kind: 'checking' } | { kind: 'opening' } | { kind: 'error'; message: string }

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const busy = phase.kind === 'checking' || phase.kind === 'opening'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setPhase({ kind: 'checking' })
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      const m = /invalid login credentials/i.test(error.message) ? 'Email or password is wrong. Check both and try again.'
        : /email not confirmed/i.test(error.message) ? 'Your email is not confirmed yet — open the link we sent you first.'
        : /fetch|network/i.test(error.message) ? 'Could not reach Zogal. Check your connection and try again.'
        : error.message
      setPhase({ kind: 'error', message: m }); return
    }
    setPhase({ kind: 'opening' })
    // A full load, on purpose: the gate runs once on the server and the
    // browser then owns the back office. This is the last round trip.
    window.location.assign('/ops')
  }

  return (
    <form onSubmit={submit} aria-busy={busy} style={{ display: 'grid', gap: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 22 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Email<input className="ops-input" type="email" autoComplete="email" required autoFocus disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Password<input className="ops-input" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {phase.kind === 'error' && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--status-critical-fg)' }}>{phase.message}</p>}
      <button className="btn btn-primary" type="submit" data-busy={busy} disabled={busy} style={{ justifyContent: 'center', gap: 8 }}>
        {phase.kind === 'checking' ? <><span className="spinner" /> Checking your details…</> : phase.kind === 'opening' ? <><span className="spinner" /> Signed in — opening the back office…</> : 'Sign in'}
      </button>
      <p aria-live="polite" style={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted)', minHeight: 16 }}>
        {phase.kind === 'checking' ? 'Talking to Zogal…' : phase.kind === 'opening' ? 'One moment.' : 'Invited? Set your password from the email you received, then sign in here.'}
      </p>
    </form>
  )
}
