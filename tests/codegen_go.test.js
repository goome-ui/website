const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { X, GM, docs } = require("./load.js");

const gen = (p) => X.generate(p, "go");

function everything(mode) {
  const p = GM.starterProject();
  p.mode = mode;
  p.title = "cov \"go\"";
  p.vars = [];
  for (const [name, type] of [["n", "int"], ["f", "float"], ["on", "bool"], ["txt", "string"], ["col", "color"], ["names", "list"]]) p.vars.push(GM.newVar(p, type, name));
  const win = GM.newNode("window", p);
  for (const type of Object.keys(GM.TYPES)) {
    if (type === "el" || type === "window") continue;
    const n = GM.newNode(type, p);
    if (type === "button") n.on = { click: GM.ACTION_KINDS ? Object.keys(GM.ACTION_KINDS).map((k) => GM.newAction(k)) : [] };
    win.kids[0].push(n);
  }
  const defs = GM.sampleElements().concat(GM.TEMPLATES());
  p.elements = defs;
  for (const d of defs) win.kids[0].push({ id: GM.uid(), type: "el", p: { el: d.id, var: d.name, x: 0, y: 0, w: 0, h: 0, params: {}, init: {} } });
  p.root = mode === "app" ? [win] : [win];
  p.hotkeys = [{ id: "h1", combo: "alt+h", actions: [GM.newAction("quit")] }];
  return p;
}

const named = () => {
  const p = GM.starterProject();
  p.vars = ["type", "fn", "end", "local", "class", "func", "range", "map", "chan", "go", "defer", "var", "select", "string", "len", "init", "s", "ui"].map((n) => GM.newVar(p, "int", n));
  const win = p.root[0];
  win.kids[0] = p.vars.map((v) => Object.assign(GM.newNode("slider_int", p), { p: Object.assign(GM.newNode("slider_int", p).p, { bind: v.id, label: v.name }) }));
  return p;
};

const braces = (code) => {
  let d = 0;
  for (const ch of code.replace(/"(\\.|[^"\\])*"/g, '""')) {
    if (ch === "{") d++;
    if (ch === "}") d--;
    assert.ok(d >= 0);
  }
  return d;
};

const gofmt = (code) => {
  const r = spawnSync("gofmt", ["-e"], { input: code, encoding: "utf8" });
  return r.error ? null : r;
};

const all = docs().concat([["everything overlay", everything("overlay")], ["everything app", everything("app")], ["keyword names", named()]]);

test("go is registered", () => {
  assert.equal(X.langs.go.label, "Go");
  assert.equal(X.langs.go.ext, ".go");
  assert.match(X.hint(GM.starterProject(), "go"), /go run/);
});

for (const [name, project] of all) {
  test("go: " + name, () => {
    const r = gen(project);
    assert.ok(r.code.length > 200);
    assert.equal(r.file, "main.go");
    assert.match(r.code, /^package main\n/);
    assert.match(r.code, /"github.com\/goome-ui\/go-goome"/);
    assert.equal(braces(r.code), 0);
    assert.equal(r.code, gen(project).code);
    assert.ok(!/^\s*\/\//m.test(r.code));
    assert.ok(!/\[object Object\]|undefined|NaN/.test(r.code));
    assert.ok(!/\bs\.(type|func|range|map|chan|go|defer|var|select|package|default|case|switch|const|import|struct|goto|else|if|for|return|break|continue)\b/.test(r.code));
    assert.match(r.code, project.mode === "app" ? /goome\.NewApp\(.*\)\n[\s\S]*app\.Run\(draw\)/ : /goome\.Open\(goome\.Options\{Title: .*NoCapture: true\}\)[\s\S]*g\.Events\(wait\)/);
    const f = gofmt(r.code);
    if (f) assert.equal(f.status, 0, f.stderr);
  });
}

test("go: real names and argument orders", () => {
  const code = gen(everything("overlay")).code;
  for (const s of ["ui.Window(", "ui.SliderFmt(", "ui.Combo(", "ui.Tabs(", "ui.Table(", "ui.PlotLines(", "ui.Image(placeholder", "ui.Menubar()", "ui.MenuItem(", "ui.TextEdit(", "ui.Toast(", "ui.Custom(", "ui.Store(id, ", "ui.ID(id)", "c.RRect(", "c.Arc(", "host.Push(goome.Event{Type: goome.EventClose})", "g.Hotkey(combo, i+1)"]) assert.ok(code.includes(s), s);
  assert.match(code, /ui\.Radio\("[^"]*", &s\.\w+, \d\)/);
  assert.match(code, /ui\.Split\("[^"]+", s\.\w+\)/);
  assert.match(code, /if ui\.Window\("[^"]*", s\.\w+, goome\.WinMove\|/);
});

test("go: app and overlay entry points", () => {
  const app = GM.starterProject();
  app.mode = "app";
  app.app.titlebar = true;
  app.app.statusbar = true;
  app.hotkeys = [{ id: "h", combo: "ctrl+k", actions: [GM.newAction("quit")] }];
  const a = gen(app).code;
  assert.match(a, /goome\.NewApp\("goome ui", 960, 640, goome\.AppTitlebar\|goome\.AppStatusbar\)/);
  assert.match(a, /app\.Options = goome\.Options\{WindowFlags: goome\.WindowResizable \| goome\.WindowBorderless/);
  assert.match(a, /a\.G\.Hotkey\(combo, i\+1\)/);
  assert.match(a, /ui\.Statusbar\(/);
  app.mode = "overlay";
  const o = gen(app).code;
  assert.match(o, /goome\.NewPacer\(60\)/);
  assert.match(o, /ui\.Begin\(0\) == nil/);
  assert.match(o, /g\.Hotkey\(combo, i\+1\)/);
});

test("go: unsupported things warn", () => {
  const p = GM.starterProject();
  p.root.push(GM.newNode("label", p));
  p.root[0].kids[0].push({ id: "x", type: "el", p: { el: "gone", var: "g", x: 0, y: 0, w: 0, h: 0, params: {}, init: {} } });
  const r = gen(p);
  assert.ok(r.warnings.some((w) => /overlay canvas/.test(w.msg)));
  assert.ok(r.warnings.some((w) => /gone from the library/.test(w.msg)));
});

test("go: expressions keep types straight", () => {
  const p = GM.starterProject();
  const n = GM.newVar(p, "int", "n");
  const on = GM.newVar(p, "bool", "on");
  p.vars = [n, on];
  const b = GM.newNode("button", p);
  b.on = { click: [Object.assign(GM.newAction("set"), { var: "n", value: "on ? n * 2 : 10 / 4" }), Object.assign(GM.newAction("set"), { var: "on", value: "n > 2 && !on" })] };
  p.root[0].kids[0] = [b];
  const code = gen(p).code;
  assert.match(code, /s\.n = int\(pick\[float64\]\(s\.on, float64\(s\.n\)\*2, 2\.5\)\)/);
  assert.match(code, /s\.on = float64\(s\.n\) > 2 && s\.on == false|s\.on = float64\(s\.n\) > 2 && !s\.on/);
  assert.match(code, /func pick\[T any\]/);
});
