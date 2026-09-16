#!/usr/bin/env python3
"""Splice the new marketing site into index.html.

Everything the portal, the estimator iframes and the AI chat depend on is
left byte-for-byte; only the marketing shell (theme block, marketing markup,
and the scoped style blocks for retired sections) is replaced.

Anchored on markers rather than line numbers so it can be re-run.
"""
import re, sys, io, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'index.html'
SITE = ROOT / 'site'

html = SRC.read_text(encoding='utf-8')
if 'site/site.css' in html:
    sys.exit('index.html already carries the new site; run against a clean checkout')

def between(s, start, end, incl_end=True):
    i = s.index(start); j = s.index(end, i)
    return s[i: j + (len(end) if incl_end else 0)]

def cut(s, start, end, incl_end=True):
    i = s.index(start); j = s.index(end, i) + (len(end) if incl_end else 0)
    return s[:i], s[i:j], s[j:]

# ---------- head ----------
head, body, tail = cut(html, '<head>', '</head>')
# fonts: Geist only (Newsreader and Inter were the old theme)
head_new = re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?family=Newsreader[^"]*" rel="stylesheet">',
                  '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">', body)
assert 'family=Newsreader' not in head_new
# replace the base theme block
i = head_new.index('<style>\n/* ==== BuilderPro OS'); j = head_new.index('</style>', i) + len('</style>')
base = (SITE / 'base.css').read_text(encoding='utf-8')
head_new = head_new[:i] + '<style>\n' + base + '\n</style>\n<link rel="stylesheet" href="site/site.css">\n' \
    + '<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>\n' \
    + head_new[j:]
head_new = head_new.replace('<title>BuilderPro OS — Book more roofing jobs, on autopilot</title>', '<title>BuilderPro OS. Software for contractors, reimagined.</title>')
head_new = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="BuilderPro OS is the operating system for contractors: Lisa answers every call, jobs run from estimate to invoice, and your numbers stay in one login. Built for every trade.">', head_new, count=1)
html = head + head_new + tail

# ---------- body: top ----------
# keep the hidden svg defs, drop everything from the announcement bar to the estimator
pre, defs, rest = cut(html, '<body>', '<div class="bar">', incl_end=False)
defs = defs.replace('<body>', '<body class="dl">')
_, _drop, rest = cut(rest, '<div class="bar">', '<section id="estimator">', incl_end=False)
# two scoped style blocks in the dropped range are still needed: the Lisa
# chat panel and the estimator carousel shell. Carry them forward.
keep_css = ''
for marker in ('/* Lisa blob + inline chat */', '/* ==== estimator ==== */'):
    m = re.search(r'<style>\n' + re.escape(marker) + r'.*?</style>', _drop, flags=re.S)
    assert m, marker
    keep_css += m.group(0) + '\n'
top = (SITE / 'body-top.html').read_text(encoding='utf-8')
html = pre + defs + keep_css + top + rest

# ---------- estimator: keep. custom-calculator: drop. models: keep. ----------
# drop the custom-calculator section wholesale (its idea now lives in the models note)
a, _cc, rest = cut(html, '<section class="cc-sec" id="custom-calculator">', '</section>')
html = a + rest
# the style block right before it is the cc CTA css; remove it too if it sits alone
html = re.sub(r'<style>\n/\* build a custom calculator \*/.*?</style>\n', '', html, count=1, flags=re.S)

# models heading copy
html = html.replace('<span class="eye">Your website, done for you</span>\n      <h2>Four model sites, <em>built to convert</em></h2>',
                    '<h2>Need a website? <em>Add one for $49 a month.</em></h2>')
html = html.replace('<p>Every BuilderPro plan includes a custom website built on one of our battle-tested contractor models — then tailored to your brand, photos, and services. Pick a direction; we handle the rest.</p>',
                    '<p>Pick one of four contractor models. We tailor it to your brand, photos and services, then host and maintain it, on top of any plan. Already have a site you like? Keep it and embed the calculator and booking page.</p>')
html = html.replace("Don’t see your trade? Every model adapts — painting, concrete, solar, fencing and more.",
                    "Don't see your trade? Every model adapts: painting, concrete, solar, fencing, electrical and more. Need a calculator or 3D configurator for something else? We build those too.")
html = html.replace('<a href="#pricing" style="color:var(--blue);font-weight:600">Included in every plan →</a>', '<a href="#pricing" style="color:var(--blue);font-weight:600">See plans</a>')

# ---------- pricing: replace section, keep the plan modal ----------
a, old_pricing, rest = cut(html, '<section id="pricing">', '</section>')
hrefs = re.findall(r'href="(mailto:[^"]+)"', old_pricing)
assert len(hrefs) == 3, hrefs
b, modal, rest2 = cut(rest, '<!-- plan modal -->', '</div>\n</div>')
bottom = (SITE / 'body-bottom.html').read_text(encoding='utf-8')
bottom = bottom.replace('__HREF_FOUNDATION__', hrefs[0]).replace('__HREF_OS__', hrefs[1]).replace('__HREF_ENTERPRISE__', hrefs[2])
bottom = bottom.replace('__PLAN_MODAL__', modal)

# ---------- booking .. footer + legal overlays: replace ----------
# grab the FAQ items from the old markup first
# now cut from the old booking section through the end of the terms overlay
c, _old_tail, rest3 = cut(rest2, '<section id="booking">', '<div class="legal-page" id="terms">', incl_end=False)
_, _terms, rest3 = cut(rest3, '<div class="legal-page" id="terms">', '</div>\n</div>')
# the divider that preceded booking is part of c; strip trailing dividers
c = re.sub(r'(<div class="divider"></div>\s*)+$', '', c)
html = a + c + bottom + rest3

# ---------- odds and ends ----------
html = html.replace('<div class="divider"></div>', '')
html = html.replace('<script src="https://link.msgsndr.com/js/form_embed.js" type="text/javascript"></script>\n', '')
# no em dashes in visible marketing copy (kept FAQ, estimator and model text still had them)
m0 = html.index('<main id="main"'); m1 = html.index('</main>', m0)
e0 = html.index('<section id="estimator">', m0); e1 = html.index('</section>', html.index('<div class="est-cdots"', e0)) + len('</section>')
def dedash(t): return re.sub(r'\s+—\s+', ', ', t).replace('—', ', ')
# inside the estimator section, clean the visible chrome but leave every
# srcdoc attribute (a whole embedded document each) exactly as it was
est_parts = re.split(r'(srcdoc="[^"]*")', html[e0:e1])
est = ''.join(part if part.startswith('srcdoc="') else dedash(part) for part in est_parts)
html = html[:m0] + dedash(html[m0:e0]) + est + dedash(html[e1:m1]) + html[m1:]
# the old scroll handler expects #nav to exist; it does (the brand card). Emojis out of the AI card.
html = html.replace('📞 ', '').replace('💬 ', '')
# behaviour script, loaded after the marketing JS so bpOpenPortal exists
html = html.replace('</body>', '<script src="site/site.js"></script>\n</body>', 1) if html.count('</body>') == 1 else html
if 'site/site.js' not in html:
    # the file ends with the portal script; append before the final </html>
    k = html.rindex('</html>')
    html = html[:k] + '<script src="site/site.js"></script>\n' + html[k:]

SRC.write_text(html, encoding='utf-8')
print('assembled:', len(html), 'bytes')
