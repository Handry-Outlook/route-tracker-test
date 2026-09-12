// Detects where a route rides back along road it has already ridden.
//
// Adventure loops were being accepted with U-turns in them: turn into a road,
// ride to its end, come straight back. Two faults let that through. The existing
// spur check measured distance with `dist || Infinity`, so a return leg lying
// EXACTLY on the outbound leg — which is what a U-turn on the same road is —
// measured as infinitely far away and was never detected. And the acceptance
// rules allowed up to 800 m of dead end, deliberately keeping any spur that led
// to a point of interest.
//
// This measures the thing directly and in linear time. The route is projected
// to metres around its centre, resampled at a fixed spacing, and every segment
// is indexed in a spatial grid. Each sample then only looks at segments in its
// own and neighbouring cells, instead of every earlier point on the route —
// which is what made a naive version quadratic and too slow to run on every
// candidate loop.

const EARTH_RADIUS_M = 6371008.8;

function projector(coords) {
  let lng = 0, lat = 0;
  for (const [x, y] of coords) { lng += x; lat += y; }
  lng /= coords.length;
  lat /= coords.length;
  const ky = (Math.PI / 180) * EARTH_RADIUS_M;
  const kx = Math.cos((lat * Math.PI) / 180) * ky;
  return {
    to: ([x, y]) => [(x - lng) * kx, (y - lat) * ky],
    from: ([x, y]) => [x / kx + lng, y / ky + lat],
  };
}

/** Resample a projected polyline to evenly spaced points, with distance along it. */
function resample(points, spacing) {
  const out = [{ p: points[0], d: 0 }];
  let carried = 0, along = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) continue;
    let t = spacing - carried;
    while (t <= len) {
      out.push({ p: [ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len], d: along + t });
      t += spacing;
    }
    carried = len - (t - spacing);
    along += len;
  }
  const last = points[points.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1].p[0], last[1] - out[out.length - 1].p[1]) > spacing * 0.3) {
    out.push({ p: last, d: along });
  }
  return out;
}

function pointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Measures repeated road on a route.
 *
 * - backtrackM: ridden back along earlier road in the OPPOSITE direction — the
 *   U-turn case, and the one worth rejecting a loop over.
 * - overlapM: ridden again in the SAME direction.
 * - spans: each back-track, with `apex`, the [lng, lat] where the rider turns
 *   round — the point a repair should move away from.
 *
 * Road within homeZoneM of the start is ignored: leaving and returning home on
 * the same street is normal and not something a rider would call a detour.
 */
export function measureRetrace(coords, options = {}) {
  const {
    spacingM = 25,
    matchM = 22,
    homeZoneM = 400,
    // How far back along the route a match must be. Road just ridden in the
    // same direction is always nearby, so repeats need a real gap; a match in
    // the OPPOSITE direction that close is the U-turn itself, so it needs very
    // little — otherwise any spur shorter than the gap goes unseen.
    minGapSamples = 6,
    minGapOppositeSamples = 2,
    // A U-turn doubles back at close to 180°. At 135° a merely sharp corner
    // matched the road just before it and read as a back-track.
    oppositeDeg = 150,
    // A back-track whose first metres match road ridden within this distance is
    // a turn-round detour rather than a road shared with a much later stretch.
    detourGapM = 200,
    sameDeg = 45,
  } = options;

  const empty = { totalM: 0, backtrackM: 0, overlapM: 0, ratio: 0, longestBacktrackM: 0, spans: [] };
  if (!Array.isArray(coords) || coords.length < 3) return empty;

  const proj = projector(coords);
  const samples = resample(coords.map(proj.to), spacingM);
  const n = samples.length;
  if (n < minGapOppositeSamples + 3) return { ...empty, totalM: samples[n - 1]?.d || 0 };

  // Grid of segments. A cell a little larger than the match distance means a
  // sample only ever needs to inspect its own cell and the eight around it.
  const cell = matchM * 1.5;
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  const heading = new Array(n - 1);
  for (let k = 0; k < n - 1; k++) {
    const [ax, ay] = samples[k].p, [bx, by] = samples[k + 1].p;
    heading[k] = Math.atan2(by - ay, bx - ax);
    const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
    const y0 = Math.floor(Math.min(ay, by) / cell), y1 = Math.floor(Math.max(ay, by) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const id = key(cx, cy);
        let list = grid.get(id);
        if (!list) grid.set(id, (list = []));
        list.push(k);
      }
    }
  }

  const home = samples[0].p;
  const opposite = (oppositeDeg * Math.PI) / 180;
  const same = (sameDeg * Math.PI) / 180;
  const kind = new Array(n).fill(0); // 0 fresh, 1 same-direction repeat, 2 back-track
  // For a back-track: how far back along the route the matching road was.
  const gapM = new Float64Array(n);

  for (let i = 1; i < n - 1; i++) {
    const [px, py] = samples[i].p;
    if (Math.hypot(px - home[0], py - home[1]) < homeZoneM) continue;
    const here = Math.atan2(samples[i + 1].p[1] - samples[i - 1].p[1], samples[i + 1].p[0] - samples[i - 1].p[0]);
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    let found = 0;
    for (let ox = -1; ox <= 1 && found < 2; ox++) {
      for (let oy = -1; oy <= 1 && found < 2; oy++) {
        const list = grid.get(key(cx + ox, cy + oy));
        if (!list) continue;
        for (const k of list) {
          if (k >= i - minGapOppositeSamples) continue; // only road ridden earlier
          const [ax, ay] = samples[k].p, [bx, by] = samples[k + 1].p;
          if (pointToSegment(px, py, ax, ay, bx, by) > matchM) continue;
          let diff = Math.abs(here - heading[k]);
          if (diff > Math.PI) diff = 2 * Math.PI - diff;
          if (diff >= opposite) { found = 2; gapM[i] = samples[i].d - samples[k].d; break; }
          if (diff <= same && k < i - minGapSamples) found = Math.max(found, 1);
        }
      }
    }
    kind[i] = found;
  }

  let backtrackM = 0, overlapM = 0, longest = 0;
  const spans = [];
  for (let i = 1; i < n; i++) {
    const step = samples[i].d - samples[i - 1].d;
    if (kind[i] === 1) overlapM += step;
    if (kind[i] !== 2) continue;
    backtrackM += step;
    // Group consecutive back-track samples into one span.
    const last = spans[spans.length - 1];
    if (last && last.endIndex === i - 1) {
      last.endIndex = i;
      last.lengthM += step;
    } else {
      spans.push({ startIndex: i, endIndex: i, lengthM: step, startM: samples[i].d, firstGapM: gapM[i] });
    }
  }
  // A single matching sample is corner geometry, not a detour; a real U-turn
  // doubles back for at least two samples.
  for (let i = spans.length - 1; i >= 0; i--) {
    if (spans[i].endIndex === spans[i].startIndex) { backtrackM -= spans[i].lengthM; spans.splice(i, 1); }
  }
  /* Two different things ride back along a road, and only one is pointless.

     A DETOUR turns into a road and comes straight back out: the first retraced
     metres match road ridden moments before, so the gap along the route is
     tiny. That is the "turn in and U-turn three minutes later" a rider hates,
     and even a short one is a waste.

     A SHARED stretch is the same road used again much later — the only bridge
     over a river, or one main road out and home. The gap is kilometres. In a
     town it is often unavoidable and not a detour at all. */
  let longestDetour = 0, sharedM = 0;
  for (const s of spans) {
    longest = Math.max(longest, s.lengthM);
    // The rider turns round just before retracing starts.
    s.apex = proj.from(samples[Math.max(0, s.startIndex - 1)].p);
    s.detour = s.firstGapM <= detourGapM;
    if (s.detour) longestDetour = Math.max(longestDetour, s.lengthM);
    else sharedM += s.lengthM;
  }
  const totalM = samples[n - 1].d;
  return {
    totalM,
    backtrackM,
    overlapM,
    ratio: totalM > 0 ? (backtrackM + overlapM) / totalM : 0,
    longestBacktrackM: longest,
    longestDetourM: longestDetour,
    sharedBacktrackM: sharedM,
    sharedRatio: totalM > 0 ? sharedM / totalM : 0,
    spans: spans.map(({ startM, lengthM, apex, detour }) => ({ startM, lengthM, apex, detour })),
  };
}

/** Longest U-turn detour a generated loop may contain. */
export const MAX_DETOUR_M = 100;
/** Most of a loop that may be ridden back along a road used much earlier. */
export const MAX_SHARED_RATIO = 0.12;
/** Kept for callers measuring back-tracking in general. */
export const MAX_BACKTRACK_M = 150;

/** Whether a generated loop is worth offering: no detours, little shared road. */
export function isCleanLoop(measure) {
  return !!measure && measure.longestDetourM <= MAX_DETOUR_M && measure.sharedRatio <= MAX_SHARED_RATIO;
}
