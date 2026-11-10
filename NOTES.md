# Scriptorium – build notes

## How to install / start (no .bat or .sh needed)
- The old `Scriptorium.bat` and the portable folder are gone; use the installers below. Developers can still run `npm start` inside `app/`, and `app/selftest.js` is the automated test.
- **Windows:** run `dist\Scriptorium-Setup-<version>.exe`. It installs Scriptorium for your user and adds a **Start-menu entry and a desktop shortcut**. To pin it to the taskbar, right-click the Start-menu entry → Pin to taskbar.
- **Linux:** two options.
  - Extract `dist/Scriptorium-<version>-linux-x64.tar.xz` anywhere and start `Scriptorium/scriptorium` once. Then use **Settings → Shortcuts & about → Create Start menu and desktop shortcuts** to add it to the app menu.
  - Or, on a Linux PC, run `npm run dist:linux` in `app/` to get a proper AppImage + .deb. Those can't be made on this Windows PC, because Windows won't allow the symlinks they need.
- **macOS:** on a Mac, run `npm install` and then `npm run dist:mac` in `app/`. That makes a `.dmg`; drag Scriptorium into Applications. This can't be built on Windows, and the app isn't code-signed, so the first launch needs right-click → Open.
- The projector is **off at start**. **Show** turns it on, or use the "Projector off/on" button at the top.
- **HDMI:** the projector is just a second screen. On Windows press Win+P → **Extend**, and Scriptorium goes full-screen on that screen. Settings → Projector & screens lets you pick the screen.

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
- Song data is now version 4 (16 books, 4,550 songs). Books you haven't edited update on the next start.

## Not done / limits
- Not tested by hand: real projector hardware, the Windows file dialogs, an ffmpeg download (the code is written, but only the yt-dlp download was tested), MP3 conversion, and video downloads.
- macOS builds must be made on a Mac. On Linux, AppImage/.deb must be built on Linux; the tar.gz made here works but has to be started once to create its menu entry.
- Bible "smart" search is keyword + typo correction + a topic list, not a language model.
- The installer is not code-signed, so Windows SmartScreen may warn "unknown publisher" the first time (More info → Run anyway).
