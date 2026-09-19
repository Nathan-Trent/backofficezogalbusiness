'use client'

import { usePathname } from 'next/navigation'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'

/**
 * Client-side navigation. A click changes the URL with history.pushState —
 * Next's App Router picks that up and `usePathname` updates — and the
 * OpsRouter shows the screen from memory. No request leaves the browser.
 * Middle-click, ctrl-click and right-click keep working as a normal link.
 */
export function go(href: string) {
  window.history.pushState(null, '', href)
}

export function A({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (rest.target && rest.target !== '_self') return
    e.preventDefault(); go(href)
  }
  return <a href={href} onClick={click} {...rest} />
}

/** The current path split under /ops: '/ops/doka/shops/abc' → ['doka', 'shops', 'abc']. */
export function useOpsPath(): string[] {
  const p = usePathname() ?? '/ops'
  return p.replace(/^\/ops\/?/, '').split('/').filter(Boolean)
}
