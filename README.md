# SDL Gallery Filter

Category / tag filtering for **Squarespace 7.1 Gallery Sections** â€” Grid, Masonry and Strips.

Squarespace gives gallery sections no tags, no categories and no JSON. This plugin reads
metadata you write into each image's **caption**, builds a filter bar from it, and hides the
raw metadata so visitors never see it.

```
Tags: Interiors > Residential, Branding. Year: 2025. Location: Madrid. Author: Sam.
```

â†’ filter groups for **Tags** (with *Interiors* rolling up its children), **Year**,
**Location** and **Author**, with no configuration at all.

## Install

```html
<link rel="stylesheet" href="https://gallery-section-filter.pages.dev/galleryFilter.css">
<script>
  window.SDL_GALLERY_FILTER_CONFIG = { /* built by the config generator */ };
</script>
<script src="https://gallery-section-filter.pages.dev/galleryFilter.js"></script>
```

Paste into **Settings â†’ Advanced â†’ Code Injection â†’ Footer**, or into the page's own
Page Header Code Injection.

## Captions must be switched on

The caption is the only place gallery metadata can live, and Squarespace omits it from the
page entirely when captions are off. In the gallery section's **design panel, turn captions
on** â€” the plugin hides them again visually (`captionMode: 'clean'` by default), so nothing
changes for visitors.

## Files

| File | Purpose |
|---|---|
| `galleryFilter.js` | The plugin |
| `galleryFilter.css` | Styles â€” inherits your site's fonts and colours |
| `config-generator.html` | Visual config builder: accordion sidebar, live preview, install code and setup guide |
| `DOCUMENTATION.md` | Full reference |
| `TECH-SPEC.md` | Verified DOM findings and architecture |

## Supported gallery types

| Type | Status |
|---|---|
| Grid | âœ… |
| Masonry | âœ… |
| Strips | âœ… |
| Slideshow / Reel / Stacked | âŒ carousels â€” skipped with a console notice |

Built by [Square Design Lab](https://squaredesignlab.com).

