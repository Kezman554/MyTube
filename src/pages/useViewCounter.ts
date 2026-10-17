import { useEffect, useRef, type RefObject } from 'react'

// Seconds of real playback before a view is sent. Seeking, pausing and buffering don't add to it.
export const VIEW_AFTER_SECONDS = 5

// Calls onView once per page visit, after VIEW_AFTER_SECONDS of the video actually playing.
// Time is summed from timeupdate steps; a jump bigger than a normal step is a seek, not playback.
export function useViewCounter(video: RefObject<HTMLVideoElement | null>, key: string, onView: () => void) {
  const callback = useRef(onView)
  useEffect(() => {
    callback.current = onView
  })

  useEffect(() => {
    const el = video.current
    if (!el) return
    let played = 0
    let last: number | null = null
    let sent = false

    const tick = () => {
      if (sent || el.paused || el.seeking) {
        last = el.currentTime
        return
      }
      if (last !== null) {
        const step = el.currentTime - last
        if (step > 0 && step < 1.5) played += step
      }
      last = el.currentTime
      if (played >= VIEW_AFTER_SECONDS) {
        sent = true
        callback.current()
      }
    }
    const reset = () => {
      last = el.currentTime
    }

    el.addEventListener('timeupdate', tick)
    el.addEventListener('seeked', reset)
    el.addEventListener('play', reset)
    return () => {
      el.removeEventListener('timeupdate', tick)
      el.removeEventListener('seeked', reset)
      el.removeEventListener('play', reset)
    }
  }, [video, key])
}
