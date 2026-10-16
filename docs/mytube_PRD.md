# MyTube - Product Requirements Document

Version: 2.1
Last Updated: 2026-10-16
GitHub: https://github.com/Kezman554/MyTube

## Overview

### Problem Statement
Nick's son makes videos and wants a YouTube-style channel, but public YouTube isn't appropriate yet. The earlier Caffeine/ICP version stalled on authentication bugs. MyTube v2 is a private channel that only approved family and friends can watch, rebuilt on a simple, free stack.

### Goals
- A reliable private channel that works for his son
- No hand-rolled authentication: identity handled by Cloudflare Access
- Runs free on Cloudflare's free tiers and never sleeps when idle
- Feels like YouTube rather than a personal vlog site

### Target Users
Nick (admin), his son (creator), and a small group of approved family and friends (viewers, well under 50).

## Features

### Roles and Access
- Login via Cloudflare Access email one-time code (no passwords)
- Viewers self-register on first visit and choose a username
- New viewers wait on a pending screen until the admin approves them
- Roles: admin, creator, viewer
- Unapproved users cannot see any videos or data

### Video Pipeline
- Upload from a computer to R2
- Title, description and custom thumbnail per video
- Creator uploads are saved as drafts until admin approval
- Admin uploads can publish directly
- Playlists to group videos into series

### Viewer Experience
- YouTube-style channel page with banner and video grid
- Playlists tab
- Watch page with streaming playback
- View counts

### Engagement
- Likes on videos
- Comments that appear instantly

### Admin Controls
- Approve, remove and change roles of users
- Mute a user from commenting while still letting them watch
- Delete any comment
- Approve or reject creator drafts

## Scope

### In Scope
- Everything listed under Features
- Deployment to a `*.pages.dev` address protected by Access

### Out of Scope
- Notifications, subscriptions, search
- In-browser trimming or compression (videos compressed before upload)
- PWA and offline support
- Custom domain

### Future Considerations
- `mytube.nickyoung.cloud` subdomain
- Upload from phone
- Email notifications for new videos

## Technical

### Stack
- Vite + React + TypeScript: frontend
- Cloudflare Pages: hosting
- Pages Functions (Workers): API
- Cloudflare R2: video and thumbnail storage
- Cloudflare D1: users, videos, playlists, likes, comments, views
- Cloudflare Access: email OTP identity
- Wrangler: local dev and deployment
- Vitest: tests

### Integrations
- Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`) verified on every API request

### Constraints
- Stay within free tiers: R2 10GB, Access 50 users, Pages 500 builds/month
- Worker request body limits mean large videos must upload via chunked multipart upload
- Video files are only served to approved users, never via public R2 URLs
- Windows development machine

### Design
- Display: arbitrary. Viewers use their own phones, tablets and laptops, so the design is built with margin rather than tuned to one screen. The creator uploads from a computer.
- Use: a phone or laptop in hand, on a sofa or at a desk, with attention on the video
- Looked at most: the video grid on the channel page; on the watch page, the player
- Modes: light and dark, following the device setting; no in-app choice
- Reference: YouTube's structure (channel page, grid, watch page) in a look of its own, chosen by the creator
- Contrast: text 4.5:1, non-text 3:1, in both modes

## Screens
- Browse grid: the channel page (banner, video grid, Playlists tab)
- Player: the watch page (player, title, view count, likes, comments)
- Form: upload (file, title, description, thumbnail, playlist) and registration (username)
- Gate: the pending-approval screen, and the states for muted or removed users
- Admin list: users, creator drafts and comments, each with its actions

## Project Structure

```
MyTube/
├── docs/
│   ├── mytube_PRD.md
│   └── progress.txt
├── CLAUDE.md
├── DESIGN.md
├── src/            # React frontend
├── functions/      # Pages Functions API
├── migrations/     # D1 SQL migrations
├── tests/
└── wrangler.toml
```

## Success Criteria

- [ ] A new visitor verifies their email, registers a username and sees the pending screen
- [ ] The admin approves a viewer, who can then browse and watch videos
- [ ] Unapproved users get no video data or files from the API
- [ ] A 500MB+ video uploads from a computer and plays back smoothly
- [ ] Creator uploads stay hidden until the admin approves them
- [ ] Likes, comments and view counts work; muted users cannot comment
- [ ] The site loads after two or more weeks with no visits
- [ ] Monthly Cloudflare bill is £0
- [ ] Every text pairing measures 4.5:1 or better in both light and dark mode
