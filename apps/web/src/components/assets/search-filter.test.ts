import { describe, expect, it } from 'vitest'
import { parseSearch } from '@sahoda/shared'
import type { AssetFolder } from '@sahoda/shared'

import { resolveFolderNames, searchAnswer } from './search-filter'
import type { AssetCard } from '@/lib/assets/view'

const NOW = new Date('2026-08-26T12:00:00.000Z')

const card = (over: Partial<AssetCard> = {}): AssetCard => ({
  id: 'a',
  title: 'Shopfront at dusk',
  alt: 'The shop lit up',
  kind: 'image',
  mime: 'image/jpeg',
  bytes: 240_000,
  width: 1600,
  height: 900,
  createdAt: '2026-08-25T09:00:00.000Z',
  previewUrl: null,
  usage: [],
  folderIds: [],
  deletedAt: null,
  ...over,
})

const folder = (id: string, name: string): AssetFolder => ({
  id,
  workspace_id: 'w',
  parent_id: null,
  name,
  created_by: null,
  created_at: '2026-08-20T00:00:00.000Z',
  updated_at: '2026-08-20T00:00:00.000Z',
})

describe('resolveFolderNames', () => {
  it('matches case and spacing loosely, the way sameFolderName does', () => {
    const folders = [folder('f1', 'Diwali  Campaign')]
    const resolved = resolveFolderNames(['diwali campaign'], folders)
    expect(resolved.folderIds).toEqual(['f1'])
    expect(resolved.unresolvedNames).toEqual([])
  })

  it('names what did not resolve, rather than silently dropping it', () => {
    const resolved = resolveFolderNames(['ghost'], [folder('f1', 'Diwali')])
    expect(resolved.folderIds).toEqual([])
    expect(resolved.unresolvedNames).toEqual(['ghost'])
  })
})

describe('searchAnswer', () => {
  it('type:image matches an image and not a rule that fails', () => {
    const parsed = parseSearch('type:image')
    const resolved = resolveFolderNames(parsed.folderNames, [])
    expect(searchAnswer(card({ kind: 'image' }), parsed, resolved, NOW)).toBe('yes')
  })

  it('a typo token compiles to no rule at all, so it matches everyone', () => {
    // `type:vidoe` never reaches `rules` — parseSearch puts it in `unusable` —
    // so this is the same as searching nothing, never a search that fails shut.
    const parsed = parseSearch('type:vidoe')
    expect(parsed.rules).toEqual([])
    const resolved = resolveFolderNames(parsed.folderNames, [])
    expect(searchAnswer(card(), parsed, resolved, NOW)).toBe('yes')
  })

  it('keeps the three-valued answer for a column that was never read', () => {
    const parsed = parseSearch('shape:landscape')
    const resolved = resolveFolderNames(parsed.folderNames, [])
    expect(searchAnswer(card({ width: null, height: null }), parsed, resolved, NOW)).toBe('unknown')
  })

  it('in: with no matching folder is a definite no, never "matches everything"', () => {
    const parsed = parseSearch('in:ghost')
    const resolved = resolveFolderNames(parsed.folderNames, [folder('f1', 'Diwali')])
    expect(searchAnswer(card({ folderIds: ['f1'] }), parsed, resolved, NOW)).toBe('no')
  })

  it('in: on a card whose filings were never read is unknown, not no', () => {
    const parsed = parseSearch('in:diwali')
    const resolved = resolveFolderNames(parsed.folderNames, [folder('f1', 'Diwali')])
    expect(searchAnswer(card({ folderIds: null }), parsed, resolved, NOW)).toBe('unknown')
  })

  it('free text is always decidable and never reports unknown', () => {
    const parsed = parseSearch('dusk')
    const resolved = resolveFolderNames(parsed.folderNames, [])
    expect(searchAnswer(card({ title: 'Shopfront at dusk' }), parsed, resolved, NOW)).toBe('yes')
    expect(searchAnswer(card({ title: 'Noon shot', alt: null }), parsed, resolved, NOW)).toBe('no')
  })
})
