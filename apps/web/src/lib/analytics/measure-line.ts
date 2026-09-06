import 'server-only'

import { measuredAgoSentence } from './measure-copy'
import { readMeasureRun } from './measure-run'
import { activeWorkspaceRead } from '@/lib/workspaces'

/**
 * The sentence beside "Measure now", resolved for the signed-in workspace.
 *
 * Never throws and never blocks the page: a stamp that cannot be read is the
 * `unknown` sentence, and no workspace is the `never` one (there is nothing
 * to have measured). The page renders the button either way, because the
 * action makes its own, stricter, decision when pressed.
 */
export async function measureLine(nowMs: number = Date.now()): Promise<string> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status !== 'ok') return measuredAgoSentence({ kind: 'never' }, nowMs)
    return measuredAgoSentence(await readMeasureRun(workspace.workspace.id), nowMs)
  } catch {
    return measuredAgoSentence({ kind: 'unknown' }, nowMs)
  }
}
