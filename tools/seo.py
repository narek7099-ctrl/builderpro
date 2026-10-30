"""Search and sharing tags for builderpro-os.com. Re-runnable.

  - share image (og:image, twitter:image) on every public page: the cards in
    assets/og (made by tools/og-cards.js), one per trade
  - structured data (JSON-LD) that tells Google what each page is:
      homepage   the company, the software with its three plan prices, and
                 the FAQ (read from the homepage itself, so they stay in step)
      trade and compare pages   where the page sits (Home > page) and the software
      cost calculators          a free calculator
  - Open Graph tags on the homepage, a canonical link where one is missing
  - sitemap.xml: every page that isn't marked noindex, dated by its last commit

Everything it adds sits between <!--seo--> markers. Run it last, after
site/assemble.py, tools/marketing-pages.py and tools/compare-pages.py:
    python3 tools/seo.py
"""
import datetime, glob, html, json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://builderpro-os.com'
TRADES = ['roofing', 'hvac', 'plumbing', 'electrical', 'painting', 'landscaping', 'concrete', 'remodeling']
WORD = {'roof': 'roofing', 'roofers': 'roofing', 'countertop': 'countertops', 'pool': 'pools', 'trim': 'trim'}
CALC_CARD = {'roofing': 'roofing-calc', 'hvac': 'hvac-calc', 'painting': 'painting-calc', 'landscaping': 'landscaping-calc',
             'countertops': 'countertops', 'pools': 'pools', 'trim': 'trim'}


def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def text(s): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
def ld(obj): return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '</script>'
def noindex(s): return bool(re.search(r'<meta name="robots" content="[^"]*noindex', s))


def plans():
    s = read('index.html'); a = s.index('<!-- site:bottom -->')
    found = re.findall(r'class="pl_name">([^<]+)<.{0,400}?\$(\d+)', s[a:a + 30000], re.S)[:3]
    assert len(found) == 3, 'plan prices not found on the homepage'
    return found


ORG = {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'BuilderPro', 'url': SITE + '/',
       'logo': SITE + '/assets/brand/logo-mark-256.png', 'email': 'support@builderpro-os.com'}


def software():
    return {'@type': 'SoftwareApplication', '@id': SITE + '/#software', 'name': 'BuilderPro OS',
            'applicationCategory': 'BusinessApplication', 'operatingSystem': 'Web',
            'description': 'Simple software for growing contractors: Lisa, an AI receptionist that answers every call and text, plus estimates, jobs, invoices and payments.',
            'publisher': {'@id': SITE + '/#org'},
            'offers': [{'@type': 'Offer', 'name': n, 'price': p, 'priceCurrency': 'USD', 'url': SITE + '/#pricing',
                        'priceSpecification': {'@type': 'UnitPriceSpecification', 'price': p, 'priceCurrency': 'USD', 'unitText': 'MONTH'}}
                       for n, p in plans()]}


def faq(s):
    qa = re.findall(r'<button class="qa-q" type="button">(.*?)<span class="pm"></span></button><div class="qa-a">(.*?)</div>', s, re.S)
    return {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': text(q),
            'acceptedAnswer': {'@type': 'Answer', 'text': text(a)}} for q, a in qa]}


def kind(name):
    """(share card, page type, trade) for a page"""
    if name == 'index.html': return 'default', 'home', None
    if name == 'compare.html' or name.endswith('-alternative.html'): return 'compare', 'compare', None
    words = re.split(r'[-.]', name)
    trade = next((WORD.get(w, w) for w in words if WORD.get(w, w) in TRADES + ['countertops', 'pools', 'trim']), None)
    if name == 'missed-call-text-back.html': trade = 'roofing'
    if name.endswith('-cost-calculator.html') or name == 'roof-estimator-tool.html':
        return CALC_CARD.get(trade, 'default'), 'calc', trade
    if trade: return trade, 'trade', trade
    return 'default', 'other', None


def block(name, s):
    card, k, trade = kind(name)
    url = SITE + ('/' if name == 'index.html' else '/' + name)
    title = text(re.search(r'<title>(.*?)</title>', s, re.S).group(1))
    m = re.search(r'<meta name="description" content="([^"]*)"', s)
    desc = html.unescape(m.group(1)) if m else ''
    img = SITE + '/assets/og/' + card + '.png'
    tags = []
    if 'rel="canonical"' not in s: tags.append('<link rel="canonical" href="%s">' % url)
    if 'property="og:title"' not in s:
        tags += ['<meta property="og:title" content="%s">' % html.escape(title),
                 '<meta property="og:description" content="%s">' % html.escape(desc),
                 '<meta property="og:type" content="website">', '<meta property="og:url" content="%s">' % url]
    if 'name="twitter:card"' not in s: tags.append('<meta name="twitter:card" content="summary_large_image">')
    tags += ['<meta property="og:site_name" content="BuilderPro">', '<meta property="og:image" content="%s">' % img,
             '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
             '<meta name="twitter:image" content="%s">' % img]
    h1 = re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S)
    crumb = {'@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': 1, 'name': 'BuilderPro', 'item': SITE + '/'},
        {'@type': 'ListItem', 'position': 2, 'name': (text(h1.group(1)) if h1 else title).rstrip('.'), 'item': url}]}
    graph = None
    if k == 'home':
        graph = [ORG, {'@type': 'WebSite', '@id': SITE + '/#site', 'url': SITE + '/', 'name': 'BuilderPro', 'publisher': {'@id': SITE + '/#org'}},
                 software(), faq(s[s.index('<!-- site:bottom -->'):s.index('<!-- /site:bottom -->')])]
    elif k in ('trade', 'compare'):
        graph = [crumb, ORG, software()]
    elif k == 'calc':
        graph = [crumb, ORG, {'@type': 'WebApplication', 'name': (text(h1.group(1)) if h1 else title).rstrip('.'), 'url': url + '#try',
                 'applicationCategory': 'UtilitiesApplication', 'operatingSystem': 'Web', 'isAccessibleForFree': True,
                 'description': desc, 'publisher': {'@id': SITE + '/#org'},
                 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}}]
    if graph: tags.append(ld({'@context': 'https://schema.org', '@graph': graph}))
    return '<!--seo-->\n' + '\n'.join(tags) + '\n<!--/seo-->\n'


def lastmod(name):
    try:
        d = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', name], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        dirty = subprocess.run(['git', 'status', '--porcelain', '--', name], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    except OSError: d, dirty = '', ''
    return datetime.date.today().isoformat() if dirty or not d else d


def main():
    pages, changed = [], 0
    for p in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(p); s = src = read(name)
        if noindex(s) or name.startswith('test-'): continue
        s = re.sub(r'<!--seo-->.*?<!--/seo-->\n', '', s, flags=re.S)
        i = s.index('</head>')
        s = s[:i] + block(name, s) + s[i:]
        if s != src: open(p, 'w', encoding='utf-8').write(s); changed += 1
        pages.append(name)
    def pri(n):
        k = kind(n)[1]
        return {'home': '1.0', 'calc': '0.9', 'trade': '0.8', 'compare': '0.8'}.get(k, '0.5')
    order = sorted(pages, key=lambda n: (-float(pri(n)), n))
    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    xml += ['  <url><loc>%s</loc><lastmod>%s</lastmod><priority>%s</priority></url>' % (SITE + ('/' if n == 'index.html' else '/' + n), lastmod(n), pri(n)) for n in order]
    xml.append('</urlset>\n')
    open(os.path.join(ROOT, 'sitemap.xml'), 'w').write('\n'.join(xml))
    print('%d pages tagged (%d changed), sitemap has %d' % (len(pages), changed, len(pages)))


if __name__ == '__main__':
    main()
