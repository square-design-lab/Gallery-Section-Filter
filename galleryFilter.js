/* ------------------------------------------------------------------ */
/*  SDL Gallery Filter v1.0                                           */
/*  square-design-lab/Gallery-Section-Filter                          */
/*                                                                    */
/*  Filters Squarespace 7.1 Gallery Sections (Grid / Masonry /        */
/*  Strips) using metadata written into each image's caption:         */
/*                                                                    */
/*    Tags: Interiors > Residential, Branding. Year: 2025.            */
/*    Location: Madrid. Author: Sam.                                  */
/*                                                                    */
/*  Gallery sections are NOT a collection — there is no JSON for      */
/*  them (/page?format=json returns rendered HTML). The caption in    */
/*  the DOM is the only data source, which is why captions must be    */
/*  switched ON in the section's design panel. The plugin hides them  */
/*  again visually so the raw metadata never shows.                   */
/*                                                                    */
/*  Config: window.SDL_GALLERY_FILTER_CONFIG                          */
/* ------------------------------------------------------------------ */

(function () {
  'use strict';

  var NS = 'sdl-gf';
  var ALL = '__all__';
  var BOOTED = '__sdlGalleryFilterBooted';

  if (window[BOOTED]) return;
  window[BOOTED] = true;

  /* ------------------------------------------------------------------ */
  /*  DEFAULTS                                                          */
  /* ------------------------------------------------------------------ */

  var DEFAULTS = {
    // 'all' | array of section ids | array of 1-based section indexes
    sections: 'all',

    // How the Squarespace caption is presented once its metadata is parsed.
    //  'clean' — strip every "Key: value" pair, keep any remaining prose
    //  'meta'  — rebuild the caption from chosen fields
    //  'raw'   — leave Squarespace's caption alone
    //  'hide'  — no caption at all
    captionMode: 'clean',
    captionFields: [],          // 'meta' mode; empty = every parsed field
    captionDelimiter: ' / ',
    captionShowKeys: false,     // 'meta' mode — prefix values with "Tags: "

    // How Tags/Categories values are separated inside one caption.
    // 'comma' | 'pipe' | 'slash' | 'semicolon'
    tagDelimiter: 'comma',

    // [{ type:'auto' }] discovers one group per caption key.
    groups: [{ type: 'auto' }],

    autoGroups: {
      defaultUi: 'pills',
      multiSelect: true,
      showCounts: false,
      collapsed: false,
      order: [],                // e.g. ['Tags','Year'] — the rest follow
      allText: '',              // template, {field} → the field's label
      settings: {}              // { Tags: { label:'Category', ui:'text' } }
    },

    layout: 'top',              // 'top' | 'sidebar'
    align: 'left',              // 'left' | 'center' | 'right' (top layout)
    sidebarWidth: 25,
    sidebarWidthUnit: '%',
    stickySidebar: false,
    stickyToolbar: false,
    stickyTopOffset: 20,
    mobileBreakpoint: 1024,

    filterButton: {
      showOnDesktop: false,
      showOnMobile: true,
      showCount: true,
      side: 'left'
    },

    showAllOption: true,
    showCounts: false,
    disableZeroOptions: true,
    showResultCount: false,
    showClearAll: true,

    search: { enabled: false, placeholder: 'Search' },
    sort: {
      enabled: false,
      options: ['gallery', 'az', 'za'],
      defaultOrder: 'gallery',
      sortField: 'Year'
    },

    animation: { type: 'fade', speed: 'normal', duration: null, stagger: 40 },
    layoutTransition: true,

    urlSync: true,
    urlParamPrefix: 'f_',
    scrollOnChange: false,

    // Strips only — how far a trailing row may be scaled up to fill the width.
    maxLastRowScale: 3,

    text: {
      allText: 'All',
      filterButton: 'Filters',
      drawerTitle: 'Filters',
      apply: 'Show results',
      clearAll: 'Clear all',
      resultCount: '{n} of {total}',
      noResults: 'No images match these filters.',
      sortPlaceholder: 'Sort'
    },

    styles: {
      inherit: true,
      textColor: '', accent: '', borderColor: '', mutedColor: '',
      activeColor: '', panelBg: '', sidebarBg: '', chipBg: '',
      sidebarPadding: null,
      borderOpacity: 0.35,
      radius: 6,
      fontSize: 14,
      gap: 10,
      marginBottom: 32,
      pillRadius: 999
    },

    debug: false
  };

  /* ------------------------------------------------------------------ */
  /*  SMALL HELPERS                                                     */
  /* ------------------------------------------------------------------ */

  function isPlainObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
  }

  function merge(base, over) {
    var out = {}, k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (!over) return out;
    for (k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      out[k] = (isPlainObject(base[k]) && isPlainObject(over[k])) ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function slug(s) {
    return String(s).toLowerCase().trim()
      .replace(/\s*>\s*/g, '--')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function warn() {
    if (!CONFIG.debug) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[SDL Gallery Filter]');
    console.warn.apply(console, a);
  }

  var CONFIG = merge(DEFAULTS, window.SDL_GALLERY_FILTER_CONFIG || {});
  var S = CONFIG.styles;

  /* ------------------------------------------------------------------ */
  /*  CAPTION PARSING                                                   */
  /*                                                                    */
  /*  Same authoring format as the Portfolio Filter's SEO fields, so a  */
  /*  site using both writes metadata one way only.                     */
  /* ------------------------------------------------------------------ */

  // "Key: value" pairs, ended by . ; | or a newline. The lookahead (rather
  // than a consuming match) is what lets the final pair run to end-of-string
  // when the author forgets the trailing period — which happens in real data.
  var META_RE = /([A-Za-z0-9 _-]+):\s*([^|;.\n]+)(?=[|;.\n]|$)/g;

  function normalizeKey(key) {
    var lower = String(key).toLowerCase().trim();
    if (lower === 'tag' || lower === 'tags') return 'Tags';
    if (lower === 'category' || lower === 'categories') return 'Categories';
    if (lower === 'loc' || lower === 'location' || lower === 'locations') return 'Location';
    if (lower === 'year' || lower === 'years' || lower === 'date') return 'Year';
    if (lower === 'filter' || lower === 'filters') return 'Tags';
    // Anything else keeps the author's own wording, Title Cased — so
    // "Author: Sam" becomes an Author filter with no configuration at all.
    return lower.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function tagSplitRe() {
    switch (CONFIG.tagDelimiter) {
      case 'pipe': return /\|/;
      case 'slash': return /\//;
      case 'semicolon': return /;/;
      default: return /,/;
    }
  }

  function parseCaption(text) {
    var raw = String(text || '').trim();
    var fields = {};
    var order = [];

    META_RE.lastIndex = 0;
    var matches = [];
    var m;
    while ((m = META_RE.exec(raw)) !== null) matches.push(m);

    matches.forEach(function (mm) {
      var key = normalizeKey(mm[1]);
      var valueStr = String(mm[2]).trim();
      if (!valueStr) return;

      var values;
      if (key === 'Location') {
        // Never comma-split a location: "London, UK" is one place, not two.
        values = [valueStr];
      } else {
        values = valueStr.split(tagSplitRe());
      }

      if (!fields[key]) { fields[key] = []; order.push(key); }

      values.map(function (v) { return v.trim(); })
        .filter(function (v) { return v.length; })
        .forEach(function (val) {
          // "Interiors > Residential" registers BOTH the parent and the full
          // child path, so selecting the parent matches every child under it.
          var parts = val.split('>').map(function (p) { return p.trim(); }).filter(Boolean);
          if (parts.length > 1) {
            var parent = parts[0];
            var child = parts.slice(0, 2).join(' > ');
            if (fields[key].indexOf(parent) === -1) fields[key].push(parent);
            if (fields[key].indexOf(child) === -1) fields[key].push(child);
          } else if (fields[key].indexOf(val) === -1) {
            fields[key].push(val);
          }
        });
    });

    // Whatever prose is left once the metadata is removed.
    var excerpt = raw.replace(META_RE, '')
      .replace(/[.\n]+/g, '. ')
      .replace(/\s+\./g, '.')
      .replace(/^[.\s]+/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return { fields: fields, order: order, excerpt: excerpt, raw: raw };
  }

  /* ------------------------------------------------------------------ */
  /*  SECTION DISCOVERY & TYPE DETECTION                                */
  /* ------------------------------------------------------------------ */

  var TYPES = {
    grid: { ctrl: 'GalleryGrid', wrap: '.gallery-grid-wrapper', item: '.gallery-grid-item', native: true },
    masonry: { ctrl: 'GalleryMasonry', wrap: '.gallery-masonry-wrapper', item: '.gallery-masonry-item', native: false },
    strips: { ctrl: 'GalleryStrips', wrap: '.gallery-strips-wrapper', item: '.gallery-strips-item', native: false }
  };

  var UNSUPPORTED = ['GallerySlideshow', 'GalleryReel', 'GalleryStacked', 'GalleryFullscreenSlideshow'];

  function detectType(sectionEl) {
    for (var name in TYPES) {
      var t = TYPES[name];
      var ctrl = sectionEl.querySelector('[data-controller="' + t.ctrl + '"]');
      if (ctrl && sectionEl.querySelector(t.item)) return { name: name, spec: t, ctrl: ctrl };
    }
    for (var i = 0; i < UNSUPPORTED.length; i++) {
      if (sectionEl.querySelector('[data-controller="' + UNSUPPORTED[i] + '"]')) {
        return { name: 'unsupported', ctrl: UNSUPPORTED[i] };
      }
    }
    return null;
  }

  function wantedSections() {
    var all = $$('section.gallery-section, section[data-sqsp-section="gallery"]');
    var want = CONFIG.sections;
    if (!want || want === 'all' || (Array.isArray(want) && !want.length)) return all;
    var list = Array.isArray(want) ? want : [want];
    var ids = list.map(String).map(function (s) { return s.trim(); });
    return all.filter(function (sec, i) {
      var id = sec.getAttribute('data-section-id') || '';
      return ids.indexOf(id) !== -1 || ids.indexOf(String(i + 1)) !== -1;
    });
  }

  /* ------------------------------------------------------------------ */
  /*  COLOUR / THEME RESOLUTION                                         */
  /*                                                                    */
  /*  Everything the user leaves blank is derived from the site's own   */
  /*  computed styles, so the filter reads as part of the theme rather  */
  /*  than a widget dropped on top of it.                               */
  /* ------------------------------------------------------------------ */

  function parseColor(str) {
    var s = String(str || '').trim();
    var m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?/i);
    if (m) {
      var a = m[4] == null ? 1 : (String(m[4]).indexOf('%') > -1 ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return { r: +m[1], g: +m[2], b: +m[3], a: a };
    }
    m = s.match(/^#([0-9a-f]{3,8})$/i);
    if (!m) return null;
    var h = m[1];
    if (h.length === 3 || h.length === 4) {
      h = h.split('').map(function (c) { return c + c; }).join('');
    }
    if (h.length < 6) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
    };
  }

  function rgba(c, a) { return 'rgba(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ',' + a + ')'; }

  // Black or white, whichever reads on the given background.
  function contrastOn(bg) {
    var c = parseColor(bg);
    if (!c) return '#ffffff';
    var lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return lum > 0.6 ? '#111111' : '#ffffff';
  }

  // The nearest ancestor that actually paints something opaque. Squarespace
  // sections are usually transparent, and a floating dropdown panel needs a
  // real surface underneath it or the page shows through.
  function detectSurfaceBg(from) {
    var node = from || document.body;
    var guard = 0;
    while (node && guard++ < 14) {
      var c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.9) return 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')';
      node = node.parentElement;
    }
    return '#ffffff';
  }

  function animDuration() {
    var a = CONFIG.animation || {};
    if (a.duration) return parseInt(a.duration, 10);
    if (a.speed === 'slow') return 700;
    if (a.speed === 'fast') return 240;
    return 420;
  }

  function sidebarWidthValue() {
    var w = CONFIG.sidebarWidth;
    if (w == null || w === '') return '25%';
    return parseFloat(w) + (CONFIG.sidebarWidthUnit === 'px' ? 'px' : '%');
  }

  // Runs once per instance because panel/sidebar backgrounds are read from the
  // section the filter sits in, and different sections can have different
  // Squarespace section themes (white / dark / accent).
  function themeVarsFor(sectionEl) {
    var probe = sectionEl.querySelector('.gallery-section-wrapper') || sectionEl;
    var cs = getComputedStyle(probe);
    var bodyRgb = parseColor(cs.color) || parseColor(getComputedStyle(document.body).color) || { r: 17, g: 17, b: 17, a: 1 };
    var inherit = S.inherit !== false;

    function pick(userValue, derived) {
      if (!inherit && userValue) return userValue;
      return userValue || derived;
    }

    var accent = pick(S.accent, rgba(bodyRgb, 1));
    var vars = {};
    // The drawer is a child of <body>, outside the section, so `inherit` gives
    // it the *body* font and colour rather than the gallery's. Squarespace
    // sections routinely differ from body — this site renders Inter in the
    // section and sans-serif on body. Resolving them here keeps the drawer
    // identical to the inline bar.
    vars['font'] = cs.fontFamily || 'inherit';
    vars['ls'] = cs.letterSpacing && cs.letterSpacing !== 'normal' ? cs.letterSpacing : 'normal';
    vars['text'] = S.textColor || cs.color || 'inherit';
    vars['accent'] = accent;
    vars['accent-solid'] = accent;
    vars['on-accent'] = contrastOn(accent);
    vars['muted'] = pick(S.mutedColor, rgba(bodyRgb, 0.62));
    vars['border'] = pick(S.borderColor, rgba(bodyRgb, S.borderOpacity));
    vars['chip-bg'] = pick(S.chipBg, rgba(bodyRgb, 0.07));
    vars['active'] = S.activeColor || accent;
    vars['panel-bg'] = S.panelBg || detectSurfaceBg(probe);
    vars['sidebar-bg'] = S.sidebarBg || 'transparent';
    vars['sidebar-pad'] = (S.sidebarPadding != null ? S.sidebarPadding : (S.sidebarBg ? 18 : 0)) + 'px';
    vars['radius'] = S.radius + 'px';
    vars['pill-radius'] = S.pillRadius + 'px';
    vars['fs'] = S.fontSize + 'px';
    vars['gap'] = S.gap + 'px';
    vars['mb'] = S.marginBottom + 'px';
    vars['side-w'] = sidebarWidthValue();
    vars['sticky-top'] = CONFIG.stickyTopOffset + 'px';
    vars['anim-dur'] = animDuration() + 'ms';
    return vars;
  }

  /* ------------------------------------------------------------------ */
  /*  ANTI-FLASH                                                        */
  /*                                                                    */
  /*  The caption holds authoring metadata, not display copy. Hide it   */
  /*  at head-parse time so "Tags: Branding, Design." never paints,     */
  /*  then reveal whatever the caption mode decides to keep.            */
  /* ------------------------------------------------------------------ */

  function injectAntiFlash() {
    if (CONFIG.captionMode === 'raw') return;
    if (document.getElementById(NS + '-antiflash')) return;
    var st = el('style');
    st.id = NS + '-antiflash';
    st.textContent =
      'html:not(.' + NS + '-ready) .gallery-caption{visibility:hidden!important}' +
      '.' + NS + '-cap-hidden{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /*  INSTANCE                                                          */
  /* ------------------------------------------------------------------ */

  var instances = [];
  var uid = 0;

  function createInstance(sectionEl) {
    var detected = detectType(sectionEl);
    if (!detected) return null;

    if (detected.name === 'unsupported') {
      warn('Skipping ' + detected.ctrl + ' — slideshow, reel and stacked galleries are carousels and are not supported in v1.');
      return null;
    }

    var spec = detected.spec;
    var wrapEl = sectionEl.querySelector(spec.wrap);
    var itemEls = $$(spec.item, sectionEl);
    if (!wrapEl || !itemEls.length) return null;

    var inst = {
      id: ++uid,
      section: sectionEl,
      sectionId: sectionEl.getAttribute('data-section-id') || ('idx' + uid),
      type: detected.name,
      spec: spec,
      ctrlEl: detected.ctrl,
      wrap: wrapEl,
      items: [],
      groups: [],
      active: {},
      query: '',
      order: CONFIG.sort.defaultOrder || 'gallery',
      els: {},
      geom: null,
      captionsOff: detected.ctrl.getAttribute('data-show-captions') === 'false'
    };

    var props = {};
    try { props = JSON.parse(detected.ctrl.getAttribute('data-props') || '{}'); } catch (e) { props = {}; }
    inst.props = props;

    /* ---------------- ingest ---------------- */

    var missingCaptions = 0;

    itemEls.forEach(function (itemEl, idx) {
      var figEl = itemEl.querySelector('.gallery-caption');
      var capEl = itemEl.querySelector('.gallery-caption-content') || figEl;
      var img = itemEl.querySelector('img');
      var wrapper = itemEl.firstElementChild;

      // Caption first, image alt second. Squarespace copies the caption into
      // alt, so alt still works on some sites with captions switched off —
      // but not reliably, which is why the setup guide insists on captions.
      var raw = (capEl && capEl.textContent.trim()) || (img && img.getAttribute('alt')) || '';
      var parsed = parseCaption(raw);

      if (!Object.keys(parsed.fields).length) missingCaptions++;

      var dims = (img && img.getAttribute('data-image-dimensions')) || '';
      var dm = dims.match(/^(\d+)x(\d+)$/);
      var naturalRatio = dm ? (+dm[1] / +dm[2]) : 1.5;

      inst.items.push({
        el: itemEl,
        wrapper: wrapper,
        fig: figEl,
        capEl: capEl,
        img: img,
        idx: idx,
        raw: raw,
        fields: parsed.fields,
        excerpt: parsed.excerpt,
        naturalRatio: naturalRatio,
        // Filled in by measureGeometry() from Squarespace's own output, so a
        // cropped gallery (aspect-ratio setting) keeps its crop.
        heightRatio: 1 / naturalRatio,
        captionH: 0,
        title: (img && img.getAttribute('alt')) || '',
        visible: true
      });
    });

    if (missingCaptions === inst.items.length) {
      console.warn('[SDL Gallery Filter] Section ' + inst.sectionId +
        ': no caption metadata found on any image.' +
        (inst.captionsOff
          ? ' Captions are switched OFF for this gallery — turn them on in the section\'s design panel (the plugin hides them again visually).'
          : ' Add lines like "Tags: Branding, Design. Year: 2025." to each image caption.'));
      return null;
    }

    buildTaxonomy(inst);
    if (!inst.groups.length) return null;

    measureGeometry(inst);
    applyCaptionMode(inst);
    injectInstanceStyles(inst);
    buildUI(inst);
    readUrl(inst);
    apply(inst, false);

    return inst;
  }

  /* ------------------------------------------------------------------ */
  /*  TAXONOMY                                                          */
  /* ------------------------------------------------------------------ */

  function labelFor(field, cfg) {
    if (cfg && cfg.label) return cfg.label;
    return field;
  }

  function buildTaxonomy(inst) {
    // Discovered field order = order of first appearance across the section.
    var discovered = [];
    var byField = {};

    inst.items.forEach(function (it) {
      Object.keys(it.fields).forEach(function (k) {
        if (!byField[k]) { byField[k] = []; discovered.push(k); }
        it.fields[k].forEach(function (v) {
          if (byField[k].indexOf(v) === -1) byField[k].push(v);
        });
      });
    });

    inst.byField = byField;

    var ag = CONFIG.autoGroups || {};
    var settings = ag.settings || {};
    var wanted = [];

    (CONFIG.groups || []).forEach(function (g) {
      if (g.type === 'auto') {
        var order = (ag.order && ag.order.length) ? ag.order.slice() : [];
        // Configured order first, everything else after in discovery order.
        var rest = discovered.filter(function (f) { return order.indexOf(f) === -1; });
        order.filter(function (f) { return discovered.indexOf(f) !== -1; })
          .concat(rest)
          .forEach(function (field) {
            var s = settings[field] || settings[field.toLowerCase()] || {};
            if (s.enabled === false) return;
            wanted.push(merge({ source: field }, s));
          });
      } else if (g.source) {
        if (discovered.indexOf(g.source) === -1) return;
        wanted.push(g);
      }
    });

    var ag2 = CONFIG.autoGroups || {};

    inst.groups = wanted.map(function (g, i) {
      var field = g.source;
      var values = (byField[field] || []).slice();

      var exclude = (g.exclude || []).map(function (v) { return String(v).toLowerCase(); });
      values = values.filter(function (v) { return exclude.indexOf(String(v).toLowerCase()) === -1; });

      values = sortValues(field, values);

      var allText = g.allText ||
        (ag2.allText ? String(ag2.allText).replace(/\{field\}/g, labelFor(field, g)) : '') ||
        CONFIG.text.allText;

      return {
        key: 'g' + (i + 1),
        field: field,
        label: labelFor(field, g),
        showLabel: g.showLabel !== false,
        ui: g.ui || ag2.defaultUi || 'pills',
        multiSelect: g.multiSelect !== undefined ? g.multiSelect : (ag2.multiSelect !== false),
        showCounts: g.showCounts !== undefined ? g.showCounts : (ag2.showCounts !== undefined ? ag2.showCounts : CONFIG.showCounts),
        collapsed: g.collapsed !== undefined ? g.collapsed : !!ag2.collapsed,
        delimiter: g.delimiter || '/',
        allText: allText,
        values: values,
        nodes: []
      };
    }).filter(function (g) { return g.values.length; });

    inst.groups.forEach(function (g) { inst.active[g.key] = []; });
  }

  // Years descend (newest first, which is what people expect); everything else
  // is alphabetical, with children kept directly under their parent.
  function sortValues(field, values) {
    var allNumeric = values.length && values.every(function (v) { return /^\d{3,4}$/.test(v); });
    if (allNumeric || field === 'Year') {
      return values.slice().sort(function (a, b) { return parseFloat(b) - parseFloat(a); });
    }
    return values.slice().sort(function (a, b) {
      var ap = a.split(' > '), bp = b.split(' > ');
      var c = ap[0].localeCompare(bp[0]);
      if (c !== 0) return c;
      return (ap[1] || '').localeCompare(bp[1] || '');
    });
  }

  /* ------------------------------------------------------------------ */
  /*  CAPTION PRESENTATION                                              */
  /* ------------------------------------------------------------------ */

  function applyCaptionMode(inst) {
    var mode = CONFIG.captionMode;
    if (mode === 'raw') return;

    inst.items.forEach(function (it) {
      if (!it.fig) return;

      if (mode === 'hide') {
        it.fig.classList.add(NS + '-cap-hidden');
        return;
      }

      var out = '';
      if (mode === 'meta') {
        var fields = (CONFIG.captionFields && CONFIG.captionFields.length)
          ? CONFIG.captionFields
          : Object.keys(it.fields);
        var parts = [];
        fields.forEach(function (f) {
          var vals = it.fields[f];
          if (!vals || !vals.length) return;
          // Only leaf values — showing both "Interiors" and "Interiors >
          // Residential" reads as a duplicate.
          var leaves = vals.filter(function (v) {
            return !vals.some(function (o) { return o !== v && o.indexOf(v + ' > ') === 0; });
          }).map(function (v) { return v.split(' > ').pop(); });
          if (!leaves.length) return;
          parts.push((CONFIG.captionShowKeys ? f + ': ' : '') + leaves.join(', '));
        });
        out = parts.join(CONFIG.captionDelimiter);
      } else {
        out = it.excerpt;
      }

      if (!out) {
        it.fig.classList.add(NS + '-cap-hidden');
      } else {
        it.fig.classList.remove(NS + '-cap-hidden');
        if (it.capEl) it.capEl.textContent = out;
        else it.fig.textContent = out;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  LAYOUT ENGINE                                                     */
  /*                                                                    */
  /*  Squarespace lays masonry and strips out ONCE, with absolute       */
  /*  positioning and a fixed wrapper height, and never recomputes —    */
  /*  verified live: hiding items and firing `resize` leaves every      */
  /*  transform byte-identical. So the plugin owns the layout for       */
  /*  those two types. Grid is a real CSS Grid and reflows on its own.  */
  /* ------------------------------------------------------------------ */

  function readTranslate(node) {
    var t = node.style.transform || '';
    var m = t.match(/translate3d\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/);
    if (m) return { x: +m[1], y: +m[2] };
    m = t.match(/matrix\(\s*[\d.-]+\s*,\s*[\d.-]+\s*,\s*[\d.-]+\s*,\s*[\d.-]+\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (m) return { x: +m[1], y: +m[2] };
    return { x: 0, y: 0 };
  }

  // Learn Squarespace's own parameters from the layout it already produced.
  // data-props gives the authoritative column count / gutter setting / row
  // height; the pixel gutter is measured, because the props value is in
  // Squarespace's own unit (masonry `gutter:20` renders as 9px) and cannot be
  // converted reliably.
  function measureGeometry(inst) {
    var g = { cols: 1, colWidth: 0, gutter: 0, rowHeight: 0 };

    if (inst.type === 'grid') {
      inst.geom = g;
      return;
    }

    var xs = [];
    inst.items.forEach(function (it) {
      var p = readTranslate(it.el);
      var rx = Math.round(p.x);
      if (xs.indexOf(rx) === -1) xs.push(rx);
      // Squarespace writes an explicit pixel height on the item wrapper. That
      // height encodes any aspect-ratio crop the gallery is set to, so the
      // ratio is taken from the rendered box, not from the source image.
      var w = parseFloat(it.el.style.width) || it.el.offsetWidth || 1;
      var h = (it.wrapper && it.wrapper.offsetHeight) || 0;
      if (w > 0 && h > 0) it.heightRatio = h / w;
    });
    xs.sort(function (a, b) { return a - b; });

    var first = inst.items[0];
    g.colWidth = parseFloat(first.el.style.width) || first.el.offsetWidth || 0;
    g.cols = Math.max(1, xs.length);
    g.gutter = xs.length > 1 ? Math.max(0, xs[1] - xs[0] - g.colWidth) : (inst.props.gutter || 0);

    if (inst.type === 'masonry') {
      g.cols = Math.max(1, inst.props.numColumns || xs.length);
    } else {
      g.rowHeight = inst.props.rowHeight || (first.wrapper ? first.wrapper.offsetHeight : 300);
    }

    inst.geom = g;
    inst.wrap.classList.add(NS + '-managed');
  }

  // Squarespace collapses galleries to a single column on narrow viewports.
  function effectiveColumns(inst) {
    var w = inst.wrap.clientWidth || inst.section.clientWidth || 0;
    var cols = inst.geom.cols;
    if (w < 640 && cols > 1) return 1;
    if (w < 900 && cols > 2) return 2;
    return cols;
  }

  function relayout(inst, animate) {
    if (inst.type === 'grid') return;
    var visible = inst.items.filter(function (it) { return it.visible; });

    inst.wrap.classList.toggle(NS + '-animate', !!animate && CONFIG.layoutTransition);

    if (!visible.length) {
      inst.wrap.style.height = '0px';
      return;
    }

    if (inst.type === 'masonry') relayoutMasonry(inst, visible);
    else relayoutStrips(inst, visible);
  }

  function relayoutMasonry(inst, visible) {
    var containerW = inst.wrap.clientWidth;
    var cols = effectiveColumns(inst);
    var gutter = inst.geom.gutter;
    var colW = (containerW - gutter * (cols - 1)) / cols;
    if (!(colW > 0)) return;

    // Pass 1 — write every width and image-box height.
    visible.forEach(function (it) {
      var boxH = Math.round(colW * it.heightRatio);
      it.el.style.width = colW + 'px';
      if (it.wrapper) it.wrapper.style.height = boxH + 'px';
      if (it.img) it.img.style.height = boxH + 'px';
      it._boxH = boxH;
    });

    // Pass 2 — read every caption height. Batched after all the writes so the
    // browser performs one layout, not one per item.
    visible.forEach(function (it) {
      it.captionH = (it.fig && !it.fig.classList.contains(NS + '-cap-hidden')) ? it.fig.offsetHeight : 0;
    });

    // Pass 3 — place into the shortest column.
    var heights = [];
    for (var i = 0; i < cols; i++) heights.push(0);

    visible.forEach(function (it) {
      var c = 0;
      for (var i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.5) c = i;
      var x = c * (colW + gutter);
      var y = heights[c];
      it.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
      heights[c] = y + it._boxH + it.captionH + gutter;
    });

    inst.wrap.style.height = Math.round(Math.max.apply(null, heights) - gutter) + 'px';
  }

  function relayoutStrips(inst, visible) {
    var containerW = inst.wrap.clientWidth;
    var gutter = inst.geom.gutter;
    var target = inst.geom.rowHeight || 300;
    if (!(containerW > 0)) return;

    // Build justified rows: fill each row at the target height, then scale the
    // row so it lands exactly on the container width.
    var rows = [];
    var row = [];
    var rowW = 0;

    visible.forEach(function (it) {
      var ratio = it.heightRatio > 0 ? 1 / it.heightRatio : 1.5;
      var w = target * ratio;
      var withItem = rowW + w + gutter * row.length;
      if (row.length && withItem > containerW) {
        rows.push({ items: row, natural: rowW });
        row = []; rowW = 0;
      }
      row.push({ it: it, w: target * ratio });
      rowW += target * ratio;
    });
    if (row.length) rows.push({ items: row, natural: rowW, last: true });

    // Pass 1 — widths and image-box heights.
    rows.forEach(function (r) {
      var avail = containerW - gutter * (r.items.length - 1);
      var scale = avail / r.natural;
      // Squarespace justifies the trailing row as well — verified live: two
      // leftover images were scaled from a 300px target row height to 632px
      // to fill the width. Matching that keeps a filtered gallery visually
      // identical to the unfiltered one, which matters more than taste.
      // The cap only stops a single leftover image becoming absurd.
      if (r.last && scale > (CONFIG.maxLastRowScale || 3)) scale = CONFIG.maxLastRowScale || 3;
      r.scale = scale;
      r.h = Math.round(target * scale);
      r.items.forEach(function (e) {
        var w = Math.round(e.w * scale);
        e.width = w;
        e.it.el.style.width = w + 'px';
        if (e.it.wrapper) e.it.wrapper.style.height = r.h + 'px';
        if (e.it.img) e.it.img.style.height = r.h + 'px';
      });
    });

    // Pass 2 — caption heights, batched.
    rows.forEach(function (r) {
      r.capH = 0;
      r.items.forEach(function (e) {
        var h = (e.it.fig && !e.it.fig.classList.contains(NS + '-cap-hidden')) ? e.it.fig.offsetHeight : 0;
        e.it.captionH = h;
        if (h > r.capH) r.capH = h;
      });
    });

    // Pass 3 — place.
    var y = 0;
    rows.forEach(function (r) {
      var x = 0;
      r.items.forEach(function (e) {
        e.it.el.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
        x += e.width + gutter;
      });
      y += r.h + r.capH + gutter;
    });

    inst.wrap.style.height = Math.round(Math.max(0, y - gutter)) + 'px';
  }

  /* ------------------------------------------------------------------ */
  /*  MATCHING                                                          */
  /* ------------------------------------------------------------------ */

  function itemHas(it, field, value) {
    var vals = it.fields[field];
    if (!vals) return false;
    if (vals.indexOf(value) !== -1) return true;
    // Selecting a parent matches its children even when only the child path
    // was written on the image.
    var prefix = value + ' > ';
    return vals.some(function (v) { return v.indexOf(prefix) === 0; });
  }

  // OR within a group, AND across groups. `skipKey` lets facet counts be
  // computed as if that one group were unset, which is what makes the counts
  // contextual rather than absolute.
  function matches(inst, it, skipKey) {
    for (var i = 0; i < inst.groups.length; i++) {
      var g = inst.groups[i];
      if (g.key === skipKey) continue;
      var act = inst.active[g.key];
      if (!act || !act.length) continue;
      var ok = act.some(function (v) { return itemHas(it, g.field, v); });
      if (!ok) return false;
    }
    if (inst.query) {
      var q = inst.query.toLowerCase();
      var hay = (it.raw + ' ' + it.title).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }

  function facetCount(inst, g, value) {
    var n = 0;
    inst.items.forEach(function (it) {
      if (itemHas(it, g.field, value) && matches(inst, it, g.key)) n++;
    });
    return n;
  }

  function activeTotal(inst) {
    return inst.groups.reduce(function (n, g) { return n + inst.active[g.key].length; }, 0);
  }

  /* ------------------------------------------------------------------ */
  /*  SORTING                                                           */
  /* ------------------------------------------------------------------ */

  function sortItems(inst, list) {
    var order = inst.order;
    if (!order || order === 'gallery') {
      return list.slice().sort(function (a, b) { return a.idx - b.idx; });
    }
    var field = CONFIG.sort.sortField || 'Year';
    function fieldVal(it) {
      var v = it.fields[field];
      return v && v.length ? v[0] : '';
    }
    var out = list.slice();
    if (order === 'az' || order === 'za') {
      out.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
      if (order === 'za') out.reverse();
    } else if (order === 'newest' || order === 'oldest') {
      out.sort(function (a, b) { return parseFloat(fieldVal(b) || 0) - parseFloat(fieldVal(a) || 0); });
      if (order === 'oldest') out.reverse();
    } else if (order === 'random') {
      out.sort(function () { return Math.random() - 0.5; });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /*  APPLY                                                             */
  /* ------------------------------------------------------------------ */

  function apply(inst, animate) {
    var visible = [];
    inst.items.forEach(function (it) {
      var ok = matches(inst, it, null);
      it.visible = ok;
      it.el.classList.toggle(NS + '-hidden', !ok);
      if (ok) {
        // Squarespace fades gallery items in with `preFade` (opacity 0) and
        // adds `fadeIn` from a scroll observer. An item that was hidden when
        // that observer would have fired never gets `fadeIn`, so revealing it
        // by filtering would leave it permanently invisible. Verified live:
        // one matching image rendered at opacity 0 after a filter change.
        if (it.wrapper && it.wrapper.classList.contains('preFade')) {
          it.wrapper.classList.add('fadeIn');
        }
        visible.push(it);
      }
    });

    // Sort changes DOM order for grid (CSS grid honours source order) and
    // placement order for the managed layouts.
    var sorted = sortItems(inst, visible);
    if (inst.order && inst.order !== 'gallery') {
      if (inst.type === 'grid') {
        sorted.forEach(function (it) { inst.wrap.appendChild(it.el); });
      } else {
        // Reorder the working list without touching the DOM — the managed
        // layouts place by array order, and moving nodes would break the
        // Gallery Lightbox's index map.
        var rest = inst.items.filter(function (it) { return sorted.indexOf(it) === -1; });
        inst.items = sorted.concat(rest);
      }
    }

    relayout(inst, animate);
    syncControls(inst);
    replayAnimation(inst, visible);

    if (inst.els.count) {
      inst.els.count.textContent = CONFIG.text.resultCount
        .replace('{n}', visible.length)
        .replace('{total}', inst.items.length);
    }
    if (inst.els.empty) inst.els.empty.hidden = visible.length > 0;

    if (CONFIG.urlSync && animate) writeUrl(inst);

    inst.section.dispatchEvent(new CustomEvent('sdl:galleryfilter:changed', {
      bubbles: true,
      detail: {
        sectionId: inst.sectionId,
        visible: visible.length,
        total: inst.items.length,
        visibleElements: visible.map(function (it) { return it.el; })
      }
    }));
  }

  function replayAnimation(inst, visible) {
    var type = (CONFIG.animation && CONFIG.animation.type) || 'none';
    if (type === 'none') return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var stagger = parseInt(CONFIG.animation.stagger, 10) || 0;
    var cls = NS + '-anim-run';

    visible.forEach(function (it) { it.el.classList.remove(cls); });
    // One forced reflow for the whole set, not one per item — per-item reads
    // here would be O(n) layouts.
    void inst.wrap.offsetWidth;
    visible.forEach(function (it, i) {
      it.el.style.setProperty('--' + NS + '-anim-delay', (i * stagger) + 'ms');
      it.el.classList.add(cls);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  URL STATE                                                         */
  /*                                                                    */
  /*  Params are namespaced twice over: the configurable prefix keeps    */
  /*  Squarespace's server-side reserved words (category, tag, page,     */
  /*  view, format…) out of play, and the section index keeps two        */
  /*  galleries on one page from overwriting each other.                 */
  /* ------------------------------------------------------------------ */

  function paramName(inst, g) {
    var scope = instances.length > 1 || inst.index > 0 ? ('s' + (inst.index + 1) + '_') : '';
    return CONFIG.urlParamPrefix + scope + slug(g.field);
  }

  function readUrl(inst) {
    if (!CONFIG.urlSync) return;
    var p = new URLSearchParams(window.location.search);
    inst.groups.forEach(function (g) {
      var raw = p.get(paramName(inst, g));
      if (!raw) return;
      var wanted = raw.split(',').map(function (s) { return s.trim().toLowerCase(); });
      inst.active[g.key] = g.values.filter(function (v) {
        return wanted.indexOf(slug(v)) !== -1 || wanted.indexOf(v.toLowerCase()) !== -1;
      });
      if (!g.multiSelect) inst.active[g.key] = inst.active[g.key].slice(0, 1);
    });
    var q = p.get(CONFIG.urlParamPrefix + 'q');
    if (q) inst.query = q;
    var s = p.get(CONFIG.urlParamPrefix + 'sort');
    if (s) inst.order = s;
  }

  function writeUrl(inst) {
    var p = new URLSearchParams(window.location.search);
    inst.groups.forEach(function (g) {
      var name = paramName(inst, g);
      var act = inst.active[g.key];
      if (act && act.length) p.set(name, act.map(slug).join(','));
      else p.delete(name);
    });
    if (inst.query) p.set(CONFIG.urlParamPrefix + 'q', inst.query);
    else p.delete(CONFIG.urlParamPrefix + 'q');
    if (inst.order && inst.order !== 'gallery') p.set(CONFIG.urlParamPrefix + 'sort', inst.order);
    else p.delete(CONFIG.urlParamPrefix + 'sort');

    var qs = p.toString();
    history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
  }

  /* ------------------------------------------------------------------ */
  /*  UI                                                                */
  /* ------------------------------------------------------------------ */

  function injectInstanceStyles(inst) {
    var vars = themeVarsFor(inst.section);
    var css = [];
    Object.keys(vars).forEach(function (k) { css.push('--' + NS + '-' + k + ':' + vars[k]); });
    var st = el('style');
    st.id = NS + '-vars-' + inst.id;
    st.textContent = '[data-' + NS + '-instance="' + inst.id + '"]{' + css.join(';') + '}';
    document.head.appendChild(st);
    inst.section.setAttribute('data-' + NS + '-instance', inst.id);
  }

  function isDesktop(inst) {
    return window.innerWidth >= CONFIG.mobileBreakpoint;
  }

  function buildOption(inst, g, value, isAll) {
    var wrapTag = (g.ui === 'checkbox') ? 'label' : 'button';
    var node = el(wrapTag, NS + '-opt ' + NS + '-opt-' + g.ui);
    node.setAttribute('data-value', value);

    var input = null;
    if (g.ui === 'checkbox') {
      input = el('input', NS + '-opt-input');
      input.type = g.multiSelect ? 'checkbox' : 'radio';
      input.name = NS + '-' + inst.id + '-' + g.key;
      node.appendChild(input);
    } else {
      node.type = 'button';
    }

    var depth = isAll ? 0 : value.split(' > ').length - 1;
    var display = isAll ? g.allText : value.split(' > ').pop();
    if (depth) node.classList.add(NS + '-opt-child');

    var label = el('span', NS + '-opt-label', display);
    node.appendChild(label);

    var count = el('span', NS + '-opt-count');
    node.appendChild(count);

    var rec = { node: node, input: input, label: label, count: count, value: value, isAll: isAll };
    g.nodes.push(rec);

    function toggle() {
      if (isAll) {
        inst.active[g.key] = [];
      } else if (g.multiSelect) {
        var arr = inst.active[g.key];
        var i = arr.indexOf(value);
        if (i === -1) arr.push(value); else arr.splice(i, 1);
      } else {
        inst.active[g.key] = inst.active[g.key][0] === value ? [] : [value];
      }
      apply(inst, true);
      if (CONFIG.scrollOnChange) {
        inst.section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    if (input) {
      input.addEventListener('change', toggle);
    } else {
      node.addEventListener('click', toggle);
    }

    return node;
  }

  function buildGroup(inst, g, inPanel) {
    var box = el('div', NS + '-group ' + NS + '-group-' + g.ui);
    box.setAttribute('data-field', slug(g.field));

    if (g.showLabel) box.appendChild(el('div', NS + '-group-label', g.label));

    var list = el('div', NS + '-options ' + NS + '-options-' + g.ui);
    if (!g.showCounts) list.classList.add(NS + '-no-counts');

    if (CONFIG.showAllOption && g.ui !== 'checkbox') {
      list.appendChild(buildOption(inst, g, ALL, true));
    }

    g.values.forEach(function (v) {
      var node = buildOption(inst, g, v, false);
      if (g.ui === 'text' && list.children.length) {
        var d = el('span', NS + '-delim', ' ' + g.delimiter + ' ');
        list.appendChild(d);
      }
      list.appendChild(node);
    });

    box.appendChild(list);
    return box;
  }

  function buildBar(inst) {
    var root = el('div', NS + '-root');
    var bar = el('div', NS + '-bar ' + NS + '-align-' + CONFIG.align);

    var groupsWrap = el('div', NS + '-inline-groups');
    inst.groups.forEach(function (g) { groupsWrap.appendChild(buildGroup(inst, g)); });
    bar.appendChild(groupsWrap);
    inst.els.inlineGroups = groupsWrap;

    var right = el('div', NS + '-bar-right');

    if (CONFIG.search.enabled) {
      var search = el('input', NS + '-search');
      search.type = 'search';
      search.placeholder = CONFIG.search.placeholder;
      var t;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { inst.query = search.value.trim(); apply(inst, true); }, 200);
      });
      right.appendChild(search);
      inst.els.search = search;
    }

    if (CONFIG.sort.enabled) {
      var sel = el('select', NS + '-sort');
      var ph = el('option', '', CONFIG.text.sortPlaceholder);
      ph.value = ''; ph.disabled = true;
      sel.appendChild(ph);
      var LABELS = { gallery: 'Gallery order', az: 'A–Z', za: 'Z–A', newest: 'Newest', oldest: 'Oldest', random: 'Random' };
      (CONFIG.sort.options || []).forEach(function (o) {
        var opt = el('option', '', LABELS[o] || o);
        opt.value = o;
        sel.appendChild(opt);
      });
      sel.value = inst.order;
      sel.addEventListener('change', function () { inst.order = sel.value; apply(inst, true); });
      right.appendChild(sel);
      inst.els.sort = sel;
    }

    if (CONFIG.showResultCount) {
      var c = el('span', NS + '-count');
      c.setAttribute('role', 'status');
      right.appendChild(c);
      inst.els.count = c;
    }

    if (CONFIG.showClearAll) {
      var clear = el('button', NS + '-clear', CONFIG.text.clearAll);
      clear.type = 'button';
      clear.hidden = true;
      clear.addEventListener('click', function () { resetAll(inst); });
      right.appendChild(clear);
      inst.els.clear = clear;
    }

    var btn = el('button', NS + '-filter-btn');
    btn.type = 'button';
    btn.appendChild(el('span', '', CONFIG.text.filterButton));
    var badge = el('span', NS + '-filter-btn-count');
    badge.hidden = true;
    btn.appendChild(badge);
    btn.addEventListener('click', function () { openDrawer(inst); });
    right.appendChild(btn);
    inst.els.filterBtn = btn;
    inst.els.filterBtnCount = badge;

    if (right.children.length) bar.appendChild(right);
    root.appendChild(bar);
    return root;
  }

  function buildSidebar(inst) {
    var side = el('aside', NS + '-sidebar');
    if (CONFIG.stickySidebar) side.classList.add(NS + '-sticky');
    inst.groups.forEach(function (g) { side.appendChild(buildGroup(inst, g)); });
    if (CONFIG.showClearAll) {
      var clear = el('button', NS + '-clear ' + NS + '-clear-side', CONFIG.text.clearAll);
      clear.type = 'button';
      clear.hidden = true;
      clear.addEventListener('click', function () { resetAll(inst); });
      side.appendChild(clear);
      inst.els.sideClear = clear;
    }
    return side;
  }

  function buildDrawer(inst) {
    var overlay = el('div', NS + '-overlay');
    var drawer = el('div', NS + '-drawer ' + NS + '-drawer-' + (CONFIG.filterButton.side || 'left'));
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('data-' + NS + '-instance', inst.id);

    var head = el('div', NS + '-drawer-head');
    head.appendChild(el('div', NS + '-drawer-title', CONFIG.text.drawerTitle));
    var close = el('button', NS + '-drawer-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () { closeDrawer(inst); });
    head.appendChild(close);
    drawer.appendChild(head);

    var body = el('div', NS + '-drawer-body');
    inst.groups.forEach(function (g) { body.appendChild(buildGroup(inst, g, true)); });
    drawer.appendChild(body);

    var foot = el('div', NS + '-drawer-foot');
    var clear = el('button', NS + '-drawer-clear', CONFIG.text.clearAll);
    clear.type = 'button';
    clear.addEventListener('click', function () { resetAll(inst); });
    var applyBtn = el('button', NS + '-drawer-apply', CONFIG.text.apply);
    applyBtn.type = 'button';
    applyBtn.addEventListener('click', function () { closeDrawer(inst); });
    foot.appendChild(clear);
    foot.appendChild(applyBtn);
    drawer.appendChild(foot);

    overlay.addEventListener('click', function () { closeDrawer(inst); });

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    inst.els.overlay = overlay;
    inst.els.drawer = drawer;
  }

  function openDrawer(inst) {
    inst.els.overlay.classList.add(NS + '-open');
    inst.els.drawer.classList.add(NS + '-open');
    document.body.classList.add(NS + '-locked');
    // Forced reflow rather than rAF: rAF is throttled in background tabs and
    // the transition would never start.
    void inst.els.drawer.offsetWidth;
  }

  function closeDrawer(inst) {
    inst.els.overlay.classList.remove(NS + '-open');
    inst.els.drawer.classList.remove(NS + '-open');
    document.body.classList.remove(NS + '-locked');
  }

  function resetAll(inst) {
    inst.groups.forEach(function (g) { inst.active[g.key] = []; });
    inst.query = '';
    if (inst.els.search) inst.els.search.value = '';
    apply(inst, true);
  }

  function syncControls(inst) {
    inst.groups.forEach(function (g) {
      var act = inst.active[g.key];
      g.nodes.forEach(function (n) {
        var on = n.isAll ? !act.length : act.indexOf(n.value) !== -1;
        n.node.classList.toggle(NS + '-opt-on', on);
        n.node.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (n.input) n.input.checked = on;

        if (n.isAll) {
          if (g.showCounts) n.count.textContent = inst.items.filter(function (it) { return matches(inst, it, g.key); }).length;
          return;
        }

        var cnt = (g.showCounts || CONFIG.disableZeroOptions) ? facetCount(inst, g, n.value) : null;
        n.count.textContent = g.showCounts && cnt != null ? cnt : '';
        var dead = CONFIG.disableZeroOptions && cnt === 0 && !on;
        n.node.classList.toggle(NS + '-opt-disabled', dead);
        n.node.setAttribute('aria-disabled', dead ? 'true' : 'false');
        if (n.input) n.input.disabled = dead;
      });
    });

    var total = activeTotal(inst) + (inst.query ? 1 : 0);
    if (inst.els.clear) inst.els.clear.hidden = !total;
    if (inst.els.sideClear) inst.els.sideClear.hidden = !total;
    if (inst.els.filterBtnCount) {
      inst.els.filterBtnCount.hidden = !total;
      inst.els.filterBtnCount.textContent = total;
    }
    if (inst.els.filterBtn) inst.els.filterBtn.classList.toggle(NS + '-filter-btn-active', !!total);
  }

  function buttonVisible(desktop) {
    var fb = CONFIG.filterButton || {};
    return desktop ? fb.showOnDesktop !== false && fb.showOnDesktop === true
      : fb.showOnMobile !== false;
  }

  function applyResponsive(inst) {
    var desktop = isDesktop(inst);
    var btn = buttonVisible(desktop);
    if (inst.els.root) inst.els.root.classList.toggle(NS + '-mobile', !desktop);
    if (inst.els.shell) inst.els.shell.classList.toggle(NS + '-mobile', !desktop);
    if (inst.els.sidebar) inst.els.sidebar.hidden = !desktop;
    if (inst.els.filterBtn) inst.els.filterBtn.hidden = !btn;
    // The filters must never become unreachable: whenever the drawer button is
    // off at this breakpoint, the inline groups render instead.
    if (inst.els.inlineGroups) inst.els.inlineGroups.hidden = btn && !desktop;
    if (!desktop && !btn && inst.els.sidebar) inst.els.sidebar.hidden = false;
  }

  function buildUI(inst) {
    var mountParent = inst.wrap.parentElement;

    if (CONFIG.layout === 'sidebar') {
      var shell = el('div', NS + '-shell');
      var side = buildSidebar(inst);
      var main = el('div', NS + '-main');
      mountParent.insertBefore(shell, inst.wrap);
      shell.appendChild(side);
      main.appendChild(inst.wrap);
      shell.appendChild(main);
      inst.els.shell = shell;
      inst.els.sidebar = side;

      var topRoot = buildBar(inst);
      // In sidebar mode the inline copy of the groups lives in the sidebar,
      // so the bar keeps only search / sort / count / the drawer button.
      if (inst.els.inlineGroups) inst.els.inlineGroups.remove();
      main.insertBefore(topRoot, inst.wrap);
      inst.els.root = topRoot;
    } else {
      var root = buildBar(inst);
      if (CONFIG.stickyToolbar) root.classList.add(NS + '-sticky-bar');
      mountParent.insertBefore(root, inst.wrap);
      inst.els.root = root;
    }

    var empty = el('div', NS + '-empty', CONFIG.text.noResults);
    empty.hidden = true;
    inst.wrap.parentElement.insertBefore(empty, inst.wrap.nextSibling);
    inst.els.empty = empty;

    buildDrawer(inst);
    applyResponsive(inst);
  }

  /* ------------------------------------------------------------------ */
  /*  BOOT                                                              */
  /* ------------------------------------------------------------------ */

  function boot() {
    var sections = wantedSections();
    if (!sections.length) return;

    sections.forEach(function (sec) {
      if (sec.getAttribute('data-' + NS + '-instance')) return;
      var inst = createInstance(sec);
      if (inst) {
        inst.index = instances.length;
        instances.push(inst);
      }
    });

    if (!instances.length) {
      document.documentElement.classList.add(NS + '-ready');
      return;
    }

    // Re-read URL state now that instance indexes are settled (the param name
    // depends on how many instances ended up on the page).
    if (instances.length > 1) {
      instances.forEach(function (inst) { readUrl(inst); apply(inst, false); });
    }

    document.documentElement.classList.add(NS + '-ready');

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        instances.forEach(function (inst) {
          applyResponsive(inst);
          relayout(inst, false);
        });
      }, 150);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') instances.forEach(closeDrawer);
    });

    // Squarespace lazily reveals gallery items with a fade; once that settles
    // the caption heights are final, so one more pass locks the layout in.
    setTimeout(function () {
      instances.forEach(function (inst) { relayout(inst, false); });
    }, 1200);

    window.SDL_GALLERY_FILTER = {
      instances: instances,
      relayout: function () { instances.forEach(function (i) { relayout(i, false); }); },
      reset: function () { instances.forEach(resetAll); }
    };
  }

  injectAntiFlash();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 60); });
  } else {
    setTimeout(boot, 60);
  }

  // Squarespace's own gallery controllers bind after load on some themes; a
  // late pass catches sections that were not laid out yet at DOMContentLoaded.
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (!instances.length) boot();
      else instances.forEach(function (inst) { relayout(inst, false); });
    }, 200);
  });
})();
