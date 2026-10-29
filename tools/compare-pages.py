# Builds compare.html and the three "<competitor> alternative" pages from one
# template, so the facts stay the same everywhere. Run: python3 tools/compare-pages.py
# Competitor facts: their public pricing pages and independent reviews, October 2026.
# Re-check them before changing a price or a claim here.
import html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
ASOF = "October 2026"
e = lambda s: html.escape(s, quote=True)

# rows: (what, BuilderPro, Jobber, Housecall Pro, ServiceTitan); a leading "+" marks a good answer, "-" a weaker one
ROWS = [
 ("AI receptionist", "+Included on every plan: Lisa answers calls and texts, 150 to 500 minutes", "-Add-on, about $29/mo for 30 conversations, then $0.79 each (included on the top plan)", "-Add-on (CSR AI), price only from sales", "-Add-on (Voice Agents), price only from sales"),
 ("Marketing and reviews", "+Review requests on every plan; website calculators and lead tracking from BuilderPro OS", "-Marketing Suite add-on, about $99/mo", "Check with Housecall Pro", "-Sold as add-on modules"),
 ("Built for", "+Project jobs: roofing, remodeling, exteriors, painting, concrete", "Home service businesses, many with recurring visits", "Home service calls", "Large HVAC, plumbing and electrical companies"),
 ("Crew logins", "+Included: you plus 1, you plus 5, or unlimited, by plan", "-Extra users about $29/mo each", "-Extra users on MAX $35/mo each", "-Priced per technician"),
 ("Setup fee and contract", "+None. Monthly, cancel anytime", "+None, monthly available", "+None, monthly available", "-Setup fees reported from about $5,000; 12-month contracts reported"),
 ("Roughly, for a 5-person crew", "+$199/mo, AI receptionist included", "About $270/mo with the receptionist and marketing add-ons", "About $189/mo plus CSR AI (price from sales)", "About $1,200 to $2,000/mo, plus setup"),
]
COMP = {
 "jobber": ("Jobber", 2,
   "Jobber is a solid tool for running quick, repeat service visits. BuilderPro is built for contractors who sell and run projects, and it answers your phone and brings in leads as part of the price.",
   ["You run quick, recurring visits, like lawn care or cleaning routes, and need route dispatch above all.",
    "You need a specific app that connects to Jobber and not to BuilderPro."]),
 "housecall-pro": ("Housecall Pro", 3,
   "Housecall Pro is built around home service calls. BuilderPro includes an AI receptionist on every plan, with a published price, and adds the project tools roofers and remodelers need.",
   ["Most of your work is short service calls with a dispatcher assigning techs all day.",
    "You already rely on one of its add-ons, such as its payroll, and don't want to change it."]),
 "servicetitan": ("ServiceTitan", 4,
   "ServiceTitan is powerful software for large HVAC, plumbing and electrical companies, with per-technician pricing, setup fees and contracts to match. BuilderPro is built for crews of 1 to 15, with one flat monthly price, no contract, and setup in days.",
   ["You run 20 or more technicians with a full call center and dispatch team.",
    "You need deep enterprise reporting across several locations and have the budget and staff to set it up."]),
}

CSS = (ROOT / "roofing-crm-software.html").read_text().split("<style>")[1].split("</style>")[0]
EXTRA = """
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:18px;background:#fff}
table.cmp{width:100%;border-collapse:collapse;font-size:14px;min-width:640px}
.cmp th,.cmp td{padding:14px 16px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line-2)}
.cmp thead th{font-size:13px;font-weight:600;background:var(--soft);position:sticky;top:0}
.cmp th.bp,.cmp td.bp{background:var(--blue-bg)}
.cmp thead th.bp{color:var(--blue)}
.cmp tbody th{font-weight:600;width:22%;color:var(--ink-2)}
.cmp tr:last-child td,.cmp tr:last-child th{border-bottom:0}
.cmp .g{color:#16794a}.cmp .w{color:#9a3b2e}
.cmp .g:before{content:"\\2713  ";font-weight:700}
.cmp .w:before{content:"\\2013  ";font-weight:700}
.note{font-size:12.5px;color:var(--grey);margin-top:12px;line-height:1.6}
.fit{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:8px}
@media(max-width:760px){.fit{grid-template-columns:1fr}}
.fit ul{margin:10px 0 0 18px;color:var(--grey);font-size:15px;line-height:1.7}
"""
MARK = (ROOT / "roofing-crm-software.html").read_text().split("<body>")[1].split("</svg>")[0] + "</svg>"

def cell(v, cls=""):
    k = " g" if v.startswith("+") else " w" if v.startswith("-") else ""
    return f'<td class="{cls}{k}">{e(v.lstrip("+-"))}</td>'

def table(cols):
    names = ["BuilderPro", "Jobber", "Housecall Pro", "ServiceTitan"]
    head = "".join(f'<th class="{"bp" if i == 0 else ""}">{n}</th>' for i, n in enumerate(names) if i in cols)
    body = "".join("<tr><th>" + e(r[0]) + "</th>" + "".join(cell(r[i + 1], "bp" if i == 0 else "") for i in cols) + "</tr>" for r in ROWS)
    return f'<div class="tw"><table class="cmp"><thead><tr><th></th>{head}</tr></thead><tbody>{body}</tbody></table></div><p class="note">Competitor details come from their public pricing pages and independent reviews as of {ASOF}. Prices change, so check their sites for the latest. BuilderPro prices are on our <a href="https://builderpro-os.com/#pricing" style="color:var(--blue)">pricing page</a>.</p>'

def page(slug, title, desc, h1, lead, cols, intro, fit):
    url = f"https://builderpro-os.com/{slug}.html"
    fit_html = ""
    if fit:
        name, items = fit
        fit_html = f'''<section class="blk"><div class="wrap"><span class="ey">Being straight with you</span><h2>When {e(name)} may be <em>the better fit.</em></h2>
<div class="fit"><div class="card"><div class="ct">Stay with {e(name)} if</div><ul>{"".join("<li>" + e(x) + "</li>" for x in items)}</ul></div>
<div class="card"><div class="ct">Choose BuilderPro if</div><ul><li>You sell and run projects that take days or weeks, not 30-minute visits.</li><li>You miss calls while you are on a job and want every one answered, by phone and text.</li><li>You want more leads from your website and more reviews, without paying for extra tools.</li><li>You want one flat monthly price with no contract.</li></ul></div></div></div></section>'''
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Google Analytics (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-QM37G969Z0"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','G-QM37G969Z0');</script>
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}{EXTRA}</style>
<script async src="https://builderpro-os.com/embed/track.js?u=0909842f-f8b2-4651-950a-a772aef42b1d"></script>
</head>
<body>{MARK}
<nav>
  <div class="nav-i">
    <a href="https://builderpro-os.com" class="brand">
      <svg class="bpmark" width="26" height="26" aria-label="BuilderPro"><use href="#bpMark"/></svg>
      <b style="font-weight:inherit">Builder<span>Pro</span></b>
    </a>
    <div class="nav-r">
      <a class="lk" href="https://builderpro-os.com/#lisa">Lisa AI</a>
      <a class="lk" href="https://builderpro-os.com/#pricing">Pricing</a>
      <a class="lk" href="https://builderpro-os.com/compare.html">Compare</a>
      <a href="https://builderpro-os.com/signup.html" class="btn btn-dark">Start free trial</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <span class="kicker"><span class="dot"></span>Compare</span>
    <h1>{h1}</h1>
    <p class="lead">{e(lead)}</p>
    <div class="hero-cta">
      <a href="https://builderpro-os.com/signup.html" class="btn btn-blue btn-lg">Start your 14-day free trial</a>
      <a href="https://builderpro-os.com/#walkthrough" class="btn btn-light btn-lg">Book a free walkthrough</a>
    </div>
  </div>
</header>

<section class="blk">
  <div class="wrap">
    <span class="ey">Side by side</span>
    <h2>What you get, and <em>what it costs.</em></h2>
    <p class="sub">{e(intro)}</p>
    {table(cols)}
  </div>
</section>

<section class="blk">
  <div class="wrap center">
    <span class="ey">The difference</span>
    <h2>Built to win the job, <em>then run it.</em></h2>
  </div>
  <div class="wrap">
    <div class="grid3">
      <div class="card"><div class="ci">&#128222;</div><div class="ct">Answers every call</div><p class="cs">Lisa, the AI receptionist, answers calls and texts 24/7, answers questions and books the visit, on every plan. No per-conversation charges.</p></div>
      <div class="card"><div class="ci">&#127959;&#65039;</div><div class="ct">Built for real projects</div><p class="cs">Good, better and best estimates, signed contracts, payment plans, insurance claims and material orders on one project card.</p></div>
      <div class="card"><div class="ci">&#128200;</div><div class="ct">Brings the work in</div><p class="cs">Cost calculators on your website turn visitors into leads, review requests go out after every job, and we can build your website for $49 a month.</p></div>
    </div>
  </div>
</section>
{fit_html}
<section class="blk">
  <div class="wrap">
    <span class="ey">Switching</span>
    <h2>Moving over takes <em>days, not weeks.</em></h2>
    <div class="step"><div class="stepn">01</div><div><div class="stept">Start the free trial</div><p class="cs">14 days free. A card is needed to start, and nothing is charged until the trial ends.</p></div></div>
    <div class="step"><div class="stepn">02</div><div><div class="stept">We set it up with you</div><p class="cs">Export your customer list from your old software and import it in a minute, or send it to us and we bring it in. Your business details, Lisa and your booking page are set up for you, usually in 3 to 4 days.</p></div></div>
    <div class="step"><div class="stepn">03</div><div><div class="stept">Keep your phone number</div><p class="cs">Your customers keep calling and texting the number they already know. Lisa answers it, and every message lands in BuilderPro.</p></div></div>
  </div>
</section>

<section class="blk">
  <div class="ctaband">
    <h2>See it on <em>your</em> business.</h2>
    <p class="sub center">Call Lisa, our live demo, at (350) 333-1230 and ask what your customers ask. Or start your free trial; no contract, cancel anytime.</p>
    <div class="hero-cta">
      <a href="https://builderpro-os.com/signup.html" class="btn btn-blue btn-lg">Start free trial</a>
      <a href="https://builderpro-os.com/#walkthrough" class="btn btn-light btn-lg">Book a free walkthrough</a>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="xrow">
      <a class="xlink" href="https://builderpro-os.com/compare.html">BuilderPro vs Jobber, Housecall Pro and ServiceTitan</a>
      <a class="xlink" href="https://builderpro-os.com/jobber-alternative.html">Jobber alternative</a>
      <a class="xlink" href="https://builderpro-os.com/housecall-pro-alternative.html">Housecall Pro alternative</a>
      <a class="xlink" href="https://builderpro-os.com/servicetitan-alternative.html">ServiceTitan alternative</a>
      <a class="xlink" href="https://builderpro-os.com/help.html">Help Center</a>
    </div>
    <p class="fcopy">Jobber, Housecall Pro and ServiceTitan are trademarks of their owners, who are not affiliated with BuilderPro.<br>&copy; 2026 BuilderPro OS<!-- LLC: "[LLC legal name]" --> &middot; <a href="https://builderpro-os.com/privacy.html">Privacy</a> &middot; <a href="https://builderpro-os.com/terms.html">Terms</a></p>
  </div>
</footer>
</body>
</html>
'''

pages = {"compare": page("compare", "BuilderPro vs Jobber, Housecall Pro, ServiceTitan",
    "How BuilderPro compares with Jobber, Housecall Pro and ServiceTitan: AI receptionist, project tools, lead generation, crew logins and real monthly cost.",
    "BuilderPro vs Jobber, Housecall Pro <em>and ServiceTitan.</em>",
    "The others help you run the jobs you already have. BuilderPro answers every call, brings in more leads, and runs your projects, for one flat price.",
    [0, 1, 2, 3], "The big platforms charge extra for an AI receptionist, marketing and more users. Here is what a contractor actually gets.", None)}
for slug, (name, col, intro, fit) in COMP.items():
    pages[f"{slug}-alternative"] = page(f"{slug}-alternative", f"{name} Alternative for Contractors | BuilderPro",
        f"Looking for a {name} alternative? BuilderPro includes an AI receptionist, project tools and lead generation for one flat price from $99, with no contract.",
        f"A {e(name)} alternative <em>built for contractors.</em>",
        f"Comparing {name} with BuilderPro? Here is what each includes and costs, and when each one is the better fit.",
        [0, col - 1], intro, (name, fit))
for slug, text in pages.items():
    (ROOT / f"{slug}.html").write_text(text)
    print("wrote", slug + ".html", len(text))
