// Shared view chrome for every screen.
//
// The rule this module exists to enforce: a view's header — and especially its
// back button — is a normal flow element at the top of the panel. It is never
// absolutely positioned over a hero image, so nothing can ever stack on top of
// it and make it unclickable (which is exactly what went wrong before).
import { APP } from '../legacy.js';
import { icon } from './icons.js';

/**
 * Header for a drill-in view: a 44px back button on the left, then the title.
 * `onBack` is wired by wireHeader() after the markup is inserted.
 */
export function viewHeader(title, subtitle, { back = true, actions = '' } = {}) {
  return `<header class="view-header">
    ${back ? `<button class="iconbtn" id="viewBack" aria-label="Back">${icon('chevL', 20)}</button>` : ''}
    <div class="view-title">
      <h1>${APP.escapeHtml(title)}</h1>
      ${subtitle ? `<p class="muted">${APP.escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="row" style="gap:6px">${actions}</div>` : ''}
  </header>`;
}

/** Root-of-tab header: no back button, but a close control on mobile. */
export function rootHeader(title, subtitle, { actions = '' } = {}) {
  return `<header class="view-header">
    <div class="view-title">
      <h1>${APP.escapeHtml(title)}</h1>
      ${subtitle ? `<p class="muted">${APP.escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${actions ? `<div class="row" style="gap:6px">${actions}</div>` : ''}
  </header>`;
}

export function wireHeader(onBack) {
  const b = APP.$('#viewBack');
  if (b && onBack) b.onclick = onBack;
}

/** A tappable search field that opens a full search view. */
export function searchField(label = 'Search routes, places, riders', id = 'openSearch') {
  return `<button class="search-field" id="${id}" type="button">${icon('search', 20)}<span>${APP.escapeHtml(label)}</span></button>`;
}

/** Sticky bottom action bar inside a sheet (primary action always reachable). */
export function actionBar(inner) {
  return `<div class="action-bar">${inner}</div>`;
}

/**
 * Mounts a Mapbox geocoder into a search view and calls back with the picked
 * place. Used by the Adventure and Plan search entry points.
 */
export function mountSearch(containerId, onPick, placeholder = 'Search for a place') {
  const host = APP.$(`#${containerId}`);
  if (!host || typeof MapboxGeocoder === 'undefined') return null;
  const pos = APP.state.pos || (APP.map?.getCenter?.() && [APP.map.getCenter().lng, APP.map.getCenter().lat]);
  const g = new MapboxGeocoder({ accessToken: APP.MAPBOX_TOKEN, mapboxgl: window.mapboxgl, marker: false, placeholder,
    proximity: Array.isArray(pos) ? { longitude: pos[0], latitude: pos[1] } : undefined });
  g.addTo(`#${containerId}`);
  g.on('result', (e) => onPick(e.result));
  setTimeout(() => host.querySelector('input')?.focus(), 60);
  return g;
}
