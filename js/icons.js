// MonMap Portal — Inline SVG icon set (Lucide-equivalents).
// Use: <span class="nav-icon" data-icon="home"></span>
// On DOMContentLoaded the helper finds [data-icon] nodes and inlines the SVG.
// Keeping currentColor + 1.7 stroke matches the pre-existing inline icons used
// in services/reports HTML so visuals stay coherent across pages.

(function () {
  const SVG_ATTRS = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

  const ICONS = {
    home:     `<svg ${SVG_ATTRS}><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5Z"/></svg>`,
    calendar: `<svg ${SVG_ATTRS}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
    store:    `<svg ${SVG_ATTRS}><path d="M3 7 5 3h14l2 4M3 7v13a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M3 7h18M9 21v-7h6v7"/></svg>`,
    services: `<svg ${SVG_ATTRS}><path d="M20 7h-9M14 17H5M17 4l3 3-3 3M7 14l-3 3 3 3"/></svg>`,
    chart:    `<svg ${SVG_ATTRS}><path d="M3 3v18h18M7 14v4M12 9v9M17 5v13"/></svg>`,
    users:    `<svg ${SVG_ATTRS}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    bell:     `<svg ${SVG_ATTRS}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
    user:     `<svg ${SVG_ATTRS}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    logout:   `<svg ${SVG_ATTRS}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
    plus:     `<svg ${SVG_ATTRS}><path d="M12 5v14M5 12h14"/></svg>`,
    check:    `<svg ${SVG_ATTRS}><path d="M20 6 9 17l-5-5"/></svg>`,
    clock:    `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    pin:      `<svg ${SVG_ATTRS}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    inbox:    `<svg ${SVG_ATTRS}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z"/></svg>`,
    settings: `<svg ${SVG_ATTRS}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`,
  };

  function applyIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      const name = el.getAttribute('data-icon');
      const svg = ICONS[name];
      if (svg && !el.dataset.iconRendered) {
        el.innerHTML = svg;
        el.dataset.iconRendered = '1';
      }
    });
  }

  // Expose for callers that build markup after page load (e.g. modals).
  window.MMIcons = { apply: applyIcons, get: name => ICONS[name] || '' };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyIcons());
  } else {
    applyIcons();
  }
})();
