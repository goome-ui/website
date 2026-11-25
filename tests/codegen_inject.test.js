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
