"""Download the song lists of https://www.cantaricrestine.ro through its public JSON API
(documented at /documentatie-api.php) and, for songs whose `descriere` (lyrics) is empty,
the PowerPoint file, from which the slide text is extracted.

Everything is cached under tools/_work/cc/ so a re-run downloads only what is missing:
  tools/_work/cc/api/<cat>_p<page>.json      raw API pages
  tools/_work/cc/files/<cat>/<id>.<ppt|pptx>  downloaded PowerPoint files
  tools/_work/cc/site_songs.json              merged result used by apply_cantaricrestine.py

Usage:  python tools/cantaricrestine.py [cat ...]      (default: all categories below)
        python tools/cantaricrestine.py --offline     (only rebuild site_songs.json from the cache)
"""
import sys, os, json, time, random, re, struct, zipfile, io, html
import urllib.request, urllib.parse, urllib.error
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORK = os.path.join(ROOT, 'tools', '_work', 'cc')
API_DIR = os.path.join(WORK, 'api')
FILE_DIR = os.path.join(WORK, 'files')
OUT = os.path.join(WORK, 'site_songs.json')

BASE = 'https://www.cantaricrestine.ro/api.php'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/124.0.0.0 Safari/537.36')
LIMIT = 200
PAUSE = 0.8

CATEGORIES = {
    'cr': 'Cântările Evangheliei (Carte Roșie)',
    'cn': 'Cântările Evangheliei (Carte Neagră)',
    'ca': 'Cântările Evangheliei (Carte Albastră)',
    'cb': 'Cântecele Bucuriei',
    'ld': 'Laudele Domnului',
    'pdc': 'Pe drumul credinței',
    'cc': 'Carte de cântări',
    'ic2': 'Imnuri Creștine',
    'ic': 'Imnuri Creștine (AZSMR)',
    'ib': 'Imnurile Bucuriei',
    'ih': 'Imnurile Harului',
    'lpdag': 'Lăudați pe Domnul (Groza)',
    'lpd': 'Lăudați pe Domnul',
}

OFFLINE = False
NL, CR, VT = chr(10), chr(13), chr(11)


def http_get(url, tries=6, timeout=60):
    if OFFLINE:
        raise IOError('offline: ' + url)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*',
                                                       'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            time.sleep(PAUSE)
            return data
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (403, 404, 410):
                time.sleep(PAUSE)
                raise
        except Exception as e:  # timeouts, resets
            last = e
        wait = min(60, 3 * (i + 1))
        print(f'   retry {i + 1}/{tries} in {wait}s ({last})', flush=True)
        time.sleep(wait)
    raise IOError(f'failed: {url}: {last}')


def api_page(cat, page):
    os.makedirs(API_DIR, exist_ok=True)
    p = os.path.join(API_DIR, f'{cat}_p{page}.json')
    if os.path.exists(p):
        with open(p, encoding='utf8') as f:
            return json.load(f)
    q = urllib.parse.urlencode({'token': random.randint(10 ** 9, 10 ** 10 - 1), 'categorie': cat,
                                'limita': LIMIT, 'pagina': page})
    raw = http_get(f'{BASE}?{q}')
    data = json.loads(raw.decode('utf-8-sig'))
    with open(p, 'w', encoding='utf8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return data


def fetch_category(cat):
    first = api_page(cat, 1)
    pag = first.get('paginatie', {})
    pages = int(pag.get('total_pagini') or 1)
    total = int(pag.get('total_rezultate') or 0)
    songs = {}
    for page in range(1, pages + 1):
        d = first if page == 1 else api_page(cat, page)
        res = d.get('rezultate') or {}
        if isinstance(res, list):
            res = {str(x.get('id')): x for x in res}
        songs.update(res)
    print(f'{cat}: {len(songs)} songs (site says {total}, {pages} pages)', flush=True)
    return list(songs.values()), total


# ---------------------------------------------------------------- PowerPoint text extraction
def _cfb_streams(data):
    """Minimal OLE2 / Compound File reader: returns {stream name: bytes}."""
    if data[:8] != b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        raise ValueError('not an OLE file')
    ssz = 1 << struct.unpack_from('<H', data, 30)[0]
    mssz = 1 << struct.unpack_from('<H', data, 32)[0]
    n_fat, dir_start, _, mini_cut, minifat_start, n_minifat, difat_start, n_difat = \
        struct.unpack_from('<IIIIIIII', data, 44)
    n_fat = struct.unpack_from('<I', data, 44)[0]
    dir_start = struct.unpack_from('<I', data, 48)[0]
    mini_cut = struct.unpack_from('<I', data, 56)[0]
    minifat_start = struct.unpack_from('<I', data, 60)[0]
    difat_start = struct.unpack_from('<I', data, 68)[0]
    n_difat = struct.unpack_from('<I', data, 72)[0]

    def sector(i):
        o = (i + 1) * ssz
        return data[o:o + ssz]
    difat = list(struct.unpack_from('<109I', data, 76))
    s = difat_start
    for _ in range(n_difat):
        if s >= 0xFFFFFFFA: break
        blk = sector(s)
        vals = struct.unpack('<%dI' % (ssz // 4), blk)
        difat.extend(vals[:-1]); s = vals[-1]
    fat = []
    for fs in difat[:n_fat]:
        if fs >= 0xFFFFFFFA: continue
        fat.extend(struct.unpack('<%dI' % (ssz // 4), sector(fs)))

    def chain(start, table):
        out, seen = [], set()
        while start < 0xFFFFFFFA and start not in seen and start < len(table):
            seen.add(start); out.append(start); start = table[start]
        return out

    def read_chain(start):
        return b''.join(sector(i) for i in chain(start, fat))
    dirdata = read_chain(dir_start)
    entries = []
    for o in range(0, len(dirdata) - 127, 128):
        e = dirdata[o:o + 128]
        nl = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(0, nl - 2)].decode('utf-16le', 'replace')
        typ = e[66]
        start = struct.unpack_from('<I', e, 116)[0]
        size = struct.unpack_from('<I', e, 120)[0]
        entries.append((name, typ, start, size))
    root = entries[0]
    ministream = read_chain(root[2])
    minifat = []
    for i in chain(minifat_start, fat):
        minifat.extend(struct.unpack('<%dI' % (ssz // 4), sector(i)))
    out = {}
    for name, typ, start, size in entries[1:]:
        if typ != 2: continue
        if size < mini_cut:
            buf = b''.join(ministream[i * mssz:(i + 1) * mssz] for i in chain(start, minifat))
        else:
            buf = read_chain(start)
        out[name] = buf[:size]
    return out


def ppt_text(data):
    """Binary .ppt: walk the record tree of the 'PowerPoint Document' stream.
    Text is in TextCharsAtom (0x0FA0, UTF-16LE) / TextBytesAtom (0x0FA8, 8-bit) records, either in
    SlideListWithText (0x0FF0, instance 0 = slides; a SlidePersistAtom 0x03F3 starts each slide) for
    placeholder text, or inside the Slide containers (0x03EE) for ordinary text boxes.
    Master slides (0x03F8) and notes (0x03F0) are skipped."""
    st = _cfb_streams(data)
    doc = st.get('PowerPoint Document')
    if doc is None:
        raise ValueError('no PowerPoint Document stream')
    slwt, slides = [], []          # placeholder text per slide / text-box text per Slide container

    def walk(buf, off, end, ctx):
        while off + 8 <= end:
            verinst, rtype, rlen = struct.unpack_from('<HHI', buf, off)
            body = off + 8
            rlen = min(rlen, end - body)
            inst = verinst >> 4
            if verinst & 0x0F == 0x0F:                       # container
                if rtype in (0x03F8, 0x03F0, 0x0FD9, 0x0FC8):  # MainMaster, Notes, headers/footers, ...
                    pass
                elif rtype == 0x0FF0:                       # SlideListWithText
                    if inst == 0: walk(buf, body, body + rlen, 'slwt')
                elif rtype == 0x03EE:                       # Slide
                    slides.append([]); walk(buf, body, body + rlen, 'slide')
                else:
                    walk(buf, body, body + rlen, ctx)
            elif rtype == 0x03F3 and ctx == 'slwt':         # SlidePersistAtom
                slwt.append([])
            elif rtype in (0x0FA0, 0x0FA8) and ctx in ('slwt', 'slide'):
                t = buf[body:body + rlen].decode('utf-16le' if rtype == 0x0FA0 else 'cp1252', 'replace')
                tgt = slwt if ctx == 'slwt' else slides
                if not tgt: tgt.append([])
                tgt[-1].append(t)
            off = body + rlen
    walk(doc, 0, len(doc), None)

    def flat(lst):
        out = []
        for sl in lst:
            txt = NL.join(t.replace(CR, NL).replace(VT, NL) for t in sl).strip()
            out.append(txt)
        return out
    a, b = flat(slwt), flat(slides)
    if len(a) == len(b):
        out = [NL.join(x for x in (p, q) if x) for p, q in zip(a, b)]
    else:
        out = a if sum(map(len, a)) >= sum(map(len, b)) else b
    return [x for x in out if x.strip()]


def pptx_text(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = [n for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', n)]
    names.sort(key=lambda n: int(re.search(r'(\d+)', n.rsplit('/', 1)[1]).group(1)))
    ns = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    out = []
    for n in names:
        root = ET.fromstring(z.read(n))
        paras = []
        for p in root.iter(ns + 'p'):
            t = ''
            for el in p.iter():
                if el.tag == ns + 't': t += el.text or ''
                elif el.tag == ns + 'br': t += '\n'
            paras.append(t)
        txt = '\n'.join(paras).strip()
        if txt: out.append(txt)
    return out


def slides_from_file(data):
    if data[:4] == b'PK\x03\x04':
        return pptx_text(data)
    return ppt_text(data)


def download_file(cat, song):
    url = song.get('url_fisier') or ''
    if not url: return None
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() or '.ppt'
    if ext not in ('.ppt', '.pptx', '.pps', '.ppsx'):        # e.g. "index.php" listed as a song
        return None
    d = os.path.join(FILE_DIR, cat); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, f"{song['id']}{ext}")
    if not os.path.exists(p):
        parts = urllib.parse.urlsplit(url)
        safe = urllib.parse.urlunsplit((parts.scheme, parts.netloc, urllib.parse.quote(urllib.parse.unquote(parts.path)),
                                        parts.query, ''))
        try:
            data = http_get(safe, timeout=120)
        except Exception as e:
            print(f'   ! {cat} {song["denumire"]}: {e}', flush=True)
            with open(p + '.err', 'w', encoding='utf8') as f: f.write(str(e))
            return None
        with open(p, 'wb') as f: f.write(data)
    with open(p, 'rb') as f:
        return f.read()


def main(argv):
    global OFFLINE
    if '--offline' in argv:
        OFFLINE = True
        argv = [a for a in argv if a != '--offline']
    cats = argv or list(CATEGORIES)
    result = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf8') as f: result = json.load(f)
    for cat in cats:
        try:
            songs, total = fetch_category(cat)
        except Exception as e:
            print(f'{cat}: FAILED {e}'); continue
        out = []
        for s in songs:
            rec = {'id': s.get('id'), 'cat': cat, 'denumire': html.unescape(s.get('denumire') or '').strip(),
                   'text': (s.get('descriere') or '').replace('\r\n', '\n').replace('\r', '\n'),
                   'url': s.get('url') or '', 'file': s.get('url_fisier') or '', 'source': 'api'}
            if not rec['text'].strip():
                data = download_file(cat, s)
                if data:
                    try:
                        rec['slides'] = slides_from_file(data)
                        rec['source'] = 'ppt'
                    except Exception as e:
                        print(f'   ! cannot read {cat} {rec["denumire"]}: {e}')
                        rec['source'] = 'ppt-error'
                else:
                    rec['source'] = 'no-file'
            out.append(rec)
        empty = sum(1 for r in out if r['source'] != 'api')
        print(f'   {cat}: {empty} songs without text in the API ->'
              f' {sum(1 for r in out if r["source"] == "ppt")} read from PowerPoint', flush=True)
        result[cat] = {'name': CATEGORIES.get(cat, cat), 'total': total, 'songs': out}
        with open(OUT, 'w', encoding='utf8') as f:
            json.dump(result, f, ensure_ascii=False, indent=0)
    print('wrote', OUT)


if __name__ == '__main__':
    main(sys.argv[1:])
