import { listDrafts } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'
import { videoJson } from '../../../lib/videos'

// GET /api/admin/videos -> { videos }: the review queue, every draft from every uploader, oldest first,
// each with uploader: { id, username }.
const drafts: ApiFunction = async ({ env }) => {
  const videos = await listDrafts(env.DB)
  return Response.json({
    videos: videos.map((v) => ({ ...videoJson(v), uploader: { id: v.uploaded_by, username: v.uploader_username } })),
  })
}

export const onRequestGet = [requireRole('admin'), drafts]
