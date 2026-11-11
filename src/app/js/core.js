/* =====================================================================
   NOVA TV — core: helpers, storage, icons, network, providers, engine
   ===================================================================== */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => Math.random().toString(36).slice(2, 10);
const initials = (s) => String(s || '?').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';
const cssUrl = (u) => `url('${String(u || '').replace(/['\\\n]/g, encodeURIComponent)}')`;

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
const fmtLeft = (sec) => { sec = Math.max(0, sec); const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')} left` : `${m} min left`; };
const fmtClock = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (d) => d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const yearOf = (s) => (String(s || '').match(/(19|20)\d{2}/) || [''])[0];
function b64(s) {
  if (!s) return '';
  try { return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch { return s; }
}

/* ---------------- storage ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('nova.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nova.' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('nova.' + k); } catch {} },
};

/* ---------------- icons ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  tv: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="m8 2.5 4 3.5 4-3.5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4M3 12h18"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  heart: '<path d="M12 20s-7.5-4.5-9.3-9.2C1.5 7.4 3.7 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.5 0 5.7 3.4 4.5 6.8C19.5 15.5 12 20 12 20z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/>',
  rewind: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  forward: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  'skip-back': '<path d="M19 20 9 12l10-8z"/><path d="M5 19V5"/>',
  'skip-fwd': '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  cc: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 15h4M13 15h4M7 11h10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  external: '<path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
  mini: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><rect x="12" y="11" width="7" height="6" rx="1.2"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>',
  signal: '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="m10 9 5 3-5 3z"/>',
  quality: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 9v6M7 12h3M10 9v6M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H14z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
};
const ic = (name, cls = '') => `<i data-icon="${name}" class="${cls}"><svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg></i>`;
function hydrateIcons(root = document) {
  $$('i[data-icon]', root).forEach((el) => { if (!el.firstElementChild) el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[el.dataset.icon] || ''}</svg>`; });
}
function setIcon(el, name) { if (!el) return; el.dataset.icon = name; el.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>`; }

/* ---------------- toasts ---------------- */
function toast(msg, { err = false, action, onAction, ms = 3800 } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '') + (action ? '' : ' solo');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { onAction?.(); t.remove(); };
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; setTimeout(() => t.remove(), 300); }, ms);
}

/* ---------------- network ---------------- */
async function fetchText(url, ms = 30000) {
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`Server answered ${r.status}`);
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The server took too long to respond');
    if (e instanceof TypeError) throw new Error("Couldn't reach the server — check the URL and your internet connection");
    throw e;
  } finally { clearTimeout(tm); }
}
async function fetchJSON(url, ms) {
  const t = await fetchText(url, ms);
  try { return JSON.parse(t); } catch { throw new Error('The server returned an unexpected response'); }
}
function normBase(server) {
  let s = String(server || '').trim();
  if (!s) throw new Error('Enter your server URL');
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  const u = new URL(s);
  return u.origin + u.pathname.replace(/\/(player_api|get|xmltv|panel_api)\.php.*$/i, '').replace(/\/+$/, '');
}
function xtreamFromM3U(url) {
  try {
    const u = new URL(url.trim());
    const username = u.searchParams.get('username'), password = u.searchParams.get('password');
    if (username && password) return { server: u.origin + u.pathname.replace(/\/[^/]*\.php$/i, ''), username, password };
  } catch {}
  return null;
}
const hostOf = (u) => { try { return new URL(/^https?:/i.test(u) ? u : 'http://' + u).host; } catch { return u || ''; } };

/* =====================================================================
   PROVIDERS
   ===================================================================== */
class XtreamProvider {
  constructor(p) {
    this.p = p; this.kind = 'xtream';
    this.base = normBase(p.server);
    this.u = encodeURIComponent(p.username);
    this.pw = encodeURIComponent(p.password);
  }
  api(action, extra = '') {
    return fetchJSON(`${this.base}/player_api.php?username=${this.u}&password=${this.pw}${action ? '&action=' + action : ''}${extra}`, action ? 60000 : 20000);
  }
  async auth() {
    // Some providers only answer known IPTV apps: retry identifying as one.
    let r, lastErr;
    const order = [store.get('settings', {}).ua || 'default', 'vlc', 'smarters', 'tivimate'].filter((v, i, a) => a.indexOf(v) === i);
    for (const ua of order) {
      try {
        await window.nova?.setUserAgent?.(ua);
        r = await this.api('');
        if (r && r.user_info) { const st = store.get('settings', {}); if ((st.ua || 'default') !== ua) { st.ua = ua; store.set('settings', st); if (typeof S !== 'undefined') S.settings.ua = ua; } break; }
      } catch (e) { lastErr = e; if (!window.nova) break; }
    }
    if (!r && lastErr) throw new Error(/40[134]/.test(lastErr.message) ? "The server refused the login. Check the username and password (they're case-sensitive) and the server URL." : lastErr.message);
    if (!r || !r.user_info) throw new Error("This doesn't look like an Xtream Codes server. Double-check the server URL.");
    if (String(r.user_info.auth) !== '1') throw new Error('Wrong username or password');
    const ui = r.user_info;
    this.info = {
      status: ui.status || 'Active',
      exp: ui.exp_date && ui.exp_date !== 'null' ? new Date(Number(ui.exp_date) * 1000) : null,
      maxCons: ui.max_connections, activeCons: ui.active_cons,
      formats: ui.allowed_output_formats || [],
      tz: r.server_info?.timezone || '',
    };
    return this.info;
  }
  static cats(list) { return (Array.isArray(list) ? list : []).map((c) => ({ id: String(c.category_id), name: c.category_name || 'Untitled' })); }
  async live() {
    const [cats, list] = await Promise.all([this.api('get_live_categories'), this.api('get_live_streams')]);
    return {
      cats: XtreamProvider.cats(cats),
      items: (Array.isArray(list) ? list : []).map((s, i) => ({
        id: String(s.stream_id), num: s.num || i + 1, name: s.name || 'Channel', logo: s.stream_icon || '',
        cat: String(s.category_id ?? ''), epgId: s.epg_channel_id || '', archive: String(s.tv_archive) === '1',
        archiveDays: Number(s.tv_archive_duration) || 0, added: Number(s.added) || 0,
      })),
    };
  }
  async movies() {
    const [cats, list] = await Promise.all([this.api('get_vod_categories'), this.api('get_vod_streams')]);
    return {
      cats: XtreamProvider.cats(cats),
      items: (Array.isArray(list) ? list : []).map((s) => ({
        id: String(s.stream_id), name: s.name || 'Movie', poster: s.stream_icon || '', cat: String(s.category_id ?? ''),
        rating: parseFloat(s.rating) || 0, year: s.year || yearOf(s.name) || yearOf(s.releaseDate), added: Number(s.added) || 0,
        ext: s.container_extension || 'mp4', tmdb: s.tmdb || s.tmdb_id || '',
      })),
    };
  }
  async series() {
    const [cats, list] = await Promise.all([this.api('get_series_categories'), this.api('get_series')]);
    return {
      cats: XtreamProvider.cats(cats),
      items: (Array.isArray(list) ? list : []).map((s) => ({
        id: String(s.series_id), name: s.name || 'Show', poster: s.cover || '', cat: String(s.category_id ?? ''),
        rating: parseFloat(s.rating) || 0, year: yearOf(s.releaseDate || s.release_date) || yearOf(s.name), added: Number(s.last_modified) || 0,
        plot: s.plot || '', genre: s.genre || '', backdrop: Array.isArray(s.backdrop_path) ? s.backdrop_path[0] : '',
      })),
    };
  }
  async movieInfo(m) {
    const r = await this.api('get_vod_info', '&vod_id=' + m.id);
    const i = r?.info || {};
    return {
      plot: i.plot || i.description || '', cast: i.cast || i.actors || '', director: i.director || '', genre: i.genre || '',
      release: i.releasedate || i.release_date || '', duration: i.duration || '', rating: parseFloat(i.rating) || m.rating,
      backdrop: (Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : i.backdrop_path) || '',
      poster: i.movie_image || i.cover_big || m.poster, trailer: i.youtube_trailer || '',
      ext: r?.movie_data?.container_extension || m.ext,
    };
  }
  async seriesInfo(s) {
    const r = await this.api('get_series_info', '&series_id=' + s.id);
    const i = r?.info || {};
    let eps = r?.episodes || {};
    if (Array.isArray(eps)) { const g = {}; eps.flat().forEach((e) => { (g[e.season] ||= []).push(e); }); eps = g; }
    const seasons = Object.keys(eps).sort((a, b) => Number(a) - Number(b)).map((sn) => ({
      num: Number(sn),
      episodes: (eps[sn] || []).map((e) => ({
        id: String(e.id), num: Number(e.episode_num) || 0, season: Number(sn), title: e.title || `Episode ${e.episode_num}`,
        ext: e.container_extension || 'mp4', plot: e.info?.plot || '', img: e.info?.movie_image || '',
        dur: e.info?.duration || '', durSecs: Number(e.info?.duration_secs) || 0,
      })).sort((a, b) => a.num - b.num),
    }));
    return {
      plot: i.plot || s.plot || '', cast: i.cast || '', director: i.director || '', genre: i.genre || s.genre || '',
      release: i.releaseDate || i.release_date || '', rating: parseFloat(i.rating) || s.rating,
      backdrop: (Array.isArray(i.backdrop_path) ? i.backdrop_path[0] : '') || s.backdrop || '', poster: i.cover || s.poster,
      trailer: i.youtube_trailer || '', seasons,
    };
  }
  static parseEpg(list) {
    return (list || []).map((e) => ({
      title: b64(e.title), desc: b64(e.description),
      start: Number(e.start_timestamp) * 1000 || Date.parse(e.start), end: Number(e.stop_timestamp) * 1000 || Date.parse(e.end),
      archive: String(e.has_archive) === '1',
    })).filter((e) => e.start && e.end).sort((a, b) => a.start - b.start);
  }
  async epg(ch) {
    try { return XtreamProvider.parseEpg((await this.api('get_short_epg', `&stream_id=${ch.id}&limit=8`))?.epg_listings).filter((e) => e.end > Date.now()); }
    catch { return []; }
  }
  async epgDay(ch) {
    try {
      const r = await this.api('get_simple_data_table', `&stream_id=${ch.id}`);
      const list = XtreamProvider.parseEpg(r?.epg_listings);
      return list.length ? list : await this.epg(ch);
    } catch { return this.epg(ch); }
  }
  liveSources(ch, pref) {
    const mk = (ext) => `${this.base}/live/${this.u}/${this.pw}/${ch.id}.${ext}`;
    const fm = this.info?.formats || [];
    const ts = { url: mk('ts'), type: 'mpegts', live: true }, hls = { url: mk('m3u8'), type: 'hls', live: true };
    if (pref === 'ts') return [ts, hls];
    if (fm.length && !fm.includes('m3u8')) return [ts];
    if (fm.length && !fm.includes('ts')) return [hls];
    return [hls, ts];
  }
  // catch-up: play a past programme (or the current one from its start)
  timeshiftSources(ch, startMs, endMs) {
    const mins = Math.max(1, Math.ceil((endMs - startMs) / 60000));
    let stamp;
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: this.info?.tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const p = Object.fromEntries(f.formatToParts(new Date(startMs)).map((x) => [x.type, x.value]));
      stamp = `${p.year}-${p.month}-${p.day}:${p.hour}-${p.minute}`;
    } catch { const d = new Date(startMs); stamp = d.toISOString().slice(0, 16).replace('T', ':').replace(':', '-').replace(/-(\d\d)$/, ':$1'); }
    const url = `${this.base}/timeshift/${this.u}/${this.pw}/${mins}/${stamp}/${ch.id}.ts`;
    return [{ url, type: 'mpegts', live: false }, { url: url.replace(/\.ts$/, '.m3u8'), type: 'hls' }];
  }
  movieUrl(m) { return `${this.base}/movie/${this.u}/${this.pw}/${m.id}.${m.ext || 'mp4'}`; }
  episodeUrl(e) { return `${this.base}/series/${this.u}/${this.pw}/${e.id}.${e.ext || 'mp4'}`; }
}

class M3UProvider {
  constructor(p) { this.p = p; this.kind = 'm3u'; this._parsed = null; }
  async load() {
    if (this._parsed) return this._parsed;
    const text = await fetchText(this.p.m3u, 120000);
    if (!/#EXTM3U|#EXTINF/i.test(text)) throw new Error("That link didn't return an M3U playlist");
    const entries = [];
    let cur = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXTINF')) {
        const attrs = {};
        line.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k.toLowerCase()] = v; });
        const rest = line.replace(/([\w-]+)="[^"]*"/g, '');
        cur = { attrs, name: rest.slice(rest.indexOf(',') + 1).trim() || attrs['tvg-name'] || 'Untitled' };
      } else if (line.startsWith('#EXTGRP:') && cur) cur.group = line.slice(8).trim();
      else if (!line.startsWith('#') && cur) { cur.url = line; entries.push(cur); cur = null; }
    }
    const live = [], movies = [], showsMap = new Map();
    const catSets = { live: new Map(), movie: new Map(), series: new Map() };
    const catId = (kind, name) => { const m = catSets[kind]; if (!m.has(name)) m.set(name, String(m.size + 1)); return m.get(name); };
    const extOf = (u) => (u.match(/\.(\w{2,4})(\?|$)/) || [])[1] || 'mp4';
    entries.forEach((e, i) => {
      const group = e.attrs['group-title'] || e.group || 'Uncategorised';
      const logo = e.attrs['tvg-logo'] || '';
      const url = e.url;
      const isSeries = /\/series\//i.test(url) || (/S\d{1,2}\s*E\d{1,3}/i.test(e.name) && /\.(mp4|mkv|avi|mov)(\?|$)/i.test(url));
      const isMovie = !isSeries && (/\/movie\//i.test(url) || /\.(mp4|mkv|avi|mov|wmv)(\?|$)/i.test(url));
      if (isSeries) {
        const m = e.name.match(/^(.*?)[\s._-]*S(\d{1,2})[\s._-]*E(\d{1,3})/i);
        const show = (m ? m[1] : e.name).replace(/[\s._-]+$/, '').trim() || e.name;
        const key = group + '|' + show;
        if (!showsMap.has(key)) showsMap.set(key, { id: 's' + showsMap.size, name: show, poster: logo, cat: catId('series', group), rating: 0, year: yearOf(show), added: 0, plot: '', genre: '', eps: [] });
        showsMap.get(key).eps.push({ id: 'e' + i, season: m ? Number(m[2]) : 1, num: m ? Number(m[3]) : showsMap.get(key).eps.length + 1, title: e.name, url, img: logo, ext: extOf(url) });
      } else if (isMovie) {
        movies.push({ id: 'm' + i, name: e.name, poster: logo, cat: catId('movie', group), rating: 0, year: yearOf(e.name), added: 0, url, ext: extOf(url) });
      } else {
        live.push({ id: 'l' + i, num: live.length + 1, name: e.name, logo, cat: catId('live', group), epgId: e.attrs['tvg-id'] || '', url });
      }
    });
    const cats = (kind) => [...catSets[kind]].map(([name, id]) => ({ id, name }));
    this._parsed = { live: { cats: cats('live'), items: live }, movies: { cats: cats('movie'), items: movies }, series: { cats: cats('series'), items: [...showsMap.values()] } };
    return this._parsed;
  }
  async auth() {
    const d = await this.load();
    this.info = { status: 'Active', exp: null, maxCons: null, activeCons: null, formats: [], m3u: true };
    if (!d.live.items.length && !d.movies.items.length && !d.series.items.length) throw new Error('The playlist is empty');
    return this.info;
  }
  async live() { return (await this.load()).live; }
  async movies() { return (await this.load()).movies; }
  async series() { return (await this.load()).series; }
  async movieInfo(m) { return { plot: '', poster: m.poster, rating: 0, ext: m.ext }; }
  async seriesInfo(s) {
    const g = {};
    (s.eps || []).forEach((e) => (g[e.season] ||= []).push(e));
    return { plot: '', poster: s.poster, rating: 0, seasons: Object.keys(g).sort((a, b) => a - b).map((n) => ({ num: Number(n), episodes: g[n].sort((a, b) => a.num - b.num) })) };
  }
  async epg() { return []; }
  async epgDay() { return []; }
  liveSources(ch, pref) {
    const u = ch.url;
    if (/\.m3u8(\?|$)/i.test(u)) return [{ url: u, type: 'hls', live: true }];
    const ts = { url: u, type: 'mpegts', live: true }, hls = { url: u, type: 'hls', live: true }, nat = { url: u, type: 'native' };
    if (/\.ts(\?|$)/i.test(u)) return pref === 'hls' ? [hls, ts] : [ts, hls];
    if (/\.(mp4|mkv|webm)(\?|$)/i.test(u)) return [nat];
    return pref === 'hls' ? [hls, ts, nat] : [ts, hls, nat];
  }
  timeshiftSources() { return null; }
  movieUrl(m) { return m.url; }
  episodeUrl(e) { return e.url; }
}
const makeProvider = (p) => (p.type === 'xtream' ? new XtreamProvider(p) : new M3UProvider(p));

/* ---------------- channel versions (quality) ---------------- */
const QUALITY_RE = /\b(uhd|4k|8k|fhd|1080p?|hd|720p?|sd|576p?|480p?|360p?|hevc|h\.?265|h\.?264|50fps|60fps|raw|backup|multi|vip|plus\b(?=\s*$))\b/gi;
function qualityOf(name) {
  const n = norm(name);
  if (/\b(uhd|4k|8k|2160)\b/.test(n)) return { label: '4K', rank: 5 };
  if (/\b(fhd|1080)\b/.test(n)) return { label: 'Full HD', rank: 4 };
  if (/\b(hd|720)\b/.test(n)) return { label: 'HD', rank: 3 };
  if (/\b(sd|576|480|360)\b/.test(n)) return { label: 'SD', rank: 1 };
  if (/\b(hevc|h\.?265)\b/.test(n)) return { label: 'HEVC', rank: 4 };
  return { label: 'Standard', rank: 2 };
}
const versionKey = (name) => norm(name).replace(QUALITY_RE, ' ').replace(/[^a-z0-9؀-ۿ]+/g, ' ').trim();

/* =====================================================================
   PLAYBACK ENGINE (hls.js → mpegts.js → native)
   ===================================================================== */
class Engine {
  constructor(video, onState) {
    this.v = video; this.onState = onState; this.token = 0;
    this.hls = null; this.ts = null; this.cur = null;
    video.addEventListener('playing', () => { this.clearWatch(); this.onState('playing'); });
    this.edge = () => { try { const b = video.buffered; return b.length ? b.end(b.length - 1) : 0; } catch { return 0; } };
    const edge = this.edge;
    setInterval(() => {
      if (!this.cur || video.paused || this.cur.dvr || !(this.cur.live || this.isLiveHls())) { if (video.playbackRate !== 1) video.playbackRate = 1; return; }
      const lat = edge() - video.currentTime;
      if (lat > 8) video.currentTime = edge() - 0.8;
      else if (lat > 2.5) video.playbackRate = 1.06;
      else if (lat < 1.0) video.playbackRate = 1;
    }, 1000);
    video.addEventListener('waiting', () => this.cur && this.onState('buffering'));
    video.addEventListener('canplay', () => this.cur && this.onState('ready'));
    video.addEventListener('error', () => {
      if (!this.cur || this.cur.type === 'hls') return;
      const t = this.token; setTimeout(() => t === this.token && this.next(), 50);
    });
  }
  play(sources) { this.stop(); this.sources = sources; this.idx = -1; this.next(); }
  next() {
    this.teardown();
    this.idx++;
    if (!this.sources || this.idx >= this.sources.length) { this.cur = null; this.onState('error'); return; }
    this.attach(this.sources[this.idx]);
  }
  watch(ms = 16000) {
    this.clearWatch();
    const t = this.token;
    this.wd = setTimeout(() => { if (t === this.token && this.v.readyState < 3) this.next(); }, ms);
  }
  clearWatch() { clearTimeout(this.wd); }
  // Live start: keep picture + sound hidden while the server's catch-up burst
  // arrives, then jump once to the live edge and reveal.
  reveal(show) {
    const v = this.v;
    if (show) { if (v.dataset.hiding) { v.style.opacity = ''; v.muted = v.dataset.wasMuted === '1'; delete v.dataset.hiding; } return; }
    if (!v.dataset.hiding) { v.dataset.wasMuted = v.muted ? '1' : '0'; v.dataset.hiding = '1'; }
    v.style.opacity = '0'; v.muted = true;
  }
  liveStart(t) {
    const v = this.v, t0 = Date.now();
    let lastE = 0, lastT = t0, calm = 0;
    this.reveal(false);
    clearInterval(this.liveT);
    this.liveT = setInterval(() => {
      if (t !== this.token) return clearInterval(this.liveT);
      const now = Date.now(), e = this.edge();
      const rate = (e - lastE) / Math.max(0.05, (now - lastT) / 1000);
      lastE = e; lastT = now;
      if (v.readyState >= 3 && e > 0) calm = rate < 1.6 ? calm + 1 : 0;
      if ((calm >= 3 && now - t0 > 700) || now - t0 > 8000) {
        clearInterval(this.liveT);
        if (e - v.currentTime > 1) v.currentTime = Math.max(0, e - 0.5);
        const show = () => { if (t === this.token) this.reveal(true); };
        v.addEventListener('seeked', show, { once: true });
        setTimeout(show, 350);
      }
    }, 200);
  }
  isLiveHls() { return !!(this.hls && this.hls.levels?.[this.hls.currentLevel]?.details?.live); }
  attach(s) {
    const t = ++this.token;
    this.cur = s; this.retries = 0;
    this.reveal(true);
    if (s.live) this.liveStart(t);
    this.onState('loading');
    this.watch();
    const v = this.v;
    if (s.type === 'hls' && window.Hls?.isSupported()) {
      const hls = (this.hls = new Hls({ enableWorker: true, ...(s.dvr ? { backBufferLength: 900, liveMaxLatencyDurationCount: Infinity } : {}), liveSyncDurationCount: 2, liveMaxLatencyDurationCount: s.dvr ? Infinity : 6, maxLiveSyncPlaybackRate: s.dvr ? 1 : 1.08, lowLatencyMode: true, initialLiveManifestSize: 1, backBufferLength: s.dvr ? 900 : 60, maxBufferLength: 30, startFragPrefetch: true, manifestLoadingTimeOut: 15000, fragLoadingTimeOut: 25000, capLevelToPlayerSize: false }));
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (t === this.token) { v.play().catch(() => {}); this.onState('tracks'); } });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => this.onState('tracks'));
      hls.on(Hls.Events.LEVEL_SWITCHED, () => this.onState('level'));
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (t !== this.token || !d.fatal) return;
        if (this.retries++ < 1) {
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) return hls.startLoad();
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) return hls.recoverMediaError();
        }
        this.next();
      });
      hls.loadSource(s.url);
      hls.attachMedia(v);
    } else if (s.type === 'mpegts' && window.mpegts?.isSupported()) {
      const p = (this.ts = mpegts.createPlayer(
        { type: 'mpegts', isLive: !!s.live, url: s.url },
        { enableWorker: true, enableStashBuffer: !s.live, stashInitialSize: 128 * 1024, lazyLoad: !s.live, liveBufferLatencyChasing: false, liveSync: false, autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30, fixAudioTimestampGap: false }
      ));
      p.on(mpegts.Events.ERROR, () => { if (t === this.token) this.next(); });
      p.on(mpegts.Events.MEDIA_INFO, () => this.onState('tracks'));
      p.attachMediaElement(v);
      p.load();
      const pr = p.play(); pr?.catch?.(() => {});
    } else {
      v.src = s.url;
      v.play().catch(() => {});
    }
  }
  teardown() {
    this.clearWatch();
    clearInterval(this.liveT);
    this.reveal(true);
    if (this.hls) { try { this.hls.destroy(); } catch {} this.hls = null; }
    if (this.ts) { try { this.ts.pause(); this.ts.unload(); this.ts.detachMediaElement(); this.ts.destroy(); } catch {} this.ts = null; }
    try { this.v.pause(); this.v.removeAttribute('src'); this.v.load(); } catch {}
  }
  stop() { this.token++; this.teardown(); this.cur = null; this.sources = null; }
  retry() { if (this.sources) { this.idx = -1; this.next(); } }
  get url() { return this.cur?.url || this.sources?.[0]?.url; }
  audioTracks() {
    if (this.hls && this.hls.audioTracks?.length > 1) return this.hls.audioTracks.map((a, i) => ({ i, label: a.name || a.lang || `Track ${i + 1}`, on: i === this.hls.audioTrack }));
    const at = this.v.audioTracks;
    if (at && at.length > 1) return [...at].map((a, i) => ({ i, label: a.label || a.language || `Track ${i + 1}`, on: a.enabled }));
    return [];
  }
  setAudio(i) {
    if (this.hls && this.hls.audioTracks?.length > 1) { this.hls.audioTrack = i; return; }
    const at = this.v.audioTracks;
    if (at) [...at].forEach((a, j) => (a.enabled = j === i));
  }
  levels() {
    if (!this.hls || !this.hls.levels || this.hls.levels.length < 2) return [];
    const seen = new Set();
    return this.hls.levels.map((l, i) => ({ i, h: l.height || 0, br: l.bitrate || 0 }))
      .sort((a, b) => b.h - a.h || b.br - a.br)
      .filter((l) => { const k = l.h || l.br; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((l) => ({ ...l, label: l.h ? `${l.h}p` : `${Math.round(l.br / 1000)} kbps`, on: this.hls.autoLevelEnabled ? false : this.hls.currentLevel === l.i }));
  }
  get autoLevel() { return !this.hls || this.hls.autoLevelEnabled; }
  get currentHeight() { const l = this.hls?.levels?.[this.hls.currentLevel]; return l?.height || this.v.videoHeight || 0; }
  setLevel(i) { if (this.hls) this.hls.currentLevel = i; }
}
