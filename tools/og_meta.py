"""Social-preview (Open Graph / Twitter card) tags and images for the public
embed pages, so a link pasted into Facebook, X, LinkedIn, Nextdoor or a text
message renders a card instead of a bare URL.

Used by tools/build-checkers.py (which build-embeds.py runs at the end):

    embed/og/<tool>-<trade>.png   1200x630 card image, tool = quote|health|damage
    <!--OG-BEGIN--> ... <!--OG-END-->   tags in every embed/<page>.html head

The copy here mirrors BP_TOOL_COPY in index.html (the portal's share panel);
keep the two in step. Images need Pillow; without it the PNGs that already
exist are kept and the tags still point at them.
"""
import html, io, os, re

SITE = 'https://builderpro-os.com'

# what the quote calculator prices, in a homeowner's words
QUOTE_NOUN = {'roofing': 'roof', 'hvac': 'HVAC', 'countertops': 'countertop', 'trim': 'trim carpentry',
              'painting': 'painting', 'pools': 'pool', 'landscaping': 'landscaping', 'plumbing': 'plumbing',
              'electrical': 'electrical', 'general': 'remodel', 'concrete': 'driveway', 'flooring': 'flooring'}


def copy(tool, trade, name):
    """(title, headline, description) for a tool on a trade."""
    if tool == 'quote':
        h = 'Get your instant %s quote in 60 seconds' % QUOTE_NOUN.get(trade, trade)
        return ('Instant %s Quote' % name, h,
                'Answer a few quick questions and see a real price range for your project. Free, no sign-up.')
    if tool == 'health':
        n = 'HVAC' if trade == 'hvac' else QUOTE_NOUN.get(trade, trade)
        return ('%s Health Check' % name, 'Free 45-second %s health check' % n,
                'Six quick questions, an instant health score, what to fix first and what it should cost.')
    return ('%s Damage Check' % name, 'Snap a photo, get a damage report',
            'Upload a photo of the damage and get severity, likely cause, insurance hints and a repair estimate.')


def head(tool, trade, name, page):
    title, h, d = copy(tool, trade, name)
    img = '%s/embed/og/%s-%s.png' % (SITE, tool, trade)
    e = lambda s: html.escape(s, quote=True)
    return ('<!--OG-BEGIN--><meta name="description" content="%(d)s">'
            '<meta property="og:type" content="website"><meta property="og:site_name" content="BuilderPro">'
            '<meta property="og:title" content="%(h)s"><meta property="og:description" content="%(d)s">'
            '<meta property="og:url" content="%(u)s"><meta property="og:image" content="%(i)s">'
            '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
            '<meta property="og:image:alt" content="%(t)s">'
            '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="%(h)s">'
            '<meta name="twitter:description" content="%(d)s"><meta name="twitter:image" content="%(i)s"><!--OG-END-->'
            ) % dict(t=e(title), h=e(h), d=e(d), u=e('%s/embed/%s' % (SITE, page)), i=e(img))


def inject(doc, tag):
    """Put the tags in a page's head, replacing any earlier copy."""
    doc = re.sub(r'<!--OG-BEGIN-->.*?<!--OG-END-->', '', doc, flags=re.S)
    m = re.search(r'</title>', doc)
    if m:
        return doc[:m.end()] + tag + doc[m.end():]
    return re.sub(r'(<head[^>]*>)', lambda x: x.group(1) + tag, doc, count=1)


ACCENT = {'quote': (37, 99, 235), 'health': (16, 163, 127), 'damage': (234, 88, 12)}
KICK = {'quote': 'INSTANT QUOTE', 'health': 'HEALTH CHECK', 'damage': 'DAMAGE CHECK'}


def image(tool, trade, name, out_dir):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return False
    os.makedirs(out_dir, exist_ok=True)
    W, H = 1200, 630
    im = Image.new('RGB', (W, H), (11, 18, 32))
    d = ImageDraw.Draw(im)
    a = ACCENT[tool]
    for y in range(H):  # soft accent glow from the top right
        k = max(0.0, 1 - y / H) * 0.22
        d.line([(0, y), (W, y)], fill=tuple(int(11 + (c - 11) * k) for c in (a[0], a[1], a[2])))
    d.rectangle([0, 0, 14, H], fill=a)

    def font(sz, bold=True):
        for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if bold else ''),
                  '/Library/Fonts/Arial%s.ttf' % (' Bold' if bold else '')):
            if os.path.exists(p):
                return ImageFont.truetype(p, sz)
        return ImageFont.load_default()

    _, h, desc = copy(tool, trade, name)
    d.text((80, 80), KICK[tool] + '  ·  ' + name.upper(), font=font(28), fill=a)

    def wrap(text, f, width):
        lines, cur = [], ''
        for w in text.split():
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=f) > width and cur:
                lines.append(cur); cur = w
            else:
                cur = t
        return lines + [cur]

    fh = font(68)
    y = 150
    for ln in wrap(h, fh, 1020)[:3]:
        d.text((80, y), ln, font=fh, fill=(255, 255, 255)); y += 84
    fd = font(30, False)
    y += 18
    for ln in wrap(desc, fd, 1000)[:2]:
        d.text((80, y), ln, font=fd, fill=(176, 189, 210)); y += 42
    d.rounded_rectangle([80, 520, 400, 580], radius=30, fill=a)
    d.text((112, 534), 'Start free  →', font=font(28), fill=(255, 255, 255))
    d.text((W - 80 - d.textlength('BuilderPro', font=font(26)), 540), 'BuilderPro', font=font(26), fill=(120, 136, 160))
    im.save(os.path.join(out_dir, '%s-%s.png' % (tool, trade)), optimize=True)
    return True
