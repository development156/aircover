import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PostMedia } from '@sahoda/shared'
import type { VariantExtras } from '@/lib/posts/variant-extras'

import { VersionCard } from './version-card'

vi.mock('@/app/actions/posts-ai', () => ({ rewriteSelection: vi.fn() }))

/**
 * CHANGING THE FORMAT CHANGES THE RULE, AND THE VERDICT HAS TO FOLLOW.
 *
 * ── THE FAKE-GREEN THIS CLOSES ───────────────────────────────────────────────
 * Attach a landscape photo while Instagram's version says "One photo" — legal,
 * 1.5:1 is inside the feed range — and then change that card to "A story".
 * `decideAttach` ran at ATTACH time against the format in force then, and never
 * ran again. The card stayed green on a payload Instagram refuses, which is doc
 * 13 §10's root cause exactly: the editor green on something the platform will
 * reject.
 *
 * Publishing genuinely cannot catch it — `PublishRequestMedia` carries
 * `storagePath`, `mime` and `bytes` and no pixels — so the editor being the only
 * place it COULD be caught is precisely why it had to be.
 *
 * WHAT WOULD MAKE THIS WORTHLESS: asserting that a story with a landscape photo
 * is red. That passes against an implementation that calls every landscape photo
 * wrong. Every case below has its control: the SAME photo, the SAME channel, a
 * different format.
 */

const photo = (width: number, height: number): PostMedia =>
  ({
    id: `m-${width}x${height}`,
    workspace_id: 'w',
    post_id: 'p',
    storage_path: 'w/p/x.jpg',
    mime: 'image/jpeg',
    bytes: 1000,
    width,
    height,
    alt: null,
    meta: null,
    created_at: '',
    updated_at: '',
  }) as PostMedia

const LANDSCAPE = photo(1920, 1080)
const UPRIGHT = photo(1080, 1920)

function card(format: 'image' | 'story' | 'carousel' | null, media: PostMedia[]) {
  render(
    <VersionCard
      channel="instagram"
      state={{
        body: 'Chai',
        extras: {} as VariantExtras,
        dirty: false,
        saving: false,
        error: null,
        conflict: null,
        version: 1,
        following: false,
        permalink: null,
        relinkedFrom: null,
      }}
      media={media}
      format={format}
      onFormatChange={() => {}}
      onBodyChange={() => {}}
      onExtrasChange={() => {}}
      onSave={() => {}}
      onKeepMine={() => {}}
      onUseTheirs={() => {}}
      canonicalBody=""
      onRelink={() => {}}
      onUndoRelink={() => {}}
    />,
  )
}

const shapeComplaint = () => screen.queryByText(/taller than it is wide/i)

describe('the shape rule follows the format, not the upload', () => {
  test('a landscape photo is fine as a feed post', () => {
    card('image', [LANDSCAPE])
    expect(shapeComplaint()).not.toBeInTheDocument()
  })

  test('and the SAME photo is refused the moment the card says story', () => {
    card('story', [LANDSCAPE])
    expect(shapeComplaint()).toBeInTheDocument()
    // READ THE TEXT: the sentence has to tell the writer what to do about it.
    expect(screen.getByText(/Crop it upright, or post it to the feed instead/i)).toBeInTheDocument()
  })

  test('an upright photo passes as a story — it is not "landscape is banned"', () => {
    card('story', [UPRIGHT])
    expect(shapeComplaint()).not.toBeInTheDocument()
  })

  test('a version stating no format is held to nothing', () => {
    card(null, [LANDSCAPE])
    expect(shapeComplaint()).not.toBeInTheDocument()
  })

  test('one sentence, however many bad photos', () => {
    // Four cards each listing three complaints is the wall of text docs/27 §1 is
    // about. One is enough to send the writer to the media well.
    card('story', [LANDSCAPE, photo(1600, 900), photo(1200, 800)])
    expect(screen.getAllByText(/taller than it is wide/i)).toHaveLength(1)
  })
})
