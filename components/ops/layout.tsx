import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The shapes every back-office screen is built from.
 *
 * Before this, each screen wrote its own. Three files defined a `Stat`, two
 * defined a `Fact`, six declared their own `heading` style, and the messages
 * page pasted the same eight-line <h2> three times. Every one was slightly
 * different — a pixel of margin here, a weight there — and the eye registers
 * that as "scattered" before it can say why. Seventeen screens that each
 * look nearly right add up to a back office that looks nothing like one
 * thing.
 *
 * So: one Section, one Stat, one Fact. A screen that needs a heading uses
 * Section and gets the same heading every other screen has. The rule that
 * follows is the one the jobs screen already obeys — summary before detail,
 * the action beside the thing it acts on, and logs on request.
 */

/* ------------------------------------------------------------------
 * Section — a heading, an optional sentence, and what it heads
 * ------------------------------------------------------------------ */

/**
 * The heading and the note on their own, for a screen whose sections are
 * built up in a way Section cannot wrap -- a map over groups, a conditional
 * block. Section renders exactly these, so the look is one look either way.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        margin: '36px 0 8px',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--app-text-secondary)',
      }}
    >
      {children}
    </h2>
  )
}

export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: '0 0 12px',
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--app-text-muted)',
        maxWidth: 72 * 8,
      }}
    >
      {children}
    </p>
  )
}

export function Section({
  title,
  note,
  actions,
  children,
  first = false,
}: {
  title: string
  /** One sentence. What this is for, or what to be careful of. */
  note?: ReactNode
  /** Controls that belong to the whole section, right-aligned on the heading row. */
  actions?: ReactNode
  children: ReactNode
  /** Tighter top margin for the first section under a page title. */
  first?: boolean
}) {
  return (
    <section style={{ marginTop: first ? 4 : 36 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: note ? 6 : 12,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--app-text-secondary)',
          }}
        >
          {title}
        </h2>
        {actions ? <span style={{ display: 'inline-flex', gap: 8 }}>{actions}</span> : null}
      </div>
      {note ? (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--app-text-muted)',
            maxWidth: 72 * 8,
          }}
        >
          {note}
        </p>
      ) : null}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------
 * Stats — the summary strip at the top of a screen
 * ------------------------------------------------------------------ */

/**
 * A row of the few numbers that answer the screen's question at a glance.
 *
 * One grid, so tiles share edges and baselines whatever the page. The
 * column count follows the content rather than the viewport, so three tiles
 * do not stretch across a wide screen with dead space between them.
 */
export function Stats({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, max-content))',
        gap: 1,
        background: 'var(--app-border)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  note,
  href,
  tone = 'plain',
}: {
  label: string
  value: string | number
  /** One short line under the figure. */
  note?: string
  /** Makes the tile a link, for a figure that is also a place to go. */
  href?: string
  /**
   * What the figure means, encoded in colour as well as number, so what
   * needs attention reads at a glance. 'plain' is the default and most tiles.
   */
  tone?: 'plain' | 'good' | 'warn' | 'bad'
}) {
  const color =
    tone === 'bad'
      ? 'var(--status-critical-fg)'
      : tone === 'warn'
        ? 'var(--status-approaching-fg)'
        : tone === 'good'
          ? 'var(--accent)'
          : 'var(--app-text-primary)'

  const inner = (
    <div
      style={{
        background: 'var(--app-surface)',
        padding: '14px 18px',
        display: 'grid',
        gap: 2,
        minWidth: 150,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--app-text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
          fontVariantNumeric: 'tabular-nums',
          color,
        }}
      >
        {value}
      </span>
      {note ? (
        <span style={{ fontSize: 12, color: 'var(--app-text-muted)', lineHeight: 1.4 }}>{note}</span>
      ) : null}
    </div>
  )

  return href ? (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {inner}
    </Link>
  ) : (
    inner
  )
}

/* ------------------------------------------------------------------
 * Facts — label/value pairs about one thing
 * ------------------------------------------------------------------ */

/**
 * The details of one record — a user, a bank, a template — laid out as
 * pairs. A Stat is a number worth reading on its own; a Fact is a field that
 * only means something next to its label.
 */
export function Facts({ children }: { children: ReactNode }) {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '14px 24px',
        margin: 0,
        padding: '16px 18px',
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--r-md)',
      }}
    >
      {children}
    </dl>
  )
}

export function Fact({
  label,
  value,
  hint,
}: {
  label: string
  value: ReactNode
  hint?: string
}) {
  return (
    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
      <dt
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--app-text-muted)',
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </dd>
      {hint ? <span style={{ fontSize: 12, color: 'var(--app-text-muted)' }}>{hint}</span> : null}
    </div>
  )
}

/* ------------------------------------------------------------------
 * Panel — a bordered surface for a group of controls
 * ------------------------------------------------------------------ */

/**
 * A surface that lifts a group of controls off the page. Used sparingly:
 * border and fill say "separate object", and a screen where everything is
 * an object has no hierarchy. A form gets one. A list does not.
 */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 'var(--r-md)',
        display: 'grid',
        gap: 16,
      }}
    >
      {children}
    </div>
  )
}

/**
 * Words under a control. One sentence: what it does, or what to be careful of.
 * The same Note the composer uses, so hints read the same everywhere.
 */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--app-text-muted)' }}>
      {children}
    </p>
  )
}

/* ------------------------------------------------------------------
 * Tabs -- client-side since the back office stopped round-tripping to
 * switch a view. See ./Tabs.
 * ------------------------------------------------------------------ */
