// A Google-Maps/Komoot-style bottom sheet for #panel on mobile.
//
// Three snap states: 'peek' (just a title/CTA, map stays dominant),
// 'half' (results/summary, map still visible above), 'full' (dense
// content, but never the entire viewport — a drag handle and a sliver
// of map stay visible so the sheet never fully swallows the map).
//
// On desktop the controller is a no-op: #panel keeps its existing
// floating-card behavior, driven entirely by CSS (see styles.css),
// so page markup does not need to know which breakpoint it's in.

// 'closed' is used during active turn-by-turn navigation: just the drag
// handle showing, so the live-ride dashboard and map controls own the
// screen. The sheet's height is also published as --sheet-height on its
// container (#map-wrap) so the floating map controls (locate/share/
// weather/audio, quick-nav CTA) can position themselves ABOVE the
// sheet's top edge instead of being hidden behind it.
const SNAP_HEIGHTS = { closed: 0.07, peek: 0.16, half: 0.5, full: 0.92 };
const VELOCITY_FLING_PX_PER_MS = 0.5;

export function createBottomSheet(panel, { mobile }) {
  let state = 'half';
  let handle = panel.querySelector('.sheet-handle');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'sheet-handle';
    handle.setAttribute('aria-hidden', 'true');
    panel.prepend(handle);
  }

  let dragStartY = null;
  let dragStartHeight = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;

  // #panel's containing block for height purposes is #map-wrap (its
  // position:relative ancestor), which is already clipped above the
  // bottom nav bar — NOT the full window — so drag math must measure
  // against that, not window.innerHeight.
  function containerHeightPx() {
    return (panel.offsetParent || panel.parentElement).getBoundingClientRect().height;
  }

  function heightPxFor(fraction) {
    return Math.round(containerHeightPx() * fraction);
  }

  function applyHeight(value, animate) {
    panel.style.transition = animate ? '' : 'none';
    const container = panel.offsetParent || panel.parentElement;
    if (container) container.style.setProperty('--sheet-height', value);
    panel.style.setProperty('--sheet-height', value);
  }

  function setState(next, { animate = true } = {}) {
    if (!SNAP_HEIGHTS[next]) next = 'half';
    state = next;
    panel.dataset.sheetState = state;
    if (mobile()) applyHeight(`${SNAP_HEIGHTS[state] * 100}%`, animate);
  }

  function onPointerDown(e) {
    if (!mobile()) return;
    dragStartY = e.clientY;
    lastY = e.clientY;
    lastT = performance.now();
    velocity = 0;
    dragStartHeight = panel.getBoundingClientRect().height;
    panel.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  }

  function onPointerMove(e) {
    if (dragStartY === null) return;
    const dy = e.clientY - dragStartY;
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = (e.clientY - lastY) / dt;
    lastY = e.clientY;
    lastT = now;
    const nextHeight = Math.max(
      heightPxFor(SNAP_HEIGHTS.closed),
      Math.min(heightPxFor(0.97), dragStartHeight - dy)
    );
    applyHeight(`${nextHeight}px`, false);
  }

  function onPointerUp() {
    if (dragStartY === null) return;
    dragStartY = null;
    const currentPx = panel.getBoundingClientRect().height;
    const currentFraction = currentPx / innerHeight;
    let next;
    if (velocity > VELOCITY_FLING_PX_PER_MS) next = currentFraction > SNAP_HEIGHTS.half ? 'half' : 'peek';
    else if (velocity < -VELOCITY_FLING_PX_PER_MS) next = currentFraction < SNAP_HEIGHTS.half ? 'half' : 'full';
    else {
      const distances = Object.entries(SNAP_HEIGHTS).map(([key, f]) => [key, Math.abs(f - currentFraction)]);
      distances.sort((a, b) => a[1] - b[1]);
      next = distances[0][0];
    }
    setState(next);
  }

  handle.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);

  addEventListener('resize', () => setState(state, { animate: false }));

  setState('half', { animate: false });

  return { setState, getState: () => state };
}
