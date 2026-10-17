// Username rules, shared by registration and anything that later renames a user.
// Uniqueness is case-insensitive (users.username is COLLATE NOCASE), so "Steve" and "steve" clash.

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/

export type UsernameCheck = { ok: true; username: string } | { ok: false; message: string }

export function checkUsername(input: unknown): UsernameCheck {
  if (typeof input !== 'string') return { ok: false, message: 'Choose a username.' }
  const username = input.trim()
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { ok: false, message: `Usernames are ${USERNAME_MIN} to ${USERNAME_MAX} characters long.` }
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, message: 'Use only letters, numbers, underscores and hyphens.' }
  }
  return { ok: true, username }
}
