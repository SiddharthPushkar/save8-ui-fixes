"""Build a static copy of ./site for GitHub Pages into ./docs.

GitHub Pages serves this repo at https://siddharthpushkar.github.io/save8-ui-fixes/,
i.e. under a sub-path, and has no server logic. So this script:
  1. downloads any chunk the site's scripts reference that isn't saved yet,
  2. copies site/ -> docs/,
  3. rewrites root paths (/_next/, /assets/, /fonts/, /ui-fixes/, ...) to /save8-ui-fixes/...,
  4. turns /_next/image?url=X&w=..&q=.. into the plain file X (serve.py did that before),
  5. restores the real API host in scripts (serve.py proxied it as /__api; Pages can't),
     and marks next/image as unoptimized (no image server on Pages),
  6. adds .nojekyll so GitHub keeps the _next folder.

Run:  python build_pages.py
"""
import os, re, shutil, urllib.parse, urllib.request, html

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "site")
OUT = os.path.join(HERE, "docs")
PREFIX = "/save8-ui-fixes"
ORIGIN = "https://www.save8.ai"
API = "https://prod-api.save8.ai"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}
ROOTS = ("_next", "assets", "fonts", "ui-fixes", "images", "videos", "icons", "lottie")
PATCHED = []

# ---------- 1. fetch referenced chunks that are missing ----------
def fetch_missing():
    got = 0
    for _ in range(4):  # chunks can reference more chunks
        refs = set()
        for dp, _, fs in os.walk(os.path.join(SITE, "_next")):
            for f in fs:
                if f.endswith((".js", ".css")):
                    t = open(os.path.join(dp, f), encoding="utf8", errors="ignore").read()
                    refs |= set(re.findall(r"static/chunks/[A-Za-z0-9_.~-]+\.(?:js|css)", t))
        new = 0
        for r in sorted(refs):
            local = os.path.join(SITE, "_next", *r.split("/"))
            if os.path.isfile(local):
                continue
            try:
                data = urllib.request.urlopen(urllib.request.Request(f"{ORIGIN}/_next/{r}", headers=UA), timeout=30).read()
                os.makedirs(os.path.dirname(local), exist_ok=True)
                open(local, "wb").write(data)
                new += 1
            except Exception as e:
                print("  could not fetch", r, e)
        got += new
        if not new:
            break
    print(f"fetched {got} missing chunk(s)")

# ---------- 2-5. copy + rewrite ----------
root_re = re.compile(r'(?<=["\'(\s,=`])/(' + "|".join(ROOTS) + r')/')
favicon_re = re.compile(r'(?<=["\'(\s,=`])/(favicon[^"\'\s)]*|apple-touch-icon[^"\'\s)]*|site\.webmanifest)')

def unimage(text):
    # /_next/image?url=%2Fassets%2Fx.webp&amp;w=128&amp;q=75  ->  /assets/x.webp
    def rep(m):
        q = html.unescape(m.group(1))
        url = urllib.parse.parse_qs(q).get("url", [""])[0]
        return urllib.parse.unquote(url) if url.startswith("/") else m.group(0)
    return re.sub(r'/_next/image\?((?:url=[^"\'\s]+?)(?:&amp;|&)(?:[^"\'\s]*))(?=["\'\s])', rep, text)

def rewrite(text, is_js=False):
    if is_js:
        text = text.replace("/__api/__api", "/__api")
        text = re.sub(r'(?<=["\'`])/__api', API, text)
        # next/image builds /_next/image?url=... at runtime, which needs a server;
        # mark images unoptimized so they load straight from their files on Pages
        text = text.replace("unoptimized:!1", "unoptimized:!0")
        # Next's usePathname(): report "/" for "/save8-ui-fixes/..." so the site's
        # home-page checks (scroll switch, location button, tabs) behave as on save8.ai
        old = 'function b(){return f?.("usePathname()"),(0,i.useContext)(s.PathnameContext)}'
        new = ('function b(){f?.("usePathname()");let p=(0,i.useContext)(s.PathnameContext);'
               f'return typeof p=="string"&&p.startsWith("{PREFIX}")?(p.slice({len(PREFIX)})||"/"):p}}')
        if old in text:
            text = text.replace(old, new)
            PATCHED.append("usePathname")
    text = unimage(text)
    text = root_re.sub(lambda m: f"{PREFIX}/{m.group(1)}/", text)
    text = favicon_re.sub(lambda m: f"{PREFIX}/{m.group(1)}", text)
    text = text.replace(PREFIX + PREFIX, PREFIX)
    return text

def build():
    # clear old files but keep the folders (Windows can hold a lock on an open folder)
    if os.path.isdir(OUT):
        for dp, _, fs in os.walk(OUT):
            for f in fs:
                os.remove(os.path.join(dp, f))
    shutil.copytree(SITE, OUT, dirs_exist_ok=True)
    # the task list (the Save8 logo links here); read-only on Pages
    for f in ("tasks.html", "tasks.json"):
        shutil.copy2(os.path.join(HERE, f), os.path.join(OUT, f))
    n = 0
    for dp, _, fs in os.walk(OUT):
        for f in fs:
            p = os.path.join(dp, f)
            if f.endswith((".html", ".css", ".js", ".webmanifest", ".json")):
                t = open(p, encoding="utf8", errors="ignore").read()
                t2 = rewrite(t, is_js=f.endswith(".js"))
                if t2 != t:
                    open(p, "w", encoding="utf8").write(t2)
                    n += 1
    # cache-bust the UI-fix CSS/JS: GitHub Pages lets browsers keep files ~10 min, so tag each
    # build's links with a version so changes show on the next page load
    import time
    stamp = time.strftime("%Y%m%d%H%M%S")
    idx = os.path.join(OUT, "index.html")
    t = open(idx, encoding="utf8").read()
    t = re.sub(r'(/ui-fixes/[\w.-]+\.(?:css|js))(\?v=\d+)?"', lambda m: f'{m.group(1)}?v={stamp}"', t)
    open(idx, "w", encoding="utf8").write(t)
    open(os.path.join(OUT, ".nojekyll"), "w").write("")
    # GitHub Pages serves 404.html for unknown paths; send people back to the home page
    open(os.path.join(OUT, "404.html"), "w", encoding="utf8").write(
        f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url={PREFIX}/">'
        f'<title>Save8 UI fixes</title><a href="{PREFIX}/">Go to the home page</a>')
    print(f"built docs/ ({n} files rewritten); patched: {PATCHED or 'NOTHING - check usePathname patch'}")

if __name__ == "__main__":
    fetch_missing()
    build()
