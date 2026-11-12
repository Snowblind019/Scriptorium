# Scriptorium – build notes

## How to install / start
- Installers are published as **GitHub releases** (github.com/Snowblind019/Scriptorium/releases), built by `.github/workflows/release.yml` on real Windows, macOS and Linux machines. They are no longer kept in `dist/` in git.
- **Windows:** `Scriptorium-Setup-<version>.exe` (per-user install, Start menu + desktop shortcut).
- **macOS:** `Scriptorium-<version>-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg` (Intel). Ad-hoc signed, not notarized: the first launch needs System Settings → Privacy & Security → Open Anyway (or `xattr -dr com.apple.quarantine /Applications/Scriptorium.app`).
- **Fedora / Linux:** `curl -fsSL https://raw.githubusercontent.com/Snowblind019/Scriptorium/main/install-linux.sh | bash` (user install in `~/.local/share/scriptorium`, self-updating), or the `.rpm` with `sudo dnf install`.
- The projector is **off at start**. **Show** turns it on, or use the "Projector off/on" button at the top.
- **HDMI:** the projector is just a second screen set to *Extend*. Settings → Projector & screens lets you pick the screen.

## Session 3 (2026-11-10) – done
**Layout (Songs & Bible screens)**
- **Edit layout** button (or Ctrl+E): move panels by their title and resize them by their edges.
  - Add panels (+ Add panel) or remove them (✕).
  - Snap to a 24×24 grid.
  - **Premade zones**: Holyrics style, 3 columns, Bible desk, 2×2, Sidebar, Big center. You can also **make your own zones** from the current layout.
  - Save named layouts. Reset brings back the default.
- **Tabs and floating panels:** drop a panel on another panel's title to stack them as tabs. Drag a tab out to **detach** it as a floating panel; the ⧉ button detaches it or **pins** it back.
- Snapping can be turned off in Settings → Layout.
- **Program appearance:** six ready-made looks, plus **Custom colors** (9 colors you pick), accent color and text size.

**Bible**
- The **Books** panel is rebuilt:
  - Grouped by Law / History / Poetry / Prophets… with headers and separators.
  - Colored tiles show the abbreviation, the name and the number of chapters.
  - RO/EN names, and tiles or a compact list.
- **Type anywhere** on the Bible screen and it jumps into the locate box. Books filter as you type, typos are allowed, and `ioan 3 16` goes straight to the verse.
- **List vs Screen versions** are now separate. For example, read VDC + BSB in the list while only VDC is on the projector, or the other way round.
- **Favorites** panel: each favorite has a note field. Click goes to the verse, double-click shows it. It can stay open as its own panel; Ctrl+D adds the selection.
- **Bible history** shows only verses. It can show the reference + verse, the reference only, or the verse only. Double-click shows it on screen.
- **Bible search** (Ctrl+F):
  - It ignores diacritics and punctuation and treats â/î as the same letter.
  - It corrects spelling to the closest real word ("Showing results for…").
  - Part of a sentence is enough to find a verse.
  - **Topics:** typing e.g. "Duhul Sfînt", "mîntuire" or "holy spirit" also finds verses that use related names or words, such as Mîngîietorul or the Spirit of God. It uses a built-in concordance of 50 topics in `app/control/topics.js`, which you can extend. This is keyword/synonym matching, not AI, so a verse that only *implies* a topic without any related word won't be found.
- The service-list button on the Bible screen is removed.

**Songs**
- Panel renamed "Songs". Song history shows only songs.
- The show-first and next buttons are gone.
- **Search ignores** accents, â/î, caps, punctuation and hyphens: `mam` finds "m-am", `indreapta-mi` finds "Îndreaptă-mi". It **corrects misspellings** too (`doamen mare` → "doamne mare").
- **New songs are easy:** paste a whole song into Lyrics and it is formatted automatically.
  - Number + title, verses, refrains (R:, Refren, Cor, ChordPro) and repeated blocks are all detected.
  - A **key/chord** is detected from lines like "Tonalitate: Sol" or "Key: G", from chord lines ("G D Em C", "Do Sol La-") or from [G] brackets. It goes into the Key box, and chord lines are removed from the lyrics.
- **Bridge type removed.**
- **Different refrains:**
  - If a song has **one** chorus written once, it is repeated after every verse (optional; Settings → Songs).
  - If a song has **two or more different** choruses, they are labelled **R1, R2…** and shown exactly in the written order.
  - In the editor, `[R]` marks a chorus and `[R2]` marks a second, different one.
- **"1a / 1b" explained:** that was the old "split slides longer than 8 lines" option. It is not a bridge; it only cut long slides in two. It is now **off by default** and lives in Settings → Songs (shown as 3·1, 3·2 if you turn it on). Song 528 showed no change because none of its slides was longer than 8 lines. Repeat-chorus and split are now in Settings.
- **Import** button (renamed) reads SoftProjector .sps, OpenLP songs.sqlite, OpenLyrics/OpenSong XML, ChordPro, CSV, plain text and Scriptorium JSON. It can import into a new book or an existing one. Books can be exported as CSV or JSON.
- **Ctrl+Click** (configurable) on a song adds it to the service list. On media it adds the file to the playlist.

**Live / projector**
- **Show / Hide / Freeze** replace the old buttons.
  - Show puts the selection on screen; pressing it again does nothing.
  - Hide takes the text down; pressing it again does nothing.
  - Freeze keeps the projector as it is while you keep working.
- The Black and Clock buttons are removed from Live. They are still on keys B and C.
- Showing a song replaces a Bible verse and vice versa. After Hide the screen stays clear.
- **Overlays** like the clock (24 h only): **song key/chord** and **page 6/8** (also "6 / 8" or dots). Each has position, size, color and opacity.
- **End-of-song mark** on the last slide: **16 designs** (cross with flourish, diamond, star, wave, lozenges…). Length, height, thickness, spacing, colors, opacity, glow and an effect (draw-in, fade, breathe, shimmer) are all adjustable.
- The same designs can be used for the **separator between VDC and BSB**.
- **Effects** (subtle), each with its own duration and distance: text appearing, text taken down, next/back (direction-aware, songs and/or Bible), and switching between song and Bible. There's a preview with "Try" buttons.
- **13 new themes:** 9 **animated** (particles, bokeh, gradient flow, waves, network, light rays, rings, fine dust, glow grid) and 4 calm gradients.
  - Animated backgrounds are drawn live, not from video files, so **speed, density, size, opacity and colors** can be tuned.
  - Video backgrounds now also have speed and opacity settings.

**Media**
- One panel holds the **player + Library / Playlist / Download** tabs.
- Player buttons are SVG icons, not emoji.
- The library keeps everything you add, including downloads, which are re-added automatically. It shows **durations**, uses the same forgiving search, and can be **reordered by dragging**.
- New files go into the playlist by default. Double-click or Ctrl+Click in the library adds a file to the playlist; the playlist can be reordered too.
- **Download (yt-dlp):** paste a link and you get a default name in the form "Title - Singer".
  - Words like lyrics, karaoke, instrumental, fonografie, cuvinte, versuri, VEVO, official video, HD/4K and years are removed, along with the Russian words караоке, текст песни, минус, клип… The name stays editable.
  - Audio formats: MP3/M4A/OPUS/WAV/FLAC, with bitrate and Hz. Video formats: MP4/WebM/MKV, with resolution.
  - yt-dlp and ffmpeg are downloaded **on first use from their official GitHub releases** (one click each, after you confirm).
  - Tested here: yt-dlp installed, read a video's info, and downloaded an M4A.

**Settings**
- Settings is its own full screen, without the player, Live or History.
- Sections: General (incl. **EN / Romînă interface**, start on Songs or Bible, click-shows, Esc clears search), Projector & screens, Projector themes, Clock/key/page, End-of-song mark & separator, Effects, Songs, Bible, **Keyboard shortcuts** (every action can be rebound; Enter = Show, Ctrl+F = search, Ctrl+Tab/F2 = switch Songs↔Bible…), Layout, Program appearance, Media & downloads, Shortcuts & about.
- US spelling throughout. The Romanian interface uses î instead of â.

## Song data from cantaricrestine.ro
The full report is `data-export/cantaricrestine-report.html`; open it in a browser. It contains:
- Table 1, changed songs, each with a link to its "before" text.
- Table 2, songs not found on the site.
- Table 3, books merged or created and songs moved.
- Table 4, site songs that are not in our CE.
- "Matches to double-check".

The counts are in `cantaricrestine-summary.json`. Re-run everything with `python tools/build_songs.py`; it uses the cached site data in `tools/_work/cc`.

- Every song was searched by title and text; the numbers differ between editions. **477 songs got the site text:**
  - CE 436 (from cn 218, cr 215, ca 3)
  - Cor 18
  - Cîntările Harului 12
  - Laudele Domnului 6
  - Laudă și închinare 5
- 68 more had the same text and were skipped. **881 were not found** (CE 724, Altele 87, Închinare 27, Harul 24, Cor 19).
- **Laudele Domnului** matched the site's "ld" book, so it was merged: 13 → **491 songs**, with the site numbering.
- **New books:**
  - Imnuri Creștine (736)
  - Imnuri Creștine AZSMR (777)
  - Pe drumul credinței (456)
  - Lăudați pe Domnul (255)
  - Cîntecele Bucuriei (113)
  - Lăudați pe Domnul – Groza (10)
  - Imnurile Bucuriei (4)
  - Imnurile Harului (3, no match with our Cîntările Harului)
  - Carte de cîntări (1)
- **Altele 116 → 87:** 27 duplicates removed. 2 songs were moved to the CE supplement as no. 1217 and 1218, because they turned out to be CE songs (red edition) that our book didn't have. Confirmed on 2026-11-10: they stay in CE.
- **All songs: â → î**, no bridge sections, data version 3. Copies you haven't edited are updated automatically on the next start.
- In total: **16 books, 4,550 songs**.
- **Please double-check** (all listed in the report):
  - Some site versions are a different translation of the same hymn: CE 986, 870, 582, 1042, 673, 1111, 1146, 265, 280, 305, 437, 615, 1155, 1177, Cor 38, Închinare 35.
  - Replacing a text takes the site's set of stanzas, so 30 songs got shorter (e.g. CE 1 lost its 4th verse) and 20 got longer.
  - Many site texts don't mark refrains; they were detected where possible, but some refrains are still marked as verses.
  - Laude 113 now has the site title "Da eu! da eu! da eu! Doamne".
  - CE 62, 738, 930 and 1011 have no lyrics; they were already empty in the original APK (1011 = "O, cît-îi de greu").
  - Harfa Evangheliei still uses the CE text (it isn't on the site).

## Session 4 (2026-11-10) – titles, spelling, navigation
- **Wrong titles fixed.**
  - **CE 1011–1049** were shifted in the original Android app data: each title sat one number too early (the 1022 title belonged to 1023's lyrics). The SoftProjector "sion" book confirms the lyrics are at the right numbers, so each title was moved forward one place.
  - The app data lost 1011's lyrics. 1011 is "O, cît-îi de greu", and it is still without lyrics.
  - The fix is in `tools/common.py` (`fix_apk_title_shift`), so the whole pipeline uses it.
- **Titles taken from the lyrics** in 16 other songs whose title belonged to a different version of the text. Examples: CE 101 "O mîntuire perfectă", CE 581 "De ești trist și apăsat în suflet", CE 1177 "Cîntă corul îngeresc", Cîntecele Bucuriei 38 "Domnul e aici". Harfa follows CE.
  - Left as is on purpose: Altele 4 "Evanghelia" (a topic title).
- **Spelling and formatting**, done by the new last pipeline step `tools/fix_songs.py`:
  - Double spaces, spaces before punctuation, missing space after commas, doubled punctuation and ş/ţ → ș/ț fixed in 2,609 songs. 759 titles were tidied.
  - **386 missing diacritics** restored (si → și, in → în, esti → ești, pamint → pămînt…). "sa" only becomes "să" when it isn't the possessive ("slava Sa" stays); "ca" and short words are never guessed.
  - **97 typos** fixed (marer → mare, Dumnzeu → Dumnezeu, Domane → Doamne, Pntru → Pentru, larimi → lacrimi, dute → du-te…).
  - Checked against the Romanian Hunspell dictionary (LibreOffice, read with the `spylls` Python package) plus the VDC Bible.
  - **Left alone on purpose:** vocatives (Salvatorule), shortened poetic words (lumin', cerur', acas'), old plurals (suferinți, lacrime), names, and any word with two possible corrections.
  - Every change is listed in `data-export/song-fixes-report.html` and `song-fixes.csv`.
- **Arrows:**
  - **↑/↓** (and PageUp/PageDown/Space) change the slide or verse **on screen**.
  - **←/→ only move the selection**; the screen stays the same until **Enter / Show**. This applies to songs and the Bible, and the keys can be changed in Settings → Keyboard shortcuts.
- **Song title on the projector** is now an option in Settings → Songs, **off by default**.
- **Books panel:** the tiles **fill the panel** automatically ("Fit"). **−/+** in the books bar sets a fixed size.
- Settings: long checkbox labels no longer overlap.
- **Books panel (0.4.1):**
  - All tiles sit on one shared grid like Holyrics: same size, aligned in columns. A section that ends mid-row just leaves its gap.
  - "Fit" chooses the biggest tiles that still fit the panel, then makes the text and tiles taller to use the leftover height. −/+ set a fixed size.
- **(VDC) / (BSB) after the reference** can be turned off in Settings → Bible.
- 0.4.2: book sections always stay in Bible order. Revelation (and Poetry) no longer jump into an earlier gap.
- **0.4.3 – language switch fixed.** Picking Romînă in Settings used to reload the window before the choice was saved, so it came back in English, or on some PCs crashed. The language now switches in place: it's saved at once and the projector and the open song or verse aren't touched.
- **0.4.3 – saved and shared service lists** (Service list panel):
  - **Save / Save as…** keep the list inside the program; **Open ▾** lists saved lists (with delete); **New** starts an empty list.
  - The list name shows at the top, with • when there are unsaved changes.
  - **Export…** writes a `.sclist` file (default folder: Documents) to send to someone. **Import…** opens one and also keeps it under Open.
  - The file carries the full text of every song. If the other computer doesn't have a song (or has different numbering), it is found by title or shown from the file, marked "from file".
  - Bible passages in a list work everywhere. Media items only work if the same file exists on that computer.
  - Saved lists are in `%APPDATA%\Scriptorium\lists\`.
- **0.4.4 – laptop screens.**
  - The whole interface now scales to fit smaller screens: **Settings → Program appearance → Program size: Automatic** (default), or a fixed 70–140%. For example, a 1366×768 laptop at 125% Windows scaling gets 74%, and 1280×720 gets 86%.
  - The window can be as small as 760×480; it used to be at least 1100×680, which didn't fit small laptops.
  - Dialogs scroll instead of running off the screen.
  - Tested by screenshot at 1024×640, 1093×614, 1280×720, 1366×768, 1536×864 and 1920×1080: nothing overlaps, and all 66 books fit.
- **0.4.5 – books like Holyrics.** All 66 books sit next to each other in one grid, in Bible order, told apart by color. The boxes keep the same style and always fill the Books panel, so no row is cut off.
  - **Fit** picks the number of columns that gives the biggest boxes; **+** makes them bigger (fewer columns), **−** smaller.
  - On very small panels only the abbreviation is shown.
  - The ≡ button still switches to a compact list grouped by section.
- **0.4.5 – service list on laptops.** The list name has its own line and the buttons wrap onto two rows, so none are hidden. **Open ▾** opens inside the window.
- **0.4.4 – delete saved lists.** **Delete list** removes the saved copy of the open list, and each entry in **Open ▾** has its own **Delete** button.
- Song data is now version 4 (16 books, 4,550 songs). Books you haven't edited update on the next start.

## Session 5 (2026-11-12) – 0.5.0: updates, two-computer songs, all platforms
**Updates** (`app/updater.js`)
- 6 s after start Scriptorium asks the GitHub API for the latest release of Snowblind019/Scriptorium. A newer version shows a window with the release notes: *Update now / Later / Skip this version / Download page*. Settings → Updates & about: check now, automatic check on/off.
- The installer for this computer is downloaded into `<userData>/updates` and checked against GitHub's SHA-256 digest of the file and the release's `SHA256SUMS.txt` (both must agree; with neither it refuses). Only github.com / *.githubusercontent.com addresses are accepted, also after redirects. The window can't pass URLs – it can only say check/download/install.
- Installing: Windows runs the NSIS installer silently over the old one and restarts; macOS swaps the `.app` (with roll-back) and restarts; Linux user install (install-linux.sh / .tar.gz) swaps the folder and restarts; Linux RPM runs `pkexec dnf install` (password prompt) and restarts. Running from source only opens the download page.
- Tested here: a real update of an installed 0.5.0 to 0.5.1 on Fedora (folder install) – found, downloaded, verified, swapped, restarted as 0.5.1 with the songs intact. 11 updater tests (damaged file, checksum mismatch, no checksums, redirect to another host, oversize, file changed after the check…). The Windows and macOS install steps and the RPM step could not be run here.

**Songs on two computers** (`app/songdb.js`)
- Every song has a permanent id (`uid`), every edit a revision id (`rev`) and the song keeps the revs of its earlier versions (`hist`). Deletions leave tombstones (`songs/_sync.json`). Song files are now one song per line (readable git diffs), data version 5.
- Merge rules: added → kept; changed on one side → taken; deleted on one side → deleted, unless edited on the other (edit wins); changed on both → newer kept, the other copied into the book *Conflicte la îmbinare / Merge conflicts*. Revs (not content) decide, so changing something back or restoring a backup is still a new edit. Merges are idempotent and give the same result in either direction; conflict copies are identical on both computers (no duplicates).
- Where merges happen: (1) the songs shipped with a new version, once per version; (2) a **sync folder** (OneDrive/Google Drive/Dropbox/Nextcloud/Syncthing/USB) – each computer writes `Scriptorium-songs-<name>-<id>.scsongs` and merges the others' at start, every 3 minutes, 8 s after an edit and when closing; (3) **Save songs to a file / Merge songs from a file**.
- Backups (gzip'd) before every update and every merge that changes something, newest 30, with Restore (recorded as new edits so the other computers follow).
- The window saves through `songs:apply` (upserts/removals, not whole books), so a window that hasn't reloaded yet can't delete songs another computer added. If the window edits a version that a merge replaced meanwhile, both versions are kept.
- Songs from 0.4 are upgraded automatically: matched to the shipped songs (book + number + title, then title, then number) so both computers give them the same ids; local edits, additions, deletions, renamed books and deleted books (`.json.deleted`) are all carried over.
- `tools/bundle-songs.js` folds a computer's songs (a `.scsongs` file or a songs folder) into `app/data/songs` for the next release; conflict copies are left out. `npm run songs:stamp` (also before every build) gives new shipped songs their ids and records hand edits to the shipped files as new versions.
- Tests: `npm test` – 22 tests incl. two computers, conflicts, simultaneous conflicts, delete vs edit, deleted books, moved songs, updates, 0.4 upgrade, stale window, sync folder, restore, A→B→A, hostile files, changing back + old files, damaged files, copied data folders, read-only mode, and a random three-computer test (with stale files and back-and-forth edits; 40 seeds) that checks every computer ends up identical and no edit is lost.

**Clock:** 24-hour or 12-hour (AM/PM) for the operator clock and the projector clock – Settings › General or Clock, key & page (`ui.overlays.clock.format`).

**Platforms**
- Electron 38 → **45.3.1** (38 no longer gets security updates), electron-builder 26.
- Fedora/Wayland: programs can't place windows under Wayland, so the projector could open on the wrong screen; Scriptorium now runs through XWayland there (`SCRIPTORIUM_WAYLAND=1` keeps native Wayland). The Chromium sandbox stays on (user namespaces); it is only turned off if neither namespaces nor a setuid helper are available.
- Builds: Windows NSIS (x64), macOS DMG + zip (arm64 and x64, ad-hoc signed), Linux RPM + tar.gz (x64). The RPM uses `_build_id_links none` so it doesn't clash with other Electron RPMs. macOS gets a normal app menu (no Reload, so Cmd+R can't clear the screen mid-service).

**Security review – fixed**
- A file dropped on the window (or any link) could load a page that gets the program's full API → all navigation, new windows and webviews are blocked; IPC only answers the program's own pages; permissions limited to audio output / fullscreen / clipboard.
- Pasting `--exec …` as a "link" in the downloader passed it to yt-dlp as an option (runs a command) → only http(s) links, passed after `--`; format/quality/sample-rate checked against fixed lists; `--no-exec`; `%` in names escaped; only files inside the download folder are accepted as results.
- yt-dlp and ffmpeg downloads are now checked against their releases' SHA-256 lists; redirects to other hosts are refused.
- HTML injection: book ids, song numbers and theme ids were put into the page unescaped; image/video addresses in `url('…')` could break out → all escaped (also `'`). Song and list files from other computers are validated field by field (types, lengths, ids), unknown fields dropped.
- Service lists: size limit and only known item types. Media folder scan skips unreadable folders and stops at 5,000 files.
- Settings and lists are written atomically (no half-written file after a crash or power cut).
- A second copy of the program could start for a moment before quitting → exits immediately.
- Project files were world-writable (777 after the copy from Windows) → 644/755. Line endings normalised (`.gitattributes`).
- Installed program: Electron fuses turn off `NODE_OPTIONS` and `--inspect` (code injection into the installed app).
- Removed `build/package.js` (Windows-only portable builder) and its dependencies.
- **Independent review (second pass) – fixed:** a merge could leave two computers different for good after a song was changed back and an old file was merged (history is now checked before content; regression test added); the RPM update now copies the file into a root-only folder and checks its SHA-256 as root before installing (nothing can swap it while the password is typed); a damaged song-book file is restored from its `.bak` or set aside and reported (it used to vanish and its `.bak` could be overwritten); files are written with a random temporary name, created exclusively and flushed to disk; read-only mode is respected by sync, merge and edits; computers are told apart by the operating system's machine id (two PCs called "fedora", or a copied data folder, get their own ids); deleting a song that a sync had changed meanwhile keeps the newer version as a copy; one damaged service-list entry can no longer stop the program from starting, and each part of the window starts on its own; list files are checked item by item and media in them must be local files (a `file://server/…` link could leak Windows credentials); songs carried in a list file can't overwrite local songs; yt-dlp ignores outside config files; gzip size limits; macOS update script can't delete the working app; install script runs only once fully downloaded and escapes the menu entry.
- Known, not fixed (design): updates are as trustworthy as the GitHub account – anyone who can push a tag can publish an update (signing releases with an offline key would close this); the macOS ffmpeg download (evermeet.cx) has no checksum to check; the yt-dlp/FFmpeg checksums come from the same server as the files (they catch damage, not a hacked server); on Ubuntu 24.04+ the `.tar.gz` runs without the Chromium sandbox (AppArmor blocks user namespaces; the `.rpm`/Fedora are not affected).
- No malware indicators found: no hidden network calls, no eval/obfuscated code, no git hooks; the program has no runtime npm dependencies. (The third-party folders Holyrics/, SoftProjector/ and the APK are not part of Scriptorium and were not scanned – no virus scanner on this PC.)

## Not done / limits
- Not tested by hand: real projector hardware, the Windows/macOS file dialogs, MP3 conversion and video downloads.
- Tested on Fedora 44 only (headless and as an installed program). The Windows installer and the macOS DMG are built by GitHub Actions; their *update* steps (silent NSIS install, .app swap) and the RPM update (pkexec) could not be run here.
- macOS: not notarized (needs a paid Apple Developer ID), so the first launch needs *Open Anyway*. ffmpeg from evermeet.cx is an Intel build (runs through Rosetta on Apple Silicon); ffmpeg from Homebrew is used instead if installed.
- Windows: the installer isn't code-signed, so SmartScreen may warn "unknown publisher" the first time (More info → Run anyway).
- Bible "smart" search is keyword + typo correction + a topic list, not a language model.
- Song merging works per song: if the same song is changed on both computers, both versions are kept (one in the conflicts book) – it does not combine two edits of the same song line by line.
