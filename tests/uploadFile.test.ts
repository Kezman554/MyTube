import { describe, expect, it, vi } from 'vitest'
import { isAcceptedVideo, UploadError, uploadFile, type UploadApi, type UploadedPart } from '../src/upload/uploadFile'

const PART = 10

// A fake server: records each part's bytes, and fails the calls listed in `failures` in turn.
function fakeApi(failures: Array<{ partNumber: number | 'complete'; error: Error }> = []) {
  const received = new Map<number, string>()
  const calls: string[] = []
  const api: UploadApi = {
    start: vi.fn(async () => ({ uploadId: 'u1', key: 'videos/k.mp4', partSize: PART })),
    part: vi.fn(async (_s, partNumber, body, onSent) => {
      calls.push(`part ${partNumber}`)
      const i = failures.findIndex((f) => f.partNumber === partNumber)
      if (i >= 0) throw failures.splice(i, 1)[0].error
      onSent(body.size)
      received.set(partNumber, await body.text())
      return { partNumber, etag: `e${partNumber}` }
    }),
    complete: vi.fn(async (_s, parts: UploadedPart[]) => {
      calls.push('complete')
      const i = failures.findIndex((f) => f.partNumber === 'complete')
      if (i >= 0) throw failures.splice(i, 1)[0].error
      return { key: 'videos/k.mp4', size: parts.reduce((n, p) => n + received.get(p.partNumber)!.length, 0) }
    }),
    abort: vi.fn(async () => {}),
  }
  return { api, received, calls }
}

const video = (content: string, name = 'clip.mp4') => new File([content], name)
const noWait = async () => {}

describe('uploadFile', () => {
  it('slices the file into parts, uploads them in order and completes', async () => {
    const { api, received, calls } = fakeApi()
    const content = 'abcdefghij0123456789xyz'
    const progress: number[] = []
    const result = await uploadFile(video(content), { api, wait: noWait, onProgress: (sent) => progress.push(sent) })

    expect(api.start).toHaveBeenCalledWith('clip.mp4', 23)
    expect(calls).toEqual(['part 1', 'part 2', 'part 3', 'complete'])
    expect([...received.values()]).toEqual(['abcdefghij', '0123456789', 'xyz'])
    expect(api.complete).toHaveBeenCalledWith(expect.anything(), [
      { partNumber: 1, etag: 'e1' },
      { partNumber: 2, etag: 'e2' },
      { partNumber: 3, etag: 'e3' },
    ])
    expect(result).toEqual({ key: 'videos/k.mp4', size: 23 })
    expect(progress.at(-1)).toBe(23)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
  })

  it('retries a failed part with growing waits, then carries on', async () => {
    const { api, calls } = fakeApi([
      { partNumber: 2, error: new TypeError('network down') },
      { partNumber: 2, error: new UploadError('server hiccup', true) },
    ])
    const waits: number[] = []
    const retries: unknown[] = []
    await uploadFile(video('a'.repeat(25)), {
      api,
      wait: async (ms) => void waits.push(ms),
      onRetry: (info) => retries.push(info),
    })
    expect(calls).toEqual(['part 1', 'part 2', 'part 2', 'part 2', 'part 3', 'complete'])
    expect(waits).toEqual([1000, 2000])
    expect(retries).toEqual([
      { partNumber: 2, attempt: 2, attempts: 4 },
      { partNumber: 2, attempt: 3, attempts: 4 },
    ])
  })

  it('retries the final join too', async () => {
    const { api, calls } = fakeApi([{ partNumber: 'complete', error: new TypeError('dropped') }])
    await uploadFile(video('abc'), { api, wait: noWait })
    expect(calls).toEqual(['part 1', 'complete', 'complete'])
  })

  it('gives up after the last attempt and aborts the upload', async () => {
    const error = new UploadError('still down', true)
    const { api } = fakeApi(Array.from({ length: 4 }, () => ({ partNumber: 1, error })))
    await expect(uploadFile(video('abc'), { api, wait: noWait })).rejects.toBe(error)
    expect(api.part).toHaveBeenCalledTimes(4)
    expect(api.abort).toHaveBeenCalledOnce()
    expect(api.complete).not.toHaveBeenCalled()
  })

  it('does not retry a refusal, and aborts', async () => {
    const { api } = fakeApi([{ partNumber: 1, error: new UploadError('not a video', false) }])
    await expect(uploadFile(video('abc'), { api, wait: noWait })).rejects.toThrow('not a video')
    expect(api.part).toHaveBeenCalledOnce()
    expect(api.abort).toHaveBeenCalledOnce()
  })

  it('stops and aborts when cancelled', async () => {
    const { api } = fakeApi()
    const controller = new AbortController()
    vi.mocked(api.part).mockImplementationOnce(async (_s, partNumber) => {
      controller.abort()
      return { partNumber, etag: 'e1' }
    })
    await expect(uploadFile(video('a'.repeat(25)), { api, wait: noWait, signal: controller.signal })).rejects.toThrow()
    expect(api.part).toHaveBeenCalledOnce()
    expect(api.complete).not.toHaveBeenCalled()
    expect(api.abort).toHaveBeenCalledOnce()
  })

  it('refuses other file types before starting', async () => {
    const { api } = fakeApi()
    await expect(uploadFile(video('abc', 'clip.avi'), { api })).rejects.toThrow('MP4, MOV and WebM')
    expect(api.start).not.toHaveBeenCalled()
  })

  it('accepts mp4, mov and webm in any case', () => {
    for (const name of ['a.mp4', 'B.MOV', 'c.WebM']) expect(isAcceptedVideo(video('', name))).toBe(true)
    for (const name of ['a.avi', 'a.mkv', 'a.mp4.txt', 'mp4']) expect(isAcceptedVideo(video('', name))).toBe(false)
  })
})
