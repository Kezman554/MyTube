import { UploadError, type UploadApi, type UploadSession } from './uploadFile'

// UploadApi over the real /api/uploads routes. Parts go by XMLHttpRequest, because fetch
// can't report upload progress; the rest use fetch.

const retryableStatus = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500

async function errorFrom(res: Response): Promise<UploadError> {
  const body = await res.json().catch(() => ({}))
  return new UploadError(body.message ?? `Upload failed (${res.status}).`, retryableStatus(res.status))
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/uploads/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new UploadError("Couldn't reach MyTube. Check your connection.", true)
  }
  if (!res.ok) throw await errorFrom(res)
  return res.json()
}

const ids = (s: UploadSession) => ({ uploadId: s.uploadId, key: s.key })

export const httpUploadApi: UploadApi = {
  start: (filename, size) => postJson('start', { filename, size }),

  part: (session, partNumber, body, onSent, signal) =>
    new Promise((resolve, reject) => {
      const query = new URLSearchParams({ ...ids(session), partNumber: String(partNumber) })
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', `/api/uploads/part?${query}`)
      xhr.responseType = 'json'
      xhr.upload.onprogress = (e) => onSent(e.loaded)
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response)
        const message = xhr.response?.message ?? `Upload failed (${xhr.status}).`
        reject(new UploadError(message, retryableStatus(xhr.status)))
      }
      xhr.onerror = () => reject(new UploadError('The connection dropped.', true))
      xhr.ontimeout = xhr.onerror
      xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
      const cancel = () => xhr.abort()
      signal.addEventListener('abort', cancel, { once: true })
      xhr.onloadend = () => signal.removeEventListener('abort', cancel)
      xhr.send(body)
    }),

  complete: (session, parts) => postJson('complete', { ...ids(session), parts }),

  abort: async (session) => {
    await postJson('abort', ids(session))
  },
}
