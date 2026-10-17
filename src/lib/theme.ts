import { useEffect, useState } from 'react'

// Light or dark, chosen on this device with the account menu's toggle. A device preference, not an
// account setting: kept in localStorage only, so it survives signing out and is never sent anywhere.
// Until someone chooses, there is no data-theme and tokens.css follows the device, live.
// index.html sets data-theme from the same key before the first paint; keep THEME_KEY in step with it.

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'mytube-theme'
const DEVICE_DARK = '(prefers-color-scheme: dark)'

// Storage can be blocked (private windows, strict settings): then the choice lasts for this page only.
export function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Blocked: the page still switches, it just won't be remembered.
  }
}

function deviceTheme(): Theme {
  return window.matchMedia?.(DEVICE_DARK).matches ? 'dark' : 'light'
}

function chosenTheme(): Theme | null {
  const attr = document.documentElement.dataset.theme
  return attr === 'light' || attr === 'dark' ? attr : null
}

// The mode the page is in now, and toggle() to switch to the other one and remember it.
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => chosenTheme() ?? deviceTheme())

  useEffect(() => {
    // No choice yet: follow the device when its setting changes (the CSS does; this keeps the label right).
    const media = window.matchMedia?.(DEVICE_DARK)
    const onDevice = () => {
      if (!chosenTheme()) setTheme(deviceTheme())
    }
    // A choice made in another tab of this site applies here too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return
      const stored = readStoredTheme()
      if (stored) document.documentElement.dataset.theme = stored
      else delete document.documentElement.dataset.theme
      setTheme(stored ?? deviceTheme())
    }
    media?.addEventListener('change', onDevice)
    window.addEventListener('storage', onStorage)
    return () => {
      media?.removeEventListener('change', onDevice)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    storeTheme(next)
    setTheme(next)
  }

  return { theme, toggle }
}
