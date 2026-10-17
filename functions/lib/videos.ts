import { deleteVideoRow, getUploadByKey, getVideo, getVideoByKey, run, type User, type Video, type VideoCounts } from './db'
import { deleteObject, newThumbnailKey, VIDEO_PREFIX } from './storage'
import { MiB } from './uploads'

export const TITLE_MAX = 100
export const DESCRIPTION_MAX = 5000
export const THUMBNAIL_MAX_BYTES = 5 * MiB
// A form carrying a thumbnail plus text fields. Checked from Content-Length before parsing.
export const VIDEO_FORM_MAX_BYTES = THUMBNAIL_MAX_BYTES + 256 * 1024

export function videoError(status: number, error: string, message?: string) {
  return Response.json(message ? { error, message } : { error }, { status })
}

// What the API says about a video. R2 keys stay server-side; the thumbnail is fetched by video id,
// with ?v= changing whenever the thumbnail does, so browsers can cache each version for good.
// Lists that select VIDEO_COUNTS also carry view_count and like_count.
export function videoJson(video: Video & Partial<VideoCounts>) {
  return {
    ...(video.view_count !== undefined ? { view_count: video.view_count, like_count: video.like_count ?? 0 } : {}),
    id: video.id,
    title: video.title,
    description: video.description,
    status: video.status,
    uploaded_by: video.uploaded_by,
    created_at: video.created_at,
    published_at: video.published_at,
    thumbnail_url: video.thumbnail_key ? thumbnailUrl(video.id, video.thumbnail_key) : null,
  }
}

export function thumbnailUrl(videoId: number, thumbnailKey: string) {
  return `/api/thumbnails/${videoId}?v=${thumbnailVersion(thumbnailKey)}`
}

export function thumbnailVersion(key: string) {
  return key.slice(key.lastIndexOf('/') + 1, key.lastIndexOf('/') + 9)
}

export async function loadVideo(db: D1Database, id: string | string[] | undefined) {
  const n = Number(id)
  return Number.isSafeInteger(n) && n > 0 ? getVideo(db, n) : null
}

// A repeat view from the same user inside this window is not counted again.
export const VIEW_WINDOW_MINUTES = 30

// Removes a video for good: its record (likes, comments and views cascade), its upload row, then its
// files. The record goes first, so a failure part-way leaves at worst a file the leftovers list shows.
export async function deleteVideoEverywhere(db: D1Database, bucket: R2Bucket, video: Video) {
  await deleteVideoRow(db, video.id)
  await run(db, 'DELETE FROM uploads WHERE r2_key = ?', video.r2_key)
  await deleteObject(bucket, video.r2_key)
  if (video.thumbnail_key) await deleteObject(bucket, video.thumbnail_key)
}

// Published videos are for every approved user; a draft only for the admin and its uploader.
// listVisibleVideos() in db.ts applies the same rule to lists (less the admin's review queue).
export function canSee(user: User, video: Video) {
  return video.status === 'published' || user.role === 'admin' || video.uploaded_by === user.id
}

// Editing: the admin edits anything; a creator edits their own drafts only.
export function canEdit(user: User, video: Video) {
  return user.role === 'admin' || (user.role === 'creator' && video.uploaded_by === user.id && video.status === 'draft')
}

// Thumbnails: the type is decided from the file's first bytes, never from its name or the browser.
const THUMBNAIL_TYPES = [
  { type: 'image/jpeg', ext: 'jpg', matches: (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    matches: (b: Uint8Array) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v),
  },
  {
    type: 'image/webp',
    ext: 'webp',
    matches: (b: Uint8Array) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
  },
]

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.subarray(from, to))
}

export type Thumbnail = { key: string; contentType: string; bytes: Uint8Array }

// Reads a thumbnail form field. Returns null when there is none, or an error response.
export async function readThumbnail(value: File | string | null): Promise<Thumbnail | Response | null> {
  if (value === null || value === '') return null
  if (typeof value === 'string') return videoError(400, 'invalid_thumbnail', 'Send the thumbnail as a file.')
  if (value.size > THUMBNAIL_MAX_BYTES) return videoError(413, 'thumbnail_too_large', 'Thumbnails can be up to 5 MB.')
  if (value.size === 0) return null
  const bytes = new Uint8Array(await value.arrayBuffer())
  const kind = THUMBNAIL_TYPES.find((t) => t.matches(bytes))
  if (!kind) return videoError(415, 'unsupported_thumbnail', 'Thumbnails must be JPG, PNG or WebP images.')
  return { key: newThumbnailKey(`thumbnail.${kind.ext}`), contentType: kind.type, bytes }
}

// Parses a multipart form after checking its declared size, so an oversized body is never buffered.
export async function readVideoForm(request: Request): Promise<FormData | Response> {
  const declared = request.headers.get('Content-Length')
  if (declared === null) return videoError(411, 'length_required')
  if (Number(declared) > VIDEO_FORM_MAX_BYTES) {
    return videoError(413, 'too_large', 'Thumbnails can be up to 5 MB.')
  }
  try {
    return await request.formData()
  } catch {
    return videoError(400, 'invalid_body', 'Send the details as multipart/form-data.')
  }
}

export type TextField = { value: string } | { error: Response } | null

// Title and description: trimmed, title required on create and never blank, both length-capped.
export function readText(form: FormData, name: 'title' | 'description', required: boolean): TextField {
  const raw = form.get(name)
  if (raw === null) {
    return required ? { error: videoError(400, `invalid_${name}`, `Give the video a ${name}.`) } : null
  }
  if (typeof raw !== 'string') return { error: videoError(400, `invalid_${name}`) }
  const value = raw.trim()
  const max = name === 'title' ? TITLE_MAX : DESCRIPTION_MAX
  if (name === 'title' && !value) return { error: videoError(400, 'invalid_title', 'Give the video a title.') }
  if (value.length > max) {
    return { error: videoError(400, `invalid_${name}`, `The ${name} can be up to ${max} characters.`) }
  }
  return { value }
}

// Item 5: which R2 video keys a user may turn into a video, and who it is then credited to.
//   creator: only a completed upload of their own
//   admin:   any completed upload, or a leftover object from before uploads were kept on record
// Anything else is refused, and a key that already backs a video is refused too.
export async function resolveVideoKey(
  db: D1Database,
  bucket: R2Bucket,
  user: User,
  key: unknown,
): Promise<{ key: string; uploadedBy: number } | Response> {
  const refuse = () => videoError(400, 'invalid_video_key', "That isn't a finished upload of yours.")
  if (typeof key !== 'string' || !key.startsWith(VIDEO_PREFIX) || key.includes('..')) return refuse()

  if (await getVideoByKey(db, key)) return videoError(409, 'already_has_video', 'That upload already has a video.')

  const upload = await getUploadByKey(db, key)
  if (upload) {
    if (!upload.completed_at) return refuse()
    if (user.role !== 'admin' && upload.user_id !== user.id) return refuse()
    return { key, uploadedBy: upload.user_id }
  }

  // No upload row: only the admin may adopt it, and only if the object really exists.
  if (user.role !== 'admin' || !(await bucket.head(key))) return refuse()
  return { key, uploadedBy: user.id }
}
