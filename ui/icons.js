// Inline SVG icon set, extracted from the Ridewise mockup canvas.
// Stroke-based on a 24x24 grid and drawn in currentColor, so an icon
// inherits its container's colour and works in both themes.
export const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8 17h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h14"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="20" cy="12" r="2"/>',
  shuffle: '<path d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5l2-2.5h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V4M8 8l4-4 4 4"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19c3-4 6-7 10-9"/>',
  sun: '<path d="M4 18h16M6 14a6 6 0 0 1 12 0M12 4v2M5 8l1.5 1.5M19 8l-1.5 1.5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  landmark: '<path d="M3 21h18M5 21V10M10 21V10M14 21V10M19 21V10M3 10l9-6 9 6z"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-10 0zM16 9h2a2 2 0 0 1 0 4h-2M4 20h13"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  wrench: '<path d="M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 1-2-2z"/>',
  turnRight: '<path d="M6 20V10a4 4 0 0 1 4-4h8M14 2l4 4-4 4"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  cloudDown: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9h-1M12 12v8M9 17l3 3 3-3"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/>',
  crown: '<path d="M3 18h18l-1-10-5 4-3-6-3 6-5-4z"/>',
  bubble: '<path d="M4 5h16v11H9l-5 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  navArrow: '<path d="M12 3l7 18-7-4-7 4z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="M5 12l4 4L19 7"/>',
  drag: '<path d="M8 6h.01M16 6h.01M8 12h.01M16 12h.01M8 18h.01M16 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mtn: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  heartRate: '<path d="M3 12h4l2-5 3 10 2-6 2 3h5"/>',
  cadence: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-3M12 12v-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  more: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  pin: '<path d="M12 21s6-6.5 6-11a6 6 0 0 0-12 0c0 4.5 6 11 6 11z"/><circle cx="12" cy="10" r="2.5"/>',
  send: '<path d="M4 4l16 8-16 8 3-8z"/>',
};

export function icon(name, size = 20, extraAttrs = '') {
  const path = ICONS[name];
  if (!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs}>${path}</svg>`;
}
