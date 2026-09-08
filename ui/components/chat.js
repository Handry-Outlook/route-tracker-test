// The chat surface shared by a club's main channel and each ride's own thread.
//
// Pages here repaint by assigning panel.innerHTML, which detaches every node
// inside it. A live Firestore listener does not know that, so without an
// explicit teardown an old channel keeps firing into elements that are no
// longer on screen — and, worse, a second mount would leave the first running.
// So exactly one chat is mounted at a time and every render tears down first.
import { APP } from '../../legacy.js';
import { icon } from '../icons.js';
import { sendMessage, watchMessages, deleteMessage } from '../../social/chat.js';

let active = null;

export function unmountChat() {
  if (!active) return;
  active.stop();
  active = null;
}

function initials(name) {
  return (name || 'R').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function avatarColor(uid) {
  let h = 0;
  for (const ch of String(uid || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 46%)`;
}

function timeLabel(ms) {
  const d = new Date(ms || Date.now());
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function messageHtml(m, mine) {
  return `<div class="chat-msg${mine ? ' mine' : ''}" data-msg="${APP.escapeHtml(m.id)}">
    ${mine ? '' : `<span class="avatar sm" style="background:${avatarColor(m.uid)}">${initials(m.displayName)}</span>`}
    <div class="chat-bubble">
      ${mine ? '' : `<b>${APP.escapeHtml(m.displayName || 'Rider')}</b>`}
      <p>${APP.escapeHtml(m.text || '')}</p>
      <span class="chat-time">${timeLabel(m.sentAt)}${mine ? ` · <button class="chat-del" data-del="${APP.escapeHtml(m.id)}">Delete</button>` : ''}</span>
    </div>
  </div>`;
}

/**
 * Mounts a chat into `hostId`. Pass `eventId` for a ride thread, omit it for
 * the club channel. Safe to call repeatedly — the previous mount is discarded.
 */
export function mountChat(hostId, { clubId, eventId, title, emptyText }) {
  unmountChat();
  const host = APP.$(`#${hostId}`);
  if (!host) return;
  const S = APP.state;

  if (!S.user) {
    host.innerHTML = `<div class="empty" style="padding:14px">Sign in to join the conversation.</div>`;
    return;
  }

  host.innerHTML = `<section class="chat">
    <div class="between" style="margin-bottom:8px">
      <span class="section-title">${APP.escapeHtml(title)}</span>
      <span class="muted" style="font-size:11px;font-weight:700" id="${hostId}-count"></span>
    </div>
    <div class="chat-log" id="${hostId}-log"><div class="empty" style="padding:14px">Loading messages…</div></div>
    <form class="chat-compose" id="${hostId}-form">
      <input id="${hostId}-input" type="text" maxlength="800" placeholder="Message the group" autocomplete="off">
      <button class="btn primary sm" type="submit" aria-label="Send">${icon('send', 16)}</button>
    </form>
  </section>`;

  const log = APP.$(`#${hostId}-log`);
  const form = APP.$(`#${hostId}-form`);
  const input = APP.$(`#${hostId}-input`);
  const count = APP.$(`#${hostId}-count`);

  const stop = watchMessages({ clubId, eventId }, (messages) => {
    if (!document.body.contains(log)) return; // repainted from under us
    if (messages === null) {
      log.innerHTML = `<div class="empty" style="padding:14px">Messages could not be loaded.</div>`;
      return;
    }
    count.textContent = messages.length ? `${messages.length} message${messages.length === 1 ? '' : 's'}` : '';
    log.innerHTML = messages.length
      ? messages.map((m) => messageHtml(m, m.uid === S.user.uid)).join('')
      : `<div class="empty" style="padding:14px">${APP.escapeHtml(emptyText)}</div>`;
    // Keep the newest message in view, the way any chat does.
    log.scrollTop = log.scrollHeight;
  });

  active = { stop, hostId };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    try {
      await sendMessage(S.user, { clubId, eventId, text });
    } catch (error) {
      console.warn('Message failed to send', error);
      APP.toast('Message could not be sent');
      input.value = text; // give it back rather than losing what they typed
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  log.onclick = async (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    try {
      await deleteMessage({ clubId, eventId, id: b.dataset.del });
    } catch (error) {
      console.warn('Message delete failed', error);
      APP.toast('Could not delete that message');
    }
  };
}
