# Ro-Link Resolver

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white" alt="MongoDB 7" />
</p>

A lightweight web app for converting Roblox share links into their matching Roblox item IDs. It supports both single-link checks and bulk processing for faster workflows.

## Overview

This project helps users:

- resolve one or many Roblox share links
- retrieve the relevant Roblox ID and item name
- show the resolved destination URL for successful links
- validate share URL format before processing
- copy successful IDs directly to the clipboard
- reduce repeated requests with MongoDB-based caching

## Key Features

- Single mode for resolving one link at a time
- Bulk mode for processing multiple links in one batch
- Automatic validation of Roblox share URL structure
- Clickable destination URLs in successful resolution results
- Clear feedback for invalid links, expired cookies, or API errors
- Storage of resolved results in the `resolved_links` collection
- Admin panel at `/admin` for encrypted cookie management and manual selection
- Simple and responsive user interface

## Technology Stack

| Category        | Technology                 |
| --------------- | -------------------------- |
| Frontend        | Next.js, React, TypeScript |
| Backend         | Next.js API Routes         |
| Database        | MongoDB                    |
| API Integration | Roblox Share Link API      |
| Hosting         | Vercel                     |

## Project Structure

```bash
roblox-sharelink-solver/
├── app/
│   ├── api/
│   │   ├── admin/
│   │   │   ├── cookies/route.ts
│   │   │   └── login/route.ts
│   │   └── resolve/
│   │       └── route.ts
│   ├── admin/
│   │   ├── admin.module.css
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── admin-auth.ts
│   ├── cookie-vault.ts
│   └── mongodb.ts
├── package.json
├── tsconfig.json
├── next.config.ts
├── README.md
└── public/
```

## Environment Variables

Configure the database URI and these server-side values:

```env
ADMIN_PASS=choose-your-own-admin-password
ADMIN_SESSION_SECRET=use-a-random-secret-at-least-32-characters
COOKIE_ENCRYPTION_KEY=base64-encoded-random-32-byte-key
```

Generate independent random values for the session secret and encryption key. For example, with Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Keep these values server-side. Back up `COOKIE_ENCRYPTION_KEY` securely: changing or losing it makes stored cookies unreadable. The legacy `COOKIE` environment variable remains supported as a fallback only when no admin-managed cookie is selected.

```env
COOKIE=your_robloxsecurity_cookie
MONGODB_URI=mongodb+srv://username:password@host/dbname
```

> Note: `COOKIE` is the `.ROBLOSECURITY` value used when calling the Roblox API. It should be kept private and never exposed.

## Cookie management

- `/admin` requires the configured admin password and uses an HTTP-only, same-site session cookie.
- Cookie values are encrypted with AES-256-GCM before they are stored in MongoDB. The admin API returns labels, status, and timestamps only.
- You can add up to 20 values at once (one per line), test validity, replace a value, remove it, or select a validated value manually.
- A Roblox `401` marks the selected managed cookie as expired. It remains selected and resolution stops; the resolver never switches to another stored cookie automatically.
- A cookie's status can also be checked manually from the admin panel. A successful check is required before selecting it.
- The resolver uses only the explicitly selected managed cookie. It does not refresh, rotate, or attempt to restore Roblox sessions.

## Notes

- The Roblox API may require a valid CSRF token and authenticated cookie
- Invalid or expired cookies can cause resolution failures
- Bulk requests are currently capped at 50 links per request
- Anyone with admin access can manage credentials that the resolver will use; restrict access to `/admin` and comply with Roblox policies

## License

This project is intended for personal or internal use. If used in a production environment, review Roblox API policies and terms carefully.

---

<p align="center">
  <strong>Ro-Link Resolver</strong><br>
  Built for fast Roblox link resolution.
</p>
