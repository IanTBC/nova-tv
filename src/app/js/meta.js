/* =====================================================================
   NOVA TV — metadata (IMDb + Cinemeta) and subtitles (OpenSubtitles v3)
   All free, no API keys, no sign-up.
   ===================================================================== */
'use strict';

/* small concurrency limiter */
function limiter(max) {
  let active = 0; const q = [];
  const run = () => {
    if (active >= max || !q.length) return;
    active++;
    const { fn, res, rej } = q.shift();
    fn().then(res, rej).finally(() => { active--; run(); });
  };
  return (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); run(); });
}

const Meta = (() => {
  const CINEMETA = 'https://v3-cinemeta.strem.io';
  const SUGGEST = 'https://v3.sg.media-imdb.com/suggestion';
  const limit = limiter(4);
  const mem = new Map();          // imdbId -> full details (incl. videos)
  const pending = new Map();
  let ids = store.get('meta.ids', {});   // lookupKey -> imdbId | ''
  let det = store.get('meta.det', {});   // imdbId -> compact details
  const saveIds = debounce(() => {
    const keys = Object.keys(ids);
    if (keys.length > 4000) keys.slice(0, keys.length - 4000).forEach((k) => delete ids[k]);
    store.set('meta.ids', ids);
  }, 800);
  const saveDet = debounce(() => {
    const keys = Object.keys(det);
    if (keys.length > 600) keys.sort((a, b) => (det[a].t || 0) - (det[b].t || 0)).slice(0, keys.length - 600).forEach((k) => delete det[k]);
    store.set('meta.det', det);
  }, 800);

  // "EN - The Batman (2022) [4K]" -> { title: 'The Batman', year: '2022' }
  function clean(name) {
    let s = String(name || '');
    let year = (s.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]/) || [])[1] || '';
    for (let i = 0; i < 3; i++) s = s.replace(/^\s*(\|[^|]{1,14}\||\[[^\]]{1,14}\]|\([^)]{1,6}\)|[A-Z0-9][A-Z0-9+]{0,5}(?:-[A-Z0-9]{2,5})?\s*[-:|•]\s+)/, '');
    s = s.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ').replace(/\(\s*(?:19|20)\d{2}\s*\)/g, ' ');
    if (!year) { const m = s.match(/[\s.-]((?:19|20)\d{2})\s*$/); if (m) { year = m[1]; s = s.slice(0, m.index); } }
    s = s.replace(/\b(4k|uhd|fhd|hd|sd|1080p|720p|480p|hevc|x264|x265|h264|h265|multi|vostfr|dubbed|subbed|cam|hdrip|web-?dl|bluray)\b/gi, ' ')
      .replace(/[_.]+/g, ' ').replace(/\s*[-|:]\s*$/, '').replace(/\s{2,}/g, ' ').trim();
    return { title: s, year };
  }

  async function lookupId(name, kind, hintYear) {
    const { title, year: y0 } = clean(name);
    const year = y0 || hintYear || '';
    const slug = norm(title).replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    if (slug.length < 2) return '';
    const key = `${kind}|${slug}|${year}`;
    if (key in ids) return ids[key];
    const r = await limit(() => fetchJSON(`${SUGGEST}/${slug[0]}/${encodeURIComponent(slug.slice(0, 60))}.json`, 12000)).catch(() => null);
    const want = kind === 'series' ? /tvSeries|tvMiniSeries/ : /movie|tvMovie|video/;
    const list = (r?.d || []).filter((x) => /^tt\d+$/.test(x.id) && want.test(x.qid || ''));
    const t = norm(title);
    const score = (x) => (norm(x.l) === t ? 3 : norm(x.l).startsWith(t) ? 1 : 0) + (year && x.y ? (Math.abs(x.y - year) <= 1 ? 3 : -2) : 0) - (x.rank ? Math.log10(x.rank) / 10 : 0);
    const best = list.sort((a, b) => score(b) - score(a))[0];
    const id = best && score(best) > 0.5 ? best.id : '';
    ids[key] = id; saveIds();
    return id;
  }

  async function details(id, kind) {
    if (!id) return null;
    if (mem.has(id)) return mem.get(id);
    if (pending.has(id)) return pending.get(id);
    const p = limit(() => fetchJSON(`${CINEMETA}/meta/${kind === 'series' ? 'series' : 'movie'}/${id}.json`, 15000)).then((r) => {
      const m = r?.meta;
      if (!m) return null;
      const d = {
        id, name: m.name, rating: parseFloat(m.imdbRating) || 0, poster: m.poster ? m.poster.replace('/small/', '/medium/') : '',
        background: m.background || '', logo: m.logo || '', plot: m.description || '', cast: (m.cast || []).slice(0, 6).join(', '),
        director: (m.director || []).slice(0, 2).join(', '), genres: (m.genres || m.genre || []).slice(0, 3).join(' · '),
        runtime: m.runtime || '', year: m.releaseInfo || m.year || '', trailer: (m.trailers || [])[0]?.source || '', t: Date.now(),
      };
      det[id] = d; saveDet();
      const full = { ...d, videos: (m.videos || []).map((v) => ({ s: v.season, e: v.episode, title: v.name || v.title || '', img: v.thumbnail || '', plot: v.overview || v.description || '' })) };
      mem.set(id, full);
      return full;
    }).catch(() => null).finally(() => pending.delete(id));
    pending.set(id, p);
    return p;
  }

  // everything we know about an item, as fast as possible
  async function forItem(it, kind) {
    const id = it.imdb || (await lookupId(it.name, kind, it.year));
    if (id) it.imdb = id;
    return id ? details(id, kind) : null;
  }
  const cached = (it, kind) => {
    const { title, year } = clean(it.name);
    const slug = norm(title).replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    const id = it.imdb || ids[`${kind}|${slug}|${year || it.year || ''}`];
    return id ? det[id] || null : null;
  };
  const posterFor = (id) => `https://images.metahub.space/poster/medium/${id}/img`;

  return { clean, lookupId, details, forItem, cached, posterFor };
})();

/* ---------------- subtitles ---------------- */
const LANGS = {
  eng: 'English', ara: 'Arabic', fre: 'French', fra: 'French', spa: 'Spanish', spn: 'Spanish (Latin America)', ger: 'German', deu: 'German',
  ita: 'Italian', por: 'Portuguese', pob: 'Portuguese (Brazil)', tur: 'Turkish', rus: 'Russian', dut: 'Dutch', nld: 'Dutch', gre: 'Greek', ell: 'Greek',
  heb: 'Hebrew', per: 'Persian', fas: 'Persian', hin: 'Hindi', urd: 'Urdu', chi: 'Chinese', zho: 'Chinese', zht: 'Chinese (Traditional)', jpn: 'Japanese',
  kor: 'Korean', pol: 'Polish', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', cze: 'Czech', ces: 'Czech', hun: 'Hungarian',
  rum: 'Romanian', ron: 'Romanian', hrv: 'Croatian', srp: 'Serbian', scc: 'Serbian', bul: 'Bulgarian', ukr: 'Ukrainian', ind: 'Indonesian',
  may: 'Malay', msa: 'Malay', vie: 'Vietnamese', tha: 'Thai', slv: 'Slovenian', slo: 'Slovak', slk: 'Slovak', est: 'Estonian', lav: 'Latvian',
  lit: 'Lithuanian', alb: 'Albanian', sqi: 'Albanian', mac: 'Macedonian', bos: 'Bosnian', ice: 'Icelandic', cat: 'Catalan', baq: 'Basque',
  glg: 'Galician', ben: 'Bengali', tam: 'Tamil', tel: 'Telugu', mal: 'Malayalam', kur: 'Kurdish', geo: 'Georgian', arm: 'Armenian', aze: 'Azerbaijani',
};
const langName = (c) => LANGS[c] || (c ? c.toUpperCase() : 'Unknown');
const SUB_LANG_CHOICES = [['off', 'Off'], ['eng', 'English'], ['ara', 'Arabic'], ['fre', 'French'], ['spa', 'Spanish'], ['ger', 'German'], ['ita', 'Italian'], ['tur', 'Turkish'], ['por', 'Portuguese'], ['rus', 'Russian'], ['dut', 'Dutch'], ['per', 'Persian'], ['hin', 'Hindi'], ['urd', 'Urdu']];
const LANG_ALIASES = { fre: ['fra'], fra: ['fre'], ger: ['deu'], deu: ['ger'], dut: ['nld'], gre: ['ell'], per: ['fas'], chi: ['zho', 'zht'], cze: ['ces'], rum: ['ron'], spa: ['spn'], por: ['pob'] };

const Subs = (() => {
  const BASE = 'https://opensubtitles-v3.strem.io/subtitles';
  const cache = new Map();
  async function list(imdbId, kind, season, episode) {
    if (!imdbId) return [];
    const key = kind === 'series' ? `series/${imdbId}:${season}:${episode}` : `movie/${imdbId}`;
    if (cache.has(key)) return cache.get(key);
    const r = await fetchJSON(`${BASE}/${key}.json`, 15000).catch(() => null);
    const groups = new Map();
    (r?.subtitles || []).forEach((s) => {
      if (!s.url) return;
      const g = groups.get(s.lang) || { lang: s.lang, name: langName(s.lang), items: [] };
      g.items.push({ id: String(s.id), url: s.url, label: s.subtitleFileName || s.movieReleaseName || `#${s.id}` });
      groups.set(s.lang, g);
    });
    const out = [...groups.values()];
    cache.set(key, out);
    return out;
  }
  function parse(text) {
    const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const cues = [];
    const ts = (h, m, s, ms) => (Number(h || 0) * 3600) + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0').slice(0, 3)) / 1000;
    const re = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})[^\n]*\n([\s\S]*?)(?=\n\s*\n|\n\d+\s*\n(?:\d{1,2}:)?\d{1,2}:\d{2}|$)/g;
    let m;
    while ((m = re.exec(t))) {
      const text = m[9].replace(/\{\\[^}]*\}/g, '').replace(/<(?!\/?(i|b|u)>)[^>]+>/gi, '').trim();
      if (text) cues.push({ start: ts(m[1], m[2], m[3], m[4]), end: ts(m[5], m[6], m[7], m[8]), text });
    }
    return cues.sort((a, b) => a.start - b.start);
  }
  async function load(url) { return parse(await fetchText(url, 20000)); }
  // pick the best group for the preferred language
  function pick(groups, pref) {
    if (!pref || pref === 'off') return null;
    const codes = [pref, ...(LANG_ALIASES[pref] || [])];
    return groups.find((g) => codes.includes(g.lang)) || null;
  }
  return { list, load, parse, pick };
})();
