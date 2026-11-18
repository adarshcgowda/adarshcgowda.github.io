# Portfolio — Adarsh Chikkaswamygowda

Single-page portfolio told as a story: a prologue game, a scroll-driven career journey,
step-through case files and an interactive method. Plain HTML, CSS and a little
JavaScript, no build step, no frameworks, no trackers.

```
index.html                         all content (complete and readable without JavaScript)
styles.css                         all styling and animation
script.js                          interactive layer: game, journey, case stepper, method picker
assets/fonts/instrument-sans-latin.woff2   only font (Instrument Sans, SIL OFL)
```

Total weight is about 90 KB plus the resume PDF (budget: under 300 KB).

Project history, decisions and open to-dos: [docs/SESSION_LOG.md](docs/SESSION_LOG.md).

## Preview

Open `index.html` in a browser, or run `python3 -m http.server 8000` in this folder
and visit http://localhost:8000.

## Before sharing (pre-launch checklist)

- [ ] **Food delivery intelligence sample (`#food-delivery`)**: the dashboard is a built copy in `food-delivery/` (source and tests live in the separate `food-delivery-intelligence` project; re-copy its `docs/` folder after changes). Once the project repo is on GitHub, set `data-repo-url` on the `data-sample` article in `index.html` (it is a placeholder until then).
- [x] Projects in `#projects` are tagged "In progress"; add a link and remove the tag as each one ships
- [x] Add the resume PDF at `assets/Adarsh_Chikkaswamygowda_Resume.pdf`
- [x] Remove the `<meta name="robots" content="noindex, nofollow">` line in `index.html`
- [ ] Lighthouse (Chrome DevTools > Lighthouse > Mobile): aim for 95+ in every category
- [ ] Check on a real phone

## Content rules

- Every number must exist in `../application/resume_2026_senior_data_analyst.md` (HARD NUMBERS).
- No internal Uber data, screenshots, table names or dashboards. Describe the method, not the data.
- Tata Motors appears as an apprenticeship.

## Performance rules

- Animate `transform` and `opacity` (the journey route also animates `stroke-dashoffset` on one small SVG).
- One page-load moment (the hero chart draws in). Everything else moves only in response to scrolling or a click.
- Inline SVG for charts. No chart or animation libraries.
- Every interactive rule sits under `.js`, so without JavaScript the page is static and complete.
- Reduced-motion users get the same interactions with motion switched off.

## Deploy to GitHub Pages (from a personal laptop and personal GitHub account)

1. Create a public repo named `adarshcgowda.github.io`.
2. Copy the contents of this folder into it, then commit and push to `main`.
3. Repo Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. The site is live at https://adarshcgowda.github.io within a minute or two.

A custom domain can be added later under Settings > Pages without changing any files
other than a `CNAME` file.
