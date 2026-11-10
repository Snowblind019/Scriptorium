"""Download (if needed) and convert VDC 1924 + BSB into app/data/bibles/*.json
Run from anywhere:  python tools/build_bibles.py
"""
import json, os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(ROOT, 'tools', '_work')
OUT = os.path.join(ROOT, 'app', 'data', 'bibles')
os.makedirs(WORK, exist_ok=True); os.makedirs(OUT, exist_ok=True)
SOURCES = {
    'vdc.json': 'https://api.getbible.net/v2/cornilescu.json',          # Cornilescu 1924 (Crosswire RomCor text)
    'bsb.json': 'https://bible.helloao.org/api/BSB/complete.json',      # Berean Standard Bible (public domain)
}
for name, url in SOURCES.items():
    p = os.path.join(WORK, name)
    if not os.path.exists(p):
        print('downloading', url)
        urllib.request.urlretrieve(url, p)

EN = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
def ws(t): return re.sub(r'\s+', ' ', t).strip()

d = json.load(open(os.path.join(WORK, 'vdc.json'), encoding='utf8'))
books = []
for b in d['books']:
    chs = []
    for c in b['chapters']:
        vs = {v['verse']: ws(v['text']) for v in c['verses']}
        chs.append([vs.get(i, '') for i in range(1, max(vs) + 1)])
    books.append({'name': b['name'], 'chapters': chs})
json.dump({'id': 'VDC', 'name': 'Biblia Cornilescu 1924 (VDC)', 'lang': 'ro', 'books': books}, open(os.path.join(OUT, 'vdc.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('VDC', sum(len(c) for b in books for c in b['chapters']))

d = json.load(open(os.path.join(WORK, 'bsb.json'), encoding='utf8'))
books = []
for i, b in enumerate(d['books']):
    chs = []
    for c in b['chapters']:
        vs = {}
        for it in c['chapter']['content']:
            if it['type'] != 'verse': continue
            parts = [x if isinstance(x, str) else x.get('text', '') for x in it['content'] if isinstance(x, str) or 'text' in x]
            vs[it['number']] = ws(' '.join(parts))
        chs.append([vs.get(k, '') for k in range(1, max(vs) + 1)])
    books.append({'name': EN[i], 'chapters': chs})
json.dump({'id': 'BSB', 'name': 'Berean Standard Bible (BSB)', 'lang': 'en', 'books': books}, open(os.path.join(OUT, 'bsb.json'), 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('BSB', sum(len(c) for b in books for c in b['chapters']))
