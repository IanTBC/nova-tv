/* Nova TV — Android TV layer.
   Only runs inside the Android TV app (window.NovaAndroid exists): builds the
   window.nova bridge and adds remote-control (D-pad) navigation. On the Mac it does nothing. */
(function () {
  const A = window.NovaAndroid;
  if (!A) return;
  document.documentElement.classList.add('tv');

  /* ---------------- bridge ---------------- */
  const pend = {}, h = {};
  window.__novaEvt = (t, d) => { if (pend[t]) { const f = pend[t]; delete pend[t]; f(d); } else if (h[t]) h[t](d); };
  const call = (t, fn) => new Promise((r) => { pend[t] = r; fn(); });
  const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  window.nova = {
    platform: 'androidtv',
    setUserAgent: (k) => { A.setUserAgent(k || 'default'); return Promise.resolve(true); },
    openExternalPlayer: (_p, url) => Promise.resolve(j(A.openExternal(String(url || '')), { ok: false, error: 'No player app found' })),
    openLink: (u) => A.openLink(String(u || '')),
    versions: () => Promise.resolve(j(A.versions(), {})),
    checkUpdates: () => call('check', () => A.checkUpdates()),
    installShellUpdate: () => call('install', () => A.installUpdate()),
    reloadUi: () => A.reloadUi(),
    onUiUpdate: (fn) => { h.ui = fn; },
    onShellUpdate: (fn) => { h.shell = fn; },
  };

  /* ---------------- focus helpers ---------------- */
  const SEL = 'button:not([disabled]), a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const visible = (el) => {
    if (el.closest('.hidden, [hidden], .row-arrow')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  // the area the remote is allowed to move in (topmost layer wins)
  function scope() {
    const pin = document.querySelector('.pinbox');
    if (pin) return pin;
    const menu = document.querySelector('#avatarMenu:not(.hidden)');
    if (menu) return menu;
    if (player.open) {
      const panel = document.querySelector('#pPanel:not(.hidden), #pDrawer:not(.hidden), #pError:not(.hidden)');
      return panel || document.getElementById('player');
    }
    for (const id of ['login', 'who']) { const el = document.getElementById(id); if (el && !el.classList.contains('hidden')) return el; }
    return document.getElementById('shell');
  }
  const items = (root) => [...root.querySelectorAll(SEL)].filter((el) => !el.parentElement.closest('button') && visible(el));

  function focusEl(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    // keep the focused card in view: rows scroll sideways, the page scrolls vertically
    const track = el.closest('.row-track, .rank-track, .tabs, .chips, .p-drawer-list, .pop, .g-list, .chan-list');
    if (track) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    const r = el.getBoundingClientRect();
    if (!track || r.top < 90 || r.bottom > innerHeight - 40) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }

  function move(dir) {
    const root = scope();
    const list = items(root);
    if (!list.length) return false;
    const cur = document.activeElement;
    if (!cur || cur === document.body || !root.contains(cur) || !list.includes(cur)) { focusEl(first(root, list)); return true; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main, cross;
      if (dir === 'left') { if (b.right > a.left + 2 && bx >= ax) continue; main = a.left - b.right; cross = Math.abs(by - ay); if (b.bottom > a.top && b.top < a.bottom) cross = 0; }
      else if (dir === 'right') { if (b.left < a.right - 2 && bx <= ax) continue; main = b.left - a.right; cross = Math.abs(by - ay); if (b.bottom > a.top && b.top < a.bottom) cross = 0; }
      else if (dir === 'up') { if (b.bottom > a.top + 2 && by >= ay) continue; main = a.top - b.bottom; cross = Math.abs(bx - ax); if (b.right > a.left && b.left < a.right) cross = 0; }
      else { if (b.top < a.bottom - 2 && by <= ay) continue; main = b.top - a.bottom; cross = Math.abs(bx - ax); if (b.right > a.left && b.left < a.right) cross = 0; }
      const score = Math.max(0, main) + cross * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { focusEl(best); return true; }
    return false;
  }
  function first(root, list) {
    const pref = root.querySelector('.who-card, .profile-row, #billboard .btn, .btn.accent, .tab.active, .poster, .chan');
    return (pref && list.includes(pref)) ? pref : list[0];
  }

  /* ---------------- player on TV ---------------- */
  const P = () => document.getElementById('player');
  const inControls = () => { const el = document.activeElement; return !!(el && P().contains(el) && el !== document.body); };
  function playerKey(e) {
    const panel = document.querySelector('#pPanel:not(.hidden), #pDrawer:not(.hidden), #pError:not(.hidden)');
    const k = e.key;
    if (panel || inControls()) {
      if (k.startsWith('Arrow')) { e.preventDefault(); e.stopImmediatePropagation(); P().classList.remove('idle'); move(k.slice(5).toLowerCase()); return; }
      return; // Enter clicks the focused control
    }
    if (k === 'Enter') {
      // OK: pause/play and show the controls with the play button focused
      e.preventDefault(); e.stopImmediatePropagation();
      player.key({ key: ' ', preventDefault() {} });
      const btn = P().querySelector('[data-act="p-toggle"]');
      if (btn) focusEl(btn);
    }
    // arrows with controls hidden fall through to the player: ←/→ seek, ↑/↓ channel or volume
  }

  /* ---------------- keys ---------------- */
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause') { if (player.open) { e.preventDefault(); player.key({ key: ' ', preventDefault() {} }); } return; }
    if (k === 'MediaFastForward' || k === 'MediaRewind') { if (player.open) { e.preventDefault(); player.key({ key: k === 'MediaRewind' ? 'ArrowLeft' : 'ArrowRight', preventDefault() {} }); } return; }
    if (player.open) return playerKey(e);
    const el = document.activeElement;
    const typing = el && /INPUT|TEXTAREA/.test(el.tagName);
    if (k.startsWith('Arrow')) {
      if (typing && (k === 'ArrowLeft' || k === 'ArrowRight') && el.value && el.selectionStart !== (k === 'ArrowLeft' ? 0 : el.value.length)) return;
      if (el && el.tagName === 'SELECT') return;
      e.preventDefault(); e.stopImmediatePropagation();
      move(k.slice(5).toLowerCase());
    } else if (k === 'Enter' && el && el.matches && el.matches('.chan, .g-ch')) {
      // first OK previews the channel, second OK opens it full screen
      e.stopImmediatePropagation();
      if (S.ui?.live?.sel === el.dataset.id && typeof openLiveFull === 'function') { e.preventDefault(); openLiveFull(); }
    } else if (k === 'Enter' && typing) {
      if (el.form && el.type !== 'search') return; // submit
      A.showKeyboard();
    }
  }, true);

  // when a text box gets focus with OK, open the TV keyboard
  document.addEventListener('click', (e) => { if (e.target.matches && e.target.matches('input, textarea')) A.showKeyboard(); }, true);

  // Back button on the remote — returns true if handled, false to leave the app
  window.__tvBack = function () {
    const el = document.activeElement;
    if (el && /INPUT|TEXTAREA/.test(el.tagName)) { el.blur(); return true; }
    if (player.open) {
      if (inControls() && !document.querySelector('#pPanel:not(.hidden), #pDrawer:not(.hidden)')) { el.blur(); P().classList.add('idle'); return true; }
      player.key({ key: 'Escape', preventDefault() {} });
      return true;
    }
    const pin = document.querySelector('.pinbox');
    if (pin) { pin.remove(); return true; }
    if (!document.getElementById('avatarMenu')?.classList.contains('hidden')) { closeMenus(); return true; }
    const shell = document.getElementById('shell');
    if (shell && !shell.classList.contains('hidden') && typeof S !== 'undefined') {
      if (S.view === 'detail' || S.view === 'kickch') { back(); return true; }
      if (S.view !== 'home') { go('home'); return true; }
    }
    return false;
  };

  // text tweaks for TV
  document.addEventListener('DOMContentLoaded', () => {
    const f = document.querySelector('#login .fine');
    if (f) f.textContent = 'Your login is stored only on this TV.';
    const ext = document.querySelector('[data-act="p-external"]');
    if (ext) ext.textContent = 'Open in VLC';
    document.querySelector('.tab[data-view="kick"]')?.remove();
  });
})();
