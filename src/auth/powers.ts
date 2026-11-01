// Named powers, as in functions/lib/powers.ts: keep them in step. The admin holds every power.
export const POWERS = ['upload', 'publish_own', 'manage_playlists', 'moderate_comments', 'review_drafts', 'approve_users'] as const
export type Power = (typeof POWERS)[number]

// What the admin sees beside each checkbox when handing powers out.
export const POWER_LABELS: Record<Power, { name: string; detail: string }> = {
  upload: { name: 'Upload', detail: 'Upload videos. They arrive as drafts.' },
  publish_own: { name: 'Publish own videos', detail: 'Publish their own drafts without review.' },
  manage_playlists: { name: 'Manage playlists', detail: 'Create, edit, order and delete playlists.' },
  moderate_comments: { name: 'Moderate comments', detail: 'Delete comments, mute and unmute people.' },
  review_drafts: { name: 'Review drafts', detail: "Publish or reject anyone's draft except yours." },
  approve_users: { name: 'Approve people', detail: 'Approve, turn away or remove people, except you.' },
}
