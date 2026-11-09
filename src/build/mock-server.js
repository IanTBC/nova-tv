// Mock Xtream Codes server for UI testing
const http = require('http'), fs = require('fs'), path = require('path');
const M = path.join(__dirname, 'media');
const cols = ['#FF7048', '#3FE0C5', '#5B7CFF', '#C77DFF', '#FFC266', '#FF6B7D'];
const names = ['Orbit Run', 'Neon Harbor', 'The Quiet Signal', 'Glass City', 'Last Light', 'Paper Moons', 'Ironwood', 'Blue Hour', 'Static Bloom', 'North of Nowhere', 'Velvet Engine', 'Saltwater', 'Echo Park', 'Halcyon', 'Low Tide', 'Copper Sky'];
const chNames = ['BBC One HD', 'CNN International', 'Al Jazeera English', 'beIN Sports 1', 'beIN Sports 2', 'MBC 1', 'MBC Drama', 'Sky News', 'Discovery HD', 'Nat Geo Wild', 'Cartoon Network', 'ESPN', 'Fox News', 'Euronews', 'TLC', 'HBO HD', 'CBC Egypt', 'ON Time Sports', 'Rotana Cinema', 'DMC'];
const svg = (t, c, w = 300, h = 450) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="#131729"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.3}" r="${w * 0.25}" fill="#fff" opacity=".15"/><text x="20" y="${h - 30}" font-family="sans-serif" font-weight="700" font-size="${w / 11}" fill="#fff">${t}</text></svg>`;
const B = 'http://127.0.0.1:8899';
const live = Array.from({ length: 60 }, (_, i) => ({ num: i + 1, name: chNames[i % 20] + (i >= 20 ? ' ' + (Math.floor(i / 20) + 1) : ''), stream_id: 100 + i, stream_icon: i % 5 === 3 ? '' : `${B}/logo/${i}.svg`, epg_channel_id: 'x', category_id: String(1 + (i % 4)), tv_archive: i % 3 === 0 ? 1 : 0, added: 0 }));
const vod = Array.from({ length: 140 }, (_, i) => ({ num: i + 1, name: names[i % 16] + (i >= 16 ? ` ${Math.floor(i / 16) + 1}` : '') + ` (${2015 + (i % 11)})`, stream_id: 500 + i, stream_icon: `${B}/poster/m${i}.svg`, rating: (5 + (i * 37) % 50 / 10).toFixed(1), added: String(1700000000 + i * 5000), category_id: String(10 + (i % 5)), container_extension: 'mp4' }));
const ser = Array.from({ length: 40 }, (_, i) => ({ series_id: 900 + i, name: names[(i + 5) % 16] + ' Chronicles', cover: `${B}/poster/s${i}.svg`, plot: 'A crew of misfits chases a signal from the edge of the solar system.', rating: '8.1', releaseDate: `${2012 + (i % 12)}-04-01`, last_modified: String(1700000000 + i * 9000), category_id: String(20 + (i % 3)) }));
const b = (s) => Buffer.from(s).toString('base64');
function api(q) {
  if (q.get('username') !== 'ian' || q.get('password') !== 'pass') return { user_info: { auth: 0 } };
  switch (q.get('action')) {
    case null: return { user_info: { auth: 1, status: 'Active', exp_date: String(Math.floor(Date.now() / 1000) + 86400 * 120), max_connections: '2', active_cons: '0', allowed_output_formats: ['m3u8', 'ts'] }, server_info: { timezone: 'Africa/Cairo' } };
    case 'get_live_categories': return ['News', 'Sports', 'Entertainment', 'Arabic'].map((n, i) => ({ category_id: String(i + 1), category_name: n }));
    case 'get_live_streams': return live;
    case 'get_vod_categories': return ['Action', 'Drama', 'Sci-Fi', 'Comedy', 'Arabic Movies'].map((n, i) => ({ category_id: String(10 + i), category_name: n }));
    case 'get_vod_streams': return vod;
    case 'get_series_categories': return ['Drama Series', 'Sci-Fi Series', 'Turkish Series'].map((n, i) => ({ category_id: String(20 + i), category_name: n }));
    case 'get_series': return ser;
    case 'get_vod_info': return { info: { plot: 'When a cargo pilot intercepts a broadcast from a ship lost forty years ago, she has to decide who to trust before the signal goes dark.', cast: 'Ana Reyes, Tom Hale, Mira Okafor', director: 'J. Lindqvist', genre: 'Sci-Fi, Thriller', releasedate: '2023-05-12', duration: '01:52:00', rating: '7.8', backdrop_path: [`${B}/backdrop.svg`], youtube_trailer: 'dQw4w9WgXcQ' }, movie_data: { stream_id: q.get('vod_id'), container_extension: 'mp4' } };
    case 'get_series_info': return { info: { plot: 'A crew of misfits chases a signal from the edge of the solar system.', cast: 'Cast A, Cast B', genre: 'Drama', releaseDate: '2021', rating: '8.4', backdrop_path: [`${B}/backdrop.svg`] }, episodes: { 1: [1, 2, 3, 4, 5].map((n) => ({ id: String(7000 + n), episode_num: n, title: `Episode ${n}: Signal ${n}`, container_extension: 'mp4', season: 1, info: { plot: 'Something strange happens on the station.', duration: '00:45:00' } })), 2: [1, 2, 3].map((n) => ({ id: String(7100 + n), episode_num: n, title: `Episode ${n}`, container_extension: 'mp4', season: 2, info: {} })) } };
    case 'get_short_epg': { const now = Math.floor(Date.now() / 1000), s = now - 1200; return { epg_listings: [0, 1, 2, 3].map((k) => ({ title: b(['Evening News', 'World Report', 'Match Highlights', 'Late Movie'][k]), description: b('Live coverage and analysis of the day\'s top stories.'), start_timestamp: String(s + k * 3600), stop_timestamp: String(s + (k + 1) * 3600) })) }; }
  }
  return [];
}
http.createServer((req, res) => {
  const u = new URL(req.url, B);
  const p = u.pathname;
  const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
  if (p === '/player_api.php') return send(200, 'application/json', JSON.stringify(api(u.searchParams)));
  if (p.startsWith('/poster/')) { const i = parseInt(p.slice(9)); return send(200, 'image/svg+xml', svg(p.includes('/s') ? names[(i + 5) % 16] : names[i % 16], cols[i % 6])); }
  if (p.startsWith('/logo/')) { const i = parseInt(p.slice(6)); return send(200, 'image/svg+xml', `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect rx="14" width="120" height="80" fill="${cols[i % 6]}"/><text x="60" y="50" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="26" fill="#fff">${chNames[i % 20].split(' ')[0].slice(0, 4).toUpperCase()}</text></svg>`); }
  if (p === '/backdrop.svg') return send(200, 'image/svg+xml', svg('', '#5B7CFF', 1280, 720));
  let file = null;
  if (/\/live\/.*\.ts$/.test(p)) file = 'live.ts';
  else if (/\/live\/.*\.m3u8$/.test(p)) file = 'hls/index.m3u8';
  else if (/\/live\/.*\/index\d+\.ts$/.test(p) || /^\/live\/[^/]+\/[^/]+\/index\d+\.ts$/.test(p)) file = 'hls/' + path.basename(p);
  else if (/\/(movie|series)\//.test(p)) file = 'movie.mp4';
  if (/\/live\/[^/]+\/[^/]+\/index\d+\.ts$/.test(p)) file = 'hls/' + path.basename(p);
  if (file) {
    const fp = path.join(M, file);
    const st = fs.statSync(fp);
    const type = file.endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : file.endsWith('mp4') ? 'video/mp4' : 'video/mp2t';
    const range = req.headers.range;
    if (range && type === 'video/mp4') {
      const [a, z] = range.replace('bytes=', '').split('-'); const s = +a, e = z ? +z : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 });
      return fs.createReadStream(fp, { start: s, end: e }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    return fs.createReadStream(fp).pipe(res);
  }
  send(404, 'text/plain', 'nf');
}).listen(8899, () => console.log('mock on 8899'));
