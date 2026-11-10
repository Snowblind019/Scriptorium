"""Final clean-up of every song book (runs at the end of build_songs.py):
  1. formatting – double spaces, stray spaces before punctuation, missing space after commas,
     doubled punctuation, empty lines, cedilla ş/ţ → comma ș/ț, tidy titles
  2. titles that do not belong to their lyrics → title taken from the lyrics
  3. Harfa Evangheliei re-synced with the final (corrected) Cîntările Evangheliei texts
  4. missing diacritics restored (esti → ești, si → și, pamint → pămînt) when the choice is clear
  5. obvious typos fixed (marer → mare) when exactly one close, common word exists
Every change is listed in data-export/song-fixes-report.html (+ .csv). dataVersion → 4.
Reference vocabulary: VDC Bible + the songs themselves + tools/_work/ro_50k.txt (FrequencyWords, OpenSubtitles).
"""
import os, re, json, csv, glob, html, unicodedata, collections, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import norm

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, 'app', 'data', 'songs')
EXP = os.path.join(ROOT, 'data-export')
WORK = os.path.join(ROOT, 'tools', '_work')
DATA_VERSION = 4

# ------------------------------------------------------------------ helpers
LETTERS = 'a-zA-ZăâîșțşţĂÂÎȘȚŞŢáéíóúàèëïöüçñ'
WORD_RE = re.compile(r"[%s]+" % LETTERS)

def lo(s):   # lowercase, â→î, cedilla→comma
    return s.lower().replace('â', 'î').replace('ş', 'ș').replace('ţ', 'ț')

def plain(s):   # remove all diacritics (for "same word without accents")
    return ''.join(c for c in unicodedata.normalize('NFD', lo(s)) if unicodedata.category(c) != 'Mn')

def match_case(src, dst):
    if src.isupper() and len(src) > 1: return dst.upper()
    if src[:1].isupper(): return dst[:1].upper() + dst[1:]
    return dst

def dl1(a, b):   # Damerau-Levenshtein distance ≤ 1 ?
    if a == b: return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1: return False
    if la == lb:
        diff = [i for i in range(la) if a[i] != b[i]]
        if len(diff) == 1: return True
        return len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]]
    if la > lb: a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]: i += 1
    return a[i:] == b[i + 1:]

# ------------------------------------------------------------------ 1. formatting
def fmt_line(s):
    s = s.replace('ş', 'ș').replace('Ş', 'Ș').replace('ţ', 'ț').replace('Ţ', 'Ț')
    s = s.replace(' ', ' ').replace('\t', ' ')
    s = re.sub(r' {2,}', ' ', s).strip()
    s = re.sub(r'\s+([,;.!?])', r'\1', s)                    # "word ," → "word,"
    s = re.sub(r'\s+:(?![/)|])', ':', s)                     # "word :" → "word:" (not the ":/" repeat sign)
    s = re.sub(r'([,;])(?=[%s„])' % LETTERS, r'\1 ', s)     # "word,word" → "word, word"
    s = re.sub(r'(?<=[a-zăîșț])([.!?])(?=[A-ZĂÎȘȚ])', r'\1 ', s)   # "end.Next" → "end. Next"
    s = re.sub(r',{2,}', ',', s)
    s = re.sub(r'(?<![.])\.\.(?!\.)', '.', s)                # ".." → "." (keep "...")
    s = re.sub(r'([!?])\1+', r'\1', s)
    return s

def fmt_text(t):
    lines = [fmt_line(l) for l in t.replace('\r', '').split('\n')]
    return '\n'.join(l for l in lines if l)

def fmt_title(t):
    t = fmt_line(t)
    t = re.sub(r'^\d{1,4}\s*[.)]\s*', '', t)                 # leading number
    t = re.sub(r'[\s,;:.]+$', '', t)
    return t[:1].upper() + t[1:] if t else t

# ------------------------------------------------------------------ 2. titles
def title_score(title, song):
    tt = [w for w in norm(title).split() if len(w) > 1]
    body = ' ' + norm(' '.join(x['text'] for x in song.get('sections', []))) + ' '
    if not tt or not body.strip(): return None
    return sum(1 for w in tt if (' ' + w[:max(3, len(w) - 2)]) in body) / len(tt)

REPEAT = re.compile(r'^\s*(?:R\s*\d*\s*[:.)]|Ref(?:ren)?\s*[:.]|[/|(]{1,2}:?|//:|\|:)\s*')
def title_from_lyrics(song):
    secs = song.get('sections', [])
    if not secs: return None
    line = secs[0]['text'].split('\n')[0]
    line = REPEAT.sub('', line)
    line = re.sub(r':?\s*[/|)]{1,2}\s*$', '', line)
    line = re.sub(r'[„“”"«»]', '', line).strip(" '")
    words = line.split()
    # short first lines ("O,", "Zis-a Domnul:") – add the next line
    if len(words) < 3 and len(secs[0]['text'].split('\n')) > 1:
        line = (line + ' ' + REPEAT.sub('', secs[0]['text'].split('\n')[1])).strip()
    m = re.match(r'^(.+?)[,;:!?.]', line)
    cand = m.group(1) if m and len(m.group(1).split()) >= 2 else line
    words = cand.split()
    if len(words) > 7: cand = ' '.join(words[:7])
    return fmt_title(cand.strip(' „“"\'«»-–—'))

# ------------------------------------------------------------------ 4./5. vocabulary
def build_vocab(books):
    bible = collections.Counter()
    vdc = json.load(open(os.path.join(ROOT, 'app', 'data', 'bibles', 'vdc.json'), encoding='utf8'))
    for b in vdc['books']:
        for ch in b['chapters']:
            for v in ch: bible.update(lo(w) for w in WORD_RE.findall(v))
    songs = collections.Counter()
    for bk in books.values():
        for s in bk['songs']:
            for x in s.get('sections', []): songs.update(lo(w) for w in WORD_RE.findall(x['text']))
    subs = collections.Counter()
    p = os.path.join(WORK, 'ro_50k.txt')
    if os.path.exists(p):
        for line in open(p, encoding='utf8'):
            w, _, n = line.strip().partition(' ')
            if n.isdigit(): subs[lo(w)] += int(n)
    return bible, songs, subs

DIVINE = {'dumnezeu', 'domnul', 'doamne', 'domn', 'isus', 'isuse', 'hristos', 'cristos', 'mîntuitorul', 'mîntuitor',
          'duhul', 'tatăl', 'iehova', 'dumnezeule', 'dumnezeului', 'domnului', 'pentru', 'pămînt', 'cuvîntul'}
# plain words that are valid on their own but almost always lack their diacritics in song texts
FORCE_DIAC = {'si': 'și', 'in': 'în', 'iti': 'îți', 'ti': 'ți', 'ii': 'îi', 'esti': 'ești', 'tau': 'tău', 'sai': 'săi',
              'tie': 'ție', 'fa': 'fă', 'as': 'aș', 'ma': 'mă', 'tara': 'țara', 'isi': 'își',
              'sant': 'sînt', 'santem': 'sîntem', 'santeti': 'sînteți'}
DIAC_PAIRS = {frozenset(p) for p in [('a', 'ă'), ('a', 'î'), ('a', 'â'), ('ă', 'î'), ('i', 'î'), ('s', 'ș'), ('t', 'ț'), ('ă', 'â'), ('î', 'â')]}

def edit_op(w, x):
    '''classify a one-step difference: ('swap'|'sub'|'ins'|'del', position, chars)'''
    if len(w) == len(x):
        d = [i for i in range(len(w)) if w[i] != x[i]]
        if len(d) == 2: return ('swap', d[0], '')
        return ('sub', d[0], w[d[0]] + x[d[0]])
    if len(x) == len(w) + 1:   # a letter is missing in w
        i = next((k for k in range(len(w)) if w[k] != x[k]), len(w))
        return ('ins', i, x[i])
    i = next((k for k in range(len(x)) if w[k] != x[k]), len(x))
    return ('del', i, w[i])

def plausible_slip(w, x):
    if w == x or abs(len(w) - len(x)) > 1: return False
    if len(w) == len(x) and sum(1 for a, b in zip(w, x) if a != b) not in (1, 2): return False
    op, i, ch = edit_op(w, x)
    if op == 'swap': return True
    if op == 'sub':
        if ch[0] in 'ăâîșț' and ch[1] not in 'ăâîșț': return False   # would take a diacritic away
        return frozenset(ch) in DIAC_PAIRS or x in DIVINE
    if op == 'ins': return i <= len(w) - 2 and len(w) >= 4     # a letter missing inside the word (not at the end)
    if op == 'del':
        if w.endswith('ule'): return False                         # vocatives: Salvatorule, Păstorule
        return i < len(w) - 1 or ch not in 'aăâeiîoul'            # extra letter inside, or a stray final consonant (marer)
    return False
NOUN_BEFORE_SA = re.compile(r'(a|ea|ia|ua)$')   # "slava sa", "mila sa", "casa sa" → possessive, keep

def modern(w):   # î inside a word is written â in today's spelling (dictionary check only)
    return w if len(w) < 3 else w[0] + w[1:-1].replace('î', 'â') + w[-1]

class Speller:
    def __init__(self, bible, songs, subs):
        self.bible, self.songs, self.subs = bible, songs, subs
        from spylls.hunspell import Dictionary
        self.hun = Dictionary.from_files(os.path.join(WORK, 'ro_RO'))
        self.vcache = {}
        # well-written forms: Bible + songs that already have diacritics + common subtitle words
        self.good = collections.Counter()
        for w, n in bible.items(): self.good[w] += n * 50
        for w, n in songs.items():
            if n >= 3: self.good[w] += n * 20
        for w, n in subs.items():
            if n >= 200: self.good[w] += n // 50 + 1
        self.by_plain = collections.defaultdict(list)
        for w, n in self.good.items(): self.by_plain[plain(w)].append((n, w))
        for v in self.by_plain.values(): v.sort(reverse=True)
        self.trunc = set()
        for w, n in self.good.items():
            if n >= 100 and len(w) >= 4:
                self.trunc.add(plain(w[:-1])); self.trunc.add(plain(w[:-2]))
        self.by_len = collections.defaultdict(list)
        for w, n in self.good.items():
            if n >= 400 and len(w) >= 3: self.by_len[len(w)].append((n, w))
        self.cache = {}

    def valid(self, w):
        if w in self.vcache: return self.vcache[w]
        r = any(self.hun.lookup(x) for x in {w, modern(w), w.replace('î', 'â')}) or w in ('sînt', 'sîntem', 'sînteți')
        self.vcache[w] = r
        return r

    def known(self, w):
        return self.valid(w) or self.bible.get(w, 0) > 0

    def fix(self, word, prev='', line_start=False):
        """return (new_word, kind) or None"""
        w = lo(word)
        if w == 'sa':   # să (particle) vs sa (possessive): keep after a feminine noun, or "Sa" mid-line
            if NOUN_BEFORE_SA.search(lo(prev)) or (word == 'Sa' and not line_start): return None
            return match_case(word, 'să'), 'diacritics'
        if w in ('ca', 'rau', 'la', 'ta', 'fi'): return None
        if w in FORCE_DIAC: return match_case(word, FORCE_DIAC[w]), 'diacritics'
        if word[:1].isupper() and not line_start and not self.valid(w) and w not in DIVINE:
            # probably a name (Iudea, Ghelboa, Adonai…) – only fix a diacritics-only slip of a real word
            r = self._diac_only(w)
            return (match_case(word, r), 'diacritics') if r else None
        if w in self.cache: r = self.cache[w]
        else: r = self.cache[w] = self._fix(w)
        if not r: return None
        return match_case(word, r[0]), r[1]

    def _diac_only(self, w):
        if len(w) < 4: return None
        keep = [(i, c) for i, c in enumerate(w) if c in 'ăâîșț']   # never take away a diacritic already there
        cands = [(n, x) for n, x in self.by_plain.get(plain(w), [])
                 if x != w and len(x) == len(w) and self.valid(x) and all(x[i] == c for i, c in keep)]
        if not cands: return None
        if len(cands) > 1 and cands[0][0] < 4 * cands[1][0]: return None
        return cands[0][1]

    def _fix(self, w):
        if len(w) < 2 or self.known(w): return None
        # a) the same word with the right diacritics (pamint → pămînt, mantuit → mîntuit)
        r = self._diac_only(w)
        if r: return (r, 'diacritics')
        if len(w) < 4 or plain(w) in self.trunc or w.endswith('inți'): return None   # old plurals: suferinți, credinți
        # b) one typing slip (letter missing, extra, wrong or swapped) that gives a real, common word
        hits = []
        for L in (len(w) - 1, len(w), len(w) + 1):
            for n, x in self.by_len.get(L, ()):
                if x[0] == w[0] and dl1(w, x) and (self.valid(x) or x in DIVINE): hits.append((n, x))
        if not hits: return None
        hits.sort(reverse=True)
        # several real words one letter away (putera → puterea / putea) → don't guess
        if len(hits) > 1 and hits[0][0] < 6 * hits[1][0]: return None
        return (hits[0][1], 'typo') if plausible_slip(w, hits[0][1]) else None

# words never changed automatically (names, poetic/archaic forms that look like slips)
KEEP = set('''isuse cristoase doamne aleluia osana amin osanale iehova emanuel sion iordan sionul
mieluț mîntuitorule sfinte tată tătuță oi turma cin cinta nu-i serv servi lacrime imne nime atuncia atuncea
ranele rane desf desp acas degrab amiaz laolalt înseamn revi credeu dang ding dong veșnicile sfîntăm ciune grijei'''.split())

def hyphen_pronouns(line, sp, log):
    """"UndeL" → "Unde-L", "săI" → "să-I" (hyphen lost before the pronoun)"""
    def h(m):
        base, p = m.group(1), m.group(2)
        if p == 'I' and lo(base + 'l') in DIVINE:   # "DomnuI" – a capital I typed instead of l
            log.append(('typo', base + p, base + 'l', line)); return base + 'l'
        if sp.valid(lo(base)) or lo(base) in ('să', 'ce', 'nu', 'și', 'cum'):
            log.append(('hyphen', base + p, base + '-' + p, line)); return base + '-' + p
        return m.group(0)
    return re.sub(r'\b([%s]*[a-zăîșț])([LI])\b' % LETTERS, h, line)

def fix_text(text, sp, log):
    out_lines = []
    for line in text.split('\n'):
        line = hyphen_pronouns(line, sp, log)
        def rep(m):
            word = m.group(0)
            a, b = m.start(), m.end()
            # leave pieces of hyphenated / elided words alone (ne-nchinăm, s-omplinesc, Ți-aducem)
            if (a > 0 and line[a - 1] in "-‐'’`") or (b < len(line) and line[b] in "-‐'’`"): return word
            if lo(word) in KEEP: return word
            before = line[:a]
            if re.search(r"[–—-]\s*[%s]{1,2}\s*$" % LETTERS, before): return word
            pm = re.search(r"([%s]+)[^%s]*$" % (LETTERS, LETTERS), before)
            r = sp.fix(word, pm.group(1) if pm else '', not re.search('[%s]' % LETTERS, before))
            if not r or r[0] == word: return word
            log.append((r[1], word, r[0], line))
            return r[0]
        out_lines.append(WORD_RE.sub(rep, line))
    return '\n'.join(out_lines)

# ------------------------------------------------------------------ main
def main():
    books = {}
    for f in sorted(glob.glob(os.path.join(SONGS, '*.json'))):
        b = json.load(open(f, encoding='utf8')); books[b['id']] = b
    changes = []   # (book, number, title, kind, before, after)
    # 1. formatting
    fmt_count = collections.Counter()
    for b in books.values():
        for s in b['songs']:
            t0 = s['title']; s['title'] = fmt_title(t0)
            if s['title'] != t0: changes.append((b['name'], s['number'], s['title'], 'title format', t0, s['title']))
            for x in s.get('sections', []):
                t = fmt_text(x['text'])
                if t != x['text']: fmt_count[(b['id'], s['number'])] += 1; x['text'] = t
                if x['type'] not in ('verse', 'chorus'): x['type'] = 'verse'
            s['sections'] = [x for x in s.get('sections', []) if x['text']]
    # 2. titles that don't belong to the lyrics
    unsure = []
    for b in books.values():
        if b['id'] == 'harfa-evangheliei': continue   # takes its titles from CE (step 3)
        for s in b['songs']:
            sc = title_score(s['title'], s)
            if sc is None or sc >= 0.6: continue
            new = title_from_lyrics(s)
            if not new or norm(new) == norm(s['title']): continue
            if len(norm(s['title']).split()) < 2:
                unsure.append((b['name'], s['number'], s['title'], new)); continue
            changes.append((b['name'], s['number'], new, 'title', s['title'], new))
            s['title'] = new
    # 3. Harfa ← final CE texts
    ce = {s['number']: s for s in books['cantarile-evangheliei']['songs']}
    if 'harfa-evangheliei' in books:
        for s in books['harfa-evangheliei']['songs']:
            m = re.search(r'Cîntările Evangheliei nr\. (\d+)', s.get('info', ''))
            src = ce.get(int(m.group(1))) if m else None
            if not src or not src.get('sections'): continue
            if [x['text'] for x in src['sections']] != [x['text'] for x in s['sections']] or src['title'] != s['title']:
                if src['title'] != s['title']: changes.append(('Harfa Evangheliei', s['number'], src['title'], 'title (from CE)', s['title'], src['title']))
                s['title'] = src['title']; s['sections'] = json.loads(json.dumps(src['sections']))
                if src.get('key'): s['key'] = src['key']
    # 4./5. spelling
    sp = Speller(*build_vocab(books))
    words = collections.Counter()
    for b in books.values():
        if b['id'] == 'harfa-evangheliei': continue   # gets its text from CE below
        for s in b['songs']:
            log = []
            for x in s.get('sections', []): x['text'] = fix_text(x['text'], sp, log)
            tl = []; s['title'] = fix_text(s['title'], sp, tl)
            for kind, a, c, line in log + tl:
                changes.append((b['name'], s['number'], s['title'], kind, a, c)); words[(kind, a, c)] += 1
    if 'harfa-evangheliei' in books:   # re-sync Harfa after the CE spelling fixes
        for s in books['harfa-evangheliei']['songs']:
            m = re.search(r'Cîntările Evangheliei nr\. (\d+)', s.get('info', ''))
            src = ce.get(int(m.group(1))) if m else None
            if src and src.get('sections'): s['title'] = src['title']; s['sections'] = json.loads(json.dumps(src['sections']))
    # write books + CSV
    for b in books.values():
        b['dataVersion'] = DATA_VERSION
        with open(os.path.join(SONGS, b['id'] + '.json'), 'w', encoding='utf8') as f: json.dump(b, f, ensure_ascii=False, indent=0)
        with open(os.path.join(EXP, 'songs', b['id'] + '.csv'), 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f); w.writerow(['number', 'title', 'key', 'info', 'lyrics'])
            for s in b['songs']:
                w.writerow([s['number'], s['title'], s.get('key', ''), s.get('info', ''), '\n\n'.join(('[Refren]\n' if x['type'] == 'chorus' else '') + x['text'] for x in s.get('sections', []))])
    write_report(changes, fmt_count, unsure, words)
    kinds = collections.Counter(c[3] for c in changes)
    print('formatting fixed in', len(fmt_count), 'songs;', dict(kinds), '; single-word titles left for review:', len(unsure))
    return changes

def write_report(changes, fmt_count, unsure, words):
    with open(os.path.join(EXP, 'song-fixes.csv'), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(['book', 'number', 'title', 'change', 'before', 'after']); w.writerows(changes)
    e = html.escape
    titles = [c for c in changes if c[3].startswith('title') and c[3] != 'title format']
    tfmt = [c for c in changes if c[3] == 'title format']
    spell = sorted(words.items(), key=lambda kv: (-kv[1], kv[0]))
    out = [f'''<!doctype html><meta charset="utf-8"><title>Song fixes</title><style>
body{{font:14px/1.45 Segoe UI,system-ui,sans-serif;margin:24px auto;max-width:1100px;padding:0 16px;color:#1d2130;background:#fff}}
@media(prefers-color-scheme:dark){{body{{color:#e7e9ee;background:#15171c}}td,th{{border-color:#333}}}}
table{{border-collapse:collapse;width:100%;margin:8px 0 24px}}td,th{{border:1px solid #ccd;padding:4px 8px;text-align:left;vertical-align:top}}
th{{background:rgba(120,140,200,.15)}}del{{color:#c33}}ins{{color:#2a8a3a;text-decoration:none;font-weight:600}}</style>
<h1>Song fixes</h1><p>Made automatically by <code>tools/fix_songs.py</code>. Formatting (double spaces, spaces before punctuation,
missing spaces after commas, ş/ţ → ș/ț) was fixed in <b>{len(fmt_count)}</b> songs.</p>
<h2>1. Titles changed to match the lyrics ({len(titles)})</h2><table><tr><th>Book</th><th>No.</th><th>Old title</th><th>New title</th><th>Why</th></tr>''']
    for b, n, t, k, a, c in titles: out.append(f'<tr><td>{e(b)}</td><td>{n}</td><td><del>{e(a)}</del></td><td><ins>{e(c)}</ins></td><td>{e(k)}</td></tr>')
    out.append(f'</table><h2>2. Single-word titles not found in the lyrics – left as they are, please check ({len(unsure)})</h2><table><tr><th>Book</th><th>No.</th><th>Title</th><th>Lyrics start</th></tr>')
    for b, n, t, c in unsure: out.append(f'<tr><td>{e(b)}</td><td>{n}</td><td>{e(t)}</td><td>{e(c)}</td></tr>')
    out.append(f'</table><h2>3. Spelling: every distinct correction ({len(spell)} words, {sum(words.values())} places)</h2><table><tr><th>Kind</th><th>Before</th><th>After</th><th>Times</th></tr>')
    for (k, a, c), n in spell: out.append(f'<tr><td>{e(k)}</td><td><del>{e(a)}</del></td><td><ins>{e(c)}</ins></td><td>{n}</td></tr>')
    out.append(f'</table><h2>4. Titles tidied ({len(tfmt)})</h2><table><tr><th>Book</th><th>No.</th><th>Before</th><th>After</th></tr>')
    for b, n, t, k, a, c in tfmt: out.append(f'<tr><td>{e(b)}</td><td>{n}</td><td>{e(a)}</td><td>{e(c)}</td></tr>')
    out.append('</table><p>The full list (book, number, every changed word) is in <code>song-fixes.csv</code>.</p>')
    open(os.path.join(EXP, 'song-fixes-report.html'), 'w', encoding='utf8').write('\n'.join(out))

if __name__ == '__main__':
    main()
