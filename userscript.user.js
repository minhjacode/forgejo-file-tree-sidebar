// ==UserScript==
// @name         Forgejo File Tree Sidebar
// @namespace    https://github.com/your-username/forgejo-file-tree-sidebar
// @version      1.1.0
// @description  GitHub-style file tree sidebar for Forgejo (OAuth2 + PKCE)
// @author       you
// @license      MIT
// @match        https://YOUR-FORGEJO-DOMAIN.example.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

// SETUP
// 1. Edit the @match line above: replace YOUR-FORGEJO-DOMAIN.example.com with your Forgejo domain.
// 2. Edit the OAUTH_CLIENT_ID constant below: replace REPLACE_WITH_YOUR_CLIENT_ID with the
//    Client ID from Forgejo Settings → Applications → OAuth2 Applications.
// 3. Save. The first time you visit a repo, click "Sign in" in the sidebar to authorize.
//
// See README.md for OAuth app registration steps and security details.

(function () {
  'use strict';

  // ============================================================
  // CONFIG — replace OAUTH_CLIENT_ID below with the value from
  // Forgejo Settings → Applications → OAuth2 Applications.
  // ============================================================
  const OAUTH_CLIENT_ID = 'REPLACE_WITH_YOUR_CLIENT_ID';
  const OAUTH_SCOPE = 'read:repository';
  const OAUTH_REDIRECT = window.location.origin + '/';

  const SIDEBAR_WIDTH = 300;
  const KEY_VISIBLE = 'ftree:visible';
  const KEY_EXPANDED_PREFIX = 'ftree:expanded:';
  const KEY_ACCESS = 'ftree:access_token';
  const KEY_ACCESS_EXP = 'ftree:access_expires';
  const KEY_REFRESH = 'ftree:refresh_token';
  const KEY_OAUTH_STATE = 'ftree:oauth_state';
  const KEY_OAUTH_VERIFIER = 'ftree:oauth_verifier';
  const MAX_PER_PAGE = 1000;

  // Octicon paths (16x16 viewBox)
  const ICONS = {
    chevron: 'M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z',
    folderClosed: 'M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z',
    folderOpen: 'M.513 1.513A1.75 1.75 0 0 1 1.75 1h3.5c.55 0 1.07.26 1.4.7l.9 1.2a.25.25 0 0 0 .2.1H13a1 1 0 0 1 1 1v.5H2.75a.75.75 0 0 0 0 1.5h11.978a1 1 0 0 1 .994 1.117L15 13.25A1.75 1.75 0 0 1 13.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75c0-.464.184-.91.513-1.237Z',
    file: 'M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z',
    close: 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z',
    signOut: 'M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z',
  };

  // ============================================================
  // OAUTH POPUP CALLBACK HANDLER
  // If this page is loaded as the OAuth callback popup (URL has
  // ?code=...&state=...), forward the code to the opener window
  // and close. This must run before anything else.
  // ============================================================
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') && params.has('state') && window.opener) {
    try {
      window.opener.postMessage({
        type: 'ftree-oauth-callback',
        code: params.get('code'),
        state: params.get('state'),
      }, window.location.origin);
    } catch (e) { console.error('[ftree] postMessage failed', e); }
    window.close();
    return;
  }

  // ============================================================
  // STYLES — uses Forgejo's CSS variables so the sidebar follows
  // the active theme (light, dark, custom themes) automatically.
  // Fallback values cover the rare case where a variable is unset.
  // ============================================================
  const css = `
    #ftree-sidebar {
      position: fixed; top: 0; left: 0; bottom: 0;
      width: ${SIDEBAR_WIDTH}px;
      background: var(--color-menu, var(--color-secondary-bg, #f6f8fa));
      color: var(--color-text, #1f2328);
      border-right: 1px solid var(--color-light-border, var(--color-secondary, #d0d7de));
      z-index: 100;
      display: flex; flex-direction: column;
      font-family: var(--fonts-proportional, system-ui, -apple-system, sans-serif);
      font-size: 13px;
    }
    body.ftree-active { padding-left: ${SIDEBAR_WIDTH}px !important; }

    #ftree-sidebar header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--color-light-border, var(--color-secondary, #d0d7de));
      display: flex; justify-content: space-between; align-items: center;
      flex-shrink: 0;
    }
    #ftree-sidebar .ftree-title {
      font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
      color: var(--color-text-light, #656d76);
    }
    #ftree-sidebar .ftree-actions { display: flex; gap: 2px; }
    #ftree-sidebar button.ftree-icon-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--color-text-light, #656d76);
      padding: 4px; border-radius: 4px;
      display: flex; align-items: center; justify-content: center;
      width: 26px; height: 26px;
      transition: background 0.1s, color 0.1s;
    }
    #ftree-sidebar button.ftree-icon-btn:hover {
      background: var(--color-hover, rgba(0,0,0,0.06));
      color: var(--color-text, #1f2328);
    }
    #ftree-sidebar button.ftree-icon-btn svg {
      width: 14px; height: 14px; fill: currentColor;
    }

    #ftree-status {
      padding: 10px 14px; font-size: 12px;
      color: var(--color-text-light, #656d76);
    }
    #ftree-status.ftree-error { color: var(--color-red, #cf222e); }

    #ftree-scroll {
      flex: 1; overflow-y: auto; overflow-x: auto; padding: 4px 0;
    }
    #ftree-root, .ftree-children { list-style: none; margin: 0; padding: 0; }

    .ftree-row {
      display: flex; align-items: center; gap: 5px;
      padding: 4px 12px 4px 8px;
      cursor: pointer; text-decoration: none; color: inherit;
      white-space: nowrap; user-select: none;
      line-height: 1.4; font-size: 13px;
      border-radius: 4px; margin: 1px 6px;
      min-height: 24px;
      transition: background 0.08s;
    }
    .ftree-row:hover {
      background: var(--color-hover, rgba(0,0,0,0.06));
    }
    .ftree-current {
      background: var(--color-active, rgba(64,120,242,0.15)) !important;
      font-weight: 500;
    }
    .ftree-row svg { flex-shrink: 0; fill: currentColor; }
    .ftree-chevron {
      width: 12px; height: 12px;
      color: var(--color-text-light, #656d76);
      transition: transform 0.15s ease;
    }
    .ftree-chevron.ftree-expanded { transform: rotate(90deg); }
    .ftree-icon-folder {
      width: 16px; height: 16px;
      color: var(--color-text-light, #656d76);
    }
    .ftree-folder-row.ftree-current .ftree-icon-folder,
    .ftree-folder-row:hover .ftree-icon-folder {
      color: var(--color-primary, #0969da);
    }
    .ftree-icon-file {
      width: 16px; height: 16px;
      color: var(--color-text-light-2, var(--color-text-light, #8c959f));
    }
    .ftree-label {
      overflow: hidden; text-overflow: ellipsis; flex: 1;
    }

    #ftree-show {
      position: fixed; top: 84px; left: 0;
      z-index: 99;
      width: 22px; height: 36px;
      background: var(--color-menu, var(--color-secondary-bg, #f6f8fa));
      color: var(--color-text-light, #656d76);
      border: 1px solid var(--color-light-border, var(--color-secondary, #d0d7de));
      border-left: none;
      border-radius: 0 6px 6px 0;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      padding: 0;
      box-shadow: 1px 1px 3px rgba(0,0,0,0.05);
      transition: width 0.15s ease, color 0.15s;
    }
    #ftree-show:hover {
      width: 28px;
      color: var(--color-text, #1f2328);
    }
    #ftree-show svg { width: 12px; height: 12px; fill: currentColor; }

    .ftree-truncated {
      padding: 8px 10px; margin: 0 10px 6px;
      font-size: 11px;
      background: var(--color-warning-bg, #fff8c5);
      color: var(--color-warning-text, #59522d);
      border: 1px solid var(--color-warning-border, rgba(212,167,44,0.4));
      border-radius: 6px;
    }

    .ftree-prompt { padding: 6px 14px 14px; }
    .ftree-prompt h3 {
      margin: 0 0 8px 0;
      font-size: 14px; font-weight: 600;
      color: var(--color-text, #1f2328);
    }
    .ftree-prompt p {
      margin: 0 0 10px 0; line-height: 1.5;
      color: var(--color-text-light, #656d76);
      font-size: 12px;
    }
    .ftree-prompt button.ftree-btn-primary {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; cursor: pointer;
      background: var(--color-primary, #0969da);
      color: var(--color-primary-contrast, #fff);
      border: 1px solid var(--color-primary, #0969da);
      border-radius: 5px;
      font-size: 13px; font-weight: 500;
      font-family: inherit;
      transition: background 0.1s, border-color 0.1s;
    }
    .ftree-prompt button.ftree-btn-primary:hover:not(:disabled) {
      background: var(--color-primary-dark-1, #0860ca);
      border-color: var(--color-primary-dark-1, #0860ca);
    }
    .ftree-prompt button.ftree-btn-primary:disabled {
      opacity: 0.6; cursor: wait;
    }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ============================================================
  // STATE
  // ============================================================
  const state = {
    loc: null, treeRoot: null, expanded: new Set(),
    visible: localStorage.getItem(KEY_VISIBLE) !== '0',
  };

  // ============================================================
  // SVG helpers (build inline SVGs from icon paths)
  // ============================================================
  function svg(pathD, cls, size) {
    size = size || 16;
    return `<svg class="${cls}" viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><path d="${pathD}"/></svg>`;
  }

  // ============================================================
  // PKCE helpers
  // ============================================================
  function base64url(bytes) {
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(len) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return base64url(bytes).slice(0, len);
  }
  async function sha256base64url(s) {
    const data = new TextEncoder().encode(s);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64url(new Uint8Array(hash));
  }

  // ============================================================
  // OAuth flow
  // ============================================================
  function getAccessToken() {
    const token = sessionStorage.getItem(KEY_ACCESS);
    const expires = parseInt(sessionStorage.getItem(KEY_ACCESS_EXP) || '0', 10);
    if (token && Date.now() < expires) return token;
    return null;
  }
  function storeTokens(data) {
    if (data.access_token) {
      sessionStorage.setItem(KEY_ACCESS, data.access_token);
      const expiresIn = (data.expires_in || 3600) * 1000;
      sessionStorage.setItem(KEY_ACCESS_EXP, String(Date.now() + expiresIn - 60000));
    }
    if (data.refresh_token) localStorage.setItem(KEY_REFRESH, data.refresh_token);
  }
  function clearTokens() {
    sessionStorage.removeItem(KEY_ACCESS);
    sessionStorage.removeItem(KEY_ACCESS_EXP);
    localStorage.removeItem(KEY_REFRESH);
  }

  async function refreshAccessToken() {
    const refresh = localStorage.getItem(KEY_REFRESH);
    if (!refresh) throw new Error('no_refresh_token');
    const res = await fetch('/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refresh,
      }),
    });
    if (!res.ok) {
      clearTokens();
      const text = await res.text().catch(() => '');
      console.error('[ftree] refresh failed', res.status, text);
      throw new Error(`refresh_failed_${res.status}`);
    }
    const data = await res.json();
    storeTokens(data);
    return data.access_token;
  }

  async function startOAuthFlow() {
    if (OAUTH_CLIENT_ID === 'REPLACE_WITH_YOUR_CLIENT_ID' || !OAUTH_CLIENT_ID) {
      throw new Error('OAUTH_CLIENT_ID not configured in footer.tmpl');
    }
    const verifier = randomString(64);
    const stateNonce = randomString(32);
    const challenge = await sha256base64url(verifier);
    sessionStorage.setItem(KEY_OAUTH_STATE, stateNonce);
    sessionStorage.setItem(KEY_OAUTH_VERIFIER, verifier);

    const authorizeUrl = '/login/oauth/authorize?' + new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT,
      response_type: 'code',
      scope: OAUTH_SCOPE,
      state: stateNonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

    const popup = window.open(authorizeUrl, 'ftree-oauth', 'width=520,height=720,popup=yes');
    if (!popup) throw new Error('popup_blocked');

    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => {
        window.removeEventListener('message', handler);
        clearInterval(closedCheck);
        clearTimeout(timeout);
      };
      const handler = async (event) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'ftree-oauth-callback') return;
        if (done) return;
        done = true;
        cleanup();
        try {
          const expectedState = sessionStorage.getItem(KEY_OAUTH_STATE);
          if (event.data.state !== expectedState) throw new Error('state_mismatch');
          const data = await exchangeCodeForToken(event.data.code, verifier);
          sessionStorage.removeItem(KEY_OAUTH_STATE);
          sessionStorage.removeItem(KEY_OAUTH_VERIFIER);
          resolve(data.access_token);
        } catch (e) { reject(e); }
      };
      const closedCheck = setInterval(() => {
        if (popup.closed && !done) {
          done = true;
          cleanup();
          reject(new Error('popup_closed'));
        }
      }, 500);
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        try { popup.close(); } catch {}
        reject(new Error('timeout'));
      }, 5 * 60 * 1000);
      window.addEventListener('message', handler);
    });
  }

  async function exchangeCodeForToken(code, verifier) {
    const res = await fetch('/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: OAUTH_CLIENT_ID,
        code,
        grant_type: 'authorization_code',
        redirect_uri: OAUTH_REDIRECT,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[ftree] code exchange failed', res.status, text);
      throw new Error(`exchange_failed_${res.status}`);
    }
    const data = await res.json();
    storeTokens(data);
    return data;
  }

  // ============================================================
  // API
  // ============================================================
  async function ensureToken() {
    let token = getAccessToken();
    if (token) return token;
    if (localStorage.getItem(KEY_REFRESH)) {
      try { return await refreshAccessToken(); }
      catch (e) { console.warn('[ftree] refresh failed, will need re-auth', e); }
    }
    return null;
  }

  async function api(endpoint) {
    const token = await ensureToken();
    if (!token) {
      const err = new Error('not_authenticated');
      err.needsAuth = true;
      throw err;
    }
    const url = `/api/v1${endpoint}`;
    let res = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      sessionStorage.removeItem(KEY_ACCESS);
      sessionStorage.removeItem(KEY_ACCESS_EXP);
      const fresh = await ensureToken();
      if (fresh && fresh !== token) {
        res = await fetch(url, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${fresh}` },
        });
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[ftree] API error', { endpoint, status: res.status, body: text });
      const err = new Error(`API ${res.status} on ${endpoint}`);
      if (res.status === 401 || res.status === 403) err.needsAuth = true;
      throw err;
    }
    return res.json();
  }

  // ============================================================
  // URL parsing & tree fetching
  // ============================================================
  function parseLocation() {
    const path = window.location.pathname;
    const m = path.match(/^\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/(?:src|raw|media)\/(branch|tag|commit)\/([^\/]+)((?:\/[^?#]*)?))?\/?$/);
    if (!m) return null;
    const [, owner, repo, refType, ref, filepathRaw] = m;
    const reserved = new Set([
      'issues','pulls','wiki','settings','releases','projects','packages','activity',
      'commits','branches','tags','graph','forks','stars','watchers','compare',
      'milestone','milestones','labels','attachments','archive','find','search',
      'actions','hooks','followers','following','members','teams','collaborators',
      '-','user','login','logout','register','admin','api','assets','avatars',
      'notifications','explore','dashboard','repo'
    ]);
    if (reserved.has(owner) || reserved.has(repo)) return null;
    let filepath = '';
    if (filepathRaw) {
      filepath = filepathRaw.replace(/^\//, '');
      try { filepath = decodeURIComponent(filepath); } catch {}
    }
    return { owner, repo, refType: refType || null, ref: ref ? safeDecode(ref) : null, filepath };
  }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

  async function fetchTree(loc) {
    if (!loc.ref) {
      const repo = await api(`/repos/${loc.owner}/${loc.repo}`);
      loc.ref = repo.default_branch;
      loc.refType = 'branch';
    }
    async function fetchOnce(refToUse) {
      return api(`/repos/${loc.owner}/${loc.repo}/git/trees/${encodeURIComponent(refToUse)}?recursive=true&per_page=${MAX_PER_PAGE}`);
    }
    let data;
    try { data = await fetchOnce(loc.ref); }
    catch (e) {
      if (e.needsAuth) throw e;
      let sha = null;
      if (loc.refType === 'tag') {
        try { const t = await api(`/repos/${loc.owner}/${loc.repo}/tags/${encodeURIComponent(loc.ref)}`); sha = t.commit?.sha || t.id; } catch {}
      } else if (loc.refType === 'branch') {
        try { const b = await api(`/repos/${loc.owner}/${loc.repo}/branches/${encodeURIComponent(loc.ref)}`); sha = b.commit?.id; } catch {}
      }
      if (!sha) throw e;
      data = await fetchOnce(sha);
    }
    return { entries: data.tree || [], truncated: !!data.truncated };
  }

  // ============================================================
  // Tree builder & rendering
  // ============================================================
  function buildTree(items) {
    const root = { name: '', path: '', type: 'tree', children: {} };
    for (const item of items) {
      if (!item.path) continue;
      const parts = item.path.split('/');
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        if (!node.children[part]) {
          node.children[part] = { name: part, path: parts.slice(0, i + 1).join('/'), type: isLeaf ? item.type : 'tree', children: {} };
        }
        node = node.children[part];
      }
    }
    return root;
  }
  function sortChildren(node) {
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
  }
  function expandedKey() { return `${KEY_EXPANDED_PREFIX}${state.loc.owner}/${state.loc.repo}`; }
  function loadExpanded() {
    try { const raw = localStorage.getItem(expandedKey()); return new Set(raw ? JSON.parse(raw) : []); }
    catch { return new Set(); }
  }
  function saveExpanded() { try { localStorage.setItem(expandedKey(), JSON.stringify([...state.expanded])); } catch {} }
  function autoExpandAncestors(filepath) {
    if (!filepath) return;
    const parts = filepath.split('/');
    for (let i = 1; i <= parts.length; i++) state.expanded.add(parts.slice(0, i).join('/'));
  }

  function encodePath(p) { return p.split('/').map(encodeURIComponent).join('/'); }
  function buildUrl(path, type) {
    const refType = state.loc.refType || 'branch';
    return `/${state.loc.owner}/${state.loc.repo}/src/${refType}/${encodeURIComponent(state.loc.ref)}/${encodePath(path)}`;
  }

  function renderNode(node, depth) {
    const li = document.createElement('li');
    li.className = `ftree-item ftree-${node.type}`;

    if (node.type === 'tree') {
      const isExpanded = state.expanded.has(node.path);
      const row = document.createElement('div');
      row.className = 'ftree-row ftree-folder-row';
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.innerHTML =
        svg(ICONS.chevron, 'ftree-chevron' + (isExpanded ? ' ftree-expanded' : ''), 12) +
        svg(isExpanded ? ICONS.folderOpen : ICONS.folderClosed, 'ftree-icon-folder', 16) +
        '<span class="ftree-label"></span>';
      row.querySelector('.ftree-label').textContent = node.name;

      if (node.path === state.loc.filepath) row.classList.add('ftree-current');

      row.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey) { window.open(buildUrl(node.path, 'tree'), '_blank'); return; }
        if (state.expanded.has(node.path)) state.expanded.delete(node.path);
        else state.expanded.add(node.path);
        saveExpanded();
        render();
      });
      row.addEventListener('auxclick', (e) => {
        if (e.button === 1) { e.preventDefault(); window.open(buildUrl(node.path, 'tree'), '_blank'); }
      });

      li.appendChild(row);

      if (isExpanded) {
        const ul = document.createElement('ul');
        ul.className = 'ftree-children';
        for (const child of sortChildren(node)) ul.appendChild(renderNode(child, depth + 1));
        li.appendChild(ul);
      }
    } else {
      const a = document.createElement('a');
      a.className = 'ftree-row ftree-file-row';
      a.href = buildUrl(node.path, 'blob');
      a.style.paddingLeft = `${8 + depth * 14 + 14}px`; // align with folder name (no chevron)
      a.innerHTML = svg(ICONS.file, 'ftree-icon-file', 16) + '<span class="ftree-label"></span>';
      a.querySelector('.ftree-label').textContent = node.name;
      if (node.path === state.loc.filepath) a.classList.add('ftree-current');
      li.appendChild(a);
    }
    return li;
  }

  function render() {
    const ul = document.getElementById('ftree-root');
    if (!ul || !state.treeRoot) return;
    ul.innerHTML = '';
    for (const child of sortChildren(state.treeRoot)) ul.appendChild(renderNode(child, 0));
  }

  function scrollCurrentIntoView() {
    requestAnimationFrame(() => {
      const cur = document.querySelector('.ftree-current');
      if (cur) cur.scrollIntoView({ block: 'center' });
    });
  }

  // ============================================================
  // UI
  // ============================================================
  function buildUI() {
    if (document.getElementById('ftree-sidebar')) return;
    const sidebar = document.createElement('aside');
    sidebar.id = 'ftree-sidebar';
    sidebar.innerHTML = `
      <header>
        <span class="ftree-title">Files</span>
        <span class="ftree-actions">
          <button id="ftree-signout" class="ftree-icon-btn" title="Sign out and clear stored tokens">${svg(ICONS.signOut, '', 14)}</button>
          <button id="ftree-hide" class="ftree-icon-btn" title="Hide sidebar">${svg(ICONS.close, '', 14)}</button>
        </span>
      </header>
      <div id="ftree-status">Loading…</div>
      <div id="ftree-scroll"><ul id="ftree-root"></ul></div>
    `;
    document.body.appendChild(sidebar);

    const showBtn = document.createElement('button');
    showBtn.id = 'ftree-show';
    showBtn.title = 'Show file tree';
    showBtn.innerHTML = svg(ICONS.chevron, '', 12);
    showBtn.hidden = true;
    document.body.appendChild(showBtn);

    document.getElementById('ftree-hide').addEventListener('click', () => setVisible(false));
    document.getElementById('ftree-signout').addEventListener('click', () => {
      if (confirm('Sign out and clear stored tokens?')) {
        clearTokens();
        location.reload();
      }
    });
    showBtn.addEventListener('click', () => setVisible(true));
  }

  function setVisible(v) {
    state.visible = v;
    localStorage.setItem(KEY_VISIBLE, v ? '1' : '0');
    const sidebar = document.getElementById('ftree-sidebar');
    const showBtn = document.getElementById('ftree-show');
    if (sidebar) sidebar.style.display = v ? 'flex' : 'none';
    if (showBtn) showBtn.hidden = v;
    document.body.classList.toggle('ftree-active', v);
  }

  function setStatus(msg, isError) {
    const el = document.getElementById('ftree-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    el.classList.toggle('ftree-error', !!isError);
  }

  function showSignInPrompt(message) {
    const ul = document.getElementById('ftree-root');
    if (ul) ul.innerHTML = '';
    const status = document.getElementById('ftree-status');
    if (!status) return;
    status.innerHTML = '';
    status.classList.remove('ftree-error');
    status.style.display = 'block';

    const wrap = document.createElement('div');
    wrap.className = 'ftree-prompt';

    const heading = document.createElement('h3');
    heading.textContent = 'Sign in';

    const msg = document.createElement('p');
    msg.textContent = message || 'Authorize via OAuth to load the file tree.';

    const help = document.createElement('p');
    help.textContent = 'Tokens are stored only in this browser.';

    const btn = document.createElement('button');
    btn.className = 'ftree-btn-primary';
    btn.textContent = 'Sign in with Forgejo';

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Authorizing…';
      try {
        await startOAuthFlow();
        msg.textContent = 'Authorized. Loading…';
        init();
      } catch (e) {
        console.error('[ftree] OAuth failed', e);
        btn.disabled = false;
        btn.textContent = 'Sign in with Forgejo';
        const reasons = {
          popup_blocked: 'Popup was blocked — allow popups for this site and try again.',
          popup_closed: 'Popup was closed before completing.',
          state_mismatch: 'Security check failed. Try again.',
          timeout: 'Timed out waiting for authorization.',
        };
        msg.textContent = reasons[e.message] || `Error: ${e.message}`;
      }
    });

    wrap.append(heading, msg, help, btn);
    status.appendChild(wrap);
  }

  function showTruncatedNotice() {
    const scrollEl = document.getElementById('ftree-scroll');
    if (!scrollEl) return;
    const notice = document.createElement('div');
    notice.className = 'ftree-truncated';
    notice.textContent = `Repo too large — tree truncated (showing first ${MAX_PER_PAGE} entries).`;
    scrollEl.insertBefore(notice, scrollEl.firstChild);
  }

  // ============================================================
  // INIT
  // ============================================================
  async function init() {
    const loc = parseLocation();
    if (!loc) return;
    state.loc = loc;
    buildUI();
    setVisible(state.visible);
    state.expanded = loadExpanded();
    autoExpandAncestors(loc.filepath);

    setStatus('Loading…');

    let token = getAccessToken();
    if (!token && localStorage.getItem(KEY_REFRESH)) {
      try { token = await refreshAccessToken(); }
      catch { /* fall through to sign-in prompt */ }
    }
    if (!token) {
      showSignInPrompt();
      return;
    }

    try {
      const { entries, truncated } = await fetchTree(loc);
      state.treeRoot = buildTree(entries);
      setStatus('');
      render();
      if (truncated) showTruncatedNotice();
      scrollCurrentIntoView();
    } catch (e) {
      console.error('[ftree]', e);
      if (e.needsAuth) showSignInPrompt('Token rejected. Please sign in again.');
      else setStatus(`Error: ${e.message}`, true);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
