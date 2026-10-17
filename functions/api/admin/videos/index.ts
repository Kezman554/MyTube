import { listDrafts } from '../../../lib/db'
import type { ApiFunction } from '../../../lib/env'
import { requireRole } from '../../../lib/guards'
import { videoJson } from '../../../lib/videos'

// GET /api/admin/videos -> { videos }: the review queue, every draft from every uploader, oldest first.
const drafts: ApiFunction = async ({ env }) => {
  const videos = await listDrafts(env.DB)
  return Response.json({ videos: videos.map(videoJson) })
}

export const onRequestGet = [requireRole('admin'), drafts]
