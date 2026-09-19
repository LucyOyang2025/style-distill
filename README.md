# style-distill

**Hand it a template link. Get back a design language you can keep.**

Any website-template link will do — a Framer or Webflow template, a landing-page
gallery entry such as
[`land-book.com/websites/98533-last-studio`](https://land-book.com/websites/98533-last-studio-A-agency-template-for-framer).
Or drop a document on it instead, and say whether you want Chinese or English.

I'm Lucy. I studied architecture in Shenzhen, and I now work in finance in Hong Kong,
at a US-listed licensed brokerage. I'm an INTP — I think too much, and I love art,
philosophy and technology. In my spare time I learn whatever is at the frontier
(AI, lately) and look for people with ideas worth arguing about.

This skill came out of a frustration I couldn't argue my way out of.

---

## The story

I was building my own mini‑program app. The content was ready. The story was ready.
What I had was a folder of design references I genuinely loved — a landing page here,
a painting there, one PDF whose proportions just *felt* right.

What I could not find was a **skill** that could look at a design I admire and turn it
into something I could actually re-use. Not "inspiration". Not a mood board. A set of
rules I could apply to my own words and my own screenshots — again and again, in Chinese
and in English.

Everything I tried handed me a template. But a template is someone else's answer.
**I didn't want the answer. I wanted the grammar.**

So I stopped searching and built one.

The result is `style-distill`: you give it a **design source** — most often a template
link like the one I was staring at, but equally a PDF, a screenshot, a painting — and
it doesn't "take inspiration" from it. It *measures* it.
Then it casts what it measured into a reusable skill, applies that skill to **your**
content, and finally checks whether the result is a genuine twin of the original.

Five different design languages. One manuscript. All five documents in
[`examples/`](examples/) were produced by this skill — that is the whole point:
**the source changes, the writing stays yours.**

---

## What it actually measures

Every number in the fingerprint comes from an instrument, not an opinion:

| It measures | With |
| --- | --- |
| Palette **and each colour's area share** | k‑means over the rendered pixels / computed styles |
| Layout skeleton, grid columns, block order | DOM geometry, or pixel bands when the source is an image |
| Type scale, line height, letter spacing | computed styles — or line‑height profiling when only a screenshot exists |
| Image strategy, hero ratio, whitespace ratio | pixel statistics |
| Craft (for paintings): brush energy, line language, edge hardness | pixel proxies |

Then **six gates** decide whether the output is a twin of the source:
dominant‑colour carry‑over · hue distribution · luminance distribution ·
type scale · grid columns · imagery strategy.

If a gate fails, it says so, with the number and the reason — including the times
when the gate's own assumption is wrong for that source.
**Nothing here is graded on vibes.**

---

## Gallery — one manuscript, five design languages

| | |
| --- | --- |
| ![T.D-Lovera](examples/case-01-td-lovera-overview.png) | ![Weave](examples/case-03-weave-overview.png) |
| **T.D-Lovera** (EN) — dark bands, condensed display type, orange punctuation | **Weave** (EN) — light grey canvas, rounded white cards, sienna accent, data charts |
| ![T.D-Lovera 中文](examples/case-02-td-lovera-zh-overview.png) | ![Klimt](examples/case-04-klimt-overview.png) |
| **T.D-Lovera** (中文) — same skeleton, system CJK stack, line breaks re‑tuned | **Klimt's *The Kiss*** — a painting, not a website: gold leaf, mosaic motifs, its own colour proportions |

Single pages, closer up:

| | |
| --- | --- |
| ![Weave cover](examples/case-03-weave-page-01.png) | ![中文内页](examples/case-02-td-lovera-zh-page-04.png) |

More detail: [`examples/README.md`](examples/README.md).

---

## How it works

```
READ  →  EXTRACT  →  MINT  →  VERIFY
```

1. **READ** — decide what kind of source this is, and write one line of design intent
   before touching anything.
2. **EXTRACT** — measure it. Live page? Read computed styles. Screenshot or painting?
   Go pixel‑first. Site behind Cloudflare? Borrow the browser, or fall back to the
   hosted full‑page screenshot and mark what can't be measured as *unverified*.
3. **MINT** — cast the fingerprint into a skill package: numeric rules + design tokens
   + a twin scaffold. That package is the reusable asset.
4. **VERIFY** — run the six gates against the source. Fix the two main beams
   (composition first, then colour) until it passes — or report honestly why it can't.

**Two load‑bearing beams, in this order:** composition (what sits where, how big, how
much air), then colour (which colours, **and in what area proportion**). Everything
else — type, pattern, texture, imagery, multilingual layout — is subordinate.
Get the order wrong and the result never looks like the source, no matter how precise
the fonts are.

---

## Quick start

```bash
# 1) put it where your agent keeps skills
cp -r style-distill <your-agent>/agent_state/skills/

# 2) it needs Node 18+, and playwright-core with a Chromium build
npm i -g playwright-core

# 3) measure a source
node scripts/dna-probe.mjs https://example.com      --out dna.json --shot source.png
node scripts/dna-probe.mjs ./my-painting.jpg        --out dna.json      # image source

# 4) cast it into a skill
node scripts/mint-skill.mjs --dna dna.json --name design-example --title "Example" --out skills/design-example

# 5) check the twin
node scripts/dna-probe.mjs ./output.html --out twin.json --shot twin.png
node scripts/dna-probe.mjs --compare dna.json twin.json     # exit code 0 = twin
```

Then just talk to your agent:

> *"Make me a PDF in the style of `<template link>` — here's my content, in Chinese."*

Paste a link from `land-book.com`, a Framer/Webflow template page, a Behance shot, a
PDF, or your own screenshot; say **中文** or **English**. If the source fights back
(403, Cloudflare, a login wall), the skill says so and takes the pixel route rather
than inventing numbers.

`INSTALL.md` covers the details, including how to read the skill without an agent framework.

---

## When the source fights back

Real sources are messy, so the reasoning is written down rather than hidden in code:
[`references/`](references/) contains the recipes for hostile CDNs and 403s, for
sources that exist only as screenshots, for placeholder imagery, for keeping the
wording intact across languages, and for pulling uploaded graphics into a style
without deforming them.

A few things learned the hard way, kept in the repo on purpose:

- A design aggregator's page is often 403 while **the filename of the screenshot it
  hosts is the real domain** — measure the real site, not the wrapper.
- A template whose cards are white on a white page has lost its cards — the page
  ground has to be the *source's* dominant colour.
- Nested arrays joined into HTML leak commas, and a comma inside a CSS grid becomes an
  anonymous grid item that pushes your third card onto a second row.
- When a gate fails, first measure **the source itself** against that same gate.
  Sometimes the threshold assumes something the source never was.

---

## Who this is for

Anyone who has to produce documents that have to *look like someone cared*:
founders writing to investors, small teams writing product philosophy, designers who
want a house style instead of a house template, and anyone who has ever thought
"why can't I just point at this and say *do that*?"

It's also fine to just steal the grammar.

---

## Say hello

Send me any template link you like the look of — or a document — and tell it Chinese
or English. It won't let you down.

And tell me what you make with it, or where it falls over.

**WeChat: `Lucy_2025V`**

---

## License

MIT — see [LICENSE](LICENSE).
The sample pages in `examples/` are from my own product documentation and are included
to show what the skill produces; the design languages they borrow belong to their
respective sources, and no source content (copy, images, logos, mascots) is
redistributed here.
