import { all, type Upload } from './db'
import { listAllObjects, VIDEO_PREFIX, type StoredObject } from './storage'

// Leftover uploads: whole video files in R2 that no video record points at. These are uploads
// finished before uploads were kept on record, and completed uploads whose details were never saved.
// The admin either creates the video (POST /api/videos with the key) or deletes the file
// (DELETE /api/admin/orphans). Oldest first; uploaded_by and filename are null for files from before
// uploads were kept on record. Pass `videoObjects` when the videos/ listing is already in hand.
export async function listOrphans(db: D1Database, bucket: R2Bucket, videoObjects?: StoredObject[]) {
  const used = new Set((await all<{ r2_key: string }>(db, 'SELECT r2_key FROM videos')).map((v) => v.r2_key))
  const uploads = new Map(
    (await all<Upload & { username: string }>(
      db,
      'SELECT uploads.*, users.username FROM uploads JOIN users ON users.id = uploads.user_id WHERE completed_at IS NOT NULL',
    )).map((u) => [u.r2_key, u]),
  )
  const objects = videoObjects ?? (await listAllObjects(bucket, VIDEO_PREFIX))
  return objects
    .filter((o) => !used.has(o.key))
    .map((o) => {
      const upload = uploads.get(o.key)
      return {
        key: o.key,
        size: o.size,
        uploaded_at: o.uploaded.toISOString(),
        uploaded_by: upload ? { id: upload.user_id, username: upload.username } : null,
        filename: upload?.filename ?? null,
      }
    })
    .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
}
