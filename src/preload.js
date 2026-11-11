const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (fn) => { const h = (_e, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

contextBridge.exposeInMainWorld('nova', {
  platform: process.platform,
  setUserAgent: (key) => ipcRenderer.invoke('set-ua', key),
  openExternalPlayer: (player, url) => ipcRenderer.invoke('open-external-player', player, url),
  openLink: (url) => ipcRenderer.invoke('open-link', url),
  versions: () => ipcRenderer.invoke('versions'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installShellUpdate: () => ipcRenderer.invoke('install-shell-update'),
  reloadUi: () => ipcRenderer.invoke('reload-ui'),
  onUiUpdate: on('ui-update'),
  onShellUpdate: on('shell-update'),
  kickStatus: () => ipcRenderer.invoke('kick-status'),
  kickLogin: () => ipcRenderer.invoke('kick-login'),
  kickLogout: () => ipcRenderer.invoke('kick-logout'),
  kickFetch: (url) => ipcRenderer.invoke('kick-fetch', url),
  // mini player
  miniOpen: (payload) => ipcRenderer.invoke('mini-open', payload),
  miniExpand: (data) => ipcRenderer.invoke('mini-expand', data),
  miniClose: () => ipcRenderer.invoke('mini-close'),
  miniReport: (data) => ipcRenderer.send('mini-report', data),
  onMiniReport: on('mini-report'),
  onMiniInit: on('mini-init'),
  onMiniExpand: on('mini-expand'),
  onMiniClosed: on('mini-closed'),
});
