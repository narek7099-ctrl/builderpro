#!/usr/bin/env python3
"""Dress every estimator in the marketing site's design system.

embed-src/site-theme.html goes into all twelve calculators (embed-src/<trade>.html),
between markers, so re-running replaces it rather than stacking a second copy.

Then rebuild the public pages:

    python3 tools/inject-theme.py && python3 tools/build-embeds.py
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRADES = ['roofing', 'hvac', 'countertops', 'trim', 'painting', 'pools', 'landscaping',
          'plumbing', 'electrical', 'general', 'concrete', 'flooring']
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


for t in TRADES:
    p = os.path.join(ROOT, 'embed-src', t + '.html')
    doc, how = place(io.open(p, encoding='utf-8').read(), block)
    io.open(p, 'w', encoding='utf-8').write(doc)
    print('%-12s %s (embed-src)' % (t, how))
