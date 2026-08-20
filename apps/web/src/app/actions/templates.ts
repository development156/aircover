'use server'

import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'
import { ChannelSchema } from '@sahoda/shared'

import { reportServerError } from '@/lib/observability/report'
import { mapPostError } from '@/lib/posts/post-error'
import type { TemplateState } from '@/lib/posts/state'
import { createServerSupabase } from '@/lib/supabase/server'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * Templates: save one, delete one.
 *
 * `templates` carries the standard member CRUD policies scoped to `workspace_id`
 * (migration 20260819000300), so these are plain PostgREST writes under the
 * caller's own token — RLS is the boundary, and no service-role client is
 * involved. `workspace_id` is written from the SERVER-derived active workspace,
 * never from the request: the cookie behind it is not an authorization grant.
 */

const MAX_NAME = 80

export async function saveTemplate(
  name: string,
  body: string,
  channel: string | null,
): Promise<TemplateState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to save a template.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const trimmed = name.trim()
    if (trimmed === '') return { ok: false, message: 'Give the template a name first.' }
    if (trimmed.length > MAX_NAME) {
      return { ok: false, message: `Keep the name under ${MAX_NAME} characters.` }
    }
    // An empty template is a shape with the specifics left blank, which is a real
    // thing to save — so `body` is not required to be non-empty.

    let parsedChannel: string | null = null
    if (channel !== null && channel !== '') {
      const parsed = ChannelSchema.safeParse(channel)
      if (!parsed.success) return { ok: false, message: 'That channel is not supported.' }
      parsedChannel = parsed.data
    }

    const supabase = createServerSupabase()
    const { data, error } = await supabase
      .from('templates')
      .insert({
        workspace_id: workspaceId,
        name: trimmed,
        body,
        channel: parsedChannel,
        created_by: userId,
      })
      .select('id')
      .single()

    if (error || !data) {
      // The table carries `unique (workspace_id, name)` — two templates with one
      // name is a list nobody can read. Said in the customer's terms rather than
      // as a constraint name.
      const code = (error as { code?: unknown } | null)?.code
      if (code === '23505') {
        return { ok: false, message: 'You already have a template with that name.' }
      }
      return { ok: false, message: mapPostError(error) }
    }

    revalidatePath('/posts', 'layout')
    return { ok: true, templateId: (data as { id: string }).id }
  } catch (error) {
    reportServerError(error, { action: 'saveTemplate', workspaceId })
    return { ok: false, message: 'Could not save this template — try again.' }
  }
}

/**
 * Delete a template. IT MUST NOT TOUCH A POST THAT CAME FROM IT.
 *
 * That is a property of the schema rather than of this function, and it is worth
 * being precise about why: a template is COPIED into a post's body at the moment
 * it is used, and nothing records the link. There is no foreign key from `posts`
 * to `templates`, so there is nothing for a delete to cascade along — a post made
 * from a template is not "a post of that template", it is a post.
 *
 * The alternative design, a `template_id` on the post, would have made this
 * dangerous and is exactly why it was not built.
 */
export async function deleteTemplate(templateId: string): Promise<TemplateState> {
  let workspaceId: string | undefined
  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: 'Sign in to delete a template.' }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const supabase = createServerSupabase()
    // `.select()` is not cosmetic: a delete matching ZERO rows is not an error in
    // PostgREST, so without the returned row this reports a successful deletion
    // for a template that is still on screen — or one that was never the caller's.
    const { data, error } = await supabase
      .from('templates')
      .delete()
      .eq('id', templateId)
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, message: mapPostError(error) }
    if (!data) return { ok: false, message: mapPostError({ code: 'PGRST116' }) }

    revalidatePath('/posts', 'layout')
    return { ok: true, templateId }
  } catch (error) {
    reportServerError(error, { action: 'deleteTemplate', workspaceId })
    return { ok: false, message: 'Could not delete this template — try again.' }
  }
}
