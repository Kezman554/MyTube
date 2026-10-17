# Project: MyTube

A private, YouTube-style video channel for Nick's son, viewable only by approved family and friends.
Built with Vite + React + TypeScript on Cloudflare Pages, Pages Functions, R2, D1 and Cloudflare Access.

## Structure
- src/ - React frontend (design tokens in src/styles/tokens.css)
- functions/ - Pages Functions API (Workers runtime)
- migrations/ - D1 SQL migrations
- tests/ - Vitest tests
- docs/ - PRD and progress log

## Commands
- `npm run dev` - Run the Vite frontend
- `npx wrangler pages dev` - Run the full local stack (API, D1, R2)
- `npm test` - Run tests
- `npm run deploy` - Build and deploy to production (Pages project mytube, branch main). Run `npm run db:migrate:remote` first when there are new migrations
- `npm run icons` - Regenerate the PNG icons in public/ from public/icon.svg (commit the results)

## Git
- Do not push to GitHub without explicit permission
- Commit after completing each session
- Update docs/progress.txt briefly if significant work was done

## Conventions
- Never hand-roll authentication: identity comes from the Cloudflare Access JWT only
- Every API route checks the user is approved before returning data
- Never expose R2 objects via public URLs; stream videos through the API
- Stay within Cloudflare free tiers
- Development machine is Windows: use cross-platform scripts
- Local secrets live in `.dev.vars` (gitignored); `.dev.vars.example` lists the keys

## Design
- Read DESIGN.md before any UI work
- No colour, font or radius literal value outside src/styles/tokens.css (`var(--…)` is fine everywhere); check with `grep -rnE "#[0-9a-fA-F]{3,8}\b|(rgb|hsl)a?\(|\bfont(-family|Family)?[[:space:]]*:[^;'\"]*['\"]([^v]|v[^a]|va[^r]|var[^(])|(font-family|border-radius)[[:space:]]*:[[:space:]]*([^v[:space:]]|v[^a]|va[^r]|var[^(])|borderRadius[[:space:]]*:[[:space:]]*(['\"]([^v]|v[^a]|va[^r]|var[^(])|[0-9])" src | grep -v "src/styles/tokens.css"`

## Reference
- Requirements: docs/mytube_PRD.md
- Design: DESIGN.md
- Progress log: docs/progress.txt
- Task prompts: Kanban app
