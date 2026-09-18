import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/auth/current-user'
import { LoginForm } from './LoginForm'

/** Zogal Business back office sign-in. Ink and amber — not a product, the company. */
export default async function LoginPage() {
  if (await currentUser()) redirect('/ops')
  return (
    <div className="ops-frame" style={{ display: 'grid', placeItems: 'center', gridTemplateColumns: '1fr', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)' }}>Zogal Business</p>
          <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Back office</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--app-text-muted)' }}>Staff only. Your Zogal Business account.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
