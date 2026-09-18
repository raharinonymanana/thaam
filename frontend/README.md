# Thaam — frontend

React + Vite single-page app, deployed to Amplify Hosting. Mobile-first, plain
CSS, no router and no UI library.

- `src/state.js` — the whole flow as one reducer (D110): consent → upload →
  extracting → fields, plus a `case` screen for a victim returning from a
  reminder email. The case ID lives in this state only, never in
  localStorage or sessionStorage.
- `src/api.js` — the only place that touches the network. Every failure becomes
  an `ApiError` whose message is already safe to show.
- `src/image.js` — resizes the screenshot in the browser (D73). The canvas
  re-encode is what strips EXIF, including GPS.
- `src/hash.js` — reads `#case=<caseId>` (D111); a fragment never reaches a
  server, so the case ID stays out of access logs and the Referer header.

## Commands

    npm run dev      # local dev server on :5173
    npm run lint     # oxlint
    npm test         # vitest, unit tests only (no DOM, no network)
    npm run build    # production build into dist/

`VITE_API_URL` overrides the API base URL in `src/config.js`.
