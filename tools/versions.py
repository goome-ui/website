#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request

ORG = "https://github.com/goome-ui"
UA = {"User-Agent": "goome-website-build"}
TAG_REPOS = {
    "c": "c-goome",
    "go": "go-goome",
    "zig": "zig-goome",
    "lua": "lua-goome",
    "node": "node-goome",
    "godot": "godot-goome",
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode()


def semver(text):
    m = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", text.strip())
    return tuple(int(x) for x in m.groups()) if m else None


def newest(names):
    found = [(semver(n), n.lstrip("v")) for n in names if semver(n)]
    return max(found)[1] if found else None


def pypi(name):
    return json.loads(get(f"https://pypi.org/pypi/{name}/json"))["info"]["version"]


def crates(name):
    return json.loads(get(f"https://crates.io/api/v1/crates/{name}"))["crate"]["max_stable_version"]


def nuget(name):
    return newest(json.loads(get(f"https://api.nuget.org/v3-flatcontainer/{name.lower()}/index.json"))["versions"])


def maven(group, artifact):
    xml = get(f"https://repo1.maven.org/maven2/{group.replace('.', '/')}/{artifact}/maven-metadata.xml")
    return newest(re.findall(r"<version>([^<]+)</version>", xml))


def npm(name):
    return json.loads(get(f"https://registry.npmjs.org/{name}/latest"))["version"]


def tags(repo):
    out = subprocess.run(["git", "ls-remote", "--tags", "--refs", f"{ORG}/{repo}.git"], capture_output=True, text=True, timeout=30, check=True).stdout
    return newest([line.split("refs/tags/")[-1] for line in out.splitlines()])


def sources():
    s = {
        "python": lambda: pypi("goome"),
        "cli": lambda: pypi("goome-cli"),
        "crates": lambda: crates("goome"),
        "nuget": lambda: nuget("GoomeSharp"),
        "maven": lambda: maven("io.github.goome-ui", "goome"),
        "npm": lambda: npm("goome"),
    }
    for key, repo in TAG_REPOS.items():
        s[key] = (lambda r: lambda: tags(r))(repo)
    return s


def fetch(cache=None):
    old = {}
    if cache:
        try:
            old = json.load(open(cache))
        except Exception:
            old = {}
    out = {}
    for key, fn in sources().items():
        try:
            val = fn()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                print(f"versions: {key} failed ({e})", file=sys.stderr)
            val = None
        except Exception as e:
            print(f"versions: {key} failed ({e})", file=sys.stderr)
            val = None
        if val is None:
            val = old.get(key)
        if val:
            out[key] = val
    if cache:
        try:
            with open(cache, "w") as f:
                json.dump(out, f, sort_keys=True)
        except OSError:
            pass
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache")
    a = ap.parse_args()
    print(json.dumps(fetch(a.cache), sort_keys=True))
