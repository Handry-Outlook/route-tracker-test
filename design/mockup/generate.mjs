// Generates the Ridewise mockup artboards (*.dc.html) + canvas.json.
// Run: node generate.mjs   (from this directory)
// Tokens are lifted from the app's styles.css so the mockup is "this app,
// next version" rather than a generic template.
import { writeFileSync } from 'node:fs';

const T = {
  bg: '#f5f7fa', surface: '#ffffff', line: '#dbe2ea', text: '#132238', muted: '#657186',
  blue: '#176bdb', orange: '#f28b30', green: '#139b66', red: '#d94d4d', navy: '#15324d',
  shadow: '0 12px 34px #10233d25', soft: '0 4px 14px #10233d18',
};
const D = {
  bg: '#0e1620', surface: '#161f2b', line: '#243244', text: '#e7edf5', muted: '#93a3b8',
  blue: '#4a9bff', orange: '#ffa451', green: '#2fce8f', red: '#ff6b6b', navy: '#0c1e30',
  shadow: '0 12px 34px #00000055', soft: '0 4px 14px #00000040',
};

const I = {
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
const ic = (name, size = 20, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[name]}</svg>`;

function css(t) {
  return `
    body { margin: 0; background: #e9edf2; font-family: Inter, -apple-system, "SF Pro Text", system-ui, sans-serif; color: ${t.text}; -webkit-font-smoothing: antialiased; }
    a { color: ${t.blue}; } a:hover { color: ${t.orange}; }
    * { box-sizing: border-box; }
    .phone { position: relative; width: 390px; height: 844px; overflow: hidden; background: ${t.bg}; color: ${t.text}; }
    .safe { padding-top: 54px; }
    h1, h2, h3, p { margin: 0; }
    .card { background: ${t.surface}; border: 1px solid ${t.line}; border-radius: 16px; box-shadow: ${t.soft}; }
    .chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid ${t.line}; background: ${t.surface}; font-size: 13px; font-weight: 600; color: ${t.text}; white-space: nowrap; }
    .chip.on { background: ${t.navy}; border-color: ${t.navy}; color: #fff; }
    .chip.orange { background: ${t.orange}; border-color: ${t.orange}; color: #fff; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 18px; border-radius: 12px; font-weight: 700; font-size: 15px; border: 0; }
    .btn.primary { background: ${t.blue}; color: #fff; }
    .btn.cta { background: ${t.orange}; color: #fff; box-shadow: 0 8px 22px ${t.orange}55; }
    .btn.ghost { background: ${t.surface}; border: 1px solid ${t.line}; color: ${t.text}; }
    .iconbtn { width: 44px; height: 44px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: ${t.surface}; border: 1px solid ${t.line}; color: ${t.text}; box-shadow: ${t.soft}; }
    .muted { color: ${t.muted}; }
    .tabbar { position: absolute; left: 0; right: 0; bottom: 0; height: 84px; padding: 8px 8px 20px; background: ${t.surface}; border-top: 1px solid ${t.line}; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
    .tab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10px; font-weight: 600; color: ${t.muted}; border-radius: 12px; }
    .tab.on { color: ${t.blue}; }
    .tab.rec { color: ${t.orange}; }
    .tab.rec svg { width: 30px; height: 30px; }
    .searchbar { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 16px; border-radius: 999px; background: ${t.surface}; box-shadow: ${t.shadow}; color: ${t.muted}; font-size: 15px; }
    .badge { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge.blue { background: #e5efff; color: #1754a3; }
    .badge.orange { background: #fff0e1; color: #a35400; }
    .badge.green { background: #e3f7ee; color: #0d6b47; }
    .badge.red { background: #fde5e5; color: #a82525; }
    .badge.dark { background: #132238cc; color: #fff; backdrop-filter: blur(6px); }
    .stat b { display: block; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
    .stat small { font-size: 11px; color: ${t.muted}; font-weight: 600; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; color: #fff; }
    .sheet { position: absolute; left: 0; right: 0; bottom: 0; background: ${t.surface}; border-radius: 20px 20px 0 0; box-shadow: 0 -8px 30px #10233d30; padding: 8px 16px 16px; }
    .handle { width: 40px; height: 5px; border-radius: 999px; background: ${t.line}; margin: 0 auto 12px; }
    .row { display: flex; align-items: center; gap: 10px; }
    .between { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .hscroll { display: flex; gap: 12px; overflow: hidden; }
    .section-title { font-size: 15px; font-weight: 800; }
    .toggle { width: 46px; height: 28px; border-radius: 999px; background: ${t.line}; position: relative; }
    .toggle.on { background: ${t.green}; }
    .toggle i { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; }
    .toggle.on i { left: 21px; }
    .slider { position: relative; height: 32px; }
    .slider .track { position: absolute; left: 0; right: 0; top: 14px; height: 4px; border-radius: 999px; background: ${t.line}; }
    .slider .fill { position: absolute; left: 0; top: 14px; height: 4px; border-radius: 999px; background: ${t.blue}; }
    .slider .knob { position: absolute; top: 5px; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 2px solid ${t.blue}; box-shadow: ${t.soft}; }
  `;
}

const head = (t, extra = '') => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>${css(t)}${extra}</style>
</helmet>
`;
const foot = `</x-dc>
</body>
</html>
`;

// ---------- Map ----------
function mapSvg({ h = 844, dark = false, route = true, pins = true, puck = null, avatars = false, waypoints = false, segment = false, id = 'g' } = {}) {
  const land = dark ? '#1a2633' : '#eaeee7';
  const park = dark ? '#1f3328' : '#d5e6c6';
  const water = dark ? '#16324a' : '#c6dcf1';
  const road = dark ? '#2b3a4c' : '#ffffff';
  const minor = dark ? '#243244' : '#f6f7f3';
  const label = dark ? '#6b7d92' : '#7b8794';
  const grad = `<defs><linearGradient id="${id}r" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${T.orange}"/><stop offset="1" stop-color="${T.blue}"/></linearGradient></defs>`;
  const routePath = 'M62 640 C 110 560, 150 600, 190 520 S 250 400, 232 330 S 300 210, 336 150';
  const pin = (x, y, name, color) => `<g transform="translate(${x - 15},${y - 15})"><circle cx="15" cy="15" r="14" fill="${color}" stroke="#fff" stroke-width="2.5"/><g transform="translate(6,6)" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><svg width="18" height="18" viewBox="0 0 24 24">${I[name]}</svg></g></g>`;
  return `<svg width="390" height="${h}" viewBox="0 0 390 ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;position:absolute;inset:0">${grad}
    <rect width="390" height="${h}" fill="${land}"/>
    <path d="M-20 120 C 80 90, 140 160, 220 120 S 380 60, 420 110 L 420 -10 L -20 -10z" fill="${park}"/>
    <path d="M150 300 c 60 -30 140 -10 180 30 c 30 30 20 90 -30 110 c -70 30 -160 0 -170 -50 c -5 -40 0 -70 20 -90z" fill="${park}"/>
    <path d="M-20 560 c 60 20 90 80 60 140 c -20 40 -60 60 -60 60z" fill="${park}"/>
    <path d="M-20 400 C 60 380, 100 430, 140 470 S 200 560, 240 600 S 330 700, 420 690 L 420 760 C 330 760, 250 680, 200 640 S 110 520, 60 480 S -20 450, -20 450z" fill="${water}"/>
    <g stroke="${minor}" stroke-width="3" fill="none"><path d="M0 200 L390 240M0 330 L390 300M40 0 L60 ${h}M300 0 L280 ${h}M120 0 L110 ${h}"/></g>
    <g stroke="${road}" stroke-width="6" fill="none" stroke-linecap="round"><path d="M0 260 C 100 250, 200 280, 390 250"/><path d="M200 0 C 210 200, 180 400, 210 ${h}"/><path d="M0 700 C 120 660, 260 720, 390 690"/></g>
    <g font-family="Inter, system-ui" font-size="11" font-weight="600" fill="${label}"><text x="230" y="105">Ashton Court</text><text x="60" y="380">Bedminster</text><text x="250" y="330">Clifton</text><text x="120" y="770">Long Ashton</text></g>
    ${route ? `<path d="${routePath}" stroke="${dark ? '#0b1420' : '#ffffff'}" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/><path d="${routePath}" stroke="url(#${id}r)" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${pins ? pin(150, 590, 'cup', T.orange) + pin(232, 330, 'drop', T.blue) + pin(300, 205, 'wrench', T.navy) : ''}
    ${waypoints ? ['A', 'B', 'C'].map((l, i) => { const pts = [[62, 640], [232, 330], [336, 150]]; const [x, y] = pts[i]; return `<g><circle cx="${x}" cy="${y}" r="15" fill="${i === 0 ? T.orange : i === 2 ? T.blue : T.navy}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Inter, system-ui" font-size="13" font-weight="800" fill="#fff">${l}</text></g>`; }).join('') : ''}
    ${segment ? `<g transform="translate(212,395)"><circle r="14" fill="#f7b500" stroke="#fff" stroke-width="2.5"/><g transform="translate(-8,-8)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I.flag}</svg></g></g>` : ''}
    ${avatars ? `<g transform="translate(90,470)"><circle r="17" fill="#8b5bd6" stroke="#fff" stroke-width="3"/><text y="5" text-anchor="middle" font-family="Inter, system-ui" font-size="12" font-weight="800" fill="#fff">JK</text><circle cx="13" cy="-13" r="5" fill="${T.green}" stroke="#fff" stroke-width="2"/></g><g transform="translate(330,560)"><circle r="17" fill="#00a6a6" stroke="#fff" stroke-width="3"/><text y="5" text-anchor="middle" font-family="Inter, system-ui" font-size="12" font-weight="800" fill="#fff">MR</text><circle cx="13" cy="-13" r="5" fill="${T.green}" stroke="#fff" stroke-width="2"/></g>` : ''}
    ${puck ? `<g transform="translate(${puck.x},${puck.y}) rotate(${puck.deg || 0})"><path d="M0 -46 L 22 0 L -22 0z" fill="url(#${id}r)" opacity=".35"/><circle r="15" fill="#fff"/><circle r="10" fill="${T.blue}"/></g>` : ''}
  </svg>`;
}

// Stylized "terrain photo" placeholder — layered hills.
function terrain(w, h, hue = 'warm', radius = 16) {
  const skies = { warm: ['#f9d8a8', '#f4a76a'], cool: ['#cfe3f5', '#7fb3e6'], forest: ['#d9ead0', '#6f9f6a'], coast: ['#dbeefc', '#5aa2d8'] };
  const [a, b] = skies[hue] || skies.warm;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;border-radius:${radius}px" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="s${hue}${w}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#s${hue}${w})"/><path d="M0 ${h * .62} C ${w * .2} ${h * .45}, ${w * .35} ${h * .7}, ${w * .55} ${h * .5} S ${w * .85} ${h * .35}, ${w} ${h * .55} L ${w} ${h} L 0 ${h}z" fill="#2f5d4a" opacity=".55"/><path d="M0 ${h * .78} C ${w * .25} ${h * .62}, ${w * .5} ${h * .9}, ${w * .7} ${h * .72} S ${w * .9} ${h * .6}, ${w} ${h * .75} L ${w} ${h} L 0 ${h}z" fill="#1f4a3a" opacity=".8"/></svg>`;
}

// Mini route thumbnail
function routeThumb(w = 64, h = 64, id = 't') {
  return `<svg width="${w}" height="${h}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display:block"><defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${T.orange}"/><stop offset="1" stop-color="${T.blue}"/></linearGradient></defs><rect width="64" height="64" rx="12" fill="#eef2f6"/><path d="M14 46 C 18 30, 30 22, 44 18 S 54 34, 42 44 S 22 52, 14 46z" fill="none" stroke="url(#${id})" stroke-width="3.5" stroke-linecap="round"/></svg>`;
}

// Compact route-recap map for feed cards and the post-ride summary. Drawn in
// its own viewBox so the route reads correctly at a wide, short aspect rather
// than squashing the full-screen map geometry into a strip.
function recapMap(w, h, id, dark = false, seed = 0) {
  const land = dark ? '#1a2633' : '#eaeee7', park = dark ? '#1f3328' : '#d5e6c6';
  const water = dark ? '#16324a' : '#c6dcf1', road = dark ? '#2b3a4c' : '#ffffff';
  const x = f => (f * w).toFixed(1), y = f => (f * h).toFixed(1);
  // A few hand-tuned loop shapes so different rides don't share one silhouette.
  const shapes = [
    [[.18, .72], [.10, .42], [.30, .14], [.50, .20], [.86, .24], [.84, .52], [.56, .90], [.34, .82], [.20, .80]],
    [[.22, .30], [.44, .10], [.72, .16], [.80, .38], [.88, .66], [.60, .80], [.30, .74], [.16, .54], [.18, .38]],
    [[.30, .82], [.14, .60], [.24, .26], [.52, .30], [.78, .14], [.86, .44], [.70, .74], [.48, .70], [.36, .86]],
  ];
  const p = shapes[seed % shapes.length];
  const loop = `M ${x(p[0][0])} ${y(p[0][1])} C ${x(p[1][0])} ${y(p[1][1])}, ${x(p[2][0])} ${y(p[2][1])}, ${x(p[3][0])} ${y(p[3][1])} S ${x(p[4][0])} ${y(p[4][1])}, ${x(p[5][0])} ${y(p[5][1])} S ${x(p[6][0])} ${y(p[6][1])}, ${x(p[7][0])} ${y(p[7][1])} S ${x(p[8][0])} ${y(p[8][1])}, ${x(p[0][0])} ${y(p[0][1])} Z`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block"><defs><linearGradient id="${id}g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${T.orange}"/><stop offset="1" stop-color="${T.blue}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="${land}"/>
    <ellipse cx="${x(.78)}" cy="${y(.18)}" rx="${x(.34)}" ry="${y(.34)}" fill="${park}"/>
    <ellipse cx="${x(.12)}" cy="${y(.86)}" rx="${x(.30)}" ry="${y(.30)}" fill="${park}"/>
    <path d="M 0 ${y(.60)} C ${x(.25)} ${y(.52)}, ${x(.45)} ${y(.78)}, ${w} ${y(.66)} L ${w} ${h} L 0 ${h} Z" fill="${water}" opacity=".55"/>
    <g stroke="${road}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M0 ${y(.34)} C ${x(.35)} ${y(.30)}, ${x(.6)} ${y(.44)}, ${w} ${y(.36)}"/><path d="M${x(.62)} 0 C ${x(.6)} ${y(.4)}, ${x(.7)} ${y(.7)}, ${x(.66)} ${h}"/></g>
    <path d="${loop}" stroke="${dark ? '#0b1420' : '#ffffff'}" stroke-width="7" fill="none" stroke-linejoin="round"/>
    <path d="${loop}" stroke="url(#${id}g)" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
    <circle cx="${x(p[0][0])}" cy="${y(p[0][1])}" r="5" fill="#fff" stroke="${T.orange}" stroke-width="2.5"/>
  </svg>`;
}

// Elevation profile with color-coded climb sections
function elevation(w = 358, h = 96, dark = false) {
  const pts = [[0, 70], [30, 62], [60, 66], [90, 40], [120, 30], [150, 44], [180, 48], [210, 22], [240, 14], [270, 34], [300, 52], [330, 58], [358, 64]];
  const line = pts.map(p => p.join(',')).join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  const seg = (a, b, color) => `<polyline points="${pts.slice(a, b + 1).map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block"><defs><linearGradient id="ef" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${T.blue}" stop-opacity=".25"/><stop offset="1" stop-color="${T.blue}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="url(#ef)"/><polyline points="${line}" fill="none" stroke="${dark ? '#93a3b8' : '#9fb0c2'}" stroke-width="2"/>${seg(2, 4, T.green)}${seg(6, 8, T.red)}${seg(4, 6, T.orange)}</svg>`;
}

function tabbar(active) {
  const items = [['compass', 'Adventure'], ['route', 'Plan Route'], ['record', 'Record'], ['flag', 'Segments'], ['user', 'Profile']];
  return `<nav class="tabbar">${items.map(([i, l]) => `<div class="tab${l === active ? ' on' : ''}${i === 'record' ? ' rec' : ''}">${ic(i, 22)}<span>${l}</span></div>`).join('')}</nav>`;
}

const stars = (n = 5, filled = 4.7) => `<span style="display:inline-flex;gap:1px;color:#f7b500">${Array.from({ length: n }, (_, i) => `<span style="opacity:${i < Math.round(filled) ? 1 : .25}">${ic('star', 14)}</span>`).join('')}</span>`;

const files = {};

// ---------- 1. Adventure home (Main) ----------
files['Main.dc.html'] = head(T) + `
<div class="phone">
  <div style="position:absolute;left:0;top:0;width:390px;height:206px;overflow:hidden">${mapSvg({ h: 206, route: false, pins: false })}
    <div style="position:absolute;left:0;right:0;bottom:0;height:80px;background:linear-gradient(180deg,#f5f7fa00,#f5f7fa)"></div>
  </div>
  <div style="position:absolute;left:16px;right:16px;top:54px" class="searchbar">${ic('search', 20)}<span>Search routes, places, riders</span></div>
  <div style="position:absolute;left:16px;right:16px;top:166px;display:flex;flex-direction:column;gap:12px">
    <div class="between">
      <div><h1 style="font-size:26px;font-weight:800;letter-spacing:-0.02em">Adventure</h1><p class="muted" style="font-size:13px;font-weight:600">14 loops near Bristol</p></div>
      <div class="row" style="gap:8px"><div class="iconbtn">${ic('sliders', 20)}</div><div class="chip orange" style="height:44px;padding:0 14px;border-radius:12px;font-size:14px">${ic('shuffle', 18)}Surprise me</div></div>
    </div>
    <div class="hscroll">
      <div class="card" style="min-width:300px;overflow:hidden;position:relative">
        ${terrain(300, 128, 'warm', 0)}
        <div style="position:absolute;left:12px;top:12px;display:flex;gap:6px"><span class="badge dark">${ic('leaf', 12)}Best in autumn</span><span class="badge dark">Scenic</span></div>
        <div style="position:absolute;right:12px;top:12px;display:flex;gap:6px"><span class="iconbtn" style="width:36px;height:36px;border:0">${ic('heart', 18)}</span><span class="iconbtn" style="width:36px;height:36px;border:0">${ic('share', 18)}</span></div>
        <div style="position:absolute;right:12px;top:98px">${routeThumb(52, 52, 'ta')}</div>
        <div style="padding:12px 14px 13px;display:flex;flex-direction:column;gap:8px">
          <div><h2 style="font-size:17px;font-weight:800">Chew Valley Loop</h2><p class="muted" style="font-size:12px;font-weight:600">${stars(5, 4.7)} 4.7 · ridden 1,284 times</p></div>
          <div class="row" style="gap:14px;font-size:13px;font-weight:700">
            <span class="row" style="gap:5px">${ic('route', 15)}42 km</span><span class="row" style="gap:5px">${ic('mtn', 15)}610 m</span><span class="row" style="gap:5px">${ic('clock', 15)}2h 15</span><span class="badge blue" style="height:22px">Road</span>
          </div>
        </div>
      </div>
      <div class="card" style="min-width:300px;overflow:hidden;position:relative">${terrain(300, 128, 'forest', 0)}<div style="position:absolute;left:12px;top:12px"><span class="badge dark">Hidden gem</span></div><div style="padding:12px 14px 13px"><h2 style="font-size:17px;font-weight:800">Mendip Ridge</h2><p class="muted" style="font-size:12px;font-weight:600">${stars(5, 4.4)} 4.4 · 58 km · gravel</p></div></div>
    </div>
    <div>
      <div class="between" style="margin-bottom:8px"><span class="section-title">Community favourites</span><span class="muted" style="font-size:12px;font-weight:700">See all</span></div>
      <div class="hscroll">${[['Severn Beach Flat', 'coast', '38 km', 'Popular loop'], ['Ashton Gravel', 'forest', '24 km', 'Gravel'], ['Bath Two Tunnels', 'cool', '31 km', 'Scenic']].map(([n, hue, d, tag], i) => `<div class="card" style="min-width:150px;overflow:hidden"><div style="position:relative">${terrain(150, 74, hue, 0)}<span class="badge dark" style="position:absolute;left:8px;top:8px;height:20px;font-size:10px">${tag}</span></div><div style="padding:9px 10px 10px"><b style="font-size:13px;display:block">${n}</b><span class="muted" style="font-size:11px;font-weight:600">${d} · Moderate</span></div></div>`).join('')}</div>
    </div>
    <div>
      <div class="between" style="margin-bottom:8px"><span class="section-title">New this week</span><span class="muted" style="font-size:12px;font-weight:700">See all</span></div>
      <div class="hscroll">${[['Portishead Coast', 'coast', '27 km'], ['Dundry Climb', 'warm', '19 km'], ['Pill Loop', 'cool', '22 km']].map(([n, hue, d]) => `<div class="card" style="min-width:150px;overflow:hidden">${terrain(150, 62, hue, 0)}<div style="padding:9px 10px 10px"><b style="font-size:13px;display:block">${n}</b><span class="muted" style="font-size:11px;font-weight:600">${d}</span></div></div>`).join('')}</div>
    </div>
  </div>
  ${tabbar('Adventure')}
</div>` + foot;

// ---------- 2. Adventure filters ----------
files['AdventureFilters.dc.html'] = head(T) + `
<div class="phone">
  ${mapSvg({ h: 844, route: false, pins: false })}
  <div style="position:absolute;inset:0;background:#10233d66"></div>
  <div class="sheet" style="height:640px;display:flex;flex-direction:column;gap:18px">
    <div class="handle"></div>
    <div class="between"><h2 style="font-size:20px;font-weight:800">Filters</h2><span class="muted" style="font-size:13px;font-weight:700">Reset</span></div>
    <div><p class="section-title" style="margin-bottom:8px">Ride type</p><div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:6px;padding:4px;background:${T.bg};border-radius:12px">${['Road', 'Gravel', 'MTB'].map((r, i) => `<div style="height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;${i === 0 ? `background:${T.surface};box-shadow:${T.soft}` : `color:${T.muted}`}">${r}</div>`).join('')}</div></div>
    <div><div class="between" style="margin-bottom:6px"><span class="section-title">Duration</span><b style="color:${T.blue}">2h 30m</b></div><div class="slider"><div class="track"></div><div class="fill" style="width:52%"></div><div class="knob" style="left:calc(52% - 11px)"></div></div><div class="between muted" style="font-size:11px;font-weight:600"><span>1h</span><span>5h+</span></div></div>
    <div><p class="section-title" style="margin-bottom:8px">Difficulty</p><div class="row" style="gap:8px">${['Easy', 'Moderate', 'Hard'].map((d, i) => `<span class="chip${i === 1 ? ' on' : ''}">${d}</span>`).join('')}</div></div>
    <div class="between card" style="padding:12px 14px;box-shadow:none"><div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Loop back to where you start</span></div><div class="toggle on"><i></i></div></div>
    <div><p class="section-title" style="margin-bottom:8px">Scenery</p><div style="display:flex;flex-wrap:wrap;gap:8px">${[['Coastal', 'drop'], ['Forest', 'leaf'], ['Mountain', 'mtn'], ['Countryside', 'sun']].map(([s, i], k) => `<span class="chip${k === 1 || k === 3 ? ' on' : ''}">${ic(i, 16)}${s}</span>`).join('')}</div></div>
    <div style="margin-top:auto" class="btn cta">Show 14 routes</div>
  </div>
</div>` + foot;

// ---------- 3. Route detail ----------
files['RouteDetail.dc.html'] = head(T) + `
<div class="phone" style="background:${T.surface}">
  <div style="position:relative;height:300px">
    ${terrain(390, 300, 'warm', 0)}
    <div style="position:absolute;left:16px;top:54px" class="iconbtn">${ic('chevL', 20)}</div>
    <div style="position:absolute;right:16px;top:54px;display:flex;gap:8px"><div class="iconbtn">${ic('heart', 20)}</div><div class="iconbtn">${ic('share', 20)}</div></div>
    <div style="position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;gap:6px">${[1, 0, 0, 0].map(on => `<span style="width:${on ? 18 : 6}px;height:6px;border-radius:999px;background:#fff;opacity:${on ? 1 : .55}"></span>`).join('')}</div>
    <span class="badge dark" style="position:absolute;left:16px;bottom:34px">${ic('camera', 12)}12 rider photos</span>
  </div>
  <div style="padding:18px 16px 0;display:flex;flex-direction:column;gap:16px">
    <div>
      <div class="row" style="gap:6px;margin-bottom:8px"><span class="badge blue">Scenic</span><span class="badge orange">${ic('leaf', 12)}Best in autumn</span><span class="badge orange">${ic('sun', 12)}Sunrise pick</span></div>
      <h1 style="font-size:24px;font-weight:800;letter-spacing:-0.02em">Chew Valley Loop</h1>
      <p class="muted" style="font-size:13px;font-weight:600;margin-top:4px">${stars(5, 4.7)} 4.7 (312) · ridden 1,284 times</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px">${[['42.3 km', 'Distance'], ['610 m', 'Elevation'], ['2h 15m', 'Est. time'], ['Road', 'Surface']].map(([v, l]) => `<div class="stat" style="background:${T.bg};border-radius:12px;padding:10px 6px;text-align:center"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
    <div><div class="between" style="margin-bottom:6px"><span class="section-title">Elevation</span><span class="row muted" style="font-size:11px;font-weight:700;gap:10px"><span class="row" style="gap:4px"><i style="width:10px;height:3px;background:${T.green};border-radius:2px"></i>3%</span><span class="row" style="gap:4px"><i style="width:10px;height:3px;background:${T.orange};border-radius:2px"></i>6%</span><span class="row" style="gap:4px"><i style="width:10px;height:3px;background:${T.red};border-radius:2px"></i>9%+</span></span></div>${elevation(358, 88)}</div>
    <div>
      <p class="section-title" style="margin-bottom:8px">Highlights along the way</p>
      <div style="display:flex;flex-direction:column;gap:8px">${[['eye', 'Blagdon Lake viewpoint', 'km 14 · photo spot', T.blue], ['landmark', 'Stanton Drew stone circles', 'km 28 · historic site', T.navy], ['cup', 'Salt & Malt Café', 'km 33 · rest stop · 4.6 ★', T.orange]].map(([i, n, s, c]) => `<div class="row" style="gap:12px"><span style="width:36px;height:36px;border-radius:10px;background:${c}18;color:${c};display:inline-flex;align-items:center;justify-content:center">${ic(i, 18)}</span><div><b style="font-size:14px;display:block">${n}</b><span class="muted" style="font-size:12px;font-weight:600">${s}</span></div></div>`).join('')}</div>
    </div>
  </div>
  <div style="position:absolute;left:16px;right:16px;bottom:24px;display:flex;gap:10px"><div class="iconbtn" style="width:52px;height:52px">${ic('cloudDown', 22)}</div><div class="btn cta" style="flex:1;height:52px;font-size:16px">${ic('compass', 20)}Start adventure</div></div>
</div>` + foot;

// ---------- 4. My Routes ----------
files['MyRoutes.dc.html'] = head(T) + `
<div class="phone safe" style="padding-left:16px;padding-right:16px">
  <div class="between"><h1 style="font-size:26px;font-weight:800;letter-spacing:-0.02em">My routes</h1><div style="display:flex;padding:3px;background:${T.line};border-radius:10px"><span style="width:36px;height:32px;border-radius:8px;background:${T.surface};display:inline-flex;align-items:center;justify-content:center;box-shadow:${T.soft}">${ic('grid', 18)}</span><span class="muted" style="width:36px;height:32px;display:inline-flex;align-items:center;justify-content:center">${ic('list', 18)}</span></div></div>
  <div class="hscroll" style="margin:14px 0 16px;gap:8px">${[['All routes', true], ['Weekend rides', false], ['Commutes', false], ['Gravel', false], ['+ New', false]].map(([c, on]) => `<span class="chip${on ? ' on' : ''}">${on ? '' : ic('folder', 14)}${c}</span>`).join('')}</div>
  <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px">
    ${[['Chew Valley Loop', '42 km · 610 m', 'Moderate', 'orange', true, 'warm'], ['Commute · Temple Meads', '9 km · 40 m', 'Easy', 'green', true, 'cool'], ['Mendip Ridge', '58 km · 1,140 m', 'Hard', 'red', false, 'forest'], ['Ashton Gravel', '24 km · 320 m', 'Moderate', 'orange', false, 'forest'], ['Severn Beach Flat', '38 km · 90 m', 'Easy', 'green', true, 'coast'], ['Bath Two Tunnels', '31 km · 210 m', 'Easy', 'green', false, 'cool']].map(([n, s, d, c, off, hue], i) => `<div class="card" style="overflow:hidden"><div style="position:relative">${terrain(171, 96, hue, 0)}<div style="position:absolute;right:8px;bottom:8px;background:#fff;border-radius:10px;padding:4px">${routeThumb(40, 40, 'r' + i)}</div>${off ? `<span class="badge dark" style="position:absolute;left:8px;top:8px;height:22px;padding:0 7px">${ic('cloudDown', 12)}Offline</span>` : ''}</div><div style="padding:10px 10px 12px"><b style="font-size:13px;display:block;line-height:1.2">${n}</b><span class="muted" style="font-size:11px;font-weight:600;display:block;margin:4px 0 8px">${s}</span><span class="badge ${c}" style="height:22px">${d}</span></div></div>`).join('')}
  </div>
  ${tabbar('Plan Route')}
</div>` + foot;

// ---------- 5. Planner ----------
files['Planner.dc.html'] = head(T) + `
<div class="phone">
  ${mapSvg({ h: 844, pins: false, waypoints: true, id: 'p' })}
  <div style="position:absolute;left:16px;right:16px;top:54px;display:flex;flex-direction:column;gap:10px">
    <div class="row"><div class="iconbtn">${ic('chevL', 20)}</div><div class="searchbar" style="flex:1;height:44px">${ic('search', 18)}<span>Add a waypoint</span></div></div>
    <div class="row" style="gap:8px">${['Road', 'Gravel', 'MTB', 'Mixed'].map((s, i) => `<span class="chip${i === 0 ? ' on' : ''}" style="box-shadow:${T.soft}">${s}</span>`).join('')}</div>
  </div>
  <div class="sheet" style="display:flex;flex-direction:column;gap:14px;padding-bottom:20px">
    <div class="handle"></div>
    <div class="between"><div><b style="font-size:16px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Auto-generate a loop from Clifton</span></div><div class="toggle on"><i></i></div></div>
    <div class="row" style="gap:14px;align-items:stretch">
      <div style="flex:1"><div class="between" style="margin-bottom:4px"><span class="muted" style="font-size:12px;font-weight:700">Distance</span><b style="color:${T.blue}">45 km</b></div><div class="slider"><div class="track"></div><div class="fill" style="width:40%"></div><div class="knob" style="left:calc(40% - 11px)"></div></div><span class="muted" style="font-size:12px;font-weight:700;display:block;margin-top:6px">Direction</span></div>
      <svg width="84" height="84" viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg"><circle cx="42" cy="42" r="38" fill="${T.bg}" stroke="${T.line}"/><g font-family="Inter, system-ui" font-size="10" font-weight="700" fill="${T.muted}" text-anchor="middle"><text x="42" y="14">N</text><text x="74" y="46">E</text><text x="42" y="78">S</text><text x="10" y="46">W</text></g><g transform="rotate(35 42 42)"><path d="M42 16 L48 42 L42 38 L36 42z" fill="${T.orange}"/><path d="M42 68 L36 42 L42 46 L48 42z" fill="${T.line}"/></g><circle cx="42" cy="42" r="4" fill="#fff" stroke="${T.navy}" stroke-width="2"/></svg>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">${[['A', 'Clifton Suspension Bridge', T.orange], ['B', 'Ashton Court Estate', T.navy], ['C', 'Pill Harbour', T.blue]].map(([l, n, c]) => `<div class="row" style="gap:10px;height:40px"><span class="muted">${ic('drag', 18)}</span><span style="width:26px;height:26px;border-radius:50%;background:${c};color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${l}</span><span style="font-size:14px;font-weight:600;flex:1">${n}</span><span class="muted">${ic('x', 16)}</span></div>`).join('')}</div>
    ${elevation(358, 70)}
    <div class="between"><div class="row" style="gap:8px"><div class="iconbtn">${ic('heart', 20)}</div><div class="iconbtn">${ic('download', 20)}</div><span class="muted" style="font-size:12px;font-weight:700">GPX</span></div><div class="row" style="gap:8px"><span style="font-size:13px;font-weight:700" class="row">${ic('cloudDown', 16)}Offline</span><div class="toggle"><i></i></div></div></div>
    <div class="btn primary" style="height:50px">Save route · 45 km · 520 m</div>
  </div>
</div>` + foot;

// ---------- 6/13. Navigation (light + dark) ----------
function navigation(t, dark) {
  const bannerBg = dark ? '#0c1e30f2' : T.navy + 'f5';
  return head(t) + `
<div class="phone">
  ${mapSvg({ h: 844, dark, pins: false, puck: { x: 150, y: 590, deg: 28 }, avatars: true, id: dark ? 'nd' : 'nl' })}
  <div style="position:absolute;left:12px;right:12px;top:50px;background:${bannerBg};color:#fff;border-radius:18px;padding:14px 16px;box-shadow:${t.shadow};backdrop-filter:blur(8px)">
    <div class="row" style="gap:14px"><span style="width:56px;height:56px;border-radius:14px;background:#ffffff1c;display:inline-flex;align-items:center;justify-content:center">${ic('turnRight', 34, 'stroke-width="2.4"')}</span><div style="flex:1"><b style="font-size:30px;font-weight:800;line-height:1;display:block;letter-spacing:-0.02em">300 m</b><span style="font-size:16px;font-weight:600;color:#d8e5f0">Turn right onto Mill Road</span></div></div>
    <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #ffffff22">${[0, 0, 1, 1].map(on => `<span style="height:26px;border-radius:7px;background:${on ? t.blue : '#ffffff14'};display:inline-flex;align-items:center;justify-content:center;color:#fff;opacity:${on ? 1 : .45}">${ic('turnRight', 16, on ? '' : 'transform="rotate(0)"')}</span>`).join('')}</div>
  </div>
  <div style="position:absolute;left:12px;top:206px" class="row"><span class="badge orange" style="height:30px;background:${t.orange};color:#fff;padding:0 12px;box-shadow:${t.soft}"><span style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%"></span>Rerouting…</span></div>
  <div style="position:absolute;right:12px;top:206px;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
    <div style="width:46px;height:46px;border-radius:50%;background:#fff;border:4px solid ${T.red};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:#132238;box-shadow:${t.soft}">30</div>
    <div class="iconbtn" style="border-radius:50%;color:${t.text}"><span style="display:inline-flex;transform:rotate(-28deg);color:${T.red}">${ic('navArrow', 20)}</span></div>
    <div class="iconbtn" style="border-radius:50%;color:${t.blue}">${ic('speaker', 20)}</div>
  </div>
  <div style="position:absolute;left:12px;right:12px;bottom:24px;background:${t.surface};color:${t.text};border-radius:18px;padding:14px 16px;box-shadow:${t.shadow};display:flex;align-items:center;gap:12px">
    <div style="flex:1;display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px">${[['14:32', 'ETA'], ['8.4 km', 'Left'], ['27 min', 'Time']].map(([v, l], i) => `<div class="stat"><b style="color:${i === 0 ? t.green : t.text}">${v}</b><small>${l}</small></div>`).join('')}</div>
    <div class="btn" style="height:44px;padding:0 16px;background:${T.red}1a;color:${T.red}">End</div>
  </div>
</div>` + foot;
}
files['Navigation.dc.html'] = navigation(T, false);
files['NavigationDark.dc.html'] = navigation(D, true);

// ---------- 7. Live stats / Record ----------
files['LiveStats.dc.html'] = head(T) + `
<div class="phone">
  ${mapSvg({ h: 844, pins: false, puck: { x: 212, y: 460, deg: -20 }, segment: true, avatars: true, id: 'ls' })}
  <div style="position:absolute;left:12px;right:12px;top:54px;display:flex;justify-content:center"><span class="badge dark" style="height:32px;padding:0 14px;font-size:13px"><span style="width:8px;height:8px;border-radius:50%;background:${T.red}"></span>Recording · 41:18</span></div>
  <div style="position:absolute;left:12px;right:12px;top:100px;background:#f7b500;color:#132238;border-radius:14px;padding:10px 14px;box-shadow:${T.soft}" class="between"><span class="row" style="gap:8px;font-weight:800;font-size:14px">${ic('flag', 18)}Ashton Hill Climb</span><span style="font-size:13px;font-weight:700">1:42 <span style="opacity:.6">· PR 1:58</span></span></div>
  <div style="position:absolute;left:12px;right:12px;bottom:110px;background:#132238e6;color:#fff;border-radius:22px;padding:18px 16px;box-shadow:${T.shadow};backdrop-filter:blur(10px)">
    <div style="text-align:center;padding-bottom:12px;border-bottom:1px solid #ffffff1f"><b style="font-size:58px;font-weight:800;line-height:1;letter-spacing:-0.03em">28.4</b><span style="display:block;font-size:12px;font-weight:700;color:#bfe4ff;margin-top:6px">km/h</span></div>
    <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px;margin-top:14px">${[['12.6', 'km', 'route'], ['214', 'm gain', 'mtn'], ['152', 'bpm · Z3', 'heartRate'], ['88', 'rpm', 'cadence']].map(([v, l, i], k) => `<div style="text-align:center"><span style="color:${k === 2 ? T.orange : '#bfe4ff'};display:block;margin-bottom:4px">${ic(i, 18)}</span><b style="font-size:20px;font-weight:800;display:block;letter-spacing:-0.01em">${v}</b><small style="font-size:10px;font-weight:700;color:#d8e5f0">${l}</small></div>`).join('')}</div>
    <div style="margin-top:12px;display:grid;grid-template-columns:repeat(5, minmax(0, 1fr));gap:3px">${[T.line, T.green, T.orange, T.red, '#8b0000'].map((c, i) => `<span style="height:5px;border-radius:3px;background:${c};opacity:${i === 2 ? 1 : .35}"></span>`).join('')}</div>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:center;gap:16px"><div class="iconbtn" style="width:64px;height:64px;border-radius:50%;background:${T.surface}">${ic('pause', 26)}</div><div class="iconbtn" style="width:64px;height:64px;border-radius:50%;background:${T.red};color:#fff;border:0">${ic('stop', 24)}</div></div>
</div>` + foot;

// ---------- 8. Feed ----------
const feedCard = (init, color, name, when, title, km, m, time, kudos, comments, id, seed) => `<div class="card" style="overflow:hidden"><div style="padding:12px 14px" class="row"><span class="avatar" style="background:${color}">${init}</span><div style="flex:1"><b style="font-size:14px;display:block">${name}</b><span class="muted" style="font-size:12px;font-weight:600">${when}</span></div><span class="muted">${ic('more', 18)}</span></div><div style="padding:0 14px 10px"><b style="font-size:16px;font-weight:800">${title}</b></div><div style="position:relative;height:130px;overflow:hidden">${recapMap(390, 130, id, false, seed)}</div><div style="padding:12px 14px;display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px">${[[km, 'Distance'], [m, 'Elevation'], [time, 'Time']].map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join('')}</div><div style="padding:0 14px 12px;display:flex;gap:16px;border-top:1px solid ${T.line};padding-top:10px"><span class="row" style="gap:6px;font-size:13px;font-weight:700;color:${kudos > 20 ? T.orange : T.text}">${ic('heart', 18)}${kudos}</span><span class="row" style="gap:6px;font-size:13px;font-weight:700">${ic('bubble', 18)}${comments}</span><span style="margin-left:auto" class="muted">${ic('share', 18)}</span></div></div>`;
files['Feed.dc.html'] = head(T) + `
<div class="phone safe" style="padding-left:16px;padding-right:16px;display:flex;flex-direction:column;gap:12px">
  <div class="between"><h1 style="font-size:26px;font-weight:800;letter-spacing:-0.02em">Feed</h1><div class="row" style="gap:8px"><span class="badge green" style="height:30px">${ic('record', 12)}3 riding now</span><div class="iconbtn">${ic('search', 18)}</div></div></div>
  ${feedCard('JK', '#8b5bd6', 'Jess Khan', 'Today · 07:42 · Bristol', 'Sunrise laps of Ashton Court', '32.1 km', '410 m', '1h 24m', 24, 6, 'f1', 1)}
  ${feedCard('MR', '#00a6a6', 'Marco Rossi', 'Yesterday · Bath', 'Two Tunnels and back', '31.4 km', '210 m', '1h 18m', 9, 2, 'f2', 2)}
  ${tabbar('Profile')}
</div>` + foot;

// ---------- 9. Post-ride summary ----------
files['PostRide.dc.html'] = head(T) + `
<div class="phone safe" style="padding-left:16px;padding-right:16px;display:flex;flex-direction:column;gap:14px;background:${T.surface}">
  <div class="between"><div class="iconbtn">${ic('x', 20)}</div><b style="font-size:15px">Ride complete</b><span style="width:44px"></span></div>
  <div style="position:relative;height:190px;border-radius:16px;overflow:hidden;box-shadow:${T.soft}">${recapMap(358, 190, 'pr', false, 1)}<span class="badge dark" style="position:absolute;left:10px;bottom:10px">${ic('clock', 12)}Sat 6 Sep · 07:12–08:36</span></div>
  <div><input value="Sunrise laps of Ashton Court" style="width:100%;height:46px;border:1px solid ${T.line};border-radius:12px;padding:0 12px;font:inherit;font-weight:700;font-size:16px;color:${T.text}"></div>
  <div style="display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:8px">${[['32.1', 'km'], ['410', 'm gain'], ['1:24', 'moving'], ['22.9', 'avg km/h']].map(([v, l]) => `<div class="stat" style="background:${T.bg};border-radius:12px;padding:10px 6px;text-align:center"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
  <div><p class="section-title" style="margin-bottom:8px">Achievements</p><div style="display:flex;gap:8px">${[['trophy', 'New PR', 'Ashton Hill Climb', T.orange], ['crown', 'Segment king', 'Clifton Sprint', '#8b5bd6'], ['bolt', 'Longest ride', 'This month', T.blue]].map(([i, t, s, c]) => `<div class="card" style="flex:1;padding:10px;text-align:center;box-shadow:none"><span style="display:inline-flex;width:38px;height:38px;border-radius:50%;background:${c}1a;color:${c};align-items:center;justify-content:center">${ic(i, 20)}</span><b style="display:block;font-size:12px;margin-top:6px">${t}</b><span class="muted" style="font-size:10px;font-weight:600">${s}</span></div>`).join('')}</div></div>
  <div><p class="section-title" style="margin-bottom:8px">Photos</p><div style="display:flex;gap:8px">${terrain(84, 84, 'warm', 12)}${terrain(84, 84, 'cool', 12)}<div style="width:84px;height:84px;border-radius:12px;border:2px dashed ${T.line};display:flex;align-items:center;justify-content:center;color:${T.muted}">${ic('plus', 22)}</div></div></div>
  <div class="between card" style="padding:12px 14px;box-shadow:none"><span class="row" style="gap:8px;font-size:14px;font-weight:700">${ic('user', 18)}Share to feed</span><div class="toggle on"><i></i></div></div>
  <div style="margin-top:auto;margin-bottom:24px;display:flex;gap:10px"><div class="btn ghost" style="flex:1">Discard</div><div class="btn cta" style="flex:2">Save ride</div></div>
</div>` + foot;

// ---------- 10. Profile ----------
files['Profile.dc.html'] = head(T) + `
<div class="phone safe" style="padding-left:16px;padding-right:16px;display:flex;flex-direction:column;gap:16px">
  <div class="between"><div class="iconbtn">${ic('sliders', 20)}</div><div class="iconbtn">${ic('share', 20)}</div></div>
  <div style="text-align:center"><span class="avatar" style="width:88px;height:88px;font-size:28px;background:linear-gradient(135deg,${T.orange},${T.blue});border:4px solid #fff;box-shadow:${T.soft}">HA</span><h1 style="font-size:22px;font-weight:800;margin-top:10px">Handry A.</h1><p class="muted" style="font-size:13px;font-weight:600">Bristol · Road & gravel</p></div>
  <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:8px;text-align:center"><div class="stat"><b>248</b><small>Followers</small></div><div class="stat"><b>131</b><small>Following</small></div></div>
  <div class="card" style="padding:14px;display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px;text-align:center">${[['4,812', 'km this year'], ['61,240', 'm climbed'], ['138', 'rides']].map(([v, l]) => `<div class="stat"><b style="color:${T.blue}">${v}</b><small>${l}</small></div>`).join('')}</div>
  <div><div class="between" style="margin-bottom:10px"><span class="section-title">Badges</span><span class="muted" style="font-size:12px;font-weight:700">12 earned</span></div><div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:10px">${[['trophy', 'Century', T.orange], ['mtn', 'Everester', T.blue], ['sun', 'Early bird', '#f7b500'], ['crown', 'Segment king', '#8b5bd6'], ['flag', '50 segments', T.green], ['leaf', 'Autumn tour', '#b45309']].map(([i, l, c]) => `<div class="card" style="padding:12px 6px;text-align:center;box-shadow:none"><span style="display:inline-flex;width:44px;height:44px;border-radius:50%;background:${c}1a;color:${c};align-items:center;justify-content:center">${ic(i, 22)}</span><b style="display:block;font-size:12px;margin-top:6px">${l}</b></div>`).join('')}</div></div>
  ${tabbar('Profile')}
</div>` + foot;

// ---------- 11. Clubs / challenges ----------
files['Clubs.dc.html'] = head(T) + `
<div class="phone safe" style="padding-left:16px;padding-right:16px;display:flex;flex-direction:column;gap:14px">
  <div class="between"><h1 style="font-size:26px;font-weight:800;letter-spacing:-0.02em">Clubs</h1><span class="chip on">${ic('plus', 14)}Create</span></div>
  <div class="card" style="overflow:hidden"><div style="position:relative">${terrain(358, 96, 'forest', 0)}<div style="position:absolute;left:14px;bottom:10px;color:#fff"><b style="font-size:17px;font-weight:800;display:block">Bristol Gravel Collective</b><span style="font-size:12px;font-weight:600;opacity:.9">412 members</span></div></div>
    <div style="padding:12px 14px" class="between"><div class="row" style="gap:10px"><div style="width:44px;border-radius:10px;background:${T.orange}1a;color:${T.orange};text-align:center;padding:5px 0"><b style="display:block;font-size:16px;line-height:1">13</b><small style="font-size:10px;font-weight:800">SEP</small></div><div><b style="font-size:14px;display:block">Saturday social · 60 km</b><span class="muted" style="font-size:12px;font-weight:600">08:30 · Ashton Court gate · 18 going</span></div></div><span class="btn primary" style="height:38px;padding:0 14px;font-size:13px">Join</span></div>
  </div>
  <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px"><div class="between"><span class="section-title">${ic('trophy', 16)} This week's leaderboard</span><span class="muted" style="font-size:12px;font-weight:700">Distance</span></div>${[['1', 'JK', '#8b5bd6', 'Jess Khan', '212 km'], ['2', 'MR', '#00a6a6', 'Marco Rossi', '188 km'], ['3', 'HA', T.blue, 'You', '176 km']].map(([r, i, c, n, d]) => `<div class="row" style="gap:10px"><b style="width:18px;color:${T.muted}">${r}</b><span class="avatar" style="width:32px;height:32px;font-size:11px;background:${c}">${i}</span><span style="flex:1;font-size:14px;font-weight:${n === 'You' ? 800 : 600}">${n}</span><b style="font-size:14px">${d}</b></div>`).join('')}</div>
  <div class="card" style="padding:14px;background:${T.navy};color:#fff;border:0"><div class="between"><div><span class="badge" style="background:#ffffff1f;color:#fff">Challenge</span><b style="font-size:17px;font-weight:800;display:block;margin-top:8px">September 500 km</b><span style="font-size:12px;color:#d8e5f0;font-weight:600">310 of 500 km · 9 days left</span></div>${ic('mtn', 34)}</div><div style="height:8px;border-radius:999px;background:#ffffff26;margin:12px 0 10px"><div style="width:62%;height:8px;border-radius:999px;background:linear-gradient(90deg,${T.orange},${T.blue})"></div></div><div class="btn" style="height:42px;background:#fff;color:${T.navy};font-size:14px">Join challenge</div></div>
  ${tabbar('Segments')}
</div>` + foot;

// ---------- 12. Comments ----------
files['Comments.dc.html'] = head(T) + `
<div class="phone safe" style="background:${T.surface};display:flex;flex-direction:column">
  <div style="padding:0 16px 12px;border-bottom:1px solid ${T.line}" class="row"><div class="iconbtn" style="box-shadow:none">${ic('chevL', 20)}</div><div style="flex:1"><b style="font-size:15px;display:block">Sunrise laps of Ashton Court</b><span class="muted" style="font-size:12px;font-weight:600">Jess Khan · 6 comments</span></div></div>
  <div style="padding:16px;display:flex;flex-direction:column;gap:14px;flex:1">
    ${[['MR', '#00a6a6', 'Marco Rossi', '2h', 'That climb at km 18 is brutal in the wet — nice work getting the PR!'], ['HA', T.blue, 'Handry A.', '1h', 'Coffee at the top next time? Salt & Malt opens at 7.'], ['JK', '#8b5bd6', 'Jess Khan', '40m', 'Deal. Saturday sunrise, same loop 🚴'], ['TB', T.green, 'Tom Bailey', '12m', 'Adding this one to my Weekend rides collection.']].map(([i, c, n, t, msg]) => `<div class="row" style="align-items:flex-start;gap:10px"><span class="avatar" style="width:34px;height:34px;font-size:11px;background:${c}">${i}</span><div style="flex:1"><div class="row" style="gap:6px"><b style="font-size:13px">${n}</b><span class="muted" style="font-size:11px;font-weight:600">${t}</span></div><div style="margin-top:4px;background:${T.bg};border-radius:4px 14px 14px 14px;padding:10px 12px;font-size:14px;line-height:1.4">${msg.replace('🚴', '')}</div><div class="row muted" style="gap:14px;margin-top:6px;font-size:12px;font-weight:700"><span class="row" style="gap:4px">${ic('heart', 14)}3</span><span>Reply</span></div></div></div>`).join('')}
  </div>
  <div style="padding:10px 16px 28px;border-top:1px solid ${T.line}" class="row"><span class="avatar" style="width:34px;height:34px;font-size:11px;background:${T.blue}">HA</span><div style="flex:1;height:44px;border-radius:999px;border:1px solid ${T.line};background:${T.bg};display:flex;align-items:center;padding:0 14px;color:${T.muted};font-size:14px">Add a comment</div><div class="iconbtn" style="border-radius:50%;background:${T.blue};color:#fff;border:0">${ic('send', 18)}</div></div>
</div>` + foot;

// ---------- canvas ----------
const rowA = ['Main', 'AdventureFilters', 'RouteDetail', 'MyRoutes', 'Planner', 'Navigation', 'NavigationDark'];
const rowB = ['LiveStats', 'Feed', 'PostRide', 'Profile', 'Clubs', 'Comments'];
const titles = { Main: 'Adventure home', AdventureFilters: 'Adventure · filters', RouteDetail: 'Route detail', MyRoutes: 'My routes', Planner: 'Route planner', Navigation: 'Navigation', NavigationDark: 'Navigation · dark', LiveStats: 'Record · live stats', Feed: 'Activity feed', PostRide: 'Post-ride summary', Profile: 'Profile', Clubs: 'Clubs & challenges', Comments: 'Comment thread' };
const artboards = [
  ...rowA.map((n, i) => ({ file: `${n}.dc.html`, title: titles[n], x: i * 480, y: 0, w: 390, h: 844 })),
  ...rowB.map((n, i) => ({ file: `${n}.dc.html`, title: titles[n], x: i * 480, y: 990, w: 390, h: 844 })),
];
const canvas = {
  artboards,
  annotations: [
    { id: 'about', x: 0, y: -150, w: 560, text: 'Ridewise next: Google Maps navigation clarity + Komoot discovery/planning + Strava performance & social.\nColours, radii and type are lifted from the app\'s current styles.css (blue #176bdb, orange #f28b30, navy #15324d, 16px cards, Inter). All stats, names and places are sample data. Status bar / keyboard are left to the real device.' },
  ],
  launch: { view: 'canvas' },
};

for (const [name, html] of Object.entries(files)) writeFileSync(name, html);
writeFileSync('canvas.json', JSON.stringify(canvas, null, 2));
console.log('wrote', Object.keys(files).length, 'artboards + canvas.json');
