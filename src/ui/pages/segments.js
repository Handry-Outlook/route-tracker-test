// Segments — clubs, group rides, leaderboards, challenges and personal
// records, matching the mockup's Clubs artboard.
//
// Views (S.segmentsView): 'home' | 'club' | 'newClub' | 'newEvent' | 'newChallenge'.
// Everything shown is real: clubs and events come from Firestore, leaderboards
// are summed from members' actual activities, and challenge progress is
// computed from the rider's own rides inside the challenge window.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { viewHeader, rootHeader, wireHeader } from '../shell.js';
import { fmtKm, fmtM, terrainPlaceholder } from '../graphics.js';
import {
  listClubs, createClub, joinClub, leaveClub, isClubMember, listMembers,
  listEvents, createEvent, toggleAttendance, isAttending, clubLeaderboard,
  listChallenges, createChallenge, joinChallenge, leaveChallenge, isInChallenge, challengeProgressKm,
} from '../../social/clubs.js';

const WEEK = 7 * 86400000;
const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'R';
const avatarColor = (uid = '') => ['#8b5bd6', '#00a6a6', '#176bdb', '#f28b30', '#139b66'][[...uid].reduce((a, c) => a + c.charCodeAt(0), 0) % 5];
const startOfWeek = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };

function view() {
  const S = APP.state;
  if (!S.segmentsView) S.segmentsView = 'home';
  return S;
}
const goHome = () => { APP.state.segmentsView = 'home'; render(); };

/* ------------------------------ fragments ------------------------------ */

function eventRowHtml(clubId, e, going) {
  const d = new Date(e.startsAt || Date.now());
  return `<div class="between" style="padding:10px 0;border-top:1px solid var(--line)">
    <div class="row" style="gap:10px">
      <div class="event-date"><b>${d.getDate()}</b><small>${d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</small></div>
      <div>
        <b style="font-size:14px;display:block">${APP.escapeHtml(e.title || 'Group ride')}${e.distanceKm ? ` · ${Math.round(e.distanceKm)} km` : ''}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${e.meetPoint ? ` · ${APP.escapeHtml(e.meetPoint)}` : ''} · ${e.goingCount || 0} going</span>
      </div>
    </div>
    <button class="btn ${going ? 'light' : 'primary'} sm" data-going="${APP.escapeHtml(e.id)}" data-club="${APP.escapeHtml(clubId)}" data-on="${going ? '1' : '0'}">${going ? 'Going' : 'Join'}</button>
  </div>`;
}

function clubCardHtml(club, i, member) {
  return `<article class="card" style="overflow:hidden">
    <button style="display:block;width:100%;padding:0;background:transparent;text-align:left" data-club-open="${APP.escapeHtml(club.id)}">
      <div style="position:relative">${terrainPlaceholder(390, 96, ['forest', 'coast', 'warm', 'cool'][i % 4], 0)}
        <div style="position:absolute;left:14px;bottom:10px;color:#fff;text-shadow:0 1px 6px #0006">
          <b style="font-size:17px;font-weight:800;display:block">${APP.escapeHtml(club.name || 'Club')}</b>
          <span style="font-size:12px;font-weight:600;opacity:.92">${club.memberCount || 0} member${club.memberCount === 1 ? '' : 's'}</span>
        </div>
      </div>
    </button>
    <div style="padding:12px 14px">
      ${club.blurb ? `<p class="muted" style="font-size:12px;font-weight:600;margin-bottom:10px">${APP.escapeHtml(club.blurb)}</p>` : ''}
      <button class="btn ${member ? 'light' : 'primary'} sm block" data-join-club="${APP.escapeHtml(club.id)}" data-on="${member ? '1' : '0'}">${member ? 'Joined' : 'Join club'}</button>
    </div>
  </article>`;
}

function challengeCardHtml(c, joined, progressKm) {
  const pct = Math.max(0, Math.min(100, (progressKm / Math.max(1, c.targetKm)) * 100));
  const daysLeft = Math.max(0, Math.ceil(((c.endsAt || 0) - Date.now()) / 86400000));
  return `<div class="card challenge-card">
    <div class="between">
      <div>
        <span class="badge" style="background:#ffffff1f;color:#fff">Challenge</span>
        <b style="font-size:18px;font-weight:800;display:block;margin-top:8px">${APP.escapeHtml(c.title || 'Challenge')}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${fmtKm(progressKm)} of ${Math.round(c.targetKm)} km · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span>
      </div>
      ${icon('mtn', 32)}
    </div>
    <div class="progress" style="margin:12px 0 10px"><i style="width:${pct}%"></i></div>
    <button class="btn sm block" style="background:${joined ? '#ffffff24' : '#fff'};color:${joined ? '#fff' : 'var(--navy)'}" data-challenge="${APP.escapeHtml(c.id)}" data-on="${joined ? '1' : '0'}">${joined ? 'Leave challenge' : 'Join challenge'}</button>
  </div>`;
}

function personalRecordsHtml(list) {
  if (!list.length) return '<div class="empty">Record and save a ride to start setting records.</div>';
  const best = (label, pick, format) => {
    let win = null;
    list.forEach((a, i) => { if (!win || pick(a) > pick(win.a)) win = { a, i }; });
    return win && pick(win.a) > 0 ? { label, value: format(pick(win.a)), name: win.a.name || 'Cycling activity', index: win.i } : null;
  };
  const rows = [
    best('Longest ride', (a) => a.distance || 0, (v) => fmtKm(v)),
    best('Biggest climb', (a) => a.gain || 0, (v) => fmtM(v)),
    best('Fastest average', (a) => a.avgSpeed || 0, (v) => `${v.toFixed(1)} km/h`),
    best('Highest effort', (a) => a.effortScore || 0, (v) => String(Math.round(v))),
  ].filter(Boolean);
  return `<div class="card flat" style="padding:4px 14px">${rows.map((r) => `<button class="item" data-pr="${r.index}" style="width:100%;background:transparent;border-left:0;border-right:0;border-top:0;text-align:left;min-height:52px">
    <span><b style="font-size:14px;display:block">${r.label}</b><span class="muted" style="font-size:12px;font-weight:600">${APP.escapeHtml(r.name)}</span></span>
    <b style="font-size:15px;color:var(--blue)">${r.value}</b>
  </button>`).join('')}</div>`;
}

/**
 * Nearby segments with the rider's best effort on each (roadmap item 15).
 * Segments are drawn from a recorded ride, then every saved ride is matched
 * against them automatically.
 */
async function loadSegments() {
  const S = view();
  const host = APP.$('#segmentList');
  if (!host) return;
  const btn = APP.$('#newSegment');
  if (btn) btn.onclick = () => createFromLastRide();
  if (!S.user) { host.innerHTML = '<div class="empty" style="padding:14px">Sign in to see segments.</div>'; return; }

  const centre = S.pos || S.waypoints?.[0] || null;
  const list = await APP.segments.listSegmentsNear(centre, 60, turfRef()).catch(() => []);
  if (!APP.$('#segmentList')) return;
  if (!list.length) {
    host.innerHTML = '<div class="empty" style="padding:14px">No segments yet. Record a ride, then create one from it — every ride you save is matched automatically.</div>';
    return;
  }
  const efforts = await Promise.all(list.map((s) => APP.segments.listEfforts(s.id).catch(() => [])));
  host.innerHTML = `<div class="card flat" style="padding:4px 14px">${list.map((seg, i) => {
    const all = efforts[i] || [];
    const mine = all.filter((e) => e.uid === S.user.uid);
    const best = mine.length ? Math.min(...mine.map((e) => e.seconds)) : null;
    const leader = all.length ? all[0] : null;
    return `<div class="item" style="gap:10px">
      <span><b style="font-size:14px;display:block">${APP.escapeHtml(seg.name || 'Segment')}</b>
        <span class="muted" style="font-size:12px;font-weight:600">${(seg.distanceKm || 0).toFixed(1)} km · ${all.length} effort${all.length === 1 ? '' : 's'}${leader ? ` · best ${APP.segments.fmtSeconds(leader.seconds)} by ${APP.escapeHtml(leader.displayName || 'Rider')}` : ''}</span></span>
      <b style="font-size:14px;color:${best !== null ? 'var(--blue)' : 'var(--muted)'}">${best !== null ? APP.segments.fmtSeconds(best) : '—'}</b>
    </div>`;
  }).join('')}</div>`;
}

function turfRef() { return window.turf; }

/** Creates a segment from the most recent saved ride's trace. */
async function createFromLastRide() {
  const S = view();
  const last = (S.accountActivities || [])[0];
  const coords = (last?.samples || []).map((x) => x.pos).filter(Boolean);
  if (coords.length < 4) return APP.toast('Record and save a ride first');
  const name = prompt('Segment name', `${last.name || 'Ride'} segment`);
  if (!name?.trim()) return;
  // Use the middle third of the ride, which is where the interesting bit usually is.
  const from = Math.floor(coords.length / 3);
  const to = Math.floor((coords.length * 2) / 3);
  try {
    await APP.segments.createSegment(S.user, { name: name.trim(), coords: coords.slice(from, to), turf: turfRef() });
    APP.toast('Segment created — future rides will match against it');
    render();
  } catch (error) {
    console.warn('Segment creation failed', error);
    APP.toast('Could not create the segment');
  }
}

/* -------------------------------- views -------------------------------- */

async function homeView() {
  const S = view();
  const activities = S.accountActivities || [];
  APP.panel.innerHTML = `<div class="page">
    ${rootHeader('Segments', 'Clubs, challenges and your records', { actions: `<button class="chip on" id="newClub">${icon('plus', 14)}Create</button>` })}
    <div id="segBody" class="page"><div class="empty">Loading clubs…</div></div>
    <section id="segmentsSection">
      <div class="between" style="margin-bottom:8px"><span class="section-title">Segments</span>
        <button class="btn light sm" id="newSegment">${icon('plus', 14)}From last ride</button></div>
      <div id="segmentList"><div class="empty" style="padding:14px">Loading segments…</div></div>
    </section>
    <section>
      <p class="section-title" style="margin-bottom:8px">Personal records</p>
      ${personalRecordsHtml(activities)}
    </section>
  </div>`;

  APP.$('#newClub').onclick = () => { S.segmentsView = 'newClub'; render(); };
  APP.panel.querySelectorAll('[data-pr]').forEach((b) => {
    b.onclick = () => { S.activityDetailIndex = +b.dataset.pr; APP.open('record'); };
  });

  loadSegments();
  if (!S.user) {
    APP.$('#segBody').innerHTML = `<div class="card account-required"><h2>Sign in for clubs</h2><p>Join clubs and challenges, and see where you sit on the leaderboard.</p><button class="btn primary" id="segSignIn">Sign in</button></div>`;
    APP.$('#segSignIn').onclick = () => APP.open('profile');
    return;
  }

  const now = Date.now();
  const [clubs, challenges] = await Promise.all([listClubs(), listChallenges(now)]);
  const [memberFlags, joinFlags] = await Promise.all([
    Promise.all(clubs.map((c) => isClubMember(S.user.uid, c.id))),
    Promise.all(challenges.map((c) => isInChallenge(S.user.uid, c.id))),
  ]);
  const body = APP.$('#segBody');
  if (!body) return;

  body.innerHTML = `
    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">Clubs</span></div>
      ${clubs.length ? clubs.map((c, i) => clubCardHtml(c, i, memberFlags[i])).join('') : '<div class="empty">No clubs yet. Create the first one.</div>'}
    </section>
    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">Challenges</span>
        <button class="btn light sm" id="newChallenge">${icon('plus', 14)}New</button></div>
      ${challenges.length
        ? challenges.map((c, i) => challengeCardHtml(c, joinFlags[i], challengeProgressKm(activities, c))).join('')
        : '<div class="empty">No active challenges. Start one and invite your club.</div>'}
    </section>`;

  APP.$('#newChallenge').onclick = () => { S.segmentsView = 'newChallenge'; render(); };
  body.querySelectorAll('[data-club-open]').forEach((b) => {
    b.onclick = () => { S.segmentsClubId = b.dataset.clubOpen; S.segmentsView = 'club'; render(); };
  });
  body.querySelectorAll('[data-join-club]').forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === '1';
      b.disabled = true;
      try {
        if (on) await leaveClub(S.user, b.dataset.joinClub); else await joinClub(S.user, b.dataset.joinClub);
        APP.toast(on ? 'Left club' : 'Joined club');
        render();
      } catch (e) { console.warn('Club join failed', e); APP.toast('Could not update membership'); b.disabled = false; }
    };
  });
  body.querySelectorAll('[data-challenge]').forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === '1';
      b.disabled = true;
      try {
        if (on) await leaveChallenge(S.user, b.dataset.challenge); else await joinChallenge(S.user, b.dataset.challenge);
        render();
      } catch (e) { console.warn('Challenge join failed', e); APP.toast('Could not update challenge'); b.disabled = false; }
    };
  });
}

async function clubView() {
  const S = view();
  const clubId = S.segmentsClubId;
  APP.panel.innerHTML = `<div class="page">${viewHeader('Club', 'Loading…')}<div class="empty">Loading club…</div></div>`;
  wireHeader(goHome);

  const [clubs, events, members] = await Promise.all([listClubs(), listEvents(clubId), listMembers(clubId)]);
  const club = clubs.find((c) => c.id === clubId) || { id: clubId, name: 'Club' };
  const [member, board, goingFlags] = await Promise.all([
    isClubMember(S.user.uid, clubId),
    clubLeaderboard(clubId, startOfWeek()),
    Promise.all(events.map((e) => isAttending(S.user.uid, clubId, e.id))),
  ]);

  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(club.name || 'Club', `${club.memberCount || members.length} member${(club.memberCount || members.length) === 1 ? '' : 's'}`)}
    <div class="card" style="overflow:hidden">
      ${terrainPlaceholder(390, 96, 'forest', 0)}
      <div style="padding:12px 14px">
        ${club.blurb ? `<p class="muted" style="font-size:12px;font-weight:600;margin-bottom:10px">${APP.escapeHtml(club.blurb)}</p>` : ''}
        <div class="row" style="gap:8px">
          <button class="btn ${member ? 'light' : 'primary'} sm" id="toggleMember" style="flex:1">${member ? 'Leave club' : 'Join club'}</button>
          <button class="btn light sm" id="newEvent" style="flex:1">${icon('plus', 14)}Add ride</button>
        </div>
      </div>
    </div>

    <section>
      <p class="section-title" style="margin-bottom:4px">Upcoming rides</p>
      <div class="card pad flat" style="padding-top:2px">
        ${events.length ? events.map((e, i) => eventRowHtml(clubId, e, goingFlags[i])).join('') : '<div class="empty" style="padding:14px">No rides planned yet.</div>'}
      </div>
    </section>

    <section>
      <div class="between" style="margin-bottom:8px"><span class="section-title">${icon('trophy', 15)} This week</span><span class="muted" style="font-size:12px;font-weight:700">Distance</span></div>
      <div class="card pad flat">
        ${board.length ? board.slice(0, 10).map((r, i) => `<div class="leader-row">
          <span class="rank">${i + 1}</span>
          <span class="avatar sm" style="background:${avatarColor(r.uid)}">${initials(r.name)}</span>
          <span style="flex:1;font-size:14px;font-weight:${r.uid === S.user.uid ? 800 : 600}">${APP.escapeHtml(r.name)}${r.uid === S.user.uid ? ' (you)' : ''}</span>
          <b style="font-size:14px">${r.total ? fmtKm(r.total) : '—'}</b>
        </div>`).join('') : '<div class="empty" style="padding:14px">No member rides shared this week.</div>'}
        <p class="muted" style="font-size:11px;font-weight:600;margin-top:8px">Ranked on rides members shared to their feed since Monday.</p>
      </div>
    </section>
  </div>`;

  wireHeader(goHome);
  const { $ } = APP;
  $('#toggleMember').onclick = async () => {
    try {
      if (member) await leaveClub(S.user, clubId); else await joinClub(S.user, clubId);
      render();
    } catch (e) { console.warn('Membership failed', e); APP.toast('Could not update membership'); }
  };
  $('#newEvent').onclick = () => { S.segmentsView = 'newEvent'; render(); };
  APP.panel.querySelectorAll('[data-going]').forEach((b) => {
    b.onclick = async () => {
      const on = b.dataset.on === '1';
      b.disabled = true;
      try { await toggleAttendance(S.user, b.dataset.club, b.dataset.going, on); render(); }
      catch (e) { console.warn('Attendance failed', e); APP.toast('Could not update'); b.disabled = false; }
    };
  });
}

function formView(title, subtitle, fields, onSubmit, submitLabel) {
  APP.panel.innerHTML = `<div class="page">
    ${viewHeader(title, subtitle)}
    ${fields.map((f) => `<div class="field"><label>${f.label}</label><input id="${f.id}" type="${f.type || 'text'}" ${f.value !== undefined ? `value="${APP.escapeHtml(String(f.value))}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} placeholder="${APP.escapeHtml(f.placeholder || '')}"></div>`).join('')}
    <div class="action-bar"><button class="btn cta" id="formSubmit">${submitLabel}</button></div>
  </div>`;
  wireHeader(() => { APP.state.segmentsView = APP.state.segmentsClubId && title.includes('ride') ? 'club' : 'home'; render(); });
  APP.$('#formSubmit').onclick = async () => {
    const values = {};
    let missing = false;
    fields.forEach((f) => {
      const v = APP.$(`#${f.id}`).value.trim();
      if (f.required && !v) missing = true;
      values[f.id] = v;
    });
    if (missing) return APP.toast('Fill in the required fields');
    APP.$('#formSubmit').disabled = true;
    try { await onSubmit(values); }
    catch (e) { console.warn('Form failed', e); APP.toast('Could not save'); APP.$('#formSubmit').disabled = false; }
  };
}

/* -------------------------------- render -------------------------------- */

export async function render() {
  const S = view();
  if (!S.user && S.segmentsView !== 'home') S.segmentsView = 'home';

  if (S.segmentsView === 'club') return clubView();

  if (S.segmentsView === 'newClub') {
    return formView('New club', 'Riders can find and join it', [
      { id: 'name', label: 'Club name', required: true, placeholder: 'Bristol Gravel Collective' },
      { id: 'blurb', label: 'About (optional)', placeholder: 'Weekend gravel rides around the city' },
    ], async (v) => {
      await createClub(S.user, { name: v.name, blurb: v.blurb });
      APP.toast('Club created');
      S.segmentsView = 'home';
      render();
    }, 'Create club');
  }

  if (S.segmentsView === 'newEvent' && !S.segmentsClubId) {
    const clubs = await listClubs();
    APP.panel.innerHTML = `<div class="page">
      ${viewHeader('Pick a club', 'Which club is this ride for?')}
      ${clubs.length ? clubs.map((c) => `<button class="card pad flat item" data-pick-club="${APP.escapeHtml(c.id)}" style="width:100%;text-align:left">
        <span><b style="font-size:14px;display:block">${APP.escapeHtml(c.name)}</b><span class="muted" style="font-size:12px;font-weight:600">${c.memberCount || 0} members</span></span>
        ${icon('chevR', 18)}
      </button>`).join('') : '<div class="empty">Create a club first.</div>'}
    </div>`;
    wireHeader(goHome);
    APP.panel.querySelectorAll('[data-pick-club]').forEach((b) => {
      b.onclick = () => { S.segmentsClubId = b.dataset.pickClub; render(); };
    });
    return;
  }

  if (S.segmentsView === 'newEvent') {
    const when = new Date(Date.now() + 86400000);
    when.setHours(8, 30, 0, 0);
    const iso = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const fromRoute = S.clubRideFromRoute;
    return formView('New club ride', fromRoute ? 'Prefilled from your route' : 'Add a group ride to the calendar', [
      { id: 'title', label: 'Title', required: true, value: fromRoute?.name || '', placeholder: 'Saturday social' },
      { id: 'when', label: 'Date and time', type: 'datetime-local', value: iso, required: true },
      { id: 'meetPoint', label: 'Meeting point', placeholder: 'Ashton Court gate' },
      { id: 'distanceKm', label: 'Distance (km)', type: 'number', min: 0, value: fromRoute ? Math.round(fromRoute.distanceKm) : '', placeholder: '60' },
    ], async (v) => {
      await createEvent(S.user, S.segmentsClubId, {
        title: v.title, startsAt: new Date(v.when).getTime(), meetPoint: v.meetPoint, distanceKm: v.distanceKm,
      });
      APP.toast('Club ride added');
      S.clubRideFromRoute = null;
      S.segmentsView = 'club';
      render();
    }, 'Add ride');
  }

  if (S.segmentsView === 'newChallenge') {
    const end = new Date(Date.now() + 30 * 86400000);
    return formView('New challenge', 'Progress counts your saved rides', [
      { id: 'title', label: 'Title', required: true, placeholder: 'September 500 km' },
      { id: 'targetKm', label: 'Target distance (km)', type: 'number', min: 1, value: 500, required: true },
      { id: 'endsAt', label: 'Ends', type: 'date', value: end.toISOString().slice(0, 10), required: true },
    ], async (v) => {
      await createChallenge(S.user, {
        title: v.title, targetKm: +v.targetKm, startsAt: Date.now(), endsAt: new Date(v.endsAt).getTime(),
      });
      APP.toast('Challenge created');
      S.segmentsView = 'home';
      render();
    }, 'Create challenge');
  }

  return homeView();
}
