import re, sqlite3, glob, os, unicodedata
import xml.etree.ElementTree as ET

import zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # project folder
SCR = os.path.join(ROOT, 'tools', '_work')                               # downloads / unpacked APK
os.makedirs(SCR, exist_ok=True)
APK_GLOB = os.path.join(ROOT, '*.apk')

def norm(s):
    s = s.lower()
    s = s.replace('â', 'i').replace('î', 'i')
    s = ''.join(ch for ch in unicodedata.normalize('NFD', s) if unicodedata.category(ch) != 'Mn')
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def clean_text(t):
    t = t.replace('\r', '').replace('\u2010', '-').replace('\u2011', '-')
    return t

HDR = re.compile(r'^\s*(verse|refrain|chorus|bridge)\s*(\d+)?\s*[:\-]?\s*$', re.I)

def strip_num(line):
    return re.sub(r'^\s*\d+\s*[.)]\s*', '', line)

def parse_sps_text(text):
    """Return list of sections {type,text}"""
    text = clean_text(text)
    secs = []
    cur = None
    for line in text.split('\n'):
        m = HDR.match(line)
        if m:
            kind = m.group(1).lower()
            cur = {'type': 'chorus' if kind in ('refrain', 'chorus') else ('bridge' if kind == 'bridge' else 'verse'), 'lines': []}
            secs.append(cur)
            continue
        if cur is None:
            cur = {'type': 'verse', 'lines': []}
            secs.append(cur)
        cur['lines'].append(line.rstrip())
    out = []
    for s in secs:
        lines = s['lines']
        while lines and not lines[0].strip(): lines.pop(0)
        while lines and not lines[-1].strip(): lines.pop()
        if not lines: continue
        lines[0] = strip_num(lines[0])
        lines = [re.sub(r'^\s*R\s*:\s*', '', l) if s['type'] == 'chorus' else l for l in lines]
        out.append({'type': s['type'], 'text': '\n'.join(l.strip() for l in lines)})
    return out

def load_sps(path):
    c = sqlite3.connect(path)
    book = c.execute('select title, info from SongBook').fetchone()
    songs = []
    for num, title, cat, tune, words, music, text, notes in c.execute(
            'select number,title,category,tune,words,music,song_text,notes from Songs order by number'):
        songs.append({'number': num, 'title': (title or '').strip(), 'tune': tune or '', 'words': words or '',
                      'music': music or '', 'notes': notes or '', 'sections': parse_sps_text(text or '')})
    return book, songs

def join_wrapped(t):
    # APK text is wrapped from a printed book: join wrapped lines into one paragraph
    lines = [l.strip() for l in t.replace('\r', '').split('\n') if l.strip()]
    return ' '.join(lines)

DIVINE = set('''te tu ți ție tine tău ta tale tăi lui lu el său sa sale săi domnul domn domnului dumnezeu dumnezeul
isus isuse iisus cristos cristoase hristos duhul duhule tatăl tată tatăl fiul mielul mântuitorul mântuitor împăratul cel
cuvântul numele golgota calvar ceru cer îl îi i el'''.split())

def poetic_lines(t):
    """The APK text is one paragraph per verse. Hymn lines start with a capital letter after
    punctuation, so break there - except before capitalised divine pronouns/names (Te, Lui, Domnul…)."""
    out, cur = [], ''
    for tk in re.split(r'(?<=[,;.!?:])\s+', t):
        m = re.match(r"[(:/\s„“\"'‘«]*([\w\-‐']+)", tk)
        first = m.group(1) if m else ''
        key = first.split('-')[0].lower()
        if cur and first[:1].isupper() and key not in DIVINE and first.lower() not in DIVINE:
            out.append(cur); cur = tk
        else:
            cur = (cur + ' ' + tk).strip()
    if cur: out.append(cur)
    return '\n'.join(out)

def apk_xml():
    p = os.path.join(SCR, 'apk', 'res', 'raw', 'songs.xml')
    if not os.path.exists(p):
        apks = glob.glob(APK_GLOB)
        if not apks: raise SystemExit('Put the Cantarile Evangheliei .apk in the project folder')
        with zipfile.ZipFile(apks[0]) as z:
            z.extract('res/raw/songs.xml', os.path.join(SCR, 'apk'))
    return p

def load_apk():
    r = ET.parse(apk_xml()).getroot()
    songs = []
    for s in r.findall('song'):
        secs = []
        for c in s.find('verses'):
            secs.append({'type': 'chorus' if c.tag == 'chorus' else 'verse', 'text': poetic_lines(join_wrapped(c.text or ''))})
        a = s.attrib
        songs.append({'number': int(a['id']), 'title': clean_text(a['title']).replace('\u2010', '-'),
                      'key': '' if a.get('key') == '-' else a.get('key', ''),
                      'tempo': '' if a.get('tempo') == '-' else a.get('tempo', ''),
                      'info': a.get('info', ''), 'sections': secs})
    fix_apk_title_shift(songs)
    return songs

def fix_apk_title_shift(songs):
    """In the Android app's data, songs 1011-1049 have their titles (and key/tempo/info) one number too
    early: the lyrics stored at N belong to the title stored at N-1 (confirmed by the SoftProjector
    'sion' book: 1013 = "Vreau lîngă Domnul meu", 1023 = "De-ai luat pe umăr crucea"). The lyrics of 1011
    are missing and its title was pushed to 1049 ("O, cît-îi de greu"). Move each title to its lyrics."""
    by = {s['number']: s for s in songs}
    if not (1011 in by and 1049 in by and norm(by[1013]['sections'][0]['text']).startswith('vreau l')
            and norm(by[1012]['title']).startswith('vreau l')):
        return   # data already fixed or different
    meta = {n: {k: by[n][k] for k in ('title', 'key', 'tempo', 'info')} for n in range(1011, 1050)}
    for n in range(1012, 1050):
        by[n].update(meta[n - 1])
    by[1011].update(meta[1049])   # "O, cît-îi de greu" – lyrics missing in the app data

def first_words(song, n=12):
    txt = ' '.join(s['text'] for s in song['sections'] if s['type'] == 'verse') or ' '.join(s['text'] for s in song['sections'])
    return ' '.join(norm(txt).split()[:n])

def fingerprint(song):
    return set(norm(' '.join(s['text'] for s in song['sections'])).split())
