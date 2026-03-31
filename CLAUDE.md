# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Astro dev server
npm run build     # Production build (also runs as pre-push hook)
npm run preview   # Preview production build locally
netlify dev       # Run with Netlify Functions locally (needed to test contact form)
```

No test suite exists.

## Architecture

**Stack:** Astro 5 (SSG) + Tailwind CSS + Netlify Functions

**Deployment:** Netlify — build output goes to `dist/`, serverless functions in `netlify/functions/`.

### Pages & i18n

- `src/pages/index.astro` — French homepage (default locale, no URL prefix)
- `src/pages/en/index.astro` — English homepage
- `src/pages/landing/index.astro` — Standalone acquisition landing page

Both locale pages render `src/components/HomePage.astro` with a `locale` prop. All copy lives in `src/i18n/translations.ts` — add translated strings there, then consume via `t(locale).key`.

i18n helpers in `translations.ts`: `t(locale)`, `getLocalePath(locale, path)`, `getAlternateLocale(locale)`.

### Contact Form Backend

`netlify/functions/contact.ts` handles POST requests from the contact form:
- Rate-limited per IP via Upstash Redis sliding window (3 req/hour)
- Emails sent via Resend
- CORS enforced by `ALLOWED_ORIGIN` env var
- HTML-escapes all user input before including in email body

### Environment Variables

See `.env.sample` for required keys:
- `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` — email sending
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — rate limiting
- `ALLOWED_ORIGIN` — CORS (e.g. `https://syncera.ca`)

### Styling

Tailwind with custom theme colors (cream/brown palette) and fonts (Playfair Display serif, Inter sans) defined in `tailwind.config.mjs`. Toast state classes (`bg-green-800`, `bg-red-800`, `translate-y-0`, `opacity-100`) are safelisted to prevent purging.

The landing page has its own CSS file (`src/styles/landing.css`) for animation keyframes and stagger effects. Main site global styles are in `src/styles/global.css`.

### Routing / Redirects

`public/_redirects` handles Netlify rewrites — notably routing the `landing` subdomain. Astro i18n is configured with no prefix for the default `fr` locale.
