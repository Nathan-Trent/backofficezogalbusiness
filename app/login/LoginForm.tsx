'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null)
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setError(error.message); return }
    router.replace('/ops'); router.refresh()
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 14, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 22 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Email<input className="ops-input" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>Password<input className="ops-input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--status-critical-fg)' }}>{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--app-text-muted)' }}>Invited? Set your password from the email you received, then sign in here.</p>
    </form>
  )
}
