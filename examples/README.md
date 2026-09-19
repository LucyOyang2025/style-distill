# Examples — one manuscript, three design languages

Every document below was produced by this skill from **the same source manuscript**
(a product philosophy manifesto, ~6,000 words). Only the design source changed.

The point of the gallery is not "look, three PDFs". It's that the **content stayed
identical while the design language was fully swapped** — structure, colour area
proportions, type scale, imagery treatment, all re-measured from a different source
each time.

## What is shown, and what is held back

Each sheet below is a **deliberately scattered sample: five non-consecutive pages** of
a fourteen-page document, chosen to show the design language rather than the product.
Pages that carry the operator-side (B-end) dashboards and internal product flows are
**not published** — those are the part of the work that has to stay private. The pages
you do see are cover, method, process and concept pages, with the page numbers printed
on the corner of each tile so the gaps are honest.

So: judge the **typography, colour proportions, grid and image treatment** here — they
repeat page for page. The sample is a sample on purpose.

---

## 01 · T.D-Lovera (English)

- **Source:** a Framer landing page (a landing-page gallery entry)
- **Language:** English, 14 A4 landscape pages
- **What was measured:** near-black bands against white, one orange accent used only
  for small marks, a condensed display face at 320px for the wordmark, a 6-column grid.
- **Result:** dominant-colour carry-over 1.00 · hue divergence 0.00 · type scale 5/6 ·
  grid columns 6/6 · luminance distribution 0.384 (fails; the gate approximates
  luminance from element background colours, while the source's own pixels are
  light-dominant — both numbers are printed in the delivery report).

`case-01-td-lovera-overview.png` — pages **01 · 04 · 07 · 11 · 12** (cover, six steps,
method, process, proof in numbers).

## 02 · T.D-Lovera (中文)

- **Same source, same skeleton, different language.** Not one type size was changed:
  the Chinese edition runs the identical build with a different copy deck and a system
  CJK font stack (nothing was installed), with line-height opened up to 1.34–1.5 because
  CJK needs the air.
- Because the scale is untouched, the audit table is line-for-line identical to the
  English edition, and the gates return the same verdicts.

`case-02-td-lovera-zh-overview.png` — the same five pages, in Chinese.

## 03 · Weave (English)

- **Source:** a SaaS landing page, whose live site was behind Cloudflare — so the
  fingerprint came from the hosted full-page screenshot (2000 × 10969 px) and
  everything that requires computed styles was marked *unverified* rather than guessed.
- **What was measured:** page ground `#F3F2F0` 43.1% · panel `#EBE9E7` 27.5% ·
  ink `#191413` 14.9% · card white `#FDFDFD` 6.7% · accent sienna `#9C4C3B` 2.6% ·
  a content column at 83.3% of the viewport · a single dark band only at the very end
  (88.9–100%) carrying an oversized wordmark.
- **Result:** dominant-colour carry-over 0.97 · hue 0.013 · luminance 0.057 · image
  area 0.150 · 14 pages with zero overflow and zero oversized whitespace bands.
  The "photographic feel" gate fails at 0.033 against a 0.12 threshold — but the source
  itself measures 0.043, so the threshold's assumption never held for this source.

`case-03-weave-overview.png` — the same five pages, in the Weave language.

---

## What the examples deliberately do **not** contain

No source content is redistributed: no source copy, no source photography, no logos,
no mascots. What you see is the style layer rebuilt over the author's own text and her
own product screenshots — which is exactly what the skill is for.

Nor is the whole product on display: five scattered pages per document, and none of the
operator-side dashboard pages. The design language is the deliverable here; the product
is not.
