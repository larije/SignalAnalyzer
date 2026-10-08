# Design System — xau-analyzer

Audit-era snapshot (2026-09-15). Part 1 documents what the code actually does today,
including verified defects (canonical IDs from the audit register — see TECHNICAL_DEBT.md).
Part 2 proposes an incremental token and component system that keeps the existing palette
and aesthetic; it is scheduled as Phase 2 (tokens, typography, buttons, A11Y-2/3/4) and
Phase 3 (responsive grids, reduced motion) of the canonical roadmap. No rewrite is proposed.

All code references are relative to the `xau-analyzer/` app folder. The entire UI lives in
one file, `app/page.tsx` (1,659 lines), styled inline; `app/layout.tsx` provides fonts and
the body shell. There are no CSS files and no CSS framework.

---

## Part 1 — Current state

### 1.1 Colour tokens (`C`, app/page.tsx:14-33)

These are declared and genuinely used throughout the page. The dark palette is strong on
contrast for its main text colours (dim on surfaces 6.7-7.8:1, silver 11.6:1).

| Token | Value | Used as |
|---|---|---|
| `bg` | `#09090C` | Page background |
| `s0` | `#0D0F15` | Deepest surface |
| `s1` | `#111318` | Card surface |
| `s2` | `#181B23` | Inner panel / pill background |
| `s3` | `#1E222E` | Raised surface |
| `border` | `#262B3A` | All borders; also the scrollbar thumb |
| `gold` | `#D4AF37` | Brand accent, XAU asset colour |
| `goldLt` | `#E6B84A` | Gold highlight |
| `goldDk` | `#7A5F20` | Gold shade |
| `silver` | `#CBD5E1` | Secondary text, labels |
| `text` | `#F8FAFC` | Primary text |
| `dim` | `#94A3B8` | Muted text |
| `green` | `#22C55E` | Positive / BUY |
| `red` | `#EF4444` | Negative / SELL |
| `amber` | `#F59E0B` | Caution / performance accent |
| `blue` | `#3B82F6` | Info / signals accent |
| `violet` | `#A78BFA` | Intelligence accent |
| `btc` | `#F7931A` | BTC asset colour |

Known issue (**UX-10**): `app/layout.tsx:16` hardcodes body background `#0A0B0D`, which does
not match `C.bg` `#09090C` — visible as a flash during load.

### 1.2 Font tokens (`F`, app/page.tsx:36-40)

```ts
const F = {
  sans: '"Inter", "SF Pro Display", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
  num:  { fontVariantNumeric: "tabular-nums" as const },
};
```

The declared system is not enforced:

- **`F.mono` has zero references** (verified by grep). Instead, **118 raw
  `fontFamily: "monospace"` literals** are scattered through page.tsx (e.g. lines 675, 688,
  765, 870, 1132, 1188).
- **JetBrains Mono is never loaded.** `app/layout.tsx:14` loads only Inter from Google
  Fonts, so every one of those 118 literals — and `F.mono` itself, had it been used — falls
  back to the browser default monospace (Courier on most systems).
- The page therefore mixes two type systems arbitrarily: ~33 newer components use `F.sans`
  (e.g. page.tsx:295, 314), while the Institutional panels (page.tsx:857-1110) render in
  fallback Courier.
- Font weight 900 is requested in Courier contexts (page.tsx:688, 707, 765, 1188) where the
  fallback has no 900 cut.

### 1.3 Font sizes — no scale

Sizes are hardcoded px values spanning **9px to 32px** with no system: 9 (page.tsx:388),
10 (1178, 1207, 1216, 1224), 11 (dozens of places), 12, 12.5 (1217), 13-18, 22, 26, 28,
32 (765). All px, no rem — user browser font-size preferences have no effect. The 10-11px
floor amplifies the contrast problems below (**A11Y-4**).

### 1.4 Border radii — eight ad-hoc values

| Radius | Where |
|---|---|
| 16 | `Card` (page.tsx:283) |
| 12 | `MetricBox` (313), Institutional panels (869, 891, 911) |
| 10 | AdaptiveWeights (1057), timing box (703), CopyPriceCell (352) |
| 8 | priceCell (1177), indicator chips (830), backtest buttons (1628) |
| 6 | `Pill` (304), tab/TF/asset buttons (1359, 1373, 1383) |
| 5 | reason chips (751) |
| 3 | meter bars (850) |
| 20 (pill) | badges (691, 712, 1338) |

### 1.5 Five coexisting button styles

| Button group | Line | Style |
|---|---|---|
| Section tabs | page.tsx:1359 | radius `6px 6px 0 0`, padding 8×14, 12px, active bottom accent border |
| Chart TF | page.tsx:1373 | radius 6, padding 3×10, 11px |
| Asset toggle (₿/⬡) | page.tsx:1383 | radius 6, padding 4×14, 12px |
| Backtest period | page.tsx:1628 | radius 8, padding 6×16, 13px, filled (`C.s2`) when inactive |
| Run Backtest | page.tsx:1630 | radius 8, padding 6×20, 13px bold, `▶` glyph prefix |

All are below the 24px WCAG 2.5.8 touch-target minimum (TF buttons ≈ 19-20px tall).

### 1.6 Icon language — three systems mixed

- **lucide-react** (imported at page.tsx:7-11): TrendingUp/Down, Wifi, Copy, Check, etc.
- **Emoji**: session icons `🌏 🇬🇧 🗽 🔥 🌙` (page.tsx:889), asset glyphs `₿ ⬡` (1384).
- **Unicode text glyphs**: arrows `→ ↔ ◎ ↻` (861), `✓ ✗ ⚡ ▲` (1102, 919, 822),
  `▶` in the Run Backtest label (1631).

Screen readers read the emoji literally ("globe showing Asia-Australia"); none are marked
decorative.

### 1.7 Contrast failures (**A11Y-4**, verified)

- `#EF4444` red text on its `${C.red}14` alpha tint over `#181B23` computes to **4.26:1**;
  `#3B82F6` blue on its tint **4.27:1** — both fail WCAG AA (4.5:1) at the 11-13px sizes
  used (ProbRow pills page.tsx:848, `Pill` 299-308, NewsRiskPanel AVOID pill 915). Even on
  solid `s2` they reach only 4.57/4.68:1.
- The custom scrollbar (page.tsx:1649-1651) is **3px wide** with thumb `#262B3A` at
  **1.41:1** against the background — below the 3:1 non-text minimum and nearly ungrabbable.

### 1.8 Other systemic gaps (canonical findings)

- **A11Y-1**: global `button{outline:none}` (page.tsx:1653) removes all keyboard focus
  visibility; no `:focus-visible` style exists anywhere.
- **A11Y-3**: zero headings, landmarks, or ARIA attributes in the whole app; tab state is
  colour-only; signal flips and STALE warnings are never announced.
- **A11Y-5**: zero media queries; hard `1fr 1fr`, `1fr 280px`, and `repeat(4, 1fr)` grids
  plus two sticky non-wrapping 48px bars clip below ~900px; no
  `prefers-reduced-motion` guard on the infinite pulse animations.
- **A11Y-2**: CopyPriceCell (page.tsx:344-367) is a click-only `div` — keyboard-unreachable.

---

## Part 2 — Proposed design system (incremental)

Principle: keep the existing palette and dark aesthetic; formalise what the code already
mostly does; fix only the verified failures. Every item names the code it replaces.

### 2.1 Colour roles

The `C` object stays. Two text-tone additions and explicit roles:

| Role | Token | Value | Replaces / rule |
|---|---|---|---|
| Success (text, fills, borders) | `green` | `#22C55E` | Unchanged — passes at 7.55:1 |
| Warning (text, fills, borders) | `amber` | `#F59E0B` | Unchanged — passes at 8.02:1 |
| Error **text on tint** | `redText` (new) | `#F87171` | ≈6.6:1 on `s2`; use wherever `C.red` is currently text on a `${C.red}14` tint (page.tsx:848, 299-308, 915) per **A11Y-4** |
| Error fills/borders | `red` | `#EF4444` | Reserved for non-text use (borders, bar fills, chart strokes) |
| Info **text on tint** | `blueText` (new) | `#60A5FA` | ≈6.9:1 on `s2`; same substitution rule as red |
| Info fills/borders | `blue` | `#3B82F6` | Non-text use only |
| Brand / focus | `gold` | `#D4AF37` | Also the focus-ring colour (2.6) |
| Surfaces, text, accents | as in 1.1 | — | Unchanged |

Also fixes: align `app/layout.tsx:16` body background to `C.bg` `#09090C` (**UX-10**), and
widen the scrollbar to 10px with thumb `#4B5563` (≈3.2:1), replacing page.tsx:1649-1651.

### 2.2 Typography

1. **Load JetBrains Mono via `next/font`** in `app/layout.tsx` (alongside Inter, replacing
   the Google Fonts `<link>` at layout.tsx:12-14). This makes `F.mono` real for the first
   time.
2. **Replace all 118 `fontFamily: "monospace"` literals with `F.mono`** — a mechanical
   find-replace with zero behaviour change.
3. **Mono strictly for numerals** (prices, percentages, counts, timestamps — pair with
   `F.num` tabular figures); **sans for labels and prose**. This resolves the current
   arbitrary sans/Courier split.
4. **Five-step size scale**, replacing the 9-32px free-for-all (base 16px on `body`):

| Step | px | rem | Role | Replaces |
|---|---|---|---|---|
| xs | 11 | 0.688 | Captions, chip labels (floor — nothing below) | 9px (page.tsx:388), 10px (1178, 1207, 1216, 1224), 12.5px (1217) |
| sm | 12 | 0.75 | Body labels, pills, buttons | 12-13px cluster |
| md | 13 | 0.813 | Body text, panel copy | 13-15px cluster |
| lg | 16 | 1 | Sub-headline values | 16-18px cluster |
| xl | 22 | 1.375 | Metric values, card headlines | 22, 26, 28px (32px price display may stay as a deliberate one-off) |

5. **Weights**: 400/500/600/700/800 only. Drop the 900s in mono contexts (page.tsx:688,
   707, 765, 1188) — JetBrains Mono tops out at 800.

### 2.3 Spacing scale

`4 / 8 / 12 / 16 / 20 / 24` — derived from what the code already mostly uses (gap 20 at
page.tsx:1399, Card padding 24 at 284, panel padding 14-16px at 891). Off-scale values
(e.g. MetricBox `18px 20px` at 313, tab padding `8px 14px` at 1359) snap to the nearest
step during the component pass. No new values.

### 2.4 Radius tokens

`R = { card: 16, panel: 12, chip: 8, pill: 999 }`, declared beside `C`.

| Token | Replaces (from 1.4) |
|---|---|
| `R.card` (16) | Card 283 — unchanged |
| `R.panel` (12) | 12 at 313/869/891/911; absorbs the 10s (703, 1057, 352) |
| `R.chip` (8) | 8 at 1177/830/1628; absorbs 6 (304, 1359, 1373, 1383), 5 (751), 3 (850) |
| `R.pill` (999) | The 20px pill badges (691, 712, 1338) |

Eight values become four.

### 2.5 Component standards

- **`<Btn variant="tab" | "toggle" | "primary">`** — one component replacing the five
  inline styles at page.tsx:1359, 1373, 1383, 1628, 1630. Shared: `R.chip` radius, `F.mono`
  for glyph labels / `F.sans` otherwise, sm (12px) type, and `minHeight: 36` so every
  button clears the 24px touch-target minimum (currently 19-31px, see 1.5). Toggle
  variants carry `aria-pressed={active}`.
- **`Card`** (page.tsx:280-289) — kept as-is; already the best-behaved primitive
  (`R.card`, accent top border, consistent shadow).
- **`Pill`** (page.tsx:299-308) — kept; must take role colours from 2.1, i.e. `redText` /
  `blueText` when the colour is used as text on a tint (**A11Y-4**).
- **`MetricBox`** (page.tsx:310-318) — kept; padding snaps to `16 20` per 2.3.
- **Copy affordance** — CopyPriceCell (page.tsx:344-367) becomes a real
  `<button type="button">` with `aria-label` and an `aria-live="polite"` "Copied"
  announcement (**A11Y-2**).
- **Tabs** (**A11Y-3**) — the tab bar (page.tsx:1346-1364) gains `role="tablist"`, each
  tab `role="tab"` + `aria-selected`, each panel wrapper (1395, 1431, 1488, 1534, 1617)
  `role="tabpanel"` + `aria-labelledby`. Active state additionally conveyed by the
  existing border, not colour alone. The bars themselves get `<header>`/`<nav>`/`<main>`
  landmarks and the `Label` component (291-298) becomes a real heading.

### 2.6 Focus-visible ring (**A11Y-1**)

Replace `outline:none` in the global `<style>` block (page.tsx:1653) with:

```css
button:focus-visible { outline: 2px solid #D4AF37; outline-offset: 2px; }
```

One line; restores WCAG 2.4.7 for every button in the app.

### 2.7 Reduced motion (**A11Y-5**)

Append to the same `<style>` block (page.tsx:1644-1656):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Covers the infinite pulses (page.tsx:1319, 644, keyframes at 1645), the hover
`translateY(-1px)` lift (1654), and the continuously transitioning meter bars.

### 2.8 Responsive grid patterns (**A11Y-5**)

Inline-style replacements — no framework needed. Each hard grid becomes `auto-fit` +
`minmax` so columns stack instead of crushing:

| Current grid | Lines (page.tsx) | Replacement |
|---|---|---|
| `"1fr 1fr"` asset cards | 1399 | `repeat(auto-fit, minmax(360px, 1fr))` |
| `"1fr 1fr"` Signals-tab grids | 1436, 1445, 1449, 1453 | `repeat(auto-fit, minmax(360px, 1fr))` |
| `"1fr 1fr"` / `"1fr 1fr 1fr"` Intelligence grids | 1498, 1504, 1510, 1517 | `repeat(auto-fit, minmax(260px, 1fr))` |
| `"1fr 280px"` Probability layout | 1537 | `repeat(auto-fit, minmax(260px, 1fr))` |
| `repeat(4, 1fr)` metric grids | 626, 655 | `repeat(auto-fit, minmax(150px, 1fr))` |
| `"1fr 1fr 1fr"` Entry/Stop/Target row | 733 | `repeat(auto-fit, minmax(90px, 1fr))` |
| Sticky top bar / tab bar (fixed `height: 48`, no wrap) | 1315, 1345 | `flexWrap: "wrap"`, `height: "auto"`, `minHeight: 48`; hide ticker pills under ~768px (data is duplicated in the cards) |

### 2.9 Icon policy

**lucide-react only**, sizes 13-16, `aria-hidden="true"` on every decorative icon
(adjacent text carries the meaning). Replacements:

- Session emoji `🌏 🇬🇧 🗽 🔥 🌙` (page.tsx:889) → lucide Globe / Sun / Moon / Zap.
- Unicode arrows `→ ↔ ◎ ↻` (861) and `▲` (822) → the trend icons already imported
  (TrendingUp/Down, Minus, ArrowRight at page.tsx:7-11).
- `✓ ✗` (1102, 919) → Check / X (already imported).
- `▶` in "Run Backtest" (1631) → drop the glyph; the label suffices.
- Asset glyphs `₿ ⬡` (1384) may stay as branding, wrapped in
  `<span aria-hidden="true">` with the asset name as adjacent text.

---

*Sequencing, effort estimates, and the full findings register live in the canonical audit
synthesis; debt items referenced here (A11Y-1..5, UX-10) are tracked in TECHNICAL_DEBT.md.*
