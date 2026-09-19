// Small interface icons matching the existing navigation stroke system.
const paths={
 wallet:'<path d="M3 7h18v13H3zM3 7V5a2 2 0 0 1 2-2h12M16 13h3"/>',
 building:'<path d="M4 21h16M6 21V5h12v16M9 8h2m2 0h2M9 12h2m2 0h2M9 16h6"/>',
 grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
 user:'<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 13-4M19 13v8M15 17h8"/>',
 file:'<path d="M6 2h9l5 5v15H6zM14 2v6h6M9 13h7M9 17h5"/>',
 tool:'<path d="M14 4a5 5 0 0 0-6 6L3 17a3 3 0 0 0 4 4l7-7a5 5 0 0 0 6-6l-4 3-3-3z"/>',
 chart:'<path d="M4 20V4M4 20h16M8 17v-5M12 17V8M16 17v-9M20 17V5"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 6-3 9h18c0-3-3-2-3-9M10 21h4"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
};
export function workspaceIcon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`;}
