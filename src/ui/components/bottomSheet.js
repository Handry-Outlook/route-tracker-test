// A Google-Maps/Komoot-style bottom sheet for #panel on mobile.
//
// Four snap states: 'closed' (grip only — used during turn-by-turn so the
// guidance banner and live dashboard own the screen), 'peek' (a strip of
// content, map dominant), 'half' and 'full'. The map is never fully covered.
//
// On desktop the controller is inert: #panel keeps its docked-card behaviour,
// driven entirely by CSS, so page markup never needs to know the breakpoint.
//
// Two things here are load-bearing and easy to regress:
//
//  1. The grip is #sheet-grip in index.html, a SIBLING of #panel — not a child.
//     Every page renders with `panel.innerHTML = ...`, which wipes anything the
//     controller injects into the panel. A handle prepended into #panel exists
//     until the first page render and is then gone for the rest of the session,
//     which left the phone with no way to resize or dismiss the sheet.
//
//  2. All drag maths measures against #map-wrap, the panel's offsetParent —
//     never window.innerHeight. #map-wrap already excludes the bottom nav bar,
//     so mixing the two makes the released sheet snap to the wrong state and
//     puts 'full' out of reach.
const SNAP = { closed: 0.06, peek: 0.17, half: 0.5, full: 0.92 };
const ORDER = ['closed', 'peek', 'half', 'full'];
const FLING_PX_PER_MS = 0.45;
const DRAG_SLOP_PX = 4;

export function createBottomSheet(panel, { mobile }) {
  let state = 'half';
  const grip = document.getElementById('sheet-grip');
  const container = () => panel.offsetParent || panel.parentElement;

  const containerHeight = () => container()?.getBoundingClientRect().height || innerHeight;
  const pxFor = (fraction) => Math.round(containerHeight() * fraction);

  /* Publish the live height in px as well as the state, so floating map chrome
     can sit exactly above the sheet edge rather than guessing off a percentage. */
  function publish(px, animate) {
    const host = container();
    panel.style.transition = animate ? '' : 'none';
    const value = `${Math.round(px)}px`;
    panel.style.setProperty('--sheet-height', value);
    if (host) {
      host.style.setProperty('--sheet-height', value);
      host.style.setProperty('--sheet-anim', animate ? '.3s cubic-bezier(.2,.8,.2,1)' : '0s');
    }
  }

  function setState(next, { animate = true } = {}) {
    if (!SNAP[next]) next = 'half';
    state = next;
    panel.dataset.sheetState = state;
    document.body.dataset.sheet = state;
    if (grip) grip.setAttribute('aria-valuenow', String(ORDER.indexOf(state)));
    if (mobile()) publish(pxFor(SNAP[state]), animate);
    else {
      panel.style.removeProperty('--sheet-height');
      container()?.style.removeProperty('--sheet-height');
    }
  }

  /* ------------------------------- dragging ------------------------------ */
  let dragging = false;
  let armed = null;      // a gesture that may become a drag once it passes slop
  let startY = 0;
  let startPx = 0;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = 0;

  function begin(clientY) {
    dragging = true;
    startY = lastY = clientY;
    lastT = performance.now();
    velocity = 0;
    moved = 0;
    startPx = panel.getBoundingClientRect().height;
    panel.style.transition = 'none';
    document.body.classList.add('sheet-dragging');
  }

  function move(clientY) {
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    velocity = (clientY - lastY) / dt;
    lastY = clientY;
    lastT = now;
    moved = Math.max(moved, Math.abs(clientY - startY));
    const max = pxFor(0.94);
    const min = pxFor(SNAP.closed);
    publish(Math.max(min, Math.min(max, startPx - (clientY - startY))), false);
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('sheet-dragging');
    const fraction = panel.getBoundingClientRect().height / containerHeight();

    // A decisive flick goes one stop in that direction — including all the way
    // down to 'closed', so the sheet can always be swiped out of the way.
    let next;
    if (velocity > FLING_PX_PER_MS || velocity < -FLING_PX_PER_MS) {
      const dir = velocity > 0 ? -1 : 1;
      const from = ORDER.reduce((best, key) => (
        Math.abs(SNAP[key] - fraction) < Math.abs(SNAP[best] - fraction) ? key : best
      ), 'half');
      next = ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(from) + dir))];
    } else {
      next = ORDER.reduce((best, key) => (
        Math.abs(SNAP[key] - fraction) < Math.abs(SNAP[best] - fraction) ? key : best
      ), 'half');
    }
    setState(next);
  }

  if (grip) {
    grip.addEventListener('pointerdown', (e) => {
      if (!mobile()) return;
      e.preventDefault();
      grip.setPointerCapture?.(e.pointerId);
      begin(e.clientY);
    });
    // Tapping the grip cycles half <-> full, the way Maps' sheet header does.
    grip.addEventListener('click', () => {
      if (!mobile() || moved > DRAG_SLOP_PX) return;
      setState(state === 'full' ? 'half' : 'full');
    });
    grip.addEventListener('keydown', (e) => {
      const i = ORDER.indexOf(state);
      if (e.key === 'ArrowUp') { e.preventDefault(); setState(ORDER[Math.min(ORDER.length - 1, i + 1)]); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setState(ORDER[Math.max(0, i - 1)]); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState(state === 'full' ? 'half' : 'full'); }
    });
  }

  /* Pulling down on the content itself collapses the sheet, but only when the
     content is already scrolled to the top — otherwise it is an ordinary scroll
     and must be left alone. This is the gesture riders reach for first. */
  panel.addEventListener('pointerdown', (e) => {
    if (!mobile() || dragging) return;
    if (e.target.closest('input, textarea, select, .mapboxgl-ctrl-geocoder')) return;
    armed = { y: e.clientY, x: e.clientX, atTop: panel.scrollTop <= 0, id: e.pointerId };
  }, { passive: true });

  panel.addEventListener('pointermove', (e) => {
    if (!armed || dragging) return;
    const dy = e.clientY - armed.y;
    const dx = e.clientX - armed.x;
    // Only a clearly vertical pull counts, so panning a horizontal card deck
    // inside the sheet never collapses it.
    if (Math.abs(dx) > Math.abs(dy)) { armed = null; return; }
    // Pulling DOWN from the top of the content collapses the sheet. Dragging up
    // is deliberately left to the grip: the content is the scroll container, so
    // taking the gesture over here would fight the browser's own scrolling.
    if (dy <= DRAG_SLOP_PX || !armed.atTop) { if (Math.abs(dy) > DRAG_SLOP_PX) armed = null; return; }
    armed = null;
    begin(e.clientY - dy); // treat the gesture as having started where it did
    move(e.clientY);
  }, { passive: true });

  addEventListener('pointermove', (e) => { if (dragging) move(e.clientY); }, { passive: true });
  addEventListener('pointerup', () => { armed = null; end(); });
  addEventListener('pointercancel', () => { armed = null; end(); });

  addEventListener('resize', () => setState(state, { animate: false }));
  matchMedia('(orientation: portrait)').addEventListener?.('change', () => setState(state, { animate: false }));

  setState('half', { animate: false });

  return { setState, getState: () => state };
}
