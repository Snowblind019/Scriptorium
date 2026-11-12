#!/usr/bin/env bash
# Scriptorium installer for Linux (Fedora and others) – installs for the current user, no root needed.
#
#   Install or update (latest release from GitHub):
#     curl -fsSL https://raw.githubusercontent.com/Snowblind019/Scriptorium/main/install-linux.sh | bash
#   Install from a file you downloaded:
#     bash install-linux.sh ~/Downloads/Scriptorium-0.5.0-linux-x64.tar.gz
#   Remove (your songs, lists and settings in ~/.config/Scriptorium are kept):
#     bash install-linux.sh --uninstall
#
# The program goes to ~/.local/share/scriptorium, gets an app-menu entry and a "scriptorium" command,
# and later updates itself from inside the program (Settings › Updates & about).
set -euo pipefail

main() {
REPO="Snowblind019/Scriptorium"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
PREFIX="${SCRIPTORIUM_PREFIX:-$DATA/scriptorium}"
APP="$PREFIX/app"
BIN="$HOME/.local/bin"
DESKTOP="$DATA/applications/scriptorium.desktop"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP" "$APP.update-old" "$APP.update-new"
  rmdir "$PREFIX" 2>/dev/null || true
  rm -f "$DESKTOP" "$DATA/icons/hicolor/512x512/apps/scriptorium.png"
  [ -L "$BIN/scriptorium" ] && rm -f "$BIN/scriptorium"
  command -v update-desktop-database >/dev/null && update-desktop-database "$DATA/applications" 2>/dev/null || true
  say "Scriptorium was removed. Your songs and settings are still in ~/.config/Scriptorium."
  exit 0
fi

[ "$(id -u)" = "0" ] && die "Run this as your normal user, not with sudo (Scriptorium installs into your home folder)."
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "This computer ($(uname -m)) is not supported." ;;
esac
for t in tar sha256sum; do command -v "$t" >/dev/null || die "'$t' is missing (sudo dnf install $t)"; done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -n "${1:-}" ]; then
  # a file the user downloaded (checked against SHA256SUMS.txt if it is next to it)
  [ -f "$1" ] || die "File not found: $1"
  ARCHIVE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  SUMS="$(dirname "$ARCHIVE")/SHA256SUMS.txt"
  want=""
  [ -f "$SUMS" ] && want="$(awk -v f="$(basename "$ARCHIVE")" '$2==f || $2=="*"f {print $1}' "$SUMS")"
  if [ -n "$want" ]; then
    [ "$(sha256sum "$ARCHIVE" | cut -d' ' -f1)" = "$want" ] || die "The file is damaged (checksum does not match)."
    say "Checksum OK"
  else
    printf '\033[33mNot verified:\033[0m put SHA256SUMS.txt from the same release next to the file to check it.\n'
  fi
else
  command -v curl >/dev/null || die "'curl' is missing (sudo dnf install curl)"
  say "Looking for the latest Scriptorium release…"
  JSON="$(curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/releases/latest")" || die "Could not reach GitHub (no internet, or no release published yet)."
  url_of() { printf '%s' "$JSON" | grep -o "\"browser_download_url\": *\"[^\"]*$1\"" | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/'; }
  TAR_URL="$(url_of "-linux-$ARCH.tar.gz")"
  SUMS_URL="$(url_of "SHA256SUMS.txt")"
  [ -n "$TAR_URL" ] || die "The latest release has no Linux ($ARCH) download."
  [ -n "$SUMS_URL" ] || die "The latest release has no checksums – not installing an unverified download."
  case "$TAR_URL" in https://github.com/"$REPO"/releases/download/*) ;; *) die "Unexpected download address: $TAR_URL" ;; esac
  ARCHIVE="$WORK/$(basename "$TAR_URL")"
  say "Downloading $(basename "$TAR_URL")…"
  curl -fL --progress-bar -o "$ARCHIVE" "$TAR_URL"
  curl -fsSL -o "$WORK/SHA256SUMS.txt" "$SUMS_URL"
  want="$(awk -v f="$(basename "$ARCHIVE")" '$2==f || $2=="*"f {print $1}' "$WORK/SHA256SUMS.txt")"
  [ -n "$want" ] || die "No checksum for $(basename "$ARCHIVE") in the release."
  [ "$(sha256sum "$ARCHIVE" | cut -d' ' -f1)" = "$want" ] || die "The download is damaged (checksum does not match). Please try again."
  say "Checksum OK"
fi

say "Unpacking…"
mkdir -p "$WORK/x"
tar -xzf "$ARCHIVE" -C "$WORK/x" --no-same-owner
NEW="$(find "$WORK/x" -mindepth 1 -maxdepth 2 -type f -name scriptorium -perm -u+x -printf '%h\n' | head -n1)"
[ -n "$NEW" ] && [ -d "$NEW/resources/app" ] || die "That archive does not contain Scriptorium."

pkill -x scriptorium 2>/dev/null && { say "Closing the running Scriptorium…"; sleep 2; } || true
mkdir -p "$PREFIX"
rm -rf "$APP.update-old"
[ -d "$APP" ] && mv "$APP" "$APP.update-old"
mv "$NEW" "$APP"
rm -rf "$APP.update-old"
chmod 0755 "$APP/scriptorium" "$APP/chrome-sandbox" 2>/dev/null || true

# command + app-menu entry + icon
mkdir -p "$BIN" "$(dirname "$DESKTOP")" "$DATA/icons/hicolor/512x512/apps"
ln -sfn "$APP/scriptorium" "$BIN/scriptorium"
cp "$APP/resources/app/build/icon.png" "$DATA/icons/hicolor/512x512/apps/scriptorium.png"
EXEC="$(printf '%s' "$APP/scriptorium" | sed -e 's/\\/\\\\\\\\/g' -e 's/["`$]/\\\\&/g' -e 's/%/%%/g')"   # desktop-entry quoting
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Scriptorium
GenericName=Bible & song projection
Comment=Bible and song projection for church services
Exec="$EXEC" %U
Icon=scriptorium
Terminal=false
Categories=AudioVideo;
Keywords=church;bible;songs;projector;lyrics;
StartupWMClass=Scriptorium
EOF
command -v update-desktop-database >/dev/null && update-desktop-database "$(dirname "$DESKTOP")" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$DATA/icons/hicolor" 2>/dev/null || true

# libraries Electron needs (all present on a normal Fedora desktop)
missing="$(ldd "$APP/scriptorium" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')"
if [ -n "$missing" ]; then
  pkgs=""
  for l in $missing; do case "$l" in
    libnss3*|libnssutil3*|libsmime3*) pkgs="$pkgs nss" ;; libgtk-3*|libgdk-3*) pkgs="$pkgs gtk3" ;; libasound*) pkgs="$pkgs alsa-lib" ;;
    libgbm*) pkgs="$pkgs mesa-libgbm" ;; libXss*) pkgs="$pkgs libXScrnSaver" ;; libatk*|libatspi*) pkgs="$pkgs at-spi2-core" ;;
    libcups*) pkgs="$pkgs cups-libs" ;; libxkbcommon*) pkgs="$pkgs libxkbcommon" ;; libdrm*) pkgs="$pkgs libdrm" ;; *) pkgs="$pkgs $l" ;; esac; done
  printf '\033[33mSome system libraries are missing:\033[0m %s\nInstall them with:  sudo dnf install%s\n' "$missing" "$pkgs"
fi

VER="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$APP/resources/app/package.json" | head -n1)"
say "Scriptorium $VER is installed."
echo "  Start it from the app menu, or type:  scriptorium"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  (Log out and back in once so the 'scriptorium' command is found.)" ;; esac
echo "  It checks for updates when it starts. Remove it with:  bash install-linux.sh --uninstall"
}

main "$@"
