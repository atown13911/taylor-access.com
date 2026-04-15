# Deployment Notes (Cloudflare Pages)

Use these settings for stable deploys:

- **Framework preset:** `None` (or custom)
- **Build command:** `npm run build`
- **Build output directory:** `dist/taylor-access/browser`
- **Root directory:** repository root
- **Node.js:** `22.x` (or Cloudflare default that supports Angular 17)

## Why `npm run build` only

Cloudflare already installs dependencies during setup (`npm clean-install`).
Running `npm install && npm run build` in the build command duplicates install work and can increase deploy instability/time.

## If deploy fails after successful build

If logs show Angular build completed but Cloudflare ends with:

`Failed: an internal error occurred`

then this is usually a platform-side issue, not an application build/code issue.

Recommended actions:

1. Retry deploy once.
2. Retry with cache cleared (if available in Pages UI).
3. If repeated, open Cloudflare support and include:
   - deploy ID / URL
   - commit SHA
   - timestamp window from build logs
