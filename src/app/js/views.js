/* =====================================================================
   NOVA TV — views
   ===================================================================== */
'use strict';

/* ---------------- shared templates ---------------- */
function ratingHtml(kind, it) {
  const d = Meta.cached(it, kind);
  if (d?.rating) return `<div class="rate"><span class="imdb"><em>IMDb</em>${d.rating.toFixed(1)}</span></div>`;
  return it.rating ? `<div class="rate">★ ${(+it.rating).toFixed(1)}</div>` : '';
}
function posterCard(kind, it) {
  const hist = kind === 'movie' ? history()['movie:' + it.id] : null;
  const pct = hist && hist.dur ? Math.min(100, (hist.pos / hist.dur) * 100) : 0;
  const d = S.settings.enhance ? Meta.cached(it, kind) : null;
  const img = d?.poster || it.poster;
  return `<button class="poster" data-act="open" data-kind="${kind}" data-id="${esc(it.id)}">
    <div class="pimg">
      <div class="ph">${esc(Meta.clean(it.name).title || it.name)}</div>
      ${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="">` : ''}
      ${ratingHtml(kind, it)}
      ${isFav(kind, it.id) ? `<div class="fav-dot">${ic('heart', 'fill')}</div>` : ''}
      <div class="play-hover"><span>${ic('play', 'fill')}</span></div>
      ${pct ? `<div class="prog"><b style="width:${pct}%"></b></div>` : ''}
    </div>
    <div class="pbody"><div class="pt">${esc(Meta.clean(it.name).title || it.name)}</div><div class="ps">${esc([it.year, kind === 'series' ? 'Series' : ''].filter(Boolean).join(' · ') || '—')}</div></div>
  </button>`;
}
function rankCard(kind, it, n) {
  return `<div class="rank"><b aria-hidden="true">${n}</b>${posterCard(kind, it)}</div>`;
}
function landCard(h) {
  const pct = h.dur ? Math.min(100, (h.pos / h.dur) * 100) : 0;
  return `<div class="land" data-act="resume" data-key="${esc(h.key)}" role="button" tabindex="0">
    <div class="limg">${h.img ? `<img loading="lazy" src="${esc(h.img)}" alt="">` : ''}<div class="ltitle">${esc(Meta.clean(h.title).title || h.title)}</div>
      <button class="icon-btn rm" data-act="rm-hist" data-key="${esc(h.key)}" aria-label="Remove from Continue watching">${ic('x')}</button>
      <div class="prog"><b style="width:${pct}%"></b></div></div>
    <div class="lmeta"><span>${esc(h.sub || '')}</span><span>${fmtLeft(h.dur - h.pos)}</span></div>
  </div>`;
}
function onCard(ch) {
  return `<button class="oncard" data-act="play-live" data-id="${esc(ch.id)}">
    <span class="cl">${ch.logo ? `<img loading="lazy" src="${esc(ch.logo)}" alt="">` : `<span class="ini">${esc(initials(ch.name))}</span>`}</span>
    <span class="om"><b>${esc(ch.name)}</b><small data-now="${esc(ch.id)}">Live</small><span class="bar"><b data-bar="${esc(ch.id)}" style="width:0"></b></span></span>
  </button>`;
}
function chanCard(ch) {
  return `<button class="ch-card" data-act="play-live" data-id="${esc(ch.id)}">
    <div class="cl">${ch.logo ? `<img loading="lazy" src="${esc(ch.logo)}" alt="">` : `<span class="ini">${esc(initials(ch.name))}</span>`}</div>
    <span>${esc(ch.name)}</span></button>`;
}
function chanRow(ch, { active = false, catName = '' } = {}) {
  return `<button class="chan ${active ? 'active' : ''}" data-act="sel-live" data-id="${esc(ch.id)}">
    <span class="num">${esc(ch.num ?? '')}</span>
    <span class="logo">${ch.logo ? `<img loading="lazy" src="${esc(ch.logo)}" alt="">` : `<span class="ini">${esc(initials(ch.name))}</span>`}</span>
    <span class="nm"><b>${esc(ch.name)}</b>${catName ? `<small>${esc(catName)}</small>` : ''}</span>
    <span class="star ${isFav('live', ch.id) ? 'on' : ''}" data-act="fav-live" data-id="${esc(ch.id)}" title="Favorite">${ic('heart')}</span>
  </button>`;
}
function row(title, inner, { sub = '', link = '', linkLabel = 'See all' } = {}) {
  return `<section class="row"><div class="row-head"><h2>${esc(title)}</h2>${sub ? `<small>${esc(sub)}</small>` : ''}${link ? `<button class="link" data-act="go" data-view="${link}">${esc(linkLabel)} ${ic('arrow')}</button>` : ''}</div>
    <button class="row-arrow l" data-act="row-l" aria-label="Scroll left"><span>${ic('chevL')}</span></button>
    <div class="row-track">${inner}</div>
    <button class="row-arrow r" data-act="row-r" aria-label="Scroll right"><span>${ic('chevR')}</span></button></section>`;
}

/* incremental renderer — keeps huge lists fast */
function mountList(container, items, tpl, batch = 80, onAdd) {
  container._io?.disconnect();
  container.innerHTML = '';
  const sentinel = document.createElement('div');
  sentinel.className = 'sentinel';
  container.appendChild(sentinel);
  let i = 0;
  const add = () => {
    const end = Math.min(i + batch, items.length);
    if (end <= i) return;
    const t = document.createElement('template');
    t.innerHTML = items.slice(i, end).map(tpl).join('');
    container.insertBefore(t.content, sentinel);
    i = end;
    Enhance.observe(container);
    onAdd?.(container);
  };
  const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) add(); }, { root: container, rootMargin: '1200px' });
  add();
  io.observe(sentinel);
  container._io = io;
}
function loadingState(el, text) { el.innerHTML = `<div class="center-state"><div class="spinner"></div><div>${esc(text)}</div></div>`; }
function errorState(el, msg, retry) {
  el.innerHTML = `<div class="center-state"><div class="big-ico">${ic('signal')}</div><h3>Couldn't load this section</h3><div>${esc(msg)}</div><button class="btn small" id="retryBtn">${ic('refresh')} Try again</button></div>`;
  $('#retryBtn', el).onclick = retry;
}
function chips(arr) { return arr.filter(Boolean).map((c) => (typeof c === 'string' ? `<span class="chip">${esc(c)}</span>` : `<span class="chip ${c.cls || ''}">${c.html || esc(c.t)}</span>`)).join(''); }

/* =====================================================================
   HOME
   ===================================================================== */
let bbTimer = null;
async function renderHome(el) {
  loadingState(el, 'Syncing your playlist…');
  const [live, movies, series] = await Promise.all(['live', 'movies', 'series'].map((k) => loadSection(k).catch(() => ({ cats: [], items: [], counts: new Map() }))));
  if (S.view !== 'home') return;

  const byAdded = (arr) => [...arr].sort((a, b) => (b.added || 0) - (a.added || 0));
  const rm = byAdded(movies.items).slice(0, 24), rs = byAdded(series.items).slice(0, 24);
  const feat = [];
  for (let i = 0; i < 4 && feat.length < 6; i++) { if (rm[i]?.poster) feat.push({ kind: 'movie', it: rm[i] }); if (rs[i]?.poster) feat.push({ kind: 'series', it: rs[i] }); }
  const hist = Object.values(history()).sort((a, b) => b.ts - a.ts).slice(0, 20);
  const favLive = Object.values(favs().live || {}).map((c) => S.maps.live.get(c.id) || c);
  const recentLive = store.get(pkey('recentLive'), []).map((c) => S.maps.live.get(c.id) || c);
  const onNow = (favLive.length ? favLive : recentLive.length ? recentLive : live.items.slice(0, 14)).slice(0, 16);
  const topCats = (d) => [...d.cats].sort((a, b) => (d.counts.get(b.id) || 0) - (d.counts.get(a.id) || 0)).filter((c) => (d.counts.get(c.id) || 0) >= 6);

  const charts = await Charts.build(movies.items, series.items).catch(() => ({ topMovies: [], topSeries: [], services: [] }));
  if (S.view !== 'home') return;
  const top = [...charts.topMovies.slice(0, 3).map((it) => ({ kind: 'movie', it })), ...charts.topSeries.slice(0, 3).map((it) => ({ kind: 'series', it }))].filter((f) => f.it.poster);
  if (top.length >= 3) feat.splice(0, feat.length, ...top);
  const slide = (f, i) => {
    const it = f.it, d = Meta.cached(it, f.kind);
    const t = Meta.clean(it.name).title || it.name;
    return `<div class="bb-slide ${i === 0 ? 'on' : ''}" data-i="${i}">
      <div class="bb-fallback"></div>
      <div class="bb-art ${d?.background ? '' : 'blur'}" style="background-image:${cssUrl(d?.background || it.poster)}"></div>
      <div class="bb-shade"></div>
      <div class="bb-copy">
        <span class="eyebrow"><span class="pdot"></span>${f.kind === 'movie' ? 'Movie' : 'Series'} · ${top.length >= 3 ? '#' + ((f.kind === 'movie' ? charts.topMovies : charts.topSeries).indexOf(f.it) + 1) + ' trending today' : 'Just added'}</span>
        <div class="bb-title">${d?.logo ? `<img class="bb-logo" src="${esc(d.logo)}" alt="${esc(t)}">` : `<h1>${esc(t)}</h1>`}</div>
        <div class="hero-meta">${chips([it.year && { t: it.year, cls: 'mono' }, (d?.rating || it.rating) && { html: d?.rating ? `<span class="imdb"><em>IMDb</em>${d.rating.toFixed(1)}</span>` : `★ ${(+it.rating).toFixed(1)}`, cls: 'star' }, d?.genres, d?.runtime])}</div>
        <p>${esc(d?.plot || it.plot || '')}</p>
        <div class="bb-actions">
          <button class="btn" data-act="${f.kind === 'movie' ? 'play-movie' : 'open'}" data-kind="${f.kind}" data-id="${esc(it.id)}">${ic('play', 'fill')} ${f.kind === 'movie' ? 'Play' : 'Watch'}</button>
          <button class="btn glassy" data-act="open" data-kind="${f.kind}" data-id="${esc(it.id)}">${ic('info')} More info</button>
          <button class="icon-btn glassy ${isFav(f.kind, it.id) ? 'on' : ''}" data-act="fav" data-kind="${f.kind}" data-id="${esc(it.id)}" aria-label="My List">${ic(isFav(f.kind, it.id) ? 'check' : 'plus')}</button>
        </div>
      </div></div>`;
  };

  let rows = '';
  if (hist.length) rows += row(`Continue watching${S.person ? ' for ' + S.person.name : ''}`, hist.map(landCard).join(''));
  if (charts.topMovies.length >= 3) rows += row('Top 10 movies today', charts.topMovies.map((m, i) => rankCard('movie', m, i + 1)).join(''), { sub: 'Trending worldwide · on your subscription' });
  if (charts.topSeries.length >= 3) rows += row('Top 10 TV shows today', charts.topSeries.map((m, i) => rankCard('series', m, i + 1)).join(''), { sub: 'Trending worldwide · on your subscription' });
  charts.services.forEach((sv) => { rows += row(`Popular on ${sv.name}`, sv.items.map((x) => posterCard(x.kind, x.it)).join(''), { sub: `${sv.items.length} titles you can watch` }); });
  if (onNow.length) rows += row('On now', onNow.map(onCard).join(''), { sub: favLive.length ? 'Your favorite channels, live' : 'Live channels', link: 'live', linkLabel: 'TV guide' });
  if (rm.length) rows += row('Recently added movies', rm.map((m) => posterCard('movie', m)).join(''), { link: 'movies' });
  if (rs.length) rows += row('New episodes', rs.map((s) => posterCard('series', s)).join(''), { link: 'series' });
  topCats(movies).slice(0, 3).forEach((c) => {
    rows += row(c.name, movies.items.filter((m) => m.cat === c.id).slice(0, 24).map((m) => posterCard('movie', m)).join(''));
  });
  topCats(series).slice(0, 2).forEach((c) => {
    rows += row(c.name, series.items.filter((m) => m.cat === c.id).slice(0, 24).map((m) => posterCard('series', m)).join(''));
  });
  if (!rows && !feat.length) { el.innerHTML = `<div class="center-state"><h3>Nothing here yet</h3><div>Your playlist didn't return any content.</div></div>`; return; }

  el.innerHTML = `${feat.length ? `<section class="billboard" id="billboard">${feat.map(slide).join('')}<div class="bb-dots">${feat.map((_, i) => `<button class="${i === 0 ? 'on' : ''}" data-act="bb-go" data-i="${i}" aria-label="Show slide ${i + 1}"></button>`).join('')}</div></section>` : '<div style="height:96px"></div>'}
    <div class="home-rows" ${feat.length ? '' : 'style="margin-top:0"'}>${rows}</div>`;
  Enhance.observe(el);

  // billboard: enrich + rotate
  feat.forEach((f, i) => Meta.forItem(f.it, f.kind).then((d) => {
    if (!d || S.view !== 'home') return;
    const s = $(`.bb-slide[data-i="${i}"]`); if (!s) return;
    const on = s.classList.contains('on');
    s.outerHTML = slide(f, i);
    if (on) $(`.bb-slide[data-i="${i}"]`)?.classList.add('on');
  }));
  let cur = 0;
  const show = (i) => {
    cur = (i + feat.length) % feat.length;
    $$('.bb-slide').forEach((s) => s.classList.toggle('on', Number(s.dataset.i) === cur));
    $$('.bb-dots button').forEach((b, j) => b.classList.toggle('on', j === cur));
  };
  S.bbShow = show;
  clearInterval(bbTimer);
  if (feat.length > 1) bbTimer = setInterval(() => { if (S.view === 'home' && !player.open && !$('#billboard')?.matches(':hover')) show(cur + 1); }, 9000);

  // on-now programme info
  const lim = limiter(3);
  onNow.forEach((ch) => lim(() => S.provider.epg(ch)).then((e) => {
    const now = e.find((x) => x.start <= Date.now() && x.end > Date.now());
    if (!now) return;
    const sm = $(`[data-now="${CSS.escape(ch.id)}"]`), bar = $(`[data-bar="${CSS.escape(ch.id)}"]`);
    if (sm) sm.textContent = now.title;
    if (bar) bar.style.width = ((Date.now() - now.start) / (now.end - now.start)) * 100 + '%';
  }).catch(() => {}));
}

/* =====================================================================
   DETAIL PAGE (movie / series)
   ===================================================================== */
async function renderDetail(el, { kind, id }) {
  const it = S.maps[kind].get(id) || favs()[kind]?.[id];
  if (!it) { el.innerHTML = '<div class="center-state"><h3>Not found</h3></div>'; return; }
  const ctx = (S.detail = { kind, id, it, info: null, meta: Meta.cached(it, kind), season: null });
  const draw = () => {
    if (S.detail !== ctx) return;
    const { info, meta: d } = ctx;
    const t = Meta.clean(it.name).title || it.name;
    const bg = d?.background || info?.backdrop || '';
    const plot = d?.plot || info?.plot || it.plot || '';
    const rating = d?.rating || info?.rating || it.rating;
    const h = kind === 'movie' ? history()['movie:' + it.id] : null;
    const last = kind === 'series' ? Object.values(history()).filter((x) => x.kind === 'episode' && x.seriesId === id).sort((a, b) => b.ts - a.ts)[0] : null;
    const firstEp = info?.seasons?.[0]?.episodes?.[0];
    let play = '';
    if (kind === 'movie') play = `<button class="btn" data-act="play-movie" data-id="${esc(id)}">${ic('play', 'fill')} ${h && h.pos > 30 ? 'Resume ' + fmtTime(h.pos) : 'Play'}</button>${h && h.pos > 30 ? `<button class="btn glassy" data-act="play-movie" data-id="${esc(id)}" data-restart="1">${ic('restart')} Start over</button>` : ''}`;
    else if (last) play = `<button class="btn" data-act="resume" data-key="${esc(last.key)}">${ic('play', 'fill')} Continue S${last.season} E${last.episode}</button>`;
    else if (firstEp) play = `<button class="btn" data-act="play-ep" data-season="${firstEp.season}" data-id="${esc(firstEp.id)}">${ic('play', 'fill')} Play S${firstEp.season} E${firstEp.num}</button>`;
    else if (!info) play = `<button class="btn" disabled>${ic('play', 'fill')} Loading…</button>`;
    const trailer = d?.trailer || info?.trailer;
    const credits = [d?.director || info?.director ? `<b>Director</b> ${esc(d?.director || info?.director)}` : '', d?.cast || info?.cast ? `<b>Cast</b> ${esc((d?.cast || info?.cast).split(',').slice(0, 5).join(','))}` : ''].filter(Boolean).join('<br>');
    $('#dHero').innerHTML = `
      <div class="dhero-art ${bg ? '' : 'blur'}" style="background-image:${cssUrl(bg || d?.poster || it.poster)}"></div>
      <div class="dcopy">
        <span class="eyebrow"><span class="pdot"></span>${kind === 'movie' ? 'Movie' : `Series${info?.seasons ? ' · ' + info.seasons.length + ' season' + (info.seasons.length === 1 ? '' : 's') : ''}`}</span>
        ${d?.logo ? `<img class="bb-logo" src="${esc(d.logo)}" alt="${esc(t)}">` : `<h1>${esc(t)}</h1>`}
        <div class="hero-meta">${chips([(d?.year || it.year) && { t: d?.year || it.year, cls: 'mono' }, rating && { html: d?.rating ? `<span class="imdb"><em>IMDb</em>${(+rating).toFixed(1)}</span>` : `★ ${(+rating).toFixed(1)}`, cls: 'star' }, d?.runtime || info?.duration, d?.genres || info?.genre, kind === 'movie' && it.ext && { t: String(it.ext).toUpperCase(), cls: 'mono' }])}</div>
        ${plot ? `<p class="plot">${esc(plot)}</p>` : ''}
        ${credits ? `<div class="credits">${credits}</div>` : ''}
        <div class="bb-actions">${play}
          <button class="btn glassy" data-act="fav" data-kind="${kind}" data-id="${esc(id)}">${ic(isFav(kind, id) ? 'check' : 'plus')} My List</button>
          ${trailer ? `<button class="btn glassy" data-act="trailer" data-yt="${esc(trailer)}">${ic('youtube')} Trailer</button>` : ''}
        </div>
      </div>`;
    drawEpisodes();
  };
  const drawEpisodes = () => {
    if (kind !== 'series' || S.detail !== ctx) return;
    const box = $('#dEps');
    const info = ctx.info;
    if (!info) { box.innerHTML = '<div class="center-state" style="height:auto;padding:40px"><div class="spinner"></div></div>'; return; }
    if (!info.seasons.length) { box.innerHTML = '<div class="center-state" style="height:auto;padding:40px">No episodes found.</div>'; return; }
    if (ctx.season == null) {
      const last = Object.values(history()).filter((x) => x.kind === 'episode' && x.seriesId === id).sort((a, b) => b.ts - a.ts)[0];
      ctx.season = last?.season ?? info.seasons[0].num;
    }
    const ss = info.seasons.find((x) => x.num === ctx.season) || info.seasons[0];
    const hh = history();
    const mv = ctx.meta?.videos || [];
    box.innerHTML = `<div class="sec-head"><div class="seasons" style="margin:0">${info.seasons.map((x) => `<button class="season-tab ${x.num === ss.num ? 'active' : ''}" data-act="season" data-n="${x.num}">Season ${x.num}</button>`).join('')}</div><span class="mono" style="font-size:12px;color:var(--muted)">${ss.episodes.length} episodes</span></div>
      <div class="epgrid">${ss.episodes.map((e) => {
        const r = hh['ep:' + e.id];
        const pct = r && r.dur ? Math.min(100, (r.pos / r.dur) * 100) : 0;
        const v = mv.find((x) => x.s === ss.num && x.e === e.num);
        const img = e.img || v?.img || '';
        const title = /^episode\s*\d+$/i.test(e.title) && v?.title ? v.title : e.title;
        const plot = e.plot || v?.plot || '';
        return `<button class="epcard ${pct > 90 ? 'watched' : ''}" data-act="play-ep" data-season="${ss.num}" data-id="${esc(e.id)}">
          <div class="eimg">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}<span class="en">${e.num}</span>${e.dur ? `<span class="edur">${esc(String(e.dur).replace(/^00:/, ''))}</span>` : ''}<div class="play-hover"><span>${ic('play', 'fill')}</span></div>${pct ? `<div class="prog"><b style="width:${pct}%"></b></div>` : ''}</div>
          <h4>${esc(title)}</h4>${plot ? `<p>${esc(plot)}</p>` : ''}</button>`;
      }).join('')}</div>`;
  };
  ctx.redrawEps = drawEpisodes;
  ctx.redraw = draw;

  const more = (S.data[kind === 'movie' ? 'movies' : 'series']?.items || []).filter((x) => x.cat === it.cat && x.id !== id).slice(0, 20);
  el.innerHTML = `<div class="dpage">
    <button class="icon-btn dback" data-act="back" aria-label="Back">${ic('back')}</button>
    <section class="dhero" id="dHero"></section>
    <section class="dbody"><div id="dEps"></div>
      ${more.length ? `<div class="more-like">${row('More like this', more.map((x) => posterCard(kind, x)).join(''))}</div>` : ''}
    </section></div>`;
  draw();
  Enhance.observe(el);
  const pInfo = (kind === 'movie' ? S.provider.movieInfo(it) : S.provider.seriesInfo(it)).then((info) => { ctx.info = info; if (info.ext) it.ext = info.ext; if (info.backdrop) it.backdrop = info.backdrop; }).catch(() => { ctx.info = kind === 'series' ? { seasons: [] } : {}; });
  const pMeta = Meta.forItem(it, kind).then((d) => { if (d) { ctx.meta = d; if (d.background) it.backdrop = d.background; } });
  pInfo.then(draw);
  pMeta.then(draw);
}

/* =====================================================================
   LIVE TV — guide + list
   ===================================================================== */
let preview = null;
const epgCache = new Map();
async function getEpg(ch, day) {
  const c = epgCache.get(ch.id);
  if (c && Date.now() - c.t < 10 * 60000 && (c.day || !day)) return c.list;
  const list = day ? await S.provider.epgDay(ch) : await S.provider.epg(ch);
  epgCache.set(ch.id, { list, t: Date.now(), day });
  return list;
}
function makePreview(video) {
  preview?.stop();
  preview = new Engine(video, (st) => {
    const ld = $('#pvLoading');
    if (!ld) return;
    ld.classList.toggle('hidden', !(st === 'loading' || st === 'buffering'));
    if (st === 'playing' || st === 'ready') $('#pvEmpty')?.classList.add('hidden');
    if (st === 'error') {
      ld.classList.add('hidden');
      const e = $('#pvEmpty');
      if (e) { e.classList.remove('hidden'); e.querySelector('span').textContent = "This channel isn't responding right now"; }
    }
  });
  video.addEventListener('dblclick', () => openLiveFull());
}
function liveList(d) {
  const u = S.ui.live, q = norm(u.q), fav = favs().live || {};
  let list = u.cat === 'all' ? d.items : u.cat === 'fav' ? d.items.filter((c) => fav[c.id]) : d.items.filter((c) => c.cat === u.cat);
  if (q) list = list.filter((c) => norm(c.name).includes(q));
  return list;
}
async function renderLive(el) {
  loadingState(el, 'Loading channels…');
  let d;
  try { d = await loadSection('live'); } catch (e) { return errorState(el, e.message, () => go('live')); }
  if (S.view !== 'live') return;
  const u = S.ui.live;
  if (!u.sel) u.sel = store.get(pkey('lastCh'), null);
  if (S.settings.liveMode === 'list') return renderLiveList(el, d);

  const catOpts = `<option value="all">All channels (${d.items.length})</option><option value="fav">Favorites</option>` + d.cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${d.counts.get(c.id) || 0})</option>`).join('');
  el.innerHTML = `<div class="guide">
    <div class="g-top">
      <div class="g-prev"><video id="pvVideo" playsinline></video>
        <div class="pv-empty" id="pvEmpty">${ic('tv')}<span>Pick a channel to preview</span></div>
        <div class="pv-loading hidden" id="pvLoading"><div class="spinner"></div></div>
        <span class="chip live live-tag">LIVE</span></div>
      <div class="g-info" id="gInfo"></div>
    </div>
    <div class="g-tools">
      <div class="seg2"><button class="active" data-act="live-mode" data-mode="guide">${ic('grid')} Guide</button><button data-act="live-mode" data-mode="list">${ic('list')} List</button></div>
      <select class="select" id="gCat" aria-label="Channel group">${catOpts}</select>
      <label class="search">${ic('search')}<input id="chanQ" placeholder="Find a channel" value="${esc(u.q)}"></label>
      <div class="spacer"></div>
      <div class="g-win"><button class="icon-btn plain" data-act="g-shift" data-d="-1" aria-label="Earlier">${ic('chevL')}</button><span id="gWinLabel"></span><button class="icon-btn plain" data-act="g-shift" data-d="1" aria-label="Later">${ic('chevR')}</button><button class="btn small ghost" data-act="g-shift" data-d="0">Now</button></div>
    </div>
    <div class="g-grid" id="gGrid"><div class="g-times" id="gTimes"></div><div class="g-rows" id="gRows"><div class="g-now" id="gNow"></div></div></div>
  </div>`;
  $('#gCat').value = u.cat;
  makePreview($('#pvVideo'));

  const SPAN = 3 * 3600e3;
  const win = () => { const n = Date.now(); const base = Math.floor(n / 1800e3) * 1800e3 - 1800e3; return base + u.offset * 3600e3; };
  const pct = (t, w0) => ((t - w0) / SPAN) * 100;
  const drawTimes = () => {
    const w0 = win();
    let h = '';
    for (let t = w0; t < w0 + SPAN; t += 1800e3) h += `<span style="left:${pct(t, w0)}%">${fmtClock(new Date(t))}</span>`;
    $('#gTimes').innerHTML = `<div style="position:relative;flex:1">${h}</div>`;
    $('#gWinLabel').textContent = `${fmtClock(new Date(w0))} – ${fmtClock(new Date(w0 + SPAN))}`;
    const n = Date.now(), f = (n - w0) / SPAN;
    const now = $('#gNow');
    now.style.display = f >= 0 && f <= 1 ? '' : 'none';
    now.style.left = `calc(236px + (100% - 236px) * ${f})`;
  };
  const drawRowTl = (ch, list) => {
    const tl = $(`.g-tl[data-ch="${CSS.escape(ch.id)}"]`);
    if (!tl) return;
    const w0 = win(), w1 = w0 + SPAN, n = Date.now();
    const vis = list.filter((p) => p.end > w0 && p.start < w1);
    if (!vis.length) { tl.innerHTML = `<div class="g-empty">${list.length ? 'No listings in this time window' : 'No programme guide for this channel'}</div>`; return; }
    tl.innerHTML = vis.map((p) => {
      const l = Math.max(0, pct(p.start, w0)), r = Math.min(100, pct(p.end, w0));
      const isNow = p.start <= n && p.end > n, past = p.end <= n;
      const catch_ = past && ch.archive;
      return `<button class="g-prog ${isNow ? 'now' : ''} ${past ? 'past' : ''} ${catch_ ? 'catch' : ''}" style="left:calc(${l}% + 2px);width:calc(${r - l}% - 6px)" data-act="g-prog" data-ch="${esc(ch.id)}" data-s="${p.start}" data-e="${p.end}" title="${esc(p.title)}">
        <b>${esc(p.title)}</b><small>${catch_ ? ic('restart') : ''}${fmtClock(new Date(p.start))} – ${fmtClock(new Date(p.end))}</small></button>`;
    }).join('');
  };
  const lim = limiter(4);
  const rowIo = new IntersectionObserver((ens) => ens.forEach((en) => {
    if (!en.isIntersecting) return;
    rowIo.unobserve(en.target);
    const ch = S.maps.live.get(en.target.dataset.ch);
    if (!ch) return;
    lim(() => getEpg(ch, ch.archive)).then((list) => drawRowTl(ch, list)).catch(() => drawRowTl(ch, []));
  }), { root: $('#gGrid'), rootMargin: '400px' });
  const rowTpl = (ch) => `<div class="g-row"><button class="g-ch ${ch.id === u.sel ? 'active' : ''}" data-act="sel-live" data-id="${esc(ch.id)}">
      <span class="num">${esc(ch.num)}</span><span class="lg">${ch.logo ? `<img loading="lazy" src="${esc(ch.logo)}" alt="">` : `<span class="ini">${esc(initials(ch.name))}</span>`}</span><b>${esc(ch.name)}</b></button>
      <div class="g-tl" data-ch="${esc(ch.id)}"><div class="g-empty">Loading guide…</div></div></div>`;
  const drawRows = () => {
    const list = liveList(d);
    S.liveList = list;
    const rows = $('#gRows');
    const now = $('#gNow');
    if (!list.length) { rows._io?.disconnect(); rows.innerHTML = `<div class="center-state" style="height:auto;padding:40px">${u.cat === 'fav' ? 'Tap ♥ on any channel to add it to your favorites.' : 'No channels found.'}</div>`; rows.appendChild(now); return; }
    mountList(rows, list, rowTpl, 40, (c) => $$('.g-tl', c).forEach((tl) => {
      if (tl.dataset.obs) return; tl.dataset.obs = '1';
      const cached = epgCache.get(tl.dataset.ch);
      if (cached) drawRowTl(S.maps.live.get(tl.dataset.ch), cached.list); else rowIo.observe(tl);
    }));
    rows.prepend(now);
  };
  S.guideRedraw = () => { drawTimes(); $$('.g-tl').forEach((tl) => { const c = epgCache.get(tl.dataset.ch); if (c) drawRowTl(S.maps.live.get(tl.dataset.ch), c.list); }); };
  S.renderLiveChannels = drawRows;
  drawTimes(); drawRows();
  if (u.sel && S.maps.live.has(u.sel)) renderGuideInfo(S.maps.live.get(u.sel));
  else $('#gInfo').innerHTML = `<span class="eyebrow">Live TV</span><h1>Choose a channel</h1><p>Click a channel to preview it here. Click a programme that already aired on a Catch-up channel to watch it from the start.</p>`;
  $('#gCat').addEventListener('change', (e) => { u.cat = e.target.value; drawRows(); $('#gGrid').scrollTop = 0; });
  $('#chanQ').addEventListener('input', debounce((e) => { u.q = e.target.value; drawRows(); }, 160));
  clearInterval(S.guideTick); S.guideTick = setInterval(() => S.view === 'live' && S.settings.liveMode === 'guide' && S.guideRedraw?.(), 60000);
}
async function renderGuideInfo(ch, autoplay = false) {
  const box = $('#gInfo');
  if (!box) return;
  const cat = S.data.live?.catName.get(ch.cat) || '';
  const head = (now) => `
    <span class="eyebrow">CH ${esc(ch.num)} · ${esc(ch.name)}${now ? ` · On now ${fmtClock(new Date(now.start))} – ${fmtClock(new Date(now.end))}` : cat ? ' · ' + esc(cat) : ''}</span>
    <h1>${esc(now?.title || ch.name)}</h1>
    ${now?.desc ? `<p>${esc(now.desc)}</p>` : ''}
    ${now ? `<div class="bar"><b style="width:${((Date.now() - now.start) / (now.end - now.start)) * 100}%"></b></div>` : ''}
    <div class="bb-actions" style="margin-top:6px">
      <button class="btn small" data-act="pv-full">${ic('expand')} Watch full screen</button>
      ${now && ch.archive ? `<button class="btn small glassy" data-act="g-restart" data-ch="${esc(ch.id)}" data-s="${now.start}" data-e="${now.end}">${ic('restart')} Start from beginning</button>` : ''}
      <button class="btn small glassy" data-act="fav-live" data-id="${esc(ch.id)}">${ic(isFav('live', ch.id) ? 'check' : 'heart')} ${isFav('live', ch.id) ? 'In favorites' : 'Favorite'}</button>
    </div>`;
  box.innerHTML = head(null);
  const list = await getEpg(ch, ch.archive).catch(() => []);
  if (S.ui.live.sel !== ch.id || !$('#gInfo')) return;
  const now = list.find((x) => x.start <= Date.now() && x.end > Date.now());
  box.innerHTML = head(now);
}
function renderLiveList(el, d) {
  const u = S.ui.live;
  el.innerHTML = `
  <div class="live-layout">
    <div class="cats">
      <div class="cats-search" style="display:flex;flex-direction:column;gap:10px"><div class="seg2"><button data-act="live-mode" data-mode="guide">${ic('grid')} Guide</button><button class="active" data-act="live-mode" data-mode="list">${ic('list')} List</button></div><input class="input" id="catQ" placeholder="Filter groups"></div>
      <div class="cats-list" id="catList"></div>
    </div>
    <div class="chan-col">
      <div class="chan-head"><label class="search">${ic('search')}<input id="chanQ" placeholder="Find a channel" value="${esc(u.q)}"></label></div>
      <div class="chan-list" id="chanList"></div>
    </div>
    <div class="preview-col">
      <div class="preview" id="preview">
        <video id="pvVideo" playsinline></video>
        <div class="pv-empty" id="pvEmpty"><div class="orbit"><i></i></div><div class="ico">${ic('tv')}</div><span>Pick a channel to preview</span></div>
        <div class="pv-loading hidden" id="pvLoading"><div class="spinner"></div></div>
        <div class="pv-overlay"><span class="chip live">LIVE</span><button class="icon-btn" data-act="pv-full" title="Full screen">${ic('expand')}</button></div>
      </div>
      <div id="pvInfo"></div>
    </div>
  </div>`;
  makePreview($('#pvVideo'));
  const renderCats = () => {
    const q = norm($('#catQ').value);
    const favN = Object.keys(favs().live || {}).length;
    $('#catList').innerHTML =
      `<button class="cat ${u.cat === 'all' ? 'active' : ''}" data-act="live-cat" data-cat="all"><span>All channels</span><span class="n">${d.items.length}</span></button>
       <button class="cat ${u.cat === 'fav' ? 'active' : ''}" data-act="live-cat" data-cat="fav"><span>Favorites</span><span class="n">${favN}</span></button>
       <div class="cat-sep"></div>` +
      d.cats.filter((c) => !q || norm(c.name).includes(q)).map((c) => `<button class="cat ${u.cat === c.id ? 'active' : ''}" data-act="live-cat" data-cat="${esc(c.id)}"><span>${esc(c.name)}</span><span class="n">${d.counts.get(c.id) || 0}</span></button>`).join('');
  };
  S.renderLiveChannels = () => {
    const list = liveList(d);
    S.liveList = list;
    const showCat = u.cat === 'all' || u.cat === 'fav' || u.q;
    if (!list.length) { $('#chanList').innerHTML = `<div class="center-state" style="height:auto;padding:40px 10px">${u.cat === 'fav' ? 'Tap the ♥ on any channel to add it here.' : 'No channels found.'}</div>`; return; }
    mountList($('#chanList'), list, (c) => chanRow(c, { active: c.id === u.sel, catName: showCat ? d.catName.get(c.cat) : '' }), 120);
  };
  S.renderLiveCats = renderCats;
  renderCats(); S.renderLiveChannels();
  if (u.sel && S.maps.live.has(u.sel)) renderPvInfo(S.maps.live.get(u.sel));
  $('#catQ').addEventListener('input', debounce(renderCats, 120));
  $('#chanQ').addEventListener('input', debounce((e) => { u.q = e.target.value; S.renderLiveChannels(); }, 140));
}
async function renderPvInfo(ch) {
  const box = $('#pvInfo');
  if (!box) return;
  const catName = S.data.live?.catName.get(ch.cat) || '';
  box.innerHTML = `
    <div class="pv-info">
      <div class="logo">${ch.logo ? `<img src="${esc(ch.logo)}" alt="">` : `<span class="ini">${esc(initials(ch.name))}</span>`}</div>
      <div class="meta"><h2>${esc(ch.name)}</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chip mono">CH ${esc(ch.num)}</span>${catName ? `<span class="chip">${esc(catName)}</span>` : ''}${ch.archive ? '<span class="chip">Catch-up</span>' : ''}</div></div>
      <div class="tools">
        <button class="icon-btn ${isFav('live', ch.id) ? 'on' : ''}" data-act="fav-live" data-id="${esc(ch.id)}" title="Favorite">${ic('heart')}</button>
        <button class="btn small accent" data-act="pv-full">${ic('expand')} Full screen</button>
      </div>
    </div>
    <div class="epg" id="pvEpg"></div>`;
  const epg = (await getEpg(ch, false).catch(() => [])).filter((e) => e.end > Date.now());
  if (S.ui.live.sel !== ch.id || !$('#pvEpg')) return;
  $('#pvEpg').innerHTML = epg.length
    ? `<div class="epg-h">Programme guide</div>` + epg.slice(0, 5).map((e, i) => {
        const now = e.start <= Date.now() && e.end > Date.now();
        const pct = now ? ((Date.now() - e.start) / (e.end - e.start)) * 100 : 0;
        return `<div class="epg-item ${now ? 'now' : ''}"><div class="et"><span>${fmtClock(new Date(e.start))} – ${fmtClock(new Date(e.end))}</span>${now ? '<b>ON NOW</b>' : i === 1 ? '<span>UP NEXT</span>' : ''}</div><h4>${esc(e.title)}</h4>${e.desc && i < 2 ? `<p>${esc(e.desc)}</p>` : ''}${now ? `<div class="epg-bar"><b style="width:${pct}%"></b></div>` : ''}</div>`;
      }).join('')
    : `<div class="epg-h">No programme guide for this channel</div>`;
}
function selectLive(id) {
  const ch = S.maps.live.get(id);
  if (!ch) return;
  const u = S.ui.live;
  if (u.sel === id && preview?.cur) return openLiveFull();
  u.sel = id;
  store.set(pkey('lastCh'), id);
  $$('.chan, .g-ch').forEach((n) => n.classList.toggle('active', n.dataset.id === id));
  $('#pvEmpty')?.classList.add('hidden');
  preview?.play(S.provider.liveSources(ch, S.settings.liveFormat));
  pushRecentLive(ch);
  if ($('#gInfo')) renderGuideInfo(ch); else renderPvInfo(ch);
}
function openLiveFull(id) {
  const ch = S.maps.live.get(id || S.ui.live.sel);
  if (!ch) return;
  preview?.stop();
  const list = S.view === 'live' && S.liveList?.some((c) => c.id === ch.id) ? S.liveList : S.data.live?.items.filter((c) => c.cat === ch.cat) || [ch];
  player.openLive(ch, list);
}

/* =====================================================================
   MOVIES / SERIES browse
   ===================================================================== */
async function renderVod(el, section) {
  const kind = section === 'movies' ? 'movie' : 'series';
  loadingState(el, section === 'movies' ? 'Loading movies…' : 'Loading shows…');
  let d;
  try { d = await loadSection(section); } catch (e) { return errorState(el, e.message, () => go(section)); }
  if (S.view !== section) return;
  const u = S.ui[section];
  const sortKey = section === 'movies' ? 'sortMovies' : 'sortSeries';
  el.innerHTML = `
  <div class="browse">
    <div class="cats">
      <div class="cats-search"><input class="input" id="catQ" placeholder="Filter categories"></div>
      <div class="cats-list" id="catList"></div>
    </div>
    <div class="content">
      <div class="content-head">
        <div style="min-width:0"><h2 id="vodTitle"></h2><div class="count" id="vodCount"></div></div>
        <div class="tools">
          <label class="search" style="width:240px">${ic('search')}<input id="vodQ" placeholder="Search in ${section === 'movies' ? 'movies' : 'shows'}" value="${esc(u.q)}"></label>
          <select class="select" id="vodSort" aria-label="Sort">
            <option value="default">Default order</option><option value="added">Recently added</option><option value="az">A → Z</option><option value="rating">Top rated</option><option value="year">Newest year</option>
          </select>
        </div>
      </div>
      <div class="grid" id="vodGrid"></div>
    </div>
  </div>`;
  $('#vodSort').value = S.settings[sortKey];
  const renderCats = () => {
    const q = norm($('#catQ').value);
    const favN = Object.keys(favs()[kind] || {}).length;
    $('#catList').innerHTML =
      `<button class="cat ${u.cat === 'all' ? 'active' : ''}" data-act="vod-cat" data-cat="all"><span>All ${section === 'movies' ? 'movies' : 'shows'}</span><span class="n">${d.items.length}</span></button>
       <button class="cat ${u.cat === 'fav' ? 'active' : ''}" data-act="vod-cat" data-cat="fav"><span>My List</span><span class="n">${favN}</span></button>
       <div class="cat-sep"></div>` +
      d.cats.filter((c) => !q || norm(c.name).includes(q)).map((c) => `<button class="cat ${u.cat === c.id ? 'active' : ''}" data-act="vod-cat" data-cat="${esc(c.id)}"><span>${esc(c.name)}</span><span class="n">${d.counts.get(c.id) || 0}</span></button>`).join('');
  };
  const renderGrid = () => {
    const fav = favs()[kind] || {};
    let list = u.cat === 'all' ? d.items : u.cat === 'fav' ? d.items.filter((x) => fav[x.id]) : d.items.filter((x) => x.cat === u.cat);
    const q = norm(u.q);
    if (q) list = list.filter((x) => norm(x.name).includes(q));
    const s = S.settings[sortKey];
    if (s !== 'default') {
      list = [...list];
      if (s === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
      if (s === 'added') list.sort((a, b) => (b.added || 0) - (a.added || 0));
      if (s === 'rating') list.sort((a, b) => (Meta.cached(b, kind)?.rating || b.rating || 0) - (Meta.cached(a, kind)?.rating || a.rating || 0));
      if (s === 'year') list.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    }
    $('#vodTitle').textContent = u.cat === 'all' ? `All ${section === 'movies' ? 'movies' : 'shows'}` : u.cat === 'fav' ? 'My List' : d.catName.get(u.cat) || '';
    $('#vodCount').textContent = `${list.length.toLocaleString()} ${section === 'movies' ? 'titles' : 'shows'}`;
    const g = $('#vodGrid');
    if (!list.length) { g._io?.disconnect(); g.innerHTML = `<div class="center-state" style="grid-column:1/-1;height:auto;padding:60px">Nothing here.</div>`; return; }
    g.scrollTop = 0;
    mountList(g, list, (it) => posterCard(kind, it), 60);
  };
  renderCats(); renderGrid();
  S.renderVodCats = renderCats; S.renderVodGrid = renderGrid;
  $('#catQ').addEventListener('input', debounce(renderCats, 120));
  $('#vodQ').addEventListener('input', debounce((e) => { u.q = e.target.value; renderGrid(); }, 160));
  $('#vodSort').addEventListener('change', (e) => { S.settings[sortKey] = e.target.value; saveSettings(); renderGrid(); });
}

/* =====================================================================
   MY LIST / SEARCH / SETTINGS
   ===================================================================== */
function renderMyList(el) {
  const f = favs();
  const live = Object.values(f.live || {}).map((c) => S.maps.live.get(c.id) || c);
  const mv = Object.values(f.movie || {}).map((c) => S.maps.movie.get(c.id) || c);
  const sr = Object.values(f.series || {}).map((c) => S.maps.series.get(c.id) || c);
  if (!live.length && !mv.length && !sr.length) {
    el.innerHTML = `<div class="center-state" style="height:calc(100vh - 84px)"><div class="big-ico">${ic('plus')}</div><h3>Your list is empty</h3><div>Press <b>+ My List</b> on any movie or show, or ♥ on a channel, and it'll be saved here.</div></div>`;
    return;
  }
  el.innerHTML = `<div class="scroll" style="height:auto;padding:4px 96px 50px">
    ${mv.length ? `<section class="row-section"><div class="sec-head"><h2>Movies</h2></div><div class="grid inline">${mv.map((m) => posterCard('movie', m)).join('')}</div></section>` : ''}
    ${sr.length ? `<section class="row-section"><div class="sec-head"><h2>TV shows</h2></div><div class="grid inline">${sr.map((s) => posterCard('series', s)).join('')}</div></section>` : ''}
    ${live.length ? `<section class="row-section"><div class="sec-head"><h2>Channels</h2></div><div class="grid inline" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${live.map(chanCard).join('')}</div></section>` : ''}
  </div>`;
  Enhance.observe(el);
}

async function renderSearch(el, { q = '' } = {}) {
  el.innerHTML = `<div class="scroll" style="height:auto;padding:4px 96px 50px">
    <label class="search s-big">${ic('search')}<input id="bigQ" placeholder="Search channels, movies and shows" value="${esc(q)}"></label>
    <div id="sRes"></div></div>`;
  const inp = $('#bigQ', el);
  setTimeout(() => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }, 30);
  const run = async () => {
    const qq = norm(inp.value.trim());
    const box = $('#sRes');
    if (!box) return;
    if (qq.length < 2) { box.innerHTML = `<div class="center-state" style="height:auto;padding:60px">Type at least 2 letters.</div>`; return; }
    box.innerHTML = `<div class="center-state" style="height:auto;padding:60px"><div class="spinner"></div></div>`;
    const [l, m, s] = await Promise.all(['live', 'movies', 'series'].map((k) => loadSection(k).catch(() => ({ items: [] }))));
    if (norm(inp.value.trim()) !== qq) return;
    const hit = (x) => norm(x.name).includes(qq);
    const rl = l.items.filter(hit).slice(0, 40), rm = m.items.filter(hit).slice(0, 60), rs = s.items.filter(hit).slice(0, 60);
    box.innerHTML = !rl.length && !rm.length && !rs.length
      ? `<div class="center-state" style="height:auto;padding:60px"><h3>No matches</h3><div>Try a different spelling.</div></div>`
      : `${rm.length ? `<section class="row-section"><div class="sec-head"><h2>Movies <span class="mono" style="font-size:13px;color:var(--muted)">${rm.length}</span></h2></div><div class="grid inline">${rm.map((x) => posterCard('movie', x)).join('')}</div></section>` : ''}
         ${rs.length ? `<section class="row-section"><div class="sec-head"><h2>TV shows <span class="mono" style="font-size:13px;color:var(--muted)">${rs.length}</span></h2></div><div class="grid inline">${rs.map((x) => posterCard('series', x)).join('')}</div></section>` : ''}
         ${rl.length ? `<section class="row-section"><div class="sec-head"><h2>Channels <span class="mono" style="font-size:13px;color:var(--muted)">${rl.length}</span></h2></div><div class="s-chan-grid">${rl.map((c) => chanRow(c, { catName: l.catName?.get(c.cat) })).join('')}</div></section>` : ''}`;
    Enhance.observe(box);
  };
  inp.addEventListener('input', debounce(() => { $('#globalSearch').value = inp.value; run(); }, 220));
  run();
}

async function renderSettings(el) {
  const i = S.info || {};
  const st = S.settings;
  const accounts = store.get('profiles', []);
  const v = (await window.nova?.versions?.()) || { shell: 'web', ui: '2.0.0' };
  el.innerHTML = `<div class="scroll" style="height:auto;padding:4px 96px 50px"><div class="settings">
    <div class="card">
      <h3>Subscription</h3>
      <dl class="facts">
        <div><dd>${esc(i.status || '—')}</dd><dt>Status</dt></div>
        <div><dd>${i.exp ? esc(fmtDate(i.exp)) : i.m3u ? '—' : 'Never'}</dd><dt>Expires</dt></div>
        <div><dd>${i.maxCons != null ? `${esc(i.activeCons ?? 0)} / ${esc(i.maxCons)}` : '—'}</dd><dt>Connections in use</dt></div>
        <div><dd>${esc(S.account.type === 'xtream' ? S.account.username : 'M3U')}</dd><dt>Account</dt></div>
      </dl>
    </div>
    <div class="card">
      <h3>Look & playback</h3>
      <div class="set-row"><div class="sl"><b>Theme</b><small>Dark is easier on the eyes for watching TV.</small></div>
        <div class="switch" id="themeSwitch"><button data-v="dark" class="${st.theme !== 'light' ? 'active' : ''}">Dark</button><button data-v="light" class="${st.theme === 'light' ? 'active' : ''}">Light</button></div></div>
      <div class="set-row"><div class="sl"><b>Better posters & IMDb ratings</b><small>Looks up each title on IMDb for sharper posters, backdrops, ratings and cast. Free, no account needed.</small></div>
        <div class="switch" id="enhSwitch"><button data-v="1" class="${st.enhance ? 'active' : ''}">On</button><button data-v="0" class="${!st.enhance ? 'active' : ''}">Off</button></div></div>
      <div class="set-row"><div class="sl"><b>Live stream format</b><small>If channels stutter or won't start, try switching this.</small></div>
        <select class="select" data-set="liveFormat"><option value="auto">Automatic</option><option value="ts">MPEG-TS (lowest delay)</option><option value="hls">HLS (most compatible)</option></select></div>
      <div class="set-row"><div class="sl"><b>Compatibility mode</b><small>Some providers only accept certain players. Change this if your server refuses streams.</small></div>
        <select class="select" data-set="ua"><option value="default">Standard</option><option value="vlc">Identify as VLC</option><option value="smarters">Identify as IPTV Smarters</option><option value="tivimate">Identify as TiviMate</option></select></div>
      <div class="set-row"><div class="sl"><b>External player</b><small>For files the built-in player can't decode (e.g. DTS audio).</small></div>
        <select class="select" data-set="player"><option value="vlc">VLC</option><option value="iina">IINA</option></select></div>
    </div>
    <div class="card">
      <h3>Subtitles</h3>
      <div class="set-row"><div class="sl"><b>Turn on automatically in</b><small>Nova finds subtitles for movies and episodes on OpenSubtitles — no account needed. Change language anytime in the player (press S).</small></div>
        <select class="select" data-set="subLang">${SUB_LANG_CHOICES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select></div>
      <div class="set-row"><div class="sl"><b>Subtitle size</b></div>
        <select class="select" data-set="subScale"><option value="0.8">Small</option><option value="1">Medium</option><option value="1.25">Large</option><option value="1.5">Extra large</option></select></div>
    </div>
    <div class="card">
      <h3>Profiles</h3>
      <div class="profiles-list">${People.list().map((p) => `<div class="profile-row ${p.id === S.person?.id ? 'current' : ''}"><span class="avatar" style="--pc:${p.color}">${esc(initials(p.name))}</span><div class="pmeta"><div class="pname">${esc(p.name)}</div><div class="phost">Own favorites, My List and Continue watching</div></div></div>`).join('')}</div>
      <button class="btn small" data-act="who-manage">${ic('users')} Manage profiles</button>
    </div>
    <div class="card">
      <h3>Playlists</h3>
      <div class="profiles-list">${accounts.map((p) => `
        <div class="profile-row ${p.id === S.account.id ? 'current' : ''}" data-act="${p.id === S.account.id ? '' : 'use-account'}" data-id="${esc(p.id)}" role="button" tabindex="0">
          <div class="pav">${esc(initials(p.name))}</div>
          <div class="pmeta"><div class="pname">${esc(p.name)}${p.id === S.account.id ? ' <span class="chip solid" style="height:22px;margin-left:6px">In use</span>' : ''}</div><div class="phost">${esc(p.type === 'xtream' ? p.username + ' @ ' + hostOf(p.server) : hostOf(p.m3u))}</div></div>
          ${p.id === S.account.id ? '' : `<button class="icon-btn pdel" data-act="del-account" data-id="${esc(p.id)}" title="Remove">${ic('trash')}</button>`}
        </div>`).join('')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn small" data-act="add-account">${ic('plus')} Add playlist</button>
        <button class="btn small ghost" data-act="refresh">${ic('refresh')} Refresh content</button>
        <button class="btn small ghost" data-act="clear-hist">Clear watch history</button>
        <button class="btn small danger" data-act="logout">${ic('logout')} Log out</button>
      </div>
    </div>
    <div class="card">
      <h3>Updates</h3>
      <div class="set-row"><div class="sl"><b>Nova TV ${esc(v.ui)}</b><small>App ${esc(v.shell)} · Updates install automatically in the background.</small></div>
        <button class="btn small" data-act="check-updates">${ic('refresh')} Check now</button></div>
    </div>
    <div style="color:var(--dim);font-size:12px;padding:4px 6px" class="mono">Space play/pause · ←/→ seek · ↑/↓ change channel · S subtitles & quality · P mini player · F fullscreen · L channel list · M mute · ⌘K search</div>
  </div></div>`;
  $$('[data-set]', el).forEach((s) => {
    s.value = String(st[s.dataset.set]);
    s.addEventListener('change', () => {
      st[s.dataset.set] = s.dataset.set === 'subScale' ? Number(s.value) : s.value; saveSettings();
      if (s.dataset.set === 'ua') window.nova?.setUserAgent(s.value);
      toast('Saved');
    });
  });
  $('#themeSwitch', el).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    st.theme = b.dataset.v; saveSettings(); applyTheme();
    $$('#themeSwitch button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#enhSwitch', el).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    st.enhance = b.dataset.v === '1'; saveSettings();
    $$('#enhSwitch button').forEach((x) => x.classList.toggle('active', x === b));
  });
}
function applyTheme() {
  if (S.settings.theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
}

/* =====================================================================
   WHO'S WATCHING (profiles)
   ===================================================================== */
function renderWho(mode = 'pick', editId = null) {
  const box = $('#who');
  const list = People.list();
  box.classList.remove('hidden');
  $('#shell').classList.add('hidden');
  if (mode === 'form') {
    const p = list.find((x) => x.id === editId) || { name: '', color: PERSON_COLORS[list.length % PERSON_COLORS.length] };
    let color = p.color;
    box.innerHTML = `<div class="who-in"><h1>${editId ? 'Edit profile' : 'Add a profile'}</h1>
      <form class="who-form" id="whoForm">
        <div style="display:flex;justify-content:center"><span class="avatar big" id="whoPrev" style="--pc:${color}">${esc(initials(p.name || '?'))}</span></div>
        <label class="field" style="margin:0"><span>Name</span><input name="name" maxlength="20" value="${esc(p.name)}" placeholder="e.g. Sara" required></label>
        <div class="swatches" id="whoSw">${PERSON_COLORS.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" data-c="${c}" style="background:radial-gradient(circle at 35% 35%,#FFE2D6,${c} 62%)" aria-label="Colour"></button>`).join('')}</div>
        <div style="display:flex;gap:10px">
          <button class="btn accent" type="submit" style="flex:1">${editId ? 'Save' : 'Add profile'}</button>
          <button class="btn ghost" type="button" id="whoCancel">Cancel</button>
          ${editId && list.length > 1 ? `<button class="btn danger" type="button" id="whoDel">${ic('trash')}</button>` : ''}
        </div>
      </form></div>`;
    const f = $('#whoForm');
    f.name.addEventListener('input', () => { $('#whoPrev').textContent = initials(f.name.value || '?'); });
    $('#whoSw').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; color = b.dataset.c; $$('#whoSw button').forEach((x) => x.classList.toggle('on', x === b)); $('#whoPrev').style.setProperty('--pc', color); });
    $('#whoCancel').onclick = () => renderWho('manage');
    $('#whoDel')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Delete?'; return; }
      People.remove(editId);
      if (S.person?.id === editId) S.person = null;
      renderWho('manage');
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      if (editId) People.update(editId, { name: f.name.value.trim() || p.name, color });
      else People.add(f.name.value, color);
      renderWho('manage');
    });
    setTimeout(() => f.name.focus(), 50);
    return;
  }
  const manage = mode === 'manage';
  box.innerHTML = `<div class="who-in"><h1>${manage ? 'Manage profiles' : "Who's watching?"}</h1>
    <div class="who-grid">${list.map((p) => `<button class="who-p" data-act="${manage ? 'who-edit' : 'who-pick'}" data-id="${esc(p.id)}"><span class="avatar big" style="--pc:${p.color}">${esc(initials(p.name))}</span><span class="nm">${esc(p.name)}</span>${manage ? `<span class="edit-dot">${ic('edit')}</span>` : ''}</button>`).join('')}
      ${list.length < 6 ? `<button class="who-p" data-act="who-add"><span class="add">${ic('plus')}</span><span class="nm">Add profile</span></button>` : ''}</div>
    <button class="btn ${manage ? 'accent' : 'ghost'}" data-act="${manage ? 'who-done' : 'who-manage'}">${manage ? 'Done' : 'Manage profiles'}</button></div>`;
}
