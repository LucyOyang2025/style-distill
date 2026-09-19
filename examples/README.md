# Examples — one manuscript, five design languages

Every document below was produced by this skill from **the same source manuscript**
(a product philosophy manifesto, ~6,000 words). Only the design source changed.

The point of the gallery is not "look, five PDFs". It's that the **content stayed
identical while the design language was fully swapped** — structure, colour area
proportions, type scale, imagery treatment, all re-measured from a different source
each time.

---

## 01 · T.D-Lovera (English)

- **Source:** a Framer landing page (design aggregator entry #90339)
- **Language:** English, 14 A4 landscape pages
- **What was measured:** near-black bands against white, one orange accent used only
  for small marks, a condensed display face at 320px for the wordmark, a 6-column grid.
- **Result:** dominant-colour carry-over 1.00 · hue divergence 0.00 · type scale 5/6 ·
  grid columns 6/6 · luminance distribution 0.384 (fails; the gate approximates
  luminance from element background colours, while the source's own pixels are
  light-dominant — both numbers are printed in the delivery report).

`case-01-td-lovera-overview.png` — all 14 pages.

## 02 · T.D-Lovera (中文)

- **Same source, same skeleton, different language.** Not one type size was changed:
  the Chinese edition runs the identical build with a different copy deck and a system
  CJK font stack (nothing was installed), with line-height opened up to 1.34–1.5 because
  CJK needs the air.
- Because the scale is untouched, the audit table is line-for-line identical to the
  English edition, and the gates return the same verdicts.

`case-02-td-lovera-zh-overview.png` — all 14 pages.
`case-02-td-lovera-zh-page-04.png` — a single page, closer up.

## 03 · Weave (English)

- **Source:** a SaaS landing page (entry #99993), whose live site was behind Cloudflare —
  so the fingerprint came from the hosted full-page screenshot (2000 × 10969 px) and
  everything that requires computed styles was marked *unverified* rather than guessed.
- **What was measured:** page ground `#F3F2F0` 43.1% · panel `#EBE9E7` 27.5% ·
  ink `#191413` 14.9% · card white `#FDFDFD` 6.7% · accent sienna `#9C4C3B` 2.6% ·
  a content column at 83.3% of the viewport · a single dark band only at the very end
  (88.9–100%) carrying an oversized wordmark.
- **Result:** dominant-colour carry-over 0.97 · hue 0.013 · luminance 0.057 · image
  area 0.150 · 14 pages with zero overflow and zero oversized whitespace bands.
  The "photographic feel" gate fails at 0.033 against a 0.12 threshold — but the source
  itself measures 0.043, so the threshold's assumption never held for this source.

`case-03-weave-overview.png` — all 14 pages.
`case-03-weave-page-01.png` — the opening page, closer up.

## 04 · Klimt's *The Kiss*

- **Source:** a painting, not a website. This one goes through the pixel route and the
  craft fingerprint (brush energy, line language, edge hardness, spatial range).
- **What mattered:** reproducing the *proportions* of the palette, not just its colours —
  distributing the gold evenly instead of by its measured shares moved the luminance gate
  from 0.338 (fail) to 0.188 (pass).

`case-04-klimt-overview.png` — all 15 pages.

---

## What the examples deliberately do **not** contain

No source content is redistributed: no source copy, no source photography, no logos,
no mascots. What you see is the style layer rebuilt over the author's own text and her
own product screenshots — which is exactly what the skill is for.

Interface screenshots in these documents come from the author's own app, captured on
device, with their colour mapped token-for-token into each template's palette
(measured area share per colour is identical before and after; only the hues move).
