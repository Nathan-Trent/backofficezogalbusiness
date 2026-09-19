import { createAdminClient } from '@/lib/supabase/admin'

/** Resolve city/country for sign-in rows that have none (free ip-api, batched). Returns how many were located. */
export async function geolocateBatch(): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('signin_events').select('id, ip').is('country', null).not('ip', 'is', null).order('created_at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  if (!data?.length) return 0
  const res = await fetch('http://ip-api.com/batch?fields=status,country,regionName,city,lat,lon,query', { method: 'POST', body: JSON.stringify(data.map((r) => String(r.ip))), headers: { 'content-type': 'application/json' } })
  if (!res.ok) throw new Error(`ip-api said ${res.status}`)
  const rows = (await res.json()) as { status: string; country?: string; regionName?: string; city?: string; lat?: number; lon?: number; query: string }[]
  let n = 0
  for (const g of rows) {
    const hit = data.find((r) => String(r.ip) === g.query)
    if (!hit) continue
    const { error: uErr } = await admin.from('signin_events').update(g.status === 'success' ? { country: g.country, region: g.regionName, city: g.city, lat: g.lat, lng: g.lon } : { country: '?' }).eq('id', hit.id)
    if (!uErr) n++
  }
  return n
}
