'use client'

import dynamic from 'next/dynamic'

/**
 * The no-workspace remedy on every /brain field tab, loaded in the browser
 * rather than at first load.
 *
 * `CreateWorkspaceButton` carries `sonner` for the failure toast it raises when
 * `createWorkspace` comes back with a message. Imported straight into
 * `BrainSections` (a server component) that toast bundle, about 34 kB, sat on
 * the first load of every field tab, past the route's JS budget. It renders in
 * exactly one branch below: no workspace, a state a reader who has a workspace
 * never reaches, so nearly every visit downloaded 34 kB it had no use for.
 *
 * `next/dynamic` only splits a chunk off first load from inside a client
 * boundary, which is why this thin wrapper exists. `ssr: false` for the same
 * reason: a server-rendered dynamic import stays in the route's first-load
 * manifest to hydrate, defeating the point. The button still submits its
 * create-workspace form and still surfaces a failure, one tick later, in the
 * one branch that shows it.
 */
const CreateWorkspaceButton = dynamic(
  () =>
    import('@/components/workspace/create-workspace-button').then(
      (mod) => mod.CreateWorkspaceButton,
    ),
  { ssr: false },
)

export function CreateWorkspaceCta() {
  return <CreateWorkspaceButton variant="primary" />
}
