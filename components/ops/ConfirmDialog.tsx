'use client'

import { useEffect, useRef } from 'react'

/**
 * A confirmation that says what will happen.
 *
 * Not window.confirm: that renders one line of unstyled text, cannot say which
 * direction is the dangerous one, and on a phone appears attached to the
 * browser rather than the app. This is a real dialog with room for a sentence
 * about consequences, which is the entire point — an operator should be able to
 * read what a switch does *before* moving it, not discover it afterwards.
 *
 * Escape and the backdrop both cancel. The confirm button never gets focus on
 * open, so a stray Enter cannot carry out the thing being warned about.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'normal',
  busy,
  wide = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: React.ReactNode
  confirmLabel: string
  tone?: 'normal' | 'danger'
  busy?: boolean
  /** For a dialog that holds a form rather than a sentence. */
  wide?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    cancelRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const danger = tone === 'danger'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(0, 0, 0, 0.45)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: wide ? 640 : 420,
          padding: 20,
          borderRadius: 'var(--r-md, 12px)',
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border-subtle, #e5e5e5)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--app-text-primary, #111)',
          }}
        >
          {title}
        </h2>

        <div
          style={{
            margin: '10px 0 0',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--app-text-secondary, #444)',
          }}
        >
          {body}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              minHeight: 40,
              padding: '0 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              borderRadius: 'var(--r-sm, 8px)',
              background: 'transparent',
              border: '1px solid var(--border-subtle, #e5e5e5)',
              color: 'var(--app-text-secondary, #444)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              minHeight: 40,
              padding: '0 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: busy ? 'wait' : 'pointer',
              borderRadius: 'var(--r-sm, 8px)',
              background: danger ? 'var(--danger, #c0392b)' : 'var(--accent, #1f6f5c)',
              border: 'none',
              color: '#fff',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
