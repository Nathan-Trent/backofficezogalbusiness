import { createClient } from '@supabase/supabase-js'

// SERVER ONLY — never import this from a client component or a 'use client' file.
// The service role key bypasses RLS entirely.

/**
 * Admin Supabase client.
 *
 * Fails loudly on missing configuration — see the note in client.ts.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(url, key)
}

/**
 * Parse a platform_config jsonb value as boolean.
 *
 * `fallback` is returned for anything unrecognised (null, missing, malformed).
 * Callers guarding a gate must pass the safe-closed value — never let a bad
 * config row silently open something.
 */
export function parseConfigBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}
