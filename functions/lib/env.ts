import type { User } from './db'

// Bindings and vars. Secrets come from .dev.vars locally and Pages settings in production.
export interface Env {
  DB: D1Database
  MEDIA: R2Bucket
  ACCESS_AUD: string
  ACCESS_TEAM_DOMAIN: string
  ADMIN_EMAIL: string
  // Local dev only: honoured on localhost, ignored everywhere else.
  DEV_EMAIL?: string
}

// Set by functions/api/_middleware.ts on every /api request.
export interface Identity extends Record<string, unknown> {
  email: string
  user: User | null
}

export type ApiFunction = PagesFunction<Env, string, Identity>
