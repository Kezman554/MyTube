// Client side of the admin playlist routes. Mirrors functions/lib/playlists.ts; keep them in step.
import { request, type Result } from '../lib/http'
import type { Video } from '../videos/api'

export interface AdminPlaylist {
  id: number
  title: string
  description: string
  created_at: string
  videos: Video[]
}

type One = { playlist: AdminPlaylist }
const BASE = '/api/admin/playlists'

export const listPlaylists = () => request(BASE, {}, (b: { playlists: AdminPlaylist[] }) => b.playlists)

export const createPlaylist = (title: string, description: string) =>
  request(BASE, { method: 'POST', body: JSON.stringify({ title, description }) }, (b: One) => b.playlist)

export const deletePlaylist = (id: number) => request(`${BASE}/${id}`, { method: 'DELETE' }, () => true)

export const addToPlaylist = (id: number, videoId: number) =>
  request(`${BASE}/${id}/videos`, { method: 'POST', body: JSON.stringify({ videoId }) }, (b: One) => b.playlist)

export const removeFromPlaylist = (id: number, videoId: number) =>
  request(`${BASE}/${id}/videos/${videoId}`, { method: 'DELETE' }, (b: One) => b.playlist)

export const reorderPlaylist = (id: number, videoIds: number[]) =>
  request(`${BASE}/${id}/order`, { method: 'PUT', body: JSON.stringify({ videoIds }) }, (b: One) => b.playlist)

// Every video the admin can put in a playlist: published ones and all drafts.
export async function listAllVideos(): Promise<Result<Video[]>> {
  const [visible, drafts] = await Promise.all([
    request('/api/videos', {}, (b: { videos: Video[] }) => b.videos),
    request('/api/admin/videos', {}, (b: { videos: Video[] }) => b.videos),
  ])
  if (!visible.ok) return visible
  if (!drafts.ok) return drafts
  const byId = new Map([...visible.value, ...drafts.value].map((v) => [v.id, v]))
  return { ok: true, value: [...byId.values()].sort((a, b) => a.title.localeCompare(b.title)) }
}
