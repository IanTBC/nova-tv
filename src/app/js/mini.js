/* NOVA TV — floating mini player window */
'use strict';
(function () {
  hydrateIcons();
  const v = $('#v'), root = $('#root');
  let data = null, lastReport = 0, seeked = false;
  const eng = new Engine(v, (st) => {
    $('#load').classList.toggle('hidden', !(st === 'loading' || st === 'buffering'));
    if (st === 'error') $('#title').textContent = "Couldn't play — open the full player";
  });
  const report = (ended) => {
    if (!data || data.live || !v.duration || !isFinite(v.duration)) return;
    window.nova?.miniReport?.({ pos: v.currentTime, dur: v.duration, ended: !!ended });
  };
  v.addEventListener('loadedmetadata', () => { if (!seeked && data && !data.live && data.pos > 5) { v.currentTime = data.pos; seeked = true; } });
  v.addEventListener('timeupdate', () => {
    if (data && !data.live && v.duration) $('#fill').style.width = (v.currentTime / v.duration) * 100 + '%';
    if (Date.now() - lastReport > 5000) { lastReport = Date.now(); report(); }
  });
  v.addEventListener('ended', () => report(true));
  v.addEventListener('play', () => { root.classList.remove('paused'); setIcon($('#tIcon'), 'pause'); });
  v.addEventListener('pause', () => { root.classList.add('paused'); setIcon($('#tIcon'), 'play'); });
  $('#toggle').onclick = () => (v.paused ? v.play().catch(() => {}) : v.pause());
  $('#expand').onclick = () => { report(); const pos = v.currentTime; eng.stop(); window.nova?.miniExpand({ pos }); };
  $('#close').onclick = () => { report(); eng.stop(); window.nova?.miniClose(); };
  v.addEventListener('dblclick', () => $('#expand').click());
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); $('#toggle').click(); }
    if (e.key === 'Escape') $('#close').click();
  });
  window.nova?.onMiniInit?.((d) => {
    data = d;
    $('#title').textContent = d.title || '';
    $('#liveTag').classList.toggle('hidden', !d.live);
    $('#bar').classList.toggle('hidden', !!d.live);
    v.volume = d.volume ?? 1; v.muted = !!d.muted;
    eng.play(d.sources || []);
  });
})();
