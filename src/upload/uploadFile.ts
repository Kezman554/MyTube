// Uploads one video through /api/uploads: start, then each part in turn with retries, then complete.
// The HTTP calls sit behind UploadApi so the slicing and retry logic can be tested without a server.

export const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.webm']
export const ACCEPT_ATTRIBUTE = '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm'

export function isAcceptedVideo(file: File) {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

export interface UploadSession {
  uploadId: string
  key: string
  partSize: number
}

export interface UploadedPart {
  partNumber: number
  etag: string
}

export interface UploadApi {
  start(filename: string, size: number): Promise<UploadSession>
  // onSent reports bytes of this part sent so far.
  part(session: UploadSession, partNumber: number, body: Blob, onSent: (bytes: number) => void, signal: AbortSignal): Promise<UploadedPart>
  complete(session: UploadSession, parts: UploadedPart[]): Promise<{ key: string; size: number }>
  abort(session: UploadSession): Promise<void>
}

// retryable: worth sending again (network drop, 5xx, 429). Otherwise the server refused it for good.
export class UploadError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

export interface UploadOptions {
  api: UploadApi
  onProgress?: (sent: number, total: number) => void
  // partNumber is null when retrying the final join.
  onRetry?: (info: { partNumber: number | null; attempt: number; attempts: number }) => void
  signal?: AbortSignal
  attempts?: number
  // Waits between attempts: 1s, 2s, 4s… Replaced in tests.
  wait?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function uploadFile(file: File, options: UploadOptions): Promise<{ key: string; size: number }> {
  const { api, onProgress, onRetry, attempts = 4, wait = sleep } = options
  const signal = options.signal ?? new AbortController().signal
  if (!isAcceptedVideo(file)) throw new UploadError('Only MP4, MOV and WebM videos can be uploaded.', false)

  const session = await api.start(file.name, file.size)
  try {
    const parts: UploadedPart[] = []
    const count = Math.ceil(file.size / session.partSize)
    let done = 0
    onProgress?.(0, file.size)

    // Runs one step, retrying it after a retryable failure until it has had `attempts` tries.
    const withRetry = async <T>(partNumber: number | null, step: () => Promise<T>): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        signal.throwIfAborted()
        try {
          return await step()
        } catch (err) {
          signal.throwIfAborted()
          const retryable = !(err instanceof UploadError) || err.retryable
          if (!retryable || attempt >= attempts) throw err
          onProgress?.(done, file.size)
          onRetry?.({ partNumber, attempt: attempt + 1, attempts })
          await wait(1000 * 2 ** (attempt - 1))
        }
      }
    }

    for (let partNumber = 1; partNumber <= count; partNumber++) {
      const offset = (partNumber - 1) * session.partSize
      const chunk = file.slice(offset, Math.min(offset + session.partSize, file.size))
      parts.push(
        await withRetry(partNumber, () =>
          api.part(session, partNumber, chunk, (sent) => onProgress?.(done + sent, file.size), signal),
        ),
      )
      done += chunk.size
      onProgress?.(done, file.size)
    }

    return await withRetry(null, () => api.complete(session, parts))
  } catch (err) {
    // Best effort: R2 would discard the parts after 7 days anyway.
    await api.abort(session).catch(() => {})
    throw err
  }
}
