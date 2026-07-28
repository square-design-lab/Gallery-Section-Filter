# SDL Gallery Filter — Tech Spec

**Status:** v1.0 built and live-tested; pushed to `square-design-lab/Gallery-Section-Filter`
**Target:** Squarespace 7.1 **Gallery Sections** (not a collection page)
**Test page:** https://test-site-sdl.squarespace.com/gallery (3 gallery sections: Grid, Strips, Masonry)
**Verified against live DOM:** 2026-07-28

---

## 1. Verified environment findings

Everything below was read from the live test page, not assumed.

### 1.1 The three sections on the test page

| # | Type | Wrapper | Item | Layout mechanism |
|---|---|---|---|---|
| 0 | Grid | `.gallery-grid-wrapper` | `.gallery-grid-item` | **Real CSS Grid** — `display:grid`, `grid-template-columns: 440.375px 440.375px`, `gap: 23.95px` |
| 1 | Strips | `.gallery-strips-wrapper` | `.gallery-strips-item` | **JS-positioned** — wrapper `display:block` with a fixed px height; items `position:absolute` + inline `transform: matrix(...)` + inline `width` |
| 2 | Masonry | `.gallery-masonry-wrapper` | `.gallery-masonry-item` | **JS-positioned** — same as strips, `transform: translate3d(x,y,0)` |

Each section is `section.page-section.gallery-section[data-section-id]` (24-char id) — the per-section handle for config and for scoping.

### 1.2 The caption is in the DOM, twice

```html
<div class="gallery-grid-item" style="position:relative;cursor:pointer">
  <div class="gallery-grid-item-wrapper preFade">
    <img data-src data-image data-image-dimensions="2560x1792" alt="Tags: Branding, Design. Year: 2024. Location: London, UK. Author: Sam.">
  </div>
  <figcaption class="gallery-caption gallery-caption-grid-simple">
    <div class="gallery-caption-wrapper">
      <p class="gallery-caption-content">Tags: Branding, Design. Year: 2024. Location: London, UK. Author: Sam.</p>
    </div>
  </figcaption>
</div>
```

Two independent sources of the same string:
1. `.gallery-caption-content` (also `.gallery-caption`, `figcaption`)
2. **`img[alt]` — identical text.** This is the fallback when the site owner has captions set to hidden in the gallery section's design panel.

Caption class suffix follows the layout: `gallery-caption-grid-simple` / `-grid-strips` / `-grid-masonry`.

### 1.3 Live caption data on the test page (all 3 sections share the same 6 images)

```
Tags: Branding, Design. Year: 2024. Location: London, UK. Author: Sam.
Tags: Design, Development. Year: 2025. Location: Chicago. Author: Emily.
Tags: Development. Year: 2024. Location: California. Author: Sam
Tags: Branding. Year: 2024. Location: Paris. Author: Emily.
Tags: Interiors > Residential, Interiors > Hospitality, Branding. Location: Madrid.
Tags: Interiors > Residential, Interiors > Hotel, SEO. Location: Madrid. Year: 2025
```

Resulting taxonomy: **Tags** (Branding, Design, Development, SEO, Interiors → Residential/Hospitality/Hotel), **Year** (2024, 2025), **Location** (London UK, Chicago, California, Paris, Madrid), **Author** (Sam, Emily).

Note the real-world edge cases already present: a missing trailing period (item 3), a missing `Year` (item 5), and `Location: London, UK` — a value containing a comma that **must not** be split into two locations.

### 1.4 There is no JSON — confirmed

`/gallery?format=json-pretty` returns `mainContent` as a **rendered HTML string**, with no `sections` array and no per-image metadata. There is no `/gallery?format=json` structured gallery data, no `nestedCategories`, no item ids. Unlike Shop Filter and Portfolio Filter, this plugin is **DOM-only**. Consequence: no SWR cache layer, no network fetch, no pagination harvest — parsing is synchronous and instant.

### 1.5 The decisive finding — Squarespace never re-lays-out masonry or strips

Tested live: hid 3 of 6 masonry items and fired `window.resize` → **every `translate3d` and the wrapper's `1140.09px` height stayed byte-identical.** Then changed the container width and fired resize again → still identical. Squarespace's gallery layout is effectively one-shot; there is no public hook to re-trigger it (`window.Squarespace` exposes no gallery relayout API).

**So: hiding items with `display:none` works for Grid and breaks Strips and Masonry** — hidden items leave holes, and the wrapper keeps its original height, leaving a large blank gap under the section.

The plugin must own the layout for those two types.

### 1.6 The geometry is re-derivable — measured on the live page

**Masonry** — shortest-column packing:
```
col x = 0, 457      (item width 448px → gutter 9px)
y     = 0/0, 371/389, 742/760      ← columns advance independently
```

**Strips** — equal-width columns, each row aligned to the tallest item in that row:
```
x = 0, 461.429      (item width 441px)
y = 0, 395, 772     ← row 2 is 395 tall (caption 66px), row 3 starts 377 later (caption 48px)
```

Both are ordinary algorithms. The parameters (column count, column width, gutter, caption height) are all readable from Squarespace's own initial output at load time, and `img[data-image-dimensions="2560x1792"]` gives every aspect ratio **without waiting for images to load**.

### 1.7 Other findings

- All images are eagerly loaded on this page (`data-loaded="true"`, `src` already set). No lazy-load re-trigger needed here, but the plugin will call the standard `ImageLoader.load(img, {load:true})` on reveal defensively (`window.SQS.ImageLoader` is present).
- **SDL Gallery Lightbox is already installed on this page** (`window.SDL_LIGHTBOX`, injected `.sdl-lb-icon` spans inside every item). Filtering must not break its per-item bindings or its index map.
- Sections are full-bleed with `content-width--wide`; the filter bar must sit inside the section's content wrapper to respect site margins.

---

## 2. Architecture

### 2.1 Per-section, multi-instance

One page can hold any number of gallery sections, each with its **own independent filter bar and its own taxonomy** derived only from its own images. No-constructor IIFE with a per-section factory + `syncInstances()`, same pattern as Code Search and Collection Carousel.

Sections are opted in either by **section ID** (pasted from Squarespace) or by **"all gallery sections on this page"**, mirroring how Section Sync and Advanced Slider take a section ID.

### 2.2 Data layer — parse, don't fetch

```
for each gallery section:
  items = [...section.querySelectorAll(ITEM_SEL)]
  for each item:
    raw   = .gallery-caption-content ?? .gallery-caption ?? figcaption ?? img[alt]
    meta  = parseCaption(raw)        → { Tags:[…], Year:[…], Location:[…], Author:[…] }
    excerpt = raw with all `Key: value` pairs stripped
    ratio = img[data-image-dimensions] → w/h
  taxonomy = aggregate(meta) → ordered groups, with parent>child nesting
```

**`parseCaption()`** is adapted from Portfolio Filter's `parseSeoData()` — the same authoring format the user already knows:

- Regex `/([A-Za-z0-9 ]+):\s*([^|;.\n]+)(?=[|;.\n]|$)/gi` over the caption text.
- Key normalisation: `tag`/`tags` → `Tags`, `category`/`categories` → `Categories`, `loc`/`location(s)` → `Location`, `year`/`date` → `Year`; anything else Title-Cased and kept as a **custom group** (so `Author: Sam` becomes an Author filter with zero config).
- `Location` is **not** comma-split (protects `London, UK`); `Tags`/`Categories` are split by a configurable delimiter; other keys comma-split.
- `Parent > Child` produces **both** `Parent` and `Parent > Child`, so selecting *Interiors* matches all three of its children — the roll-up the Shop Filter does for nested categories.
- Missing trailing period and missing keys already handled by the lookahead — verified against the real strings in §1.3.

### 2.3 Layout engine — the core of this plugin

Three strategies, chosen per section from the detected type:

| Type | Strategy |
|---|---|
| **Grid** | Nothing to do. `display:none` on filtered-out items; the native CSS Grid reflows correctly. |
| **Masonry** | **Take over.** At init, measure Squarespace's own output to learn `{columnCount, columnWidth, gutterX, gutterY}`. On every filter change, run shortest-column packing over the *visible* subset, writing the same `transform: translate3d()` + `width` inline styles Squarespace itself writes, and set the wrapper height to the tallest column. |
| **Strips** | **Take over.** Same measured parameters; place visible items in row-major order, `rowHeight = max(itemHeight)` within each row. |

Item height is computed as `columnWidth / aspectRatio + captionHeight` — no image load wait, no layout thrash. A single `ResizeObserver` on the section re-derives column count and re-packs on breakpoint changes (Squarespace won't do it, so the plugin also **fixes** native masonry/strips resize behaviour as a side effect).

Transforms are transitioned (`transform .4s`) so filtering animates items into their new positions rather than jumping — the standard Isotope-style feel.

**Non-destructive guarantee, same as Shop Filter:** items are never cloned, re-created, re-ordered in the DOM or moved between parents. Only `display`, `transform`, `width` and a class change. Gallery Lightbox bindings, `.sdl-lb-icon` nodes and Squarespace's own click handlers all survive. A `sdl:galleryfilter:changed` event fires on the section so the lightbox can re-sync its index map to the visible set.

### 2.4 Caption presentation

The authoring string is metadata, not display copy — nobody wants `Tags: Branding, Design. Year: 2024.` under their photo. `captionMode`:

- `'clean'` **(default)** — strip every `Key: value` pair, leave the remaining prose (the "excerpt"); hide the caption entirely if nothing remains.
- `'meta'` — replace the caption with formatted chips/text built from chosen fields (`fields: ['Tags','Year']`, delimiter configurable), reusing Portfolio Filter's `metaDisplay` model.
- `'raw'` — leave Squarespace's caption untouched.
- `'hide'` — hide captions entirely.

An anti-flash `<style>` injected at head-parse time hides `.gallery-caption` until the plugin has rewritten it, so the raw `Tags: …` string never paints. This is the same anti-flash technique Shop Filter uses for `.product-list-nav`.

### 2.5 Filter UI — lifted wholesale from Shop Filter

The config surface, option set and visual design are Shop Filter's, minus the commerce-only groups. Reused as-is:

- **Group model** — ordered `groups[]`, each `{ source, label, multiSelect, ui, collapsed, showCounts, exclude, allText }`. `source` is a parsed key (`Tags`, `Year`, `Location`, `Author`, …) instead of a commerce facet. A `{ type:'auto' }` placeholder expands into one group per discovered key, so a new `Photographer:` line in a caption becomes a filter with no config change — the direct analogue of Shop Filter's `{ type:'variants' }`.
- **UI styles** — `checkbox` · `chips` · `pills` · `text` (with delimiter) · `dropdown` · `swatch`, plus `showLabel`, `pillRadius`, `delimiter`.
- **Layouts** — `top` toolbar (optionally sticky) and `sidebar` (left, `%`/`px` width, sticky, own bg + padding), collapsing to a mobile drawer under `mobileBreakpoint` (1024), with `filterButton.showOnDesktop/showOnMobile` and the "filters can never become unreachable" fallback.
- **Matching** — OR within a group, AND across groups. Contextual counts; zero-count options dimmed + `aria-disabled`.
- **Search + sort** — both default off. Search over caption text + all parsed values. Sort: gallery order (native), A–Z, Z–A, newest/oldest **by parsed `Year`**, random. (No price/stock/sale — commerce-only, dropped.)
- **"All" option** — global `showAllOption` with per-group `allText` override, exactly as Shop Filter v1.9/v1.10.
- **Styling** — the **Follow site styles** master switch and `detectSurfaceBg()`, the full `--sdl-gf-*` variable set (`textColor`, `accent`, `accentSolid`, `onAccent` by luminance, `borderColor`, `mutedColor`, `activeColor`, `panelBg`, `borderOpacity`, `radius`, `fontSize`, `gap`, `marginBottom`), font-family hard-wired to `inherit`.
- **Animation** — `{type, speed, duration, stagger}` replayed on each filter change, one forced reflow not one per item, skipped under `prefers-reduced-motion`.
- **URL state** — namespaced `f_` prefix. **Non-negotiable:** Shop Filter proved `?tag=`/`?category=` are consumed server-side by Squarespace. With multiple sections on a page, params are further scoped per section: `?g1_tags=branding&g1_year=2024`, keyed by the section's config index.
- **A11y** — `aria-expanded`, focus trap in the drawer, `role="status"` on the count, full keyboard nav.

### 2.6 Known Shop Filter bugs to carry the fixes for, not rediscover

1. Parent may be a CSS grid → `grid-column: 1 / -1; width: 100%` on our roots.
2. `[hidden] { display:none !important }` scoped to plugin roots.
3. Forced reflow (`void el.offsetWidth`), never `requestAnimationFrame`, to start transitions.
4. `--sdl-gf-accent` must always resolve to a real colour, never `currentColor`.
5. Count colour on a filled chip must use `--sdl-gf-on-accent`.
6. Dropdown open/close via `grid-template-rows: 0fr → 1fr`, panel never toggled with `hidden`.

---

## 3. Files

```
Gallery Filter/
  galleryFilter.js        no-constructor IIFE, window.SDL_GALLERY_FILTER_CONFIG
  galleryFilter.css
  config-generator.html   port 7795
  PLAN.md                 this file → becomes TECH-SPEC.md
  DOCUMENTATION.md
```

---

## 4. Config generator

Shop Filter's generator, re-skinned. Same left-nav sections: **Sections & Data** (which gallery sections; caption mode; delimiter) · **Filter Groups** (add/remove/reorder, per-group label/UI/multi-select/All text/exclusions) · **Layout & Behavior** · **Search & Sort** · **Styling & Colors** · **Labels & Text** · **Install code**. Same conditional-reveal behaviour (v1.5) so irrelevant panels hide.

The live preview renders a mock gallery seeded with the **real test-page captions from §1.3**, in all three layouts, running the real packing algorithm — so the preview shows genuine masonry re-packing, not a static mock.

---

## 5. Decisions taken (flagging rather than blocking)

1. **v1 supports Grid, Masonry and Strips.** Slideshow, Fullscreen-Slideshow, Reel and Stacked are carousels — filtering them means rebuilding a slider's internal slide array, a materially different problem, and none are on the test page. The plugin will detect them and no-op with a console warning. Say the word if you want them in v1.
2. **Caption source order:** `.gallery-caption-content` → `figcaption` → `img[alt]`. Verified identical on this page, so galleries with captions hidden in the design panel still filter.
3. **`captionMode: 'clean'` is the default** — the raw `Tags: …` string is authoring data and should not paint.
4. **Per-section taxonomy, not page-wide.** Each section aggregates only its own images. (Config can opt a section into sharing another's group list if you want the three demo sections to look identical.)
5. **No caching.** Parsing 6–200 DOM captions is sub-millisecond; sessionStorage would only add staleness bugs.

---

## 5b. Additional findings during the build

### `data-props` is authoritative — better than reverse-engineering geometry

Each gallery controller element carries its real settings as JSON:

```
GalleryGrid     { numColumns:2, gutter:50, aspectRatio:'four-three', width:'inset' }
GalleryStrips   { rowHeight:300, gutter:20, width:'full' }
GalleryMasonry  { numColumns:2, gutter:20, width:'inset' }
```

Also `data-show-captions="true|false"` — the definitive signal for whether captions are on.

**But `gutter` is in Squarespace's own unit, not pixels.** Masonry `gutter:20` renders as a 9px gap;
strips `gutter:20` renders as ~20px. There is no reliable conversion, so the plugin takes
`numColumns` / `rowHeight` from `data-props` and **measures the pixel gutter** from the initial
layout (`x[1] - x[0] - colWidth`).

### Item height must come from the rendered box, not the source image

Squarespace writes an explicit pixel `height` on `.gallery-*-item-wrapper`. That height encodes any
aspect-ratio crop the gallery is set to, so the plugin records `heightRatio = wrapperHeight /
itemWidth` per item at init rather than using `data-image-dimensions`. A cropped gallery keeps its
crop.

### Strips justifies its trailing row — the plan got this wrong

The plan assumed a partial last row stays at natural height. Live measurement disproved it: two
leftover images were scaled from the 300px target row height to **632px** (903px wide each) to fill
the container. The cap was removed; `maxLastRowScale` (default 3) only stops a single leftover image
becoming absurd.

### Bug: images revealed by filtering stayed invisible

Squarespace fades gallery items in with `preFade` (opacity 0) plus a `fadeIn` class added by a scroll
observer. An item that was `display:none` when that observer would have fired **never receives
`fadeIn`**, so filtering it back into view left it permanently at opacity 0. Reproduced on the grid
section: a matching image rendered blank. `apply()` now adds `fadeIn` to every visible item.

### Bug: the mobile drawer inherited the wrong font

The drawer is appended to `<body>`, so `font-family: inherit` resolved against the body, not the
gallery section. On the test site the inline bar rendered **Inter** (section) while the drawer
rendered **sans-serif** (body). `themeVarsFor()` now resolves the section's computed
`font-family`, `letter-spacing` and `color` into instance-scoped CSS variables.

### Testing artifacts worth remembering

1. **`location.href = url + '#hash'` does not reload the page.** A whole round of "bugs" (a missing
   filter group, an inverted mobile button) was a stale instance from the previous config still
   running behind the `__sdlGalleryFilterBooted` guard. Use `location.replace()` with a cache-buster.
2. **Chrome reports `visibilityState: "hidden"` when the window is occluded**, stops painting, and
   `getComputedStyle` returns pre-transition values — the open drawer read as `translateX(-360px)`.
   Screenshots taken in that state are stale. Assert on DOM state, and verify transition end-states
   by injecting `transition: none !important`.

---

## 6. Verification performed

All against the live test page, all passing.

| Check | Result |
|---|---|
| Caption parsing vs ground truth | Exact on all 6 images, including `London, UK` kept whole, a missing trailing period, and a missing `Year` |
| Nested tags | `Interiors` + `Interiors > Residential` both registered; selecting the parent matches all children |
| Auto-discovery | Tags / Year / Location / Author found with zero config |
| **Unfiltered masonry vs native** | **Pixel-identical** — rows at y 0 / 642 / 1284, width 891, wrapper 1908px |
| **Unfiltered strips vs native** | **Pixel-identical** — x 0 / 462 / 924 / 1386 at 442px, trailing row 904px (native 903), wrapper 963px (native 961) |
| Masonry filtered | Interiors → 2 items repacked side by side, wrapper 1908 → 624px |
| Strips filtered | Justified row, no holes, correct wrapper height |
| Grid filtered | 3 visible / 3 `display:none`, native CSS grid reflow |
| Per-section independence | Filtering one section leaves the other two untouched |
| Deep links | `?f_s3_tags=interiors&f_s1_year=2024&f_s2_location=madrid` restores all three sections independently |
| Contextual dimming | With Year 2024 selected, Interiors/Hospitality/Hotel/Residential/SEO and Chicago/Madrid correctly dimmed |
| Theme inheritance | Font Inter (matches the gallery's own captions), accent `rgb(21,20,20)` from section text, on-accent `#ffffff` by luminance, panel bg `rgb(255,254,245)` — the theme's off-white |
| Captions hidden | 6/6 in `clean` mode; `meta` mode renders `Branding, Design / 2024` with leaf values only |
| Sidebar layout | Sticky, 450px (25% of 1800); grid narrowed to 1314px and **all three layouts re-fit exactly** |
| Mobile drawer | Button shown / inline groups hidden below the breakpoint; drawer opens to `translateX(0)`, overlay visible, body locked, filters work from inside, Escape closes and unlocks |
| Generator output applied verbatim | Sidebar + `Tags` relabelled "Category" as `text` UI + `Author` disabled + meta captions + search + sort — all correct on the live site |
| Gallery Lightbox coexistence | Lightbox opens after filtering and its thumbnail strip shows **3** thumbnails, matching the filtered set |

---

## 7. Original build order

1. `galleryFilter.js` skeleton — section discovery, type detection, caption parse, taxonomy aggregation. Verify parsed output against §1.3 ground truth on the live page.
2. Layout engine — parameter measurement, masonry packing, strips packing, `ResizeObserver`. Verify positions against Squarespace's own output with zero filters applied (must be pixel-identical before any filter is touched).
3. Filter matching + state + URL sync.
4. UI render + `galleryFilter.css` (port Shop Filter's CSS, rename `--sdl-sf-*` → `--sdl-gf-*`).
5. Caption rewriting + anti-flash.
6. Mobile drawer, sticky, responsive fallbacks.
7. `config-generator.html`.
8. Live test on all three sections; confirm Gallery Lightbox still opens the right image after filtering.
9. `DOCUMENTATION.md`, deploy to `square-design-lab/Gallery-Filter` + Cloudflare Pages.

---

## 8. Remaining work

- **Cloudflare Pages** — not yet connected. `DOCUMENTATION.md` and the generator reference
  `gallery-section-filter.pages.dev`; that hostname needs to be created and Git-connected to this
  repo before the install snippet works for customers.
- **Slideshow / Reel / Stacked** galleries are detected and skipped. Supporting them means driving a
  carousel's internal slide array, which is a materially different problem.
- **Strips row packing verified at 2 and 4 items per row only**, all at the same aspect ratio, because
  the test gallery uses six images of two ratios. Worth a pass with mixed portrait/landscape.
- **Mobile column count** for masonry uses a width heuristic (`<640px → 1 col`, `<900px → 2`) rather
  than Squarespace's own rule, which could not be observed — Squarespace never re-lays-out on resize,
  so there is no native behaviour to copy.
- **Gallery Lightbox — opening is correct, navigation is not.** Tested the worst case: filtered to
  `Tags: SEO`, which leaves only the *last* of six images. Clicking it opened that exact image
  (`imgg-demo-a3mKUH6c`), so there is no index desync on open. But the lightbox's slide list is
  built over **all six** items at page load, so the prev/next arrows still walk into filtered-out
  images. Fixing this means patching `lightbox.js` to rebuild its list on the
  `sdl:galleryfilter:changed` event — a change to the sibling plugin, deliberately not made here.
- Untested: galleries with more than ~50 images, and pages mixing supported and unsupported gallery
  types.
