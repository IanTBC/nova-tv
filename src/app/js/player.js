/* =====================================================================
   NOVA TV — full-screen player: subtitles, quality, mini player
   ===================================================================== */
'use strict';

const player = (() => {
  const root = $('#player'), video = $('#video');
  let item = null, idleT, saveT = 0, epgT, osdT, seeking = false, miniCtx = null;
  const eng = new Engine(video, onState);
  const sub = { groups: null, lang: null, idx: 0, cues: [], offset: 0, status: 'idle', token: 0, last: '' };

  /* ---------------- states ---------------- */
  function onState(st) {
    $('#pLoading').classList.toggle('hidden', !(st === 'loading' || st === 'buffering'));
    if (st === 'loading') $('#pLoadingText').textContent = item?.kind === 'live' ? 'Tuning in…' : 'Loading…';
    if (st === 'buffering') $('#pLoadingText').textContent = 'Buffering…';
    if (st === 'playing' || st === 'ready') $('#pError').classList.add('hidden');
    if (st === 'tracks' || st === 'playing' || st === 'level') { updateBadge(); if (!$('#pPanel').classList.contains('hidden')) renderPanel(); }
    if (st === 'error') {
      $('#pLoading').classList.add('hidden');
      $('#pErrorMsg').textContent = item?.kind === 'live'
        ? "The channel didn't respond. It may be offline, or your subscription's connection limit may be reached. Try again, pick another quality in the subtitles & quality menu, or open it in VLC."
        : item?.kind === 'catchup'
          ? "This programme isn't available to replay. Catch-up only works for a few days back on channels marked Catch-up."
          : "This video's format (often MKV with DTS/AC3 audio) can't be decoded by the built-in player. Open it in VLC or IINA to watch it.";
      $('#pError').classList.remove('hidden');
      showChrome();
    }
  }
  function updateBadge() {
    if (!item) return;
    const h = eng.currentHeight || video.videoHeight;
    const q = h ? `${h >= 2000 ? '4K' : h + 'p'}${eng.levels().length ? (eng.autoLevel ? ' · Auto' : '') : ''}` : '';
    $('#pBadges').innerHTML = (item.kind === 'kicklive' ? `<button class="chip live" data-act="p-golive" id="pGoLive" title="Jump to live">LIVE</button>` : item.kind === 'live' ? '<span class="chip live">LIVE</span>' : item.kind === 'catchup' ? '<span class="chip">Catch-up</span>' : '') + (q ? `<span class="p-quality-tag">${esc(q)}</span>` : '');
  }

  /* ---------------- open ---------------- */
  function common(it, sources) {
    item = it;
    $('#pTitle').textContent = it.title;
    $('#pSub').textContent = it.sub || '';
    $('#pError').classList.add('hidden');
    const live = it.kind === 'live' || it.kind === 'kicklive';
    $('#pProgress').classList.toggle('live', it.kind === 'live');
    $('#pBack10').classList.toggle('hidden', it.kind === 'live');
    $('#pFwd10').classList.toggle('hidden', it.kind === 'live');
    const nav = live || it.kind === 'episode';
    $('#pPrev').classList.toggle('hidden', !nav);
    $('#pNext').classList.toggle('hidden', !nav);
    $('#pChannelsBtn').classList.toggle('hidden', !nav);
    $('#pNextEp').classList.toggle('hidden', !(it.kind === 'episode' && nextEpisode()));
    $('#pDrawerTitle').textContent = live ? 'Channels' : `Season ${it.season}`;
    $('#pEpg').classList.add('hidden');
    $('#pPanel').classList.add('hidden');
    updateBadge();
    root.classList.remove('hidden');
    showChrome();
    eng.play(sources);
    if (!$('#pDrawer').classList.contains('hidden')) renderDrawer();
    resetSubs();
    if (it.kind === 'movie' || it.kind === 'episode') autoSubs();
    skipUsed = false; upCancelled = false; hideUpNext(); $('#pSkip').classList.add('hidden');
    setMediaSession(it);
  }
  /* ---------------- Control Center / media keys ---------------- */
  function setMediaSession(it) {
    if (!('mediaSession' in navigator)) return;
    const art = it.img || it.ch?.logo || it.m?.poster || it.series?.poster || '';
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.kind === 'episode' ? `${it.ep.title}` : it.title, artist: it.kind === 'episode' ? `${it.series.name} · S${it.season} E${it.ep.num}` : it.kind === 'live' ? `Live · ${it.ch.name}` : (it.sub || 'Nova TV'), album: 'Nova TV', artwork: art ? [{ src: art, sizes: '512x512' }] : [] });
    } catch {}
  }
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession, on = (a, f) => { try { ms.setActionHandler(a, f); } catch {} };
    on('play', () => video.play().catch(() => {}));
    on('pause', () => video.pause());
    on('seekbackward', () => { if (item && item.kind !== 'live') video.currentTime = Math.max(0, video.currentTime - 10); });
    on('seekforward', () => { if (item && item.kind !== 'live') video.currentTime += 10; });
    on('previoustrack', () => { if (item?.list) step(-1); });
    on('nexttrack', () => { if (item?.kind === 'episode') { const nx = nextEpisode(); if (nx) { persist(); openEpisode(item.series, item.info, nx.season, nx.id, { restart: true }); } } else if (item?.list) step(1); });
  }
  /* ---------------- skip intro + up next ---------------- */
  let skipUsed = false, upCancelled = false, upTimer = null;
  function hideUpNext() { clearInterval(upTimer); upTimer = null; $('#pUpNext').classList.add('hidden'); }
  function showUpNext(nx) {
    if (upTimer || upCancelled) return;
    const box = $('#pUpNext');
    let n = 10;
    const img = nx.img || item.info.backdrop || item.series.poster || '';
    const draw = () => { box.innerHTML = `${img ? `<img src="${esc(img)}" alt="">` : '<span></span>'}<div class="un-t"><small>Next episode in ${n}s</small><b>E${nx.num} · ${esc(nx.title)}</b><div class="un-a"><button class="btn small" data-act="un-play">${ic('play', 'fill')} Play now</button><button class="btn small ghost" data-act="un-cancel" style="color:#EEF0FA">Cancel</button></div></div><div class="un-bar"><b style="width:${(10 - n) * 10}%"></b></div>`; };
    draw(); box.classList.remove('hidden');
    upTimer = setInterval(() => { n--; if (n <= 0) { hideUpNext(); persist(true); openEpisode(item.series, item.info, nx.season, nx.id, { restart: true }); } else draw(); }, 1000);
  }
  video.addEventListener('timeupdate', () => {
    if (item?.kind !== 'episode' || !video.duration) return;
    const t = video.currentTime, left = video.duration - t;
    $('#pSkip').classList.toggle('hidden', skipUsed || t < 12 || t > 200);
    const nx = nextEpisode();
    if (nx && left < 25 && left > 1 && video.duration > 300) showUpNext(nx);
    else if (upTimer && left >= 25) hideUpNext();
  });
  function openLive(ch, list) {
    pushRecentLive(ch);
    store.set(pkey('lastCh'), ch.id);
    S.ui.live.sel = ch.id;
    const cat = S.data.live?.catName.get(ch.cat) || '';
    common({ kind: 'live', id: ch.id, ch, list, title: ch.name, sub: `CH ${ch.num}${cat ? ' · ' + cat : ''}` }, S.provider.liveSources(ch, S.settings.liveFormat));
    loadEpg(ch);
  }
  function openKick(k) {
    common({ kind: k.live ? 'kicklive' : 'kickvod', id: 'kick:' + k.url, title: k.title, sub: k.sub, img: k.img }, [{ url: k.url, type: 'hls', live: !!k.live, dvr: !!k.live }]);
  }
  function openCatchup(ch, prog) {
    const src = S.provider.timeshiftSources?.(ch, prog.start, prog.end);
    if (!src) return toast("Catch-up isn't available for this channel", { err: true });
    common({ kind: 'catchup', id: ch.id + ':' + prog.start, ch, title: prog.title || ch.name, sub: `${ch.name} · ${fmtClock(new Date(prog.start))} – ${fmtClock(new Date(prog.end))}` }, src);
  }
  async function loadEpg(ch) {
    clearInterval(epgT);
    const draw = async () => {
      const e = await S.provider.epg(ch);
      if (item?.id !== ch.id) return;
      const now = e.find((x) => x.start <= Date.now() && x.end > Date.now());
      const nxt = e.find((x) => x.start >= (now?.end || Date.now()));
      const box = $('#pEpg');
      if (!now) { box.classList.add('hidden'); return; }
      const pct = ((Date.now() - now.start) / (now.end - now.start)) * 100;
      box.innerHTML = `<span class="eyebrow"><span class="pdot red"></span>On now · ${fmtClock(new Date(now.start))} – ${fmtClock(new Date(now.end))}</span><h4>${esc(now.title)}</h4>${now.desc ? `<p>${esc(now.desc.slice(0, 220))}</p>` : ''}<div class="epg-bar"><b style="width:${pct}%"></b></div>${nxt ? `<div class="next">Next · ${fmtClock(new Date(nxt.start))} <b>${esc(nxt.title)}</b></div>` : ''}`;
      box.classList.remove('hidden');
    };
    draw();
    epgT = setInterval(draw, 60000);
  }
  function openMovie(m, { restart = false, at = null } = {}) {
    const url = S.provider.movieUrl(m);
    const h = history()['movie:' + m.id];
    common({ kind: 'movie', id: m.id, m, key: 'movie:' + m.id, title: m.name, sub: [m.year, 'Movie'].filter(Boolean).join(' · '), img: m.backdrop || m.poster, ext: m.ext, url: m.url, resumeAt: at ?? (!restart && h ? h.pos : 0), exact: at != null }, vodSources(url, m.ext));
  }
  function openEpisode(series, info, season, epId, { restart = false, at = null } = {}) {
    const ss = info.seasons.find((x) => x.num === Number(season));
    const ep = ss?.episodes.find((e) => e.id === epId);
    if (!ep) return;
    const url = S.provider.episodeUrl(ep);
    const h = history()['ep:' + ep.id];
    common({
      kind: 'episode', id: ep.id, key: 'ep:' + ep.id, title: series.name, sub: `S${ss.num} · E${ep.num} — ${ep.title}`,
      series, info, season: ss.num, ep, list: ss.episodes, img: ep.img || info.backdrop || series.poster, resumeAt: at ?? (!restart && h ? h.pos : 0), exact: at != null,
    }, vodSources(url, ep.ext));
  }
  function vodSources(url, ext) {
    ext = String(ext || '').toLowerCase();
    if (ext === 'm3u8' || /\.m3u8(\?|$)/i.test(url)) return [{ url, type: 'hls' }];
    if (ext === 'ts') return [{ url, type: 'mpegts', live: false }, { url, type: 'native' }];
    return [{ url, type: 'native' }];
  }
  function nextEpisode() {
    if (item?.kind !== 'episode') return null;
    const i = item.list.findIndex((e) => e.id === item.id);
    if (item.list[i + 1]) return item.list[i + 1];
    const ss = item.info.seasons, idx = ss.findIndex((x) => x.num === item.season);
    return ss[idx + 1]?.episodes[0] || null;
  }

  /* ---------------- subtitles ---------------- */
  function resetSubs() {
    sub.token++; sub.groups = null; sub.lang = null; sub.idx = 0; sub.cues = []; sub.offset = 0; sub.status = 'idle'; sub.last = '';
    $('#pSubsText').textContent = '';
    applySubScale();
  }
  function applySubScale() { root.style.setProperty('--subscale', S.settings.subScale || 1); }
  async function fetchGroups() {
    if (sub.groups) return sub.groups;
    const t = sub.token;
    sub.status = 'searching'; refreshPanel();
    let id = null;
    if (item.kind === 'movie') id = (await Meta.forItem(item.m, 'movie'))?.id || item.m.imdb;
    else if (item.kind === 'episode') id = (await Meta.forItem(item.series, 'series'))?.id || item.series.imdb;
    const groups = id ? await Subs.list(id, item.kind === 'episode' ? 'series' : 'movie', item.season, item.ep?.num) : [];
    if (t !== sub.token) return null;
    const pref = S.settings.subLang;
    const order = (g) => (g.lang === pref ? 0 : g.lang === 'eng' ? 1 : g.lang === 'ara' ? 2 : 3);
    sub.groups = groups.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    sub.status = id ? (groups.length ? 'ready' : 'none') : 'nomatch';
    refreshPanel();
    return sub.groups;
  }
  async function autoSubs() {
    if (S.settings.subLang === 'off') return;
    const groups = await fetchGroups();
    const g = groups && Subs.pick(groups, S.settings.subLang);
    if (g) selectSub(g.lang, 0, true);
  }
  async function selectSub(lang, idx = 0, quiet = false) {
    const g = sub.groups?.find((x) => x.lang === lang);
    if (!g) return;
    const t = sub.token;
    sub.lang = lang; sub.idx = idx % g.items.length; sub.status = 'loading'; refreshPanel();
    try {
      const cues = await Subs.load(g.items[sub.idx].url);
      if (t !== sub.token) return;
      sub.cues = cues; sub.status = 'ready';
      if (!quiet) toast(`${g.name} subtitles on`);
    } catch {
      if (t !== sub.token) return;
      sub.cues = []; sub.status = 'ready';
      toast("Couldn't load that subtitle — try another version", { err: true });
    }
    refreshPanel();
  }
  function subsOff() { sub.lang = null; sub.cues = []; $('#pSubsText').textContent = ''; sub.last = ''; refreshPanel(); }
  function tickSubs() {
    if (sub.cues.length && item) {
      const t = video.currentTime - sub.offset;
      let lo = 0, hi = sub.cues.length - 1, hit = null;
      while (lo <= hi) { const mid = (lo + hi) >> 1; const c = sub.cues[mid]; if (t < c.start) hi = mid - 1; else if (t > c.end) lo = mid + 1; else { hit = c; break; } }
      const txt = hit ? hit.text : '';
      if (txt !== sub.last) {
        sub.last = txt;
        const el = $('#pSubsText');
        el.innerHTML = esc(txt).replace(/&lt;(\/?)(i|b|u)&gt;/gi, '<$1$2>');
      }
    }
    requestAnimationFrame(tickSubs);
  }
  requestAnimationFrame(tickSubs);

  /* ---------------- settings panel ---------------- */
  const refreshPanel = () => { if (!$('#pPanel').classList.contains('hidden')) renderPanel(); };
  function renderPanel() {
    const p = $('#pPanel');
    if (!item) return;
    const vod = item.kind === 'movie' || item.kind === 'episode';
    // subtitles column
    let s = '<div class="col"><div class="ph">Subtitles</div>';
    if (!vod) s += `<div class="note">Subtitles aren't available for ${item.kind === 'live' ? 'live TV' : item.kind.startsWith('kick') ? 'Kick streams' : 'catch-up TV'}.</div>`;
    else {
      s += `<button class="opt ${!sub.lang ? 'on' : ''}" data-act="sub-off">Off</button>`;
      if (sub.status === 'searching' || sub.status === 'idle') s += '<div class="note">Searching OpenSubtitles…</div>';
      else if (sub.status === 'nomatch') s += "<div class=\"note\">Couldn't identify this title on IMDb, so subtitles can't be matched.</div>";
      else if (sub.status === 'none') s += '<div class="note">No subtitles found for this title yet.</div>';
      (sub.groups || []).forEach((g) => {
        const on = sub.lang === g.lang;
        s += `<button class="opt ${on ? 'on' : ''}" data-act="sub-lang" data-lang="${esc(g.lang)}">${esc(g.name)}<small>${on && sub.status === 'loading' ? 'loading…' : g.items.length + (g.items.length === 1 ? ' file' : ' files')} ${on ? '▾' : '▸'}</small></button>`;
        if (on && g.items.length > 1) {
          s += g.items.map((f, i) => `<button class="opt file ${i === sub.idx ? 'cur' : ''}" data-act="sub-file" data-lang="${esc(g.lang)}" data-i="${i}" title="${esc(f.label)}"><span>${i === sub.idx ? '● ' : ''}${i + 1}. ${esc(f.label.replace(/\.(srt|vtt|sub|ass)$/i, ''))}</span></button>`).join('');
        }
      });
      s += `<div class="steppers">
        <div class="stepper"><span>Size</span><button data-act="sub-size" data-d="-1" aria-label="Smaller">−</button><b>${Math.round((S.settings.subScale || 1) * 100)}%</b><button data-act="sub-size" data-d="1" aria-label="Bigger">+</button></div>
        <div class="stepper"><span>Sync</span><button data-act="sub-sync" data-d="-1" aria-label="Earlier">−</button><b>${sub.offset > 0 ? '+' : ''}${sub.offset.toFixed(2)}s</b><button data-act="sub-sync" data-d="1" aria-label="Later">+</button></div>
      </div>`;
    }
    s += '</div>';
    // quality column
    let q = '<div class="col"><div class="ph">Quality</div>';
    const vers = item.kind === 'live' ? versionsOf(item.ch) : [];
    const levels = eng.levels();
    if (vers.length) {
      q += vers.map((v) => `<button class="opt ${v.ch.id === item.ch.id ? 'on' : ''}" data-act="q-ver" data-id="${esc(v.ch.id)}">${esc(v.q.label)}<small>${esc(v.ch.name.slice(0, 26))}</small></button>`).join('');
    }
    if (levels.length) {
      if (vers.length) q += '<div class="ph gap">Stream quality</div>';
      const h = eng.currentHeight;
      q += `<button class="opt ${eng.autoLevel ? 'on' : ''}" data-act="q-level" data-i="-1">Auto<small>${h ? 'now ' + h + 'p' : ''}</small></button>`;
      q += levels.map((l) => `<button class="opt ${l.on ? 'on' : ''}" data-act="q-level" data-i="${l.i}">${esc(l.label)}<small>${l.h >= 1080 ? 'Full HD' : l.h >= 720 ? 'HD' : l.h ? 'Data saver' : ''}</small></button>`).join('');
    }
    if (!vers.length && !levels.length) {
      const h = video.videoHeight;
      q += `<div class="note">Your provider sends this ${item.kind === 'live' ? 'channel' : 'title'} in one quality${h ? ` — playing at <b style="color:#EEF0FA">${h >= 2000 ? '4K' : h + 'p'}</b>` : ''}.${item.kind === 'live' ? ' If your list has SD/HD/FHD versions of a channel, they show up here.' : ''}</div>`;
    }
    const tracks = eng.audioTracks();
    if (tracks.length) {
      q += '<div class="ph gap">Audio</div>' + tracks.map((t) => `<button class="opt ${t.on ? 'on' : ''}" data-act="aud" data-i="${t.i}">${esc(t.label)}</button>`).join('');
    }
    q += '</div>';
    const ext = `<div class="ext"><span>No sound or won't play? Some files need a full desktop player.</span><button class="btn small ghost" data-act="p-external" style="color:#EEF0FA">${ic('external')} Open in ${S.settings.player === 'iina' ? 'IINA' : 'VLC'}</button></div>`;
    const keep = p.scrollTop;
    p.innerHTML = s + q + ext;
    p.scrollTop = keep;
  }
  function togglePanel(force) {
    const p = $('#pPanel');
    const show = force ?? p.classList.contains('hidden');
    p.classList.toggle('hidden', !show);
    if (show) { renderPanel(); if (item && (item.kind === 'movie' || item.kind === 'episode') && !sub.groups && sub.status !== 'searching') fetchGroups(); }
    showChrome();
  }

  /* ---------------- progress / resume ---------------- */
  video.addEventListener('loadedmetadata', () => {
    if (item?.exact && item.resumeAt > 1) video.currentTime = item.resumeAt;
    else if (item?.resumeAt > 20 && video.duration && item.resumeAt < video.duration * 0.95) {
      video.currentTime = item.resumeAt;
      toast(`Resumed from ${fmtTime(item.resumeAt)}`, { action: 'Start over', onAction: () => { video.currentTime = 0; } });
    }
    if (item) item.resumeAt = 0;
    updateBadge();
  });
  video.addEventListener('timeupdate', () => {
    updateTime();
    if (!item || (item.kind !== 'movie' && item.kind !== 'episode')) return;
    const now = Date.now();
    if (now - saveT > 5000 && video.duration && isFinite(video.duration)) { saveT = now; persist(); }
  });
  function record(it, pos, dur, done) {
    if (!it || (it.kind !== 'movie' && it.kind !== 'episode') || !dur || !isFinite(dur)) return;
    if (pos < 10 && !done) return;
    const rec = { key: it.key, kind: it.kind, id: it.id, title: it.kind === 'episode' ? it.series.name : it.title, img: it.img, pos, dur, done: done || pos / dur > 0.94 };
    if (it.kind === 'movie') Object.assign(rec, { sub: 'Movie', ext: it.ext, url: it.url, name: it.title, imdb: it.m?.imdb });
    else Object.assign(rec, { sub: `S${it.season} · E${it.ep.num}`, seriesId: it.series.id, season: it.season, episode: it.ep.num });
    saveHistory(rec);
  }
  const persist = (done) => record(item, video.currentTime, video.duration, done);
  video.addEventListener('ended', () => {
    persist(true);
    const nx = nextEpisode();
    if (nx && !upCancelled) { hideUpNext(); toast(`Up next: E${nx.num} ${nx.title}`); openEpisode(item.series, item.info, nx.season, nx.id, { restart: true }); }
  });
  video.addEventListener('play', () => setIcon($('#pToggleIcon'), 'pause'));
  video.addEventListener('pause', () => { setIcon($('#pToggleIcon'), 'play'); showChrome(); });
  video.addEventListener('volumechange', () => {
    if (video.dataset.hiding) return;
    $('#pVol').value = video.muted ? 0 : video.volume;
    setIcon($('#pVolIcon'), video.muted || video.volume === 0 ? 'mute' : 'volume');
    store.set('vol', { v: video.volume, m: video.muted });
  });
  const vs = store.get('vol', { v: 1, m: false });
  video.volume = vs.v; video.muted = vs.m;

  function updateTime() {
    if (!item) return;
    if (item.kind === 'live') { $('#pTime').textContent = fmtClock(new Date()); return; }
    if (item.kind === 'kicklive') {
      let edge = 0; try { edge = video.buffered.end(video.buffered.length - 1); } catch {}
      const behind = Math.max(0, edge - video.currentTime);
      $('#pTime').textContent = behind > 6 ? `−${fmtTime(behind)} behind live` : fmtClock(new Date());
      const gl = $('#pGoLive'); if (gl) gl.textContent = behind > 6 ? 'Go live' : 'LIVE';
      const [a, b] = range();
      if (!seeking && b > a) { const pc = Math.min(100, ((video.currentTime - a) / (b - a)) * 100); $('#pFill').style.width = pc + '%'; $('#pKnob').style.left = pc + '%'; $('#pBuffer').style.width = '100%'; }
      return;
    }
    const d = video.duration || 0, c = video.currentTime || 0;
    $('#pTime').textContent = `${fmtTime(c)} / ${fmtTime(d)}`;
    if (!seeking && d) {
      const p = (c / d) * 100;
      $('#pFill').style.width = p + '%';
      $('#pKnob').style.left = p + '%';
    }
    try { if (video.buffered.length && d) $('#pBuffer').style.width = (video.buffered.end(video.buffered.length - 1) / d) * 100 + '%'; } catch {}
  }

  // seek bar
  const bar = $('#pProgress');
  // seekable range: whole file for VOD, the kept window for Kick live
  function range() {
    if (item?.kind === 'kicklive') {
      try { const s = video.seekable.length ? video.seekable : video.buffered; return [s.start(0), s.end(s.length - 1)]; } catch { return [0, 0]; }
    }
    return [0, video.duration || 0];
  }
  const pctAt = (e) => { const r = bar.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  bar.addEventListener('mousemove', (e) => {
    const [a, b] = range(); if (!(b > a) || !isFinite(b)) return;
    const p = pctAt(e), ht = $('#pHoverTime');
    ht.textContent = item?.kind === 'kicklive' ? (b - (a + p * (b - a)) < 3 ? 'LIVE' : '−' + fmtTime(b - (a + p * (b - a)))) : fmtTime(a + p * (b - a));
    ht.style.left = p * 100 + '%'; ht.classList.remove('hidden');
  });
  bar.addEventListener('mouseleave', () => $('#pHoverTime').classList.add('hidden'));
  bar.addEventListener('mousedown', (e) => {
    if (item?.kind === 'live') return;
    const [a, b] = range(); if (!(b > a) || !isFinite(b)) return;
    seeking = true;
    const move = (ev) => { const p = pctAt(ev); $('#pFill').style.width = p * 100 + '%'; $('#pKnob').style.left = p * 100 + '%'; };
    const up = (ev) => { seeking = false; const [a2, b2] = range(); video.currentTime = Math.min(b2 - 0.5, a2 + pctAt(ev) * (b2 - a2)); removeEventListener('mousemove', move); removeEventListener('mouseup', up); };
    move(e);
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
  $('#pVol').addEventListener('input', (e) => { video.volume = Number(e.target.value); video.muted = video.volume === 0; });

  /* ---------------- chrome ---------------- */
  function showChrome() {
    root.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (!video.paused && $('#pPanel').classList.contains('hidden') && $('#pDrawer').classList.contains('hidden')) root.classList.add('idle');
    }, 2800);
  }
  root.addEventListener('mousemove', showChrome);
  video.addEventListener('click', () => { if (!$('#pPanel').classList.contains('hidden')) return togglePanel(false); toggle(); });
  video.addEventListener('dblclick', () => fullscreen());

  function toggle() { if (!item) return; if (video.paused) video.play().catch(() => {}); else video.pause(); }
  function fullscreen() { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); }
  function osd(html) {
    const o = $('#pOsd'); o.innerHTML = html; o.classList.remove('hidden');
    clearTimeout(osdT); osdT = setTimeout(() => o.classList.add('hidden'), 2200);
  }
  function step(dir) {
    if (!item?.list) return;
    const i = item.list.findIndex((x) => x.id === item.id);
    const nx = item.list[(i + dir + item.list.length) % item.list.length];
    if (!nx) return;
    if (item.kind === 'live') { openLive(nx, item.list); osd(`${esc(nx.num)} <small>${esc(nx.name)}</small>`); }
    else { persist(); openEpisode(item.series, item.info, nx.season, nx.id); }
  }
  function renderDrawer() {
    const list = item?.list || [];
    const box = $('#pDrawerList');
    if (item.kind === 'live') {
      mountList(box, list, (c) => chanRow(c, { active: c.id === item.id }).replace('data-act="sel-live"', 'data-act="p-pick"'), 100);
    } else {
      box.innerHTML = list.map((e) => `<button class="chan ${e.id === item.id ? 'active' : ''}" data-act="p-pick" data-id="${esc(e.id)}" style="grid-template-columns:34px 1fr"><span class="num">${e.num}</span><span class="nm"><b>${esc(e.title)}</b></span></button>`).join('');
    }
    setTimeout(() => box.querySelector('.chan.active')?.scrollIntoView({ block: 'center' }), 30);
  }

  function close(silent) {
    if (!item && root.classList.contains('hidden')) return;
    persist();
    clearInterval(epgT);
    eng.stop();
    resetSubs(); hideUpNext();
    const wasLive = item?.kind === 'live';
    item = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    root.classList.add('hidden');
    $('#pDrawer').classList.add('hidden');
    $('#pPanel').classList.add('hidden');
    if (!silent) App.afterPlayerClose(wasLive);
  }

  /* ---------------- mini player ---------------- */
  function mini() {
    if (!item) return;
    if (!window.nova?.miniOpen) return toast('The mini player works in the Mac app');
    const srcs = eng.sources ? [...eng.sources] : [];
    if (eng.cur) { const i = srcs.indexOf(eng.cur); if (i > 0) { srcs.splice(i, 1); srcs.unshift(eng.cur); } }
    const payload = { sources: srcs, title: item.title, sub: item.sub, live: item.kind === 'live', pos: video.currentTime || 0, volume: video.volume, muted: video.muted };
    miniCtx = { ...item };
    persist();
    close(true);
    App.afterPlayerClose(false);
    window.nova.miniOpen(payload);
  }
  window.nova?.onMiniExpand?.((d) => {
    const it = miniCtx; miniCtx = null;
    if (!it) return;
    const at = d?.pos || 0;
    if (it.kind === 'live') openLive(it.ch, it.list);
    else if (it.kind === 'movie') openMovie(it.m, { at });
    else if (it.kind === 'episode') openEpisode(it.series, it.info, it.season, it.id, { at });
    else if (it.kind === 'catchup') toast('Catch-up closed — open it again from the guide');
  });
  window.nova?.onMiniReport?.((d) => { if (miniCtx && d) record(miniCtx, d.pos, d.dur, d.ended); });
  window.nova?.onMiniClosed?.(() => { miniCtx = null; });

  async function external() {
    const url = eng.url;
    if (!url) return;
    if (window.nova) {
      const r = await window.nova.openExternalPlayer(S.settings.player, url);
      if (!r.ok) toast(`${r.error}. Install it from ${S.settings.player === 'iina' ? 'iina.io' : 'videolan.org'}.`, { err: true, ms: 6000 });
      else { toast(`Opened in ${S.settings.player === 'iina' ? 'IINA' : 'VLC'}`); close(); }
    } else { navigator.clipboard?.writeText(url); toast('Stream link copied'); }
  }

  /* ---------------- actions ---------------- */
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'p-close') close();
    else if (a === 'p-toggle') toggle();
    else if (a === 'p-golive') { try { video.currentTime = video.buffered.end(video.buffered.length - 1) - 1; } catch {} }
    else if (a === 'p-back10') video.currentTime = Math.max(0, video.currentTime - 10);
    else if (a === 'p-fwd10') { let mx = video.duration; if (!isFinite(mx)) { try { mx = video.buffered.end(video.buffered.length - 1) - 1; } catch { mx = video.currentTime; } } video.currentTime = Math.min(mx || 0, video.currentTime + 10); }
    else if (a === 'p-prev') step(-1);
    else if (a === 'p-next') step(1);
    else if (a === 'p-next-ep') { const nx = nextEpisode(); if (nx) { persist(); openEpisode(item.series, item.info, nx.season, nx.id, { restart: true }); } }
    else if (a === 'p-mute') video.muted = !video.muted;
    else if (a === 'p-fullscreen') fullscreen();
    else if (a === 'p-mini') mini();
    else if (a === 'p-panel') togglePanel();
    else if (a === 'p-retry') { $('#pError').classList.add('hidden'); eng.retry(); }
    else if (a === 'p-external') external();
    else if (a === 'p-channels') { const d = $('#pDrawer'); d.classList.toggle('hidden'); if (!d.classList.contains('hidden')) renderDrawer(); }
    else if (a === 'p-pick') {
      e.preventDefault();
      if (e.target.closest('[data-act="fav-live"]')) return;
      const id = b.dataset.id;
      if (item.kind === 'live') { const ch = item.list.find((x) => x.id === id); if (ch) openLive(ch, item.list); }
      else { persist(); openEpisode(item.series, item.info, item.season, id); }
      renderDrawer();
    }
    else if (a === 'p-skip') { skipUsed = true; video.currentTime = Math.min(video.duration - 5, video.currentTime + 85); $('#pSkip').classList.add('hidden'); }
    else if (a === 'un-play') { const nx = nextEpisode(); hideUpNext(); if (nx) { persist(true); openEpisode(item.series, item.info, nx.season, nx.id, { restart: true }); } }
    else if (a === 'un-cancel') { upCancelled = true; hideUpNext(); }
    else if (a === 'sub-off') subsOff();
    else if (a === 'sub-lang') selectSub(b.dataset.lang, 0);
    else if (a === 'sub-next') selectSub(sub.lang, sub.idx + 1);
    else if (a === 'sub-file') selectSub(b.dataset.lang, Number(b.dataset.i));
    else if (a === 'sub-size') { S.settings.subScale = Math.min(1.8, Math.max(0.6, Math.round(((S.settings.subScale || 1) + Number(b.dataset.d) * 0.1) * 10) / 10)); saveSettings(); applySubScale(); renderPanel(); }
    else if (a === 'sub-sync') { sub.offset = Math.round((sub.offset + Number(b.dataset.d) * 0.25) * 100) / 100; sub.last = '\u0000'; renderPanel(); }
    else if (a === 'q-level') { eng.setLevel(Number(b.dataset.i)); setTimeout(renderPanel, 300); toast(b.dataset.i === '-1' ? 'Quality: Auto' : `Quality: ${b.textContent.replace(/(Full HD|HD|Data saver)$/, '').trim()}`); }
    else if (a === 'q-ver') { const ch = S.maps.live.get(b.dataset.id); if (ch) { openLive(ch, item.list); setTimeout(() => togglePanel(true), 50); } }
    else if (a === 'aud') { eng.setAudio(Number(b.dataset.i)); setTimeout(renderPanel, 200); }
  });

  function key(e) {
    if (root.classList.contains('hidden')) return false;
    const k = e.key;
    showChrome();
    if (k === ' ' || k === 'k') toggle();
    else if (k === 'Escape') {
      if (!$('#pPanel').classList.contains('hidden')) togglePanel(false);
      else if (!$('#pDrawer').classList.contains('hidden')) $('#pDrawer').classList.add('hidden');
      else if (document.fullscreenElement) document.exitFullscreen();
      else close();
    }
    else if (k === 'f' || k === 'F') fullscreen();
    else if (k === 'm' || k === 'M') video.muted = !video.muted;
    else if (k === 's' || k === 'S' || k === 'c' || k === 'C') togglePanel();
    else if (k === 'p' || k === 'P') mini();
    else if (k === 'l' || k === 'L') { if (item?.list) { $('#pDrawer').classList.toggle('hidden'); if (!$('#pDrawer').classList.contains('hidden')) renderDrawer(); } }
    else if (k === 'ArrowLeft' && item?.kind !== 'live') video.currentTime = Math.max(0, video.currentTime - (e.shiftKey ? 30 : 10));
    else if (k === 'ArrowRight' && item?.kind !== 'live') { let mx = video.duration; if (!isFinite(mx)) { try { mx = video.buffered.end(video.buffered.length - 1) - 1; } catch { mx = video.currentTime; } } video.currentTime = Math.min(mx || 0, video.currentTime + (e.shiftKey ? 30 : 10)); }
    else if (k === 'ArrowUp') { if (item?.kind === 'live') step(-1); else { video.volume = Math.min(1, video.volume + 0.05); osd(`${Math.round(video.volume * 100)}% <small>Volume</small>`); } }
    else if (k === 'ArrowDown') { if (item?.kind === 'live') step(1); else { video.volume = Math.max(0, video.volume - 0.05); osd(`${Math.round(video.volume * 100)}% <small>Volume</small>`); } }
    else return true;
    e.preventDefault();
    return true;
  }

  return { openKick, openLive, openCatchup, openMovie, openEpisode, close, key, get open() { return !root.classList.contains('hidden'); } };
})();
