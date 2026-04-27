# Syncera

A bilingual marketing site for **Syncera Inc.**, built as a fast, statically-generated experience with a serverless contact backend. Lives at **[syncerainc.com](https://syncerainc.com)**.

This repo is a study in *small, sharp tools*: no SPA bloat, no monolithic CMS, no always-on server. Every byte is shipped intentionally.

---

## Tech Stack

| Layer | Tool | Why it's here |
|---|---|---|
| **Framework** | [Astro 5](https://astro.build) | Ships zero JavaScript by default — pages render to pure HTML, hydrating only what truly needs interactivity. |
| **Styling** | [Tailwind CSS 3](https://tailwindcss.com) | Utility-first, with a custom cream/brown palette and `Playfair Display` + `Inter` typography. |
| **i18n** | Astro's native i18n routing | French (default, unprefixed URLs) and English (`/en/*`). |
| **Sitemap** | `@astrojs/sitemap` | Auto-generated, with the standalone landing page filtered out. |
| **Hosting** | [Netlify](https://www.netlify.com/) | Static build deployed to its CDN; serverless backend co-located. |
| **Backend** | [Netlify Functions](https://docs.netlify.com/functions/overview/) (TypeScript) | A single contact-form handler — no server to babysit. |
| **Transactional Email** | [Resend](https://resend.com) | Branded HTML emails with `reply-to` set to the visitor. |
| **Rate Limiting** | [Upstash Redis](https://upstash.com) + `@upstash/ratelimit` | Sliding-window algorithm, 3 requests per IP per hour. |
| **Build Hook** | `simple-git-hooks` | A pre-push hook that runs `astro build` so broken pages never reach the remote. |

### Why Astro?

Most marketing sites today ship a React or Next.js bundle just to display copy that never changes. Astro inverts that: it pre-renders to static HTML at build time, and the resulting site loads in milliseconds with no client-side framework overhead. It's the right tool for content-heavy, low-interactivity surfaces.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Visitor (browser)                                       │
└───────────────┬─────────────────────────────┬───────────┘
                │                             │
        static HTML/CSS              POST /api/contact
                │                             │
┌───────────────▼──────────┐    ┌─────────────▼──────────┐
│  Netlify CDN             │    │  Netlify Function       │
│  (dist/ from astro build)│    │  netlify/functions/     │
│                          │    │  contact.ts             │
│  • / (FR home)           │    │                         │
│  • /en (EN home)         │    │  1. Upstash rate-limit  │
│  • /landing (acquisition)│    │  2. Validate input      │
│  • /sitemap-index.xml    │    │  3. Resend email        │
└──────────────────────────┘    └─────────────────────────┘
```

### Pages & Routing

- `src/pages/index.astro` → French homepage (default locale, no prefix)
- `src/pages/en/index.astro` → English homepage
- `src/pages/landing/index.astro` → Standalone acquisition page, served from the `landing.syncerainc.com` subdomain via `public/_redirects`

Both locale pages render the same `src/components/HomePage.astro`, parameterized with a `locale` prop. **All copy lives in `src/i18n/translations.ts`** — one source of truth, accessed via the `t(locale).key` helper.

### Contact Form Pipeline

`netlify/functions/contact.ts`:

1. **CORS preflight** handled with `OPTIONS` → 204.
2. **Rate limit** — `Upstash Ratelimit.slidingWindow(3, "1 h")` keyed on the `x-forwarded-for` IP.
3. **Validate** — JSON parse, required fields, regex-checked email.
4. **HTML-escape** all user input before splicing into the email body (see `email-template.ts`).
5. **Send** — `Resend` API with `replyTo` set to the visitor's email so replies route directly.

Returns `429 Too Many Requests` with `Retry-After` and `X-RateLimit-Remaining` headers when throttled.

---

## Local Development

```bash
npm install
npm run dev          # Astro dev server on :4321
```

To exercise the contact form locally, use the Netlify CLI so functions run alongside the dev server:

```bash
netlify dev
```

### Environment Variables

Copy `.env.sample` to `.env` and fill in:

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Auth for Resend's email API |
| `EMAIL_FROM` | Sender (must match a verified Resend domain) |
| `EMAIL_TO` | Where contact submissions are delivered |
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `ALLOWED_ORIGIN` | CORS allow-list, e.g. `https://syncerainc.com` |

---

## Scripts

```bash
npm run dev       # Astro dev server with HMR
npm run build     # Static build → dist/  (also runs pre-push)
npm run preview   # Serve the production build locally
netlify dev       # Full stack: site + functions
```

No test suite is wired up — the pre-push `astro build` is the safety net.

---

## Deployment

Pushes to `main` trigger a Netlify build:

1. `netlify.toml` declares `command = "npm run build"`, `publish = "dist"`, `NODE_VERSION = "20"`.
2. Functions in `netlify/functions/` deploy automatically.
3. `public/_redirects` rewrites `landing.syncerainc.com/*` to `/landing/*` so the acquisition page lives on its own subdomain without duplicating the build.

---

## Project Structure

```
src/
├── components/HomePage.astro    # Shared bilingual home
├── i18n/translations.ts         # All copy, both locales
├── layouts/Layout.astro         # HTML shell (head, fonts, meta)
├── pages/
│   ├── index.astro              # FR home  (/)
│   ├── en/index.astro           # EN home  (/en)
│   └── landing/index.astro      # Acquisition page
└── styles/
    ├── global.css               # Site-wide
    └── landing.css              # Landing-page animations only

netlify/functions/
├── contact.ts                   # POST handler
└── email-template.ts            # HTML email builder

public/
├── _redirects                   # Subdomain rewrites
└── favicon.svg
```

---

## Design Choices Worth Noting

- **French is the default locale, unprefixed.** Reflects the primary audience and keeps canonical URLs clean for SEO.
- **No client-side framework** — Astro's static output means the homepage hydrates only the contact-form logic and the locale toggle.
- **Tailwind safelist** — `bg-green-800`, `bg-red-800`, `translate-y-0`, `opacity-100` are kept past purge because they're toggled dynamically on the contact toast.
- **Single component for both locales** — `HomePage.astro` takes a `locale` prop. Adding a third language is a `translations.ts` edit plus one new page file.
- **Edge rate-limiting** — running the limiter inside the function (not in app code) means abuse is rejected before any email is ever attempted.

---

## License

Proprietary. © Syncera Inc.
