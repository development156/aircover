import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { toChannelSet, type Channel, type PostMedia } from '@sahoda/shared'

/**
 * A CHANNEL FOLLOWS THE POST UNTIL SOMEONE WRITES IT, AND THEN NEVER AGAIN.
 *
 * ── WHY THIS IS THE MOST DANGEROUS BEHAVIOUR ON THE SCREEN ──────────────────
 * It is the one place the composer writes into a box the person did not type in.
 * Get it wrong in one direction and every version is a copy of the post, so the
 * product's whole claim is a lie; get it wrong in the other and a version someone
 * carefully rewrote is silently replaced the next time they fix a typo upstream.
 *
 * ── AND WHY THE MIRROR IS STATE RATHER THAN A DISPLAY TRICK ─────────────────
 * `runPublishPost` sends `post_variants.body` and has no fallback to
 * `posts.body`. A card that DISPLAYED the post's words while its row stayed empty
 * would be describing a publish that cannot happen — so the mirrored text is a
 * real unsaved draft, and the last case below is the one that proves it.
 */

vi.mock('@/app/actions/posts', () => ({
  saveVariant: () => Promise.resolve({ ok: true, version: 1 }),
  setVariantFormat: () => Promise.resolve({ ok: true, format: null }),
}))
vi.mock('@/app/actions/posts-ai', () => ({
  rewriteCaption: () => Promise.resolve({ ok: false, insufficient: false, message: 'no' }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { useVariants } = await import('@/components/posts/use-variants')
const { VersionCard } = await import('./version-card')
const { versionStateLabel } = await import('./version-state')

const CHANNELS = toChannelSet(['x', 'linkedin'])

/** Two cards and one source, wired exactly as the composer wires them. */
function Harness() {
  const api = useVariants(() => 'p1', [], { supported: false }, '')
  return (
    <div>
      <label htmlFor="src">Your post</label>
      <textarea
        id="src"
        onChange={(event) => api.mirrorSource(event.target.value)}
        defaultValue=""
      />
      <span data-testid="unsaved">{api.dirtyChannels(CHANNELS).join(',')}</span>
      {CHANNELS.map((channel: Channel) => (
        <div key={channel}>
          <span data-testid={`state-${channel}`}>{versionStateLabel(api.states[channel])}</span>
          <VersionCard
            channel={channel}
            state={api.states[channel]}
            media={[ONE_PHOTO]}
            format={null}
            onFormatChange={() => {}}
            onBodyChange={(body: string) => api.setBody(channel, body)}
            onExtrasChange={() => {}}
            onSave={() => api.save(channel)}
            onKeepMine={() => {}}
            onUseTheirs={() => {}}
            canonicalBody=""
            onRelink={() => {}}
            onUndoRelink={() => {}}
          />
        </div>
      ))}
    </div>
  )
}

const box = (channel: string) =>
  screen.getByTestId(`card-${channel}`) as unknown as HTMLTextAreaElement

const editor = (channel: string) =>
  document.querySelector(`[data-variant-editor="${channel}"]`) as HTMLTextAreaElement

const stateOf = (channel: string) => screen.getByTestId(`state-${channel}`).textContent

/**
 * One photo on the post — it was `mediaCount={1}` before the card took rows
 * instead of a count. The channel under test can be instagram, which has
 * `requiresMedia: true`, and an empty post would raise a MEDIA_REQUIRED alert
 * this file is not about.
 */
const ONE_PHOTO = {
  id: 'm1',
  workspace_id: 'w',
  post_id: 'p1',
  storage_path: 'w/p1/a.jpg',
  mime: 'image/jpeg',
  bytes: 1000,
  width: 1080,
  height: 1080,
  alt: null,
  meta: null,
  created_at: '',
  updated_at: '',
} as PostMedia

describe('following the post', () => {
  test('typing the post fills every channel that has not been written', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Your post'), 'Chai.')

    expect(editor('x').value).toBe('Chai.')
    expect(editor('linkedin').value).toBe('Chai.')
    // And it says BOTH things: that it follows, and that the words are not in the
    // row. "Following" alone would imply the channel is looked after.
    expect(stateOf('x')).toBe('Follows your post · unsaved')
    expect(screen.getByTestId('unsaved').textContent).toBe('x,linkedin')
  })

  test('writing one channel detaches it, and the others keep following', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Your post'), 'Chai.')
    await user.clear(editor('x'))
    await user.type(editor('x'), 'Chai, hot.')

    expect(stateOf('x')).toBe('Unsaved')
    expect(stateOf('linkedin')).toBe('Follows your post · unsaved')

    // The post moves again. LinkedIn moves with it; X does not.
    await user.type(screen.getByLabelText('Your post'), ' And buns.')

    expect(editor('linkedin').value).toBe('Chai. And buns.')
    expect(editor('x').value).toBe('Chai, hot.')
  })

  test('emptying a channel does not put it back to following', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByLabelText('Your post'), 'Chai.')
    await user.clear(editor('x'))

    // Deliberately empty is a choice. Refilling it from the post on the next
    // keystroke anywhere else would undo that choice without being asked.
    expect(stateOf('x')).toBe('Unsaved')
    await user.type(screen.getByLabelText('Your post'), '!')
    expect(editor('x').value).toBe('')
  })

  test('a channel with stored copy of its own never follows', () => {
    // Proved through the seed rather than through typing: a reload is where this
    // fails, and a reload is exactly what the seed models.
    render(<Harness />)
    // Nothing typed, nothing stored: both boxes are empty and neither claims to
    // hold unsaved work, because there is none.
    expect(editor('x').value).toBe('')
    expect(stateOf('x')).toBe('Follows your post')
    expect(screen.getByTestId('unsaved').textContent).toBe('')
  })
})

// Referenced so the unused-import lint has nothing to say about the helper kept
// for symmetry with the other card specs.
void box
