/* =====================================================================
   NOVA TV — app state, people (profiles), favorites, history, enhancer
   ===================================================================== */
'use strict';

const DEFAULT_SETTINGS = {
  theme: 'dark', liveFormat: 'auto', ua: 'default', player: 'vlc', sortMovies: 'default', sortSeries: 'default',
  subLang: 'eng', subScale: 1, enhance: true, liveMode: 'guide',
};
const PERSON_COLORS = ['#FF7048', '#3FE0C5', '#5B7CFF', '#C77DFF', '#FFC266', '#FF6B7D'];

const S = {
  account: null,     // the IPTV login (playlist)
  person: null,      // who's watching
  provider: null,
  info: null,
  settings: { ...DEFAULT_SETTINGS, ...store.get('settings', {}) },
  data: { live: null, movies: null, series: null },
  loading: {},
  maps: { live: new Map(), movie: new Map(), series: new Map() },
  versions: new Map(), // live version key -> [channels]
  view: 'home',
  stack: [],
  ui: { live: { cat: 'all', q: '', sel: null, offset: 0 }, movies: { cat: 'all', q: '' }, series: { cat: 'all', q: '' } },
};
const saveSettings = () => store.set('settings', S.settings);

/* ---------------- people (profiles) ---------------- */
const People = {
  list() { return store.get(`people.${S.account.id}`, []); },
  save(list) { store.set(`people.${S.account.id}`, list); },
  ensure() {
    let list = this.list();
    if (!list.length) {
      list = [{ id: uid(), name: 'Me', color: PERSON_COLORS[0] }];
      this.save(list);
      // carry v1 data over to the first person
      ['fav', 'hist', 'recentLive', 'lastCh'].forEach((k) => {
        const old = store.get(`${k}.${S.account.id}`, null);
        if (old != null) { store.set(`${k}.${S.account.id}.${list[0].id}`, old); store.del(`${k}.${S.account.id}`); }
      });
    }
    return list;
  },
  current() {
    const list = this.ensure();
    const id = store.get(`person.${S.account.id}`, null);
    return list.find((p) => p.id === id) || null;
  },
  use(p) { S.person = p; store.set(`person.${S.account.id}`, p.id); },
  add(name, color) { const list = this.list(); const p = { id: uid(), name: name.trim() || 'Profile', color }; list.push(p); this.save(list); return p; },
  update(id, patch) { const list = this.list().map((p) => (p.id === id ? { ...p, ...patch } : p)); this.save(list); if (S.person?.id === id) S.person = list.find((p) => p.id === id); },
  remove(id) {
    this.save(this.list().filter((p) => p.id !== id));
    ['fav', 'hist', 'recentLive', 'lastCh'].forEach((k) => store.del(`${k}.${S.account.id}.${id}`));
  },
};
const pkey = (k) => `${k}.${S.account?.id}.${S.person?.id}`;

/* ---------------- favorites / history ---------------- */
const favs = () => store.get(pkey('fav'), { live: {}, movie: {}, series: {} });
const isFav = (kind, id) => !!favs()[kind]?.[id];
function toggleFav(kind, item) {
  const f = favs();
  f[kind] ||= {};
  if (f[kind][item.id]) delete f[kind][item.id];
  else f[kind][item.id] = { id: item.id, name: item.name, logo: item.logo, poster: item.poster, year: item.year, rating: item.rating, ext: item.ext, url: item.url, cat: item.cat, num: item.num, imdb: item.imdb, ts: Date.now() };
  store.set(pkey('fav'), f);
  return !!f[kind][item.id];
}
const history = () => store.get(pkey('hist'), {});
function saveHistory(rec) {
  const h = history();
  if (rec.done) delete h[rec.key];
  else h[rec.key] = { ...rec, ts: Date.now() };
  Object.keys(h).sort((a, b) => h[b].ts - h[a].ts).slice(80).forEach((k) => delete h[k]);
  store.set(pkey('hist'), h);
}
function pushRecentLive(ch) {
  const r = store.get(pkey('recentLive'), []).filter((x) => x.id !== ch.id);
  r.unshift({ id: ch.id, name: ch.name, logo: ch.logo, num: ch.num, cat: ch.cat, url: ch.url });
  store.set(pkey('recentLive'), r.slice(0, 20));
}

/* ---------------- data loading ---------------- */
function loadSection(kind) {
  if (S.data[kind]) return Promise.resolve(S.data[kind]);
  if (S.loading[kind]) return S.loading[kind];
  S.loading[kind] = S.provider[kind]().then((d) => {
    S.data[kind] = d;
    const map = S.maps[kind === 'movies' ? 'movie' : kind];
    map.clear();
    d.items.forEach((it) => map.set(it.id, it));
    d.catName = new Map(d.cats.map((c) => [c.id, c.name]));
    d.counts = new Map();
    d.items.forEach((it) => d.counts.set(it.cat, (d.counts.get(it.cat) || 0) + 1));
    if (kind === 'live') {
      S.versions.clear();
      d.items.forEach((c) => { const k = versionKey(c.name); if (!k) return; const arr = S.versions.get(k) || []; arr.push(c); S.versions.set(k, arr); });
    }
    return d;
  }).catch((e) => { S.loading[kind] = null; throw e; });
  return S.loading[kind];
}
const versionsOf = (ch) => {
  const arr = S.versions.get(versionKey(ch.name)) || [ch];
  return arr.length > 1 ? arr.map((c) => ({ ch: c, q: qualityOf(c.name) })).sort((a, b) => b.q.rank - a.q.rank) : [];
};

/* ---------------- enhancer: better posters + IMDb ratings ---------------- */
const Enhance = (() => {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      run(en.target);
    });
  }, { rootMargin: '300px' });
  async function run(card) {
    const kind = card.dataset.kind, id = card.dataset.id;
    const it = S.maps[kind]?.get(id) || favs()[kind]?.[id];
    if (!it) return;
    const d = await Meta.forItem(it, kind);
    if (!d || !card.isConnected) return;
    apply(card, d);
  }
  function apply(card, d) {
    const img = card.querySelector('.pimg img, .pimg .ph');
    if (d.poster && S.settings.enhance) {
      const pre = new Image();
      pre.onload = () => {
        if (!card.isConnected) return;
        let el = card.querySelector('.pimg img');
        if (!el) { el = document.createElement('img'); el.alt = ''; card.querySelector('.pimg').prepend(el); }
        el.src = d.poster; el.classList.add('loaded');
      };
      pre.src = d.poster;
    }
    if (d.rating) {
      let r = card.querySelector('.rate');
      if (!r) { r = document.createElement('div'); r.className = 'rate'; card.querySelector('.pimg').appendChild(r); }
      r.innerHTML = `<span class="imdb"><em>IMDb</em>${d.rating.toFixed(1)}</span>`;
    }
    void img;
  }
  function observe(root) {
    if (!S.settings.enhance) return;
    $$('.poster[data-kind]:not([data-enh])', root).forEach((c) => {
      c.dataset.enh = '1';
      const it = S.maps[c.dataset.kind]?.get(c.dataset.id);
      const cached = it && Meta.cached(it, c.dataset.kind);
      if (cached) apply(c, cached); else io.observe(c);
    });
  }
  return { observe };
})();
