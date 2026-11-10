"""Find songs whose title does not belong to their lyrics (e.g. titles shifted by one in the CE app data)."""
import json, glob, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import norm

def toks(s): return [w for w in norm(s).split() if len(w) > 1]
def text_of(s): return ' '.join(x['text'] for x in s.get('sections', []))
def score(title, song):
    """share of title words found (as word prefixes) in the lyrics, with a bonus when they start the first line"""
    tt = toks(title)
    if not tt or not song.get('sections'): return None
    body = ' ' + norm(text_of(song)) + ' '
    hit = sum(1 for w in tt if (' ' + w[:max(3, len(w) - 2)]) in body)
    return hit / len(tt)

def analyse(path):
    d = json.load(open(path, encoding='utf8'))
    S = d['songs']
    bad = []
    for i, s in enumerate(S):
        sc = score(s['title'], s)
        if sc is None or sc >= 0.6: continue
        # does the title belong to a neighbour's lyrics?
        near = []
        for j in range(max(0, i - 3), min(len(S), i + 4)):
            if j == i: continue
            sj = score(s['title'], S[j])
            if sj is not None and sj >= 0.8: near.append((j - i, S[j]['number']))
        bad.append((s['number'], s['title'], round(sc, 2), near, norm(text_of(s))[:60]))
    return d['name'], len(S), bad

if __name__ == '__main__':
    for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__), '..', 'app', 'data', 'songs', '*.json'))):
        name, n, bad = analyse(f)
        shifted = [b for b in bad if b[3]]
        print(f'{name:32} songs={n:5} title-not-in-lyrics={len(bad):4} (title found in a neighbour: {len(shifted)})')
