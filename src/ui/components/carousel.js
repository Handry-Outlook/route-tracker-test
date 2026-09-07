// Makes horizontal decks usable with a mouse.
//
// The decks were built for touch: `.hscroll` hid the scrollbar, so on a laptop
// there was no affordance and often no way to scroll at all. This adds arrows,
// wheel-to-scroll, drag-to-pan, keyboard control and a position counter — and
// only on pointer devices, so touch keeps its native swipe.

const CARD_GAP = 12;

function cardStep(track) {
  const first = track.querySelector(':scope > *');
  return first ? first.getBoundingClientRect().width + CARD_GAP : track.clientWidth * 0.8;
}

function updateControls(track, prev, next, counter) {
  const max = track.scrollWidth - track.clientWidth;
  // A deck that fits (or has become a grid on a wide screen) gets no arrows.
  track.parentNode?.classList?.toggle('no-scroll', max <= 2);
  const atStart = track.scrollLeft <= 2;
  const atEnd = track.scrollLeft >= max - 2;
  if (prev) prev.disabled = atStart;
  if (next) next.disabled = atEnd;
  if (counter) {
    if (max <= 2) { counter.textContent = ''; return; }
    const step = cardStep(track);
    const total = track.children.length;
    const index = Math.min(total, Math.round(track.scrollLeft / Math.max(1, step)) + 1);
    counter.textContent = total > 1 ? `${index} / ${total}` : '';
  }
}

/**
 * Enhances one scroll container. Safe to call repeatedly — a track is only
 * wired once. Returns without doing anything on touch-only devices.
 */
export function enhanceCarousel(track, { counter } = {}) {
  if (!track || track.dataset.carousel === 'on') return;
  const pointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  track.dataset.carousel = 'on';
  track.tabIndex = 0;

  if (!pointer) return; // touch already has a natural swipe

  const wrap = document.createElement('div');
  wrap.className = 'carousel-wrap';
  track.parentNode.insertBefore(wrap, track);
  wrap.appendChild(track);

  const mk = (dir, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `carousel-arrow ${dir}`;
    b.setAttribute('aria-label', label);
    b.innerHTML = dir === 'prev'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
    wrap.appendChild(b);
    return b;
  };
  const prev = mk('prev', 'Scroll left');
  const next = mk('next', 'Scroll right');

  const by = (dir) => track.scrollBy({ left: dir * cardStep(track), behavior: 'smooth' });
  prev.onclick = () => by(-1);
  next.onclick = () => by(1);

  // A vertical wheel over a deck scrolls it horizontally.
  track.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = track.scrollWidth - track.clientWidth;
    if (max <= 0) return;
    const atStart = track.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = track.scrollLeft >= max && e.deltaY > 0;
    if (atStart || atEnd) return; // let the page scroll at the ends
    e.preventDefault();
    track.scrollLeft += e.deltaY;
  }, { passive: false });

  // Click-and-drag to pan.
  let down = false, startX = 0, startLeft = 0, moved = 0;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true; moved = 0;
    startX = e.clientX; startLeft = track.scrollLeft;
    track.classList.add('dragging');
  });
  addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    track.scrollLeft = startLeft - dx;
  });
  addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    track.classList.remove('dragging');
    // Swallow the click that ends a real drag, so panning never opens a card.
    if (moved > 6) {
      const kill = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      track.addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => track.removeEventListener('click', kill, { capture: true }), 0);
    }
  });

  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); by(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); by(-1); }
    else if (e.key === 'Home') { e.preventDefault(); track.scrollTo({ left: 0, behavior: 'smooth' }); }
    else if (e.key === 'End') { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' }); }
  });

  const sync = () => updateControls(track, prev, next, counter);
  track.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  requestAnimationFrame(sync);
}

/** Enhances every `.hscroll` inside a container that isn't wired yet. */
export function enhanceAll(root) {
  (root || document).querySelectorAll('.hscroll').forEach((track) => {
    const counter = track.closest('section')?.querySelector('[data-carousel-count]')
      || track.parentElement?.querySelector?.('[data-carousel-count]')
      || track.previousElementSibling?.querySelector?.('[data-carousel-count]');
    enhanceCarousel(track, { counter });
  });
}
