// The only bridge between the windows and the rest of the computer: a fixed list of calls.
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, x) => cb(x));

contextBridge.exposeInMainWorld('api', {
  sendState: (s) => ipcRenderer.send('proj:state', s),
  onState: on('proj:state'),
  showProjector: inv('proj:show'), projectorVisible: inv('proj:visible'),
  onProjectorVisible: on('proj:visible'),
  applyDisplay: inv('proj:applyDisplay'), listDisplays: inv('displays:list'),
  onDisplaysChanged: (cb) => ipcRenderer.on('displays:changed', () => cb()),
  mediaCmd: (c) => ipcRenderer.send('media:cmd', c),
  onMediaCmd: on('media:cmd'),
  mediaStatus: (s) => ipcRenderer.send('media:status', s),
  onMediaStatus: on('media:status'),
  loadSettings: inv('settings:load'), saveSettings: inv('settings:save'), loadBible: inv('bible:load'),
  // songs (database with merge support)
  loadSongs: inv('songs:loadAll'), songsApply: inv('songs:apply'), songsStartupReport: inv('songs:startupReport'),
  importSongs: inv('songs:import'), openSongFolder: inv('songs:openFolder'),
  songsStatus: inv('songs:status'), songsSetDeviceName: inv('songs:setDeviceName'),
  songsExport: inv('songs:export'), songsMergeFile: inv('songs:mergeFile'), songsPickSyncFolder: inv('songs:pickSyncFolder'),
  songsSyncNow: inv('songs:syncNow'), songsBackupNow: inv('songs:backupNow'), songsRestore: inv('songs:restore'), songsOpenBackups: inv('songs:openBackups'),
  onSongsChanged: on('songs:changed'),
  // media
  pickMedia: inv('media:pick'), addMediaFiles: inv('media:addFiles'), addMediaFolder: inv('media:addFolder'),
  scanDownloads: inv('media:scanDownloads'), mediaExists: inv('media:exists'), openMediaFolder: inv('media:openFolder'),
  ytdlpStatus: inv('ytdlp:status'), ytdlpInstall: inv('ytdlp:install'), ytdlpInfo: inv('ytdlp:info'),
  ytdlpDownload: inv('ytdlp:download'), ytdlpCancel: inv('ytdlp:cancel'),
  onYtdlpProgress: on('ytdlp:progress'),
  // updates
  updateCheck: inv('update:check'), updateDownload: inv('update:download'), updateInstall: inv('update:install'), updateOpenPage: inv('update:openPage'),
  onUpdateAvailable: on('update:available'), onUpdateProgress: on('update:progress'),
  about: inv('app:about'), makeShortcuts: inv('app:makeShortcuts'),
  setZoom: (f) => webFrame.setZoomFactor(f), getZoom: () => webFrame.getZoomFactor(),
  listsAll: inv('lists:all'), listSave: inv('lists:save'), listLoad: inv('lists:load'), listDelete: inv('lists:delete'),
  listExport: inv('lists:export'), listImport: inv('lists:import'),
});
