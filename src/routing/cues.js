// Cue sheet — roadmap item 11.
//
// Turns a route's Mapbox Directions steps into a printable turn list with
// cumulative distances, the thing riders tape to the stem or hand round before
// a group ride. Also the text form used for sharing and for offline riding.

const ARROW = (m = {}) => {
  const mod = (m.modifier || '').toLowerCase();
  const type = (m.type || '').toLowerCase();
  if (type === 'roundabout' || type === 'rotary') return '↻';
  if (type === 'arrive') return '◉';
  if (type === 'depart') return '▲';
  if (mod.includes('uturn')) return '↩';
  if (mod.includes('sharp left')) return '↰';
  if (mod.includes('sharp right')) return '↱';
  if (mod.includes('slight left')) return '↖';
  if (mod.includes('slight right')) return '↗';
  if (mod.includes('left')) return '←';
  if (mod.includes('right')) return '→';
  return '↑';
};

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

/**
 * Builds the cue list. Consecutive "continue" steps on the same road are
 * merged so the sheet stays short enough to actually read on a bike.
 */
export function buildCues(route) {
  const steps = (route?.legs || []).flatMap((l) => l.steps || []);
  if (!steps.length) return [];
  const cues = [];
  let cumulative = 0;
  for (const step of steps) {
    const m = step.maneuver || {};
    const type = (m.type || '').toLowerCase();
    const road = step.name || step.ref || '';
    const isContinue = type === 'continue' || (!m.modifier && type !== 'arrive' && type !== 'depart');
    const prev = cues[cues.length - 1];
    if (isContinue && prev && prev.road === road && prev.type !== 'arrive') {
      prev.distance += step.distance || 0;
      cumulative += step.distance || 0;
      continue;
    }
    cues.push({
      at: cumulative,
      distance: step.distance || 0,
      road,
      type,
      arrow: ARROW(m),
      instruction: m.instruction || (road ? `Continue on ${road}` : 'Continue'),
    });
    cumulative += step.distance || 0;
  }
  return cues.map((c) => ({ ...c, atLabel: fmtDist(c.at), forLabel: fmtDist(c.distance) }));
}

/** Plain-text cue sheet, for sharing or printing without the app. */
export function cuesToText(route, cues) {
  const km = ((route?.distance || 0) / 1000).toFixed(1);
  const title = route?.savedName || route?.name || 'Ridewise route';
  const lines = [`${title} — ${km} km`, ''];
  cues.forEach((c, i) => {
    lines.push(`${String(i + 1).padStart(3, ' ')}. ${c.atLabel.padStart(8, ' ')}  ${c.arrow}  ${c.instruction}${c.road && !c.instruction.includes(c.road) ? ` (${c.road})` : ''}`);
  });
  lines.push('', 'Planned with Ridewise');
  return lines.join('\n');
}

/** Opens the browser print dialog with a clean, ink-light cue sheet. */
export function printCues(route, cues) {
  const km = ((route?.distance || 0) / 1000).toFixed(1);
  const climb = Number.isFinite(route?.ascent) ? `${Math.round(route.ascent)} m climbing` : '';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rows = cues.map((c, i) => `<tr>
      <td class="n">${i + 1}</td>
      <td class="at">${esc(c.atLabel)}</td>
      <td class="ar">${esc(c.arrow)}</td>
      <td>${esc(c.instruction)}</td>
      <td class="for">${esc(c.forLabel)}</td>
    </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(route?.savedName || route?.name || 'Cue sheet')}</title>
    <style>
      body { font: 12pt/1.4 -apple-system, system-ui, sans-serif; margin: 18mm 14mm; color: #111; }
      h1 { font-size: 18pt; margin: 0 0 2mm; }
      .meta { color: #555; font-size: 11pt; margin-bottom: 6mm; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 2.2mm 2mm; border-bottom: 0.3pt solid #bbb; vertical-align: top; }
      .n { width: 9mm; color: #777; }
      .at { width: 20mm; font-variant-numeric: tabular-nums; }
      .ar { width: 9mm; font-size: 14pt; }
      .for { width: 20mm; text-align: right; color: #555; font-variant-numeric: tabular-nums; }
      tr { break-inside: avoid; }
      @page { margin: 14mm; }
    </style></head><body>
    <h1>${esc(route?.savedName || route?.name || 'Ridewise route')}</h1>
    <div class="meta">${km} km${climb ? ` · ${climb}` : ''} · ${cues.length} cues · planned with Ridewise</div>
    <table><tbody>${rows}</tbody></table>
    <script>window.onload = () => setTimeout(() => window.print(), 250);<\/script>
    </body></html>`;
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
