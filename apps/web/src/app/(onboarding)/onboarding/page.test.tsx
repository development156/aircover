import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * /onboarding answers "which workspace" and "which brain" three ways each, and
 * used to render the SAME card for "none" and "could not read": a Create
 * workspace button over a workspace that exists. Each arm below is a different
 * claim with a different remedy, and the guard is that the wrong remedy never
 * appears: no Create button on a failed read, no Reload on a real absence.
 */

const state = vi.hoisted(() => ({
  workspace: { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } } as
    | { status: 'ok'; workspace: { id: string; name: string } }
    | { status: 'none' }
    | { status: 'unreadable' },
  brain: { status: 'none' } as
    { status: 'none' } | { status: 'unreadable' } | { status: 'ok'; brain: unknown },
}))

vi.mock('@/lib/workspaces', () => ({ activeWorkspaceRead: async () => state.workspace }))
vi.mock('@/lib/onboarding/read-brain', () => ({ readActiveBrandMemory: async () => state.brain }))
vi.mock('@/lib/onboarding/boot-video-seen', () => ({ readBootVideoSeen: async () => 'seen' }))
vi.mock('@/components/onboarding/stage/onboarding-stage', () => ({
  OnboardingStage: (props: { isFree: boolean; hasSavedBrain: boolean }) => (
    <div
      data-testid="stage"
      data-free={String(props.isFree)}
      data-saved={String(props.hasSavedBrain)}
    />
  ),
}))
vi.mock('@/components/workspace/create-workspace-button', () => ({
  CreateWorkspaceButton: () => <button>Create workspace</button>,
}))
vi.mock('@/components/onboarding/sign-out-link', () => ({
  SignOutLink: () => <a href="/sign-out">Sign out</a>,
}))

const { default: OnboardingPage } = await import('./page')

beforeEach(() => {
  state.workspace = { status: 'ok', workspace: { id: 'ws_1', name: 'Acme' } }
  state.brain = { status: 'none' }
})

describe('/onboarding: the workspace arms', () => {
  test('no workspace: says so, and offers to create one', async () => {
    state.workspace = { status: 'none' }
    render(await OnboardingPage())

    expect(screen.getByText('You have no workspace yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create workspace' })).toBeTruthy()
    expect(screen.queryByText('Reload')).toBeNull()
  })

  // THE DEFECT. A failed read is not an account with no workspace.
  test('a failed workspace read: says it could not read, and never offers Create workspace', async () => {
    state.workspace = { status: 'unreadable' }
    render(await OnboardingPage())

    expect(screen.getByText('Sahoda could not read your workspace')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull()
    expect(screen.queryByText(/no workspace/i)).toBeNull()
    expect(screen.getByText('Reload')).toBeTruthy()
    expect(screen.queryByTestId('stage')).toBeNull()
  })
})

describe('/onboarding: the brain arms', () => {
  test('no brain: the stage, free', async () => {
    render(await OnboardingPage())
    expect(screen.getByTestId('stage').getAttribute('data-free')).toBe('true')
  })

  test('a saved brain: the stage, priced', async () => {
    state.brain = { status: 'ok', brain: {} }
    render(await OnboardingPage())
    const stage = screen.getByTestId('stage')
    expect(stage.getAttribute('data-free')).toBe('false')
    expect(stage.getAttribute('data-saved')).toBe('true')
  })

  test('a failed brain read: no stage, no price claim, a reload', async () => {
    state.brain = { status: 'unreadable' }
    render(await OnboardingPage())

    expect(screen.queryByTestId('stage')).toBeNull()
    expect(screen.getByText('Sahoda could not read your Brand Brain')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create workspace' })).toBeNull()
    expect(screen.getByText('Reload')).toBeTruthy()
  })
})
