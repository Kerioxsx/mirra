# Mirra website

A static, single-page site for Mirra: open `index.html`, or serve the folder
(`python3 -m http.server -d apps/site 8080`). There is no build step; any static host works
(GitHub Pages, Netlify, Cloudflare Pages).

- Built with the design-taste-frontend skill (taste-skill): `assets/` holds only the kit files the
  page loads (MIT, see `assets/LICENSE-taste-skill.txt`).
- Every product picture is Mirra's own UI: the search results, listing, labels, sizes and KakoBuy
  steps are drawn as live HTML from the app's real strings; `dresser.jpg` is a screenshot of the
  3D dresser (`apps/web`, `/dresser`).
- `share.jpg` is the hero, for link previews. Add `<link rel="canonical">` once there is a domain.
- To re-check the page: `node .claude/skills/design-taste-frontend/scripts/gate.mjs apps/site/index.html`
  after restoring the skills (see `docs/development/setup.md`).
