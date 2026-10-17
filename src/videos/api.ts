// Client side of /api/videos and /api/admin/orphans. Mirrors functions/lib/videos.ts; keep them in step.

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
}

export interface Orphan {
  key: string
  size: number
  uploaded_at: string
  uploaded_by: { id: number; username: string } | null
  filename: string | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; message: string }

async function call<T>(url: string, init: RequestInit, pick: (body: never) => T): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...init.headers } })
  } catch {
    return { ok: false, message: "Couldn't reach MyTube. Check your connection and try again." }
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, value: pick(body as never) }
  return { ok: false, message: body.message ?? `Something went wrong (${res.status}). Please try again.` }
}

// The form carries key, title, description, thumbnail and (admin only) publish.
export const createVideo = (form: FormData) =>
  call('/api/videos', { method: 'POST', body: form }, (b: { video: Video }) => b.video)

export const listOrphans = () =>
  call('/api/admin/orphans', {}, (b: { orphans: Orphan[] }) => b.orphans)

export const deleteOrphan = (key: string) =>
  call(`/api/admin/orphans?key=${encodeURIComponent(key)}`, { method: 'DELETE' }, () => true)
