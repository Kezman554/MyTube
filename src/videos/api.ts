// Client side of /api/videos, /api/playlists and /api/admin/orphans.
// Mirrors functions/lib/videos.ts and functions/lib/playlists.ts; keep them in step.
import { request } from '../lib/http'

export type { Result } from '../lib/http'

export const TITLE_MAX = 100
export const DESCRIPTION_MAX = 5000
export const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024
export const THUMBNAIL_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

export interface Video {
  id: number
  title: string
  description: string
  status: 'draft' | 'published'
  uploaded_by: number
  created_at: string
  published_at: string | null
  thumbnail_url: string | null
  // On lists and the watch page.
  view_count?: number
  like_count?: number
}

export interface PlaylistSummary {
  id: number
  title: string
  description: string
  created_at: string
  video_count: number
  thumbnail_url: string | null
}

export interface Orphan {
  key: string
  size: number
  uploaded_at: string
  uploaded_by: { id: number; username: string } | null
  filename: string | null
}

// Published videos plus the caller's own drafts, newest first.
export const listVideos = () => request('/api/videos', {}, (b: { videos: Video[] }) => b.videos)

export const getVideo = (id: string) => request(`/api/videos/${encodeURIComponent(id)}`, {}, (b: { video: Video }) => b.video)

// Counts a view (the server ignores repeats within its window, and drafts). -> the current count.
export const recordView = (id: number) =>
  request(`/api/videos/${id}/view`, { method: 'POST' }, (b: { counted: boolean; view_count: number }) => b)

export const COMMENT_MAX = 1000

export interface Comment {
  id: number
  body: string
  created_at: string
  user: { id: number; username: string }
}

// Newest first.
export const listComments = (videoId: number) =>
  request(`/api/videos/${videoId}/comments`, {}, (b: { comments: Comment[] }) => b.comments)

// Fails with status 403 when the user is muted.
export const postComment = (videoId: number, body: string) =>
  request(`/api/videos/${videoId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }, (b: { comment: Comment }) => b.comment)

// The form carries key, title, description, thumbnail and (admin only) publish.
export const createVideo = (form: FormData) =>
  request('/api/videos', { method: 'POST', body: form }, (b: { video: Video }) => b.video)

export const listPlaylists = () =>
  request('/api/playlists', {}, (b: { playlists: PlaylistSummary[] }) => b.playlists)

export const getPlaylist = (id: string) =>
  request(`/api/playlists/${encodeURIComponent(id)}`, {}, (b: { playlist: PlaylistSummary; videos: Video[] }) => b)

export const listOrphans = () => request('/api/admin/orphans', {}, (b: { orphans: Orphan[] }) => b.orphans)

export const deleteOrphan = (key: string) =>
  request(`/api/admin/orphans?key=${encodeURIComponent(key)}`, { method: 'DELETE' }, () => true)
