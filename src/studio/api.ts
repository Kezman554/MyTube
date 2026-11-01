// Client side of /api/studio. Mirrors functions/api/studio and functions/lib/studio.ts; keep them in step.
import { request } from '../lib/http'

// A count, and how much of it arrived since your last Studio visit.
export interface Count {
  total: number
  new: number
}

export interface StudioVideo {
  id: number
  title: string
  status: 'draft' | 'published'
  published_at: string | null
  created_at: string
  thumbnail_url: string | null
  views: Count
  likes: Count
  comments: Count
}

export interface StudioComment {
  id: number
  body: string
  created_at: string
  user: { id: number; username: string }
  video: { id: number; title: string }
  is_reply: boolean
  link: string
  new: boolean
}

export interface Studio {
  // Your last visit, or null on your first (when everything counts as new).
  since: string | null
  // Send this back to markSeen once the page has shown the new figures.
  as_of: string
  totals: { videos: Count; views: Count; likes: Count; comments: Count }
  videos: StudioVideo[]
  comments: StudioComment[]
}

export const getStudio = () => request('/api/studio', {}, (b: Studio) => b)

export const markSeen = (seenAt: string) =>
  request('/api/studio/seen', { method: 'POST', body: JSON.stringify({ seen_at: seenAt }) }, (b: { seen_at: string }) => b.seen_at)
