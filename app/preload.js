const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  sendState: (s) => ipcRenderer.send('proj:state', s),
  onState: (cb) => ipcRenderer.on('proj:state', (_e, s) => cb(s)),
  showProjector: inv('proj:show'), projectorVisible: inv('proj:visible'),
  onProjectorVisible: (cb) => ipcRenderer.on('proj:visible', (_e, v) => cb(v)),
  applyDisplay: inv('proj:applyDisplay'), listDisplays: inv('displays:list'),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays:changed', cb),
  mediaCmd: (c) => ipcRenderer.send('media:cmd', c),
  onMediaCmd: (cb) => ipcRenderer.on('media:cmd', (_e, c) => cb(c)),
  mediaStatus: (s) => ipcRenderer.send('media:status', s),
  onMediaStatus: (cb) => ipcRenderer.on('media:status', (_e, s) => cb(s)),
  loadSettings: inv('settings:load'), saveSettings: inv('settings:save'), loadBible: inv('bible:load'),
  loadSongs: inv('songs:loadAll'), saveSongBook: inv('songs:saveBook'), deleteSongBook: inv('songs:deleteBook'),
  importSongs: inv('songs:import'), openSongFolder: inv('songs:openFolder'),
  pickMedia: inv('media:pick'), addMediaFiles: inv('media:addFiles'), addMediaFolder: inv('media:addFolder'),
  scanDownloads: inv('media:scanDownloads'), mediaExists: inv('media:exists'), openMediaFolder: inv('media:openFolder'),
  ytdlpStatus: inv('ytdlp:status'), ytdlpInstall: inv('ytdlp:install'), ytdlpInfo: inv('ytdlp:info'),
  ytdlpDownload: inv('ytdlp:download'), ytdlpCancel: inv('ytdlp:cancel'),
  onYtdlpProgress: (cb) => ipcRenderer.on('ytdlp:progress', (_e, p) => cb(p)),
  about: inv('app:about'), makeShortcuts: inv('app:makeShortcuts'),
  listsAll: inv('lists:all'), listSave: inv('lists:save'), listLoad: inv('lists:load'), listDelete: inv('lists:delete'),
  listExport: inv('lists:export'), listImport: inv('lists:import'),
});
