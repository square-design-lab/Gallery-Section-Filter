# SDL Gallery Filter v1.1 — Documentation

Category, tag and metadata filtering for Squarespace 7.1 **Gallery Sections** — Grid, Masonry and Strips.

Squarespace gives gallery sections no tags, no categories and no JSON API. This plugin reads
metadata you write into each image's **caption**, builds a filter bar from it, and hides the raw
metadata so visitors never see it.

---

## Install

1. Open the **config generator** and build your setup.
2. Copy the code from the **Install code** tab.
3. Squarespace → **Settings → Advanced → Code Injection → Footer**
   (or **Page Settings → Advanced → Page Header Code Injection** for one page only).

```html
<link rel="stylesheet" href="https://gallery-section-filter.pages.dev/galleryFilter.css">
<script>
  window.SDL_GALLERY_FILTER_CONFIG = { /* your config */ };
</script>
<script src="https://gallery-section-filter.pages.dev/galleryFilter.js"></script>
```

---

## Step 1 — turn captions ON

**This is required.** A gallery section is not a collection, so Squarespace publishes no JSON for
it. The caption rendered into the page is the only place the plugin can read from, and when
captions are switched off Squarespace leaves them out of the page entirely.

Edit the page → click the gallery section → **Edit Section → Design** → set **Captions** to show.
Any caption style works.

The plugin then hides them again. With the default `captionMode: 'clean'` the metadata is stripped
before the page paints — an anti-flash style keeps `.gallery-caption` invisible until the plugin has
rewritten it, so the raw `Tags: …` text never appears, not even for a frame.

## Step 2 — write the metadata into each caption

Click an image → **Edit** → put your filter data in the **caption** field.

```
Tags: Interiors > Residential, Branding. Year: 2025. Location: Madrid. Author: Sam.
```

| Rule | Detail |
|---|---|
| `Key: value.` | Each pair ends with `.` `;` `\|` or a newline. The **last pair may end with nothing** — a missing final full stop is handled. |
| Several values | Comma separated: `Tags: Branding, Design.` |
| Sub-categories | `Parent > Child`. Registers **both**, so selecting *Interiors* matches everything under it while *Residential* narrows to that child. |
| `Location` | Never comma-split, so `Location: London, UK` stays one place. |
| Your own keys | Any key works. `Author: Sam.` becomes an Author filter with **no configuration**. |
| Missing keys | Fine. An image with no `Year` simply never matches a Year filter. |
| Plain prose | Anything that isn't a `Key: value` pair is kept as the visible caption in `clean` mode. |

Recognised aliases: `Tag`/`Tags`/`Filter` → **Tags** · `Category`/`Categories` → **Categories** ·
`Loc`/`Location`/`Locations` → **Location** · `Year`/`Date` → **Year**. Everything else keeps your
own wording, Title Cased.

This is the same authoring format as the SDL **Portfolio Filter**, so a site running both writes
metadata one way only.

---

## How filtering behaves

- **Within a group** choices are OR — *Branding* + *Design* shows images with either.
- **Across groups** choices are AND — *Branding* + *2024* shows images with both.
- **Counts and dimming are contextual** — computed against the *other* active groups. Options that
  would return nothing are dimmed and disabled.
- Filtering **shows and hides the real Squarespace items**. Nothing is re-created, so the Gallery
  Lightbox and any other plugin bound to your images keeps working.
- Each gallery section filters **independently**, with its own taxonomy built from its own images.

---

## Configuration

### Sections and captions

| Key | Default | Notes |
|---|---|---|
| `sections` | `'all'` | `'all'`, or an array of Section IDs |
| `captionMode` | `'clean'` | `clean` · `meta` · `raw` · `hide` |
| `captionFields` | `[]` | `meta` mode — which fields to show. Blank = all |
| `captionDelimiter` | `' / '` | `meta` mode separator |
| `captionShowKeys` | `false` | `meta` mode — prefix values with the key name |
| `tagDelimiter` | `'comma'` | `comma` · `pipe` · `slash` · `semicolon` |

**Caption modes**

- `clean` — strip every `Key: value` pair, keep any remaining prose. The caption is hidden entirely
  if nothing remains.
- `meta` — rebuild the caption from chosen fields. Only leaf values are shown, so
  `Interiors > Residential` renders as *Residential*, not both.
- `raw` — leave Squarespace's caption exactly as authored.
- `hide` — no caption at all.

### Where the options live

```js
display: {
  container: 'dropdown',    // 'dropdown' | 'inline'
  optionStyle: 'checkbox',  // 'checkbox' | 'buttons' | 'text'
  showLabel: true,          // inline only — the group heading
  pillRadius: 999,          // buttons only (also settable as styles.pillRadius)
  delimiter: 'pipe'         // text only — pipe|space|comma|slash|dot|dash, or any literal
}
```

- **`dropdown`** — one labelled button per group in the toolbar, opening an animated
  panel. Carries a count badge when the group has selections.
- **`inline`** — every option rendered straight into the toolbar.

The **sidebar and drawer always use accordions** regardless of `container` — a dropdown inside a
narrow column would open over its own siblings. Accordions carry the same count badge and honour
each group's `collapsed` setting.

A single group can override `optionStyle` with its own `ui` (`checkbox` · `pills` · `chips` ·
`text`).

### Filter groups

Groups are **discovered from your captions**. The default `groups: [{ type: 'auto' }]` expands into
one group per key found. Add a new key to a caption and it appears with no config change.

Customise by exception:

```js
autoGroups: {
  defaultUi: 'pills',
  multiSelect: true,
  showCounts: false,
  order: ['Tags', 'Year'],        // the rest follow in discovery order
  allText: 'All {field}',         // {field} → the group's label
  settings: {
    Tags:   { label: 'Category', ui: 'text', delimiter: '/' },
    Year:   { multiSelect: false },
    Author: { enabled: false }
  }
}
```

| Field | Purpose |
|---|---|
| `label` | What visitors see. Rename freely |
| `ui` | `pills` · `chips` · `text` · `checkbox` |
| `multiSelect` | `false` = one choice at a time |
| `showCounts` | Result count beside each value |
| `showLabel` | `false` drops the group heading |
| `delimiter` | `text` UI only |
| `exclude` | Values to hide from this group |
| `allText` | This group's wording for the All option |
| `enabled` | `false` hides one group, leaving the rest automatic |

You can also pin one group manually: `groups: [{ source: 'Tags' }, { type: 'auto' }]`.

### Layout

| Key | Default | Notes |
|---|---|---|
| `layout` | `'top'` | `'top'` or `'sidebar'` (left) |
| `align` | `'left'` | Top layout — `left` · `center` · `right` |
| `sidebarWidth` / `sidebarWidthUnit` | `25` / `'%'` | `'%'` or `'px'` |
| `stickySidebar` / `stickyToolbar` | `false` | |
| `stickyTopOffset` | `20` | px |
| `mobileBreakpoint` | `1024` | Below this the drawer takes over |
| `filterButton.showOnDesktop` | `false` | Add a “Filters” drawer button on desktop |
| `filterButton.showOnMobile` | `true` | |
| `filterButton.hideGroupsOnDesktop` | `false` | Desktop “button only” — hides the inline groups so the drawer is the sole route in |
| `filterButton.side` | `'left'` | Which side the drawer slides from |

On mobile the button always replaces the inline groups. On desktop both can coexist unless
`hideGroupsOnDesktop` is set. Whenever the button is off at a breakpoint the groups come back —
**the filters can never become unreachable.**

### Display

| Key | Default |
|---|---|
| `showAllOption` | `true` — a leading "All" that clears its own group |
| `showCounts` | `false` |
| `disableZeroOptions` | `true` — dim options that would return nothing |
| `showResultCount` | `false` |
| `showActiveChips` | `false` — removable chips listing what's selected |
| `showClearAll` | `true` |

The count, chips and “Clear all” share a **meta row** under the toolbar, which hides itself entirely
when there is nothing to show.

### Search and sort

```js
search: { enabled: false, placeholder: 'Search' },
sort:   { enabled: false, options: ['gallery','az','za','newest','oldest','random'],
          defaultOrder: 'gallery', sortField: 'Year' }
```

Search matches the full caption text. `newest` / `oldest` sort on `sortField` (default `Year`).
`gallery` is Squarespace's own order.

### Motion

```js
animation: { type: 'fade', speed: 'normal', duration: null, stagger: 40 },
layoutTransition: true
```

`layoutTransition` slides masonry and strips images to their new positions instead of jumping.
Everything is skipped under `prefers-reduced-motion`.

### URL

| Key | Default | Notes |
|---|---|---|
| `urlSync` | `true` | Filtered views are shareable |
| `urlParamPrefix` | `'f_'` | **Do not remove.** See below |
| `scrollOnChange` | `false` | |

Parameters are namespaced twice: `?f_s1_tags=branding`. The `f_` prefix is essential — Squarespace
consumes bare `category`, `tag`, `author`, `month`, `view`, `page` and `format` parameters
server-side and would render an empty gallery. The `s1_` scope keeps two galleries on one page from
overwriting each other.

### Styling — follows your site automatically

With `styles.inherit: true` (the default) the filter takes:

- **Font family, letter-spacing and text colour** from the gallery section it sits in — not from
  `<body>`, which often differs. The mobile drawer, which lives outside the section, is given the
  same values explicitly.
- **Accent** — the section's own text colour, so selected pills read as a deliberate inversion.
- **Borders / muted text / chip fills** — tints of that colour at `borderOpacity` (0.35), 0.62 and
  0.07.
- **Text on filled elements** — black or white, whichever contrasts with the accent.
- **Drawer background** — the nearest ancestor that actually paints something opaque.

| Key | Default |
|---|---|
| `styles.inherit` | `true` — master switch |
| `styles.textColor` / `accent` / `borderColor` / `mutedColor` / `activeColor` / `panelBg` / `sidebarBg` / `chipBg` | blank = derived |
| `styles.borderOpacity` | `0.35` |
| `styles.radius` / `pillRadius` | `6` / `999` |
| `styles.fontSize` / `gap` / `marginBottom` | `14` / `10` / `32` |

### Text

```js
text: {
  allText:'All', filterButton:'Filters', drawerTitle:'Filters',
  apply:'Show {n} results', clearAll:'Clear all', resultCount:'{n} of {total}',
  noResults:'No images match these filters.', noResultsReset:'Clear all filters',
  sortPlaceholder:'Sort'
}
```

`{n}` and `{total}` are substituted in `apply` and `resultCount`.

---

## Supported gallery types

| Type | Status | Why |
|---|---|---|
| **Grid** | Yes | Native CSS Grid — reflows on its own |
| **Masonry** | Yes | The plugin re-packs the columns |
| **Strips** | Yes | The plugin re-justifies the rows |
| Slideshow / Fullscreen Slideshow / Reel / Stacked | No | Carousels. Skipped with a console notice |

Squarespace lays masonry and strips out **once** and never recomputes — verified by hiding items and
firing `resize`, which left every transform byte-identical. The plugin therefore owns the layout for
those two, learning the column count, gutter and row height from Squarespace's own output at load.
A side effect is that masonry and strips now also reflow correctly on window resize, which they do
not do natively.

---

## JavaScript API

```js
window.SDL_GALLERY_FILTER.instances   // one per gallery section
window.SDL_GALLERY_FILTER.relayout()  // re-pack every managed gallery
window.SDL_GALLERY_FILTER.reset()     // clear all filters
```

Each section fires a bubbling event on every change:

```js
document.addEventListener('sdl:galleryfilter:changed', function (e) {
  e.detail; // { sectionId, visible, total, visibleElements }
});
```

---

## Troubleshooting

**No filter appears, and the console says no caption metadata was found.**
Captions are switched off for that section, or the captions have no `Key: value` pairs. See Step 1.

**The raw `Tags: …` text is visible.**
`captionMode` is set to `'raw'`. Use `'clean'`.

**A gallery has gaps or a blank area after filtering.**
Report it — the managed layouts should never leave holes. As a stopgap,
`window.SDL_GALLERY_FILTER.relayout()` forces a re-pack.

**Filtering does nothing on a slideshow or reel gallery.**
Not supported in v1 — those are carousels.

**Filters reset when the page reloads.**
`urlSync` is off, or `urlParamPrefix` was cleared. Restore the prefix.

**Two galleries on a page fight over the URL.**
They shouldn't — parameters are section-scoped (`f_s1_`, `f_s2_`). Check the prefix is intact.

**The lightbox's next/previous arrows show images I filtered out.**
Known limitation. Clicking an image always opens the *correct* image, but SDL Gallery Lightbox
builds its slide list once at page load, so its arrows still traverse the full gallery. Filtering
does not currently rebuild that list.
