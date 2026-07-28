import { describe, expect, it } from 'vitest'

import {
  ARTIFACT_MAX_BYTES,
  EMPTY_DRAFT,
  artifactPath,
  checkArtifact,
  checkFinalize,
  draftHasContent,
  draftIsDirty,
  saveLabel,
  saveToneOf,
  type QaDraft,
} from './qa-draft'

const draft = (over: Partial<QaDraft> = {}): QaDraft => ({ ...EMPTY_DRAFT, ...over })

describe('what may be attached to a QA run', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(checkArtifact({ size: 1024, type })).toMatchObject({ ok: true })
  })

  it('maps each type to the extension the bucket path will carry', () => {
    expect(checkArtifact({ size: 1, type: 'image/png' })).toMatchObject({ extension: 'png' })
    expect(checkArtifact({ size: 1, type: 'image/jpeg' })).toMatchObject({ extension: 'jpg' })
    expect(checkArtifact({ size: 1, type: 'image/webp' })).toMatchObject({ extension: 'webp' })
  })

  it.each(['application/pdf', 'image/gif', 'text/html', 'image/svg+xml', ''])(
    'refuses %s',
    (type) => {
      expect(checkArtifact({ size: 1024, type })).toMatchObject({ ok: false })
    },
  )

  it('refuses an SVG even though it is an image — it can carry script', () => {
    expect(checkArtifact({ size: 100, type: 'image/svg+xml' })).toMatchObject({ ok: false })
  })

  it('accepts exactly the limit and refuses one byte more', () => {
    // The boundary, both sides. An off-by-one here is a 10 MB upload that dies
    // at the bucket instead of in the browser.
    expect(checkArtifact({ size: ARTIFACT_MAX_BYTES, type: 'image/png' })).toMatchObject({
      ok: true,
    })
    expect(checkArtifact({ size: ARTIFACT_MAX_BYTES + 1, type: 'image/png' })).toMatchObject({
      ok: false,
    })
  })

  it('names the actual size, so the message is useful rather than merely true', () => {
    const result = checkArtifact({ size: 12.5 * 1024 * 1024, type: 'image/png' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('12.5 MB')
  })

  it('refuses an empty file rather than uploading nothing', () => {
    expect(checkArtifact({ size: 0, type: 'image/png' })).toMatchObject({ ok: false })
  })
})

describe('artifactPath', () => {
  it('builds the path doc 13 §3 specifies', () => {
    expect(artifactPath('run-1', 'abc', 'png')).toBe('qa/run-1/abc.png')
  })
})

describe('when there is something worth saving', () => {
  it('is empty until something is typed or a task is picked', () => {
    expect(draftHasContent(EMPTY_DRAFT)).toBe(false)
    expect(draftHasContent(draft({ summary: '  ' }))).toBe(false)
    expect(draftHasContent(draft({ summary: 'checked the board' }))).toBe(true)
    expect(draftHasContent(draft({ taskCode: 'SL-019' }))).toBe(true)
  })

  it('compares against what the SERVER acknowledged, not the last keystroke', () => {
    // The bug this prevents: marking the draft clean when the save is merely
    // attempted. Then a failed save is never retried, and only the next
    // keystroke ever reaches the server — which is exactly the tab-kill case
    // §11 says must not lose notes.
    const typed = draft({ summary: 'one' })
    const acknowledged = draft({ summary: 'one' })

    expect(draftIsDirty(typed, acknowledged)).toBe(false)
    expect(draftIsDirty(draft({ summary: 'two' }), acknowledged)).toBe(true)
  })

  it('treats a never-saved draft with content as dirty', () => {
    expect(draftIsDirty(draft({ details: 'notes' }), null)).toBe(true)
    expect(draftIsDirty(EMPTY_DRAFT, null)).toBe(false)
  })

  it('notices a task change on its own, with the text untouched', () => {
    const saved = draft({ summary: 'same', taskCode: 'SL-019' })
    expect(draftIsDirty({ ...saved, taskCode: 'SL-020' }, saved)).toBe(true)
  })
})

describe('the save indicator can only claim what happened', () => {
  it('says Saved with a time only for a real acknowledgement', () => {
    const at = new Date('2026-07-28T09:02:07Z')
    expect(saveLabel({ kind: 'saved', at })).toMatch(/^Saved · \d{2}:\d{2}:\d{2}$/)
  })

  it.each([
    { kind: 'idle' } as const,
    { kind: 'saving' } as const,
    { kind: 'failed', message: 'We could not save that.' } as const,
  ])('never says "Saved" for %o', (state) => {
    // The honesty rule, as an assertion: no state other than `saved` may render
    // a string a person would read as saved.
    expect(saveLabel(state)).not.toMatch(/^Saved/)
  })

  it('shows the failure reason rather than a generic word', () => {
    expect(saveLabel({ kind: 'failed', message: 'Your account cannot write QA runs.' })).toBe(
      'Your account cannot write QA runs.',
    )
  })

  it('tones anything that is not a confirmed save as needing attention', () => {
    expect(saveToneOf({ kind: 'saved', at: new Date() })).toBe('ok')
    expect(saveToneOf({ kind: 'saving' })).toBe('busy')
    expect(saveToneOf({ kind: 'idle' })).toBe('warn')
    expect(saveToneOf({ kind: 'failed', message: 'x' })).toBe('warn')
  })
})

describe('sealing a run', () => {
  const ready = draft({ runId: 'run-1', summary: 'checked the credit flow' })

  it('accepts a complete run', () => {
    expect(checkFinalize(ready, 'pass')).toEqual({ ok: true })
  })

  it('refuses without a verdict', () => {
    expect(checkFinalize(ready, null)).toMatchObject({ ok: false })
  })

  it('refuses a status the database would reject anyway', () => {
    // 'running' is a real OpsQaStatus but not a way to FINISH.
    expect(checkFinalize(ready, 'running')).toMatchObject({ ok: false })
  })

  it('refuses an empty summary — a sealed run cannot be edited afterwards', () => {
    expect(checkFinalize(draft({ runId: 'run-1', summary: '   ' }), 'pass')).toMatchObject({
      ok: false,
    })
  })

  it('refuses when nothing has been saved, so there is no run to finish', () => {
    expect(checkFinalize(draft({ summary: 'notes' }), 'pass')).toMatchObject({ ok: false })
  })
})
