# Portfolio — Adarsh Chikkaswamygowda

Single-page portfolio. Plain HTML + CSS, no build step, no frameworks, no trackers.

```
index.html                         all content
styles.css                         all styling and animation
assets/fonts/instrument-sans-latin.woff2   only font (Instrument Sans, SIL OFL)
```

Total weight is about 70 KB (budget: under 300 KB).

## Preview

Open `index.html` in a browser, or run `python3 -m http.server 8000` in this folder
and visit http://localhost:8000.

Add `?draft` to the URL (`index.html?draft`) to outline every placeholder in red.

## Before sharing (pre-launch checklist)

- [x] Projects in `#projects` are tagged "In progress"; add a link and remove the tag as each one ships
- [x] Add the resume PDF at `assets/Adarsh_Chikkaswamygowda_Resume.pdf`
- [x] Remove the `<meta name="robots" content="noindex, nofollow">` line in `index.html`
- [ ] Check `?draft` shows no red outlines
- [ ] Lighthouse (Chrome DevTools > Lighthouse > Mobile): aim for 95+ in every category
- [ ] Check on a real phone

## Content rules

- Every number must exist in `../application/resume_2026_senior_data_analyst.md` (HARD NUMBERS).
- No internal Uber data, screenshots, table names or dashboards. Describe the method, not the data.
- Tata Motors appears as an apprenticeship.

## Performance rules

- Animate only `transform` and `opacity`.
- One page-load moment (the hero chart draws in) plus the scroll-linked timeline spine. Nothing else moves on its own.
- Inline SVG for charts. No chart libraries on this page.
- Reduced-motion users get a static page automatically.

## Deploy to GitHub Pages (from a personal laptop and personal GitHub account)

1. Create a public repo named `adarshcgowda.github.io`.
2. Copy the contents of this folder into it, then commit and push to `main`.
3. Repo Settings > Pages > Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
4. The site is live at https://adarshcgowda.github.io within a minute or two.

A custom domain can be added later under Settings > Pages without changing any files
other than a `CNAME` file.
