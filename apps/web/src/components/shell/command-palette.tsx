'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * The header search, and the palette behind it.
 *
 * NAVIGATION ONLY. It moves between routes the nav already exposes and reads no
 * data — deliberately, so the shell's search box cannot become a surface that
 * has to be kept honest against the database. If it ever needs to find a post
 * or a conversation, that is a data change and belongs to a different pass.
 *
 * No `cmdk` dependency: this is a filtered list and a keydown handler, and the
 * kit ships its own visual language for both. Adding a component library to
 * render twelve links would be the larger change, not the smaller one.
 */

type Destination = { href: Route; label: string; hint: string }

/** Mirrors the rail's NAV. Kept flat and literal so it stays greppable. */
const DESTINATIONS: readonly Destination[] = [
  { href: '/home', label: 'Home', hint: 'Today, and what needs you' },
  { href: '/brain', label: 'Brand Brain', hint: 'What Sahoda knows about you' },
  { href: '/posts', label: 'Posts', hint: 'Draft, approve, publish' },
  { href: '/planner', label: 'Planner', hint: 'The schedule' },
  { href: '/inbox', label: 'Inbox', hint: 'Comments, messages, reviews' },
  { href: '/sites', label: 'Sites', hint: 'Generated pages' },
  { href: '/analytics', label: 'Analytics', hint: 'How it performed' },
  { href: '/connections', label: 'Connections', hint: 'Channels and accounts' },
  { href: '/wallet', label: 'Wallet', hint: 'Credits and spend' },
  { href: '/settings', label: 'Settings', hint: 'Workspace preferences' },
]

function matches(d: Destination, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (needle === '') return true
  return d.label.toLowerCase().includes(needle) || d.hint.toLowerCase().includes(needle)
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Results are real anchors, and Enter activates the highlighted one through
  // its own ref rather than through `useRouter`. Two reasons, in order:
  // middle-click, ⌘-click and "copy link address" all keep working; and the
  // component stays renderable without an app-router provider, which is what
  // lets Topbar be unit-tested in isolation at all.
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])

  const results = useMemo(() => DESTINATIONS.filter((d) => matches(d, query)), [query])

  // Clamp rather than reset: filtering down to fewer results must not silently
  // leave the cursor pointing past the end, which would make Enter a no-op.
  const active = results.length === 0 ? -1 : Math.min(cursor, results.length - 1)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
  }, [])

  // ⌘K / Ctrl+K, and Escape, from anywhere. Both are bound on the document
  // because the point of a global shortcut is that it works while focus is
  // somewhere else — and Escape especially: bound to the input alone it stops
  // working the moment the user tabs to a result, which is exactly when someone
  // reaching for Escape most expects it to fire.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((wasOpen) => !wasOpen)
      }
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Escape is NOT handled here — the document listener owns it, so it fires
  // wherever focus happens to be.
  function onInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      return setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      return setCursor((c) =>
        results.length === 0 ? 0 : (c - 1 + results.length) % results.length,
      )
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      linkRefs.current[active]?.click()
    }
  }

  return (
    <>
      {/* The trigger. A button that looks like a field, because it opens a
          dialog rather than accepting text in place — an actual <input> here
          would promise inline search it does not do. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-guide="topbar.search"
        className="surface-ring mx-auto flex h-9 w-[min(420px,100%)] items-center gap-2 rounded-lg bg-s2 px-[10px] text-left text-[13px] text-muted transition-micro hover:shadow-[inset_0_0_0_1px_var(--line)] max-narrow:hidden"
      >
        <Search size={15} className="shrink-0" aria-hidden />
        <span className="truncate">Search Sahoda</span>
        <kbd className="ml-auto shrink-0 rounded-sm bg-surface px-[5px] py-[1px] text-[11px] font-medium text-muted">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-ink/30 p-4 pt-[12vh]"
          onClick={close}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search Sahoda"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[520px] overflow-hidden rounded-lg bg-surface shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-line-soft px-3">
              <Search size={15} className="shrink-0 text-muted" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setCursor(0)
                }}
                onKeyDown={onInputKey}
                placeholder="Go to…"
                aria-label="Search destinations"
                className="h-[46px] w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </div>

            {results.length === 0 ? (
              /* An empty state that says what it searched, not just "no
                 results" — otherwise the user cannot tell a typo from a
                 surface that was never searchable. */
              <p className="px-3 py-6 text-center text-[13px] text-muted">
                Nothing here matches “{query.trim()}”. This searches pages, not content.
              </p>
            ) : (
              <ul className="max-h-[320px] overflow-y-auto p-2">
                {results.map((destination, index) => (
                  <li key={destination.href}>
                    <Link
                      href={destination.href}
                      ref={(node) => {
                        linkRefs.current[index] = node
                      }}
                      onClick={close}
                      onMouseEnter={() => setCursor(index)}
                      aria-current={index === active ? 'true' : undefined}
                      className={cn(
                        'flex h-[38px] w-full items-center gap-3 rounded-sm px-[9px] text-left text-[13px] transition-micro',
                        index === active ? 'bg-brand-wash text-accent' : 'text-ink-body',
                      )}
                    >
                      <span className="font-medium">{destination.label}</span>
                      <span className="truncate text-[12px] text-muted">{destination.hint}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
