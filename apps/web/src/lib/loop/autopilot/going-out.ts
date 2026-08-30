import 'server-only'

import type { Channel } from '@sahoda/shared'

import { activeWorkspaceRead } from '@/lib/workspaces'
import { AUTOPILOT_LEVEL } from './decide'
import { goingOutView, type GoingOutView } from './going-out-copy'
import { readAnnouncedForPerson, readDial, type AnnouncedForPerson } from './store'

/**
 * WHAT AUTOPILOT IS ABOUT TO SEND, FOR THE PERSON WHO CAN STOP IT.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
 * The stop was built before anything could arm a post, and the read behind it
 * had no caller. So the product had a working button and nothing that told a
 * customer there was anything to press it about. A cancel window nobody can see
 * is not a safeguard; it is a promise made to a log file.
 *
 * ── IT READS THE DIAL RAW, AND THAT IS THE WHOLE REASON FOR A SECOND READ ────
 * `readLoop` already returns a dial, typed `Map<Channel, AutonomyLevel>`, and
 * `AutonomyLevelSchema` admits only 0, 1 and 2 while the database permits 3
 * under its trigger. An armed channel is therefore INVISIBLE through that type:
 * a screen built on it would report "no channel is set to send on its own" for
 * a workspace that had armed one. `readDial` here returns the stored integer,
 * so this screen can see what the database actually holds.
 *
 * ── FAILURE IS A STATE, NOT AN EXCEPTION ─────────────────────────────────────
 * Every failure resolves to `unreadable` rather than throwing, because this
 * section sits on a page that has other things to say. A read that fell over
 * must not take the Loop screen down with it, and it must not silently render
 * as "nothing is waiting" either: that would be the product asserting the
 * customer's queue is empty on the strength of a query that never answered.
 */

export type GoingOut =
  | { status: 'ready'; view: GoingOutView; waiting: AnnouncedForPerson[] }
  | { status: 'no-workspace' }
  | { status: 'unreadable' }

export async function readGoingOut(): Promise<GoingOut> {
  try {
    const workspace = await activeWorkspaceRead()
    if (workspace.status === 'unreadable') return { status: 'unreadable' }
    if (workspace.status === 'none') return { status: 'no-workspace' }

    const id = workspace.workspace.id
    const [dial, waiting] = await Promise.all([readDial(id), readAnnouncedForPerson(id)])

    const armed: Channel[] = []
    for (const [channel, level] of dial) {
      if (level === AUTOPILOT_LEVEL) armed.push(channel)
    }

    return { status: 'ready', view: goingOutView({ armed, waiting }), waiting }
  } catch {
    // No error text is carried out of here. A database message can hold a
    // connection string and this value is rendered in a browser.
    return { status: 'unreadable' }
  }
}
