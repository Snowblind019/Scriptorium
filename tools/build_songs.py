"""Build Scriptorium song databases from the APK + SoftProjector .sps files.
Output: app/data/songs/<id>.json, data-export/songs/<id>.csv, data-export/merge-report.csv
"""
import sys, os, json, csv, glob, re
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from difflib import SequenceMatcher

APP = os.path.join(ROOT, 'app', 'data', 'songs')
EXP = os.path.join(ROOT, 'data-export')
os.makedirs(APP, exist_ok=True); os.makedirs(os.path.join(EXP, 'songs'), exist_ok=True)

def prep(s):
    s['_fp'] = fingerprint(s); s['_fw'] = first_words(s, 8); s['_t'] = norm(s['title'])
    return s

def similar(a, b):
    if not a['_fp'] or not b['_fp']:
        return False, 0
    j = len(a['_fp'] & b['_fp']) / len(a['_fp'] | b['_fp'])
    fw = SequenceMatcher(None, a['_fw'], b['_fw']).ratio()
    tt = SequenceMatcher(None, a['_t'], b['_t']).ratio()
    ok = j > 0.45 or (fw > 0.8 and j > 0.25) or (tt > 0.85 and fw > 0.6 and j > 0.2)
    return ok, j + fw / 2

def best_match(s, pool):
    best, bsc = None, 0
    for p in pool:
        ok, sc = similar(s, p)
        if ok and sc > bsc: best, bsc = p, sc
    return best

def is_placeholder(s):
    return 'words of verse go here' in ' '.join(x['text'] for x in s['sections'])

report = []
apk = [prep(s) for s in load_apk()]
sps = {os.path.basename(f)[:-4]: load_sps(f) for f in glob.glob(ROOT + '/database/*.sps')}
for name, (book, songs) in sps.items():
    for s in songs: prep(s)

# ---------- Cîntările Evangheliei = APK + clone books -------------
ce = [dict(s, source='apk') for s in apk]
for s in apk:
    report.append(('Cîntările Evangheliei', s['number'], s['title'], 'apk', s['number'], 'kept'))

separate_books = ['harul', 'cor', 'altele', 'harfa', 'inchinare', 'laude']
other_pool = [s for b in ['harul', 'cor', 'altele'] for s in sps[b][1]]

next_no = max(s['number'] for s in ce) + 1
seceris_extra = []
for clone in ['sion', 'cint evan', 'seceris']:
    for s in sps[clone][1]:
        m = best_match(s, apk)
        if m:
            report.append(('Cîntările Evangheliei', m['number'], m['title'], clone, s['number'], f'duplicate of CE {m["number"]} - dropped'))
            continue
        if clone == 'seceris':
            seceris_extra.append(s); continue
        o = best_match(s, other_pool)
        if o:
            report.append(('-', '', s['title'], clone, s['number'], f'duplicate of a song in Harul/Cor/Altele ("{o["title"]}") - dropped'))
            continue
        m2 = best_match(s, [x for x in ce if x.get('source') != 'apk'])
        if m2:
            report.append(('Cîntările Evangheliei', m2['number'], m2['title'], clone, s['number'], 'duplicate of supplement song - dropped'))
            continue
        new = dict(s, number=next_no, source=f'{clone} #{s["number"]}',
                   info=f'Supliment (din „{sps[clone][0][0]}” nr. {s["number"]})')
        ce.append(new)
        report.append(('Cîntările Evangheliei', next_no, s['title'], clone, s['number'], 'not in APK - added as supplement'))
        next_no += 1

def out_song(s):
    sec = [{'type': x['type'], 'text': x['text']} for x in s['sections']]
    o = {'number': s['number'], 'title': s['title'].strip(), 'sections': sec}
    for k in ('key', 'tempo', 'info', 'words', 'music', 'notes'):
        if s.get(k): o[k] = s[k].strip() if isinstance(s[k], str) else s[k]
    return o

def dedupe_within(songs, bookname):
    kept = []
    for s in songs:
        if is_placeholder(s):
            report.append((bookname, s['number'], s['title'], bookname, s['number'], 'placeholder text only - kept title, empty lyrics'))
            s = dict(s, sections=[])
        m = best_match(s, kept) if s['sections'] else None
        if m:
            report.append((bookname, m['number'], m['title'], bookname, s['number'], 'duplicate inside same book - dropped'))
            continue
        kept.append(s)
    return kept

books = []
books.append({'id': 'cantarile-evangheliei', 'name': 'Cîntările Evangheliei', 'short': 'CE',
              'description': 'Cântările Evangheliei (Uniunea Bisericilor CEB din Moldova) – 1170 cântări din aplicația Android, plus suplimentul din „Cint Evan” (Hodoroaba) și „Sion” care nu există în carte.',
              'songs': [out_song(s) for s in ce]})

meta = {'harul': ('cantarile-harului', 'Cîntările Harului', 'Harul'),
        'cor': ('cor', 'Cor / Orchestră', 'Cor'),
        'altele': ('altele', 'Altele', 'Altele'),
        'harfa': ('harfa-evangheliei', 'Harfa Evangheliei', 'Harfa'),
        'inchinare': ('lauda-si-inchinare', 'Laudă și închinare', 'Închinare'),
        'laude': ('laudele-domnului', 'Laudele Domnului', 'Laude')}
for b in separate_books:
    bid, bname, short = meta[b]
    songs = sps[b][1]
    if b == 'altele':
        n = max(s['number'] for s in songs) + 1
        for s in seceris_extra:
            songs.append(dict(s, number=n, notes=(s.get('notes') or '') + ' (din Seceriș)'))
            report.append(('Altele', n, s['title'], 'seceris', s['number'], 'not in CE - moved to Altele'))
            n += 1
    kept = dedupe_within(songs, bname)
    for s in kept:
        report.append((bname, s['number'], s['title'], b, s['number'], 'kept'))
    books.append({'id': bid, 'name': bname, 'short': short, 'description': f'Importat din SoftProjector ({b}.sps: „{sps[b][0][0]}”)',
                  'songs': [out_song(s) for s in kept]})

# ---------- Harfa Evangheliei: harfa.sps has only a placeholder, so build it from the
# "H. Ev. N" cross-references printed in the Cîntările Evangheliei book (same hymn, CE text).
harfa = next(b for b in books if b['id'] == 'harfa-evangheliei')
hsongs, seen = [], {}
for s in apk:
    for m in re.finditer(r'(?<![A-Za-z.])H\.?\s?Ev\.?\s*(\d+)(?:\s*(?:și|/|,)\s*(\d+))?', s['info']):
        for n in [g for g in m.groups() if g]:
            n = int(n)
            if n in seen:
                report.append(('Harfa Evangheliei', n, s['title'], 'apk', s['number'], f'Harfa nr. already taken by CE {seen[n]} - skipped'))
                continue
            seen[n] = s['number']
            o = out_song(s); o['number'] = n
            o['info'] = f'Text din Cîntările Evangheliei nr. {s["number"]}' + (f' ({s["info"]})' if s['info'] else '')
            hsongs.append(o)
            report.append(('Harfa Evangheliei', n, s['title'], 'apk', s['number'], 'built from H. Ev. cross-reference'))
harfa['songs'] = hsongs
harfa['description'] = 'Construit din trimiterile „H. Ev.” din Cîntările Evangheliei (textul este cel din CE). harfa.sps conținea doar un titlu fără versuri.'

for bk in books:
    bk['dataVersion'] = 2
    bk['songs'].sort(key=lambda s: s['number'])
    with open(os.path.join(APP, bk['id'] + '.json'), 'w', encoding='utf8') as f:
        json.dump(bk, f, ensure_ascii=False, indent=0)
    with open(os.path.join(EXP, 'songs', bk['id'] + '.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['number', 'title', 'key', 'info', 'lyrics'])
        for s in bk['songs']:
            lyr = '\n\n'.join(('[Refren]\n' if x['type'] == 'chorus' else '') + x['text'] for x in s['sections'])
            w.writerow([s['number'], s['title'], s.get('key', ''), s.get('info', ''), lyr])
    print(bk['name'], len(bk['songs']))

with open(os.path.join(EXP, 'merge-report.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerow(['target book', 'target number', 'title', 'source file', 'source number', 'action'])
    w.writerows(report)
import collections
print(collections.Counter((r[3], r[5].split(' - ')[-1] if ' - ' in r[5] else r[5]) for r in report))

# ---------- cantaricrestine.ro: text corrections, merged and new books, â->î, dataVersion 3
# (tools/apply_cantaricrestine.py; it uses the downloads cached in tools/_work/cc/ by tools/cantaricrestine.py)
import apply_cantaricrestine
apply_cantaricrestine.main(fresh=True)

# ---------- final clean-up: titles that match the lyrics, formatting, diacritics, typos (dataVersion 4)
import fix_songs
fix_songs.main()
