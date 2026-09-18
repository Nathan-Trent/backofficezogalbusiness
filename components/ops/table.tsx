import Link from 'next/link'

/**
 * The table furniture, once.
 *
 * Density is the point here — an operator wants many rows visible at a glance,
 * not one card per fact. Everything is a real `<table>` so a browser's find,
 * selection and copy behave the way an operator expects when they need to
 * paste a user id into a support reply.
 */
export function OpsTable({
  headers,
  children,
  empty,
}: {
  headers: string[]
  children: React.ReactNode
  /** Shown instead of the table when there are no rows. */
  empty?: string
}) {
  const rows = Array.isArray(children) ? children.flat() : children
  const isEmpty = Array.isArray(rows) ? rows.length === 0 : !rows

  if (isEmpty && empty) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: 'var(--app-text-muted)' }}>{empty}</p>
    )
  }

  return (
    // Wide tables scroll inside their own box rather than pushing the page
    // sideways, which is what makes the sidebar stay put.
    <div style={{ overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  color: 'var(--app-text-muted)',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: 'var(--surface-sunken)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Td({
  children,
  mono,
  muted,
  nowrap,
}: {
  children: React.ReactNode
  mono?: boolean
  muted?: boolean
  nowrap?: boolean
}) {
  return (
    <td
      className={mono ? 'tabular' : undefined}
      style={{
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        color: muted ? 'var(--app-text-muted)' : 'var(--app-text-primary)',
        whiteSpace: nowrap ? 'nowrap' : undefined,
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  )
}

/**
 * A status word, coloured only where colour means something.
 *
 * 'failed' is the one case that earns the critical colour: it is a real fault
 * an operator has to act on. Everything else stays neutral, so the red on this
 * screen always means the same thing.
 */
/**
 * A stored instant, as the operator reads it.
 *
 * Every log in the back office printed time its own way -- one in en-NG, one
 * in en-GB with no zone (so, UTC), one as a bare date, one as a raw ISO slice.
 * Two of those showed UTC to a person reading a Lagos clock, so a 14:13
 * reminder read as 13:13 and nobody could say which one it was.
 *
 * One formatter, Lagos, the same shape everywhere: "12 Sep, 14:13".
 */
export function when(iso: string, dateOnly = false): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit' }),
  })
}

export function StatusPill({ status }: { status: string }) {
  const critical = status === 'failed'
  const good = status === 'ok' || status === 'sent'
  // Waiting, or in flight. Neither has happened yet, and neither should read
  // as either done or broken.
  const pending = status === 'scheduled' || status === 'sending' || status === 'running'

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 'var(--r-full)',
        color: critical
          ? 'var(--status-critical-fg)'
          : good
            ? 'var(--accent)'
            : pending
              ? 'var(--status-approaching-fg)'
              : 'var(--app-text-secondary)',
        background: critical
          ? 'var(--status-critical-bg)'
          : good
            ? 'var(--accent-dim)'
            : pending
              ? 'var(--status-approaching-bg)'
              : 'var(--surface-sunken)',
      }}
    >
      {status}
    </span>
  )
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header style={{ marginBottom: 20 }}>
      <h1
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
        }}
      >
        {title}
      </h1>
      {subtitle ? (
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 13,
            color: 'var(--app-text-secondary)',
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}

/** A filter chip row rendered as links, so filters survive a refresh. */
/**
 * A row of filter chips.
 *
 * The query string is built with URLSearchParams rather than by joining
 * strings. It used to be joined, and a caller that needed to carry a second
 * parameter did the only thing the old signature allowed — it put it in `base`
 * as "/admin/templates?tab=narrative&" — which produced
 * "…?tab=narrative&?surface=push". That names the parameter "?surface", so the
 * page read `surface` as empty and the chips appeared to do nothing at all.
 *
 * `params` is the supported way to carry the others, and paging uses the same
 * shape for the same reason.
 */
export function FilterLinks({
  options,
  current,
  base,
  param,
  params,
  allLabel,
}: {
  options: { value: string; label: string }[]
  current: string | null
  base: string
  param: string
  /** Other filters to keep, so choosing one never drops another. */
  params?: Record<string, string | undefined>
  /**
   * Null when the row is a set of tabs rather than a filter.
   * "All" is meaningless where one option is always selected, and an
   * unselectable chip sitting first invites the click that does nothing.
   */
  allLabel?: string | null
}) {
  const href = (value: string) => {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) if (v && k !== param) query.set(k, v)
    if (value) query.set(param, value)
    const q = query.toString()
    return q ? `${base}?${q}` : base
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
      {(allLabel === null ? options : [{ value: '', label: allLabel ?? 'All' }, ...options]).map((o) => {
        const active = (current ?? '') === o.value
        return (
          <Link
            key={o.value || 'all'}
            href={href(o.value)}
            style={{
              padding: '5px 11px',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              borderRadius: 'var(--r-full)',
              textDecoration: 'none',
              color: active ? 'var(--accent)' : 'var(--app-text-secondary)',
              background: active ? 'var(--accent-dim)' : 'var(--surface)',
              border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
            }}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}

/**
 * Page links.
 *
 * Links rather than buttons, so a page is a URL an operator can bookmark,
 * paste into a support thread, or reload without losing their place. The same
 * reason the filters and the search are links.
 */
export function Pagination({
  page,
  pageSize,
  total,
  base,
  params,
}: {
  page: number
  pageSize: number
  total: number
  base: string
  /** Filters to carry across, so paging never silently drops one. */
  params?: Record<string, string | undefined>
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null

  const href = (p: number) => {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) if (v) query.set(k, v)
    if (p > 1) query.set('page', String(p))
    const q = query.toString()
    return q ? `${base}?${q}` : base
  }

  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 12,
        fontSize: 12,
        color: 'var(--app-text-muted)',
      }}
    >
      <span className="tabular">
        {first}–{last} of {total}
      </span>

      <span style={{ display: 'flex', gap: 6 }}>
        {page > 1 ? (
          <Link href={href(page - 1)} style={pageLink}>
            ← Previous
          </Link>
        ) : null}
        <span className="tabular" style={{ padding: '5px 10px' }}>
          {page} / {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} style={pageLink}>
            Next →
          </Link>
        ) : null}
      </span>
    </div>
  )
}

const pageLink: React.CSSProperties = {
  padding: '5px 11px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  color: 'var(--accent)',
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
}
