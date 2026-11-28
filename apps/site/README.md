# Mirra website

A static, single-page site for Mirra, published to GitHub Pages at
<https://kerioxsx.github.io/mirra/> by `.github/workflows/pages.yml` on every push to `main` that
touches `apps/site/` (one-time setup: Settings → Pages → Source: GitHub Actions). To preview, serve
the folder (`python3 -m http.server -d apps/site 8080`); there is no build step.

- Built with the design-taste-frontend skill (taste-skill): `assets/` holds only the kit files the
  page loads (MIT, see `assets/LICENSE-taste-skill.txt`).
- Every product picture is Mirra's own UI: the search results, listing, labels, sizes and KakoBuy
  steps are drawn as live HTML from the app's real strings.
- The dresser section shows the app's real avatar and garments in 3D (`dresser3d.js`, three.js
  from jsDelivr): `looks/*.glb` are baked by the dresser engine
  (`pnpm --filter @mirra/dresser-engine bake:looks`), about 0.8 to 1.4 MB each, loaded only when
  the section comes near and only the look you pick. `looks/street.jpg` is the poster and the
  fallback without WebGL or JavaScript; re-render it from the viewer after a re-bake. Figures:
  Universal Base Characters by Quaternius (CC0).
- `share.jpg` is the hero, for link previews (canonical and `og:` URLs point at the Pages site).
- To re-check the page: `node .claude/skills/design-taste-frontend/scripts/gate.mjs apps/site/index.html`
  after restoring the skills (see `docs/development/setup.md`).
