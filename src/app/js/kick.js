/* =====================================================================
   NOVA TV — Kick: each user logs in with their own Kick account.
   Website session  -> followed creators, live streams, past broadcasts.
   Official API keys (optional, Settings) -> backup for "who's live".
   ===================================================================== */
'use strict';

const Kick = (() => {
  const API = 'https://kick.com/api';
  const has = () => !!window.nova?.kickFetch;
  async function get(path) {
    const r = await window.nova.kickFetch(API + path);
    if (!r.ok) { const e = new Error(r.status === 401 ? 'login' : r.status === 403 ? 'blocked' : 'HTTP ' + r.status); e.status = r.status; throw e; }
    return r.data;
  }
  const arr = (r) => (Array.isArray(r) ? r : r?.channels || r?.data || r?.followed || []);
  const pic = (u) => (typeof u === 'string' ? u : u?.url || u?.src || '');
  function normChannel(c) {
    return {
      slug: c.channel_slug || c.slug || c.user?.username?.toLowerCase() || '',
      name: c.user_username || c.username || c.user?.username || c.slug || '',
      avatar: pic(c.profile_picture || c.user?.profile_pic || c.profile_pic),
      live: !!(c.is_live || c.livestream?.is_live || c.livestream),
      viewers: c.viewer_count ?? c.livestream?.viewer_count ?? 0,
      title: c.session_title || c.livestream?.session_title || '',
      category: c.category_name || c.livestream?.categories?.[0]?.name || '',
      thumb: pic(c.livestream?.thumbnail) || '',
    };
  }
  async function followed() {
    const out = []; let cursor = 0;
    for (let i = 0; i < 10; i++) {
      const r = await get(`/v2/channels/followed?cursor=${cursor}`);
      arr(r).forEach((c) => out.push(normChannel(c)));
      cursor = r?.nextCursor ?? r?.next_cursor;
      if (!cursor) break;
    }
    return out.filter((c) => c.slug);
  }
  async function channel(slug) {
    const c = await get(`/v2/channels/${encodeURIComponent(slug)}`);
    return {
      ...normChannel(c), slug, raw: c,
      banner: pic(c.banner_image) || pic(c.offline_banner_image),
      bio: c.user?.bio || '', followers: c.followers_count ?? c.followersCount ?? 0,
      playback: c.playback_url || '',
    };
  }
  async function videos(slug) {
    const r = await get(`/v2/channels/${encodeURIComponent(slug)}/videos`);
    return arr(r).map((v) => ({
      id: v.video?.uuid || v.uuid || String(v.id), title: v.session_title || v.video?.title || 'Past broadcast',
      thumb: pic(v.thumbnail) || pic(v.video?.thumb), src: v.source || v.video?.source || '',
      start: v.start_time || v.created_at || '', dur: (v.duration || 0) / 1000, views: v.views ?? v.video?.views ?? 0,
      category: v.categories?.[0]?.name || '',
    })).filter((v) => v.src);
  }
  async function search(q) {
    try { const r = await get(`/search?searched_word=${encodeURIComponent(q)}`); return arr(r.channels || r).map(normChannel).filter((c) => c.slug).slice(0, 20); }
    catch { const c = await channel(q.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\/(www\.)?kick\.com\//, '')); return c ? [c] : []; }
  }

  // ---- optional official API (backup for live status) ----
  let appTok = null;
  async function official(slugs) {
    const { kickId, kickSecret } = S.settings;
    if (!kickId || !kickSecret || !slugs.length) return null;
    if (!appTok || appTok.exp < Date.now()) {
      const r = await fetch('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: kickId, client_secret: kickSecret }) });
      const j = await r.json();
      if (!j.access_token) return null;
      appTok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 900 };
    }
    const qs = slugs.slice(0, 50).map((s) => 'slug=' + encodeURIComponent(s)).join('&');
    const r = await fetch(`https://api.kick.com/public/v1/channels?${qs}`, { headers: { Authorization: 'Bearer ' + appTok.t } });
    const j = await r.json();
    const m = new Map();
    (j.data || []).forEach((c) => m.set(c.slug, { live: !!c.stream?.is_live, viewers: c.stream?.viewer_count || 0, title: c.stream_title || '', category: c.category?.name || '' }));
    return m;
  }
  const saved = () => store.get('kick.saved', []);
  const setSaved = (a) => store.set('kick.saved', a);
  return { has, followed, channel, videos, search, official, saved, setSaved };
})();

const fmtViews = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n || 0));
function kickCard(c) {
  return `<button class="kcard ${c.live ? 'live' : ''}" data-act="kick-open" data-slug="${esc(c.slug)}">
    <span class="kav">${c.avatar ? `<img loading="lazy" src="${esc(c.avatar)}" alt="">` : `<span class="ini">${esc(initials(c.name))}</span>`}</span>
    <span class="km"><b>${esc(c.name)}</b><small>${c.live ? `${esc(c.category || 'Live')} · ${fmtViews(c.viewers)} watching` : 'Offline'}</small>${c.live && c.title ? `<em>${esc(c.title)}</em>` : ''}</span>
    ${c.live ? '<span class="chip live">LIVE</span>' : ''}</button>`;
}

async function renderKick(el) {
  if (!Kick.has()) {
    el.innerHTML = `<div class="center-state" style="height:calc(100vh - 84px)"><div class="big-ico">${ic('tv')}</div><h3>Kick needs the latest app version</h3><div>Look for the "Install" bar at the top of the window, or go to Settings → Updates → Check now.</div></div>`;
    return;
  }
  const st = await window.nova.kickStatus();
  const savedList = Kick.saved();
  el.innerHTML = `<div class="scroll" style="height:auto;padding:4px 96px 50px">
    <div class="khead">
      <div><span class="eyebrow"><span class="pdot"></span>Kick</span><h1>${st.loggedIn ? 'Your creators' : 'Kick on Nova TV'}</h1></div>
      <label class="search" style="width:340px">${ic('search')}<input id="kickQ" placeholder="Find a streamer on Kick"></label>
      ${st.loggedIn ? `<button class="btn small ghost" data-act="kick-logout">${ic('logout')} Log out of Kick</button>` : ''}
    </div>
    <div id="kickSearch"></div>
    ${st.loggedIn ? '' : `<div class="kicklogin"><div><h2>Log in with your Kick account</h2><p>See the creators you follow, who's live right now and their past broadcasts. Your password goes only to Kick.</p></div><button class="btn accent" data-act="kick-login">Log in with Kick</button></div>`}
    <div id="kickBody">${st.loggedIn ? '<div class="center-state" style="height:auto;padding:60px"><div class="spinner"></div></div>' : ''}</div>
  </div>`;
  $('#kickQ').addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim(), box = $('#kickSearch');
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="center-state" style="height:auto;padding:30px"><div class="spinner"></div></div>';
    try { const r = await Kick.search(q); box.innerHTML = r.length ? `<section class="row-section"><div class="sec-head"><h2>Results</h2></div><div class="kgrid">${r.map(kickCard).join('')}</div></section>` : '<div class="center-state" style="height:auto;padding:30px">No streamer found.</div>'; }
    catch (err) { box.innerHTML = `<div class="center-state" style="height:auto;padding:30px">${err.message === 'blocked' ? 'Kick is blocking requests right now — try again in a minute.' : "Couldn't search Kick."}</div>`; }
  }, 350));

  let list = [];
  if (st.loggedIn) {
    try { list = await Kick.followed(); }
    catch (err) { if (err.message === 'login') { await window.nova.kickLogout(); return renderKick(el); } }
  }
  // add creators saved without login
  const have = new Set(list.map((c) => c.slug));
  for (const s of savedList) if (!have.has(s)) { try { list.push(await Kick.channel(s)); } catch {} }
  // backup live status from the official API
  try { const m = await Kick.official(list.map((c) => c.slug)); if (m) list.forEach((c) => { const o = m.get(c.slug); if (o && !c.live && o.live) Object.assign(c, o); }); } catch {}
  if (S.view !== 'kick') return;
  const live = list.filter((c) => c.live).sort((a, b) => b.viewers - a.viewers);
  const off = list.filter((c) => !c.live);
  $('#kickBody').innerHTML = !list.length
    ? (st.loggedIn ? '<div class="center-state" style="height:auto;padding:60px"><h3>No followed creators yet</h3><div>Follow streamers on Kick, or search above and press Save.</div></div>' : '')
    : `${live.length ? `<section class="row-section"><div class="sec-head"><h2>Live now</h2><p>${live.length} of your creators</p></div><div class="kgrid">${live.map(kickCard).join('')}</div></section>` : ''}
       ${off.length ? `<section class="row-section"><div class="sec-head"><h2>${live.length ? 'Offline' : 'Your creators'}</h2></div><div class="kgrid">${off.map(kickCard).join('')}</div></section>` : ''}`;
}

async function renderKickChannel(el, { slug }) {
  loadingState(el, 'Loading channel…');
  let c, vids = [];
  try { [c, vids] = await Promise.all([Kick.channel(slug), Kick.videos(slug).catch(() => [])]); }
  catch (err) { return errorState(el, err.message === 'blocked' ? 'Kick is blocking requests right now — try again in a minute.' : "Couldn't open this channel.", () => go('kickch', { slug }, { push: false })); }
  if (S.view !== 'kickch') return;
  const isSaved = Kick.saved().includes(slug);
  el.innerHTML = `<div class="dpage">
    <button class="icon-btn dback" data-act="back" aria-label="Back">${ic('back')}</button>
    <section class="dhero" style="min-height:440px">
      <div class="dhero-art ${c.banner ? '' : 'blur'}" style="background-image:${cssUrl(c.banner || c.avatar)}"></div>
      <div class="dcopy">
        <div style="display:flex;align-items:center;gap:16px"><span class="kav big">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : ''}</span><div><span class="eyebrow">${c.live ? '<span class="pdot red"></span>Live on Kick' : 'Kick creator'}</span><h1 style="margin-top:6px">${esc(c.name)}</h1></div></div>
        <div class="hero-meta">${chips([c.followers && { t: fmtViews(c.followers) + ' followers', cls: 'mono' }, c.live && { t: fmtViews(c.viewers) + ' watching', cls: 'mono' }, c.live && c.category])}</div>
        ${c.live && c.title ? `<p class="plot">${esc(c.title)}</p>` : c.bio ? `<p class="plot">${esc(c.bio)}</p>` : ''}
        <div class="bb-actions">
          ${c.live && c.playback ? `<button class="btn" data-act="kick-play-live" data-slug="${esc(slug)}">${ic('play', 'fill')} Watch live</button>` : ''}
          <button class="btn glassy" data-act="kick-save" data-slug="${esc(slug)}">${ic(isSaved ? 'check' : 'plus')} ${isSaved ? 'Saved' : 'Save creator'}</button>
        </div>
      </div>
    </section>
    <section class="dbody">
      <div class="sec-head"><h2>Past broadcasts</h2><span class="mono" style="font-size:12px;color:var(--muted)">${vids.length}</span></div>
      ${vids.length ? `<div class="epgrid">${vids.map((v, i) => `<button class="epcard" data-act="kick-play-vod" data-i="${i}">
        <div class="eimg">${v.thumb ? `<img loading="lazy" src="${esc(v.thumb)}" alt="">` : ''}${v.dur ? `<span class="edur">${fmtTime(v.dur)}</span>` : ''}<div class="play-hover"><span>${ic('play', 'fill')}</span></div></div>
        <h4>${esc(v.title)}</h4><p>${esc([v.category, v.start ? fmtDate(new Date(v.start.replace(' ', 'T'))) : '', v.views ? fmtViews(v.views) + ' views' : ''].filter(Boolean).join(' · '))}</p></button>`).join('')}</div>` : '<div class="center-state" style="height:auto;padding:40px">No past broadcasts available.</div>'}
    </section></div>`;
  S.kick = { c, vids };
}
