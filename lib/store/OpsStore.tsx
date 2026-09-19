'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import { TABLES, keyOf, type Row, type TableDef } from './tables'

/**
 * The in-memory back office.
 *
 * One read per table on load (as the signed-in operator; RLS decides), then
 * one Realtime channel carrying every change to those tables. Screens read
 * from here and re-render only when their table changes. Writes go through
 * server actions as before; the row that results arrives here by push —
 * a screen never has to "refresh".
 */
export interface Operator { isRoot: boolean; staffId: string; userId: string; name: string | null; email: string; capabilities: string[] }

type Listener = () => void
class Store {
  private maps = new Map<string, Map<string, Row>>()
  private arrays = new Map<string, Row[]>()
  private listeners = new Map<string, Set<Listener>>()
  private defs = new Map(TABLES.map((t) => [t.name, t]))

  def(name: string): TableDef { const d = this.defs.get(name); if (!d) throw new Error(`unknown table ${name}`); return d }
  rows(name: string): Row[] {
    let a = this.arrays.get(name)
    if (!a) { a = [...(this.maps.get(name)?.values() ?? [])]; this.arrays.set(name, a) }
    return a
  }
  load(name: string, rows: Row[]) {
    const d = this.def(name); const m = new Map<string, Row>()
    for (const r of rows) m.set(keyOf(d, r), r)
    this.maps.set(name, m); this.bump(name)
  }
  apply(name: string, type: 'INSERT' | 'UPDATE' | 'DELETE', row: Row, old: Row) {
    const d = this.def(name); const m = this.maps.get(name) ?? new Map<string, Row>(); this.maps.set(name, m)
    if (type === 'DELETE') m.delete(keyOf(d, old))
    else {
      // A filtered table (unresolved conflicts) drops rows that no longer match.
      if (d.filter && d.filter[1] === 'is' && d.filter[2] === 'null' && row[d.filter[0]] != null) m.delete(keyOf(d, row))
      else m.set(keyOf(d, row), row)
    }
    this.bump(name)
  }
  subscribe(name: string, l: Listener) { const s = this.listeners.get(name) ?? new Set(); s.add(l); this.listeners.set(name, s); return () => { s.delete(l) } }
  private bump(name: string) { this.arrays.delete(name); for (const l of this.listeners.get(name) ?? []) l() }
}

interface Ctx { operator: Operator; store: Store; supabase: SupabaseClient; ready: boolean; live: 'connecting' | 'live' | 'lost'; error: string | null }
const OpsCtx = createContext<Ctx | null>(null)

const EMPTY: Row[] = []

export function OpsProvider({ operator, children }: { operator: Operator; children: React.ReactNode }) {
  const supabase = useMemo(() => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!), [])
  const store = useMemo(() => new Store(), [])
  const [ready, setReady] = useState(false)
  const [live, setLive] = useState<Ctx['live']>('connecting')
  const [error, setError] = useState<string | null>(null)
  const can = useCallback((cap: string) => cap === 'public' || cap === 'staff' || (cap === 'root' ? operator.isRoot : operator.isRoot || operator.capabilities.includes(cap)), [operator])

  useEffect(() => {
    let channel: RealtimeChannel | null = null
    let cancelled = false
    const mine = TABLES.filter((t) => can(t.cap))
    const read = async (t: TableDef) => {
      let q = supabase.from(t.name).select('*')
      if (t.filter) q = q.filter(t.filter[0], t.filter[1], t.filter[2])
      if (t.order) q = q.order(t.order.column, { ascending: false }).limit(t.order.limit)
      const { data, error } = await q
      if (error) { console.error(`load ${t.name}:`, error.message); return `${t.name}: ${error.message}` }
      store.load(t.name, (data ?? []) as Row[]); return null
    }
    ;(async () => {
      // Subscribe first, then read: a change that lands between the two is not lost.
      channel = supabase.channel('ops')
      for (const t of mine) channel.on('postgres_changes', { event: '*', schema: 'public', table: t.name }, (p) => {
        store.apply(t.name, p.eventType, p.new as Row, p.old as Row)
      })
      channel.subscribe((status) => { if (cancelled) return; setLive(status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'lost' : 'connecting') })
      const errs = (await Promise.all(mine.map(read))).filter(Boolean) as string[]
      if (cancelled) return
      if (errs.length) setError(errs.join(' · '))
      setReady(true)
    })()
    return () => { cancelled = true; if (channel) void supabase.removeChannel(channel) }
  }, [supabase, store, can])

  const value = useMemo<Ctx>(() => ({ operator, store, supabase, ready, live, error }), [operator, store, supabase, ready, live, error])
  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>
}

export function useOps(): Ctx {
  const v = useContext(OpsCtx)
  if (!v) throw new Error('useOps outside OpsProvider')
  return v
}

/** One table, as an array; re-renders only when that table changes. */
export function useTable<T = Row>(name: string): T[] {
  const { store } = useOps()
  const sub = useCallback((l: Listener) => store.subscribe(name, l), [store, name])
  const get = useCallback(() => store.rows(name) as T[], [store, name])
  return useSyncExternalStore(sub, get, () => EMPTY as T[])
}

export function useCan(): (cap: string) => boolean {
  const { operator } = useOps()
  return useCallback((cap: string) => operator.isRoot || operator.capabilities.includes(cap), [operator])
}

/**
 * A figure the client cannot hold (sales totals, health facts): read through
 * a gated RPC when the screen opens, and again whenever one of `deps`
 * tables changes — a push-driven re-read, not a poll.
 */
export function useRpc<T>(fn: string, args: Record<string, unknown>, deps: string[]): { data: T | null; error: string | null; loading: boolean } {
  const { supabase, store } = useOps()
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [tick, setTick] = useState(0)
  const argsKey = JSON.stringify(args)
  useEffect(() => {
    const unsubs = deps.map((d) => store.subscribe(d, () => setTick((t) => t + 1)))
    return () => unsubs.forEach((u) => u())
  }, [store, deps.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc(fn, JSON.parse(argsKey))
      if (dead) return
      setState({ data: (data as T) ?? null, error: error?.message ?? null, loading: false })
    }, tick ? 400 : 0) // coalesce a burst of pushes into one re-read
    return () => { dead = true; clearTimeout(t) }
  }, [supabase, fn, argsKey, tick])
  return state
}
