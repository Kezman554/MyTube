import { useCallback, useEffect, useState } from 'react'
import type { Result } from './http'

export type Loaded<T> = { kind: 'loading' } | { kind: 'failed'; message: string; status?: number } | { kind: 'ready'; value: T }

// Loads data for a page. `key` names what is being loaded (e.g. the video id): when it changes,
// the page shows loading again instead of the previous item. reload() fetches the same key again.
export function useLoad<T>(key: string, load: () => Promise<Result<T>>): [Loaded<T>, () => void] {
  const [state, setState] = useState<{ key: string; loaded: Loaded<T> } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    load().then((result) => {
      if (!live) return
      setState({
        key,
        loaded: result.ok ? { kind: 'ready', value: result.value } : { kind: 'failed', message: result.message, status: result.status },
      })
    })
    return () => {
      live = false
    }
    // `load` is a fresh closure on every render; `key` and `attempt` say when to run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return [state && state.key === key ? state.loaded : { kind: 'loading' }, reload]
}
