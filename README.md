# Scriptorium

Bible and song projection for church services, in Romanian and English.

- **Bible:** VDC 1924 (Cornilescu) and the Berean Standard Bible (BSB), shown alone or one above the other.
- **Songs:** 16 song books with 4,550 songs, including Cîntările Evangheliei, Laudele Domnului, Imnuri Creștine and Pe drumul credinței.
- **Media:** a media player and downloader.
- **Projector:** themes with animated backgrounds, gentle effects, and a 24-hour clock.

## Install (ready to use)

The installers are in the [`dist`](dist) folder. Download the one for your computer, or the whole repository as a ZIP (green **Code** button → **Download ZIP**).

| Computer | File | How |
|---|---|---|
| **Windows 10/11** | `dist/Scriptorium-Setup-<version>.exe` | Run it. It adds Scriptorium to the Start menu and the desktop. If Windows shows “unknown publisher”, click **More info → Run anyway**. |
| **Linux (64-bit)** | `dist/Scriptorium-<version>-linux-x64.tar.xz` | Extract it, start `Scriptorium/scriptorium`, then use **Settings → Shortcuts & about → Create Start menu and desktop shortcuts**. |
| **macOS** | – | Build it on a Mac (see below). |

Everything is included: Bibles, songs and themes. No internet is needed except for the optional YouTube downloader.

**Projector:** connect it with HDMI and set Windows to **Extend** (press Win+P). Scriptorium opens full-screen on that screen when you press **Show** or the **Projector** button.

## Run from the source code (developers)

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
cd app
npm install
npm start
```

Build the installers with `npm run dist:win`, `npm run dist:linux` (on Linux) or `npm run dist:mac` (on a Mac).

## Folders

- `app/` – the program: `control/` is the operator window, `projector/` the projector window, `shared/` the screen renderer, and `data/` the Bibles and songs.
- `tools/` – scripts that rebuilt the song books and Bibles from their sources.
- `data-export/` – reports on how the songs were merged and corrected, plus each song book as a CSV.
- `NOTES.md` – the full list of features and known limits.

Song texts come from Cîntările Evangheliei (Uniunea Bisericilor CEB din Moldova, non-commercial use), cantaricrestine.ro and the SoftProjector song books. Please don't use them commercially.
