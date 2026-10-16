import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  getObject,
  newThumbnailKey,
  newVideoKey,
  parseRange,
  putObject,
  uploadPart,
} from '../functions/lib/storage'

// Miniflare gives a real, in-memory local R2 bucket.
let mf: Miniflare
let bucket: R2Bucket

beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      name: 'storage-test',
      compatibilityDate: '2026-10-16',
      modules: true,
      script: 'export default { fetch: () => new Response() }',
      r2Buckets: ['MEDIA'],
    }),
  )
  bucket = (await mf.getR2Bucket('MEDIA')) as unknown as R2Bucket
})

afterAll(async () => {
  await mf.dispose()
})

describe('parseRange', () => {
  it('handles open, closed, suffix and bad ranges', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 })
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
  })
})

describe('keys', () => {
  it('uses the videos/ and thumbnails/ prefixes', () => {
    expect(newVideoKey('clip.MP4')).toMatch(/^videos\/[0-9a-f-]{36}\.mp4$/)
    expect(newThumbnailKey('thumb.png')).toMatch(/^thumbnails\/[0-9a-f-]{36}\.png$/)
  })

  it('refuses keys outside those prefixes', async () => {
    await expect(putObject(bucket, 'other/x.txt', 'x', 'text/plain')).rejects.toThrow('Invalid storage key')
    await expect(putObject(bucket, 'videos/../x', 'x', 'text/plain')).rejects.toThrow('Invalid storage key')
  })
})

describe('put, get and delete', () => {
  const key = 'videos/test.txt'
  const text = 'Hello, MyTube! 0123456789'

  it('stores and reads back a whole file', async () => {
    await putObject(bucket, key, text, 'text/plain')
    const res = await getObject(bucket, key)
    expect(res?.status).toBe(200)
    expect(res?.headers.get('Content-Type')).toBe('text/plain')
    expect(res?.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await res?.text()).toBe(text)
  })

  it('serves a ranged read', async () => {
    const res = await getObject(bucket, key, 'bytes=7-12')
    expect(res?.status).toBe(206)
    expect(res?.headers.get('Content-Range')).toBe(`bytes 7-12/${text.length}`)
    expect(res?.headers.get('Content-Length')).toBe('6')
    expect(await res?.text()).toBe('MyTube')
  })

  it('serves a suffix range', async () => {
    const res = await getObject(bucket, key, 'bytes=-4')
    expect(res?.status).toBe(206)
    expect(await res?.text()).toBe('6789')
  })

  it('answers 416 for a range past the end', async () => {
    const res = await getObject(bucket, key, 'bytes=999-')
    expect(res?.status).toBe(416)
    expect(res?.headers.get('Content-Range')).toBe(`bytes */${text.length}`)
  })

  it('deletes', async () => {
    await deleteObject(bucket, key)
    expect(await getObject(bucket, key)).toBeNull()
  })
})

describe('multipart', () => {
  const MiB = 1024 * 1024

  it('uploads in parts and reads back across the part boundary', async () => {
    const key = newVideoKey('big.mp4')
    const { uploadId } = await createMultipartUpload(bucket, key, 'video/mp4')
    const part1 = new Uint8Array(5 * MiB).fill(65) // 'A'
    const part2 = new TextEncoder().encode('BBBB')
    const p2 = await uploadPart(bucket, key, uploadId, 2, part2)
    const p1 = await uploadPart(bucket, key, uploadId, 1, part1)
    const object = await completeMultipartUpload(bucket, key, uploadId, [p2, p1])
    expect(object.size).toBe(5 * MiB + 4)

    const res = await getObject(bucket, key, `bytes=${5 * MiB - 2}-`)
    expect(res?.status).toBe(206)
    expect(res?.headers.get('Content-Type')).toBe('video/mp4')
    expect(await res?.text()).toBe('AABBBB')
    await deleteObject(bucket, key)
  })

  it('aborts an upload', async () => {
    const key = newVideoKey('abandoned.mp4')
    const { uploadId } = await createMultipartUpload(bucket, key, 'video/mp4')
    await uploadPart(bucket, key, uploadId, 1, 'x')
    await abortMultipartUpload(bucket, key, uploadId)
    expect(await getObject(bucket, key)).toBeNull()
  })
})
