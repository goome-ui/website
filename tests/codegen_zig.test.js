const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { X, GM, docs } = require("./load.js");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const gen = (pj) => X.generate(pj, "zig");

function build(mode) {
  const p = GM.starterProject();
  p.root = [];
  p.mode = mode;
  p.title = "coverage {zig}";
  p.vars = [];
  return p;
}
const addVar = (p, type, name, def, min, max) => {
  const v = { id: GM.uid("v"), name, type, def, min: min == null ? 0 : min, max: max == null ? 1 : max };
  p.vars.push(v);
  return v.id;
};
const node = (p, type, props, kids, on) => {
  const n = GM.newNode(type, p);
  Object.assign(n.p, props || {});
  if (kids) kids.forEach((k, i) => (n.kids[i] = k));
  if (on) n.on = on;
  return n;
};
const act = (kind, props) => Object.assign(GM.newAction(kind), props || {});

function widgets() {
  const p = build("overlay");
  const kw = ["type", "fn", "end", "local", "class", "align", "error", "i32", "u8", "try", "defer", "test", "const", "var", "pub", "std", "goome", "s", "u", "fmt"];
  const ids = {};
  for (const k of kw) ids[k] = addVar(p, "int", k, 3, 0, 9);
  ids.on = addVar(p, "bool", "on", true);
  ids.vol = addVar(p, "float", "vol", 0.5, 0, 1);
  ids.name = addVar(p, "string", "player", "sam {not a var}");
  ids.tint = addVar(p, "color", "tint", 0xFF336699);
  ids.fruit = addVar(p, "list", "fruit", "apple\nbanana\ncherry");
  ids.pick = addVar(p, "int", "pick", 1, 0, 2);
  ids.tab = addVar(p, "int", "tab", 0, 0, 2);
  ids.win = addVar(p, "bool", "win_open", true);
  ids.modal = addVar(p, "bool", "modal_open", false);
  ids.notes = addVar(p, "string", "notes", "line one\nline two");
  ids.pop = addVar(p, "bool", "pop_flag", false);
  const acts = ["set", "toggle", "add", "sub", "open", "close", "toast", "tab", "copy", "quit", "call"];
  const winKids = [];
  const modal = node(p, "modal", { label: "Sure {player}?", var: "m", button: "Ask" }, [[node(p, "label", { label: "vol {vol} #{tint} {on} {pick} {fruit}" })]]);
  const popup = node(p, "popup", { label: "more" }, [[node(p, "button", { label: "close it", action: "close" })]]);
  const target = node(p, "window", { label: "Other {player}", var: "other", close: true, notitle: false }, [[node(p, "label", { label: "hello" })]]);
  const clickAll = acts.map((k) => {
    const a = act(k, { var: "vol", value: "vol * 2 + (on ? 1 : 0) - min(3, abs(-2))", target: target.id, tab: 1, text: "hi {player}", ms: 900, fn: "do something" });
    if (k === "toggle") a.var = "on";
    if (k === "open" || k === "close") a.target = popup.id;
    if (k === "tab") a.target = "none";
    return a;
  });
  winKids.push(
    node(p, "heading", { label: "Heading {player}", tooltip: "tip" }, null, { hover: [act("toast")] }),
    node(p, "label", { label: "50% done {vol} {nothing}", width: 100 }, null, { hover: [act("quit")] }),
    node(p, "wrapped", { label: "wrapped text with {braces} and \"quotes\" \\ back" }),
    node(p, "separator"),
    node(p, "space", { px: 7 }),
    node(p, "row", { cols: 2 }, [[node(p, "button", { label: "A" }), node(p, "same_line"), node(p, "button", { label: "B", action: "toast", toast: "T {vol}", ms: 700 })]]),
    node(p, "button", { label: "Go" }, null, { click: clickAll, hover: [act("copy", { text: "x" })] }),
    node(p, "button", { label: "Plain" }),
    node(p, "button", { label: "Closer", action: "close" }),
    node(p, "checkbox", { label: "Check", var: "on", bind: ids.on }, null, { change: [act("toggle", { var: "on" })], on: [act("toast")], off: [act("toast", { text: "off" })], hover: [act("toast")] }),
    node(p, "toggle", { label: "Own toggle", var: "own_toggle", on: true }, null, { change: [act("set", { var: "own_toggle", value: "true" })] }),
    node(p, "radio", { var: "size", items: "S\nM\nL", sel: 1, inline: true }, null, { change: [act("toast")] }),
    node(p, "radio", { var: "list_radio", items: "x", itemsVar: ids.fruit, bind: ids.pick, inline: true }),
    node(p, "slider", { label: "Vol", var: "vol", bind: ids.vol, min: 0, max: 1, fmt: "%.1f" }, null, { change: [act("toast")] }),
    node(p, "slider", { label: "As int", bind: ids.type, min: 0, max: 9 }),
    node(p, "slider", { label: "Own", var: "own_slider", min: 0, max: 5, value: 2 }),
    node(p, "slider_int", { label: "Count", var: "count", min: 0, max: 10, value: 3 }),
    node(p, "slider_int", { label: "Bound", bind: ids.fn, min: 0, max: 9 }),
    node(p, "input", { label: "Name", var: "player_in", bind: ids.name }, null, { change: [act("toast")] }),
    node(p, "input", { label: "Secret", var: "secret", password: true, hint: "type {here}", enter: true }, null, { enter: [act("toast", { text: "entered" })], change: [act("toast")] }),
    node(p, "input", { label: "Num", var: "numfield", number: true, readonly: true, noselect: true }),
    node(p, "text_edit", { var: "editor", text: "abc", h: 90, wrap: true, numbers: true, mono: true, readonly: true }),
    node(p, "text_edit", { var: "notes_edit", bind: ids.notes, h: 60 }),
    node(p, "combo", { label: "Fruit", var: "fruit_combo", itemsVar: ids.fruit, bind: ids.pick }),
    node(p, "combo", { label: "Own combo", var: "oc", items: "one\ntwo", sel: 1 }),
    node(p, "selectable", { var: "sel", items: "one\ntwo\nthree", sel: 2 }, null, { change: [act("toast")] }),
    node(p, "selectable", { var: "sel_list", itemsVar: ids.fruit }),
    node(p, "color", { label: "Tint", var: "tint", bind: ids.tint }),
    node(p, "color", { label: "Own", var: "own_color", color: 0xFF112233 }),
    node(p, "progress", { value: 0.4, label: "40%" }),
    node(p, "progress", { bind: ids.fn, label: "bound {fn}" }),
    node(p, "progress", { bind: ids.vol }),
    node(p, "table", { var: "files", sortable: true, resizable: true, stripes: true, borders: true, h: 80 }),
    node(p, "table", { var: "empty_table", cols: "", rows: "" }),
    node(p, "plot_lines", { var: "cpu", values: "1 4 2 8" }),
    node(p, "plot_lines", { var: "none", values: "", label: "empty" }),
    node(p, "plot_bars", { var: "reqs", values: "3 1 2", max: 4 }),
    node(p, "image", { w: 50, h: 40, radius: 4 }, null, { hover: [act("toast")] }),
    node(p, "scroll", { var: "scroller", h: 60 }, [[node(p, "label", { label: "inside scroll" })]]),
    node(p, "split", { var: "panes", vertical: true, frac: 0.4 }, [[node(p, "label", { label: "left" })], [node(p, "label", { label: "right" })]]),
    node(p, "tabs", { var: "tabs_own", items: "One\nTwo\nThree", sel: 1 }, [[node(p, "label", { label: "t1" })], [node(p, "label", { label: "t2" })], [node(p, "label", { label: "t3" })]], { change: [act("toast")] }),
    node(p, "tabs", { var: "tabs_bound", bind: ids.tab, itemsVar: ids.fruit }, [[node(p, "label", { label: "a" })], [], [node(p, "label", { label: "c" })]]),
    node(p, "collapsing", { label: "More", var: "more", open: false }, [[node(p, "label", { label: "hidden" })]], { change: [act("toast")] }),
    node(p, "collapsing", { label: "Bound", bind: ids.on }, [[node(p, "label", { label: "x" })]]),
    node(p, "tree", { label: "Tree", var: "tr", open: true }, [[node(p, "label", { label: "leaf" })]], { change: [act("toast")] }),
    node(p, "tree", { label: "Bound tree", bind: ids.on }, [[node(p, "label", { label: "leaf2" })]]),
    node(p, "menu_item", { label: "Loose item", shortcut: "Ctrl+L" }),
    popup,
    modal,
    node(p, "modal", { label: "Bound modal", bind: ids.modal, var: "bm", button: "" }, [[node(p, "button", { label: "ok", action: "close" })]]),
  );
  const conds = node(p, "button", { label: "Conditional" });
  conds.p.showIf = "vol > 0.2 && !(fn == 3) || on";
  conds.p.enableIf = "count < 5 ? vol >= 0.5 : fn != 2";
  const bad = node(p, "label", { label: "bad expr" });
  bad.p.showIf = "nothing + 1";
  const styled = node(p, "button", { label: "Styled" });
  styled.style = { c: { accent: 0xFFFF0000, text: 0xFF00FF00 }, n: { radius: 3, pad: 4, align: 2 }, radii: [1, 2, 3, 4] };
  const absn = node(p, "button", { label: "Abs" });
  absn.abs = { x: 5, y: 6, w: 70, h: 0 };
  const ena = node(p, "input", { label: "Enabled?", var: "ei", text: "keep" });
  ena.p.enableIf = "on";
  const ensl = node(p, "slider", { label: "ens", var: "es" });
  ensl.p.enableIf = "on";
  winKids.push(conds, bad, styled, absn, ena, ensl);
  const w = node(p, "window", { label: "Everything {player}", var: "main", bind: ids.win, close: true, resize: true, collapse: true, notitle: true, x: 10, y: 20, w: 400, h: 500 }, [winKids]);
  w.slotStyle = {};
  p.root.push(w, target);
  p.hotkeys = [
    { combo: "alt+h", actions: [act("toggle", { var: "on" }), act("toast")] },
    { combo: "ctrl+shift+q", actions: [act("quit"), act("call", { fn: "other thing" })] },
    { combo: "f5", actions: [] },
  ];
  return p;
}

function appDoc() {
  const p = build("app");
  p.app = { w: 800, h: 500, titlebar: true, menubar: true, statusbar: true, nopad: true, status: "{count} items" };
  const cnt = addVar(p, "int", "count", 2, 0, 20);
  const tgl = addVar(p, "bool", "dark_mode", false);
  const win = node(p, "window", { label: "Floating", var: "floating", close: true }, [[node(p, "label", { label: "inside app" })]]);
  const popup = node(p, "popup", { label: "ctx" }, [[node(p, "label", { label: "pop" })]]);
  p.root.push(
    node(p, "menubar", {}, [[
      node(p, "menu", { label: "File" }, [[
        node(p, "menu_item", { label: "Open", shortcut: "Ctrl+O" }, null, { click: [act("open", { target: win.id })] }),
        node(p, "menu_item", { label: "Printed" }),
        node(p, "menu_sep"),
        node(p, "menu_item", { label: "Dark", check: true, var: "dm", on: true }, null, { click: [act("toast")] }),
        node(p, "menu_item", { label: "Bound dark", check: true, bind: tgl }),
        node(p, "menu_item", { label: "Quit", shortcut: "Ctrl+Q" }, null, { click: [act("quit")] }),
      ]]),
    ]]),
    node(p, "button", { label: "Add" }, null, { click: [act("add", { var: "count", value: "2" }), act("add", { var: "count", value: "count * 2" }), act("sub", { var: "count", value: "1" })] }),
    node(p, "button", { label: "Menu" }, null, { click: [act("open", { target: popup.id })] }),
    popup,
    win,
  );
  p.theme = GM.normTheme(Object.assign({}, GM.PRESETS[1], { quick: { accent: 0xFF3366FF, dark: false, radius: 6, scale: 1.25 }, font_heading: "Noto Sans" }));
  return p;
}

function themed() {
  const p = build("overlay");
  const t = GM.normTheme({ id: "warm", name: "Warm thing", base: "light", accent: 0xFFFF8800, radius: 3, align: 1, font_mono: "DejaVu Sans Mono" });
  p.themes = [t, GM.normTheme({ id: "warm", name: "Warm thing" })];
  p.theme = GM.normTheme(Object.assign({}, GM.PRESETS[3], {
    accent: 0xFF112233, pad: 14, skin_button: { img: PNG, file: "btn.png", l: 4, t: 4, r: 4, b: 4 }, skin_slider_track: { img: PNG, file: "track.png", l: 2, t: 2, r: 2, b: 2 },
    skin_menu: { img: "", file: "menu.png", l: 1, t: 1, r: 1, b: 1 },
    icons: { check: { img: PNG, file: "check.png" }, close: { img: "", file: "x.png" } }, icon_tint: 1, font_heading: "Cantarell",
  }));
  p.theme.skin_menu = { img: "", file: "menu.png", l: 1, t: 1, r: 1, b: 1, iw: 0, ih: 0 };
  p.config = GM.normConfig({
    tip_delay_ms: 100, scroll_lines: 5, esc_closes: false, focus_on_mouse: true, mask: "#",
    cursor: { button: "HAND", custom_xy: "WAIT" }, keys: { copy: "ctrl+c", paste: "", redo: "ctrl+y" },
  });
  const b = node(p, "button", { label: "Warm" });
  b.style = { theme: "warm", c: { accent: 0xFF00AA00 } };
  const b2 = node(p, "button", { label: "Gone" });
  b2.style = { theme: "missing" };
  const sk = node(p, "split", { var: "sp" }, [[b], [b2]]);
  sk.slotStyle = { 1: { theme: "warm" } };
  p.root.push(node(p, "window", { label: "Themed" }, [[sk, node(p, "toggle", { label: "t" }), node(p, "image", {})]]));
  p.settings = Object.assign({}, GM.SETTINGS_DEFAULT, { iconSource: "files" });
  return p;
}

function elementsDoc() {
  const p = build("overlay");
  const g = GM.newElement("gauge");
  g.w = 160;
  g.h = 90;
  g.hit = "parts";
  g.resizable = { on: true, minW: 50, minH: 30, maxW: 400, maxH: 300 };
  g.params.push({ name: "level", type: "num", def: 0.5 }, { name: "tint", type: "color", def: 0xFF00AAFF }, { name: "lit", type: "bool", def: true }, { name: "caption", type: "text", def: "pi\"e" });
  g.state.push({ name: "open", type: "bool", def: false }, { name: "count", type: "num", def: 2 });
  const part = (kind, f, extra) => Object.assign(GM.newPart(kind), { name: kind + "_p" }, extra || {}, { f: Object.assign(GM.newPart(kind).f, f) });
  const kids = [part("circle", { cx: 5, cy: 5, r: "count + 1", color: "tint" }), part("text", { text: "{caption}", size: 12 })];
  const grp = part("group", { x: 4, y: 4, w: 40, h: 30, clip: true }, { kids });
  grp.drag = { on: true, axis: "free", snap: 5, bounds: "rect", rect: { x: 0, y: 0, w: 150, h: 80 }, handle: kids[0].id };
  const grp2 = part("group", { x: 50, y: 4, w: 20, h: 20 }, { name: "slide", kids: [part("rect", { w: 20, h: 20, color: "0xFF00FF00" })] });
  grp2.drag = { on: true, axis: "y", snap: 0, bounds: "element", rect: { x: 0, y: 0, w: 1, h: 1 }, handle: "" };
  const wid = (type, props) => Object.assign(GM.newPart("widget"), { name: type + "_w", w: node(p, type, props) });
  g.parts.push(
    part("rect", { x: 0, y: 0, w: "w", h: "h", color: "lit ? th.accent : #336699" }),
    part("rrect", { w: "w", h: "h", tl: 4, tr: 4, br: 4, bl: 4, color: "th.panel" }, { show: "hovered || pressed" }),
    part("frame", { w: "w - 1", h: "h - 1", color: 0xFF112233 }),
    part("line", { x0: 0, y0: 0, x1: "w", y1: "h", color: "th.border" }, { hit: true }),
    part("circle", { cx: "w / 2", cy: "h / 2", r: "min(w, h) / 3", color: "open ? th.accent : th.text_dim" }),
    part("ring", { cx: 20, cy: 20, r: 8 }),
    part("arc", { cx: 40, cy: 40, r: 12, a0: 0, a1: "level * 6.28" }),
    part("poly", { points: "0,0 20,0 10,15" }),
    part("poly", { points: "1,1" }),
    part("grad", { w: 30, h: 10, radius: 2, sideways: true }),
    part("shadow", { w: 30, h: 10, color: "th.shadow" }),
    part("bitmap", { w: 16, h: 16, img: PNG, file: "icon.png", radius: 2 }),
    part("bitmap", { w: 16, h: 16, file: "other.png", tint: "" }, { name: "other_bm" }),
    part("text", { x: 4, y: 4, size: "th.font_size", text: "caption" }),
    part("text", { text: "{missing}" }),
    part("hit", { x: 0, y: 0, w: "w", h: "h" }),
    grp,
    grp2,
    wid("slider", { label: "inner", var: "iv", min: 0, max: 3 }),
    wid("checkbox", { label: "ck", var: "ic", on: true }),
    wid("toggle", { label: "tg", var: "it" }),
    wid("color", { label: "cl", var: "icol" }),
    wid("combo", { label: "cb", var: "icb", items: "a\nb" }),
    wid("slider_int", { label: "si", var: "isi" }),
    wid("radio", { var: "irad", items: "p\nq" }),
    wid("plot_lines", { var: "ipl", values: "1 2 3" }),
    wid("input", { var: "iin" }),
    wid("window", { var: "iwin" }),
    part("rect", { w: "oops +", color: "th.nothing" }),
  );
  g.events.push(
    { on: "enter", act: "print", target: "", expr: "", text: "in {x}" },
    { on: "leave", act: "toggle", target: "open", expr: "", text: "" },
    { on: "press", act: "add", target: "count", expr: "1", text: "" },
    { on: "drag", act: "set", target: "count", expr: "count * 2", text: "" },
    { on: "click", act: "set", target: "open", expr: "!open", text: "" },
    { on: "click", act: "add", target: "open", expr: "1", text: "" },
    { on: "release", act: "toggle", target: "missing", expr: "", text: "" },
  );
  g.value = { src: "state", state: "count", part: "", axis: "x", min: 0, max: 1 };
  const g2 = GM.newElement("class");
  g2.params.push({ name: "type", type: "num", def: 1 });
  g2.parts.push(part("rect", { w: "type * 10", h: 5 }));
  const v = addVar(p, "float", "val", 0);
  const elN = (def, props, on) => Object.assign(node(p, "el", Object.assign({ el: def.id }, props), null, on), {});
  const sample = GM.sampleElements().map((e) => GM.normElement(e));
  p.elements = [GM.normElement(g), GM.normElement(g2)].concat(sample);
  const inst = [
    elN(g, { var: "g1", w: 200, h: 100, params: { level: 0.9, tint: 0xFF010203, lit: false, caption: "hey" }, init: { open: true, count: 4 } }, { click: [act("toast")], change: [act("toast")], dragend: [act("toast")], hover: [act("toast")] }),
    elN(g, { var: "g2" }),
    elN(g2, { var: "cl", params: { type: 3 } }),
    elN(sample[0], { var: "sw", params: { on_color: 0xFF00FF00 } }, { change: [act("set", { var: "val", value: "1" })] }),
    elN(sample[1], { var: "ks", w: 300 }),
    node(p, "el", { el: "gone", var: "ghost" }),
  ];
  p.root.push(node(p, "window", { label: "Elements" }, [inst.slice(0, 4).concat(node(p, "label", { label: "{val}" }))]), inst[4], inst[5]);
  return p;
}

const all = () => docs().concat([["widgets", widgets()], ["app", appDoc()], ["themed", themed()], ["elements", elementsDoc()]]);

if (process.env.ZIG_DUMP) {
  fs.mkdirSync(process.env.ZIG_DUMP, { recursive: true });
  for (const [name, pj] of all()) fs.writeFileSync(path.join(process.env.ZIG_DUMP, name.replace(/\W+/g, "_") + ".zig"), gen(pj).code);
}

test("zig is registered", () => {
  assert.equal(X.langs.zig.ext, ".zig");
  assert.match(X.hint(GM.starterProject(), "zig"), /zig build run/);
});

for (const [name, pj] of all()) {
  test("generates " + name, () => {
    const r = gen(pj);
    assert.ok(r.code.length > 200);
    assert.match(r.code, /^const std = @import\("std"\);\nconst goome = @import\("goome"\);\n/);
    assert.match(r.code, /pub fn main\(\) !void \{/);
    assert.match(r.code, /u\.begin\(0\) orelse continue/);
    assert.equal(r.code, gen(pj).code);
    assert.ok(!r.code.replace(/"(\\.|[^"\\])*"/g, '""').includes("/".repeat(2)));
    assert.ok(!/\bundefined\b.*\bundefined\b/.test(r.code) || /theme_/.test(r.code));
    assert.equal(r.file, "main.zig");
  });
}

test("overlay and app entry points", () => {
  const ov = gen(widgets()).code;
  assert.match(ov, /goome\.Goome\.open\(\.\{ \.title = "coverage \{zig\}", \.no_capture = true \}\)/);
  assert.match(ov, /g\.hotkey\("alt\+h", 1\) catch \{\};/);
  assert.match(ov, /switch \(id\) \{/);
  const ap = gen(appDoc()).code;
  assert.match(ap, /\.mode = \.window/);
  assert.match(ap, /_ = u\.app\("coverage \{zig\}", goome\.c\.GOOME_APP_TITLEBAR \| goome\.c\.GOOME_APP_MENUBAR \| goome\.c\.GOOME_APP_STATUSBAR \| goome\.c\.GOOME_APP_NO_PAD\);/);
  assert.match(ap, /u\.appEnd\(\);/);
  const plain = GM.starterProject();
  plain.mode = "app";
  assert.match(gen(plain).code, /goome\.Goome\.openApp\("goome ui", 960, 640\)/);
});

test("api names and argument orders", () => {
  const c = gen(widgets()).code;
  for (const re of [
    /u\.window\(fmt\("Everything \{s\}", .*&s\.window, goome\.win\.move/,
    /u\.sliderInt\("Count", &s\.count, 0, 10\)/,
    /u\.slider\("Vol", &s\.vol, 0, 1, "%\.1f"\)/,
    /u\.combo\("Fruit", &s\.pick, &fruit_items\)/,
    /u\.tabs\("tabs_own", &tabs_own_names, &s\.tabs_own\)/,
    /u\.splitBegin\("panes", true, &s\.panes_frac\)/,
    /u\.tableBegin\("files", 2, 80, goome\.c\.GOOME_TABLE_SORTABLE/,
    /u\.plotBars\("Requests", &reqs_values, 0, 4, 90\)/,
    /u\.modalBegin\(/,
    /u\.popupOpen\("more"\)/,
    /u\.toast\(fmt\("hi \{s\}", \.\{goome\.text\(&s\.player\)\}\), 900\)/,
    /host\.setClipboard\(/,
    /host\.push\(\.\{ \.kind = \.close \}\) catch \{\};/,
    /goome\.c\.goome_ui_input_ex\(u\.raw\(\), "Secret", &s\.secret, s\.secret\.len, goome\.c\.GOOME_INPUT_PASSWORD \| goome\.c\.GOOME_INPUT_ENTER_RETURNS, "type \{here\}"\)/,
    /u\.pushColor\(goome\.c\.GOOME_S_ACCENT, 0xFFFF0000\)/,
    /u\.pushRadii\(goome\.corners\(1, 2, 3, 4\)\)/,
  ]) assert.match(c, re);
  const t = gen(themed()).code;
  for (const re of [/u\.pushTheme\(&theme_warm_thing\)/, /goome\.c\.goome_ui_theme_light\(&theme_warm_thing\)/, /skin_button = goome\.Bitmap\.load\("btn\.png"\) catch null;/, /t\.icon\[goome\.c\.GOOME_ICON_CHECK\] = &b\.raw/, /t\.skin_slider = /, /cfg\.cursor\[goome\.c\.GOOME_CUR_BUTTON\] = goome\.c\.GOOME_CURSOR_HAND/, /u\.bind\(goome\.c\.GOOME_ACT_COPY, "ctrl\+c"\) catch \{\};/, /goome\.c\.goome_ui_bind\(u\.raw\(\), goome\.c\.GOOME_ACT_PASTE, null\)/])
    assert.match(t, re);
  const e = gen(elementsDoc()).code;
  for (const re of [/bm_gauge_bitmap_p = goome\.Bitmap\.loadMem\(&bm_gauge_bitmap_p_png\) catch null;/, /bm_gauge_other_bm = goome\.Bitmap\.load\("other\.png"\) catch null;/, /u\.store\(id, \d+\) orelse return 0/, /u\.custom\("##el", /, /goome\.corners\(/, /c\.rrectGrad\(/, /c\.fontText\(null, /, /c\.clipPush\(/, /c\.bitmap\(b, /, /std\.math\.clamp\(/]) assert.match(e, re);
});

test("keyword names stay valid", () => {
  const c = gen(widgets()).code;
  for (const k of ["fn", "align", "error", "i32", "u8", "try", "defer", "const", "var", "pub"]) assert.match(c, new RegExp('@"' + k + '"|@"' + k + '_v"|\\b' + k + "_v\\b"));
  assert.match(c, /@"fn": i32 = 3,/);
  assert.match(c, /@"align": i32 = 3,/);
  assert.match(c, /s\.@"fn"/);
  assert.doesNotMatch(c, /\bs\.fn\b/);
  assert.doesNotMatch(c, /\n\s+(fn|align|error|try|defer|const|var|pub): /);
  const el = gen(elementsDoc()).code;
  assert.match(el, /fn classVEl\(u: \*goome\.Ui, id: \[\*:0\]const u8, @"type": f64/);
});

test("warnings for things zig cant do", () => {
  const msgs = (pj) => gen(pj).warnings.map((w) => w.msg).join("\n");
  const w = msgs(widgets());
  assert.match(w, /theres no var called nothing/);
  assert.match(w, /nothing/);
  assert.match(w, /theres no var called \(none\)|the tab target has to be a tabs node/);
  const el = msgs(elementsDoc());
  assert.match(el, /widget parts can only be simple widgets/);
  assert.match(el, /text boxes cant keep their text/);
  assert.match(el, /needs 3 or more x,y pairs/);
  assert.match(el, /custom element is gone/);
  assert.match(msgs(themed()), /theme that is gone: missing/);
  const ov = GM.starterProject();
  ov.root.push(GM.newNode("button", ov));
  assert.match(msgs(ov), /only windows and custom elements can sit on the overlay canvas/);
});

test("integer vars compare as integers and expressions stay typed", () => {
  const c = gen(widgets()).code;
  assert.match(c, /if \(s\.@"fn" == 3\)|\(s\.@"fn" == 3\)/);
  assert.match(c, /s\.count < 5/);
  assert.match(c, /@min\(3\.0, @abs\(-2\.0\)\)/);
  assert.match(c, /s\.vol = s\.vol \* 2\.0 \+ @as\(f64, if \(s\.on\) 1\.0 else 0\.0\) - @min/);
  assert.match(gen(appDoc()).code, /s\.count = std\.math\.clamp\(s\.count \+ 2, 0, 20\);/);
});

module.exports = { all };
