const test = require("node:test");
const assert = require("node:assert");
const vm = require("vm");
const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const { X, GM, docs } = require("./load.js");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function coverage() {
  const p = GM.starterProject();
  const V = (name, type, def, min, max) => {
    const v = { id: GM.uid("v"), name, type, def, min: min == null ? 0 : min, max: max == null ? (type === "int" ? 100 : 1) : max };
    p.vars.push(v);
    return v;
  };
  let k = 0;
  const N = (type, props, kids) => {
    const n = GM.newNode(type, null);
    Object.assign(n.p, props || {});
    if (n.p.var && n.p.var === GM.TYPES[n.type].p.var) n.p.var += "_" + ++k;
    if (kids) n.kids = Array.isArray(kids[0]) ? kids : [kids];
    const cnt = GM.slotCount(n);
    if (cnt) while (n.kids.length < cnt) n.kids.push([]);
    return n;
  };
  const B = (type, v, props, kids) => N(type, Object.assign({ bind: v.id, var: "w_" + ++k }, props || {}), kids);
  const A = (d, o) => Object.assign(GM.newAction(d), o || {});
  const on = (n, ev, ...acts) => {
    n.on = Object.assign(n.on || {}, { [ev]: acts });
    return n;
  };

  const vOpen = V("class", "bool", true), vOn = V("let", "bool", false), vNum = V("function", "int", 3, 0, 10), vF = V("delete", "float", 0.5, 0, 1);
  const vStr = V("arguments", "string", "hi"), vCol = V("undefined", "color", 0xFF4FA3FF), vList = V("eval", "list", "one\ntwo\nthree"), vSel = V("goome", "int", 0, 0, 2);
  const vTab = V("process", "int", 0, 0, 1), vTree = V("console", "bool", true), vModal = V("require", "bool", false), vPop = V("module", "bool", false), vChk = V("on_click", "bool", true);
  const vFloat2 = V("ui", "float", 2.5, 0, 5), vCount = V("g", "int", 7, 0, 99);

  const alt = GM.normTheme({ name: "alt", base: "light", accent: 0xFFC0572B });
  p.themes.push(alt);
  p.theme = GM.normTheme(Object.assign({}, GM.PRESETS[2], { skin_button: { img: PNG, file: "btn.png", l: 1, t: 1, r: 1, b: 1 }, skin_slider_track: { img: PNG, file: "track.png", l: 1, t: 1, r: 1, b: 1 }, icons: { close: { img: PNG, file: "close.png" } }, icon_tint: 1, font_mono: "monospace", accent: 0xFFFF8800 }));
  p.config = GM.normConfig({ tip_delay_ms: 100, dbl_click_ms: 300, raise_on_click: 0, scroll_lines: 5, mask: "#", cursor: { button: "HAND" }, keys: { copy: "ctrl+c", paste: "" } });
  p.hotkeys = [{ id: GM.uid("h"), combo: "alt+h", actions: [A("toggle", { var: "class" })] }, { id: GM.uid("h"), combo: "ctrl+shift+q", actions: [A("quit"), A("copy", { text: "bye {arguments}" })] }];

  const pill = GM.sampleElements();
  const tpl = GM.TEMPLATES();
  const rich = GM.newElement("rich_thing");
  rich.w = 160, rich.h = 90, rich.hit = "parts";
  rich.resizable = { on: true, minW: 60, minH: 40, maxW: 300, maxH: 200 };
  rich.params.push({ name: "default", type: "num", def: 3 }, { name: "label", type: "text", def: "hey" }, { name: "tint", type: "color", def: 0xFF112233 }, { name: "flag", type: "bool", def: true });
  rich.state.push({ name: "count", type: "num", def: 1 }, { name: "armed", type: "bool", def: false });
  rich.value = { src: "state", state: "count", part: "", axis: "x", min: 0, max: 1 };
  const part = (kind, f, extra) => Object.assign(GM.newPart(kind), extra || {}, { f: Object.assign(GM.newPart(kind).f, f) });
  const grp = part("group", { x: 4, y: 4, w: 80, h: 40, clip: true }, { name: "box" });
  grp.drag = { on: true, axis: "free", snap: 4, bounds: "rect", rect: { x: 0, y: 0, w: 160, h: 90 }, handle: "" };
  grp.kids.push(part("rect", { x: 0, y: 0, w: 80, h: 40, color: "tint" }, { hit: true }), part("text", { x: 2, y: 2, size: 12, text: "{label}", color: "th.text" }));
  const wslider = part("widget", {}, { name: "w1" });
  wslider.w = N("slider", { label: "amt", min: 0, max: 5, value: 1 });
  const wcheck = part("widget", {}, { name: "w2" });
  wcheck.w = N("checkbox", { label: "chk", on: true });
  const wcol = part("widget", {}, { name: "w3" });
  wcol.w = N("color", { label: "col" });
  const extras = ["slider_int", "radio", "combo", "selectable", "progress", "plot_lines", "plot_bars", "table", "image", "toggle", "label", "button", "input", "tabs"].map((t) => {
    const w = part("widget", {}, { name: "x_" + t });
    w.w = N(t, t === "button" ? { label: "go", action: "print" } : {});
    return w;
  });
  rich.parts.push(
    part("rect", { x: 0, y: 0, w: "w", h: "h", color: "armed ? th.accent : th.panel" }, { name: "bg" }),
    part("rrect", { x: 2, y: 2, w: 30, h: 20, tl: 4, tr: 4, br: 2, bl: 2, color: "0xFF223344" }),
    part("frame", { x: 0, y: 0, w: "w", h: "h", width: 1, color: "th.border" }),
    part("line", { x0: 0, y0: 0, x1: "w", y1: "h", width: 1, color: "th.text_dim" }),
    part("circle", { cx: 40, cy: 40, r: "min(default, 10)", color: "hovered ? #ff0000 : #00ff00" }),
    part("ring", { cx: 40, cy: 40, r: 12, width: 2, color: "th.text" }, { show: "flag && !pressed" }),
    part("arc", { cx: 40, cy: 40, r: 12, width: 2, a0: 0, a1: "count * 2", color: "th.accent" }),
    part("poly", { points: "0,30 30,0 60,30", color: "th.accent" }),
    part("grad", { x: 0, y: 0, w: 40, h: 20, radius: 4, from: "th.accent", to: "th.panel", sideways: true }),
    part("shadow", { x: 0, y: 0, w: 40, h: 20, radius: 4, blur: 8, color: "th.shadow" }),
    part("bitmap", { x: 0, y: 0, w: 16, h: 16, radius: 2, tint: 0xFFFFFFFF, img: PNG, file: "dot.png" }),
    part("bitmap", { x: 20, y: 0, w: 16, h: 16, radius: 0, tint: "tint", img: "", file: "gone.png" }),
    grp, wslider, wcheck, wcol, ...extras,
    part("hit", { x: 0, y: 0, w: 30, h: 30 }));
  rich.events.push({ on: "enter", act: "print", target: "", expr: "", text: "in" }, { on: "leave", act: "toggle", target: "armed", expr: "", text: "" },
    { on: "press", act: "add", target: "count", expr: "abs(-1)", text: "" }, { on: "drag", act: "set", target: "count", expr: "count > 3 ? 0 : count + 1", text: "" },
    { on: "click", act: "set", target: "armed", expr: "!armed && count < 5", text: "" }, { on: "release", act: "print", target: "", expr: "", text: "up" });
  const inst = (def, props) => N("el", Object.assign({ el: def.id, var: def.name }, props || {}));

  const cell = N("window", { label: "cells {delete}", var: "cells", x: 400, y: 20, w: 300, h: 0, bind: vOpen.id, close: true });
  const kids = [];
  const add = (...ns) => kids.push(...ns);
  add(N("heading", { label: "Heading {delete}" }), N("label", { label: "val {function} {arguments} {undefined} {eval} {class} {nothere} 100% `tick` ${x}", tooltip: "tip" }), N("wrapped", { label: "wrapped text" }));
  add(N("row", { cols: 2 }, [N("button", { label: "A", action: "toast", toast: "hi {function}", ms: 800 }), N("button", { label: "B", action: "print" })]));
  add(N("same_line"), N("space", { px: 5 }), N("separator"));
  add(on(on(N("button", { label: "events", action: "" }), "click", A("set", { var: "function", value: "function + 1.5" }), A("set", { var: "arguments", value: "n={function}" }), A("set", { var: "undefined", value: "0xFF00FF00" }),
    A("set", { var: "class", value: "!class" }), A("toggle", { var: "let" }), A("add", { var: "function", value: "2" }), A("sub", { var: "delete", value: "0.1" }), A("add", { var: "g", value: "g / 2" }),
    A("open", { target: cell.id }), A("close", { target: cell.id }), A("toast", { text: "t {g}", ms: 0 }), A("tab", { target: "x", tab: 1 }), A("copy", { text: "c" }), A("call", { fn: "on_click" }), A("call", { fn: "class" }), A("quit")), "hover", A("toast", { text: "hover" })));
  add(on(B("checkbox", vOn, { label: "check", tooltip: "tt" }), "change", A("toast", { text: "chg" })), on(N("toggle", { label: "own toggle", var: "own_t", on: true }), "on", A("toast", { text: "on" })));
  add(on(N("checkbox", { label: "own check", var: "own_c" }), "off", A("toast", { text: "off" })));
  add(on(N("radio", { var: "rad", items: "a\nb\nc", sel: 1, inline: true }), "change", A("toast", { text: "r" })), B("radio", vSel, { items: "", itemsVar: vList.id, inline: true }));
  add(on(B("slider", vF, { label: "f", min: 0, max: 1, fmt: "%.2f", width: 90 }), "change", A("toast", { text: "s" })), B("slider", vCount, { label: "as int", min: 0, max: 99 }), B("slider_int", vCount, { label: "i", min: 0, max: 99 }), N("slider", { label: "own f", var: "of", min: -1, max: 1, value: 0.25 }), N("slider_int", { label: "own i", var: "oi", min: 0, max: 9, value: 3 }));
  add(on(B("input", vStr, { label: "in", cap: 32, hint: "hint", password: true, enter: true }), "enter", A("toast", { text: "e" })), N("input", { label: "plain", var: "plain", text: "abc", cap: 8 }), on(B("input", vStr, { label: "numeric", number: true, readonly: true, noselect: true }), "change", A("toast", { text: "c" })));
  add(B("text_edit", vStr, { h: 80, cap: 512, readonly: true, numbers: true, wrap: false, mono: true }), N("text_edit", { var: "scratch", text: "own", h: 50 }));
  add(on(B("combo", vSel, { label: "combo", itemsVar: vList.id }), "change", A("toast", { text: "c" })), N("combo", { label: "own combo", var: "oc", items: "x\ny" }), N("combo", { label: "empty", var: "ec", items: "" }));
  add(on(B("selectable", vSel, { itemsVar: vList.id }), "change", A("toast", { text: "c" })), N("selectable", { var: "os", items: "p\nq" }), N("selectable", { var: "es", items: "" }));
  add(B("color", vCol, { label: "col" }), N("color", { label: "own col", var: "ocol", color: 0xFFAA5500 }));
  add(B("progress", vF, { label: "pct" }), B("progress", vCount, {}), N("progress", { value: 0.3, label: "" }), N("progress", { value: 0.7, label: "{function} done" }));
  add(N("table", { var: "t1", cols: "Name\nSize:90", rows: "a, 1\nb\nc, 3, 4", h: 60, sortable: true, resizable: true, stripes: false, borders: true }), N("table", { var: "t2", cols: "", rows: "" }));
  add(N("plot_lines", { label: "pl", var: "p1", values: "1 2 3, 4", min: 0, max: 5, h: 40 }), N("plot_bars", { label: "pb", var: "p2", values: "", min: 0, max: 0, h: 30 }));
  add(on(N("image", { w: 40, h: 30, radius: 4 }), "hover", A("toast", { text: "img" })), on(N("label", { label: "hov" }), "hover", A("toast", { text: "h" })));
  add(inst(pill[0], { x: 0, y: 0 }), N("space", { px: 2 }));
  const tabs = B("tabs", vTab, { items: "One\nTwo" }, [[N("label", { label: "t1" })], [N("label", { label: "t2" }), N("separator")]]);
  add(on(tabs, "change", A("toast", { text: "tab" })), N("tabs", { var: "tabs2", items: "Only", sel: 0 }, [[N("label", { label: "only" })]]), B("tabs", vTab, { items: "", itemsVar: vList.id }, [[N("label", { label: "l0" })], [], [N("label", { label: "l2" })]]));
  add(on(B("collapsing", vChk, { label: "coll" }, [N("label", { label: "inside" })]), "change", A("toast", { text: "c" })), N("collapsing", { label: "own coll", var: "oco", open: false }, [N("label", { label: "in2" })]));
  add(on(B("tree", vTree, { label: "tree" }, [N("label", { label: "leaf" })]), "change", A("toast", { text: "t" })), N("tree", { label: "own tree", var: "otree", open: false }, [N("label", { label: "leaf2" })]));
  add(N("scroll", { var: "sc", h: 50 }, [N("label", { label: "scrolled" }), N("label", { label: "more" })]));
  add(N("split", { var: "sp", frac: 0.4, vertical: true }, [[N("label", { label: "left" })], [N("label", { label: "right" })]]));
  add(B("modal", vModal, { label: "modal", button: "open it" }, [N("wrapped", { label: "modal body" }), N("button", { label: "ok", action: "close" })]), N("modal", { label: "own modal", var: "om", button: "" }, [N("label", { label: "x" })]));
  add(N("button", { label: "pop", action: "" }), B("popup", vPop, { label: "pop" }, [N("label", { label: "popped" }), N("button", { label: "shut", action: "close" })]), N("popup", { label: "pop2" }, []));
  add(Object.assign(N("label", { label: "pinned" }), { abs: { x: 10, y: 20, w: 100, h: 20 } }));
  const styled = N("button", { label: "styled", action: "print" });
  styled.style = { c: { accent: 0xFFFF0000, text: 0xFF00FF00 }, n: { radius: 2, align: 2, ease: 4 }, radii: [1, 2, 3, 4], theme: alt.id };
  add(styled);
  const stack = N("split", { var: "sp2", frac: 0.5 }, [[N("label", { label: "s0" })], [N("label", { label: "s1" })]]);
  stack.slotStyle = { 0: { c: { panel: 0xFF101010 } }, 1: { n: { pad: 2 } } };
  add(stack);
  const gated = N("slider", { label: "gated", var: "gated", min: 0, max: 1, value: 0.5, showIf: "let && function > 1", enableIf: "!let || (function > 2 ? true : false)" });
  add(gated, N("checkbox", { label: "bad show", var: "bs", showIf: "nope +" }), N("checkbox", { label: "bad enable", var: "be", enableIf: "unknown" }), N("button", { label: "dead", action: "" }));
  add(B("checkbox", vF, { label: "wrong type" }), B("slider", vStr, { label: "wrong" }));
  cell.kids = [kids];

  const bar = N("menubar", {}, [N("menu", { label: "File" }, [on(N("menu_item", { label: "Open", shortcut: "Ctrl+O" }), "click", A("toast", { text: "open" })), N("menu_item", { label: "Plain" }), N("menu_sep"),
    B("menu_item", vTree, { label: "Checked", check: true, shortcut: "Ctrl+B" }), on(N("menu_item", { label: "Own", check: true, var: "own_mi", on: true }), "click", A("toast", { text: "own" }))])]);
  const sidewin = N("window", { label: "side", var: "side", x: 20, y: 20, w: 200, h: 100, move: false, resize: false, collapse: false, notitle: true });
  sidewin.kids = [[bar, N("label", { label: "side window" }), inst(pill[1]), inst(tpl[0], { w: 80, h: 80, params: {}, init: { level: 0.9 } }), inst(rich, { params: { default: 5, label: "yo", tint: 0xFF00AA00, flag: false }, init: { count: 2, armed: true } }), inst(tpl[1]), inst(tpl[2], { params: { title: "T" } })]];
  p.root = [cell, sidewin, inst(tpl[3], { x: 500, y: 500 }), inst(tpl[4], { x: 500, y: 560, params: { color: 0xFFAA2200 } }), inst(tpl[5], { x: 500, y: 620 }), N("label", { label: "not a window" })];
  p.elements = [].concat(pill, tpl, [rich]);

  const app = JSON.parse(JSON.stringify(p));
  app.mode = "app";
  app.title = "app mode";
  app.app = { w: 800, h: 500, titlebar: true, menubar: true, statusbar: true, nopad: true, status: "{function} items" };
  app.root = app.root.filter((n) => n.type !== "window" && n.type !== "el" && n.type !== "label").concat(cell.kids[0]);
  app.theme = GM.normTheme(Object.assign({}, GM.PRESETS[1], { quick: { accent: 0xFF3366FF, dark: false, radius: 6, scale: 1.5 } }));
  app.settings = Object.assign({}, GM.SETTINGS_DEFAULT, { iconSource: "file", indent: 2 });
  const plain = GM.starterProject();
  plain.theme = GM.normTheme(GM.PRESETS[3]);
  plain.root = [];
  const full = GM.starterProject();
  const ft = { name: "full", base: "dark", icon_tint: 1, font_heading: "serif", font_mono: "monospace", font_small: "sans", icons: {} };
  GM.THEME_COLORS.forEach((c, i) => (ft[c] = (0xFF000000 | (i * 2654435)) >>> 0));
  GM.THEME_SIZES.forEach((c) => (ft[c] = GM.THEME_REST[c] === undefined ? GM.DARK[c] + 1 : GM.THEME_REST[c] + 1));
  Object.assign(ft, { align: 2, ease: 4 });
  GM.THEME_SKINS.concat(GM.EXTRA_SKINS).forEach((c) => (ft[c] = { img: PNG, file: c + ".png", l: 1, t: 2, r: 3, b: 4 }));
  GM.ICON_NAMES.forEach((c) => (ft.icons[c] = { img: PNG, file: c + ".png" }));
  full.theme = GM.normTheme(ft);
  const fc = { mask: "@", cursor: {}, keys: {} };
  GM.CFG_NUMS.forEach(([c, d, lo]) => (fc[c] = lo + 1));
  GM.CFG_TOGGLES.forEach(([c, d]) => (fc[c] = d ? 0 : 1));
  GM.CFG_CURSORS.forEach(([c]) => (fc.cursor[c] = "NO"));
  GM.CFG_KEYS.forEach(([c]) => (fc.keys[c] = "ctrl+q"));
  full.config = GM.normConfig(fc);
  const presets = GM.PRESETS.map((t) => {
    const q = GM.starterProject();
    q.theme = GM.normTheme(t);
    return ["preset " + t.id, q];
  });
  const quick = GM.starterProject();
  quick.theme = GM.normTheme({ quick: { accent: 0xFF336699, dark: true, radius: 3, scale: 1 }, font_heading: "serif" });
  return [["coverage overlay", p], ["coverage app", GM.normProject(app)], ["empty overlay", plain], ["every theme field", full], ["quick theme", quick]].concat(presets);
}

const all = () => docs().concat(coverage());
const gen = (p) => X.generate(p, "node");
const compiles = (code) => assert.doesNotThrow(() => new vm.Script(code));

test("registered", () => {
  assert.strictEqual(X.langs.node.label, "Node");
  assert.strictEqual(X.langs.node.ext, ".js");
  assert.match(X.hint(GM.starterProject(), "node"), /node main\.js/);
});

test("every layout and coverage doc makes code that parses", () => {
  for (const [name, p] of all()) {
    const r = gen(p);
    assert.ok(r.code.length > 100, name);
    assert.match(r.code, /^"use strict";\nconst goome = require\("goome"\);\n/, name);
    assert.match(r.code, /process\.exitCode = main\(\);\n$/, name);
    compiles(r.code);
    assert.ok(!/^\s*(\/\/|\/\*)/m.test(r.code), name + " has a comment");
  }
});

test("output is deterministic", () => {
  for (const [name, p] of all()) assert.strictEqual(gen(p).code, gen(p).code, name);
});

test("real api names and argument order", () => {
  const [, o] = coverage()[0];
  const code = gen(o).code;
  const [, app] = coverage()[1];
  const acode = gen(app).code;
  for (const re of [
    /ui\.window\(`cells \$\{[^}]+\}`, window, goome\.WIN_MOVE \| goome\.WIN_RESIZE \| goome\.WIN_COLLAPSE \| goome\.WIN_CLOSE\)/,
    /ui\.windowEnd\(\);/, /ui\.slider\("f", \w+, 0, 1, "%\.2f"\)/, /ui\.sliderInt\("i", \w+, 0, 99\)/, /ui\.input\("plain", \w+, 8\)/,
    /ui\.inputEx\("in", \w+, goome\.INPUT_PASSWORD \| goome\.INPUT_ENTER_RETURNS, "hint", \d+\)/, /ui\.textEdit\("scratch", \w+, 50, goome\.EDIT_WRAP, 4096\)/,
    /ui\.combo\("own combo", \w+, \w+\)/, /ui\.tabs\("\w+", \w+, \w+\)/, /ui\.scrollBegin\("sc", 50\)/, /ui\.split\("sp", \w+\)/, /ui\.splitNext\(\)/,
    /ui\.table\("t1", 2, 60, goome\.TABLE_SORTABLE \| goome\.TABLE_RESIZABLE \| goome\.TABLE_BORDERS\)/, /ui\.tableColumn\("Size", 90\)/, /ui\.plotLines\("pl", \w+, 0, 5, 40\)/,
    /ui\.tree\("tree", \w+\)/, /ui\.modal\("modal", \w+\)/, /ui\.popupOpen\(/, /ui\.menuItem\("Checked", "Ctrl\+B", \w+\)/, /ui\.toast\(/, /ui\.style\(\{ /,
    /ui\.custom\("##el", s\[1\], s\[2\], goome\.ITEM_NO_HIT\)/, /c\.rrect\(/, /c\.fontText\(null, /, /c\.rrectGrad\(/, /c\.bitmap\(/, /c\.clipPush\(/,
    /G\.push\(goome\.CLOSE\)/, /G\.setClipboard\(/, /grabHotkeys\(g\)/, /goome\.open\(\{ title: "goome ui", noCapture: true \}\)/,
  ]) {
    assert.match(code, re);
  }
  for (const re of [/new goome\.App\(\{ title: "app mode", width: 800, height: 500, flags: goome\.APP_TITLEBAR \| goome\.APP_MENUBAR \| goome\.APP_STATUSBAR \| goome\.APP_NO_PAD, windowFlags: /, /app\.onStart\(/, /app\.frame\(draw\)/, /ui\.statusbar\(/, /t\.make\(0xFF3366FF, false, 6\)/, /ui\.scale\(1\.5\)/]) {
    assert.match(acode, re);
  }
});

test("names that are js keywords or globals stay valid", () => {
  const [, p] = coverage()[0];
  const code = gen(p).code;
  for (const bad of ["let", "function", "delete", "arguments", "undefined", "eval", "class", "process", "console", "require", "module"]) {
    assert.ok(!new RegExp("\\b(let|const) " + bad + " ").test(code), bad);
  }
  assert.match(code, /\blet letV = false;/);
  assert.match(code, /\blet functionV = 3;/);
  assert.match(code, /\blet moduleV = false;/);
});

test("things that cant export warn", () => {
  const [, p] = coverage()[0];
  const w = gen(p).warnings.map((x) => x.msg).join("\n");
  assert.match(w, /only windows and custom elements can sit on the overlay canvas/);
  assert.match(w, /theres no var called/);
  assert.match(w, /the tab target has to be a tabs node/);
  assert.match(w, /show if: ends too early/);
});

test("overlay without hotkeys has no hotkey code", () => {
  const code = gen(GM.starterProject()).code;
  assert.ok(!/hotkey/i.test(code));
  assert.match(code, /ui\.begin\(0\)/);
});

const real = process.env.NODE_GOOME;
test("generated programs run on the test backend", { skip: !real }, () => {
  const dir = fs.mkdtempSync(path.join(process.env.NODE_GOOME_TMP || os.tmpdir(), "gm-node-"));
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.symlinkSync(path.resolve(real), path.join(dir, "node_modules", "goome"));
  try {
    all().forEach(([name, p], i) => {
      const file = path.join(dir, "p" + i + ".js");
      fs.writeFileSync(file, gen(p).code);
      const env = Object.assign({}, process.env, { GOOME_BACKEND: "test", GOOME_TEST_SCRIPT: "screen 1280x720 1; 1 click 100,100; 3 click 300,200; 4 key ab; 6 hold 400,300 4; end 12" });
      const r = spawnSync(process.execPath, [file], { env, encoding: "utf8", timeout: 60000 });
      assert.strictEqual(r.status, 0, name + "\n" + r.stderr);
      assert.ok(!/Error/.test(r.stderr), name + "\n" + r.stderr);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

module.exports = { coverage };
