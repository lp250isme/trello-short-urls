// ==UserScript==
// @name         Trello short URLs
// @name:zh-TW   Trello 短網址
// @namespace    https://github.com/lp250isme/trello-short-urls
// @version      1.5.1
// @description  Copy short Trello card/board URLs and join/leave from the card header
// @description:zh-TW 縮短 Trello 卡片／看板網址，並在卡片 header 加入或退出
// @author       kv
// @license      MIT
// @homepageURL  https://greasyfork.org/scripts/594726-trello-short-urls
// @supportURL   https://github.com/lp250isme/trello-short-urls/issues
// @match        https://trello.com/*
// @match        https://www.trello.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/lp250isme/trello-short-urls/main/trello-short-urls.user.js
// @updateURL    https://raw.githubusercontent.com/lp250isme/trello-short-urls/main/trello-short-urls.user.js
// ==/UserScript==

(function () {
  const SHORT = /^(\/(?:c|b)\/[A-Za-z0-9]+)(?:\/.*)?$/;
  const COPY_BTN = 'trello-short-url-copy';
  const JOIN_BTN = 'trello-short-url-join';
  const FALLBACK_CLIENT_VERSION = 'build-240418';
  const origReplace = history.replaceState.bind(history);
  const origPush = history.pushState.bind(history);
  const origFetch = window.fetch.bind(window);

  const ICON_LINK =
    '<path fill="currentcolor" d="M6.22 10.72a.75.75 0 0 1 0 1.06l-.53.53a3.25 3.25 0 0 1-4.6-4.6l2.25-2.25a3.25 3.25 0 0 1 4.6 0 .75.75 0 0 1-1.06 1.06 1.75 1.75 0 0 0-2.48 0L2.15 8.77a1.75 1.75 0 1 0 2.48 2.48l.53-.53a.75.75 0 0 1 1.06 0m3.56-6.56a.75.75 0 0 1 0-1.06l.53-.53a3.25 3.25 0 0 1 4.6 4.6l-2.25 2.25a3.25 3.25 0 0 1-4.6 0 .75.75 0 0 1 1.06-1.06 1.75 1.75 0 0 0 2.48 0l2.25-2.25a1.75 1.75 0 1 0-2.48-2.48l-.53.53a.75.75 0 0 1-1.06 0"/>';
  const ICON_CHECK =
    '<path fill="currentcolor" fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 1.06-1.06L7 9.94l5.72-5.72a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/>';
  const ICON_PERSON =
    '<path fill="currentcolor" d="M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m-5 6.5v-1.17C3 11.12 5.79 10 8 10s5 1.12 5 3.33v1.17z"/>';
  const ICON_PERSON_CHECK =
    '<path fill="currentcolor" d="M8 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 8 8m-5 6.5v-1.17C3 11.12 5.79 10 8 10c.5 0 1.02.05 1.5.14A3.5 3.5 0 0 0 8.5 12H3z"/><path fill="currentcolor" fill-rule="evenodd" d="M15.03 9.97a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06 0l-1.5-1.5a.75.75 0 1 1 1.06-1.06l.97.97 2.47-2.47a.75.75 0 0 1 1.06 0" clip-rule="evenodd"/>';

  const joinState = { card: null, cardId: null, meId: null, me: null, joined: false, loading: false, loaded: false };
  const official = {
    clientVersion: null,
    operationName: null,
    task: null,
    url: null,
    method: null,
  };

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

  function hexBytes(n) {
    const b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function strings() {
    const sample = document.querySelector(
      '[data-testid="card-back-cover-button"], [data-testid="card-back-actions-button"]'
    );
    const ui = `${sample?.getAttribute('aria-label') || ''} ${sample?.getAttribute('title') || ''}`;
    const lang = (document.documentElement.lang || cookie('lang') || '').toLowerCase();
    const zh = /封面|關注|动作|動作|關閉|关闭|加入|離開/.test(ui) || lang.startsWith('zh');
    if (zh) {
      return {
        copy: '複製短網址',
        copied: '已複製',
        join: '加入卡片',
        leave: '退出卡片',
        joinFail: '加入失敗',
        leaveFail: '退出失敗',
      };
    }
    return {
      copy: 'Copy short URL',
      copied: 'Copied',
      join: 'Join card',
      leave: 'Leave card',
      joinFail: 'Join failed',
      leaveFail: 'Leave failed',
    };
  }

  function headerMap(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof headers.forEach === 'function') {
      headers.forEach((v, k) => {
        out[String(k).toLowerCase()] = v;
      });
      return out;
    }
    if (Array.isArray(headers)) {
      for (const [k, v] of headers) out[String(k).toLowerCase()] = v;
      return out;
    }
    for (const k of Object.keys(headers)) out[k.toLowerCase()] = headers[k];
    return out;
  }

  function harvestTrelloHeaders(headers, url, method) {
    const map = headerMap(headers);
    const ver = map['x-trello-client-version'];
    if (ver) official.clientVersion = ver;
    const u = String(url || '');
    if (!u.includes('/1/cards') || !u.includes('idMembers')) return;
    if (map['x-trello-operation-name']) official.operationName = map['x-trello-operation-name'];
    if (map['x-trello-task']) official.task = map['x-trello-task'];
    official.url = u;
    if (method) official.method = method;
  }

  function isTrelloApiUrl(url) {
    const u = String(url || '');
    return u.includes('trello.com/1/') || /(?:^|\/)1\//.test(u);
  }

  window.fetch = function (input, init) {
    try {
      const req = input instanceof Request ? input : null;
      const url = req ? req.url : typeof input === 'string' ? input : input?.url;
      if (isTrelloApiUrl(url)) {
        harvestTrelloHeaders(init?.headers || req?.headers, url, init?.method || req?.method);
      }
    } catch {
      // ignore
    }
    return origFetch(input, init);
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__tsuMethod = method;
    this.__tsuUrl = url;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (isTrelloApiUrl(this.__tsuUrl)) {
        harvestTrelloHeaders({ [name]: value }, this.__tsuUrl, this.__tsuMethod);
      }
    } catch {
      // ignore
    }
    return xhrSet.apply(this, arguments);
  };

  function clientVersion() {
    return official.clientVersion || FALLBACK_CLIENT_VERSION;
  }

  function shortenHref(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.hostname !== 'trello.com' && u.hostname !== 'www.trello.com') return null;
      const short = shortPath(u.pathname);
      if (!short) return null;
      return u.origin + short;
    } catch {
      return null;
    }
  }

  function shortenAnchor(a) {
    const href = a.getAttribute('href');
    if (!href) return;
    const short = shortenHref(href);
    if (short && href !== short && href !== short.replace(/^https?:\/\/[^/]+/, '')) {
      a.setAttribute('href', short);
    }
  }

  function cleanAddressBar() {
    const short = shortPath(location.pathname);
    if (!short) return;
    if (location.pathname === short && !location.search) return;
    origReplace(history.state, '', short + location.hash);
  }

  function cleanAnchors(root) {
    if (!root.querySelectorAll) {
      if (root.tagName === 'A') shortenAnchor(root);
      return;
    }
    if (root.tagName === 'A') shortenAnchor(root);
    for (const a of root.querySelectorAll('a[href*="/c/"], a[href*="/b/"]')) shortenAnchor(a);
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
    if (btn.dataset.label === label) return;
    btn.dataset.label = label;
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
    if (!btn) return;
    const t = strings();
    if (!btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const url = shortUrl();
        if (!url) return;
        const s = strings();
        copyText(url).then(() => {
          setIconButton(btn, { icon: ICON_CHECK, label: s.copied });
          setTimeout(() => setIconButton(btn, { icon: ICON_LINK, label: strings().copy }), 1500);
        });
      });
    }
    if (btn.dataset.label !== t.copy && btn.dataset.label !== t.copied) {
      setIconButton(btn, { icon: ICON_LINK, label: t.copy });
    }
  }

  async function trelloApi(method, path, params = {}) {
    const url = new URL(path.replace(/^\//, ''), 'https://trello.com/1/');
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await origFetch(url, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`${method} ${path} ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function writeHeaders(operationName, version) {
    const trace = hexBytes(16);
    return {
      Accept: '*/*',
      'Content-Type': 'application/json',
      'x-trello-client-version': version,
      'x-trello-operation-name': operationName,
      'x-trello-task': official.task || 'edit-card/idMembers',
      'x-trello-traceid': trace,
      'x-b3-traceid': trace,
      'x-b3-spanid': hexBytes(8),
    };
  }

  function logWriteMismatch(status, sent) {
    const missing = [];
    if (official.clientVersion && official.clientVersion !== sent.clientVersion) {
      missing.push(`x-trello-client-version ours=${sent.clientVersion} official=${official.clientVersion}`);
    }
    if (official.operationName && official.operationName !== sent.operationName) {
      missing.push(`x-trello-operation-name ours=${sent.operationName} official=${official.operationName}`);
    }
    if (official.task && official.task !== sent.task) {
      missing.push(`x-trello-task ours=${sent.task} official=${official.task}`);
    }
    if (!sent.dsc) missing.push('dsc cookie missing');
    console.warn('[trello-short-urls] write failed', status, {
      sent,
      lastOfficial: {
        clientVersion: official.clientVersion,
        operationName: official.operationName,
        task: official.task,
        method: official.method,
        url: official.url,
      },
      missing,
    });
  }

  async function trelloWriteOnce(method, path, operationName, body, version) {
    const dsc = cookie('dsc');
    if (!dsc) throw new Error('missing dsc cookie');
    const headers = writeHeaders(operationName, version);
    const res = await origFetch('https://trello.com/1/' + path.replace(/^\//, ''), {
      method,
      credentials: 'include',
      headers,
      body: JSON.stringify({ ...body, dsc }),
    });
    return { res, dsc, headers };
  }

  async function trelloWrite(method, path, operationName, body = {}) {
    const firstVer = clientVersion();
    let { res, dsc, headers } = await trelloWriteOnce(method, path, operationName, body, firstVer);
    if (!res.ok && official.clientVersion && official.clientVersion !== firstVer) {
      ({ res, dsc, headers } = await trelloWriteOnce(
        method,
        path,
        operationName,
        body,
        official.clientVersion
      ));
    }
    if (!res.ok) {
      logWriteMismatch(res.status, {
        clientVersion: headers['x-trello-client-version'],
        operationName: headers['x-trello-operation-name'],
        task: headers['x-trello-task'],
        dsc: !!dsc,
        method,
        path,
      });
      throw new Error(`${method} ${path} ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  function applyJoinButton() {
    const btn = document.querySelector(`[data-testid="${JOIN_BTN}"]`);
    if (!btn) return;
    const t = strings();
    const ui = `${joinState.joined}:${joinState.loading}:${t.join}:${t.leave}`;
    if (btn.dataset.ui === ui) return;
    btn.dataset.ui = ui;
    btn.disabled = joinState.loading;
    if (joinState.joined) {
      setIconButton(btn, { icon: ICON_PERSON_CHECK, label: t.leave });
    } else {
      setIconButton(btn, { icon: ICON_PERSON, label: t.join });
    }
  }

  async function syncJoinState(force) {
    const short = cardShortLink();
    if (!short) return;
    if (!force && joinState.card === short && (joinState.loaded || joinState.loading)) {
      return;
    }
    joinState.card = short;
    joinState.joined = false;
    joinState.loading = true;
    joinState.loaded = false;
    applyJoinButton();
    try {
      const [member, card] = await Promise.all([
        joinState.me
          ? Promise.resolve(joinState.me)
          : trelloApi('GET', 'members/me', { fields: 'id,username,fullName,initials' }),
        trelloApi('GET', `cards/${short}`, { fields: 'id,idMembers' }),
      ]);
      if (cardShortLink() !== short) return;
      joinState.me = member;
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

  async function toggleJoin() {
    const short = cardShortLink();
    if (!short || joinState.loading) return;
    const wantLeave = joinState.joined;
    const t = strings();
    joinState.loading = true;
    applyJoinButton();
    try {
      if (!joinState.meId || !joinState.cardId || joinState.card !== short) await syncJoinState(true);
      if (!joinState.meId || !joinState.cardId) throw new Error('missing ids');
      if (wantLeave) {
        await trelloWrite(
          'DELETE',
          `cards/${joinState.cardId}/idMembers/${joinState.meId}`,
          official.operationName && /remove/i.test(official.operationName)
            ? official.operationName
            : 'RemoveMemberFromCard'
        );
      } else {
        await trelloWrite(
          'POST',
          `cards/${joinState.cardId}/idMembers`,
          official.operationName && /add/i.test(official.operationName)
            ? official.operationName
            : 'AddMemberToCardShortcut',
          { value: joinState.meId }
        );
      }
      joinState.joined = !wantLeave;
    } catch (err) {
      console.warn('trello-short-urls: join', err);
      const btn = document.querySelector(`[data-testid="${JOIN_BTN}"]`);
      if (btn) {
        btn.dataset.label = '';
        btn.dataset.ui = '';
        setIconButton(btn, { icon: ICON_PERSON, label: wantLeave ? t.leaveFail : t.joinFail });
      }
      return;
    } finally {
      joinState.loading = false;
    }
    applyJoinButton();
  }

  function injectJoinButton(ul) {
    const existed = document.querySelector(`[data-testid="${JOIN_BTN}"]`);
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
      applyJoinButton();
    }
    const short = cardShortLink();
    if (!existed || joinState.card !== short) syncJoinState();
    else applyJoinButton();
  }

  function injectHeaderButtons() {
    if (!cardShortLink()) {
      if (joinState.card) {
        joinState.card = null;
        joinState.loaded = false;
      }
      return;
    }
    const ul = headerList();
    if (!ul) return;
    injectCopyButton(ul);
    injectJoinButton(ul);
  }

  function isOurs(node) {
    return !!node?.closest?.(`[data-testid="${COPY_BTN}"], [data-testid="${JOIN_BTN}"]`);
  }

  let raf = 0;
  function scheduleWork() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      cleanAddressBar();
      injectHeaderButtons();
    });
  }

  function onDomChange(root) {
    scheduleWork();
    if (root) cleanAnchors(root);
  }

  history.pushState = function (...args) {
    const ret = origPush(...args);
    queueMicrotask(scheduleWork);
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = origReplace(...args);
    queueMicrotask(scheduleWork);
    return ret;
  };
  window.addEventListener('popstate', scheduleWork);
  document.addEventListener('DOMContentLoaded', () => onDomChange(document));

  document.addEventListener(
    'contextmenu',
    (e) => {
      const a = e.target?.closest?.('a[href*="/c/"], a[href*="/b/"]');
      if (a) shortenAnchor(a);
    },
    true
  );
  document.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 2) return;
      const a = e.target?.closest?.('a[href*="/c/"], a[href*="/b/"]');
      if (a) shortenAnchor(a);
    },
    true
  );
  document.addEventListener(
    'copy',
    (e) => {
      const data = e.clipboardData;
      if (!data) return;
      const text = data.getData('text/plain') || String(window.getSelection() || '');
      const m = text.match(/https?:\/\/(?:www\.)?trello\.com\/[cb]\/[A-Za-z0-9][^\s]*/);
      if (!m) return;
      const short = shortenHref(m[0]);
      if (short && m[0] !== short) {
        e.preventDefault();
        data.setData('text/plain', text.replace(m[0], short));
      }
    },
    true
  );

  new MutationObserver((muts) => {
    let oursOnly = true;
    for (const m of muts) {
      if (!isOurs(m.target)) oursOnly = false;
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (isOurs(n)) continue;
        oursOnly = false;
        cleanAnchors(n);
      }
    }
    if (!oursOnly) scheduleWork();
  }).observe(document.documentElement, { childList: true, subtree: true });

  scheduleWork();
})();
