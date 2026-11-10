// Developer self-test: SCRIPTORIUM_SELFTEST=<folder> [SCRIPTORIUM_TESTMEDIA=<folder with test-audio.mp3 / test-video.webm>]
// Drives the UI, saves screenshots + log.json, then quits. Uses its own userdata folder.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

module.exports = async function selftest(getWins, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const log = [];
  const shot = async (name) => {
    const { controlWin, projWin } = getWins();
    for (const w of [controlWin, projWin]) if (w) { w.webContents.setBackgroundThrottling(false); w.webContents.invalidate(); }
    await wait(450);
    if (controlWin) fs.writeFileSync(path.join(outDir, name + '-control.png'), (await controlWin.webContents.capturePage()).toPNG());
    if (projWin && projWin.isVisible()) fs.writeFileSync(path.join(outDir, name + '-projector.png'), (await projWin.webContents.capturePage()).toPNG());
  };
  const run = async (js) => {
    try { const r = await getWins().controlWin.webContents.executeJavaScript(js); log.push(['ok', js.slice(0, 100), r]); return r; }
    catch (e) { log.push(['ERR', js.slice(0, 100), String(e)]); }
  };
  getWins().controlWin.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') log.push(['console', e.level, e.message, e.lineNumber, e.sourceId]); });
  await wait(5000);
  if (process.env.SCRIPTORIUM_SIZES) {   // screenshots at laptop sizes: SCRIPTORIUM_SIZES=1280x720,1366x768
    const w = getWins().controlWin;
    await run(`(async()=>{ const x=Songs.find('cantarile-evangheliei',528); Songs.open(x); Songs.showSlide(1); App.setView('bible'); Bible.goto(42,3); Bible.sel={from:16,to:16}; Bible.project(); return 1 })()`);
    for (const sz of process.env.SCRIPTORIUM_SIZES.split(',')) {
      const [W, H] = sz.split('x').map(Number);
      for (let k = 0; k < 3 && (w.getContentSize()[0] !== W || w.getContentSize()[1] !== H); k++) { w.unmaximize(); await wait(300); w.setMinimumSize(700, 450); w.setContentSize(W, H); await wait(700); }
      await run(`[innerWidth, innerHeight, 'zoom', api.getZoom().toFixed(2), 'books overflow', document.querySelector('#bookGrid').scrollHeight > document.querySelector('#bookGrid').clientHeight + 1].join(' ')`);
      for (const v of ['songs', 'bible', 'settings']) {
        await run(`App.setView('${v}'); 1`);
        await wait(700);
        await shot(`size-${W}x${H}-${v}`);
      }
      await run(`(async()=>{ App.setView('songs'); Layout.show('service'); Service.addSong(Songs.find('cantarile-evangheliei',1)); Service.addSong(Songs.find('cantarile-evangheliei',3)); Service.meta().name='Program 2026-11-10'; await Service.save(false); await Service.toggleMenu(); return 1 })()`); await wait(500); await shot(`size-${W}x${H}-service`);
      await run(`document.querySelector('#svMenu').classList.add('hidden'); Layout.show('songList'); 1`);
      await run(`App.setView('songs'); Songs.edit(Songs.current); 1`); await wait(400); await shot(`size-${W}x${H}-editor`);
      await run(`Songs.closeEditor(); Layout.setEditing(true); 1`); await wait(400); await shot(`size-${W}x${H}-editlayout`);
      await run(`Layout.setEditing(false); 1`);
    }
    fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log, null, 1));
    return;
  }
  if (process.env.SCRIPTORIUM_LANGTEST) {   // switch the interface language the way a user does
    await run(`{ App.setView('settings'); Settings.show('general'); const s=document.querySelector('[data-b="app:lang"]'); s.value='ro'; s.dispatchEvent(new Event('change')); } App.setView('songs'); 'switched'`);
    await wait(5000);
    await run(`[I18N.lang, t('Show'), document.querySelector('#viewTabs button').textContent, App.settings.lang].join(' | ')`);
    await shot('lang-ro');
    await run(`{ App.setView('settings'); Settings.show('general'); const s=document.querySelector('[data-b="app:lang"]'); s.value='en'; s.dispatchEvent(new Event('change')); } 'back'`);
    await wait(5000);
    await run(`[I18N.lang, t('Show'), App.settings.lang].join(' | ')`);
    fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log, null, 1));
    return;
  }
  if (process.env.SCRIPTORIUM_YT) {   // downloader test only (needs internet)
    await run(`api.ytdlpInstall('ytdlp').then(p => p)`);
    await run(`api.ytdlpInfo(${JSON.stringify(process.env.SCRIPTORIUM_YT)}).then(i => JSON.stringify(i) + ' => ' + Downloader.cleanTitle(i))`);
    await run(`api.ytdlpDownload({url: ${JSON.stringify(process.env.SCRIPTORIUM_YT)}, name: 'yt test', kind: 'audio', format: 'm4a', quality: 'best', rate: ''}).then(f => JSON.stringify(f))`);
    fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log, null, 1));
    return;
  }
  await run(`api.projectorVisible()`);
  await shot('00-start');
  // songs
  await run(`document.querySelector('#songSearch').value='indreapta-mi'; Songs.search(); Songs.results.slice(0,3).map(x=>x.song.title).join(' | ')`);
  await run(`document.querySelector('#songSearch').value='doamen mare te slavim'; Songs.search(); document.querySelector('#songHint').textContent + ' :: ' + Songs.results.slice(0,2).map(x=>x.song.title).join(' | ')`);
  await run(`document.querySelector('#songSearch').value='mam'; Songs.search(); Songs.results.length`);
  await run(`document.querySelector('#songSearch').value='528'; Songs.search(); Songs.open(Songs.results[0]); Songs.slides.map(s=>s.label).join(',')`);
  await run(`Songs.showSlide(0); [App.outputOn, App.live.label].join(' | ')`);
  await wait(700);
  await run(`Songs.step(1); Songs.step(1); JSON.stringify(App.live.content.page)`);
  await run(`const n=Songs.slides.length; Songs.showSlide(n-1, 1); App.live.content.last`);
  await wait(900);
  await shot('01-songs');
  await run(`App.show(App.live.content, App.live.label, App.live.source); 'same show ignored'`);
  await run(`'footer when title off: [' + App.live.content.footer + ']'`);
  await run(`Songs.showSlide(0); const a=App.live.source.idx; Songs.selStep(1); Songs.selStep(1); const b=App.live.source.idx; const sel=Songs.selIdx; App.nav.songs.show(); [a,b,sel,App.live.source.idx].join(',') + ' (live,live after ←→,selected,live after Enter)'`);
  await run(`Songs.step(1); App.live.source.idx + ' after ↓'`);
  // paste formatter
  await run(`JSON.stringify(SongFormat.parse('12. Cît de mare ești Tu\\n\\nTonalitate: Sol\\n1. Cît de mare ești Tu, Doamne\\nCît de mic sînt eu\\n\\nR: Toate Te slăvesc\\nToate merg așa\\n\\n2. Lîngă Tine-i sărbătoare\\nNecuprinsul e al Tău\\n\\nR: Toate Te slăvesc\\nToate merg așa'))`);
  await run(`JSON.stringify(SongFormat.parse('Isus e Domn\\n\\nG    D    Em   C\\nIsus e Domn peste tot\\nEl e Rege\\n\\nDo  Sol  La-\\nAleluia aleluia'))`);
  // bible
  await run(`App.setView('bible'); const r=Bible.parse('ioan 3:16-17'); Bible.goto(r.book,r.chapter,r.from); Bible.sel={from:16,to:17}; Bible.project(); App.live.label`);
  await run(`[Bible.parse('Iuda 3'), Bible.parse('1 cor 13 4'), Bible.parse('judg 2'), Bible.parse('jn 1.1'), Bible.parse('Apoc 22 21'), Bible.parse('psalmi 23')].map(x=>x&&[x.book,x.chapter,x.from].join(':')).join(' ')`);
  await run(`Bible.toggleVer('screen','bsb'); App.live.content.blocks.length + ' block(s) on screen; list keeps BSB=' + App.settings.bible.list.bsb`);
  await run(`Bible.step(1); App.live.label`);
  await run(`App.settings.bible.screen.showTag=false; Bible.project(Bible.liveRef,{quiet:true}); const rt=App.live.content.blocks.map(b=>b.ref).join(' | '); App.settings.bible.screen.showTag=true; rt + ' (tags off)'`);
  await run(`const l=App.live.label; Bible.selStep(1); Bible.selStep(1); Bible.selStep(1); const l2=App.live.label; App.nav.bible.show(); [l,l2,App.live.label].join(' | ') + ' (before, after →→→, after Enter)'`);
  await run(`App.setView('bible'); Bible.sizeBooks(); getComputedStyle(document.querySelector('#bookGrid')).getPropertyValue('--cols') + ' columns; overflow=' + (document.querySelector('#bookGrid').scrollHeight > document.querySelector('#bookGrid').clientHeight + 1)`);
  await run(`document.querySelector('#bibleRef').value='geneza'; Bible.onLocate(); Bible.book`);
  await run(`Bible.goto(42,3); Bible.sel={from:16,to:16}; Bible.addFavorite(); App.settings.bible.favorites.length`);
  await run(`document.querySelector('#bibleSearch').value='duhul sfint'; Bible.search(); document.querySelector('#bsHint').textContent`);
  await run(`document.querySelector('#bibleSearch').value='pastorul meu nu voi duce lipsa'; Bible.search(); document.querySelector('#bsResults .item b').textContent`);
  await run(`document.querySelector('#bibleSearch').value='lumena lumi'; Bible.search(); document.querySelector('#bsHint').textContent`);
  await run(`Layout.show('bibleSearch'); App.history.bible.length + ' bible / ' + App.history.songs.length + ' songs in history'`);
  await wait(300); await run(`document.querySelector('#bibleRef').value=''; Bible.onLocate(); Bible.sizeBooks(); getComputedStyle(document.querySelector('#bookGrid')).getPropertyValue('--cols') + ' columns'`);
  await wait(800);
  await shot('02-bible');
  await run(`Layout.show('bibleHistory'); document.querySelectorAll('#bibleHistory .item').length`);
  await run(`App.toggleFreeze(); Bible.step(1); const f=App.shownState.content.blocks[0].ref; App.toggleFreeze(); f + ' -> ' + App.shownState.content.blocks[0].ref`);
  await run(`App.hide(); App.hide(); App.live.view`);
  // layout edit mode
  // service lists: save / new / open / share with a song the other computer doesn't have
  await run(`(async()=>{ App.settings.serviceList=[]; Service.addSong(Songs.find('cantarile-evangheliei',1)); Service.addSong(Songs.find('cor',2)); Service.meta().name='Test Sunday'; await Service.save(false); Service.newList(); const a=Service.list().length; const lists=await api.listsAll(); Service.load(await api.listLoad(lists[0].file)); return [a, lists.map(l=>l.name+':'+l.count).join(','), Service.list().length, Service.meta().name].join(' | '); })()`);
  await run(`(() => { const snap=Service.snapshot('Shared'); snap.items.push({type:'song', bookId:'not-here', bookName:'Other book', number:7, title:'Cîntare doar în fișier', song:{number:7,title:'Cîntare doar în fișier',sections:[{type:'verse',text:'Prima strofă\\na doua linie'}]}}); Service.load(snap); Service.open(Service.list()[2], true); return [document.querySelector('#serviceList').textContent.includes('from file'), App.live.content && App.live.content.text].join(' | '); })()`);
  await run(`(async()=>{ await Service.toggleMenu(); const btn=[...document.querySelectorAll('#svMenu button[data-x]')].map(b=>b.textContent); document.querySelector('#svMenu').classList.add('hidden'); const before=(await api.listsAll()).length; const l=await api.listsAll(); await api.listDelete(l[0].file); return [btn.join(','), before, (await api.listsAll()).length, document.querySelector('#svDelete').textContent].join(' | '); })()`);
  await run(`App.setView('bible'); Layout.setEditing(true); Layout.toggleFloat('bibleFavorites'); Layout.rects().bibleFavorites.float`);
  await wait(500);
  await shot('03-edit-layout');
  await run(`Layout.toggleFloat('bibleFavorites'); Layout.setEditing(false); 'ok'`);
  // media
  const tm = process.env.SCRIPTORIUM_TESTMEDIA;
  if (tm) {
    const items = ['test-audio.mp3', 'test-video.webm'].map(n => path.join(tm, n)).filter(p => fs.existsSync(p))
      .map(p => ({ name: path.basename(p), path: p, url: pathToFileURL(p).href, kind: p.endsWith('.mp3') ? 'audio' : 'video' }));
    await run(`App.setView('songs'); Player.addFiles(${JSON.stringify(items)}); [App.settings.mediaLibrary.length, Player.pl.length].join('/')`);
    await run(`Player.load(0, true); 1`);
    await wait(2000);
    await run(`JSON.stringify([Player.remote, Player.st.paused, Player.st.time.toFixed(1), Player.st.duration.toFixed(1)])`);
    await run(`Player.load(1, true); 1`);
    await wait(2500);
    await run(`JSON.stringify([Player.remote, Player.st.paused, Player.st.time.toFixed(1)])`);
    await run(`Player.stop(); document.querySelector('#mediaSearch').value='test audo'; Player.renderLibrary(); document.querySelectorAll('#mediaList .item').length`);
    await wait(1500);
    await run(`App.settings.mediaLibrary.map(x=>x.duration&&x.duration.toFixed(1)).join(',')`);
  }
  await run(`Downloader.cleanTitle({title:'Grupul Elim - Isus, Tu ești totul (Official Video) [Lyrics] 2023 HD', uploader:'Elim VEVO'})`);
  await run(`Downloader.cleanTitle({title:'Ce mare ești Tu - fonografie | cu versuri | karaoke', uploader:'Emanuel Choir'})`);
  await run(`Downloader.cleanTitle({title:'Ты Мой Бог (караоке, текст песни) - Хор', uploader:'Хор Церкви'})`);
  await run(`api.ytdlpStatus().then(s=>JSON.stringify(s))`);
  // settings screens
  for (const s of ['general', 'themes', 'overlays', 'marks', 'effects', 'keys', 'appearance', 'media', 'install', 'layout', 'bible', 'songs', 'projector']) {
    await run(`App.setView('settings'); Settings.show('${s}'); document.querySelectorAll('#setBody [data-b]').length`);
    if (['general', 'themes', 'marks', 'effects', 'keys', 'songs', 'media'].includes(s)) { await wait(500); await shot('04-settings-' + s); }
  }
  await run(`Settings.editId='p-bokeh'; Settings.show('themes'); App.setActiveTheme('p-bokeh'); App.setView('songs'); App.activeTheme().name`);
  await wait(900);
  await shot('05-songs-bokeh');
  await run(`App.settings.lang='ro'; I18N.lang='ro'; t('Show') + ' / ' + t('Songs')`);
  fs.writeFileSync(path.join(outDir, 'log.json'), JSON.stringify(log, null, 1));
};
