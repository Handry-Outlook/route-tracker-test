// Route-calculation progress — one anchored card, forward-only.
//
// Replaces the old floating indicator, which was centred on the map but had a
// `.compact` variant anchored to the bottom; generation called it with the
// compact flag alternating between stages, so it teleported mid-run. This
// renders inside the results area, never repositions, and a completed step
// never un-completes.

export const STEPS = [
  { id: 'places', label: 'Finding places worth riding to' },
  { id: 'connect', label: 'Connecting candidate loops' },
  { id: 'score', label: 'Scoring cycle infrastructure' },
  { id: 'enrich', label: 'Adding elevation and wind' },
];

const state = { active: false, index: -1, detail: '', host: null };

const CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 7"/></svg>';

function skeletons(n = 2) {
  return Array.from({ length: n }, () => `<div class="card skel-card">
    <div class="skel" style="width:44px;height:44px;border-radius:10px"></div>
    <div class="body">
      <div class="skel" style="height:12px;width:54%"></div>
      <div class="skel" style="height:10px;width:34%;margin-top:8px"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
        <div class="skel" style="height:34px"></div><div class="skel" style="height:34px"></div><div class="skel" style="height:34px"></div>
      </div>
      <div class="skel" style="height:48px;margin-top:10px"></div>
    </div>
  </div>`).join('');
}

function html() {
  const pct = Math.round(((state.index + 1) / STEPS.length) * 100);
  return `<div class="route-progress">
    <div class="between"><b style="font-size:13px">Building your route</b>
      <span class="muted" style="font-size:12px;font-weight:700">Step ${Math.min(STEPS.length, state.index + 1)} of ${STEPS.length}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="stage">${state.detail || STEPS[Math.max(0, state.index)]?.label || ''}</div>
    <div class="steps">${STEPS.map((s, i) => {
      const cls = i < state.index ? 'done' : i === state.index ? 'active' : '';
      return `<div class="${cls}"><span class="dot">${i < state.index ? CHECK : ''}</span>${s.label}</div>`;
    }).join('')}</div>
  </div>
  ${skeletons(2)}`;
}

function paint() {
  const host = document.querySelector('#planResults') || document.querySelector('#routeProgressHost');
  if (!host) return;
  state.host = host;
  host.innerHTML = html();
}

/** Begins a run. Steps only ever move forward from here. */
export function start(detail = '') {
  state.active = true;
  state.index = 0;
  state.detail = detail || STEPS[0].label;
  paint();
}

/** Advances to `stepId` if it is later than the current step; never back. */
export function step(stepId, detail = '') {
  if (!state.active) return;
  const i = STEPS.findIndex((s) => s.id === stepId);
  if (i < 0) return;
  if (i > state.index) state.index = i;
  state.detail = detail || STEPS[state.index].label;
  paint();
}

/** Extra context on the current step, without moving the progress bar. */
export function detail(text) {
  if (!state.active) return;
  state.detail = text;
  paint();
}

export function finish() {
  state.active = false;
  state.index = -1;
  state.detail = '';
}

export function isActive() {
  return state.active;
}
