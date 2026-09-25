#!/usr/bin/env python3
"""Dress every estimator in the marketing site's design system.

embed-src/site-theme.html goes into all ten calculators, between markers, so
re-running replaces it rather than stacking a second copy:

  * the seven whose source is an <iframe srcdoc> on the marketing carousel
    in index.html (escaped for the attribute), and
  * the three whose source is a whole file in embed-src/.

Then rebuild the public pages:

    python3 tools/inject-theme.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'index.html')
INLINE = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping']
STANDALONE = ['plumbing', 'electrical', 'general']
BEGIN, END = '<!--ST-BEGIN-->', '<!--ST-END-->'

theme = io.open(os.path.join(ROOT, 'embed-src', 'site-theme.html'), encoding='utf-8').read()
block = BEGIN + theme + END


def place(doc, blk):
    if BEGIN in doc:
        i = doc.index(BEGIN); j = doc.index(END) + len(END)
        return doc[:i] + blk + doc[j:], 'replaced'
    if '</body>' in doc:
        i = doc.rindex('</body>')
        return doc[:i] + blk + doc[i:], 'inserted'
    return doc + blk, 'appended'


s = io.open(SRC, encoding='utf-8').read()
# inside a double-quoted attribute only & and " need escaping
esc = block.replace('&', '&amp;').replace('"', '&quot;')
for t in INLINE:
    key = '(function(){try{var CID=&quot;' + t + '&quot;'
    if key not in s:
        print('no estimator for', t, 'in index.html'); sys.exit(1)
    k = s.index(key)
    a = s.rfind('srcdoc="', 0, k) + len('srcdoc="')
    b = s.index('"></iframe>', k)
    doc, how = place(s[a:b], esc)
    s = s[:a] + doc + s[b:]
    print('%-12s %s (carousel source)' % (t, how))
io.open(SRC, 'w', encoding='utf-8').write(s)

for t in STANDALONE:
    p = os.path.join(ROOT, 'embed-src', t + '.html')
    doc, how = place(io.open(p, encoding='utf-8').read(), block)
    io.open(p, 'w', encoding='utf-8').write(doc)
    print('%-12s %s (embed-src)' % (t, how))
