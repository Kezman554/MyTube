// One way to call the API from the frontend: JSON in and out, and a readable message on failure
// (the server's own message when it sends one).

export type Result<T> = { ok: true; value: T } | { ok: false; message: string; status?: number }

export async function request<T>(url: string, init: RequestInit = {}, pick: (body: never) => T = (b) => b as T): Promise<Result<T>> {
  const json = typeof init.body === 'string'
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    return { ok: false, message: "Couldn't reach MyTube. Check your connection and try again." }
  }
  const body = await res.json().catch(() => ({}))
  if (res.ok) return { ok: true, value: pick(body as never) }
  return { ok: false, status: res.status, message: body.message ?? `Something went wrong (${res.status}). Please try again.` }
}
