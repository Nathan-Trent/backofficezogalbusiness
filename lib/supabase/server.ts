import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Request-scoped Supabase client. Every read and write through this client is
 * subject to RLS as the signed-in user.
 *
 * Fails loudly on missing configuration — see the note in client.ts. Supabase
 * reports an absent key as "Invalid API key", which is indistinguishable from
 * a wrong one unless we check first.
 *
 * ONE CLIENT PER REQUEST, memoised by React's `cache`.
 *
 * It used to build a new one on every call — 167 call sites across the app,
 * and a single Home render goes through dozens of them. Each fresh client
 * carries its own empty session, so each one's first `auth.getUser()` was a
 * separate round trip to Supabase Auth to verify the same token. Sharing the
 * client means the session is verified once and every later call reads it from
 * memory.
 *
 * The memo lasts exactly one request, so nothing is ever shared between users,
 * and a server action gets its own client with freshly-read cookies.
 */
export const createClient = cache(async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase server client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component — safe to ignore; the proxy refreshes sessions.
        }
      },
    },
  })
})
