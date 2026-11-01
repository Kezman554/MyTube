import { listDrafts } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requirePower } from '../../../lib/guards'
import { isAdmin } from '../../../lib/powers'
import { videoJson } from '../../../lib/videos'

// GET /api/admin/videos -> { videos }: the review queue (review_drafts), every draft from every uploader,
// oldest first, each with uploader: { id, username }. The admin's own drafts are left out for anyone but
// the admin, since nothing done under a power may act on them.
const drafts: ApiFunction = async ({ env, data }) => {
  const videos = await listDrafts(env.DB, isAdmin(data.user!))
  return Response.json({
    videos: videos.map((v) => ({ ...videoJson(v), uploader: { id: v.uploaded_by, username: v.uploader_username } })),
  })
}

export const onRequestGet = [requirePower('review_drafts'), drafts]
