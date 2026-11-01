import { BANNER_MAX_BYTES, channelJson, getChannel, requireChannelEditor, setBannerKey } from '../../lib/channel'
import type { ApiFunction } from '../../lib/env'
import { requireApproved } from '../../lib/guards'
import { serveImage, sniffImage } from '../../lib/images'
import { deleteObject, newBannerKey, putObject } from '../../lib/storage'

const error = (status: number, code: string, message?: string) =>
  Response.json(message ? { error: code, message } : { error: code }, { status })

// GET /api/channel/banner[?v=version] (approved users): the uploaded banner, cached for a year with the
// current ?v= (as in the channel's banner_url), revalidated without it. 404 while the channel uses the
// built-in banner.
const get: ApiFunction = async ({ request, env }) => {
  const { banner_key } = await getChannel(env.DB)
  if (!banner_key) return error(404, 'not_found')
  return (await serveImage(request, env.MEDIA, banner_key)) ?? error(404, 'not_found')
}

// PUT /api/channel/banner (the owner or the admin), the image file itself as the body -> { channel }.
// JPG, PNG or WebP by its bytes, up to 5 MB, with a Content-Length so an oversized body is refused
// before it is read. Stored under a new random key; the previous banner is deleted once replaced.
const put: ApiFunction = async ({ request, env, data }) => {
  const declared = request.headers.get('Content-Length')
  if (declared === null) return error(411, 'length_required')
  // Digits only: anything else (NaN, negative, fractional) would slip past the size check below.
  if (!/^\d+$/.test(declared)) return error(400, 'invalid_length', 'Content-Length must be a whole number of bytes.')
  if (Number(declared) > BANNER_MAX_BYTES) return error(413, 'banner_too_large', 'Banners can be up to 5 MB.')

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.byteLength > BANNER_MAX_BYTES) return error(413, 'banner_too_large', 'Banners can be up to 5 MB.')
  if (bytes.byteLength === 0) return error(400, 'invalid_banner', 'Choose a picture first.')
  const kind = sniffImage(bytes)
  if (!kind) return error(415, 'unsupported_banner', 'Banners must be JPG, PNG or WebP pictures.')

  const key = newBannerKey(kind.ext)
  await putObject(env.MEDIA, key, bytes, kind.type)
  const previous = await setBannerKey(env.DB, key)
  if (previous) await deleteObject(env.MEDIA, previous)
  return Response.json({ channel: channelJson(await getChannel(env.DB), data.user!) })
}

// DELETE /api/channel/banner (the owner or the admin) -> { channel }: back to the built-in banner.
// Idempotent: with no uploaded banner it changes nothing.
const remove: ApiFunction = async ({ env, data }) => {
  const previous = await setBannerKey(env.DB, null)
  if (previous) await deleteObject(env.MEDIA, previous)
  return Response.json({ channel: channelJson(await getChannel(env.DB), data.user!) })
}

export const onRequestGet = [requireApproved, get]
export const onRequestPut = [requireChannelEditor, put]
export const onRequestDelete = [requireChannelEditor, remove]
