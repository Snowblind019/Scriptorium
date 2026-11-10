"""Pack dist/linux-unpacked (built on Windows by electron-builder) into a Linux .tar.gz with the right
file permissions. On Linux, `npm run dist:linux` inside app/ builds a proper AppImage + .deb instead.
Usage: python tools/pack_linux.py
"""
import os, tarfile, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'linux-unpacked')
ver = json.load(open(os.path.join(ROOT, 'app', 'package.json'), encoding='utf8'))['version']
OUT = os.path.join(ROOT, 'dist', f'Scriptorium-{ver}-linux-x64.tar.gz')
EXEC = {'scriptorium', 'chrome_crashpad_handler', 'chrome-sandbox'}

def fix(ti):
    name = os.path.basename(ti.name)
    if ti.isdir(): ti.mode = 0o755
    elif name in EXEC or name.endswith('.so') or '.so.' in name: ti.mode = 0o755
    else: ti.mode = 0o644
    if name == 'chrome-sandbox': ti.mode = 0o4755
    ti.uid = ti.gid = 0; ti.uname = ti.gname = 'root'
    return ti

with tarfile.open(OUT, 'w:gz') as tar:
    tar.add(SRC, arcname='Scriptorium', filter=fix)
print('wrote', OUT, os.path.getsize(OUT) // 1048576, 'MB')
