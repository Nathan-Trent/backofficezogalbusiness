import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** The signed-in auth user, verified once per request. */
export const currentUser = cache(async function currentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) return null
  return user
})
