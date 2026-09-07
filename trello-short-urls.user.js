// ==UserScript==
// @name         Trello short URLs
// @namespace    https://github.com/lp250isme/trello-short-urls
// @version      1.0.0
// @description  Shorten Trello card/board URLs to /c/{id} and /b/{id}
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
  const origReplace = history.replaceState.bind(history);
  const origPush = history.pushState.bind(history);

  function shortPath(pathname) {
    const m = pathname.match(SHORT);
    return m ? m[1] : null;
  }

  function cleanAddressBar() {
    const short = shortPath(location.pathname);
    if (!short || location.pathname === short) return;
    origReplace(history.state, '', short + location.search + location.hash);
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

  history.pushState = function (...args) {
    const ret = origPush(...args);
    queueMicrotask(cleanAddressBar);
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplace(...args);
    queueMicrotask(cleanAddressBar);
    return ret;
  };
  window.addEventListener('popstate', cleanAddressBar);
  document.addEventListener('DOMContentLoaded', () => cleanAnchors(document));

  new MutationObserver((muts) => {
    cleanAddressBar();
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) cleanAnchors(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  cleanAddressBar();
})();
