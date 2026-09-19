# Install

`style-distill` is a **skill package**: one `SKILL.md` that an agent reads as
instructions, plus a `scripts/` folder of measuring instruments and a `references/`
folder of recipes. Nothing is compiled, nothing runs in the background.

中文安装说明见 [`README.zh-CN.md`](README.zh-CN.md)。

---

## 1 · Requirements

| | |
| --- | --- |
| Node.js | 18 or newer (`node --version`) |
| `playwright-core` | only for **live sources** (a real URL that must be rendered) |
| A Chromium build | bundled by `playwright`, or reuse a Chrome you already have |
| Python / LaTeX / fonts | **not required** — the skill never installs fonts, and CJK output uses the system font stack |

Image sources (a screenshot, a PDF page, a painting) need **no browser at all** —
`dna-probe.mjs` reads pixels directly.

```bash
# live sources only
npm i -g playwright-core
npx playwright install chromium      # or point CHROME_PATH at an existing Chrome
```

---

## 2 · Install into an agent

**One line** (downloads a tarball from the GitHub API, unpacks it, then self-checks —
no `git` needed):

```bash
curl -fsSL https://raw.githubusercontent.com/LucyOyang2025/style-distill/main/install.sh \
  | bash -s -- <your-agent>/agent_state/skills/style-distill
```

Or by hand — skills live under the agent's `agent_state/skills/` directory:

```bash
cp -r style-distill <your-agent>/agent_state/skills/
```

That is the entire install. The agent now sees the skill by its `name` and
`description` frontmatter, and the body tells it the four stages
(READ → EXTRACT → MINT → VERIFY) and the six gates.

**What to say to trigger it:**

> "Make me a PDF in the style of `<template link>` — here's my content, in Chinese."
> "Distill this painting into a reusable design skill."
> "Copy this template, but keep my words."

Any website-template link works: a Framer/Webflow template page, a landing-page
gallery entry (e.g. `https://land-book.com/websites/98533-last-studio-A-agency-template-for-framer`),
or a document you drop in instead. Say **中文** or **English**.

---

## 3 · Use the scripts directly

The instruments work on their own, without an agent — useful for inspection, or for
wiring the skill into your own build.

### Measure a source

```bash
# a live page: computed styles + a full-page screenshot
node scripts/dna-probe.mjs https://example.com --out dna.json --shot source.png

# an image source: a screenshot, a design file export, a painting
node scripts/dna-probe.mjs ./my-painting.jpg --out dna.json
```

`dna.json` is the fingerprint: palette **with each colour's area share**, layout
skeleton, grid columns, type scale and line height, spacing steps, radii and shadows,
image strategy, whitespace ratio — and, for paintings, pixel proxies for brush energy,
line language and edge hardness.

### Cast the fingerprint into a skill

```bash
node scripts/mint-skill.mjs \
  --dna dna.json \
  --name design-example \
  --title "Example" \
  --out skills/design-example
```

The output is itself a skill package: numeric rules, design tokens, and a twin
scaffold you can build on.

### Check the twin

```bash
node scripts/dna-probe.mjs ./output.html --out twin.json --shot twin.png
node scripts/dna-probe.mjs --compare dna.json twin.json     # exit 0 = twin
```

Six gates, each printed with its number and its verdict: dominant‑colour carry‑over ·
hue distribution · luminance distribution · type scale · grid columns · imagery
strategy. A failing gate says *why*, and sometimes admits the threshold is wrong for
that source.

### Extra probes

```bash
node scripts/probe-palette.mjs <img>     # colour histogram + area shares
node scripts/probe-margins.mjs <img>     # margin / whitespace bands
node scripts/probe-lines.mjs <img>       # text line boxes → type scale from pixels
node scripts/make-recolor-map.mjs …      # one-to-one recolour map for uploaded art
node scripts/grab-cdn.mjs <url> …        # pull a full-page shot when curl gets a 403
```

---

## 4 · Read it without an agent framework

No framework required. The package is documentation first:

1. Read `SKILL.md` top to bottom — it is the whole method, in order.
2. Read `references/style-dna.md` for the fingerprint fields and what each one means.
3. Pick the route for your source — the decision table near the top of `SKILL.md`
   maps source type → tools:
   - live page → computed styles
   - screenshot / painting → pixels, via `probe-*.mjs`
   - `curl` gets 403 but a real browser opens it → `references/cdn-bypass.md`
   - Cloudflare or a login wall → bitmap route, `references/bitmap-source.md`
4. Run the scripts as above; the JSON is the only state you have to keep.

`references/` in full:

| File | Covers |
| --- | --- |
| `style-dna.md` | the fingerprint fields, including the `craft` proxies for paintings |
| `bitmap-source.md` | sources that exist only as pixels: the three-pass probe, and four traps |
| `cdn-bypass.md` | 403 / hotlink protection, borrowing a real browser context |
| `multilang.md` | keeping the wording intact when the same document ships in two languages |
| `screenshot-localization.md` | re-colouring screenshots to match a new palette, token by token |
| `unify-assets.md` | pulling uploaded graphics into a style without deforming them |
| `placeholders.md` | image slots when you have no photography and don't want stock |

---

## 5 · Verify your install

```bash
node scripts/dna-probe.mjs ./examples/case-01-td-lovera-overview.png --out check.json
```

If that writes a `check.json` containing a palette with area shares, the instruments
are working. Then try the full loop once on a source you care about — measure it, mint
it, apply it to a paragraph of your own, and compare.

---

## 6 · Troubleshooting

| Symptom | Cause |
| --- | --- |
| `dna-probe.mjs <url>` returns almost nothing | the site is client-rendered — it needs `playwright-core` and a Chromium build |
| `curl` downloads a wrapper page, not the design | an aggregator entry — the screenshot's filename is usually the real domain; measure that instead |
| Every element measures white | cards on a white page: set the page ground to the source's own dominant colour |
| A gate fails but the output looks right | measure **the source** against that same gate first; sometimes the threshold assumes something the source never was |
| Chinese text looks cramped | open line-height (≈1.34–1.5) and let the system CJK stack do the rest — nothing to install |

---

## License

MIT — see [LICENSE](LICENSE).
