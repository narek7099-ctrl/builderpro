#!/usr/bin/env python3
"""Splice the marketing site into index.html. Re-runnable.

index.html also carries the estimator, the model sites, the plan modal, the
Lisa chat and the whole portal. Those are left byte-for-byte. Only two
regions are replaced, each bracketed by markers once this has run once:

  <!-- site:top -->    ... <!-- /site:top -->     nav, menu, drawer, hero .. Lisa
  <!-- site:bottom --> ... <!-- /site:bottom -->  pricing .. footer, </main>

On a file that has never been spliced, the legacy anchors are used instead
(the skip link .. <section id="estimator">, and the pricing section .. </main>).
The plan modal inside the bottom region is carried forward unchanged.

The head gets the fonts and the vendored GSAP + Lenis; the version query on
site assets is bumped every run so browsers fetch the new files.
"""
import re, sys, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'index.html'
SITE = ROOT / 'site'
VER = datetime.date.today().strftime('%Y%m%d') + ('-' + sys.argv[1] if len(sys.argv) > 1 else '')

html = SRC.read_text(encoding='utf-8')

def region(s, start, end, incl_end):
    i = s.index(start)
    j = s.index(end, i) + (len(end) if incl_end else 0)
    return i, j

# ---------- top ----------
if '<!-- site:top -->' in html:
    a, b = region(html, '<!-- site:top -->', '<!-- /site:top -->', True)
else:
    a, b = region(html, '<a class="dl-skip"', '<section id="estimator">', False)
top = (SITE / 'body-top.html').read_text(encoding='utf-8').rstrip('\n')
html = html[:a] + top + '\n' + html[b:].lstrip('\n')

# ---------- bottom ----------
if '<!-- site:bottom -->' in html:
    a, b = region(html, '<!-- site:bottom -->', '<!-- /site:bottom -->', True)
else:
    a = html.index('<section id="pricing"')
    a = html.rindex('<!-- ===== PRICING ===== -->', 0, a)
    b = html.index('</main>', a) + len('</main>')
old = html[a:b]
m = re.search(r'<!-- plan modal -->.*?</div>\n</div>', old, flags=re.S)
assert m, 'plan modal not found in the bottom region'
bottom = (SITE / 'body-bottom.html').read_text(encoding='utf-8').rstrip('\n').replace('__PLAN_MODAL__', m.group(0))
html = html[:a] + bottom + html[b:]

# ---------- head ----------
fontshare = '<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap">'
if 'api.fontshare.com' not in html:
    k = html.index('<link href="https://fonts.googleapis.com/css2?family=Geist')
    html = html[:k] + fontshare + '\n' + html[k:]
html = re.sub(r'<link rel="stylesheet" href="site/site\.css(\?v=[^"]*)?">', '<link rel="stylesheet" href="site/site.css?v=%s">' % VER, html, count=1)
html = re.sub(r'\{"imports":\{"three":"\./site/vendor/three\.module\.min\.js(\?v=[^"]*)?"\}\}',
              '{"imports":{"three":"./site/vendor/three.module.min.js?v=%s"}}' % VER, html, count=1)

# ---------- scripts ----------
scripts = ''.join('<script src="site/vendor/%s?v=%s"></script>\n' % (f, VER) for f in ('lenis.min.js', 'gsap.min.js', 'ScrollTrigger.min.js', 'SplitText.min.js'))
scripts += '<script src="site/site.js?v=%s"></script>\n' % VER
html = re.sub(r'(<script src="site/vendor/(lenis|gsap|ScrollTrigger|SplitText)\.min\.js[^"]*"></script>\n)+<script src="site/site\.js[^"]*"></script>\n', scripts, html, count=1)
assert 'site/site.js?v=' + VER in html, 'script block not found'

# the hero module import in site.js carries its own version query
js = SITE / 'site.js'
js.write_text(re.sub(r"'\./hero3d\.js(\?v=[^']*)?'", "'./hero3d.js?v=%s'" % VER, js.read_text(encoding='utf-8')), encoding='utf-8')

SRC.write_text(html, encoding='utf-8')
print('assembled:', len(html), 'bytes, version', VER)
