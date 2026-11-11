/* =====================================================================
   NOVA TV — app controller: login, routing, events, updates, boot
   ===================================================================== */
'use strict';

const App = {
  afterPlayerClose(wasLive) {
    if (S.view === 'home') go('home', null, { push: false });
    else if (S.view === 'detail') S.detail?.redraw?.();
    else if (S.view === 'live' && wasLive) {
      S.renderLiveChannels?.();
      const ch = S.maps.live.get(S.ui.live.sel);
      if (ch) { if ($('#gInfo')) renderGuideInfo(ch); else renderPvInfo(ch); }
    }
  },
};

/* =====================================================================
   LOGIN
   ===================================================================== */
let loginMode = 'xtream';
function showLogin({ adding = false } = {}) {
  $('#shell').classList.add('hidden');
  $('#who').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#loginError').classList.add('hidden');
  const accounts = store.get('profiles', []);
  $('#savedProfiles').innerHTML = accounts.length && !adding
    ? `<div class="lbl">Saved playlists</div>` + accounts.map((p) => `
      <div class="profile-row" data-act="use-account" data-id="${esc(p.id)}" role="button" tabindex="0">
        <div class="pav">${esc(initials(p.name))}</div>
        <div class="pmeta"><div class="pname">${esc(p.name)}</div><div class="phost">${esc(p.type === 'xtream' ? p.username + ' @ ' + hostOf(p.server) : hostOf(p.m3u))}</div></div>
        <button class="icon-btn pdel" data-act="del-account" data-id="${esc(p.id)}" title="Remove">${ic('trash')}</button>
      </div>`).join('')
    : '';
  let cancel = $('#loginCancel');
  if (adding && S.account) {
    if (!cancel) {
      cancel = document.createElement('button');
      cancel.type = 'button'; cancel.id = 'loginCancel'; cancel.className = 'btn ghost wide'; cancel.style.marginTop = '10px';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => { $('#login').classList.add('hidden'); $('#shell').classList.remove('hidden'); };
      $('#loginForm').appendChild(cancel);
    }
  } else cancel?.remove();
  setTimeout(() => $('#loginForm [name=server]')?.focus(), 50);
}
$$('.seg-btn').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  loginMode = b.dataset.mode;
  $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
  $('.mode-xtream').classList.toggle('hidden', loginMode !== 'xtream');
  $('.mode-m3u').classList.toggle('hidden', loginMode !== 'm3u');
}));
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const errBox = $('#loginError');
  const showErr = (m) => { errBox.textContent = m; errBox.classList.remove('hidden'); };
  errBox.classList.add('hidden');
  let p = { id: uid(), name: (f.get('name') || '').trim() };
  if (loginMode === 'xtream') {
    p = { ...p, type: 'xtream', server: (f.get('server') || '').trim(), username: (f.get('username') || '').trim(), password: f.get('password') || '' };
    if (!p.server || !p.username || !p.password) return showErr('Fill in the server URL, username and password.');
  } else {
    const m3u = (f.get('m3u') || '').trim();
    if (!m3u) return showErr('Paste your M3U link.');
    const x = xtreamFromM3U(m3u);
    p = x ? { ...p, type: 'xtream', ...x, m3u } : { ...p, type: 'm3u', m3u };
  }
  if (!p.name) p.name = p.type === 'xtream' ? hostOf(p.server).split(':')[0] : 'My playlist';
  const btn = $('#loginBtn');
  btn.disabled = true; btn.innerHTML = '<span>Connecting…</span>';
  try {
    const prov = makeProvider(p);
    await prov.auth();
    const accounts = store.get('profiles', []).filter((x) => !(x.type === p.type && x.server === p.server && x.username === p.username && x.m3u === p.m3u));
    accounts.unshift(p);
    store.set('profiles', accounts);
    e.target.reset();
    await enter(p, prov);
  } catch (err) {
    showErr(err.message || String(err));
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>Connect</span>';
  }
});
async function useAccount(id) {
  const p = store.get('profiles', []).find((x) => x.id === id);
  if (!p) return;
  const row = $(`.profile-row[data-id="${CSS.escape(id)}"] .phost`);
  if (row) row.textContent = 'Connecting…';
  try {
    const prov = makeProvider(p);
    await prov.auth();
    await enter(p, prov);
  } catch (err) {
    if (!$('#login').classList.contains('hidden')) { const box = $('#loginError'); box.textContent = `${p.name}: ${err.message}`; box.classList.remove('hidden'); }
    else toast(`${p.name}: ${err.message}`, { err: true });
    if (row) row.textContent = 'Connection failed';
  }
}
async function enter(acct, prov) {
  player.close(true);
  preview?.stop();
  S.account = acct; S.provider = prov; S.info = prov.info;
  S.data = { live: null, movies: null, series: null }; S.loading = {};
  Object.values(S.maps).forEach((m) => m.clear());
  epgCache.clear();
  S.ui = { live: { cat: 'all', q: '', sel: null, offset: 0 }, movies: { cat: 'all', q: '' }, series: { cat: 'all', q: '' } };
  store.set('current', acct.id);
  $('#login').classList.add('hidden');
  loadSection('live').catch(() => {});
  loadSection('movies').catch(() => {});
  loadSection('series').catch(() => {});
  const list = People.ensure();
  const cur = People.current();
  if (list.length > 1 || !cur) {
    if (list.length === 1) { People.use(list[0]); return startShell(); }
    return renderWho('pick');
  }
  People.use(cur);
  startShell();
}
function startShell() {
  $('#who').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  renderAvatar();
  S.stack = [];
  go('home', null, { push: false });
}
function renderAvatar() {
  const b = $('#avatarBtn');
  b.textContent = initials(S.person?.name || '?');
  b.style.setProperty('--pc', S.person?.color || PERSON_COLORS[0]);
}
function renderAvatarMenu() {
  const m = $('#avatarMenu');
  const i = S.info || {};
  const people = People.list();
  m.innerHTML = people.map((p) => `<button class="mi ${p.id === S.person?.id ? 'on' : ''}" data-act="who-pick" data-id="${esc(p.id)}"><span class="avatar" style="--pc:${p.color}">${esc(initials(p.name))}</span>${esc(p.name)}${p.id === S.person?.id ? ' ' + ic('check') : ''}</button>`).join('')
    + `<button class="mi" data-act="who-manage">${ic('users')} Manage profiles</button><div class="sep"></div>`
    + `<button class="mi" data-act="go" data-view="settings">${ic('settings')} Settings</button>`
    + `<button class="mi" data-act="add-account">${ic('plus')} Add playlist</button>`
    + `<button class="mi" data-act="logout">${ic('logout')} Log out</button>`
    + `<div class="sep"></div><div class="mono" style="font-size:11px;color:var(--muted);padding:6px 12px 4px">${esc(S.account?.name || '')}${i.exp ? ' · expires ' + esc(fmtDate(i.exp)) : ''}</div>`;
}

/* =====================================================================
   PIN
   ===================================================================== */
function askPin(onOk, { setNew = false } = {}) {
  if (!setNew && !S.settings.pin) return onOk();
  $('.pinbox')?.remove();
  const d = document.createElement('div');
  d.className = 'pinbox';
  d.innerHTML = `<form class="pin-card"><h3>${setNew ? 'Choose a 4-digit PIN' : 'Enter PIN'}</h3><input inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" aria-label="PIN"><div class="pin-err hidden">Wrong PIN</div><div style="display:flex;gap:10px"><button class="btn accent" type="submit" style="flex:1">${setNew ? 'Save PIN' : 'Unlock'}</button><button class="btn ghost" type="button">Cancel</button></div></form>`;
  document.body.appendChild(d);
  const inp = d.querySelector('input');
  setTimeout(() => inp.focus(), 30);
  d.querySelector('.btn.ghost').onclick = () => d.remove();
  d.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const v = inp.value.trim();
    if (setNew) { if (!/^\d{4}$/.test(v)) { d.querySelector('.pin-err').textContent = 'Use 4 digits'; d.querySelector('.pin-err').classList.remove('hidden'); return; } S.settings.pin = v; saveSettings(); d.remove(); toast('PIN saved'); return onOk(); }
    if (v === S.settings.pin) { d.remove(); onOk(); } else { inp.value = ''; d.querySelector('.pin-err').classList.remove('hidden'); }
  };
}
const kidsGuard = (fn) => (S.person?.kids ? askPin(fn) : fn());

/* =====================================================================
   ROUTER
   ===================================================================== */
const VIEW_MODE = { home: '', detail: '', live: 'fixed', movies: 'fixed', series: 'fixed', mylist: 'padded', search: 'padded', settings: 'padded' };
const TAB_OF = { home: 'home', live: 'live', movies: 'movies', series: 'series', mylist: 'mylist' };
function go(view, params = null, { push = true } = {}) {
  closeMenus();
  if (push && S.view && S.view !== view || (push && view === 'detail')) S.stack.push({ view: S.view, params: S.params, scroll: $('#view').scrollTop });
  if (S.stack.length > 30) S.stack.shift();
  if (view !== 'live') preview?.stop();
  if (view !== 'home') clearInterval(bbTimer);
  if (view !== 'detail') S.detail = null;
  S.view = view; S.params = params;
  const v = $('#view');
  v.className = 'view ' + (VIEW_MODE[view] || '');
  const tab = TAB_OF[view] || (view === 'detail' ? (params?.kind === 'movie' ? 'movies' : 'series') : '');
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === tab));
  v.innerHTML = '';
  v.scrollTop = 0;
  const page = document.createElement('div');
  page.className = 'page-in';
  v.appendChild(page);
  updateNav();
  ({
    home: () => renderHome(page),
    detail: () => renderDetail(page, params),
    live: () => renderLive(page),
    movies: () => renderVod(page, 'movies'),
    series: () => renderVod(page, 'series'),
    mylist: () => renderMyList(page),
    search: () => renderSearch(page, params || {}),
    settings: () => renderSettings(page),
  })[view]?.();
}
function back() {
  const prev = S.stack.pop();
  if (!prev) return go('home', null, { push: false });
  go(prev.view, prev.params, { push: false });
  if (prev.scroll) setTimeout(() => { $('#view').scrollTop = prev.scroll; }, 400);
}
function updateNav() {
  const solid = VIEW_MODE[S.view] !== '' || $('#view').scrollTop > 40;
  $('#topnav').classList.toggle('solid', solid);
}
$('#view').addEventListener('scroll', () => updateNav(), { passive: true });
function closeMenus() { $('#avatarMenu').classList.add('hidden'); }

/* =====================================================================
   GLOBAL EVENTS
   ===================================================================== */
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('loaded'); }, true);
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const card = img.closest('.poster[data-kind]');
  if (card && !img.dataset.retried && S.settings.enhance) {
    img.dataset.retried = '1';
    const it = S.maps[card.dataset.kind]?.get(card.dataset.id);
    if (it) { Meta.forItem(it, card.dataset.kind).then((d) => { if (d?.poster && img.isConnected) img.src = d.poster; else img.remove(); }); return; }
  }
  if (img.classList.contains('bb-logo')) { const h = document.createElement('h1'); h.textContent = img.alt; img.replaceWith(h); return; }
  img.remove();
}, true);

$('.tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) go(t.dataset.view); });
$('#avatarBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#avatarMenu'); if (m.classList.contains('hidden')) { renderAvatarMenu(); m.classList.remove('hidden'); } else m.classList.add('hidden'); });
document.addEventListener('click', (e) => { if (!e.target.closest('#avatarMenu') && !e.target.closest('#avatarBtn')) closeMenus(); });

async function resumeHistory(key) {
  const h = history()[key];
  if (!h) return;
  if (h.kind === 'movie') {
    const m = S.maps.movie.get(h.id) || { id: h.id, name: h.name || h.title, poster: h.img, ext: h.ext, url: h.url, imdb: h.imdb };
    return player.openMovie(m);
  }
  await loadSection('series').catch(() => {});
  const s = S.maps.series.get(h.seriesId);
  if (!s) return toast("That show isn't in your playlist anymore", { err: true });
  try {
    const info = (S.detail?.id === s.id && S.detail.info?.seasons) ? S.detail.info : await S.provider.seriesInfo(s);
    player.openEpisode(s, info, h.season, h.id);
  } catch (err) { toast(err.message, { err: true }); }
}
function confirmInline(btn, msg) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; btn.style.color = 'var(--danger)';
  toast(msg);
  setTimeout(() => { delete btn.dataset.armed; btn.style.color = ''; }, 3000);
  return false;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('#player')) return;
  const a = b.dataset.act, id = b.dataset.id;
  switch (a) {
    case 'go': if (b.dataset.view === 'settings') kidsGuard(() => go('settings')); else go(b.dataset.view); break;
    case 'pin-set': (S.settings.pin ? (f) => askPin(f) : (f) => f())(() => askPin(() => go('settings', null, { push: false }), { setNew: true })); break;
    case 'back': back(); break;
    case 'open': go('detail', { kind: b.dataset.kind, id }); break;
    case 'play-movie': {
      const m = S.maps.movie.get(id) || favs().movie?.[id];
      if (m) player.openMovie(m, { restart: !!b.dataset.restart });
      break;
    }
    case 'play-ep': if (S.detail?.info?.seasons) player.openEpisode(S.detail.it, S.detail.info, b.dataset.season, id); break;
    case 'season': if (S.detail) { S.detail.season = Number(b.dataset.n); S.detail.redrawEps(); } break;
    case 'resume': if (!e.target.closest('[data-act="rm-hist"]')) resumeHistory(b.dataset.key); break;
    case 'rm-hist': { e.stopPropagation(); const h = history(); delete h[b.dataset.key]; store.set(pkey('hist'), h); b.closest('.land')?.remove(); break; }
    case 'fav': {
      const kind = b.dataset.kind;
      const it = S.maps[kind].get(id) || favs()[kind]?.[id];
      if (!it) return;
      const on = toggleFav(kind, it);
      toast(on ? 'Added to My List' : 'Removed from My List');
      if (b.classList.contains('icon-btn')) { b.classList.toggle('on', on); b.innerHTML = ic(on ? 'check' : 'plus'); }
      else if (b.classList.contains('btn')) b.innerHTML = `${ic(on ? 'check' : 'plus')} My List`;
      $$(`.poster[data-kind="${kind}"][data-id="${CSS.escape(id)}"]`).forEach((p) => {
        p.querySelector('.fav-dot')?.remove();
        if (on) p.querySelector('.pimg').insertAdjacentHTML('beforeend', `<div class="fav-dot">${ic('heart', 'fill')}</div>`);
      });
      break;
    }
    case 'trailer': {
      const yt = b.dataset.yt; const url = /^https?:/.test(yt) ? yt : `https://www.youtube.com/watch?v=${yt}`;
      if (window.nova) window.nova.openLink(url); else window.open(url);
      break;
    }
    case 'row-l': case 'row-r': { const t = b.parentElement.querySelector('.row-track'); t.scrollBy({ left: (a === 'row-l' ? -1 : 1) * t.clientWidth * 0.85, behavior: 'smooth' }); break; }
    case 'bb-go': S.bbShow?.(Number(b.dataset.i)); break;
    case 'sel-live': if (e.target.closest('[data-act="fav-live"]')) return; if (S.view === 'live') selectLive(id); else openLiveFull(id); break;
    case 'fav-live': {
      e.stopPropagation();
      const ch = S.maps.live.get(id); if (!ch) return;
      const on = toggleFav('live', ch);
      $$(`.star[data-act="fav-live"][data-id="${CSS.escape(id)}"], .icon-btn[data-act="fav-live"][data-id="${CSS.escape(id)}"]`).forEach((x) => x.classList.toggle('on', on));
      if ($('#gInfo') && S.ui.live.sel === id) renderGuideInfo(ch);
      if (S.view === 'live') { S.renderLiveCats?.(); if (S.ui.live.cat === 'fav') S.renderLiveChannels(); }
      toast(on ? `${ch.name} added to favorites` : `${ch.name} removed from favorites`);
      break;
    }
    case 'play-live': openLiveFull(id); break;
    case 'pv-full': openLiveFull(); break;
    case 'live-cat': S.ui.live.cat = b.dataset.cat; $$('#catList .cat').forEach((c) => c.classList.toggle('active', c === b)); S.renderLiveChannels(); $('#chanList').scrollTop = 0; break;
    case 'vod-cat': S.ui[S.view].cat = b.dataset.cat; $$('#catList .cat').forEach((c) => c.classList.toggle('active', c === b)); S.renderVodGrid(); break;
    case 'live-mode': if (S.settings.liveMode !== b.dataset.mode) { S.settings.liveMode = b.dataset.mode; saveSettings(); go('live', null, { push: false }); } break;
    case 'g-shift': S.ui.live.offset = b.dataset.d === '0' ? 0 : S.ui.live.offset + Number(b.dataset.d); S.guideRedraw?.(); break;
    case 'g-prog': {
      const ch = S.maps.live.get(b.dataset.ch); if (!ch) return;
      const s = Number(b.dataset.s), en = Number(b.dataset.e), n = Date.now();
      if (s <= n && en > n) selectLive(ch.id);
      else if (en <= n) {
        if (ch.archive) { preview?.stop(); player.openCatchup(ch, { start: s, end: en, title: b.querySelector('b')?.textContent }); }
        else toast('This channel doesn\'t offer catch-up');
      } else toast(`Starts at ${fmtClock(new Date(s))}`);
      break;
    }
    case 'g-restart': { const ch = S.maps.live.get(b.dataset.ch); if (ch) { preview?.stop(); player.openCatchup(ch, { start: Number(b.dataset.s), end: Number(b.dataset.e), title: $('#gInfo h1')?.textContent }); } break; }
    case 'use-account': if (!e.target.closest('[data-act="del-account"]')) useAccount(id); break;
    case 'del-account': {
      e.stopPropagation();
      if (!confirmInline(b, 'Click the bin again to remove this playlist')) return;
      store.set('profiles', store.get('profiles', []).filter((x) => x.id !== id));
      if (!$('#shell').classList.contains('hidden') && S.view === 'settings') go('settings', null, { push: false }); else showLogin();
      break;
    }
    case 'add-account': closeMenus(); showLogin({ adding: true }); break;
    case 'refresh':
      S.data = { live: null, movies: null, series: null }; S.loading = {}; epgCache.clear();
      toast('Refreshing your playlist…');
      try { await S.provider.auth(); S.info = S.provider.info; } catch {}
      go('home', null, { push: false });
      break;
    case 'clear-hist': store.del(pkey('hist')); store.del(pkey('recentLive')); toast('Watch history cleared'); break;
    case 'logout': player.close(true); preview?.stop(); store.del('current'); S.account = null; S.person = null; showLogin(); break;
    case 'check-updates': {
      if (!window.nova?.checkUpdates) return toast('Updates work in the Mac app');
      b.disabled = true; const r = await window.nova.checkUpdates(); b.disabled = false;
      if (r.status === 'latest') toast("You're on the latest version");
      else if (r.status === 'error') toast("Couldn't check for updates right now", { err: true });
      break;
    }
    case 'who-pick': {
      const p = People.list().find((x) => x.id === id); if (!p) return;
      closeMenus();
      if (S.person?.kids && !p.kids && b.dataset.unlocked !== '1' && S.settings.pin) { return askPin(() => { b.dataset.unlocked = '1'; b.click(); }); }
      const changed = S.person?.id !== p.id;
      People.use(p);
      if (!$('#who').classList.contains('hidden') || changed) startShell();
      break;
    }
    case 'who-manage': closeMenus(); kidsGuard(() => renderWho('manage')); break;
    case 'who-edit': renderWho('form', id); break;
    case 'who-add': renderWho('form'); break;
    case 'who-done': {
      const list = People.list();
      if (!S.person || !list.some((p) => p.id === S.person.id)) { if (list.length === 1) People.use(list[0]); else return renderWho('pick'); }
      else S.person = list.find((p) => p.id === S.person.id);
      startShell();
      break;
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (player.open) { player.key(e); return; }
  if (!$('#login').classList.contains('hidden') || !$('#who').classList.contains('hidden')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f')) { e.preventDefault(); $('#globalSearch').focus(); return; }
  if (e.key === 'Escape') {
    if (!$('#avatarMenu').classList.contains('hidden')) return closeMenus();
    if (typing) return document.activeElement.blur();
    if (S.view === 'detail') return back();
    return;
  }
  if (typing) return;
  if (S.view === 'live' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && S.liveList?.length) {
    e.preventDefault();
    const i = S.liveList.findIndex((c) => c.id === S.ui.live.sel);
    const nx = S.liveList[Math.min(S.liveList.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (nx) { selectLive(nx.id); $(`.chan[data-id="${CSS.escape(nx.id)}"], .g-ch[data-id="${CSS.escape(nx.id)}"]`)?.scrollIntoView({ block: 'nearest' }); }
  }
  if (S.view === 'live' && e.key === 'Enter' && S.ui.live.sel) openLiveFull();
});

$('#globalSearch').addEventListener('input', debounce((e) => {
  if (!S.account) return;
  const q = e.target.value;
  if (S.view !== 'search') { if (q.trim()) go('search', { q }); }
  else { const b = $('#bigQ'); if (b) { b.value = q; b.dispatchEvent(new Event('input')); } }
}, 250));
$('#globalSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.view !== 'search') go('search', { q: e.target.value }); });

setInterval(() => { $('#clock').textContent = fmtClock(new Date()); }, 10000);
$('#clock').textContent = fmtClock(new Date());

/* =====================================================================
   UPDATES
   ===================================================================== */
function banner(html, onClick, label) {
  $('.upd')?.remove();
  const d = document.createElement('div');
  d.className = 'upd';
  d.innerHTML = `${html}<button class="btn accent">${esc(label)}</button><button class="icon-btn plain" aria-label="Later" style="width:34px;height:34px">${ic('x')}</button>`;
  d.querySelector('.btn').onclick = onClick;
  d.querySelector('.icon-btn').onclick = () => d.remove();
  document.body.appendChild(d);
}
window.nova?.onUiUpdate?.((u) => {
  if (player.open) return; // applies quietly next launch
  banner(`<span>✨ Nova TV ${esc(u.version)} is ready${u.notes ? ' — ' + esc(u.notes) : ''}</span>`, () => window.nova.reloadUi(), 'Restart now');
});
window.nova?.onShellUpdate?.((u) => {
  banner(`<span>A new version of the Nova TV app (${esc(u.version)}) is available</span>`, async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Installing…';
    const r = await window.nova.installShellUpdate();
    if (!r.ok) { toast(r.error || 'Update failed', { err: true }); ev.target.disabled = false; ev.target.textContent = 'Install'; }
  }, 'Install');
});

/* =====================================================================
   BOOT
   ===================================================================== */
(async function boot() {
  hydrateIcons();
  applyTheme();
  window.nova?.setUserAgent(S.settings.ua);
  const cur = store.get('current', null);
  const p = store.get('profiles', []).find((x) => x.id === cur);
  if (!p) return showLogin();
  const prov = makeProvider(p);
  $('#shell').classList.remove('hidden');
  $('#view').innerHTML = '<div class="center-state"><div class="spinner"></div><div>Connecting to your provider…</div></div>';
  try {
    await prov.auth();
    await enter(p, prov);
  } catch (err) {
    showLogin();
    const box = $('#loginError');
    box.textContent = `Couldn't connect to "${p.name}": ${err.message}`;
    box.classList.remove('hidden');
  }
})();
