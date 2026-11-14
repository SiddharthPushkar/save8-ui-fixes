"""Local server for the save8.ai home page copy in ./site.

- Serves files from ./site (query strings ignored).
- /_next/image?url=/x.webp  -> serves /x.webp.
- Any file missing locally is fetched once from https://www.save8.ai and cached in ./site.
- /__api/...  -> proxied to https://prod-api.save8.ai/... (JS chunks are rewritten to use it, avoiding CORS).

- /tasks       -> task dashboard (tasks.html); tasks are read from / saved to tasks.json.

Run:  python serve.py [port]   (default 5187)
"""
import os, sys, re, urllib.request, urllib.parse, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "site")
DASHBOARD = os.path.join(HERE, "tasks.html")
TASKS = os.path.join(HERE, "tasks.json")
ORIGIN = "https://www.save8.ai"
API = "https://prod-api.save8.ai"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"


def rewrite_js(data: bytes) -> bytes:
    return data.replace(API.encode(), b"/__api")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    # ---- API proxy -------------------------------------------------------
    def _proxy_api(self):
        p = self.path
        while p.startswith("/__api"):
            p = p[len("/__api"):]
        target = API + p
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in ("host", "origin", "referer", "content-length", "accept-encoding", "connection")}
        headers["User-Agent"] = UA
        req = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            status, rh, data = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, rh, data = e.code, e.headers, e.read()
        except Exception as e:
            self.send_error(502, str(e)); return
        self.send_response(status)
        for k, v in rh.items():
            if k.lower() in ("content-type", "cache-control"):
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except ConnectionError:
            pass

    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Allow", "GET,POST,PUT,DELETE,OPTIONS"); self.end_headers()

    # ---- task dashboard -------------------------------------------------
    def _send_file(self, path, ctype):
        data = open(path, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _save_tasks(self):
        import json
        length = int(self.headers.get("Content-Length") or 0)
        try:
            tasks = json.loads(self.rfile.read(length))
            assert isinstance(tasks, list)
        except Exception:
            self.send_error(400, "Invalid tasks"); return
        with open(TASKS, "w", encoding="utf8") as f:
            json.dump(tasks, f, indent=2, ensure_ascii=False)
            f.write("\n")
        self.send_response(204); self.end_headers()

    def do_POST(self):
        if self.path.startswith("/__api"): return self._proxy_api()
        if self.path.split("?")[0] == "/tasks.json": return self._save_tasks()
        self.send_error(405)

    do_PUT = do_DELETE = do_PATCH = do_POST

    # ---- static + fetch-on-miss -----------------------------------------
    def do_GET(self):
        if self.path.startswith("/__api"): return self._proxy_api()
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        if path in ("/tasks", "/tasks/", "/tasks.html"):
            return self._send_file(DASHBOARD, "text/html; charset=utf-8")
        if path == "/tasks.json":
            return self._send_file(TASKS, "application/json")
        if path == "/_next/image":
            path = urllib.parse.parse_qs(parsed.query).get("url", ["/"])[0]
        if path in ("/", ""):
            path = "/index.html"
        self.path = path
        local = os.path.join(ROOT, *urllib.parse.unquote(path).lstrip("/").split("/"))
        if not os.path.isfile(local) and re.search(r"\.[A-Za-z0-9]{2,5}$", path):
            self._fetch(path, local)
        return super().do_GET()

    def end_headers(self):
        # UI-fix files and the page itself change while we work: never cache them.
        p = urllib.parse.urlparse(self.path).path
        if p.startswith("/ui-fixes/") or p in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        # Don't answer ui-fix files with 304 (Not Modified) — always send the body.
        p = urllib.parse.urlparse(self.path).path
        if p.startswith("/ui-fixes/") or p in ("/", "/index.html"):
            for h in ("If-Modified-Since", "If-None-Match"):
                if h in self.headers:
                    del self.headers[h]
        return super().send_head()

    def do_HEAD(self):
        self.path = urllib.parse.urlparse(self.path).path
        return super().do_HEAD()

    def _fetch(self, path, local):
        try:
            req = urllib.request.Request(ORIGIN + path, headers={"User-Agent": UA})
            data = urllib.request.urlopen(req, timeout=30).read()
        except Exception as e:
            sys.stderr.write("MISS %s (%s)\n" % (path, e)); return
        if path.endswith(".js"):
            data = rewrite_js(data)
        os.makedirs(os.path.dirname(local), exist_ok=True)
        with open(local, "wb") as f:
            f.write(data)
        sys.stderr.write("CACHED %s\n" % path)


if __name__ == "__main__":
    # rewrite API host in already-downloaded chunks
    for dp, _, fs in os.walk(os.path.join(ROOT, "_next")):
        for fn in fs:
            if fn.endswith(".js"):
                p = os.path.join(dp, fn)
                b = open(p, "rb").read()
                if API.encode() in b:
                    open(p, "wb").write(rewrite_js(b))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "5187"))
    print("Save8 home on http://localhost:%d  |  tasks on http://localhost:%d/tasks" % (port, port), flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
