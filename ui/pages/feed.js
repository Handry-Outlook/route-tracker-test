// Pure presentational HTML for the Feed page. Data fetching and event
// wiring live in legacy.js's feedPage(), which already owns the shared
// escapeHtml/toast/panel plumbing every other page function uses —
// these are just the template fragments, kept framework-free like the
// rest of the app's templating.

export function feedSignInPromptHtml(head) {
  return (
    head('Feed', 'Rides from people you follow') +
    `<div class="card account-required">
      <h2>Sign in required</h2>
      <p>Follow other riders to see their rides here, give kudos, and leave comments.</p>
      <button class="btn primary" id="feedSignIn">Sign in</button>
    </div>`
  );
}

export function findPeopleHtml() {
  return `<div class="card find-people-card">
    <h3>Find people</h3>
    <div class="location-row">
      <input id="findPeopleInput" placeholder="Search riders by name" autocomplete="off">
      <button class="btn light" id="findPeopleBtn">Search</button>
    </div>
    <div id="findPeopleResults"></div>
  </div>`;
}

export function personResultHtml(person, isFollowing, isSelf) {
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="item person-result" data-uid="${escape(person.uid)}">
    <span>${escape(person.displayName)}</span>
    ${isSelf ? '<small class="muted">You</small>' : `<button class="btn ${isFollowing ? 'light' : 'primary'}" data-follow-toggle="${escape(person.uid)}" data-following="${isFollowing ? '1' : '0'}">${isFollowing ? 'Following' : 'Follow'}</button>`}
  </div>`;
}

export function feedEmptyHtml(hasFollows) {
  return `<div class="empty">${hasFollows ? 'No recent rides from people you follow yet.' : 'Follow some riders above to see their rides here.'}</div>`;
}

export function activityCardHtml(activity, hasKudos) {
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = activity.startedAt ? new Date(activity.startedAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';
  const cover = activity.photoUrls?.[0];
  return `<article class="card feed-activity-card" data-activity-id="${escape(activity.id)}">
    <div class="row">
      <div><b>${escape(activity.ownerDisplayName)}</b><br><small class="muted">${escape(when)}</small></div>
    </div>
    <h3 style="margin:8px 0 4px">${escape(activity.title)}</h3>
    ${cover ? `<img class="activity-photo" src="${escape(cover)}" alt="Activity photo">` : ''}
    <div class="stats">
      <div class="stat"><b>${(activity.distanceKm || 0).toFixed(1)}</b><small>km</small></div>
      <div class="stat"><b>${Math.round(activity.elevationGainM || 0)}</b><small>gain m</small></div>
      <div class="stat"><b>${(activity.avgSpeedKmh || 0).toFixed(1)}</b><small>avg km/h</small></div>
    </div>
    <div class="actions">
      <button class="btn ${hasKudos ? 'primary' : 'light'}" data-kudos="${escape(activity.id)}" data-given="${hasKudos ? '1' : '0'}">👍 Kudos${activity.kudosCount ? ` (${activity.kudosCount})` : ''}</button>
      <button class="btn light" data-comments="${escape(activity.id)}">💬 Comments${activity.commentCount ? ` (${activity.commentCount})` : ''}</button>
    </div>
    <div class="feed-comments" id="comments-${escape(activity.id)}" hidden></div>
  </article>`;
}

export function commentHtml(comment) {
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `<div class="item"><b>${escape(comment.authorDisplayName)}</b><span>${escape(comment.text)}</span></div>`;
}

export function commentsPanelHtml(comments, activityId) {
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `${comments.map(commentHtml).join('') || '<p class="muted">No comments yet.</p>'}
    <div class="location-row">
      <input id="commentInput-${escape(activityId)}" placeholder="Add a comment" autocomplete="off">
      <button class="btn light" data-send-comment="${escape(activityId)}">Send</button>
    </div>`;
}
