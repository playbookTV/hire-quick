# HireQuick marketing website

Independent React + Vite app in the existing pnpm workspace.

```sh
pnpm --filter @hq/website dev
pnpm --filter @hq/website build
pnpm --filter @hq/website preview
```

Development and preview use http://127.0.0.1:5174. Build output is `dist/` and can be served by any static host. No API, database, or secrets are required.

## Production deployment

Live site: https://hirequick.agency. Vercel project: `hirequick-website` in `leslie-layrznets-projects`.

The current site is deployed manually from the built static files. To publish an update, run these commands from the repository root with the Vercel CLI signed into that team:

```sh
pnpm --filter @hq/website build
vercel link --yes --project hirequick-website --scope leslie-layrznets-projects --cwd apps/website/dist
vercel deploy --prod --yes --scope leslie-layrznets-projects --cwd apps/website/dist
```

Link after each build because Vite clears `dist/`. Only the website build is uploaded. The assigned `hirequick.agency` domain follows production deployments automatically.

## Launch configuration

Set `VITE_SIGNUP_URL` to the real public HTTPS signup or app landing URL at build time. Without it, the page clearly says public signup is coming soon; it does not collect information or claim a signup succeeded. The audience selector explains each side of the marketplace. No public store links, contact addresses, endorsements, or usage figures were invented.

The payment copy follows `documentation/payments/approved-settlement-policy-2026-09-21.md`. Recheck it if settlement or cancellation policies change.

## Assets

`public/images/event-crew.jpg` and `public/images/event-welcome.jpg` are AI-generated editorial images of fictional event hosts, created for this site; they are not customer photographs or endorsements. The white HireQuick mark was provided by Leslie. Archivo and Manrope are loaded from Google Fonts with system fallbacks. The site contains no analytics, external embeds, or persistent browser storage.

## Verification

Check desktop and mobile layouts, all four event selectors, both audience selectors, FAQ disclosure controls, mobile menu dismissal and Escape, keyboard focus, reduced motion, and the production build before publishing.
