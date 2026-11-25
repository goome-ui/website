const test = require("node:test");
const assert = require("node:assert");
const { X, GM } = require("./load.js");

const LANGS = ["c", "cs", "py", "java", "gd", "rust", "node", "go", "zig", "lua"];
const C = String.fromCharCode;
const N = (type, props) => {
  const n = GM.newNode(type, null);
  Object.assign(n.p, props || {});
  return n;
};
const project = (...nodes) => {
  const p = GM.starterProject();
  p.root[0].kids[0].push(...nodes);
  return p;
};
const each = (p, fn) => {
  for (const l of LANGS) fn(X.generate(JSON.parse(JSON.stringify(p)), l).code, l);
};

test("element param and state names cant carry code", () => {
  const e = GM.newElement("box");
  e.params.push({ name: "a); PWNED(); (", type: "color", def: 1 }, { name: "b\nPWNED()", type: "num", def: 1 }, { name: ["PWNED"], type: "bool", def: true }, { name: "fine_1", type: "text", def: "x" });
  e.state.push({ name: "c = PWNED()", type: "num", def: 0 }, { name: "Keep", type: "bool", def: false });
  e.parts.push(GM.newPart("rect"));
  const p = project(N("el", { el: e.id, var: "box1" }));
  p.elements = [e];
  each(p, (code, l) => assert.ok(!code.includes("PWNED"), l));
  const n = GM.normProject(JSON.parse(JSON.stringify(p))).elements[0];
  assert.deepStrictEqual(n.params.map((x) => x.name), ["a_pwned", "b_pwned", "v", "fine_1"]);
  assert.deepStrictEqual(n.state.map((x) => x.name), ["c_pwned", "Keep"]);
});

test("broken project files dont crash the generator", () => {
  const bad = (o) => Object.assign(GM.starterProject(), o);
  const e = GM.newElement("box");
  e.parts.push(null, 5, { kind: "widget", w: 7 }, { kind: "widget", w: { type: "slider", p: 3 } }, { kind: "group", kids: [null, "x"], f: 3 }, { kind: "constructor" });
  e.params.push(null, { name: "p", type: "toString" });
  e.events.push(null, 2, { on: "click", act: "set", target: { toString: 1 }, expr: [], text: {} });
  const odd = { type: "label", p: { label: { toString: 1 }, width: "wide", tooltip: [1], showIf: { valueOf: 2 }, bind: [] }, on: { click: 1, hover: [null, 2, { do: "toast", text: { toString: 3 } }] } };
  const docs = [
    bad({ root: [null, 5, "x", { type: "constructor" }, { type: "window", p: 7, kids: 3 }, { type: "window", kids: [[null, { type: "__proto__" }, odd, { type: "table", p: { cols: "a" + C(0x2028) + "b:90", rows: 5 } }, { type: "tabs", p: { items: {} }, kids: "x" }]] }] }),
    bad({ vars: [null, 3, { name: "a", type: "constructor" }, { name: "b", type: "int", def: { valueOf: 1 } }, { name: "c", type: "string", def: { toString: 1 } }], hotkeys: [null, { combo: "alt+h", actions: 5 }, { combo: "alt+j", actions: [null, { do: "toast", text: { toString: 2 } }] }] }),
    bad({ elements: [e, null, 4], root: [{ type: "window", kids: [[{ type: "el", p: { el: e.id, params: 5, init: "x" } }]] }] }),
    bad({ name: { toString: 1 }, title: { toString: 1 }, app: 5, theme: 7, themes: [null, 2], config: "x", settings: { indent: {} } }),
  ];
  for (const d of docs) each(d, (code, l) => assert.ok(code.length > 100, l));
});

test("slider format can only be one float conversion", () => {
  const withFmt = (f) => {
    const e = GM.newElement("box");
    const w = GM.newPart("widget");
    w.w = N("slider", { var: "inner", fmt: f });
    e.parts.push(w);
    const p = project(N("slider", { var: "s1", fmt: f }), N("el", { el: e.id, var: "box1" }));
    p.elements = [e];
    return p;
  };
  for (const f of ["ZZ%s", "ZZ%n", "ZZ%d", "ZZ%.2f %s", "ZZ%*f", "ZZ%lf", "ZZ%.2f%", "ZZ%5$f", "ZZ %"]) each(withFmt(f), (code, l) => assert.ok(!code.includes(f), l + " " + f));
  for (const f of ["%.3f", "%5.1f%%", "%g px", "ZZ 100%%", "%+08.3e"]) each(withFmt(f), (code, l) => assert.strictEqual(code.split('"' + f + '"').length, 3, l + " " + f));
  assert.strictEqual(GM.safeFmt("%s"), "");
  assert.strictEqual(GM.safeFmt(5), "");
  assert.strictEqual(GM.safeFmt("%.1f"), "%.1f");
});

test("control characters in text get escaped", () => {
  const txt = "a" + C(0) + "b" + C(1) + "c" + C(27) + "d" + C(0x7f) + "e" + C(0x85) + "f" + C(0x2028) + "g" + C(0x2029) + "h";
  const p = project(N("label", { label: txt }), N("button", { label: "{count} " + txt, tooltip: txt }), N("input", { var: "in1", text: txt, hint: txt }), N("combo", { var: "cb", items: txt + "\nz" }));
  p.vars.push({ id: "v1", name: "count", type: "int", def: 1 }, { id: "v2", name: "note", type: "string", def: txt });
  p.title = txt;
  const low = new RegExp("[" + C(0) + "-" + C(8) + C(11) + "-" + C(31) + C(0x7f) + "]");
  const high = new RegExp("[" + C(0x85) + C(0x2028) + C(0x2029) + "]");
  each(p, (code, l) => {
    assert.ok(!low.test(code), l);
    if (l !== "c" && l !== "lua") assert.ok(!high.test(code), l);
  });
  const u = (n) => "\\u" + n.toString(16).padStart(4, "0");
  const b = (n) => "\\u{" + n.toString(16) + "}";
  const want = {
    c: "a\\000b\\001c\\033d\\177e", lua: "a\\000b\\001c\\027d\\127e",
    rust: "a" + b(0) + "b" + b(1) + "c" + b(27) + "d" + b(0x7f) + "e" + b(0x85) + "f" + b(0x2028) + "g" + b(0x2029) + "h",
    zig: "a\\x00b\\x01c\\x1bd\\x7fe" + b(0x85) + "f" + b(0x2028) + "g" + b(0x2029) + "h",
  };
  const rest = "a" + u(0) + "b" + u(1) + "c" + u(27) + "d" + u(0x7f) + "e" + u(0x85) + "f" + u(0x2028) + "g" + u(0x2029) + "h";
  each(p, (code, l) => assert.ok(code.includes(want[l] || rest), l));
});
