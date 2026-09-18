'use client'

import { useState } from 'react'
import { WORLD_PATH } from '@/components/ops/world-path'

/**
 * Where Doka users sign in from, on a flat map (zogal.app's map, same
 * bones). A mark per place; its size follows how many; the ones seen in the
 * last hour pulse. Hover a mark to read the place and the count.
 */
export interface Point { city: string; country: string; lat: number; lng: number; n: number; last: string }

const W = 1000, H = 500
const xy = (lat: number, lng: number): [number, number] => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H]

export function WorldMap({ points, height = 380 }: { points: Point[]; height?: number }) {
  const [hover, setHover] = useState<Point | null>(null)
  const max = Math.max(1, ...points.map((p) => p.n))
  const live = (p: Point) => Date.now() - Date.parse(p.last) < 3_600_000
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 40 ${W} ${H - 90}`} style={{ width: '100%', height, display: 'block', borderRadius: 12, background: 'var(--surface-sunken)' }} role="img" aria-label="Where Doka users sign in from">
        <defs>
          <radialGradient id="glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="0.4" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={WORLD_PATH} fill="var(--border-subtle)" stroke="var(--surface)" strokeWidth="0.6" />
        {points.map((p, i) => {
          const [x, y] = xy(p.lat, p.lng)
          const r = 6 + 22 * Math.sqrt(p.n / max)
          const on = live(p)
          return (
            <g key={i} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}>
              <circle cx={x} cy={y} r={r} fill="url(#glow)" className={on ? 'ops-map-live' : undefined} />
              <circle cx={x} cy={y} r={on ? 4 : 3} fill={on ? '#fff' : 'var(--accent)'} stroke="var(--accent)" strokeWidth="1.5" />
            </g>
          )
        })}
      </svg>
      {hover ? (
        <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border-subtle)', fontSize: 13 }}>
          <strong>{[hover.city, hover.country].filter(Boolean).join(', ')}</strong>
          <span style={{ color: 'var(--app-text-muted)' }}> · {hover.n} sign-in{hover.n === 1 ? '' : 's'}{live(hover) ? ' · in the last hour' : ''}</span>
        </div>
      ) : null}
      {points.length === 0 ? <p style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0, fontSize: 13, color: 'var(--app-text-muted)' }}>No sign-ins located yet. The first one lights a place up.</p> : null}
      <style>{`@keyframes ops-map-pulse { 0%,100% { transform: scale(1); opacity: .9 } 50% { transform: scale(1.35); opacity: .5 } } .ops-map-live { transform-box: fill-box; transform-origin: center; animation: ops-map-pulse 2.4s ease-in-out infinite } @media (prefers-reduced-motion: reduce) { .ops-map-live { animation: none } }`}</style>
    </div>
  )
}
