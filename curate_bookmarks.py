from html.parser import HTMLParser
from html import escape
from urllib.parse import urlparse

SRC = '/Users/seanhalls/Desktop/bookmarks_9_30_26.html'
DST = '/Users/seanhalls/Desktop/sh/bookmarks_top_20_percent_2026-09-30.html'

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.href = None; self.items = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a': self.href = dict(attrs).get('href')
    def handle_data(self, data):
        if self.href and data.strip():
            self.items.append((data.strip(), self.href)); self.href = None

p = P(); p.feed(open(SRC, encoding='utf-8').read())

exclude = ('google.com/search', 'maps.google.com', 'file://', 'localhost', 'reddit.com',
           'stocktwits.com/symbol', 'zillow.com', 'indeed.com', 'walmart.com',
           'recruitee.com', 'godaddy.com/domainsearch', 'coinmarketcap.com/currencies',
           'tradingview.com/chart/', 'youtube.com/watch', 'youtu.be/', 'scribd.com',
           'ultimate-guitar.com/tab/', 'guitaretab.com/', 'linktr.ee/', 'medium.com/@')
strong_domains = ('docs.python.org', 'python.org', 'developer.mozilla.org', 'learn.microsoft.com',
                  'aws.amazon.com/architecture', 'modelcontextprotocol.io', 'openai.com',
                  'platform.openai.com', 'github.com', 'arxiv.org', 'nature.com/articles',
                  'nngroup.com', 'bigocheatsheet.com', 'fuzzing-project.org', 'trailofbits.com',
                  'tradingeconomics.com', 'finviz.com', 'portfoliovisualizer.com',
                  'papers.ssrn.com', 'acm-stoc.org', 'swift.org', 'forums.swift.org',
                  'microk8s.io', 'unpkg.com', 'css-tricks.com', 'codepen.io', 'cytoscape.js.org',
                  'musicinformationretrieval.com', 'makeweirdmusic.com', 'musicforprogramming.net',
                  'selfdefined.app', 'foreignpolicy.com', 'unchainedcrypto.com', 'duneanalytics.com',
                  'databento.com', 'fintel.io', 'aaif.io', 'agents.md', 'genesisopenmodels.anl.gov',
                  'nord.org', 'hawkwatch.org', 'oceanusadventure.com')
keywords = ('documentation', 'reference', 'guide', 'architecture', 'algorithm', 'data structure',
            'python', 'javascript', 'swift', 'api', 'mcp', 'agent', 'ai', 'quant', 'trading',
            'market data', 'backtest', 'options', 'fuzz', 'security', 'music', 'harmony',
            'hiking', 'trail', 'research', 'dataset', 'visualization', 'open source')

def score(item):
    title, url = item; low = (title + ' ' + url).lower(); host = urlparse(url).netloc.lower()
    if any(x in low for x in exclude): return -100
    s = 0
    if any(x in url.lower() for x in strong_domains): s += 8
    if any(x in low for x in keywords): s += 2
    if host.endswith('.gov') or host.endswith('.edu'): s += 4
    if 'wikipedia.org' in host: s += 2
    if 'stackoverflow.com' in host or 'realpython.com' in host: s += 3
    if 'github.com' in host: s += 2
    if any(x in low for x in ('homepage', 'blog', 'news', 'search', 'login', 'pricing', 'calendar')): s -= 3
    if any(x in low for x in ('pdf', 'paper', 'documentation', 'reference')): s += 2
    return s

ranked = sorted(((score(x), i, x) for i, x in enumerate(p.items)), reverse=True)
chosen = []
seen = set()
for s, i, item in ranked:
    if s < 3: continue
    title, url = item; key = urlparse(url).netloc.lower() + '|' + title.lower()
    if key in seen: continue
    seen.add(key); chosen.append((s, i, item))
    if len(chosen) == 95: break
chosen.sort(key=lambda x: x[1])

body = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>Curated bookmarks — top 20%</TITLE>', '<H1>Curated bookmarks — top 20%</H1>', '<DL><p>',
        '    <DT><H3 PERSONAL_TOOLBAR_FOLDER="true">Still valuable — curated 2026-09-30</H3>', '    <DL><p>']
for _, _, (title, url) in chosen:
    body.append(f'        <DT><A HREF="{escape(url, quote=True)}">{escape(title)}</A>')
body += ['    </DL><p>', '</DL><p>', f'<!-- Selected {len(chosen)} of {len(p.items)} original bookmarks. -->']
open(DST, 'w', encoding='utf-8').write('\n'.join(body) + '\n')
print(f'wrote {DST} with {len(chosen)} bookmarks')
