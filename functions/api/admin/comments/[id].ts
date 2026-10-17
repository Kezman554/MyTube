import { deleteComment } from '../../../lib/comments'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'

// DELETE /api/admin/comments/:id -> { ok: true }: removes any comment for good. 404 when there is no
// such comment, including one already deleted, so a second click reports that rather than failing silently.
const remove: ApiFunction = async ({ env, params }) => {
  const id = Number(params.id)
  if (!Number.isSafeInteger(id) || id <= 0 || !(await deleteComment(env.DB, id))) {
    return Response.json({ error: 'not_found', message: 'That comment has already been deleted.' }, { status: 404 })
  }
  return Response.json({ ok: true })
}

export const onRequestDelete = [requireRole('admin'), remove]
