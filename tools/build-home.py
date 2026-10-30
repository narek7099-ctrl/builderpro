#!/usr/bin/env python3
"""Make the homepage (index.html) from the app (app.html).

app.html is the source: the whole BuilderPro app plus the marketing site it
opens over (site/assemble.py splices the marketing regions into it). The
homepage is the same page without the app:

  * every <!--app-only--> ... <!--/app-only--> region is dropped (the portal's
    markup, its scripts and styles, the Supabase library, the noindex tag)
  * a forwarder goes first in <head>: any address that belongs to the app
    (?portal=1, a customer's #est= / #sign= / #pay= / #home= link, Find a pro,
    a password-reset or invite link, the store app) goes on to app.html with
    everything after the address kept
  * a few small stand-ins for what the marketing code borrowed from the app:
    Log in opens app.html, and the page-scroll lock

Never edit index.html by hand; edit app.html (or site/*) and run:
    python3 site/assemble.py      (which runs this, then tools/seo.py)
"""
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'app.html')
OUT = os.path.join(ROOT, 'index.html')

# Kept in step with what the app reads: the query keys and hash routes below.
FORWARD = r"""<script>
/* Built by tools/build-home.py from app.html: the homepage is app.html without
   the app. Addresses that belong to the app go on to it, keeping the rest of
   the address (customer links, sign-in links, the store app). */
(function(){try{
  var q=location.search,h=location.hash;
  if(/[?&](portal|app|aiteam|connected|mail|mailstart|google|add|found|pro|bpframe)=|[?&]source=(app|pwa)\b/i.test(q)
    ||/^#(home|est|sign|pay|my|pros|find-a-pro|payouts|qb)\b/i.test(h)
    ||/[#&](sign|est|home|pay|access_token|error|error_code)=|[#&]type=(recovery|invite|signup|magiclink)/i.test(h))
    location.replace('/app.html'+q+h);
}catch(e){}})();
</script>
"""

STANDINS = r"""<script>
/* Stand-ins for the few app pieces the marketing code uses (tools/build-home.py) */
var BP_URL="https://ttzwzouhiwdwamuimhpo.supabase.co";
var BP_ANON="__ANON__";
function bpSyncLock(){var open=document.querySelector('.modal-ov.open');document.body.style.overflow=open?'hidden':'';}
window.bpSyncLock=bpSyncLock;
window.addEventListener('pageshow',bpSyncLock);
function bpOpenPortal(){location.href='/app.html?portal=1';}
window.bpOpenPortal=bpOpenPortal;
</script>
"""


def build():
    s = io.open(SRC, encoding='utf-8').read()
    anon = re.search(r'var BP_ANON="([^"]+)"', s).group(1)
    n = s.count('<!--app-only-->')
    assert n and n == s.count('<!--/app-only-->'), 'app-only markers are unbalanced in app.html'
    s = re.sub(r'<!--app-only-->.*?<!--/app-only-->\n?', '', s, flags=re.S)
    assert 'id="bpx"' not in s and 'CLIENT PORTAL ====' not in s, 'app code is still in the homepage'
    head = '<head>\n'
    assert head in s
    s = s.replace(head, head + FORWARD, 1)
    # the stand-ins go right before the first marketing script that needs them
    k = s.index('<script>\n/* ---- basics ---- */')
    s = s[:k] + STANDINS.replace('__ANON__', anon) + s[k:]
    io.open(OUT, 'w', encoding='utf-8').write(s)
    return n, len(s)


if __name__ == '__main__':
    n, size = build()
    print('index.html: %d app-only regions removed, %d KB' % (n, size // 1024))
