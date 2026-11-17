# Session log

Running record of what was done, why, and what is next. Newest session first.
Read the "Current state" and "Open items" sections to pick up where we left off.

## Current state (2026-11-17)

- Live: https://adarshcgowda.github.io/ (GitHub Pages, branch `main`, no build step).
- Look: "Data Globe" theme (dark navy, teal and amber, faint glow grid behind everything).
- Hero: headline, summary, proof strip, "find the wrong number" chart game, and on the right a
  cut-out full-length portrait on a lit stage (spotlight, teal floor ring, three floating chips).
- Sections: Snapshot, Who, What I do, Journey (road and walker), Case files, How I think,
  Speaking and certs, Projects (CaneIQ views), Tools, Off the clock (8-photo gallery), Contact.
- Last pushed commit when this log was written: `20f4218`.

## Open items

- [ ] Photo metadata: Artist/Copyright name "Adarsh C Gowda" was a guess. Confirm the right name.
- [ ] Add an "Off the clock" link to the top nav (not there yet).
- [ ] Lab pages (`chart-lab`, `hero-samples`, `snapshot-lab`, `toolkit-lab`) are untracked and
      unpublished. Decide: delete, or publish.
- [ ] Journey and the globe: the globe was removed from the hero, so nothing links the journey to a
      map any more. Optional idea: a small sticky globe or route panel in the Journey section.
- [ ] Graduation-photo swap on the old hero portrait is gone (photo still lives in the Berlin
      chapter). Optional: bring portraits back in the Who section.
- [ ] Cut-out portrait edges: zoom in on hands and shoes, tidy any halo.
- [ ] README pre-launch items still open: Lighthouse mobile 95+, check on a real phone.
- [ ] Phone-width review of sections below the hero was not done for the Data Globe theme.

## Sessions

### 2026-11-17, Off the clock gallery, hero, Data Globe theme

1. **Gallery.** Edited 8 travel photos into a consistent square set (800 px squares plus uncropped
   "full" versions for the lightbox; JPG, WebP, AVIF). Added as Chapter 6 "Off the clock": square
   grid, captions, native `<dialog>` lightbox. Captions now carry places:
   Singapore (Merlion), whale shark in Oslob (Philippines), ATV in Vietnam, bungee in Rishikesh (x2),
   scuba in Thailand, river jump in Lonavala, jet ski in Bangkok. GPS stripped from web exports.
2. **Hero.** Removed the empty band under the skill tags, added the proof strip, a scroll cue and a
   clearer prompt on the chart game ("One of these 25 months is wrong"). Pushed as `289ddc7`.
3. **Redesign research.** Looked at open-source data portfolios (Hadil16/data-analyst-portfolio,
   SidharthaKumarMalla/Portfolio, Colorlib roundup, Awwwards references). Ideas only, all code is
   original. Built five concept pages with a tab switcher (Anomaly Galaxy, Data Globe, Observability
   Console, Editorial Data-Art, Aurora Bento). These live outside this repo in `portfolio_samples/`.
4. **Chosen: Data Globe.** Applied it to the whole site in a separate working copy (`portfolio_v2`),
   fixed contrast issues (hero tags, pillar proof boxes, toolkit labels, pinned notes), then
   replaced the hero globe with the cut-out portrait stage at the owner's request ("take out the
   globe and keep my image"). Copied into this repo and pushed as `20f4218`.

**Decisions and why**
- Dark theme is done by re-pointing the CSS variables in `:root`. `--paper` was both background and
  light text, so `--on-night` was added for text that sits on dark panels.
- The portrait is cut out of its white studio background (`assets/portrait-cutout.*`). Originals
  `portrait.*` and `portrait-full.*` are kept untouched.
- Chips on the hero stage are hidden under 52rem: on phones they covered the face.
- Everything is reviewed on a local server first; nothing is pushed until the owner says so.

## How to work on this

- Preview: `python3 -m http.server 8080` in the repo root, open http://localhost:8080.
- Edit a copy first when making big visual changes, review, then copy into the repo and push.
- Cache-bust: `styles.css?v=` and `script.js?v=` in `index.html`; bump when shipping.
- Headless screenshots: Chrome `--headless=new --screenshot --virtual-time-budget=4000`.
  Animations and scroll-reveals do not advance in headless mode, so use a harness page that forces
  end states; test JS behaviour through DOM attributes.
- Photo tooling: `magick`, `cwebp`, `avifenc`, `exiftool`. In zsh, put options in an array,
  because an unquoted string variable is not word-split.
- GitHub Pages deploys in about a minute after a push; verify with `curl` and a cache-busting query.
- Content rules (from README): every number must exist in the resume; no internal Uber data.

## Log conventions

At the end of each session add a dated entry under "Sessions", refresh "Current state", and tick or
add items under "Open items". Commit with the code so the log and the site never drift apart.
