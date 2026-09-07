// Profile — the activity feed and the rider's own profile, from the mockup's
// Feed, Comments and Profile artboards. The feed, follow graph, kudos and
// comments are live Firestore; profile totals and badges are computed from
// the rider's real saved activities.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { rootHeader } from '../shell.js';
import { routeThumb, staticRouteImage, fmtKm, fmtM } from '../graphics.js';
import { listFollowingUids, listFollowerUids, followUser, unfollowUser, isFollowing } from '../../social/follows.js';
import { fetchFeed, toggleKudos, hasGivenKudos, addComment, listComments } from '../../social/activities.js';
import { searchProfilesByName, updateRiderMeasurements } from '../../social/firestoreClient.js';
import { ridingNowCount } from '../../social/discover.js';

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'R';
const avatarColor = (uid = '') => ['#8b5bd6', '#00a6a6', '#176bdb', '#f28b30', '#139b66'][[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];

function relTime(ms) {
  const diff = Date.now() - (ms || 0);
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function coordsOf(a) {
  try {
    const g = typeof a.routeSummaryGeoJson === 'string' ? JSON.parse(a.routeSummaryGeoJson) : a.routeSummaryGeoJson;
    return g?.coordinates?.length >= 2 ? g.coordinates : null;
  } catch { return null; }
}

function view() {
  const S = APP.state;
  if (!S.profileView) S.profileView = 'feed';
  return S;
}

function shellHtml(inner, activeView) {
  return `<div class="page">
    ${rootHeader(activeView === 'feed' ? 'Feed' : 'Profile', activeView === 'feed' ? 'Rides from riders you follow' : 'Your account, stats and settings')}
    <div class="segmented" id="profileTabs">
      <button data-view="feed" class="${activeView === 'feed' ? 'on' : ''}">Feed</button>
      <button data-view="you" class="${activeView === 'you' ? 'on' : ''}">You</button>
    </div>
    <div id="profileBody" class="page">${inner}</div>
  </div>`;
}

/* --------------------------------- feed --------------------------------- */

function feedCardHtml(a, given) {
  const coords = coordsOf(a);
  const img = coords ? staticRouteImage(coords, APP.MAPBOX_TOKEN, { w: 640, h: 280 }) : null;
  return `<article class="card feed-card" data-feed="${APP.escapeHtml(a.id)}">
    <div class="feed-head row">
      <span class="avatar" style="background:${avatarColor(a.ownerId)}">${a.ownerPhotoURL ? `<img src="${APP.escapeHtml(a.ownerPhotoURL)}" alt="">` : initials(a.ownerDisplayName)}</span>
      <div style="flex:1"><b style="font-size:14px;display:block">${APP.escapeHtml(a.ownerDisplayName || 'Rider')}</b><span class="muted" style="font-size:12px;font-weight:600">${relTime(a.startedAt)}</span></div>
    </div>
    <div class="feed-title">${APP.escapeHtml(a.title || 'Cycling activity')}</div>
    <div class="feed-media">${img ? `<img src="${img}" alt="" loading="lazy">` : routeThumb(coords, 358, 140, { radius: 0 })}</div>
    <div class="feed-stats stats three">
      <div class="stat"><b>${fmtKm(a.distanceKm)}</b><small>distance</small></div>
      <div class="stat"><b>${fmtM(a.elevationGainM)}</b><small>elevation</small></div>
      <div class="stat"><b>${(a.avgSpeedKmh || 0).toFixed(1)}</b><small>avg km/h</small></div>
    </div>
    <div class="feed-actions">
      <button data-kudos="${APP.escapeHtml(a.id)}" class="${given ? 'on' : ''}" aria-pressed="${given}">${icon('heart', 18)}<span>${a.kudosCount || 0}</span></button>
      <button data-comments="${APP.escapeHtml(a.id)}">${icon('bubble', 18)}<span>${a.commentCount || 0}</span></button>
      <span style="margin-left:auto" class="muted">${icon('share', 18)}</span>
    </div>
    <div class="comment-thread" id="thread-${APP.escapeHtml(a.id)}" hidden style="padding:0 14px 12px"></div>
  </article>`;
}

async function feedHtml() {
  const S = view();
  if (!S.user) {
    return `<div class="card account-required"><h2>Sign in to see your feed</h2><p>Follow other riders to see their routes and rides, give kudos and leave comments.</p><button class="btn primary" id="feedSignIn">Sign in</button></div>`;
  }
  const uids = await listFollowingUids(S.user.uid).catch(() => []);
  const activities = uids.length ? await fetchFeed(uids).catch(() => []) : [];
  const given = await Promise.all(activities.map((a) => hasGivenKudos(a.id, S.user.uid).catch(() => false)));
  const ridingNow = await ridingNowCount(uids).catch(() => 0);
  return `
    ${ridingNow ? `<div class="row" style="justify-content:flex-end"><span class="badge green" style="min-height:30px">${icon('record', 12)}${ridingNow} riding now</span></div>` : ''}
    <div class="card pad flat">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Find riders</span></div>
      <div class="location-row"><input id="findPeople" type="search" placeholder="Search by name" autocomplete="off"><button class="iconbtn" id="findPeopleGo">${icon('search', 20)}</button></div>
      <div id="peopleResults"></div>
    </div>
    ${activities.length
      ? activities.map((a, i) => feedCardHtml(a, given[i])).join('')
      : `<div class="empty">${uids.length ? 'No rides yet from the riders you follow.' : 'Follow some riders above and their rides appear here.'}</div>`}`;
}

function wireFeed() {
  const S = view();
  const { $, panel } = APP;
  const signIn = $('#feedSignIn');
  if (signIn) { signIn.onclick = () => { S.profileView = 'you'; render(); }; return; }

  const runSearch = async () => {
    const q = $('#findPeople').value.trim();
    const box = $('#peopleResults');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600;padding:8px 0">Searching…</p>';
    const people = (await searchProfilesByName(q).catch(() => [])).filter((p) => p.uid !== S.user.uid);
    if (!people.length) { box.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600;padding:8px 0">No riders found.</p>'; return; }
    const flags = await Promise.all(people.map((p) => isFollowing(S.user.uid, p.uid).catch(() => false)));
    box.innerHTML = people.map((p, i) => `<div class="item">
      <span class="row"><span class="avatar sm" style="background:${avatarColor(p.uid)}">${initials(p.displayName)}</span>${APP.escapeHtml(p.displayName || 'Rider')}</span>
      <button class="btn ${flags[i] ? 'light' : 'primary'} sm" data-follow="${APP.escapeHtml(p.uid)}" data-on="${flags[i] ? '1' : '0'}">${flags[i] ? 'Following' : 'Follow'}</button>
    </div>`).join('');
    box.querySelectorAll('[data-follow]').forEach((b) => {
      b.onclick = async () => {
        const uid = b.dataset.follow;
        const on = b.dataset.on === '1';
        b.disabled = true;
        try {
          if (on) await unfollowUser(S.user.uid, uid); else await followUser(S.user.uid, uid);
          b.dataset.on = on ? '0' : '1';
          b.textContent = on ? 'Follow' : 'Following';
          b.className = `btn ${on ? 'primary' : 'light'} sm`;
          APP.toast(on ? 'Unfollowed' : 'Now following');
        } catch (e) { console.warn('Follow failed', e); APP.toast('Could not update follow'); }
        finally { b.disabled = false; }
      };
    });
  };
  const go = $('#findPeopleGo'); if (go) go.onclick = runSearch;
  const box = $('#findPeople'); if (box) box.onkeydown = (e) => { if (e.key === 'Enter') runSearch(); };

  panel.querySelectorAll('[data-kudos]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.kudos;
      const on = b.getAttribute('aria-pressed') === 'true';
      const count = b.querySelector('span');
      b.disabled = true;
      try {
        await toggleKudos(id, S.user.uid, on);
        b.setAttribute('aria-pressed', String(!on));
        b.classList.toggle('on', !on);
        count.textContent = String(Math.max(0, (+count.textContent || 0) + (on ? -1 : 1)));
      } catch (e) { console.warn('Kudos failed', e); APP.toast('Could not update kudos'); }
      finally { b.disabled = false; }
    };
  });

  panel.querySelectorAll('[data-comments]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.comments;
      const box = APP.$(`#thread-${CSS.escape(id)}`) || document.getElementById(`thread-${id}`);
      if (!box) return;
      if (!box.hidden) { box.hidden = true; return; }
      box.hidden = false;
      await loadThread(box, id);
    };
  });
}

async function loadThread(box, id) {
  const S = APP.state;
  box.innerHTML = '<p class="muted" style="font-size:12px;font-weight:600">Loading comments…</p>';
  const comments = await listComments(id).catch(() => []);
  box.innerHTML = `
    ${comments.length ? comments.map((c) => `<div class="comment-row" style="margin-bottom:10px">
      <span class="avatar sm" style="background:${avatarColor(c.authorUid)}">${initials(c.authorDisplayName)}</span>
      <div style="flex:1"><div class="row" style="gap:6px"><b style="font-size:13px">${APP.escapeHtml(c.authorDisplayName || 'Rider')}</b></div>
      <div class="comment-bubble">${APP.escapeHtml(c.text || '')}</div></div>
    </div>`).join('') : '<p class="muted" style="font-size:12px;font-weight:600">No comments yet.</p>'}
    <div class="comment-compose">
      <span class="avatar sm" style="background:${avatarColor(S.user?.uid || '')}">${initials(S.user?.displayName || S.user?.email || 'You')}</span>
      <input type="text" placeholder="Add a comment" autocomplete="off">
      <button class="iconbtn round" style="background:var(--blue);color:#fff;border:0">${icon('send', 18)}</button>
    </div>`;
  const input = box.querySelector('.comment-compose input');
  const send = box.querySelector('.comment-compose button');
  send.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    send.disabled = true;
    try { await addComment(id, S.user, text); await loadThread(box, id); }
    catch (e) { console.warn('Comment failed', e); APP.toast('Could not post comment'); send.disabled = false; }
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') send.onclick(); };
}

/* --------------------------------- you --------------------------------- */

function lifetimeTotals(activities) {
  return activities.reduce((t, a) => ({
    km: t.km + (a.distance || 0),
    m: t.m + (a.gain || 0),
    rides: t.rides + 1,
  }), { km: 0, m: 0, rides: 0 });
}

/* Badges are only awarded from the rider's real saved activities. */
function badgesFor(activities) {
  const t = lifetimeTotals(activities);
  const longest = Math.max(0, ...activities.map((a) => a.distance || 0));
  const climb = Math.max(0, ...activities.map((a) => a.gain || 0));
  return [
    { icon: 'flag', label: 'First ride', got: t.rides >= 1, tone: 'var(--green)' },
    { icon: 'route', label: '10 rides', got: t.rides >= 10, tone: 'var(--blue)' },
    { icon: 'bolt', label: '50 km ride', got: longest >= 50, tone: 'var(--gold)' },
    { icon: 'trophy', label: '100 km ride', got: longest >= 100, tone: 'var(--accent)' },
    { icon: 'mtn', label: '1,000 m climb', got: climb >= 1000, tone: '#8b5bd6' },
    { icon: 'crown', label: '1,000 km total', got: t.km >= 1000, tone: 'var(--red)' },
  ];
}

function themeChips() {
  const cur = localStorage.getItem('theme') || 'system';
  return ['system', 'light', 'dark'].map((t) => `<button class="chip ${cur === t ? 'on' : ''}" data-theme="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('');
}

function signedOutHtml() {
  const standalone = APP.isStandalone();
  return `<div class="card pad flat">
      <h2>Sign in</h2>
      ${standalone ? '<p class="muted" style="font-size:12px;font-weight:600;margin-top:6px">Home Screen app detected. Email sign-in is the most reliable here.</p>' : ''}
      <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="name@example.com"></div>
      <div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></div>
      <div class="actions"><button class="btn primary" id="emailLogin">Sign in</button><button class="btn light" id="emailCreate">Create account</button><button class="btn light" id="emailReset">Reset password</button></div>
    </div>
    <div class="card pad flat"><h3>Google account</h3><p class="muted" style="font-size:12px;font-weight:600;margin:6px 0 10px">Opens a popup; no redirect sign-in is used.</p><button class="btn light block" id="googleLogin">Continue with Google</button></div>`;
}

async function youHtml() {
  const S = view();
  if (!S.user) return signedOutHtml();
  const activities = S.accountActivities || [];
  const t = lifetimeTotals(activities);
  const p = APP.profileData();
  const [followers, following] = await Promise.all([
    listFollowerUids(S.user.uid).catch(() => []),
    listFollowingUids(S.user.uid).catch(() => []),
  ]);
  const name = S.user.displayName || S.user.email?.split('@')[0] || 'Rider';
  return `
    <div style="text-align:center">
      <span class="avatar lg" style="background:linear-gradient(135deg,var(--accent),var(--blue))">${initials(name)}</span>
      <h2 style="margin-top:10px">${APP.escapeHtml(name)}</h2>
      <p class="muted" style="font-size:13px;font-weight:600">${APP.escapeHtml(S.user.email || '')}</p>
    </div>
    <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
      <div class="stat tile"><b>${followers.length}</b><small>followers</small></div>
      <div class="stat tile"><b>${following.length}</b><small>following</small></div>
    </div>
    <div class="card pad flat stats three">
      <div class="stat"><b style="color:var(--blue)">${fmtKm(t.km)}</b><small>total distance</small></div>
      <div class="stat"><b style="color:var(--blue)">${fmtM(t.m)}</b><small>total climbed</small></div>
      <div class="stat"><b style="color:var(--blue)">${t.rides}</b><small>rides</small></div>
    </div>
    <section>
      <div class="between" style="margin-bottom:10px"><span class="section-title">Badges</span><span class="muted" style="font-size:12px;font-weight:700">${badgesFor(activities).filter((b) => b.got).length} earned</span></div>
      <div class="badge-grid">${badgesFor(activities).map((b) => `<div class="badge-tile ${b.got ? '' : 'locked'}"><span class="ico" style="background:color-mix(in srgb, ${b.tone} 16%, transparent);color:${b.tone}">${icon(b.icon, 22)}</span><b>${b.label}</b></div>`).join('')}</div>
    </section>
    <div class="card pad flat between"><div><b style="font-size:14px;display:block">Weather</b><span class="muted" style="font-size:12px;font-weight:600">Conditions, wind and forecast</span></div><button class="btn light sm" id="openWeather">Open</button></div>
    <section class="card pad flat">
      <h3>Rider profile</h3>
      <p class="muted" style="font-size:12px;font-weight:600;margin-top:4px">Used for estimated power and effort.</p>
      <div class="field"><label>Weight (kg)</label><input id="profileWeight" type="number" min="30" max="250" value="${p.weight}"></div>
      <div class="field"><label>Height (cm)</label><input id="profileHeight" type="number" min="120" max="230" value="${p.height}"></div>
      <div class="field"><label>Bike + kit (kg)</label><input id="bikeWeight" type="number" min="5" max="40" value="${p.bikeWeight}"></div>
      <button class="btn primary block" id="saveProfile">Save rider profile</button>
    </section>
    <section class="card pad flat">
      <h3>Appearance</h3>
      <div class="row" id="themeChips" style="gap:8px;margin-top:10px">${themeChips()}</div>
    </section>
    <button class="btn light block" id="logout">Log out</button>`;
}

function wireYou() {
  const S = view();
  const { $ } = APP;
  const on = (sel, handler) => { const el = $(sel); if (el) el.onclick = handler; };
  if ($('#emailLogin')) {
    on('#emailLogin', () => APP.emailAction('login'));
    on('#emailCreate', () => APP.emailAction('create'));
    on('#emailReset', () => APP.emailAction('reset'));
    on('#googleLogin', () => S.loginGoogle?.().catch(APP.showAuthError));
    return;
  }
  on('#openWeather', () => APP.open('weather'));
  on('#logout', () => S.logout?.());
  on('#saveProfile', () => {
    const weight = $('#profileWeight').value, height = $('#profileHeight').value, bike = $('#bikeWeight').value;
    localStorage.setItem('profileWeight', weight);
    localStorage.setItem('profileHeight', height);
    localStorage.setItem('bikeWeight', bike);
    updateRiderMeasurements(S.user.uid, { weightKg: +weight, heightCm: +height, bikeWeightKg: +bike })
      .catch((e) => console.warn('Measurement sync failed', e));
    APP.toast('Rider profile saved');
  });
  on('#themeChips', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    const t = b.dataset.theme;
    localStorage.setItem('theme', t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $('#themeChips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  });
}

/* -------------------------------- render -------------------------------- */

export async function render() {
  const S = view();
  APP.panel.innerHTML = shellHtml('<div class="empty">Loading…</div>', S.profileView);
  APP.$('#profileTabs').onclick = (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    S.profileView = b.dataset.view;
    render();
  };
  const body = APP.$('#profileBody');
  const inner = S.profileView === 'feed' ? await feedHtml() : await youHtml();
  if (!APP.$('#profileBody')) return; // navigated away while loading
  body.innerHTML = inner;
  try { if (S.profileView === 'feed') wireFeed(); else wireYou(); }
  catch (error) { console.warn('Profile wiring skipped', error); }
}
