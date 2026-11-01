// Client side of /api/channel and /api/admin/channel/owner. Mirrors functions/api/channel; keep them in step.
import { request } from '../lib/http'

export const BIO_MAX = 500
export const BANNER_MAX_BYTES = 5 * 1024 * 1024

export interface Channel {
  owner: { id: number; username: string } | null
  bio: string
  // Null means the built-in particle banner. Versioned: a new banner gets a new URL.
  banner_url: string | null
  // Whether Channel settings is yours to open (the owner or the admin).
  can_edit: boolean
  updated_at: string
}

const pick = (b: { channel: Channel }) => b.channel

export const getChannel = () => request('/api/channel', {}, pick)

export const saveBio = (bio: string) => request('/api/channel/bio', { method: 'PUT', body: JSON.stringify({ bio }) }, pick)

// The picture file itself is the body; the server decides its type from its bytes.
export const uploadBanner = (file: File) => request('/api/channel/banner', { method: 'PUT', body: file }, pick)

export const removeBanner = () => request('/api/channel/banner', { method: 'DELETE' }, pick)

// Admin only: who owns the channel (an approved user), or nobody.
export const setChannelOwner = (userId: number | null) =>
  request('/api/admin/channel/owner', { method: 'PUT', body: JSON.stringify({ user_id: userId }) }, pick)

// Characters as the server counts them (code points), so an emoji counts as one.
export const bioLength = (text: string) => Array.from(text.replace(/\r\n?/g, '\n').trim()).length
