# Scriptorium

Bible and song projection for church services, in Romanian and English.

- **Bible:** VDC 1924 (Cornilescu) and the Berean Standard Bible (BSB), shown alone or one above the other.
- **Songs:** 16 song books with 4,550 songs, including Cîntările Evangheliei, Laudele Domnului, Imnuri Creștine and Pe drumul credinței.
- **Media:** a media player and downloader.
- **Projector:** themes with animated backgrounds, gentle effects, and a clock (24-hour or 12-hour AM/PM).
- **Two computers:** songs added or changed at church and at home are merged, never overwritten.
- **Updates itself** from this GitHub repository.

## Install

Download from the **[latest release](https://github.com/Snowblind019/Scriptorium/releases/latest)**. Everything is included (Bibles, songs, themes); no internet is needed except for updates and the optional YouTube downloader.

### Windows 10/11
Download `Scriptorium-Setup-<version>.exe` and run it. It adds Scriptorium to the Start menu and the desktop.
If Windows shows “Windows protected your PC / unknown publisher”, click **More info → Run anyway** (the installer isn't signed with a paid certificate).

### macOS
Download the `.dmg` for your Mac – **`-mac-arm64.dmg`** for Apple Silicon (M1/M2/M3/M4), **`-mac-x64.dmg`** for older Intel Macs (Apple menu → About This Mac shows which). Open it and drag **Scriptorium** into **Applications**.

The first time, macOS blocks it because it isn't notarized by Apple:
1. Open Scriptorium once (it will be refused), then go to **System Settings → Privacy & Security**, scroll down and click **Open Anyway**.
2. Or, in Terminal: `xattr -dr com.apple.quarantine /Applications/Scriptorium.app`

After that it opens normally, and updates install without this step.

### Fedora (and other Linux)
In a terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Snowblind019/Scriptorium/main/install-linux.sh | bash
```

That installs it for your user (no `sudo`), checks the download's checksum, and adds it to the app menu and as the `scriptorium` command. Updates then install from inside the program without a password.
Remove it with `bash install-linux.sh --uninstall` (songs and settings in `~/.config/Scriptorium` are kept).

Prefer a system package? Download `Scriptorium-<version>-linux-x86_64.rpm` and run `sudo dnf install ./Scriptorium-<version>-linux-x86_64.rpm`. Updates then ask for your password.

**Projector:** connect it with HDMI and set the displays to *Extend* (Windows: Win+P; macOS: Displays → use as separate display; Fedora: Settings → Displays → Join). Scriptorium opens full-screen on that screen when you press **Show** or the **Projector** button.

## Updates
When Scriptorium starts it asks GitHub whether a newer version exists. If so it shows what's new and asks **Update now / Later / Skip this version**. On *Update now* it:
1. downloads the installer for this computer and checks its SHA-256 checksum (a damaged or altered download is refused);
2. backs up your songs;
3. installs the new version and restarts;
4. merges the songs that come with the new version into yours (see below) and tells you what changed.

Settings → **Updates & about** has *Check for updates now* and a switch to turn the automatic check off.

## Songs on two computers (church and home)
Every song has a permanent id and remembers its edits, and deleted songs leave a marker. So two copies can always be merged song by song:

| Situation | Result |
|---|---|
| A song added on either computer | kept |
| A song changed on one computer | the changed version is used everywhere |
| A song deleted on one computer, unchanged on the other | deleted everywhere |
| A song deleted on one computer but edited on the other | the edit is kept |
| **The same song changed on both** | the newer version is kept; the other is saved in the song book **“Conflicte la îmbinare / Merge conflicts”** so you can compare and delete the copy you don't need |

Ways to merge (Settings → **Song sync & backups**):
- **Automatic – a shared folder:** choose the same folder on both computers (OneDrive, Google Drive, Dropbox, Nextcloud, Syncthing, or a USB stick). Each computer writes its songs there and merges the other's when it starts, every few minutes, and when it closes.
- **By hand – a file:** *Save songs to a file…* on one computer, *Merge songs from a file…* on the other (and back).
- **With every update:** the songs shipped in a new version are merged in the same way (see *Making a release*).

A backup is made before every update and every merge (newest 30 kept); any of them can be restored from the same screen, and the restore reaches the other computer on the next sync.

## Making a release (maintainer)
1. *(Optional)* put a computer's songs into the shipped songs, so the update brings them everywhere:
   `node tools/bundle-songs.js "Songs Church 2026-11-12.scsongs"` (or a `…/Scriptorium/songs` folder).
2. Set the new version: `cd app && npm version 0.5.1 --no-git-tag-version`, and write `release-notes/v0.5.1.md` (shown in the update window).
3. `git commit -am "Scriptorium 0.5.1" && git tag v0.5.1 && git push origin main v0.5.1`
4. GitHub Actions (`.github/workflows/release.yml`) builds the Windows installer, the macOS DMGs/zips, the Fedora RPM and the Linux `.tar.gz` on real machines, adds `SHA256SUMS.txt`, and publishes the release. Every Scriptorium then offers the update.

The tag must match `app/package.json` (the workflow checks this).

## Run from source (developers)
Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
cd app
npm ci
npm start
npm test                 # song database / merge tests
npm run test:updater     # updater tests (inside Electron)
npm run dist:linux       # or dist:win / dist:mac – installers in ../dist
```

## Folders
- `app/` – the program: `main.js` (main process), `songdb.js` (song database + merge), `updater.js`, `control/` the operator window, `projector/` the projector window, `shared/` the screen renderer, `data/` the Bibles and songs, `test/` tests.
- `tools/` – scripts that rebuilt the song books and Bibles from their sources, and `bundle-songs.js` for releases.
- `data-export/` – reports on how the songs were merged and corrected, plus each song book as a CSV.
- `release-notes/` – the text shown in the update window for each version.
- `NOTES.md` – the full list of features and known limits.

Song texts come from Cîntările Evangheliei (Uniunea Bisericilor CEB din Moldova, non-commercial use), cantaricrestine.ro and the SoftProjector song books. Please don't use them commercially.
