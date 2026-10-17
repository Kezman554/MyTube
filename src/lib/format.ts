export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

// "Yesterday", "3 days ago", "2 weeks ago": how the channel says when a video went up.
export function timeAgo(iso: string, now = Date.now()) {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000)
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return plural(Math.floor(days / 7), 'week')
  if (days < 365) return plural(Math.floor(days / 30), 'month')
  return plural(Math.floor(days / 365), 'year')
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`

export const plurals = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
