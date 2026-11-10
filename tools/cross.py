import sys, glob, os
sys.path.insert(0, os.path.dirname(__file__))
from common import *
from difflib import SequenceMatcher
books = {'APK': load_apk()}
for f in sorted(glob.glob(ROOT + '/database/*.sps')):
    books[os.path.basename(f)[:-4]] = load_sps(f)[1]
idx = []
for b, ss in books.items():
    for s in ss:
        idx.append((b, s, fingerprint(s), first_words(s, 8), norm(s['title'])))
def score(x, y):
    j = len(x[2] & y[2]) / max(1, len(x[2] | y[2]))
    fw = SequenceMatcher(None, x[3], y[3]).ratio()
    return j, fw
def is_match(j, fw): return j > 0.45 or (fw > 0.8 and j > 0.25)
for b in ['sion', 'cint evan', 'seceris', 'laude']:
    print('=====', b, 'unmatched vs APK -> best in any other book')
    for x in [i for i in idx if i[0] == b]:
        apkbest = max(((score(x, y), y) for y in idx if y[0] == 'APK'), key=lambda t: t[0][0] + t[0][1])
        if is_match(*apkbest[0]): continue
        others = sorted(((score(x, y), y) for y in idx if y[0] not in ('APK', b)), key=lambda t: -(t[0][0] + t[0][1]))[:1]
        o = others[0]
        print(x[1]['number'], x[1]['title'], '| APK:', apkbest[1][1]['number'], apkbest[1][1]['title'], [round(v, 2) for v in apkbest[0]], '| other:', o[1][0], o[1][1]['number'], o[1][1]['title'], [round(v, 2) for v in o[0]])
