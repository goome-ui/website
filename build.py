#!/usr/bin/env python3
import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

import markdown
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))
import versions as registry
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import TextLexer, get_lexer_by_name

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
DOCS_REPO = "goome-ui/docs"
GITHUB = "https://github.com/goome-ui"
LANGS = {"c": "C", "csharp": "C#", "python": "Python", "java": "Java", "rust": "Rust", "go": "Go", "zig": "Zig", "lua": "Lua", "js": "Node"}
LEXERS = {"gdscript": "python", "groovy": "groovy", "sh": "bash", "text": "text", "markdown": "text", "powershell": "powershell", "cmake": "cmake"}


def relroot(depth):
    return "../" * depth if depth else "./"


def kramdown_slug(value, sep="-"):
    value = html.unescape(re.sub(r"<[^>]+>", "", value)).strip().lower()
    value = re.sub(r"[^\w \-]", "", value)
    return value.replace(" ", "-").replace("popup", "pop-up")


def strip_tags(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def split_front(text):
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}, text
    return yaml.safe_load(m.group(1)) or {}, text[m.end():]


def fetch_docs(ref, work):
    url = f"https://codeload.github.com/{DOCS_REPO}/tar.gz/{ref}"
    dest = work / "docs-src"
    dest.mkdir(parents=True)
    tgz = work / "docs.tgz"
    req = urllib.request.Request(url, headers={"User-Agent": "goome-website-build"})
    with urllib.request.urlopen(req, timeout=60) as r, open(tgz, "wb") as f:
        shutil.copyfileobj(r, f)
    with tarfile.open(tgz) as t:
        t.extractall(dest, filter="data")
    inner = [p for p in dest.iterdir() if p.is_dir()]
    return inner[0] if len(inner) == 1 else dest


def pagelink(page, up):
    if page == "builder":
        return up + "../builder/"
    return up + ("" if page == "index" else page + "/")


def load_nav(docs):
    for rel in ("nav.yml", "_data/nav.yml"):
        p = docs / rel
        if p.exists():
            return yaml.safe_load(p.read_text())
    sys.exit("docs checkout has no nav.yml")


class Site:
    def __init__(self, out, docs, found):
        self.out = out
        self.docs = docs
        self.found = found
        self.version = hashlib.sha1((SRC / "assets/css/site.css").read_bytes() + (SRC / "assets/js/site.js").read_bytes()).hexdigest()[:8]
        self.partials = {}
        for p in (SRC / "partials").glob("*.html"):
            self.partials[p.stem] = p.read_text()
        self.pages = []
        self.links = []

    def render(self, text, ctx):
        for _ in range(3):
            text = re.sub(r"\{\{>\s*([\w-]+)\s*\}\}", lambda m: self.partials[m.group(1)], text)
        for _ in range(2):
            text = re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: str(ctx.get(m.group(1), "")), text)
        return text

    def base_ctx(self, depth, title, description, section=""):
        root = relroot(depth)
        return {
            "root": root,
            "title": html.escape(title),
            "description": html.escape(description, quote=True),
            "version": self.version,
            "hero_version": f"goome {self.found['c']}, " if self.found.get("c") else "",
            "install_rows": self.install_rows(),
            "github": GITHUB,
            "section": section,
            "nav_docs": ' aria-current="page"' if section == "docs" else "",
            "nav_builder": ' aria-current="page"' if section == "builder" else "",
            "nav_themes": ' aria-current="page"' if section == "themes" else "",
            "nav_try": ' aria-current="page"' if section == "try" else "",
            "nav_compare": ' aria-current="page"' if section == "compare" else "",
        }

    def install_rows(self):
        v = self.found
        gh = GITHUB

        def code(text, copy=None):
            copy = html.escape(copy if copy is not None else text, quote=True)
            return f'<code>{html.escape(text)}</code><button class="copy" type="button" data-copy="{copy}" aria-label="Copy install command">Copy</button>'

        def latest(repo, what):
            return f'Get {what} from the <a href="{gh}/{repo}/releases/latest">latest release</a>'

        rows = []
        c_cmd = "curl -fsSL https://raw.githubusercontent.com/goome-ui/c-goome/main/get.sh | sh"
        rows.append(("C", "start-c", v.get("c"), code(c_cmd)))
        rows.append(("C#", "start-csharp", v.get("nuget"), code("dotnet add package GoomeSharp")))
        rows.append(("Python", "start-python", v.get("python"), code("pip install goome")))
        if v.get("maven"):
            rows.append(("Java", "start-java", v["maven"], code(f"io.github.goome-ui:goome:{v['maven']}", f"implementation 'io.github.goome-ui:goome:{v['maven']}'")))
        else:
            rows.append(("Java", "start-java", None, f'<a href="https://central.sonatype.com/artifact/io.github.goome-ui/goome">io.github.goome-ui:goome</a> on Maven Central'))
        rows.append(("Rust", "start-rust", v.get("crates"), code("cargo add goome")))
        n = v.get("node")
        rows.append(("Node", "start-node", n, code(f"npm install {gh}/node-goome/releases/download/v{n}/goome-{n}.tgz") if n else latest("node-goome", "the .tgz")))
        g = v.get("go")
        rows.append(("Go", "start-go", g, code(f"go get github.com/goome-ui/go-goome@v{g}" if g else "go get github.com/goome-ui/go-goome@latest")))
        z = v.get("zig")
        rows.append(("Zig", "start-zig", z, code(f"zig fetch --save git+{gh}/zig-goome#v{z}" if z else f"zig fetch --save git+{gh}/zig-goome")))
        l = v.get("lua")
        rows.append(("Lua", "start-lua", l, code(f"luarocks install {gh}/lua-goome/releases/download/v{l}/goome-{l}-1.src.rock") if l else latest("lua-goome", "the .src.rock")))
        d = v.get("godot")
        rows.append(("Godot", "start-godot", d, f'Unzip <a href="{gh}/godot-goome/releases/latest">godot-goome{"-" + d if d else ""}.zip</a> into your project'))
        rows.append(("Unity", "start-unity", None, f'Package Manager, add from git URL <code>{gh}/csharp-goome.git?path=/unity/com.goome-ui.goome</code>'))
        out = []
        for name, page, ver, cell in rows:
            tag = f'<span class="ver">{html.escape(ver)}</span>' if ver else ""
            cls = ' class="cmd"' if 'class="copy"' in cell else ""
            out.append(f'<tr><th scope="row">{name}{tag}</th><td{cls}>{cell}</td><td><a href="{{{{root}}}}docs/{page}/">Getting started in {name}</a></td></tr>')
        return "\n        ".join(out)

    def write(self, rel, content):
        p = self.out / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)

    def static_pages(self):
        for f in sorted((SRC / "pages").glob("*.html")):
            name = f.stem
            raw = f.read_text()
            meta = {}
            m = re.match(r"<!--meta (.*?)-->\n", raw, re.S)
            if m:
                meta = json.loads(m.group(1))
                raw = raw[m.end():]
            if name == "index":
                rel, depth = "index.html", 0
            elif name == "404":
                rel, depth = "404.html", 0
            else:
                rel, depth = f"{name}/index.html", 1
            ctx = self.base_ctx(depth, meta.get("title", "goome"), meta.get("description", ""), meta.get("section", ""))
            if name == "404":
                ctx["root"] = "/"
            self.write(rel, self.render(raw, ctx))

    def copy_static(self):
        shutil.copytree(SRC / "assets", self.out / "assets")
        shutil.copytree(SRC / "builder", self.out / "builder")
        shutil.copytree(SRC / "demos", self.out / "demos")
        for extra in ("favicon.ico", "robots.txt"):
            if (SRC / extra).exists():
                shutil.copy(SRC / extra, self.out / extra)
        subprocess.run([sys.executable, str(HERE / "tools" / "badges.py"), str(self.out / "badges")], check=True, stdout=subprocess.DEVNULL)

    def highlight_blocks(self, body):
        def repl(m):
            lang = m.group(1) or "text"
            code = html.unescape(m.group(2))
            name = LEXERS.get(lang, lang)
            try:
                lexer = TextLexer() if name == "text" else get_lexer_by_name(name)
            except Exception:
                lexer = TextLexer()
            inner = highlight(code, lexer, HtmlFormatter(nowrap=True)).rstrip("\n")
            return f'<div class="code" data-lang="{lang}"><button class="copy" type="button" aria-label="Copy code">Copy</button><pre><code>{inner}</code></pre></div>'

        return re.sub(r'<pre><code(?: class="language-([\w-]+)")?>(.*?)</code></pre>', repl, body, flags=re.S)

    def group_tabs(self, body):
        pat = re.compile(r'<div class="code" data-lang="(\w+)">.*?</pre></div>', re.S)
        out, pos = [], 0
        blocks = list(pat.finditer(body))
        i = 0
        while i < len(blocks):
            group = [blocks[i]]
            seen = {blocks[i].group(1)}
            j = i + 1
            while j < len(blocks) and blocks[j].group(1) in LANGS and blocks[i].group(1) in LANGS and blocks[j].group(1) not in seen and body[blocks[j - 1].end():blocks[j].start()].strip() == "":
                group.append(blocks[j])
                seen.add(blocks[j].group(1))
                j += 1
            if len(group) > 1:
                out.append(body[pos:group[0].start()])
                row = "".join(f'<button type="button" data-lang="{g.group(1)}"{" class=on" if k == 0 else ""}>{LANGS[g.group(1)]}</button>' for k, g in enumerate(group))
                panes = "".join(g.group(0).replace('<div class="code"', '<div class="code" hidden' if k else '<div class="code"', 1) for k, g in enumerate(group))
                out.append(f'<div class="tabs"><div class="tab-row">{row}</div>{panes}</div>')
                pos = group[-1].end()
            i = j
        out.append(body[pos:])
        return "".join(out)

    def fix_links(self, body, up, is_index):
        def href(m):
            url = m.group(1)
            if url.startswith("#"):
                return 'href="' + url.replace("popup", "pop-up") + '"'
            if re.match(r"(https?:|mailto:|#|/|\.\./assets/)", url):
                return m.group(0)
            base, _, frag = url.partition("#")
            tail = "#" + frag.replace("popup", "pop-up") if frag else ""
            if base.endswith(".md"):
                target = base[:-3].split("/")[-1]
                if target == "index":
                    new = up or "./"
                else:
                    new = f"{up}{target}/"
                return f'href="{new}{tail}"'
            if re.match(r"\.\./(api|tools|tests)/", base):
                return f'href="{GITHUB}/docs/blob/main/{base[3:]}{tail}"'
            if base.startswith("../builder"):
                return f'href="{up}../builder/"'
            return m.group(0)

        site_root = up + "../" if not is_index else "../"
        body = re.sub(r'(href|src)="https://goome\.wtf/([^"]*)"', lambda m: f'{m.group(1)}="{site_root}{m.group(2)}"', body)
        body = re.sub(r'href="([^"]*)"', href, body)
        if is_index:
            body = body.replace('src="../assets/', 'src="assets/')
        return body

    def liquid(self, text):
        text = re.sub(r"\{\{\s*'/demos/([\w-]+)/'\s*\|\s*relative_url\s*\}\}", lambda m: f"../../demos/{m.group(1)}/", text)
        return text

    def build_docs(self):
        nav = load_nav(self.docs)
        pages_dir = self.docs / "pages"
        order = []
        titles = {}
        for grp in nav:
            for it in grp["pages"]:
                order.append(it["page"])
                titles[it["page"]] = it["title"]
        stems = sorted(p.stem for p in pages_dir.glob("*.md"))
        for s in stems:
            if s not in titles:
                titles[s] = s
        shots = self.docs / "assets" / "shots"
        if shots.exists():
            shutil.copytree(shots, self.out / "docs" / "assets" / "shots")
        search = []
        for stem in stems:
            meta, text = split_front((pages_dir / f"{stem}.md").read_text())
            text = self.liquid(text)
            md = markdown.Markdown(extensions=["fenced_code", "tables", "toc"], extension_configs={"toc": {"slugify": kramdown_slug, "toc_depth": "2-3"}})
            body = md.convert(text)
            body = self.highlight_blocks(body)
            body = self.group_tabs(body)
            body = self.fix_links(body, "" if stem == "index" else "../", stem == "index")
            body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
            body = re.sub(r'<h1 id="[^"]*">(.*?)</h1>', r"<h1>\1</h1>", body, count=1, flags=re.S)
            toc = []
            for t in md.toc_tokens:
                toc.append((t["level"], t["id"], strip_tags(t["name"])))
                for c in t.get("children", []):
                    toc.append((c["level"], c["id"], strip_tags(c["name"])))
            title = meta.get("title") or titles.get(stem, stem)
            sidebar = self.sidebar(nav, stem)
            toc_html = ""
            if len(toc) > 1:
                toc_html = "<h2>On this page</h2><ul>" + "".join(f'<li class="l{lvl}"><a href="#{i}">{html.escape(n)}</a></li>' for lvl, i, n in toc) + "</ul>"
            first_p = re.search(r"<p>(.*?)</p>", body, re.S)
            desc = strip_tags(first_p.group(1))[:200] if first_p else "goome docs"
            up = "" if stem == "index" else "../"
            idx = order.index(stem) if stem in order else -1
            pn = ""
            if idx >= 0:
                prev = order[idx - 1] if idx > 0 else None
                nxt = order[idx + 1] if idx + 1 < len(order) else None
                if prev:
                    pn += f'<a class="prev" href="{pagelink(prev, up)}"><span>Previous</span>{html.escape(titles[prev])}</a>'
                if nxt:
                    pn += f'<a class="next" href="{pagelink(nxt, up)}"><span>Next</span>{html.escape(titles[nxt])}</a>'
            ctx = self.base_ctx(1 if stem == "index" else 2, f"{title} - goome docs", desc, {"compare": "compare", "try": "try"}.get(stem, "docs"))
            rel = "docs/index.html" if stem == "index" else f"docs/{stem}/index.html"
            ctx.update({
                "sidebar": sidebar,
                "content": body,
                "toc": toc_html,
                "prevnext": f'<nav class="pn">{pn}</nav>' if pn else "",
                "edit": f'{GITHUB}/docs/blob/main/pages/{stem}.md',
                "page_title": html.escape(title),
            })
            ctx["docs_root"] = "./" if stem == "index" else "../"
            self.write(rel, self.render((SRC / "templates" / "docs.html").read_text(), ctx))
            self.collect_links(rel, body)
            search.append(self.search_entry(stem, titles.get(stem, title), body))
        self.write("docs/search.json", json.dumps(search, separators=(",", ":"), ensure_ascii=False))

    def sidebar(self, nav, current):
        here_index = current == "index"
        out = []
        for grp in nav:
            items = []
            for it in grp["pages"]:
                p = it["page"]
                up = "" if here_index else "../"
                href = pagelink(p, up) or "./"
                cur = ' class="here" aria-current="page"' if p == current else ""
                since = f'<kbd>{it["since"]}</kbd>' if it.get("since") else ""
                items.append(f'<li><a href="{href}"{cur}><span>{html.escape(it["title"])}</span>{since}</a></li>')
            out.append(f'<h4>{html.escape(grp["title"])}</h4><ul>{"".join(items)}</ul>')
        return "".join(out)

    def search_entry(self, stem, title, body):
        parts = re.split(r'(?=<h[23] id=")', body)
        secs = []
        for part in parts:
            m = re.match(r'<h[23] id="([^"]+)">(.*?)</h[23]>', part, re.S)
            text = re.sub(r"\s+", " ", strip_tags(re.sub(r"<(pre|button)[^>]*>.*?</\1>", " ", part, flags=re.S))).strip()
            text = text[:600]
            if m:
                secs.append({"h": strip_tags(m.group(2)), "a": m.group(1), "x": text})
            elif text:
                secs.append({"h": "", "a": "", "x": text})
        return {"t": title, "u": "" if stem == "index" else stem + "/", "s": secs}

    def collect_links(self, rel, body):
        self.links.append((rel, body))

    def check(self):
        bad = []
        files = {str(p.relative_to(self.out)) for p in self.out.rglob("*") if p.is_file()}
        ids = {}
        for rel in files:
            if rel.endswith(".html"):
                ids[rel] = set(re.findall(r'\bid="([^"]+)"', (self.out / rel).read_text()))
        for rel in sorted(files):
            if not rel.endswith(".html") or rel.startswith("builder/") or rel.startswith("demos/"):
                continue
            text = (self.out / rel).read_text()
            for attr, url in re.findall(r'\b(href|src)="([^"]*)"', text):
                if re.match(r"(https?:|mailto:|data:|javascript:)", url) or not url:
                    continue
                path, _, frag = url.partition("#")
                path = path.split("?")[0]
                if path.startswith("/"):
                    continue
                target = (Path(rel).parent / path) if path else Path(rel)
                parts = []
                for seg in target.parts:
                    if seg == "..":
                        if parts:
                            parts.pop()
                    elif seg != ".":
                        parts.append(seg)
                norm = "/".join(parts)
                cand = norm if norm in files else (norm.rstrip("/") + "/index.html" if norm else "index.html")
                if norm == "":
                    cand = "index.html"
                if cand not in files:
                    bad.append((rel, url))
                elif frag and cand.endswith(".html") and frag not in ids.get(cand, set()):
                    bad.append((rel, url))
        return bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "dist"))
    ap.add_argument("--docs", help="path to a local docs checkout")
    ap.add_argument("--docs-ref", default="refs/heads/main")
    ap.add_argument("--no-check", action="store_true")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--versions", help="json file made by tools/versions.py")
    a = ap.parse_args()
    out = Path(a.out).resolve()
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    work = Path(tempfile.mkdtemp(prefix="goome-build-", dir=str(out.parent)))
    try:
        docs = Path(a.docs).resolve() if a.docs else fetch_docs(a.docs_ref, work)
        if a.versions:
            found = json.loads(Path(a.versions).read_text())
        else:
            found = registry.fetch()
        site = Site(out, docs, found)
        site.copy_static()
        site.static_pages()
        site.build_docs()
        bad = [] if a.no_check else site.check()
        for rel, url in bad:
            print(f"broken link in {rel}: {url}", file=sys.stderr)
        print(f"built {len(list(out.rglob('*.html')))} pages into {out}")
        if bad:
            print(f"{len(bad)} broken links", file=sys.stderr)
            sys.exit(2 if a.strict and any(not rel.startswith("docs/") for rel, _ in bad) else 0)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
