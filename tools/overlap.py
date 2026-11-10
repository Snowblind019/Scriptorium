import sys, glob, os
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from difflib import SequenceMatcher
apk = load_apk()
apkfp = [(s, fingerprint(s), first_words(s)) for s in apk]
def best(song):
    fp = fingerprint(song); fw = first_words(song)
    bs, bscore = None, 0
    for a, afp, afw in apkfp:
        if not fp or not afp: continue
        j = len(fp & afp) / len(fp | afp)
        if j > bscore: bs, bscore = a, j
    fwr = SequenceMatcher(None, fw, first_words(bs)).ratio() if bs else 0
    return bs, bscore, fwr
dbs = {}
for f in sorted(glob.glob(ROOT + '/database/*.sps')):
    name = os.path.basename(f)[:-4]
    book, songs = load_sps(f)
    hits = 0; numsame = 0; rows = []
    for s in songs:
        b, j, fw = best(s)
        m = j > 0.45 or fw > 0.75
        hits += m
        if m and b['number'] == s['number']: numsame += 1
        rows.append((s['number'], s['title'], b['number'] if b else None, b['title'] if b else '', round(j,2), round(fw,2), m))
    dbs[name] = rows
    print(f"{name:10} {book} songs={len(songs)} matchAPK={hits} sameNumber={numsame}")
import json
json.dump(dbs, open(SCR + '/overlap.json', 'w', encoding='utf8'), ensure_ascii=False, indent=0)
