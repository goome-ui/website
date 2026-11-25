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
