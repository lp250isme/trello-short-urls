// ==UserScript==
// @name         Trello short URLs
// @namespace    https://github.com/lp250isme/trello-short-urls
// @version      1.2.0
// @description  Shorten Trello URLs, copy the short link, and join/leave the open card from the header
// @author       kv
// @license      MIT
// @match        https://trello.com/*
// @match        https://www.trello.com/*
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/lp250isme/trello-short-urls/main/trello-short-urls.user.js
// @updateURL    https://raw.githubusercontent.com/lp250isme/trello-short-urls/main/trello-short-urls.user.js
// ==/UserScript==

(function () {
  const SHORT = /^(\/(?:c|b)\/[A-Za-z0-9]+)(?:\/.*)?$/;
  const COPY_BTN = 'trello-short-url-copy';
  const JOIN_BTN = 'trello-short-url-join';
  const origReplace = history.replaceState.bind(history);
  const origPush = history.pushState.bind(history);

  const ICON_LINK =
    '<path fill="currentcolor" d="M6.22 10.72a.75.75 0 0 1 0 1.06l-.53.53a3.25 3.25 0 0 1-4.6-4.6l2.25-2.25a3.25 3.25 0 0 1 4.6 0 .75.75 0 0 1-1.06 1.06 1.75 1.75 0 0 0-2.48 0L2.15 8.77a1.75 1.75 0 1 0 2.48 2.48l.53-.53a.75.75 0 0 1 1.06 0m3.56-6.56a.75.75 0 0 1 0-1.06l.53-.53a3.25 3.25 0 0 1 4.6 4.6l-2.25 2.25a3.25 3.25 0 0 1-4.6 0 .75.75 0 0 1 1.06-1.06 1.75 1.75 0 0 0 2.48 0l2.25-2.25a1.75 1.75 0 1 0-2.48-2.48l-.53.53a.75.75 0 0 1-1.06 0"/>';
  const ICON_CHECK =
    '<path fill="currentcolor" fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 1.06-1.06L7 9.94l5.72-5.72a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/>';
  const ICON_PERSON =
    '<path fill="currentcolor" d="M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m-5 6.5v-1.17C3 11.12 5.79 10 8 10s5 1.12 5 3.33v1.17z"/>';
  const ICON_PERSON_CHECK =
    '<path fill="currentcolor" d="M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m-5 6.5v-1.17C3 11.12 5.79 10 8 10c.5 0 1.02.05 1.5.14A3.5 3.5 0 0 0 8.5 12H3z"/><path fill="currentcolor" fill-rule="evenodd" d="M15.03 9.97a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06 0l-1.5-1.5a.75.75 0 1 1 1.06-1.06l.97.97 2.47-2.47a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/>';

  const joinState = { card: null, cardId: null, meId: null, joined: false, loading: false, loaded: false };

  function shortPath(pathname) {
    const m = pathname.match(SHORT);
    return m ? m[1] : null;
  }

  function cardShortLink() {
    const m = location.pathname.match(/^\/c\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  }

  function shortUrl() {
    const short = shortPath(location.pathname);
    return short ? location.origin + short : null;
  }

  function cookie(name) {
    const m = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/[$()*+./?[\\]^{|}-]/g, '\\$&') + '=([^;]*)')
    );
    return m ? decodeURIComponent(m[1]) : '';
  }

  function cleanAddressBar() {
    const short = shortPath(location.pathname);
    if (!short) return;
    if (location.pathname === short && !location.search) return;
    origReplace(history.state, '', short + location.hash);
  }

  function cleanAnchors(root) {
    if (!root.querySelectorAll) return;
    for (const a of root.querySelectorAll('a[href*="/c/"], a[href*="/b/"]')) {
      try {
        const u = new URL(a.getAttribute('href'), location.origin);
        if (u.hostname !== 'trello.com' && u.hostname !== 'www.trello.com') continue;
        const short = shortPath(u.pathname);
        if (short) a.setAttribute('href', short);
      } catch {
        // ignore invalid href
      }
    }
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function setIconButton(btn, { icon, label }) {
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = icon;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    const img = btn.querySelector('[role="img"]');
    if (img) img.setAttribute('aria-label', label);
  }

  function headerList() {
    const refBtn = document.querySelector(
      '[data-testid="card-back-cover-button"], [data-testid="card-back-actions-button"]'
    );
    return refBtn?.closest('li')?.parentElement || null;
  }

  function cloneHeaderButton(ul, testId) {
    const existing = document.querySelector(`[data-testid="${testId}"]`);
    if (existing) return existing;
    const refLi = ul.querySelector('li');
    if (!refLi) return null;
    const li = refLi.cloneNode(true);
    const btn = li.querySelector('button');
    if (!btn) return null;
    btn.setAttribute('data-testid', testId);
    btn.setAttribute('type', 'button');
    btn.removeAttribute('aria-expanded');
    const actionsLi = ul
      .querySelector('[data-testid="card-back-actions-button"]')
      ?.closest('li');
    ul.insertBefore(li, actionsLi || ul.lastElementChild);
    return btn;
  }

  function injectCopyButton(ul) {
    const btn = cloneHeaderButton(ul, COPY_BTN);
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    setIconButton(btn, { icon: ICON_LINK, label: '複製短網址' });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const url = shortUrl();
      if (!url) return;
      copyText(url).then(() => {
        setIconButton(btn, { icon: ICON_CHECK, label: '已複製' });
        setTimeout(() => setIconButton(btn, { icon: ICON_LINK, label: '複製短網址' }), 1500);
      });
    });
  }

  async function trelloApi(method, path, params = {}) {
    const url = new URL(path.replace(/^\//, ''), 'https://trello.com/1/');
    const token = cookie('token');
    if (token) url.searchParams.set('token', token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { method, credentials: 'include' });
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function applyJoinButton() {
    const btn = document.querySelector(`[data-testid="${JOIN_BTN}"]`);
    if (!btn) return;
    btn.disabled = joinState.loading;
    if (joinState.joined) {
      setIconButton(btn, { icon: ICON_PERSON_CHECK, label: '已加入，點擊離開' });
    } else {
      setIconButton(btn, { icon: ICON_PERSON, label: '加入卡片' });
    }
  }

  async function syncJoinState(force) {
    const short = cardShortLink();
    if (!short) return;
    if (!force && joinState.card === short && (joinState.loaded || joinState.loading)) {
      applyJoinButton();
      return;
    }
    joinState.card = short;
    joinState.loading = true;
    joinState.loaded = false;
    applyJoinButton();
    try {
      const [member, card] = await Promise.all([
        joinState.meId
          ? Promise.resolve({ id: joinState.meId })
          : trelloApi('GET', 'members/me', { fields: 'id' }),
        trelloApi('GET', `cards/${short}`, { fields: 'id,idMembers' }),
      ]);
      if (cardShortLink() !== short) return;
      joinState.meId = member.id;
      joinState.cardId = card.id;
      joinState.joined = (card.idMembers || []).includes(member.id);
      joinState.loaded = true;
    } catch (err) {
      console.warn('trello-short-urls: join state', err);
      joinState.loaded = true;
    } finally {
      joinState.loading = false;
      applyJoinButton();
    }
  }

  function clickNativeJoinLeave(wantLeave) {
    const testId = wantLeave ? 'card-back-leave-button' : 'card-back-join-button';
    const byTestId = document.querySelector(`[data-testid="${testId}"]`);
    if (byTestId) {
      byTestId.click();
      return true;
    }
    const re = wantLeave
      ? /^(Leave|離開)( card|卡片)?$/i
      : /^(Join|加入)( card|卡片)?$/i;
    const el = [...document.querySelectorAll('button, a')].find((node) =>
      re.test((node.textContent || '').replace(/\s+/g, ' ').trim())
    );
    if (!el) return false;
    el.click();
    return true;
  }

  async function toggleJoin() {
    const short = cardShortLink();
    if (!short || joinState.loading) return;
    const wantLeave = joinState.joined;
    if (clickNativeJoinLeave(wantLeave)) {
      joinState.joined = !wantLeave;
      applyJoinButton();
      return;
    }
    joinState.loading = true;
    applyJoinButton();
    try {
      if (!joinState.meId || !joinState.cardId) await syncJoinState(true);
      if (!joinState.meId || !joinState.cardId) throw new Error('missing ids');
      if (wantLeave) {
        await trelloApi('DELETE', `cards/${joinState.cardId}/idMembers/${joinState.meId}`);
        joinState.joined = false;
      } else {
        await trelloApi('POST', `cards/${joinState.cardId}/idMembers`, { value: joinState.meId });
        joinState.joined = true;
      }
    } catch (err) {
      console.warn('trello-short-urls: join', err);
      const btn = document.querySelector(`[data-testid="${JOIN_BTN}"]`);
      if (btn) setIconButton(btn, { icon: ICON_PERSON, label: wantLeave ? '離開失敗' : '加入失敗' });
      return;
    } finally {
      joinState.loading = false;
    }
    applyJoinButton();
  }

  function injectJoinButton(ul) {
    const btn = cloneHeaderButton(ul, JOIN_BTN);
    if (!btn) return;
    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleJoin();
      });
    }
    applyJoinButton();
    syncJoinState();
  }

  function injectHeaderButtons() {
    if (!cardShortLink()) return;
    const ul = headerList();
    if (!ul) return;
    injectCopyButton(ul);
    injectJoinButton(ul);
  }

  function onDomChange(root) {
    cleanAddressBar();
    injectHeaderButtons();
    if (root) cleanAnchors(root);
  }

  history.pushState = function (...args) {
    const ret = origPush(...args);
    queueMicrotask(() => onDomChange(document));
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplace(...args);
    queueMicrotask(() => onDomChange(document));
    return ret;
  };
  window.addEventListener('popstate', () => onDomChange(document));
  document.addEventListener('DOMContentLoaded', () => onDomChange(document));

  new MutationObserver((muts) => {
    cleanAddressBar();
    injectHeaderButtons();
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) cleanAnchors(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  onDomChange(document);
})();
