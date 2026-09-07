// ==UserScript==
// @name         Trello short URLs
// @namespace    https://github.com/lp250isme/trello-short-urls
// @version      1.1.0
// @description  Shorten Trello card/board URLs to /c/{id} and /b/{id}, with a copy button on the card header
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
  const origReplace = history.replaceState.bind(history);
  const origPush = history.pushState.bind(history);

  const ICON_LINK =
    '<path fill="currentcolor" d="M6.22 10.72a.75.75 0 0 1 0 1.06l-.53.53a3.25 3.25 0 0 1-4.6-4.6l2.25-2.25a3.25 3.25 0 0 1 4.6 0 .75.75 0 0 1-1.06 1.06 1.75 1.75 0 0 0-2.48 0L2.15 8.77a1.75 1.75 0 1 0 2.48 2.48l.53-.53a.75.75 0 0 1 1.06 0m3.56-6.56a.75.75 0 0 1 0-1.06l.53-.53a3.25 3.25 0 0 1 4.6 4.6l-2.25 2.25a3.25 3.25 0 0 1-4.6 0 .75.75 0 0 1 1.06-1.06 1.75 1.75 0 0 0 2.48 0l2.25-2.25a1.75 1.75 0 1 0-2.48-2.48l-.53.53a.75.75 0 0 1-1.06 0"/>';
  const ICON_CHECK =
    '<path fill="currentcolor" fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 1.06-1.06L7 9.94l5.72-5.72a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/>';

  function shortPath(pathname) {
    const m = pathname.match(SHORT);
    return m ? m[1] : null;
  }

  function shortUrl() {
    const short = shortPath(location.pathname);
    return short ? location.origin + short : null;
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

  function setButtonState(btn, copied) {
    const svg = btn.querySelector('svg');
    if (svg) svg.innerHTML = copied ? ICON_CHECK : ICON_LINK;
    const label = copied ? '已複製' : '複製短網址';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    const img = btn.querySelector('[role="img"]');
    if (img) img.setAttribute('aria-label', label);
  }

  function injectCopyButton() {
    if (!shortPath(location.pathname)?.startsWith('/c/')) return;
    if (document.querySelector(`[data-testid="${COPY_BTN}"]`)) return;

    const refBtn = document.querySelector(
      '[data-testid="card-back-cover-button"], [data-testid="card-back-actions-button"]'
    );
    const refLi = refBtn?.closest('li');
    const ul = refLi?.parentElement;
    if (!ul) return;

    const li = refLi.cloneNode(true);
    const btn = li.querySelector('button');
    if (!btn) return;

    btn.setAttribute('data-testid', COPY_BTN);
    btn.setAttribute('type', 'button');
    btn.removeAttribute('aria-expanded');
    setButtonState(btn, false);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const url = shortUrl();
      if (!url) return;
      copyText(url).then(() => {
        setButtonState(btn, true);
        setTimeout(() => setButtonState(btn, false), 1500);
      });
    });

    const actionsLi = ul
      .querySelector('[data-testid="card-back-actions-button"]')
      ?.closest('li');
    ul.insertBefore(li, actionsLi || ul.lastElementChild);
  }

  function onDomChange(root) {
    cleanAddressBar();
    injectCopyButton();
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
    injectCopyButton();
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) cleanAnchors(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  onDomChange(document);
})();
