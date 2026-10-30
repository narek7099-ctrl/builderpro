#!/usr/bin/env python3
"""Build new.html, the preview of the new homepage, from index.html.

new.html is the live homepage with three changes, so the preview always shows
today's real content:
  - the new nav (site/present-nav.html) right after the old one, which
    site/present.css hides
  - site/present.css and site/present.js (presentation-style scrolling)
  - no Lenis smooth scroll (present.js moves the page itself), and noindex
Run after any homepage change:  python3 tools/make-preview.py
"""
import re, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
V = datetime.datetime.now().strftime('%Y%m%d%H%M')

nav = (ROOT / 'site' / 'present-nav.html').read_text(encoding='utf-8')
i = html.index('<nav class="navbar"'); j = html.index('</nav>', i) + len('</nav>')
html = html[:j] + '\n' + nav + html[j:]

html, n = re.subn(r'<script src="site/vendor/lenis\.min\.js[^"]*"></script>\n', '', html)
assert n == 1, 'lenis script not found'
html, n = re.subn(r'(<link rel="stylesheet" href="site/site\.css[^"]*">)', r'\1\n<link rel="stylesheet" href="site/present.css?v=%s">' % V, html, count=1)
assert n == 1, 'site.css link not found'
html, n = re.subn(r'(<script src="site/site\.js[^"]*"></script>\n)', r'\1<script src="site/present.js?v=%s"></script>\n' % V, html, count=1)
assert n == 1, 'site.js script not found'
html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex">', 1)
(ROOT / 'new.html').write_text(html, encoding='utf-8')
print('wrote new.html', len(html))
