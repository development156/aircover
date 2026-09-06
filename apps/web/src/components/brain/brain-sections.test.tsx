import { render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { BrainSections } from './brain-sections'

/**
 * The no-workspace branch of every field tab.
 *
 * It read "There is nothing to show until the Brand Brain has been resolved
 * once." with no control under it. A person with no workspace cannot resolve
 * anything: the resolve needs a workspace to live in, so the sentence named a
 * remedy that could not work — the defect `no-impossible-remedy.spec.ts` exists
 * to catch, on a branch it does not visit. /brain's own page and the console
 * both offer "Create a workspace" for the same status; this is the third
 * rendering of it and the only one that did not.
 */
vi.mock('@/lib/brand/read-brain', () => ({
  readBrain: async () => ({ status: 'no-workspace' }),
}))
vi.mock('@/components/workspace/create-workspace-button', () => ({
  CreateWorkspaceButton: () => <button type="button">Create a workspace</button>,
}))

describe('BrainSections with no workspace', () => {
  test('offers the one remedy that can work, and does not ask for a resolve', async () => {
    render(await BrainSections({ only: ['brand_persona'] }))

    expect(screen.getByRole('button', { name: /create a workspace/i })).toBeInTheDocument()
    expect(screen.queryByText(/resolved once/i)).not.toBeInTheDocument()
  })
})
