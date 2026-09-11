// Generates the Ridewise PLAN canvas: desktop layouts, the loading-state
// redesign, carousel controls, route-quality plan and the feature roadmap.
// Run: node generate.mjs
import { writeFileSync } from 'node:fs';

const T = {
  bg: '#f5f7fa', surface: '#fff', line: '#dbe2ea', text: '#132238', muted: '#657186',
  blue: '#176bdb', accent: '#f28b30', green: '#139b66', red: '#d94d4d', navy: '#15324d', gold: '#f7b500',
  muted2: '#edf2f7',
};

const I = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8 17h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>',
  record: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h14"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="20" cy="12" r="2"/>',
  shuffle: '<path d="M4 7h4l8 10h4M4 17h4l2-2.5M14 9.5l2-2.5h4M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  mtn: '<path d="M3 20l6-10 4 6 3-4 5 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V4M8 8l4-4 4 4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s6-6.5 6-11a6 6 0 0 0-12 0c0 4.5 6 11 6 11z"/><circle cx="12" cy="10" r="2.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  check: '<path d="M5 12l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  bolt: '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19c3-4 6-7 10-9"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h9"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  drag: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6"/>',
  cloudDown: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9h-1M12 12v8M9 17l3 3 3-3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none"/>',
};
const ic = (n, s = 20, extra = '') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${I[n] || ''}</svg>`;

const css = `
  html, body { height:100%; }
  body { margin:0; background:#e9edf2; font-family:Inter,-apple-system,"SF Pro Text",system-ui,sans-serif; color:${T.text}; -webkit-font-smoothing:antialiased; }
  * { box-sizing:border-box; }
  a { color:${T.blue}; } a:hover { color:${T.accent}; }
  h1,h2,h3,p { margin:0; }
  .frame { position:relative; width:100%; height:100%; overflow:hidden; background:${T.bg}; display:flex; }
  .rail { width:88px; background:${T.navy}; padding:14px 6px; display:flex; flex-direction:column; gap:4px; flex:0 0 auto; }
  .rail .brand { color:#fff; text-align:center; font-size:11px; font-weight:800; margin-bottom:10px; }
  .rail .brand i { display:block; width:40px; height:40px; margin:0 auto 6px; border-radius:11px; background:linear-gradient(135deg,${T.accent},${T.blue}); }
  .tab { border:0; background:transparent; color:#b8c7d6; border-radius:12px; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; font-size:10px; font-weight:600; }
  .tab.on { background:#ffffff1f; color:#fff; }
  .tab.rec { color:${T.accent}; }
  .panel { width:460px; flex:0 0 auto; background:${T.surface}; border-right:1px solid ${T.line}; display:flex; flex-direction:column; }
  .panel-head { padding:18px 20px 12px; border-bottom:1px solid ${T.line}; }
  .panel-body { padding:16px 20px; overflow:auto; display:flex; flex-direction:column; gap:14px; flex:1; }
  .map { flex:1; position:relative; overflow:hidden; }
  .card { background:${T.surface}; border:1px solid ${T.line}; border-radius:16px; box-shadow:0 4px 14px #10233d18; }
  .pad { padding:14px; }
  .row { display:flex; align-items:center; gap:10px; }
  .between { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .muted { color:${T.muted}; }
  .title { font-size:22px; font-weight:800; letter-spacing:-.02em; }
  .sub { font-size:13px; font-weight:600; color:${T.muted}; margin-top:3px; }
  .sec { font-size:15px; font-weight:800; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:0 16px; border:0; border-radius:12px; font-weight:700; font-size:14px; background:${T.muted2}; color:${T.text}; }
  .btn.primary { background:${T.blue}; color:#fff; }
  .btn.cta { background:${T.accent}; color:#fff; }
  .btn.sm { min-height:36px; font-size:13px; padding:0 12px; border-radius:10px; }
  .btn.ghost { background:${T.surface}; border:1px solid ${T.line}; }
  .chip { display:inline-flex; align-items:center; gap:6px; min-height:32px; padding:0 12px; border-radius:999px; border:1px solid ${T.line}; background:${T.surface}; font-size:13px; font-weight:600; white-space:nowrap; }
  .chip.on { background:${T.navy}; border-color:${T.navy}; color:#fff; }
  .badge { display:inline-flex; align-items:center; gap:5px; min-height:24px; padding:0 9px; border-radius:999px; font-size:11px; font-weight:700; }
  .badge.blue { background:#176bdb22; color:${T.blue}; }
  .badge.green { background:#139b6622; color:${T.green}; }
  .badge.orange { background:#f28b3028; color:#a35400; }
  .badge.red { background:#d94d4d22; color:${T.red}; }
  .badge.dark { background:#132238cc; color:#fff; }
  .stat b { display:block; font-size:16px; font-weight:800; }
  .stat small { display:block; font-size:11px; color:${T.muted}; font-weight:600; margin-top:2px; }
  .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
  .tile { background:${T.muted2}; border-radius:12px; padding:10px 6px; text-align:center; }
  .iconbtn { width:42px; height:42px; border-radius:12px; display:inline-flex; align-items:center; justify-content:center; background:${T.surface}; border:1px solid ${T.line}; box-shadow:0 4px 14px #10233d18; }
  .tools { position:absolute; right:16px; bottom:16px; display:flex; flex-direction:column; gap:8px; }
  .rail-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .carousel { position:relative; padding:0 20px; }
  .carousel .track { overflow:hidden; }
  .track { display:flex; gap:12px; overflow:hidden; }
  .arrow { position:absolute; top:50%; transform:translateY(-50%); width:36px; height:36px; border-radius:50%; background:${T.surface}; border:1px solid ${T.line}; box-shadow:0 6px 18px #10233d28; display:flex; align-items:center; justify-content:center; z-index:2; }
  .arrow.l { left:-4px; } .arrow.r { right:-4px; }
  .sbar { height:6px; border-radius:999px; background:${T.line}; margin-top:10px; position:relative; }
  .sbar i { position:absolute; left:0; top:0; height:6px; width:38%; border-radius:999px; background:#9fb0c2; }
  .skel { background:linear-gradient(90deg,${T.muted2} 25%,#e3e9f0 37%,${T.muted2} 63%); border-radius:8px; }
  .note { border-left:3px solid ${T.accent}; padding:2px 0 2px 12px; }
  .kv { display:grid; grid-template-columns:132px 1fr; gap:8px 14px; font-size:13px; }
  .kv b { font-weight:700; }
  .step { display:flex; gap:12px; padding:10px 0; border-bottom:1px solid ${T.line}; }
  .step:last-child { border-bottom:0; }
  .num { width:26px; height:26px; border-radius:50%; background:${T.navy}; color:#fff; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
  .pill-row { display:flex; gap:6px; flex-wrap:wrap; }
  .col2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .col3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
`;

const head = () => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>${css}</style>
</helmet>
`;
const foot = `</x-dc>
</body>
</html>
`;

/* ------------------------------- map art ------------------------------- */
function mapArt(w, h, id, { route = true, pins = true } = {}) {
  const x = (f) => (f * w).toFixed(0), y = (f) => (f * h).toFixed(0);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${T.accent}"/><stop offset="1" stop-color="${T.blue}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="#eaeee7"/>
    <ellipse cx="${x(.72)}" cy="${y(.24)}" rx="${x(.3)}" ry="${y(.28)}" fill="#d5e6c6"/>
    <ellipse cx="${x(.18)}" cy="${y(.78)}" rx="${x(.26)}" ry="${y(.26)}" fill="#d5e6c6"/>
    <path d="M0 ${y(.66)} C ${x(.24)} ${y(.58)}, ${x(.44)} ${y(.84)}, ${w} ${y(.72)} L ${w} ${h} L 0 ${h} Z" fill="#c6dcf1" opacity=".7"/>
    <g stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round">
      <path d="M0 ${y(.36)} C ${x(.3)} ${y(.32)}, ${x(.6)} ${y(.46)}, ${w} ${y(.38)}"/>
      <path d="M${x(.58)} 0 C ${x(.56)} ${y(.4)}, ${x(.66)} ${y(.7)}, ${x(.62)} ${h}"/>
    </g>
    <g font-family="Inter" font-size="11" font-weight="600" fill="#7b8794">
      <text x="${x(.66)}" y="${y(.18)}">Ashton Court</text><text x="${x(.14)}" y="${y(.5)}">Bedminster</text><text x="${x(.44)}" y="${y(.86)}">Long Ashton</text>
    </g>
    ${route ? `<path d="M ${x(.24)} ${y(.74)} C ${x(.16)} ${y(.44)}, ${x(.36)} ${y(.16)}, ${x(.54)} ${y(.22)} S ${x(.86)} ${y(.28)}, ${x(.82)} ${y(.56)} S ${x(.5)} ${y(.9)}, ${x(.24)} ${y(.74)} Z" stroke="#fff" stroke-width="9" fill="none"/>
    <path d="M ${x(.24)} ${y(.74)} C ${x(.16)} ${y(.44)}, ${x(.36)} ${y(.16)}, ${x(.54)} ${y(.22)} S ${x(.86)} ${y(.28)}, ${x(.82)} ${y(.56)} S ${x(.5)} ${y(.9)}, ${x(.24)} ${y(.74)} Z" stroke="url(#${id})" stroke-width="5" fill="none"/>` : ''}
    ${pins ? `<circle cx="${x(.24)}" cy="${y(.74)}" r="7" fill="#fff" stroke="${T.accent}" stroke-width="3"/>` : ''}
  </svg>`;
}

function elevSvg(w, h) {
  const pts = [[0, .72], [.1, .62], [.2, .68], [.3, .4], [.4, .3], [.5, .46], [.6, .5], [.7, .2], [.8, .16], [.9, .38], [1, .5]]
    .map(([a, b]) => `${(a * w).toFixed(0)},${(b * h).toFixed(0)}`).join(' ');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block"><polygon points="0,${h} ${pts} ${w},${h}" fill="#176bdb22"/><polyline points="${pts}" fill="none" stroke="#9fb0c2" stroke-width="2"/><polyline points="${(0.3 * w).toFixed(0)},${(0.4 * h).toFixed(0)} ${(0.4 * w).toFixed(0)},${(0.3 * h).toFixed(0)}" fill="none" stroke="${T.accent}" stroke-width="3.4" stroke-linecap="round"/><polyline points="${(0.6 * w).toFixed(0)},${(0.5 * h).toFixed(0)} ${(0.7 * w).toFixed(0)},${(0.2 * h).toFixed(0)}" fill="none" stroke="${T.red}" stroke-width="3.4" stroke-linecap="round"/></svg>`;
}

const rail = (active) => `<nav class="rail">
  <div class="brand"><i></i>Ridewise</div>
  ${[['compass', 'Adventure'], ['route', 'Plan'], ['record', 'Record'], ['flag', 'Segments'], ['user', 'Profile']]
    .map(([i, l]) => `<div class="tab${l === active ? ' on' : ''}${i === 'record' ? ' rec' : ''}">${ic(i, 22)}<span>${l}</span></div>`).join('')}
</nav>`;

const files = {};

/* ===================== 1. Desktop — Discover ===================== */
const deckCard = (name, km, climb, time, diff, tone) => `<article class="card" style="width:268px;overflow:hidden;flex:0 0 auto">
  <div style="position:relative;height:118px;background:#dfe7f0">${mapArt(268, 118, 'd' + name.replace(/\W/g, ''), { pins: false })}
    <div style="position:absolute;left:10px;top:10px"><span class="badge dark">Scenic</span></div>
    <div style="position:absolute;right:10px;top:10px;display:flex;gap:6px">
      <span class="iconbtn" style="width:32px;height:32px;border:0">${ic('heart', 16)}</span>
      <span class="iconbtn" style="width:32px;height:32px;border:0">${ic('share', 16)}</span></div>
  </div>
  <div style="padding:12px">
    <b style="font-size:15px;display:block">${name}</b>
    <span class="muted" style="font-size:12px;font-weight:600">62% on cycle infrastructure</span>
    <div class="row" style="gap:12px;font-size:13px;font-weight:700;margin:9px 0 10px;white-space:nowrap">
      <span class="row" style="gap:5px">${ic('route', 14)}${km}</span>
      <span class="row" style="gap:5px">${ic('mtn', 14)}${climb}</span>
      <span class="row" style="gap:5px">${ic('clock', 14)}${time}</span>
      <span class="badge ${tone}">${diff}</span>
    </div>
    <div class="row" style="gap:8px"><button class="btn ghost sm" style="flex:1">${ic('eye', 15)}Show</button><button class="btn primary sm" style="flex:1">Details</button></div>
  </div>
</article>`;

files['Main.dc.html'] = head() + `
<div class="frame">
  ${rail('Adventure')}
  <div class="panel" style="width:520px">
    <div class="panel-head">
      <div class="between"><div><div class="title">Adventure</div><div class="sub">3 loops near Bristol</div></div>
        <div class="row" style="gap:8px"><button class="btn ghost sm">${ic('sliders', 16)}Filters</button><button class="btn cta sm">${ic('shuffle', 16)}Surprise me</button></div></div>
      <div class="row" style="margin-top:14px;min-height:46px;padding:0 14px;border-radius:999px;background:${T.muted2};border:1px solid ${T.line};color:${T.muted};font-size:14px">${ic('search', 18)}Search routes, places, riders</div>
    </div>
    <div class="panel-body">
      <div class="carousel">
        <div class="rail-head"><span class="sec">Recommended loops</span><span class="muted" style="font-size:12px;font-weight:700">1 / 3</span></div>
        <div class="track">${deckCard('Chew Valley Loop', '42 km', '610 m', '2h 15', 'Hard', 'red')}${deckCard('Ashton Gravel', '24 km', '320 m', '1h 20', 'Moderate', 'orange')}</div>
        <div class="arrow l">${ic('chevL', 18)}</div><div class="arrow r">${ic('chevR', 18)}</div>
        <div class="sbar"><i></i></div>
      </div>
      <div class="carousel">
        <div class="rail-head"><span class="sec">Community favourites</span></div>
        <div class="track">${['Severn Beach Flat', 'Bath Two Tunnels', 'Dundry Climb'].map((n, i) => `<div class="card" style="width:170px;overflow:hidden;flex:0 0 auto"><div style="height:72px;position:relative;background:#dfe7f0">${mapArt(170, 72, 'c' + i, { pins: false })}</div><div style="padding:9px 10px"><b style="font-size:13px;display:block">${n}</b><span class="muted" style="font-size:11px;font-weight:600">38 km · Moderate</span></div></div>`).join('')}</div>
        <div class="arrow l">${ic('chevL', 18)}</div><div class="arrow r">${ic('chevR', 18)}</div>
        <div class="sbar"><i style="width:52%"></i></div>
      </div>
    </div>
  </div>
  <div class="map">${mapArt(832, 900, 'mapMain')}
    <div class="tools"><div class="iconbtn">${ic('pin', 20)}</div><div class="iconbtn">${ic('share', 20)}</div><div class="iconbtn">${ic('layers', 20)}</div></div>
  </div>
</div>` + foot;

/* ===================== 2. Desktop — Route detail ===================== */
files['DesktopRouteDetail.dc.html'] = head() + `
<div class="frame">
  ${rail('Adventure')}
  <div class="panel" style="width:520px">
    <div class="panel-head">
      <div class="row"><div class="iconbtn">${ic('chevL', 18)}</div>
        <div style="flex:1"><div class="title" style="font-size:20px">Chew Valley Loop</div><div class="sub">42.3 km · Hard</div></div>
        <div class="iconbtn">${ic('heart', 18)}</div><div class="iconbtn">${ic('share', 18)}</div></div>
    </div>
    <div class="panel-body">
      <div class="pill-row"><span class="badge red">Hard</span><span class="badge green">Mostly paved</span><span class="badge blue">Scenic route</span></div>
      <div class="stats">
        ${[['42.3 km', 'distance'], ['610 m', 'elevation'], ['2h 15m', 'est. time'], ['62%', 'OSM cycle infra']].map(([v, l]) => `<div class="stat tile"><b>${v}</b><small>${l}</small></div>`).join('')}
      </div>
      <div><div class="between" style="margin-bottom:6px"><span class="sec">Elevation</span><span class="muted" style="font-size:11px;font-weight:700">&lt;4% · 4-8% · 8%+</span></div>${elevSvg(460, 96)}</div>
      <div><div class="sec" style="margin-bottom:8px">Highlights</div>
        ${[['Blagdon Lake viewpoint', 'km 14 · viewpoint'], ['Stanton Drew stones', 'km 28 · historic'], ['Salt & Malt café', 'km 33 · rest stop']].map(([a, b]) => `<div class="row" style="padding:7px 0"><span class="iconbtn" style="width:34px;height:34px;box-shadow:none;background:#176bdb18;border:0;color:${T.blue}">${ic('pin', 17)}</span><div><b style="font-size:14px;display:block">${a}</b><span class="muted" style="font-size:12px;font-weight:600">${b}</span></div></div>`).join('')}
      </div>
      <div class="row" style="gap:10px;margin-top:auto;padding-top:10px"><div class="iconbtn" style="width:48px;height:48px">${ic('cloudDown', 20)}</div><button class="btn cta" style="flex:1;min-height:48px">${ic('compass', 18)}Start navigation</button></div>
    </div>
  </div>
  <div class="map">${mapArt(832, 900, 'mapDetail')}
    <div style="position:absolute;left:16px;right:16px;bottom:16px" class="card pad">
      <div class="between" style="margin-bottom:6px"><span class="sec">Elevation profile</span><span class="muted" style="font-size:12px;font-weight:700">hover the chart to trace the route</span></div>
      ${elevSvg(800, 92)}
    </div>
  </div>
</div>` + foot;

/* ===================== 3. Desktop — Planner ===================== */
files['DesktopPlanner.dc.html'] = head() + `
<div class="frame">
  ${rail('Plan')}
  <div class="panel" style="width:520px">
    <div class="panel-head"><div class="title">Plan route</div><div class="sub">Build a route, or open one you saved</div></div>
    <div class="panel-body">
      <div class="card pad">
        <div class="sec" style="margin-bottom:10px">Waypoints</div>
        ${[['A', 'Clifton Suspension Bridge', T.accent], ['B', 'Ashton Court Estate', T.navy], ['C', 'Pill Harbour', T.blue]].map(([l, n, c]) => `<div class="row" style="padding:8px 0;border-bottom:1px solid ${T.line}">
          <span class="muted">${ic('drag', 18)}</span>
          <span style="width:26px;height:26px;border-radius:50%;background:${c};color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${l}</span>
          <span style="flex:1;font-size:14px;font-weight:600">${n}</span><span class="muted">${ic('x', 16)}</span></div>`).join('')}
        <button class="btn ghost sm" style="margin-top:10px">+ Add waypoint</button>
      </div>
      <div class="card pad">
        <div class="between"><div><b style="font-size:14px;display:block">Round trip</b><span class="muted" style="font-size:12px;font-weight:600">Loop back to the start</span></div>
          <span style="width:46px;height:28px;border-radius:999px;background:${T.green};position:relative"><i style="position:absolute;top:3px;left:21px;width:22px;height:22px;border-radius:50%;background:#fff"></i></span></div>
      </div>
      <div><div class="sec" style="margin-bottom:8px">Preferences</div>
        <div class="pill-row"><span class="chip on">Road</span><span class="chip">Gravel</span><span class="chip">MTB</span><span class="chip">${ic('mtn', 14)}Avoid hills</span><span class="chip">${ic('leaf', 14)}Quiet roads</span><span class="chip">${ic('wind', 14)}Tailwind home</span></div>
      </div>
      <div class="card pad">
        <div class="between" style="margin-bottom:8px"><b style="font-size:14px">Recommended</b><span class="badge green">Moderate</span></div>
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">${[['45.2 km', 'distance'], ['520 m', 'climb'], ['2h 04m', 'time']].map(([v, l]) => `<div class="stat"><b>${v}</b><small>${l}</small></div>`).join('')}</div>
        <div style="margin-top:10px">${elevSvg(430, 74)}</div>
        <div class="row" style="gap:8px;margin-top:10px"><button class="btn primary sm">Navigate</button><button class="btn ghost sm">${ic('heart', 15)}Save</button><button class="btn ghost sm">${ic('download', 15)}GPX</button></div>
      </div>
    </div>
  </div>
  <div class="map">${mapArt(832, 900, 'mapPlan')}
    <div class="tools"><div class="iconbtn">${ic('pin', 20)}</div><div class="iconbtn">${ic('layers', 20)}</div></div>
  </div>
</div>` + foot;

/* ===================== 4. Loading states ===================== */
const skelCard = () => `<div class="card pad" style="display:flex;gap:12px;align-items:center">
  <div class="skel" style="width:44px;height:44px;border-radius:10px"></div>
  <div style="flex:1"><div class="skel" style="height:12px;width:52%"></div><div class="skel" style="height:10px;width:34%;margin-top:8px"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">${[0, 1, 2].map(() => '<div class="skel" style="height:34px"></div>').join('')}</div>
    <div class="skel" style="height:52px;margin-top:10px"></div></div>
</div>`;

files['LoadingStates.dc.html'] = head() + `
<div style="padding:28px;background:#fff;min-height:100%">
  <div class="title">Route calculation — stable loading</div>
  <div class="sub" style="max-width:760px">The current indicator is centred on the map, but the <b>.compact</b> variant re-anchors it to the bottom, and generation calls it with compact alternating between stages. It teleports mid-run. Fix: one element, one position, progress that only ever moves forward.</div>

  <div class="col2" style="margin-top:22px">
    <div>
      <div class="sec" style="margin-bottom:10px;color:${T.red}">${ic('x', 16)} Today — jumps between two anchors</div>
      <div class="card" style="position:relative;height:280px;overflow:hidden;background:#eaeee7">
        ${mapArt(430, 280, 'lbad', { pins: false })}
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:${T.navy};color:#fff;border-radius:14px;padding:12px 15px;font-size:12px;font-weight:600">Finding rivers and greenways…</div>
        <div style="position:absolute;left:14px;right:14px;bottom:14px;background:${T.navy};color:#fff;border-radius:14px;padding:11px 14px;font-size:12px;font-weight:600;opacity:.45">Shortest route ready · finding distinct returns…</div>
        <svg style="position:absolute;left:50%;top:50%;width:200px;height:120px;margin-left:-40px" viewBox="0 0 200 120"><path d="M20 10 C 90 20, 120 80, 60 100" stroke="${T.red}" stroke-width="2.5" fill="none" stroke-dasharray="5 4"/><path d="M60 100 l 8 -12 M60 100 l 13 3" stroke="${T.red}" stroke-width="2.5" fill="none"/></svg>
      </div>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:8px">Two anchors, alternating per stage — reads as a glitch.</p>
    </div>
    <div>
      <div class="sec" style="margin-bottom:10px;color:${T.green}">${ic('check', 16)} Proposed — anchored progress + skeletons</div>
      <div class="card" style="position:relative;height:280px;overflow:hidden;background:#eaeee7">
        ${mapArt(430, 280, 'lgood', { pins: false })}
        <div style="position:absolute;left:14px;right:14px;top:14px;background:${T.surface};border-radius:14px;padding:12px 14px;box-shadow:0 8px 24px #10233d28">
          <div class="between" style="margin-bottom:8px"><b style="font-size:13px">Building your loop</b><span class="muted" style="font-size:12px;font-weight:700">Step 2 of 4</span></div>
          <div style="height:6px;border-radius:999px;background:${T.line};position:relative"><i style="position:absolute;left:0;top:0;height:6px;width:52%;border-radius:999px;background:linear-gradient(90deg,${T.accent},${T.blue})"></i></div>
          <div class="muted" style="font-size:12px;font-weight:600;margin-top:8px">Scoring cycle infrastructure from OpenStreetMap</div>
        </div>
      </div>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:8px">One fixed anchor at the top of the sheet. Never re-positions.</p>
    </div>
  </div>

  <div class="col2" style="margin-top:24px">
    <div>
      <div class="sec" style="margin-bottom:10px">Results area — skeleton cards, not an empty gap</div>
      ${skelCard()}
    </div>
    <div>
      <div class="sec" style="margin-bottom:10px">Stage labels (forward-only)</div>
      <div class="card pad">
        ${[['Finding places worth riding to', 'Mapbox place search'], ['Connecting candidate loops', 'Directions API, 3 candidates'], ['Scoring cycle infrastructure', 'Overpass — falls back to estimate'], ['Adding elevation and wind', 'Open-Meteo']].map(([a, b], i) => `<div class="step"><span class="num" style="${i > 1 ? `background:${T.line};color:${T.muted}` : ''}">${i < 2 ? ic('check', 14) : i + 1}</span><div><b style="font-size:13px;display:block">${a}</b><span class="muted" style="font-size:12px;font-weight:600">${b}</span></div></div>`).join('')}
        <p class="muted" style="font-size:12px;font-weight:600;margin-top:10px">A step never un-completes; if a stage fails the app says so and carries on with the fallback.</p>
      </div>
    </div>
  </div>
</div>` + foot;

/* ===================== 5. Carousel controls ===================== */
files['CarouselControls.dc.html'] = head() + `
<div style="padding:28px;background:#fff;min-height:100%">
  <div class="title">Horizontal decks on a laptop</div>
  <div class="sub" style="max-width:760px">Today <b>.hscroll</b> sets <b>scrollbar-width: none</b> and hides the WebKit scrollbar. With a mouse there is no affordance and often no way to scroll at all — the carousel is unusable on a laptop.</div>

  <div class="card pad" style="margin-top:20px">
    <div class="sec" style="margin-bottom:12px">Proposed control set</div>
    <div class="carousel" style="padding:0 18px">
      <div class="track">${['Chew Valley Loop', 'Ashton Gravel', 'Mendip Ridge'].map((n, i) => `<div class="card" style="width:210px;flex:0 0 auto;overflow:hidden"><div style="height:84px;position:relative;background:#dfe7f0">${mapArt(210, 84, 'cc' + i, { pins: false })}</div><div style="padding:10px"><b style="font-size:13px;display:block">${n}</b><span class="muted" style="font-size:11px;font-weight:600">42 km · 610 m</span></div></div>`).join('')}</div>
      <div class="arrow l">${ic('chevL', 18)}</div><div class="arrow r">${ic('chevR', 18)}</div>
      <div class="sbar"><i></i></div>
    </div>
  </div>

  <div class="col2" style="margin-top:20px">
    <div class="card pad">
      <div class="sec" style="margin-bottom:10px">Rules</div>
      <div class="kv">
        <b>Arrows</b><span>Shown only on pointer devices (<b>@media (hover:hover)</b>). Scroll by one card width. Disabled at each end.</span>
        <b>Scrollbar</b><span>Thin, always visible on desktop — the honest affordance. Hidden on touch where swipe is native.</span>
        <b>Wheel</b><span>Vertical wheel maps to horizontal scroll while the pointer is over a deck.</span>
        <b>Drag</b><span>Click-and-drag to pan, with a grab cursor.</span>
        <b>Keyboard</b><span>Deck is focusable; Left/Right arrows move one card, Home/End jump to the ends.</span>
        <b>Counter</b><span>"2 / 6" beside the section title so position is always legible.</span>
      </div>
    </div>
    <div class="card pad">
      <div class="sec" style="margin-bottom:10px">Better still on wide screens</div>
      <p class="muted" style="font-size:13px;font-weight:600;line-height:1.55">Above 1100px the recommended loops stop being a carousel at all and become a two-column grid — no scrolling needed, every option visible at once. The carousel treatment stays for the narrower community rails.</p>
      <div class="col2" style="margin-top:12px">
        ${[0, 1, 2, 3].map((i) => `<div class="card" style="overflow:hidden"><div style="height:64px;position:relative;background:#dfe7f0">${mapArt(200, 64, 'gg' + i, { pins: false })}</div><div style="padding:8px 10px"><b style="font-size:12px">Loop ${i + 1}</b></div></div>`).join('')}
      </div>
    </div>
  </div>
</div>` + foot;

/* ===================== 6. Better routes ===================== */
files['BetterRoutes.dc.html'] = head() + `
<div style="padding:28px;background:#fff;min-height:100%">
  <div class="title">Better routes</div>
  <div class="sub" style="max-width:820px">Today the generator picks anchor points geometrically, asks Mapbox for a cycling route through them, then <i>scores</i> the result against OpenStreetMap afterwards. The OSM data never influences the route it builds. That is the single biggest lever on quality.</div>

  <div class="col2" style="margin-top:20px">
    <div class="card pad">
      <div class="sec" style="margin-bottom:10px;color:${T.red}">Today — score after the fact</div>
      ${['Pick anchors on a circle around the start', 'Ask Mapbox for a cycling route through them', 'Fetch OSM data for the finished route', 'Show a percentage the rider cannot act on'].map((s, i) => `<div class="step"><span class="num" style="background:${T.line};color:${T.muted}">${i + 1}</span><div style="font-size:13px;font-weight:600">${s}</div></div>`).join('')}
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:10px">A loop scoring 12% is discovered only once it has been built and shown.</p>
    </div>
    <div class="card pad">
      <div class="sec" style="margin-bottom:10px;color:${T.green}">Proposed — steer with the data</div>
      ${['Fetch OSM cycleways, surface and quiet lanes for the search area first', 'Weight candidate anchors toward that network, away from primary roads', 'Build 6 candidates instead of 3, in parallel', 'Rank on infrastructure, surface, climb and repeat-road', 'Keep the best 3, and say why each one won'].map((s, i) => `<div class="step"><span class="num">${i + 1}</span><div style="font-size:13px;font-weight:600">${s}</div></div>`).join('')}
    </div>
  </div>

  <div class="card pad" style="margin-top:18px">
    <div class="sec" style="margin-bottom:10px">New rider controls</div>
    <div class="pill-row" style="margin-bottom:12px">
      <span class="chip">${ic('mtn', 14)}Avoid hills</span><span class="chip on">${ic('leaf', 14)}Quiet roads</span><span class="chip">${ic('wind', 14)}Tailwind on the way home</span>
      <span class="chip">Paved only</span><span class="chip">Allow gravel</span><span class="chip">${ic('clock', 14)}Back before sunset</span>
    </div>
    <div class="kv">
      <b>Avoid hills</b><span>Penalises candidates by metres climbed per km, using the elevation data already fetched.</span>
      <b>Quiet roads</b><span>Down-weights <b>primary</b>/<b>secondary</b> OSM classes, up-weights <b>cycleway</b>, <b>living_street</b>, <b>track</b>.</span>
      <b>Tailwind home</b><span>Uses the live wind bearing the app already reads, and orients the loop so the return leg runs with the wind.</span>
      <b>Back before sunset</b><span>Caps the distance band from remaining daylight and your average speed.</span>
    </div>
  </div>

  <div class="card pad" style="margin-top:18px">
    <div class="sec" style="margin-bottom:8px">Why this route</div>
    <p class="muted" style="font-size:13px;font-weight:600;line-height:1.55">Each candidate carries a one-line reason drawn from its real scores, so the choice is explainable rather than three near-identical options: <b style="color:${T.text}">"Most cycleway (68%), 90 m less climbing, but 4 km longer."</b></p>
  </div>
</div>` + foot;

/* ===================== 7. Roadmap ===================== */
const feat = (name, why, effort, tone) => `<div class="step">
  <span class="num" style="background:${tone};">${ic('check', 13)}</span>
  <div style="flex:1"><b style="font-size:14px;display:block">${name}</b><span class="muted" style="font-size:12px;font-weight:600">${why}</span></div>
  <span class="badge ${effort === 'S' ? 'green' : effort === 'M' ? 'orange' : 'red'}" style="align-self:flex-start">${effort}</span>
</div>`;

files['Roadmap.dc.html'] = head() + `
<div style="padding:28px;background:#fff;min-height:100%">
  <div class="title">What I would build next</div>
  <div class="sub" style="max-width:820px">Ordered by how much they change daily use. <b>S</b> is under an hour, <b>M</b> a few hours, <b>L</b> a substantial build. Tell me which to take and I will start there.</div>

  <div class="card pad" style="margin-top:18px">
    <div class="sec" style="margin-bottom:6px;color:${T.red}">Fix first — the two you hit</div>
    ${feat('Laptop carousels', 'Arrows, visible scrollbar, wheel, drag, keyboard; grid above 1100px', 'S', T.red)}
    ${feat('Stable route-calculation loading', 'One anchored progress card, forward-only steps, skeleton results', 'S', T.red)}
    ${feat('Real desktop layout', 'Docked 520px panel, map fills the rest, elevation docked under the map', 'M', T.red)}
  </div>

  <div class="card pad" style="margin-top:16px">
    <div class="sec" style="margin-bottom:6px;color:${T.accent}">Route quality</div>
    ${feat('OSM-steered generation', 'Fetch cycle network first and bias anchors toward it — biggest quality lever', 'L', T.accent)}
    ${feat('Rider preferences', 'Avoid hills, quiet roads, tailwind home, paved only, back before sunset', 'M', T.accent)}
    ${feat('"Why this route"', 'One honest line per candidate from its real scores', 'S', T.accent)}
    ${feat('Route comparison', 'Put two candidates side by side — climb, surface, infrastructure', 'M', T.accent)}
  </div>

  <div class="card pad" style="margin-top:16px">
    <div class="sec" style="margin-bottom:6px;color:${T.blue}">Riding</div>
    ${feat('Offline download', 'Cache route, tiles and cues in IndexedDB for no-signal rides', 'L', T.blue)}
    ${feat('Waypoint drag-reorder', 'A/B/C list, drag to reorder, remove — planner parity with the mockup', 'S', T.blue)}
    ${feat('Friends live on the map', 'Avatars of followed riders currently recording', 'M', T.blue)}
    ${feat('Cue sheet', 'Printable turn list and a share link for group rides', 'S', T.blue)}
    ${feat('Auto night mode', 'Switch to the dark map style at sunset while navigating', 'S', T.blue)}
  </div>

  <div class="card pad" style="margin-top:16px">
    <div class="sec" style="margin-bottom:6px;color:${T.green}">Social and records</div>
    ${feat('Route ratings and ride counts', 'Stars and "ridden N times" on saved and shared routes', 'M', T.green)}
    ${feat('Rider photo carousel', 'Photos from rides on that route, on the route detail', 'M', T.green)}
    ${feat('Segments and PRs', 'Rider-drawn segments, matched on save, live timer and PR banner', 'L', T.green)}
    ${feat('Club ride from a route', 'Turn any saved route into a club event in one tap', 'S', T.green)}
  </div>
</div>` + foot;

/* ===================== canvas ===================== */
const titles = {
  Main: 'Desktop · Adventure',
  DesktopRouteDetail: 'Desktop · Route detail',
  DesktopPlanner: 'Desktop · Planner',
  LoadingStates: 'Loading — the jumping fix',
  CarouselControls: 'Laptop carousels',
  BetterRoutes: 'Better routes',
  Roadmap: 'Roadmap — pick what is next',
};
const desktops = ['Main', 'DesktopRouteDetail', 'DesktopPlanner'];
const specs = [['LoadingStates', 980, 1180], ['CarouselControls', 980, 1000], ['BetterRoutes', 980, 1180], ['Roadmap', 1000, 1460]];

const artboards = [
  ...desktops.map((n, i) => ({ file: `${n}.dc.html`, title: titles[n], x: i * 1560, y: 0, w: 1440, h: 900 })),
  ...specs.map(([n, w, h], i) => ({ file: `${n}.dc.html`, title: titles[n], x: i * 1100, y: 1120, w, h })),
];

writeFileSync('canvas.json', JSON.stringify({
  artboards,
  annotations: [
    { id: 'brief', x: 0, y: -190, w: 720, text: 'PLAN — review before I build.\nTop row: how Ridewise should look on a laptop (the app currently reuses the phone sheet).\nBottom row: the two bugs you hit (carousels you cannot scroll, loading box that jumps), how routes get better, and a roadmap to choose from.' },
    { id: 'pick', x: 3300, y: 1120, w: 300, text: 'Tell me which roadmap items to take and I will start there — the two "fix first" ones are quick.' },
  ],
  launch: { view: 'canvas' },
}, null, 2));

for (const [name, html] of Object.entries(files)) writeFileSync(name, html);
console.log('wrote', Object.keys(files).length, 'artboards + canvas.json');
