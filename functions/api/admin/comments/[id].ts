import { deleteComment } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { cannotActOnAdmin, requirePower } from '../../../lib/guards'
import { isAdmin } from '../../../lib/powers'

const gone = () => Response.json({ error: 'not_found', message: 'That comment has already been deleted.' }, { status: 404 })

// DELETE /api/admin/comments/:id -> { ok: true } (moderate_comments): removes a comment for good. 404 when
// there is no such comment, including one already deleted, so a second click reports that rather than
// failing silently. Deleting a top-level comment deletes its replies too. Under the power, a comment
// by the admin, or a thread with a reply by the admin, is 403: only the admin deletes those. The check
// and the delete are one statement (deleteComment), so they can't be split by an admin reply.
const remove: ApiFunction = async ({ env, data, params }) => {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0) return gone()
  const result = await deleteComment(env.DB, id, !isAdmin(data.user!))
  if (result === 'gone') return gone()
  if (result === 'admin') return cannotActOnAdmin("That comment or one of its replies is the admin's, so only the admin can delete it.")
  return Response.json({ ok: true })
}

export const onRequestDelete = [requirePower('moderate_comments'), remove]
