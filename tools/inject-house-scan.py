#!/usr/bin/env python3
"""Put the house scan into the nine calculators other than roofing.

Each gets embed-src/house-scan.html plus a one-line HS_TRADE telling it which
ending to play, between markers so re-running replaces rather than stacks:
the six whose source is a srcdoc in index.html, and the three in embed-src/.

    python3 tools/build-house-scan.py
    python3 tools/inject-house-scan.py && python3 tools/inject-theme.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
INLINE = ['hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping']
STANDALONE = ['plumbing', 'electrical', 'general']
BEGIN, END = '<!--HS-BEGIN-->', '<!--HS-END-->'
engine = io.open(os.path.join(ROOT, 'embed-src', 'house-scan.html'), encoding='utf-8').read()


def block(t):
    return BEGIN + '<script>window.HS_TRADE="' + t + '";</script>' + engine + END


def place(doc, blk):
    if BEGIN in doc:
        i = doc.index(BEGIN); j = doc.index(END) + len(END)
        return doc[:i] + blk + doc[j:], 'replaced'
    # before the site theme if it is there, so the theme still comes last
    for mark in ('<!--ST-BEGIN-->', '</body>'):
        if mark in doc:
            i = doc.index(mark) if mark != '</body>' else doc.rindex(mark)
            return doc[:i] + blk + doc[i:], 'inserted'
    return doc + blk, 'appended'


s = io.open(SRC, encoding='utf-8').read()
for t in INLINE:
    key = '(function(){try{var CID=&quot;' + t + '&quot;'
    if key not in s:
        print('no estimator for', t); sys.exit(1)
    k = s.index(key)
    a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
    b = s.index('"></iframe>', k)
    doc, how = place(s[a:b], block(t).replace('&', '&amp;').replace('"', '&quot;'))
    s = s[:a] + doc + s[b:]
    print('%-12s %s (carousel source)' % (t, how))
io.open(SRC, 'w', encoding='utf-8').write(s)

for t in STANDALONE:
    p = os.path.join(ROOT, 'embed-src', t + '.html')
    doc, how = place(io.open(p, encoding='utf-8').read(), block(t))
    io.open(p, 'w', encoding='utf-8').write(doc)
    print('%-12s %s (embed-src)' % (t, how))
