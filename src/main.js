// Nova TV — Electron main process (app shell)
// The shell stays small and stable. Everything you see lives in the UI bundle,
// which updates itself from GitHub. Full app updates are handled too.
const { app, BrowserWindow, ipcMain, session, shell, Menu, net, screen } = require('electron');
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const SHELL_VERSION = '2.1.0';
const SHELL_API = 2; // bump only when preload/IPC contract changes
const UPDATE_BASE = 'https://raw.githubusercontent.com/IanTBC/nova-tv/main/update/';
const BUNDLED_UI = path.join(__dirname, 'app');

const UA_PRESETS = {
  default: null,
  vlc: 'VLC/3.0.20 LibVLC/3.0.20',
  smarters: 'IPTVSmartersPro',
  tivimate: 'TiviMate/4.7.0 (Android 11)',
};
let currentUA = null;
let mainWin = null;
let miniWin = null;
let pendingShell = null;

// Smoothness: GPU raster + zero-copy; Chromium follows the display refresh
// rate, so ProMotion MacBooks render at 120Hz.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-blink-features', 'AudioVideoTracks');

/* ------------------------------------------------------------------ */
/* Versions & UI location                                              */
/* ------------------------------------------------------------------ */
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};
const readJSON = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const uiRoot = () => path.join(app.getPath('userData'), 'ui');
const bundledUiVersion = () => readJSON(path.join(BUNDLED_UI, 'version.json'), { version: '0.0.0' }).version;

function activeUi() {
  const cur = readJSON(path.join(uiRoot(), 'current.json'));
  if (cur && cur.version && cmpVer(cur.version, bundledUiVersion()) > 0 && (cur.minShell || 0) <= SHELL_API) {
    const dir = path.join(uiRoot(), cur.version);
    if (fs.existsSync(path.join(dir, 'index.html'))) return { dir, version: cur.version };
  }
  return { dir: BUNDLED_UI, version: bundledUiVersion() };
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */
const webPrefs = () => ({
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  // IPTV panels don't send CORS headers, so the app reads them directly
  // (this is what every desktop IPTV player does).
  webSecurity: false,
  autoplayPolicy: 'no-user-gesture-required',
  backgroundThrottling: false,
});

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0A0D19', title: 'Nova TV',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 26 },
    webPreferences: webPrefs(),
  });
  mainWin.loadFile(path.join(activeUi().dir, 'index.html'));
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWin.on('closed', () => { mainWin = null; });
}

function openMini(payload) {
  if (miniWin && !miniWin.isDestroyed()) miniWin.close();
  const { workArea } = screen.getPrimaryDisplay();
  const w = 480, h = 270;
  miniWin = new BrowserWindow({
    width: w, height: h, x: workArea.x + workArea.width - w - 24, y: workArea.y + workArea.height - h - 24,
    minWidth: 320, minHeight: 180, frame: false, resizable: true, alwaysOnTop: true,
    fullscreenable: false, skipTaskbar: true, hasShadow: true, backgroundColor: '#000000',
    roundedCorners: true, title: 'Nova TV mini player', webPreferences: webPrefs(),
  });
  miniWin.setAspectRatio(16 / 9);
  miniWin.setAlwaysOnTop(true, 'floating');
  miniWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWin.loadFile(path.join(activeUi().dir, 'mini.html'));
  miniWin.webContents.once('did-finish-load', () => miniWin?.webContents.send('mini-init', payload));
  miniWin.on('closed', () => { miniWin = null; mainWin?.webContents.send('mini-closed'); });
}

/* ------------------------------------------------------------------ */
/* Updates                                                             */
/* ------------------------------------------------------------------ */
async function getBuf(url) {
  const r = await net.fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const safeRel = (p) => { const n = path.normalize(p); return !n.startsWith('..') && !path.isAbsolute(n) ? n : null; };

let checking = false;
async function checkForUpdates(manual = false) {
  if (checking) return { status: 'busy' };
  checking = true;
  try {
    const manifest = JSON.parse((await getBuf(UPDATE_BASE + 'manifest.json')).toString('utf8'));
    const result = { status: 'latest', ui: activeUi().version, shell: SHELL_VERSION };

    // Full app (shell) update available?
    const sh = manifest.shell;
    if (sh && cmpVer(sh.version, SHELL_VERSION) > 0 && sh.builds && sh.builds[process.arch]) {
      pendingShell = sh;
      mainWin?.webContents.send('shell-update', { version: sh.version, notes: sh.notes || '' });
      result.status = 'shell';
    }

    // UI update available?
    const ui = manifest.ui;
    if (ui && cmpVer(ui.version, activeUi().version) > 0 && (ui.minShell || 0) <= SHELL_API) {
      const buf = await getBuf(ui.url.startsWith('http') ? ui.url : UPDATE_BASE + ui.url);
      if (ui.sha256 && sha256(buf) !== ui.sha256) throw new Error('Update file was corrupted');
      const bundle = JSON.parse(buf.toString('utf8'));
      const dir = path.join(uiRoot(), ui.version);
      fs.mkdirSync(dir, { recursive: true });
      for (const [rel, b64] of Object.entries(bundle.files || {})) {
        const r = safeRel(rel);
        if (!r) continue;
        const out = path.join(dir, r);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      }
      fs.writeFileSync(path.join(uiRoot(), 'current.json'), JSON.stringify({ version: ui.version, minShell: ui.minShell || 0 }));
      // keep only the 2 newest UI versions
      try {
        const vers = fs.readdirSync(uiRoot()).filter((d) => /^\d+\.\d+\.\d+$/.test(d)).sort(cmpVer);
        vers.slice(0, -2).forEach((v) => fs.rmSync(path.join(uiRoot(), v), { recursive: true, force: true }));
      } catch {}
      mainWin?.webContents.send('ui-update', { version: ui.version, notes: ui.notes || '' });
      if (result.status === 'latest') result.status = 'ui';
      result.ui = ui.version;
    }
    return result;
  } catch (e) {
    return { status: 'error', error: String(e.message || e), manual };
  } finally {
    checking = false;
  }
}

async function installShellUpdate() {
  const sh = pendingShell;
  if (!sh) return { ok: false, error: 'No update pending' };
  const build = sh.builds[process.arch];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'novatv-'));
  const parts = [];
  for (const p of build.parts) parts.push(await getBuf(p.startsWith('http') ? p : UPDATE_BASE + p));
  const all = Buffer.concat(parts);
  if (build.sha256 && sha256(all) !== build.sha256) return { ok: false, error: 'Download was corrupted, try again' };
  const tgz = path.join(tmp, 'novatv.tar.gz');
  fs.writeFileSync(tgz, all);
  const appBundle = path.resolve(process.execPath, '../../..'); // …/Nova TV.app
  const script = path.join(tmp, 'install.sh');
  fs.writeFileSync(script, `#!/bin/bash
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
cd "${tmp}"
tar -xzf novatv.tar.gz
SRC=$(find "${tmp}" -maxdepth 3 -name "Nova TV.app" -type d | head -1)
[ -z "$SRC" ] && exit 1
ditto "$SRC" "${appBundle}"
xattr -cr "${appBundle}"
codesign --force --deep --sign - "${appBundle}" >/dev/null 2>&1
open "${appBundle}"
`);
  fs.chmodSync(script, 0o755);
  spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 200);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, cb) => {
    const h = details.requestHeaders;
    const url = details.url;
    // only touch stream / panel traffic, not metadata & update services
    if (/youtube(-nocookie)?\.com|ytimg\.com|googlevideo\.com|google\.com|gstatic\.com/.test(url)) {
      // YouTube embeds (trailers) require a web referrer
      h['Referer'] = 'https://iantbc.github.io/';
    } else if (!/strem\.io|metahub\.space|media-imdb\.com|media-amazon\.com|githubusercontent\.com|github\.com|kick\.com/.test(url)) {
      delete h['Origin'];
      delete h['Referer'];
      if (currentUA) h['User-Agent'] = currentUA;
    }
    cb({ requestHeaders: h });
  });

  ipcMain.handle('set-ua', (_e, key) => { currentUA = UA_PRESETS[key] ?? null; return true; });
  ipcMain.handle('open-external-player', (_e, player, url) => new Promise((resolve) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return resolve({ ok: false, error: 'Invalid link' });
    if (process.platform !== 'darwin') { shell.openExternal(url); return resolve({ ok: true }); }
    const appName = player === 'iina' ? 'IINA' : 'VLC';
    execFile('open', ['-a', appName, url], (err) => resolve(err ? { ok: false, error: `${appName} is not installed` } : { ok: true }));
  }));
  ipcMain.handle('open-link', (_e, url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); });
  ipcMain.handle('versions', () => ({ shell: SHELL_VERSION, api: SHELL_API, ui: activeUi().version, arch: process.arch }));
  ipcMain.handle('check-updates', () => checkForUpdates(true));
  ipcMain.handle('install-shell-update', () => installShellUpdate());
  ipcMain.handle('reload-ui', () => { mainWin?.loadFile(path.join(activeUi().dir, 'index.html')); return true; });

  // mini player
  ipcMain.handle('mini-open', (_e, payload) => { openMini(payload); return true; });
  ipcMain.handle('mini-expand', (_e, data) => {
    mainWin?.webContents.send('mini-expand', data);
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.show(); mainWin.focus(); }
    miniWin?.close();
    return true;
  });
  ipcMain.handle('mini-close', () => { miniWin?.close(); return true; });
  ipcMain.on('mini-report', (_e, data) => mainWin?.webContents.send('mini-report', data));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'toggleDevTools' }] },
    { role: 'windowMenu' },
  ]));

  createWindow();
  setTimeout(() => checkForUpdates(false), 4000);
  setInterval(() => checkForUpdates(false), 6 * 3600 * 1000);
  app.on('activate', () => { if (!mainWin) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
