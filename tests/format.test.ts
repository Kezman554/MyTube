import { describe, expect, it } from 'vitest'
import { formatBytes, plurals, timeAgo } from '../src/lib/format'

const NOW = Date.parse('2026-10-17T12:00:00Z')
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

describe('timeAgo', () => {
  it('says when a video went up, the way the channel cards do', () => {
    expect(timeAgo(ago(0.2), NOW)).toBe('Today')
    expect(timeAgo(ago(1.5), NOW)).toBe('Yesterday')
    expect(timeAgo(ago(3), NOW)).toBe('3 days ago')
    expect(timeAgo(ago(7), NOW)).toBe('1 week ago')
    expect(timeAgo(ago(20), NOW)).toBe('2 weeks ago')
    expect(timeAgo(ago(45), NOW)).toBe('1 month ago')
    expect(timeAgo(ago(200), NOW)).toBe('6 months ago')
    expect(timeAgo(ago(800), NOW)).toBe('2 years ago')
  })
})

describe('plurals and sizes', () => {
  it('counts in words', () => {
    expect(plurals(0, 'view')).toBe('0 views')
    expect(plurals(1, 'view')).toBe('1 view')
    expect(plurals(23, 'view')).toBe('23 views')
  })

  it('formats file sizes', () => {
    expect(formatBytes(6 * 1024 ** 2)).toBe('6.0 MB')
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB')
  })
})
