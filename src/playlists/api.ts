// Client side of the admin playlist routes. Mirrors functions/lib/playlists.ts; keep them in step.
import type { Result, Video } from '../videos/api'

export interface AdminPlaylist {
  id: number
  title: string
  description: string
  created_at: string
  videos: Video[]
}

async function call<T>(url: string, init: RequestInit, pick: (body: never) => T): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch {
    return { ok: false, message: "Couldn't reach MyTube. Check your connection and try again." }
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, value: pick(body as never) }
  return { ok: false, message: body.message ?? `Something went wrong (${res.status}). Please try again.` }
}

type One = { playlist: AdminPlaylist }
const BASE = '/api/admin/playlists'

export const listPlaylists = () => call(BASE, {}, (b: { playlists: AdminPlaylist[] }) => b.playlists)

export const createPlaylist = (title: string, description: string) =>
  call(BASE, { method: 'POST', body: JSON.stringify({ title, description }) }, (b: One) => b.playlist)

export const deletePlaylist = (id: number) => call(`${BASE}/${id}`, { method: 'DELETE' }, () => true)

export const addToPlaylist = (id: number, videoId: number) =>
  call(`${BASE}/${id}/videos`, { method: 'POST', body: JSON.stringify({ videoId }) }, (b: One) => b.playlist)

export const removeFromPlaylist = (id: number, videoId: number) =>
  call(`${BASE}/${id}/videos/${videoId}`, { method: 'DELETE' }, (b: One) => b.playlist)

export const reorderPlaylist = (id: number, videoIds: number[]) =>
  call(`${BASE}/${id}/order`, { method: 'PUT', body: JSON.stringify({ videoIds }) }, (b: One) => b.playlist)

// Every video the admin can put in a playlist: published ones and all drafts.
export async function listAllVideos(): Promise<Result<Video[]>> {
  const [visible, drafts] = await Promise.all([
    call('/api/videos', {}, (b: { videos: Video[] }) => b.videos),
    call('/api/admin/videos', {}, (b: { videos: Video[] }) => b.videos),
  ])
  if (!visible.ok) return visible
  if (!drafts.ok) return drafts
  const byId = new Map([...visible.value, ...drafts.value].map((v) => [v.id, v]))
  return { ok: true, value: [...byId.values()].sort((a, b) => a.title.localeCompare(b.title)) }
}
