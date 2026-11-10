"""Match our song books against www.cantaricrestine.ro and apply the corrections.

Input : tools/_work/cc/site_songs.json   (made by tools/cantaricrestine.py, which caches every download)
        app/data/songs/*.json            (as written by tools/build_songs.py, dataVersion 2)
Output: app/data/songs/*.json (dataVersion 3), data-export/songs/*.csv,
        data-export/cantaricrestine-report.html, data-export/cantaricrestine-summary.json

The first run copies the pristine books (dataVersion < 3) to tools/_work/cc/base/. Later runs start
from that copy, so running this script again always gives the same result. tools/build_songs.py
calls main() at its end (the freshly built books then replace the copy in base/).

Steps
 1. Cîntările Evangheliei: every song is looked up in cr/cn/ca (by text and title, numbers are ignored).
    If found and the text differs, our text is replaced by the site text (our number/title are kept).
 2. The other site categories: a category that is the same book as one of ours (same songs under the same
    numbers) is merged into it (site numbering + text; our songs that are not on the site stay), any
    other category becomes a new book.
 3. Altele: songs found in a site category / CE are moved to that book (or dropped as duplicates).
 4. cor, lauda-si-inchinare, cantarile-harului: songs found on the site get the site text.
 5. All books: â->î, bridge->verse, dataVersion 3; CSV copies regenerated.
"""
import sys, os, json, csv, re, glob, html, shutil, unicodedata, collections, copy
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from common import norm, ROOT

APP = os.path.join(ROOT, 'app', 'data', 'songs')
EXP = os.path.join(ROOT, 'data-export')
WORK = os.path.join(ROOT, 'tools', '_work', 'cc')
BASE = os.path.join(WORK, 'base')
SITE = os.path.join(WORK, 'site_songs.json')
CREATED = os.path.join(WORK, 'created_books.json')
SITE_URL = 'https://www.cantaricrestine.ro'
DATA_VERSION = 3

CAT_NAMES = {
    'cr': 'Cântările Evangheliei (Carte Roșie)', 'cn': 'Cântările Evangheliei (Carte Neagră)',
    'ca': 'Cântările Evangheliei (Carte Albastră)', 'cb': 'Cântecele Bucuriei', 'ld': 'Laudele Domnului',
    'pdc': 'Pe drumul credinței', 'cc': 'Carte de cântări', 'ic2': 'Imnuri Creștine',
    'ic': 'Imnuri Creștine (AZSMR)', 'ib': 'Imnurile Bucuriei', 'ih': 'Imnurile Harului',
    'lpdag': 'Lăudați pe Domnul (Groza)', 'lpd': 'Lăudați pe Domnul'}
CE_CATS = ['cr', 'cn', 'ca']
OTHER_CATS = ['cb', 'ld', 'pdc', 'cc', 'ic2', 'ic', 'ib', 'ih', 'lpdag', 'lpd']
# new books (used when a category does not match one of our books): id, name, short name
NEW_BOOKS = {
    'cb': ('cantecele-bucuriei', 'Cîntecele Bucuriei', 'Bucuriei'),
    'ld': ('laudele-domnului-cc', 'Laudele Domnului', 'Laude'),
    'pdc': ('pe-drumul-credintei', 'Pe drumul credinței', 'Credinței'),
    'cc': ('carte-de-cantari', 'Carte de cîntări', 'CdC'),
    'ic2': ('imnuri-crestine', 'Imnuri Creștine', 'IC'),
    'ic': ('imnuri-crestine-azsmr', 'Imnuri Creștine (AZSMR)', 'IC AZSMR'),
    'ib': ('imnurile-bucuriei', 'Imnurile Bucuriei', 'IB'),
    'ih': ('imnurile-harului', 'Imnurile Harului', 'IH'),
    'lpdag': ('laudati-pe-domnul-groza', 'Lăudați pe Domnul (Groza)', 'LPD Groza'),
    'lpd': ('laudati-pe-domnul', 'Lăudați pe Domnul', 'LPD'),
}
# obvious errors in the site texts (checked by hand)
SITE_TEXT_FIXES = {
    # the text starts with the first stanza of "Sfânt ești, sfânt ești" (cr 003), which is not part of this song
    ('cr', '412 Doamne a crede vreau'): {'drop_sections': [0]},
}
CE_ID = 'cantarile-evangheliei'
MERGE_CANDIDATES = ['laudele-domnului', 'cantarile-harului', 'cor', 'lauda-si-inchinare']
CHECK_BOOKS = ['cor', 'lauda-si-inchinare', 'cantarile-harului']
KEEP_FIELDS = ('key', 'tempo', 'info', 'words', 'music', 'notes')


# ------------------------------------------------------------------ text helpers
def strip_marks(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def fold(s):
    """ASCII fold as used in the site's file names: lower case, no diacritics, words only."""
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', strip_marks(s.lower()))).strip()


def lnorm(s):
    """Loose key for fuzzy matching: â/î/a/i are the same letter (cânt = cînt = cant = cint)."""
    return norm(s).replace('a', 'i')


def wkey(w):
    w = unicodedata.normalize('NFC', w.lower())
    chars, mask = [], []
    for ch in w:
        mask.append(ch in 'âî')
        chars.append(unicodedata.normalize('NFD', ch)[0])
    return ''.join(chars), mask


def words_of(text):
    return [w for w in re.split(r'[^\w]+', unicodedata.normalize('NFC', text.lower())) if w and w != '_']


def same_word(a, b):
    if a == b: return True
    (ca, ma), (cb, mb) = wkey(a), wkey(b)
    if ca == cb: return True
    if len(ca) != len(cb): return False
    for i, (x, y) in enumerate(zip(ca, cb)):
        if x != y and not ((ma[i] or mb[i]) and x in 'ai' and y in 'ai'):
            return False
    return True


def sec_text(sections):
    return '\n'.join(s['text'] for s in sections)


def same_text(secs_a, secs_b):
    """Same lyrics, ignoring case, punctuation, white space and diacritic variants (ş/ș, ţ/ț, â/î/a):
    the letter streams are compared (so "Domnu-lui" = "Domnului"); a/i also match where either side
    has â or î (cânt = cînt = cant = cint)."""
    (ca, ma), (cb, mb) = wkey(''.join(words_of(sec_text(secs_a)))), wkey(''.join(words_of(sec_text(secs_b))))
    if ca == cb: return True
    if len(ca) != len(cb): return False
    for i, (x, y) in enumerate(zip(ca, cb)):
        if x != y and not ((ma[i] or mb[i]) and x in 'ai' and y in 'ai'):
            return False
    return True


def apply_case(t, model):
    """Words of `t` that line up with the words of `model` get the case of the model word (except the
    first word): the lyrics capitalise every line start, a title does not."""
    tw = list(re.finditer(r"[^\W_]+", t))
    nw = re.findall(r"[^\W_]+", model)
    if ''.join(fold(x.group(0)) for x in tw).replace(' ', '') != ''.join(fold(x) for x in nw).replace(' ', ''):
        return t
    starts, pos = {}, 0                       # letter offset where each model word starts
    for w in nw:
        starts[pos] = w; pos += len(fold(w).replace(' ', ''))
    chars, pos = list(t), 0
    for k, m in enumerate(tw):
        w = starts.get(pos)
        if k and w is not None and w[:1].islower() and m.group(0)[:1].isupper():
            chars[m.start()] = chars[m.start()].lower()
        pos += len(fold(m.group(0)).replace(' ', ''))
    return ''.join(chars)


def ratio(a, b):
    if not a or not b: return 0.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


# ------------------------------------------------------------------ parsing the site text
VNUM = re.compile(r'^\s*(\d{1,2})\s*[.)]\s*(?=\S)')
VHEAD = re.compile(r'^\s*(\d{1,2})\s*[.)]?\s*$')
RMARK = re.compile(r'^\s*\(?(?:R|Ref|Refren|Refrain|Cor)\s*\d*\s*\)?\s*[:.)]\s*', re.I)
RHEAD = re.compile(r'^\s*[\[(]?\s*(?:R|Ref|Refren|Refrain|Cor)\s*\d*\s*[\])]?\s*[:.]?\s*$', re.I)
COUNTER = re.compile(r'^\s*\d+\s*/\s*\d+\s*$')


def clean_line(l):
    l = l.replace('\xa0', ' ').replace('\xad', '-').replace('\t', ' ').replace('\u200b', '')
    l = l.replace('\u2010', '-').replace('\u2011', '-')
    return re.sub(r' {2,}', ' ', l).strip()


def split_blocks(text):
    """API text -> list of blocks (lists of lines). Blank lines and slide counters ("2 / 6") separate
    blocks; a numbered line ("2. ...") or a refrain marker also starts a new block."""
    blocks, cur = [], []

    def close():
        nonlocal cur
        if cur: blocks.append(cur)
        cur = []
    for raw in text.replace('\r', '\n').split('\n'):
        l = clean_line(raw)
        if COUNTER.match(l) or not l:
            close(); continue
        if cur and (VNUM.match(l) or VHEAD.match(l) or RMARK.match(l) or RHEAD.match(l)):
            close()
        cur.append(l)
    close()
    return blocks


def bkey(lines):
    return ' '.join(lnorm(' '.join(lines)).split())


TEMPLATE_HEADERS = {'o ce valuri de ndurare'}


def slide_blocks(slides, title):
    """PowerPoint slides -> blocks. Removes what is repeated on top of every slide (book name, song
    title); the labels at the bottom (verse number / "R" / "Refren:", song number) are handled by
    label_blocks()."""
    sl = []
    for s in slides:
        lines = [clean_line(l) for l in s.replace('\r', '\n').replace('\x0b', '\n').split('\n')]
        lines = [l for l in lines if l and not COUNTER.match(l)]
        if lines: sl.append(lines)
    n = len(sl)
    lead = collections.Counter()
    for s in sl:
        for l in set(s[:3]): lead[l] += 1
    need = n if n < 5 else 0.9 * n
    deco = {l for l, c in lead.items() if n >= 2 and c >= need}
    out = []
    for s in sl:
        removed = set()
        while len(s) > 1 and s[0] not in removed and (s[0] in deco or fold(s[0]) in TEMPLATE_HEADERS):
            removed.add(s[0]); s = s[1:]
        if out and s == out[-1]:              # the same slide twice in a row
            continue
        out.append(s)
    return [s for s in out if s]


def counter_slides(text):
    """API texts copied from slides carry counters ("2 / 6"); the site leaves repeated slides (the
    refrain) empty. -> (blocks, index of the refrain block or None)"""
    parts = re.split(r'(?m)^[ \t]*\d+[ \t]*/[ \t]*\d+[ \t]*$', text.replace('\r', ''))
    if len(parts) < 3:
        return None, None
    slides = [[clean_line(l) for l in p.split('\n') if clean_line(l)] for p in parts]
    if slides and not slides[-1]: slides.pop()
    empties = [i for i, s in enumerate(slides) if not s]
    blocks, idx = [], {}
    for i, s in enumerate(slides):
        if s: idx[i] = len(blocks); blocks.append(s)
    ch = None
    if empties and empties[0] >= 2 and (empties[0] - 2) in idx:
        ch = idx[empties[0] - 2]
    return blocks, ch


LABEL_NUM = re.compile(r'^\s*(\d{1,4})\s*[.)]?\s*$')


def label_blocks(blocks, num=None, title=None):
    """-> [[type or None, lines, verse_no or None]]. A refrain marker / verse number at the top or at
    the bottom of a block (slides put their label box after the text) gives the type; a block that is
    only a refrain marker labels the block before it (if that has no label), otherwise the next one."""
    items, pending = [], None
    for b in blocks:
        b = list(b)
        typ, vno = None, None
        while len(b) > 1:                      # leading labels: song number, "R", verse number alone
            m = LABEL_NUM.match(b[0])
            if m and num is not None and int(m.group(1)) == num:
                b.pop(0); continue
            if RHEAD.match(b[0]):
                typ = 'chorus'; b.pop(0); continue
            if m and len(m.group(1)) <= 2:
                typ, vno = 'verse', int(m.group(1)); b.pop(0); continue
            break
        while len(b) > 1:                      # trailing labels
            l = b[-1]
            if title and fold(l) == fold(title):   # slides: song title in a box under the text
                b.pop(); continue
            m = LABEL_NUM.match(l)
            if m and num is not None and int(m.group(1)) == num and len(m.group(1)) >= 2:
                b.pop(); continue
            if m and len(m.group(1)) <= 2:
                vno = vno or int(m.group(1)); typ = typ or 'verse'; b.pop(); continue
            if RHEAD.match(l):
                typ = 'chorus'; b.pop(); continue
            break
        first = b[0]
        if RHEAD.match(first):
            typ, b = 'chorus', b[1:]
        elif typ is not None:
            pass
        elif RMARK.match(first):
            typ, b = 'chorus', [RMARK.sub('', first, count=1)] + b[1:]
        elif VHEAD.match(first) and len(b) > 1:
            m = VHEAD.match(first)
            typ, vno, b = 'verse', int(m.group(1)), b[1:]
        elif VNUM.match(first):
            m = VNUM.match(first)
            typ, vno, b = 'verse', int(m.group(1)), [VNUM.sub('', first, count=1)] + b[1:]
        b = [l for l in b if l.strip()]
        if not b or (len(b) == 1 and LABEL_NUM.match(b[0])):
            if typ == 'chorus':
                if items and items[-1][0] is None:
                    items[-1][0] = 'chorus'
                else:
                    pending = 'chorus'
            continue
        if pending and typ is None:
            typ = pending
        pending = None
        items.append([typ, b, vno])
    merged = []                                # one stanza spread over several slides -> one section
    for it in items:
        if merged and it[0] == 'verse' and merged[-1][0] == 'verse' and it[2] is not None and it[2] == merged[-1][2]:
            merged[-1][1] = merged[-1][1] + it[1]
            continue
        merged.append(it)
    return merged


def parse_site(text, title='', hints=(), slides=None, num=None):
    """Site lyrics -> our sections. Numbered stanzas -> verse, R:/Refren: -> chorus (markers removed).
    Without markers a block that repeats (or that matches one of `hints`, the choruses of our version of
    the song) is the chorus. Repeated choruses are kept once (the program repeats a single chorus)."""
    ch_index = None
    if slides:
        blocks = slide_blocks(slides, title)
    else:
        blocks, ch_index = counter_slides(text or '')
        if blocks is None or any(RHEAD.match(l) or RMARK.match(l) or VNUM.match(l) for b in blocks for l in b):
            blocks, ch_index = split_blocks(text or ''), None
    items = label_blocks(blocks, num, title if slides else None)
    if not items:
        return []
    if ch_index is not None and len(items) == len(blocks) and all(t is None for t, _, _ in items):
        items[ch_index][0] = 'chorus'
    # a first block that is only the title (some texts repeat the title above verse 1)
    if len(items) > 1 and len(items[0][1]) == 1 and items[0][0] is None and title:
        if fold(items[0][1][0]) == fold(title) or lnorm(items[0][1][0]) == lnorm(title):
            items.pop(0)
    marked_chorus = any(t == 'chorus' for t, _, _ in items)
    keys = [bkey(b) for _, b, _ in items]
    cnt = collections.Counter(keys)
    # hints: the choruses of our version of the song (not the "MD:v0c1..." order codes of the APK)
    hint_keys = [set(lnorm(h).split()) for h in hints if h.strip() and not h.strip().startswith('MD:')]

    def like_hint(lines):
        ws = set(lnorm(' '.join(lines)).split())
        for h in hint_keys:
            if ws and h and len(ws & h) / len(ws | h) >= 0.6:
                return True
        return False
    numbered = sum(1 for _, _, n in items if n)
    # unnumbered blocks between numbered stanzas: one text (maybe repeated) = the refrain; several
    # different texts = the second half of each stanza
    between = {keys[i] for i, it in enumerate(items) if it[0] is None and i > 0}
    for i, it in enumerate(items):
        if it[0] is not None: continue
        k = keys[i]
        if marked_chorus:
            it[0] = 'verse'
        elif hint_keys and like_hint(it[1]):
            it[0] = 'chorus'
        elif cnt[k] > 1 and not (cnt[k] == 2 and keys[0] == k and keys[-1] == k):
            it[0] = 'chorus'
        elif numbered >= 2 and i > 0:
            it[0] = 'chorus' if len(between) == 1 else 'cont'
        else:
            it[0] = 'verse'
    out, seen_ch = [], set()
    for (typ, b, _), k in zip(items, keys):
        if typ == 'cont':
            if out and out[-1]['type'] == 'verse':
                out[-1]['text'] += '\n' + '\n'.join(b)
                out[-1]['_k'] = bkey(out[-1]['text'].split('\n'))
                continue
            typ = 'verse'
        if typ == 'chorus':
            if k in seen_ch: continue
            seen_ch.add(k)
        out.append({'type': typ, 'text': '\n'.join(b), '_k': k})
    # verses that only repeat the chorus (refrain printed again without its marker)
    res = [s for s in out if not (s['type'] == 'verse' and s['_k'] in seen_ch)]
    for s in res: del s['_k']
    return res


# ------------------------------------------------------------------ titles
def _word_spans(text):
    return [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"[^\W_]+", text)]


def title_from_text(name, sections, max_words=None):
    """Find the words of `name` (often ASCII only) in the lyrics and return them as written there
    (with diacritics and hyphens), or None."""
    target = fold(name).split()
    if not target: return None
    txt = '\n'.join(s['text'] for s in sections)
    spans = _word_spans(txt)
    keys = [fold(w) for _, _, w in spans]
    # words glued in our titles ("Sănalț" for "Să-nalț"): compare letter streams too
    tl = ''.join(target)
    for i in range(len(keys)):
        if keys[i] != target[0] and not tl.startswith(keys[i]): continue
        if keys[i:i + len(target)] == target:
            j = i + len(target) - 1
        else:
            acc, j = '', i
            while j < len(keys) and len(acc) < len(tl):
                acc += keys[j]; j += 1
            if acc != tl: continue
            j -= 1
        seg = txt[spans[i][0]:spans[j][1]]
        if '\n\n' in seg: continue
        seg = re.sub(r'\s*\n\s*', ' ', seg)
        return seg.strip()
    return None


def restore_diacritics(name, sections):
    """Per word: replace an ASCII word of `name` by the same word with diacritics from the lyrics."""
    vocab = collections.Counter(w for _, _, w in _word_spans('\n'.join(s['text'] for s in sections)))
    best = {}
    for w, c in vocab.most_common():
        best.setdefault(fold(w), w)
    out = []
    for m in re.finditer(r"[^\W_]+|[\W_]+", name):
        w = m.group(0)
        if re.match(r"[^\W_]", w) and w.isascii() and fold(w) in best:
            r = best[fold(w)]
            r = (r[0].upper() + r[1:]) if w[0].isupper() else (r[0].lower() + r[1:])
            out.append(r)
        else:
            out.append(w)
    return ''.join(out)


def tidy_title(t):
    t = re.sub(r'[„“”"«»]', '', t)
    t = re.sub(r'/+:|:/+|\|:|:\||\(:|:\)', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'^[\s/:|(,;.!?-]+', '', t)
    t = re.sub(r'[\s,;:.!?-]+$', '', t)
    return t.strip()


def site_title(name, sections):
    if not name.isascii():
        return name
    t = title_from_text(name, sections)
    if t:
        t = apply_case(tidy_title(t), name)
        return t[0].upper() + t[1:]
    t = fuzzy_line_title(name, sections)
    if t:
        return t[0].upper() + t[1:]
    return restore_diacritics(name, sections)


def fuzzy_line_title(name, sections):
    """The site name has a small typo ("Iehova ii din veac" for "Iehova-i din veac"): take the start of
    the first line of a verse or of the chorus with about as many words, if it is nearly the same."""
    target = fold(name)
    nw = len(target.split())
    best = (0.0, None)
    lines = []
    for s in sections[:3]:
        if s['text'].strip(): lines.append(s['text'].strip().split('\n')[0])
    for line in lines:
        spans = _word_spans(line)
        for k in range(max(1, nw - 1), min(len(spans), nw + 1) + 1):
            seg = line[:spans[k - 1][1]]
            r = ratio(fold(seg), target)
            if r > best[0]: best = (r, seg)
    if best[0] >= 0.85:
        return apply_case(tidy_title(best[1]), name) or None
    return None


def fix_title(title, sections):
    """Keep our title unless it is clearly broken: words glued together where the lyrics have a hyphen
    ("Sănalț jertfa Ta" -> "Să-nalț jertfa Ta"), no diacritics at all although the lyrics have them,
    or starting with a small letter. Returns the (possibly) corrected title."""
    t = title_from_text(title, sections)
    if not t: return title
    t = tidy_title(t)
    if not t: return title
    t = t[0].upper() + t[1:]
    if t == title: return title

    def ndia(s): return sum(1 for ch in s if ch.isalpha() and not ch.isascii())
    if ndia(t) < ndia(title):                      # never trade diacritics for plain letters
        return title
    tw, ow = fold(t).split(), fold(title).split()
    # words glued in our title where the lyrics have a hyphen/apostrophe ("Sănalț" / "Să-nalț")
    glued = len(tw) > len(ow) and re.search(r"[-’'`]", t) is not None and \
        all(any(o == ''.join(tw[i:i + k]) for i in range(len(tw)) for k in (1, 2, 3)) for o in ow)
    # no diacritics in our title although at least two of its words need them
    words_t = re.findall(r"[^\W_]+", t)
    need = sum(1 for w in words_t if not w.isascii())
    ascii_only = title.isascii() and len(tw) == len(ow) and need >= 2
    lower = title[:1].islower() and len(tw) == len(ow)
    if glued or ascii_only or lower:
        return apply_case(t, title)
    return title


def title_broken(title, sections):
    """Our title is clearly wrong: it starts with a small letter, or it has no diacritics at all and some
    of its words do not occur in the lyrics (typos such as "Tieti lipsete pacea")."""
    if not title.strip() or title[:1].islower():
        return True
    if not title.isascii():
        return False
    txt = '\n'.join(s['text'] for s in sections)
    if txt.isascii():
        return False
    forms = collections.defaultdict(set)              # folded word -> spellings in the lyrics
    for w in re.findall(r"[^\W_]+", txt):
        forms[fold(w)].add(w.lower())
    no_dia = typo = 0
    for w in fold(title).split():
        if w not in forms: typo += 1
        elif all(not f.isascii() for f in forms[w]): no_dia += 1
    return no_dia >= 2 or (no_dia >= 1 and typo >= 1)


# ------------------------------------------------------------------ site songs
class SiteSong:
    def __init__(self, rec):
        self.cat = rec['cat']; self.id = str(rec['id']); self.url = rec.get('url') or ''
        self.denumire = rec['denumire']; self.source = rec.get('source')
        m = re.match(r'^\s*(\d+)\s*[.\-)]?\s+(.*)$', self.denumire)
        self.num = int(m.group(1)) if m else None
        name = m.group(2) if m else self.denumire
        name = re.sub(r'(?:\s*[-_]\s*|\s+)v\d+\s*$', '', name, flags=re.I)
        name = re.sub(r'_[a-z]{1,4}\d*\s*$', '', name, flags=re.I)
        self.name = name.strip(' -_')
        self.text = rec.get('text') or ''
        self.slides = None if self.text.strip() else (rec.get('slides') or [])
        self.sections = self.parse()
        self.title = site_title(self.name, self.sections) if self.sections else self.name
        self.f = Feat(None, self.sections, title=self.name)
        self.alt = False
        self.twin = None

    def parse(self, hints=()):
        secs = parse_site(self.text, self.name, hints, slides=self.slides, num=self.num)
        fix = SITE_TEXT_FIXES.get((self.cat, self.denumire))
        if fix and secs:
            secs = [s for i, s in enumerate(secs) if i not in fix.get('drop_sections', ())]
        return secs

    @property
    def key(self): return (self.cat, self.id)

    def label(self):
        return f'{CAT_NAMES[self.cat]} – {self.denumire}'


class Feat:
    __slots__ = ('fp', 'fw', 'fw2', 't', 'n')

    def __init__(self, _unused, sections, title=''):
        txt = ' '.join(s['text'] for s in sections)
        words = lnorm(txt).split()
        self.fp = set(words)
        self.n = len(words)
        verses = [s for s in sections if s['type'] != 'chorus'] or sections
        self.fw = ' '.join(lnorm(verses[0]['text']).split()[:10]) if sections else ''
        self.fw2 = ' '.join(words[:10])
        self.t = lnorm(title)


def feat_of(song):
    return Feat(None, song['sections'], song['title'])


def similar(a, b):
    """-> (ok, score, details). Thresholds of tools/build_songs.py, plus containment (one version has
    fewer stanzas than the other)."""
    if not a.fp or not b.fp:
        return False, 0.0, None
    inter = len(a.fp & b.fp)
    if not inter:
        return False, 0.0, None
    j = inter / (len(a.fp) + len(b.fp) - inter)
    c = inter / min(len(a.fp), len(b.fp))
    if j < 0.15 and c < 0.45 and a.t[:5] != b.t[:5] and a.fw[:8] != b.fw[:8]:
        return False, 0.0, None
    fw = max(ratio(a.fw, b.fw), ratio(a.fw2, b.fw2))
    tt = ratio(a.t, b.t)
    small = min(len(a.fp), len(b.fp))
    ok = (j > 0.45 and (fw > 0.4 or tt > 0.5 or c > 0.7)) \
        or (fw > 0.8 and j > 0.25) \
        or (tt > 0.85 and fw > 0.6 and j > 0.2) \
        or (tt >= 0.9 and j >= 0.22 and (c >= 0.4 or fw >= 0.6)) \
        or (tt >= 0.85 and j >= 0.35) \
        or (c > 0.75 and small >= 12 and (fw > 0.7 or tt > 0.8))
    score = j + c / 2 + fw / 2 + tt / 4
    return ok, score, (round(j, 2), round(c, 2), round(fw, 2), round(tt, 2))


def find_matches(f, pool):
    """All acceptable matches, best first: [(score, site_song, details)]"""
    res = []
    for p in pool:
        ok, sc, det = similar(f, p.f)
        if ok: res.append((sc, p, det))
    res.sort(key=lambda x: -x[0])
    return res


def doubtful(det):
    """Accepted, but text and title do not both agree well -> listed for a manual check."""
    j, c, fw, tt = det
    if fw > 0.9 and tt > 0.8: return False
    return j < 0.35 or (tt < 0.6 and fw < 0.6) or (j < 0.45 and tt < 0.7)


# ------------------------------------------------------------------ books I/O
def load_books(fresh=False):
    cur = {}
    for p in glob.glob(os.path.join(APP, '*.json')):
        with open(p, encoding='utf8') as f:
            b = json.load(f)
        cur[b['id']] = b
    created = []
    if os.path.exists(CREATED):
        with open(CREATED, encoding='utf8') as f: created = json.load(f)
    pristine = {k: v for k, v in cur.items() if k not in created}
    if fresh or (pristine and all((b.get('dataVersion') or 1) < DATA_VERSION for b in pristine.values())):
        if os.path.isdir(BASE): shutil.rmtree(BASE)
        os.makedirs(BASE)
        for k, b in pristine.items():
            with open(os.path.join(BASE, k + '.json'), 'w', encoding='utf8') as f:
                json.dump(b, f, ensure_ascii=False, indent=0)
        print(f'saved {len(pristine)} pristine books to {BASE}')
        books = pristine
    else:
        if not os.path.isdir(BASE):
            raise SystemExit('The song books were already updated and tools/_work/cc/base/ is missing - '
                             'run tools/build_songs.py first.')
        books = {}
        for p in glob.glob(os.path.join(BASE, '*.json')):
            with open(p, encoding='utf8') as f:
                b = json.load(f)
            books[b['id']] = b
        print(f'starting from the {len(books)} pristine books in {BASE}')
    for p in created:                      # books made by an earlier run are rebuilt
        fp = os.path.join(APP, p + '.json')
        if p not in books and os.path.exists(fp): os.remove(fp)
        fc = os.path.join(EXP, 'songs', p + '.csv')
        if p not in books and os.path.exists(fc): os.remove(fc)
    return books


def to_io_orthography(s):
    return s.replace('â', 'î').replace('Â', 'Î')


def finalize_and_write(books, order, created_ids):
    os.makedirs(os.path.join(EXP, 'songs'), exist_ok=True)
    for bid in order:
        bk = books[bid]
        for s in bk['songs']:
            s['title'] = to_io_orthography(s['title'])
            for x in s['sections']:
                x['text'] = to_io_orthography(x['text'])
                if x['type'] not in ('verse', 'chorus'):
                    x['type'] = 'verse'
        bk['songs'].sort(key=lambda s: s['number'])
        bk['dataVersion'] = DATA_VERSION
        ordered = {k: bk[k] for k in ('id', 'name', 'short', 'description') if k in bk}
        ordered.update({k: v for k, v in bk.items() if k not in ordered and k not in ('songs', 'dataVersion')})
        ordered['dataVersion'] = DATA_VERSION
        ordered['songs'] = bk['songs']
        with open(os.path.join(APP, bid + '.json'), 'w', encoding='utf8') as f:
            json.dump(ordered, f, ensure_ascii=False, indent=0)
        with open(os.path.join(EXP, 'songs', bid + '.csv'), 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.writer(f)
            w.writerow(['number', 'title', 'key', 'info', 'lyrics'])
            for s in bk['songs']:
                lyr = '\n\n'.join(('[Refren]\n' if x['type'] == 'chorus' else '') + x['text'] for x in s['sections'])
                w.writerow([s['number'], s['title'], s.get('key', ''), s.get('info', ''), lyr])
    with open(CREATED, 'w', encoding='utf8') as f:
        json.dump(sorted(created_ids), f)


# ------------------------------------------------------------------ main work
class Run:
    def __init__(self, books, site):
        self.books = books
        self.site = site                          # cat -> [SiteSong]
        self.changed = []                         # dicts for table 1
        self.notfound = []                        # (book name, number, title, note)
        self.actions = []                         # (what, book, details) table 3
        self.not_in_ce = []                       # table 4
        self.doubt = []                           # doubtful matching decisions
        self.identical = collections.Counter()    # book -> songs found with the same text
        self.created = []
        self.book_of_cat = {}                     # cat -> our book id (merged or created)
        self.site_to_book = {}                    # site key -> (book id, number)

    def bname(self, bid):
        return self.books[bid]['name']

    # --- one song gets the site text
    def update_song(self, bid, song, sm, det, how, new_number=None, force=False):
        hints = [x['text'] for x in song['sections'] if x['type'] == 'chorus']
        new_secs = sm.parse(hints)
        if not new_secs:
            return False
        if not force and same_text(song['sections'], new_secs):
            self.identical[bid] += 1
            if new_number is not None: song['number'] = new_number
            return False
        old = copy.deepcopy(song)
        song['sections'] = new_secs
        song['title'] = fix_title(song['title'], new_secs)
        if title_broken(song['title'], new_secs) and sm.title:
            song['title'] = sm.title
        if new_number is not None: song['number'] = new_number
        self.changed.append({'book': bid, 'number': old['number'], 'new_number': song['number'],
                             'title': song['title'], 'old_title': old['title'], 'site': sm, 'det': det,
                             'how': how, 'old': old['sections'], 'new': new_secs})
        if det and doubtful(det):
            self.doubt.append((self.bname(bid), old['number'], old['title'], sm.label(), det, how))
        return True

    # --- step 1
    def step_ce(self):
        ce = self.books[CE_ID]
        pool = [s for c in CE_CATS for s in self.site.get(c, []) if s.sections]
        present = set()
        self.ce_feats = []
        for song in ce['songs']:
            f = feat_of(song)
            self.ce_feats.append((song, f))
            if not song['sections']:
                self.notfound.append((ce['name'], song['number'], song['title'], 'no lyrics in our book'))
                continue
            ms = find_matches(f, pool)
            for _, p, _ in ms: present.add(p.key)
            if not ms:
                self.notfound.append((ce['name'], song['number'], song['title'], 'searched in cr, cn, ca'))
                continue
            sc, sm, det = ms[0]
            self.site_to_book.setdefault(sm.key, (CE_ID, song['number']))
            self.update_song(CE_ID, song, sm, det, 'CE: text replaced by the site text')
        # table 4: site songs not in our CE book
        for c in CE_CATS:
            songs = self.site.get(c, [])
            present_names = {fold(s.name) for s in songs if s.key in present}
            for s in songs:
                if s.key in present: continue
                if s.num is None and fold(s.name) in present_names: continue     # other version of a song we have
                self.not_in_ce.append((c, s.num, s.title, s.denumire, s.url, 'no text on the site' if not s.sections else ''))

    # --- step 2
    def primary_versions(self, cat):
        """One site song per number (the numbered one; an unnumbered file is another version of it),
        plus unnumbered songs that are not another version of a numbered one."""
        songs = [s for s in self.site.get(cat, [])]
        by_num = collections.defaultdict(list)
        for s in songs:
            if s.num is not None: by_num[s.num].append(s)
        prim = {}
        for n, lst in by_num.items():
            lst.sort(key=lambda s: (not s.sections, s.source != 'api', bool(re.search(r'_v\d|\bv\d\s*$', s.denumire, re.I)), s.denumire))
            prim[n] = lst[0]
            for o in lst[1:]: o.alt = True
        extra = []
        names = {fold(s.name): s for s in prim.values()}
        for s in songs:
            if s.num is not None or not s.sections: continue
            twin = names.get(fold(s.name))
            if twin is None:
                for p in prim.values():
                    if similar(s.f, p.f)[0]:
                        twin = p; break
            if twin is not None:
                s.alt = True; s.twin = twin
            else:
                extra.append(s)
        return prim, extra

    def site_song_record(self, sm, number):
        o = {'number': number, 'title': sm.title, 'sections': [dict(x) for x in sm.sections]}
        return o

    def step_categories(self):
        report = []
        for cat in OTHER_CATS:
            songs = [s for s in self.site.get(cat, []) if s.sections]
            if not songs: continue
            best = None
            for bid in MERGE_CANDIDATES:
                if bid not in self.books or bid in self.book_of_cat.values(): continue
                bk = self.books[bid]
                matched = same_no = 0
                for song in bk['songs']:
                    ms = find_matches(feat_of(song), songs)
                    if ms:
                        matched += 1
                        if any(p.num == song['number'] for _, p, _ in ms[:3]): same_no += 1
                report.append((cat, bid, len(bk['songs']), matched, same_no))
                if same_no >= max(3, 0.3 * len(bk['songs'])) and same_no >= 0.6 * matched:
                    if best is None or same_no > best[1]: best = (bid, same_no, matched)
            prim, extra = self.primary_versions(cat)
            if best:
                self.merge(cat, best[0], prim, extra, best)
            else:
                self.create(cat, prim, extra)
        self.match_matrix = report

    def merge(self, cat, bid, prim, extra, stat):
        bk = self.books[bid]
        ours = bk['songs']
        allsongs = [s for s in self.site.get(cat, []) if s.sections]
        new = {n: self.site_song_record(sm, n) for n, sm in prim.items() if sm.sections}
        for n, sm in prim.items():
            if not sm.sections:            # no text on the site: keep the title only if we have nothing
                new.setdefault(n, {'number': n, 'title': sm.title, 'sections': []})
        nxt = max(list(new) + [s['number'] for s in ours] + [0]) + 1
        for sm in extra:
            new[nxt] = self.site_song_record(sm, nxt); new[nxt]['info'] = 'Fără număr pe cantaricrestine.ro'
            prim[nxt] = sm; nxt += 1
        for n, sm in prim.items():
            self.site_to_book[sm.key] = (bid, n)
        for s in allsongs:
            if s.alt and getattr(s, 'twin', None) is not None:
                self.site_to_book.setdefault(s.key, self.site_to_book.get(s.twin.key))
            elif s.alt and s.num in prim:
                self.site_to_book.setdefault(s.key, (bid, s.num))
        leftovers, merged_cnt, used = [], 0, {}
        for song in ours:
            ms = find_matches(feat_of(song), allsongs)
            if not ms:
                leftovers.append(song); continue
            sc, sm, det = ms[0]
            target = self.site_to_book.get(sm.key)
            if not target or target[0] != bid:
                leftovers.append(song); continue
            n = target[1]
            if n in used:
                self.actions.append(('duplicate removed', bk['name'], f'our no. {song["number"]} “{song["title"]}” is the same site song (no. {n}) as our no. {used[n]} – dropped'))
                continue
            used[n] = song['number']
            site_rec = new[n]
            tmp = copy.deepcopy(song)
            psm = prim[n]
            changed = self.update_song(bid, tmp, psm, det, f'merged with {CAT_NAMES[cat]} ({cat})', new_number=n)
            rec = dict(site_rec)
            if changed:
                rec['title'] = site_rec['title']
                self.changed[-1]['title'] = rec['title']
                rec['sections'] = tmp['sections']
            else:
                rec['sections'] = song['sections'] if not site_rec['sections'] else site_rec['sections']
            for k in KEEP_FIELDS:
                if song.get(k) and not rec.get(k): rec[k] = song[k]
            new[n] = rec
            merged_cnt += 1
            if song['number'] != n:
                self.actions.append(('renumbered', bk['name'], f'“{song["title"]}”: our no. {song["number"]} → no. {n} (site number)'))
        kept = []
        for song in leftovers:
            s2 = copy.deepcopy(song)
            if s2['number'] in new:
                old_no = s2['number']; s2['number'] = nxt; nxt += 1
                self.actions.append(('renumbered', bk['name'], f'“{song["title"]}” (ours, not on the site): no. {old_no} is used by a site song → no. {s2["number"]}'))
            new[s2['number']] = s2
            kept.append(s2)
        bk['songs'] = list(new.values())
        old_desc = bk.get('description', '')
        bk['description'] = (f'{bk["name"]} – {len(prim)} cîntări de pe cantaricrestine.ro ({CAT_NAMES[cat]}), '
                             f'unite cu cartea noastră ({len(ours)} cîntări: {merged_cnt} găsite pe site, {len(kept)} păstrate). '
                             f'Înainte: {old_desc}')
        self.book_of_cat[cat] = bid
        self.leftovers_of_merge = getattr(self, 'leftovers_of_merge', []) + [(bid, s) for s in kept]
        self.actions.append(('book merged', bk['name'], f'site category {CAT_NAMES[cat]} ({cat}: {len(allsongs)} files = {len(prim)} songs, the rest are other versions) '
                             f'merged into our “{bk["name"]}” ({len(ours)} songs: {merged_cnt} found on the site under the same number, {len(kept)} not on the site and kept). '
                             f'Site numbering and site text are used. The book now has {len(bk["songs"])} songs.'))

    def create(self, cat, prim, extra):
        bid, name, short = NEW_BOOKS[cat]
        songs = []
        for n, sm in sorted(prim.items()):
            if not sm.sections: continue
            songs.append(self.site_song_record(sm, n))
            self.site_to_book[sm.key] = (bid, n)
        nxt = max(list(prim) + [0]) + 1
        for sm in extra:
            r = self.site_song_record(sm, nxt); r['info'] = 'Fără număr pe cantaricrestine.ro'
            songs.append(r); self.site_to_book[sm.key] = (bid, nxt); nxt += 1
        for s in self.site.get(cat, []):
            if s.alt:
                tw = getattr(s, 'twin', None)
                tgt = self.site_to_book.get(tw.key) if tw else (bid, s.num) if s.num in prim else None
                if tgt: self.site_to_book.setdefault(s.key, tgt)
        empty = sum(1 for s in songs if not s['sections'])
        self.books[bid] = {'id': bid, 'name': name, 'short': short,
                           'description': f'{CAT_NAMES[cat]} – importat de pe cantaricrestine.ro (categoria „{cat}”).',
                           'songs': songs}
        self.book_of_cat[cat] = bid
        self.created.append(bid)
        nf = len(self.site.get(cat, []))
        n_alt = sum(1 for s in self.site.get(cat, []) if s.alt)
        n_bad = nf - len(songs) - n_alt
        self.actions.append(('book created', name, f'id “{bid}”, short name “{short}”, from site category {CAT_NAMES[cat]} ({cat}): {len(songs)} songs from {nf} files'
                             + (f'; {n_alt} files are other versions of the same songs (not added)' if n_alt else '')
                             + (f'; {n_bad} files without text skipped' if n_bad > 0 else '')
                             + (f'; {empty} songs without text on the site' if empty else '')
                             + (f'; {len(extra)} songs have no number on the site (numbered from {max(list(prim) + [0]) + 1})' if extra else '')))

    # --- step 4
    def step_check_books(self):
        pool = [s for c in CE_CATS + OTHER_CATS for s in self.site.get(c, []) if s.sections]
        todo = [(bid, s) for bid in CHECK_BOOKS if bid in self.books and bid not in self.book_of_cat.values()
                for s in self.books[bid]['songs']]
        todo += getattr(self, 'leftovers_of_merge', [])
        for bid, song in todo:
            if not song['sections']:
                self.notfound.append((self.bname(bid), song['number'], song['title'], 'no lyrics in our book')); continue
            ms = find_matches(feat_of(song), pool)
            if not ms:
                self.notfound.append((self.bname(bid), song['number'], song['title'], 'searched in all categories'))
                continue
            sc, sm, det = ms[0]
            self.update_song(bid, song, sm, det, 'text replaced by the site text')

    # --- step 3
    def step_altele(self):
        alt = self.books['altele']
        pool = [s for c in CE_CATS + OTHER_CATS for s in self.site.get(c, []) if s.sections]
        ce = self.books[CE_ID]
        ce_now = [(s, feat_of(s)) for s in ce['songs']]
        keep = []
        nxt = max(s['number'] for s in ce['songs']) + 1
        for song in alt['songs']:
            f = feat_of(song)
            if not song['sections']:
                keep.append(song); self.notfound.append((alt['name'], song['number'], song['title'], 'no lyrics in our book')); continue
            ms = find_matches(f, pool)
            ce_best = None
            for cs, cf in ce_now + self.ce_feats:
                ok, sc, det = similar(f, cf)
                if ok and (ce_best is None or sc > ce_best[0]): ce_best = (sc, cs, det)
            site_best = ms[0] if ms else None
            if ce_best and (not site_best or ce_best[0] >= site_best[0] or self.site_to_book.get(site_best[1].key, ('',))[0] == CE_ID):
                cs = ce_best[1]
                self.actions.append(('moved from Altele', ce['name'], f'Altele no. {song["number"]} “{song["title"]}” is CE no. {cs["number"]} “{cs["title"]}” – CE already has it, duplicate removed from Altele'))
                if doubtful(ce_best[2]): self.doubt.append(('Altele', song['number'], song['title'], f'CE {cs["number"]} {cs["title"]}', ce_best[2], 'removed as duplicate of CE'))
                continue
            if site_best:
                sc, sm, det = site_best
                tgt = self.site_to_book.get(sm.key)
                if tgt and tgt[0] in self.books and tgt[0] != CE_ID:
                    tb = self.books[tgt[0]]
                    ts = next((s for s in tb['songs'] if s['number'] == tgt[1]), None)
                    self.actions.append(('moved from Altele', tb['name'], f'Altele no. {song["number"]} “{song["title"]}” is {tb["name"]} no. {tgt[1]} “{ts["title"] if ts else sm.title}” (site: {sm.label()}) – that book already has it, duplicate removed from Altele'))
                    if doubtful(det): self.doubt.append(('Altele', song['number'], song['title'], sm.label(), det, f'removed as duplicate of {tb["name"]} {tgt[1]}'))
                    continue
                if sm.cat in CE_CATS:
                    s2 = copy.deepcopy(song)
                    s2['number'] = nxt; nxt += 1
                    s2['info'] = f'Supliment (din Altele nr. {song["number"]}; pe site: {CAT_NAMES[sm.cat]}{" nr. " + str(sm.num) if sm.num else ""})'
                    ce['songs'].append(s2)
                    self.update_song(CE_ID, s2, sm, det, f'moved from Altele no. {song["number"]}, site text', force=True)
                    self.site_to_book[sm.key] = (CE_ID, s2['number'])
                    self.actions.append(('moved from Altele', ce['name'], f'Altele no. {song["number"]} “{song["title"]}” is on the site in {sm.label()} but was not in our CE – moved to CE as no. {s2["number"]} (supplement)'))
                    if doubtful(det): self.doubt.append(('Altele', song['number'], song['title'], sm.label(), det, f'moved to CE {s2["number"]}'))
                    continue
            keep.append(song)
            self.notfound.append((alt['name'], song['number'], song['title'], 'searched in all categories and in CE – stays in Altele'))
        alt['songs'] = keep


# ------------------------------------------------------------------ report
CSS = """
:root{--bg:#fbfaf7;--fg:#1d1d1f;--mut:#666;--line:#ddd;--head:#f0ede6;--acc:#7a3e00;--old:#fff4f2;--new:#f2fbf3}
@media (prefers-color-scheme: dark){:root{--bg:#1c1c1e;--fg:#e8e8e8;--mut:#aaa;--line:#3a3a3c;--head:#2a2a2d;--acc:#f0b070;--old:#3a2523;--new:#203325}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:0 auto;max-width:1200px;padding:16px}
h1{font-size:1.6em;margin:.2em 0} h2{margin-top:2em;border-bottom:2px solid var(--line);padding-bottom:.2em}
a{color:var(--acc)} table{border-collapse:collapse;width:100%;margin:.6em 0}
th,td{border:1px solid var(--line);padding:4px 6px;vertical-align:top;text-align:left}
th{background:var(--head);position:sticky;top:0} td.n{text-align:right;white-space:nowrap}
.mut{color:var(--mut);font-size:.9em} .sum li{margin:.15em 0}
.song{border:1px solid var(--line);border-radius:6px;margin:1em 0;padding:8px 12px}
.song h3{margin:.2em 0 .5em;font-size:1.05em} .cols{display:flex;gap:12px;flex-wrap:wrap}
.cols>div{flex:1 1 320px;min-width:0;padding:6px 10px;border-radius:4px}
.old{background:var(--old)} .new{background:var(--new)}
.sec{white-space:pre-wrap;margin:0 0 .7em} .lab{font-weight:bold;color:var(--mut)}
.tbl-wrap{overflow-x:auto}
"""


def esc(s): return html.escape(str(s if s is not None else ''))


def sections_html(secs):
    out, vn = [], 0
    for s in secs:
        if s['type'] == 'chorus': lab = 'R'
        else:
            vn += 1; lab = str(vn)
        out.append(f'<div class="sec"><span class="lab">{lab}.</span> {esc(s["text"])}</div>')
    return ''.join(out) or '<p class="mut">(no text)</p>'


def write_report(run, counts):
    rows, befores = [], []
    order = {CE_ID: 0}
    ch = sorted(run.changed, key=lambda c: (order.get(c['book'], 1), run.bname(c['book']), c['number']))
    for i, c in enumerate(ch, 1):
        sm = c['site']
        num = str(c['number']) + (f' → {c["new_number"]}' if c['new_number'] != c['number'] else '')
        title = to_io_orthography(c['title'])
        tnote = '' if c['title'] == c['old_title'] else f'<br><span class="mut">was: {esc(c["old_title"])}</span>'
        rows.append(f'<tr id="r{i}"><td class="n">{i}</td><td>{esc(run.bname(c["book"]))}</td><td class="n">{esc(num)}</td>'
                    f'<td>{esc(title)}{tnote}</td><td>{esc(CAT_NAMES[sm.cat])} <span class="mut">({sm.cat})</span></td>'
                    f'<td><a href="{esc(sm.url)}">{esc(sm.denumire)}</a></td><td><a href="#b{i}">before text</a></td></tr>')
        new_secs = [{'type': x['type'], 'text': to_io_orthography(x['text'])} for x in c['new']]
        befores.append(f'<div class="song" id="b{i}"><h3><a href="#r{i}">#{i}</a> · {esc(run.bname(c["book"]))} no. {esc(num)} – {esc(c["old_title"])}'
                       f' <span class="mut">(site: <a href="{esc(sm.url)}">{esc(sm.label())}</a>; {esc(c["how"])})</span></h3>'
                       f'<div class="cols"><div class="old"><b>Before</b>{sections_html(c["old"])}</div>'
                       f'<div class="new"><b>Now (site text)</b>{sections_html(new_secs)}</div></div>'
                       f'<p class="mut"><a href="#r{i}">↑ back to row {i}</a></p></div>')
    nf = sorted(run.notfound, key=lambda r: (0 if r[0] == run.bname(CE_ID) else 1, r[0], r[1]))
    nf_rows = ''.join(f'<tr><td>{esc(to_io_orthography(t))}</td><td class="n">{n}</td><td>{esc(b)}</td><td class="mut">{esc(note)}</td></tr>' for b, n, t, note in nf)
    act_rows = ''.join(f'<tr><td>{esc(a)}</td><td>{esc(b)}</td><td>{esc(to_io_orthography(d))}</td></tr>' for a, b, d in run.actions)
    t4 = sorted(run.not_in_ce, key=lambda r: (CE_CATS.index(r[0]), r[1] is None, r[1] or 0, r[2]))
    t4_rows = ''.join(f'<tr><td>{esc(CAT_NAMES[c])} <span class="mut">({c})</span></td><td class="n">{"" if n is None else n}</td><td><a href="{esc(u)}">{esc(t)}</a></td><td class="mut">{esc(note)}</td></tr>' for c, n, t, d, u, note in t4)
    dz = ''.join(f'<tr><td>{esc(b)}</td><td class="n">{n}</td><td>{esc(t)}</td><td>{esc(site)}</td><td class="mut">{esc(how)}</td><td class="mut">{esc(det)}</td></tr>' for b, n, t, site, det, how in run.doubt)
    summ = ''.join(f'<li>{esc(k)}: <b>{esc(v)}</b></li>' for k, v in counts['display'])
    bk_rows = ''.join(f'<tr><td>{esc(k)}</td><td class="n">{v}</td></tr>' for k, v in counts['books'].items())
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>cantaricrestine.ro report</title><style>{CSS}</style></head><body>
<h1>Song books checked against cantaricrestine.ro</h1>
<p class="mut">Texts were compared ignoring case, punctuation, white space and diacritic variants (ş/ș, ţ/ț, â/î/a). Songs whose text is the same were left alone and are not listed. As the last step every book (titles and lyrics) was changed from â to î, any “bridge” section became a verse, and dataVersion is now {DATA_VERSION}. Song titles in the tables are shown in the final î spelling; the “Before” texts are shown exactly as they were.</p>
<ul class="sum">{summ}</ul>
<p><a href="#t1">1. Changed songs</a> · <a href="#before">Before texts</a> · <a href="#t2">2. Not found on the site</a> · <a href="#t3">3. Books merged / created / songs moved from Altele</a> · <a href="#t4">4. Site songs not in our CE book</a> · <a href="#doubt">Matches to double-check</a> · <a href="#books">Books</a></p>
<h2 id="t1">1. Changed songs ({len(rows)})</h2>
<div class="tbl-wrap"><table><tr><th>#</th><th>Book</th><th>Our no.</th><th>Title</th><th>Site category</th><th>Site song</th><th>Previous text</th></tr>
{''.join(rows)}</table></div>
<h2 id="before">Before texts ({len(befores)})</h2>
<p class="mut">For every changed song: the previous text (left) and the new text from the site (right).</p>
{''.join(befores)}
<h2 id="t2">2. Not found on the site ({len(nf)})</h2>
<div class="tbl-wrap"><table><tr><th>Name</th><th>Our no.</th><th>Song book</th><th>Note</th></tr>{nf_rows}</table></div>
<h2 id="t3">3. Books merged / created / songs moved from Altele ({len(run.actions)})</h2>
<div class="tbl-wrap"><table><tr><th>What</th><th>Book</th><th>Details</th></tr>{act_rows}</table></div>
<h2 id="t4">4. Songs in cr / cn / ca that are not in our CE book ({len(t4)}) – information only</h2>
<p class="mut">These were not added. Unnumbered site files that are only another version of a song we have are not listed.</p>
<div class="tbl-wrap"><table><tr><th>Category</th><th>Site no.</th><th>Title</th><th>Note</th></tr>{t4_rows}</table></div>
<h2 id="doubt">Matches to double-check ({len(run.doubt)})</h2>
<p class="mut">Accepted matches where the text and the title agree less well (often the same hymn in another translation). Numbers: word-set overlap (Jaccard), containment, first-words similarity, title similarity.</p>
<div class="tbl-wrap"><table><tr><th>Book</th><th>Our no.</th><th>Our title</th><th>Site song</th><th>What was done</th><th>Scores</th></tr>{dz}</table></div>
<h2 id="books">Books after the update</h2>
<div class="tbl-wrap"><table><tr><th>Book</th><th>Songs</th></tr>{bk_rows}</table></div>
</body></html>"""
    with open(os.path.join(EXP, 'cantaricrestine-report.html'), 'w', encoding='utf8') as f:
        f.write(doc)


def load_site():
    if not os.path.exists(SITE):
        print('no cached site data - downloading (tools/cantaricrestine.py)')
        import cantaricrestine
        cantaricrestine.main([])
    with open(SITE, encoding='utf8') as f:
        raw = json.load(f)
    site = {}
    for cat, v in raw.items():
        site[cat] = [SiteSong(r) for r in v['songs']]
    return site


def main(fresh=False):
    site = load_site()
    missing = [c for c in CE_CATS + OTHER_CATS if c not in site]
    if missing: print('WARNING: categories missing from the cache:', missing)
    books = load_books(fresh)
    order0 = list(books)
    run = Run(books, site)
    run.step_ce();            print('step 1 (CE) done', len(run.changed))
    run.step_categories();    print('step 2 (categories) done', len(run.changed))
    run.step_check_books();   print('step 4 (other books) done', len(run.changed))
    run.step_altele();        print('step 3 (Altele) done', len(run.changed))
    order = order0 + [b for b in run.created if b not in order0]
    finalize_and_write(books, order, run.created)
    per_book = collections.Counter(run.bname(c['book']) for c in run.changed)
    nf_book = collections.Counter(r[0] for r in run.notfound)
    t4c = collections.Counter(r[0] for r in run.not_in_ce)
    counts = {
        'changed_songs': len(run.changed), 'changed_by_book': dict(per_book),
        'identical_text_skipped': {run.bname(k): v for k, v in run.identical.items()},
        'not_found': len(run.notfound), 'not_found_by_book': dict(nf_book),
        'actions': len(run.actions), 'actions_by_type': dict(collections.Counter(a for a, _, _ in run.actions)),
        'site_songs_not_in_ce': len(run.not_in_ce), 'site_songs_not_in_ce_by_category': dict(t4c),
        'books_created': {books[b]['name']: len(books[b]['songs']) for b in run.created},
        'books_merged': {run.bname(b): {'category': c, 'songs': len(books[b]['songs'])} for c, b in run.book_of_cat.items() if b not in run.created},
        'books': {books[b]['name']: len(books[b]['songs']) for b in order},
        'doubtful_matches': len(run.doubt),
        'site_songs_cached': {c: len(v) for c, v in site.items()},
        'category_vs_book_matrix': [dict(zip(('category', 'book', 'our_songs', 'matched', 'same_number'), r)) for r in getattr(run, 'match_matrix', [])],
    }
    counts['display'] = [('Changed songs (table 1)', len(run.changed))] + \
        [(f'  – {k}', v) for k, v in per_book.items()] + \
        [('Found on the site with the same text (left alone)', sum(run.identical.values())),
         ('Not found on the site (table 2)', len(run.notfound))] + \
        [(f'  – {k}', v) for k, v in nf_book.items()] + \
        [('Books merged / created / songs moved from Altele (table 3)', len(run.actions)),
         ('Songs in cr/cn/ca not in our CE book (table 4)', len(run.not_in_ce)),
         ('Matches to double-check', len(run.doubt))]
    write_report(run, counts)
    with open(os.path.join(EXP, 'cantaricrestine-summary.json'), 'w', encoding='utf8') as f:
        json.dump({k: v for k, v in counts.items() if k != 'display'}, f, ensure_ascii=False, indent=1)
    with open(os.path.join(WORK, 'doubtful.json'), 'w', encoding='utf8') as f:
        json.dump(run.doubt, f, ensure_ascii=False, indent=1)
    for k, v in counts.items():
        if k not in ('display', 'category_vs_book_matrix'): print(k, v)
    for r in counts['category_vs_book_matrix']:
        if r['matched']: print('  ', r)
    return run


if __name__ == '__main__':
    main()
