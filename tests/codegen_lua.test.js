const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const { X, GM, docs } = require("./load.js");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function coverage() {
  const p = GM.starterProject();
  let k = 0;
  const V = (name, type, def, min, max) => {
    const v = { id: GM.uid("v"), name, type, def, min: min == null ? 0 : min, max: max == null ? (type === "int" ? 100 : 1) : max };
    p.vars.push(v);
    return v;
  };
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

  const vFlag = V("flag", "bool", true), vEnd = V("end", "bool", false), vCount = V("count", "int", 3, 0, 10), vLevel = V("level", "float", 0.4);
  const vTint = V("tint", "color", 0xFF4FA3FF), vNote = V("note", "string", "hello"), vList = V("fruits", "list", "Mango\nKiwi\nFig"), vTab = V("tabv", "int", 0, 0, 2);
  const vLocal = V("local", "string", "x"), vFn = V("function", "float", 1), vNil = V("nil", "int", 0, 0, 3), vRepeat = V("repeat", "bool", true);
  const vType = V("type", "int", 1, 0, 5), vOpen = V("menu_open", "bool", true);

  const rich = GM.newElement("end");
  rich.w = 160, rich.h = 90, rich.hit = "parts";
  rich.resizable = { on: true, minW: 60, minH: 40, maxW: 300, maxH: 200 };
  rich.params.push({ name: "nil", type: "num", def: 3 }, { name: "label", type: "text", def: "hey" }, { name: "tint", type: "color", def: 0xFF112233 }, { name: "local", type: "bool", def: true });
  rich.state.push({ name: "count", type: "num", def: 1 }, { name: "armed", type: "bool", def: false });
  rich.value = { src: "state", state: "count", part: "", axis: "x", min: 0, max: 1 };
  const part = (kind, f, extra) => Object.assign(GM.newPart(kind), extra || {}, { f: Object.assign(GM.newPart(kind).f, f) });
  const grp = part("group", { x: 4, y: 4, w: 80, h: 40, clip: true }, { name: "function" });
  grp.drag = { on: true, axis: "free", snap: 4, bounds: "rect", rect: { x: 0, y: 0, w: 160, h: 90 }, handle: "" };
  grp.kids.push(part("rect", { x: 0, y: 0, w: 80, h: 40, color: "tint" }, { hit: true }), part("text", { x: 2, y: 2, size: 12, text: "{label}", color: "th.text" }));
  const widgets = ["slider", "checkbox", "color", "slider_int", "radio", "combo", "selectable", "progress", "plot_lines", "plot_bars", "table", "image", "toggle", "label", "button", "tabs", "input"].map((t, i) => {
    const w = part("widget", {}, { name: "w" + i });
    w.w = N(t, t === "button" ? { label: "go", action: "print" } : t === "slider" ? { label: "amt", min: 0, max: 5, value: 1, var: "select" } : {});
    return w;
  });
  rich.parts.push(
    part("rect", { x: 0, y: 0, w: "w", h: "h", color: "armed ? th.accent : th.panel" }, { name: "bg" }),
    part("rrect", { x: 2, y: 2, w: 30, h: 20, tl: 4, tr: 4, br: 2, bl: 2, color: "0xFF223344" }),
    part("frame", { x: 0, y: 0, w: "w", h: "h", width: 1, color: "th.border" }),
    part("line", { x0: 0, y0: 0, x1: "w", y1: "h", width: 1, color: "th.text_dim" }),
    part("circle", { cx: 40, cy: 40, r: "min(nil, 10)", color: "hovered ? #ff0000 : #00ff00" }),
    part("ring", { cx: 40, cy: 40, r: 12, width: 2, color: "th.text" }, { show: "local && !pressed" }),
    part("arc", { cx: 40, cy: 40, r: 12, width: 2, a0: 0, a1: "count * 2", color: "th.accent" }),
    part("poly", { points: "0,30 30,0 60,30", color: "th.accent" }),
    part("grad", { x: 0, y: 0, w: 40, h: 20, radius: 4, from: "th.accent", to: "th.panel", sideways: true }),
    part("shadow", { x: 0, y: 0, w: 40, h: 20, radius: 4, blur: 8, color: "th.shadow" }),
    part("bitmap", { x: 0, y: 0, w: 16, h: 16, radius: 2, tint: 0xFFFFFFFF, img: PNG, file: "dot.png" }),
    part("bitmap", { x: 20, y: 0, w: 16, h: 16, radius: 0, tint: "tint", img: "", file: "gone.png" }),
    grp, ...widgets, part("hit", { x: 0, y: 0, w: 30, h: 30 }));
  rich.events.push({ on: "enter", act: "print", target: "", expr: "", text: "in" }, { on: "leave", act: "toggle", target: "armed", expr: "", text: "" },
    { on: "press", act: "add", target: "count", expr: "abs(-1)", text: "" }, { on: "drag", act: "set", target: "count", expr: "count > 3 ? 0 : count + 1", text: "" },
    { on: "click", act: "set", target: "armed", expr: "!armed && count < 5", text: "" }, { on: "release", act: "print", target: "", expr: "", text: "up" });

  const pill = GM.sampleElements();
  const tpl = GM.TEMPLATES();
  const lib = [].concat(pill, tpl, [rich]);
  for (const [, d] of docs()) for (const e of d.elements || []) if (!lib.some((x) => x.name === e.name)) lib.push(e);
  const byName = (n) => lib.find((e) => e.name === n);
  const inst = (def, props) => N("el", Object.assign({ el: def.id, var: def.name }, props || {}));

  const second = N("window", { label: "second", var: "second", x: 460, y: 20, w: 240, h: 0, close: true }, [N("label", { label: "second window" })]);
  const popup = N("popup", { label: "more" }, [N("button", { label: "In popup", action: "toast", toast: "in popup" }), N("button", { label: "Dismiss", action: "close" })]);
  const modal = N("modal", { label: "Sure?", var: "sure", button: "Open modal" }, [N("label", { label: "count is {count}" }), N("button", { label: "Close it", action: "close" })]);
  const tabs = B("tabs", vTab, { items: "One\nTwo\nThree" }, [[N("label", { label: "one" })], [N("label", { label: "two {tabv}" })], [N("label", { label: "three" })]]);
  const events = on(N("button", { label: "events", tooltip: "tip" }), "click",
    A("set", { var: "flag", value: "count > 2 && level < 0.9" }), A("set", { var: "count", value: "count * 2 + 1" }), A("set", { var: "level", value: "min(max(level + 0.1, 0), 1)" }),
    A("set", { var: "tint", value: "th.accent" }), A("set", { var: "note", value: "now {count} / {level} / {flag}" }), A("set", { var: "type", value: "7" }), A("toggle", { var: "flag" }),
    A("add", { var: "count", value: "2" }), A("sub", { var: "level", value: "0.1" }), A("add", { var: "type", value: "count / 2" }),
    A("open", { target: second.id }), A("close", { target: second.id }), A("open", { target: popup.id }), A("close", { target: popup.id }), A("open", { target: modal.id }),
    A("toast", { text: "count {count}", ms: 1500 }), A("tab", { target: tabs.id, tab: 1 }), A("copy", { text: "{note}" }), A("call", { fn: "end" }), A("call", { fn: "do_thing" }), A("quit"));
  on(events, "hover", A("toast", { text: "hover" }));
  const body = [
    N("heading", { label: "Widgets {count}" }), on(N("label", { label: "hover {note} 100%" }), "hover", A("toast", { text: "hi" })), N("wrapped", { label: "wrapped text" }),
    N("separator"), N("space", { px: 6 }), N("row", { cols: 2 }, [N("button", { label: "Left", action: "toast", toast: "left {count}", ms: 800 }), N("button", { label: "Right" })]),
    N("label", { label: "a" }), N("same_line"), N("label", { label: "b" }),
    on(on(on(B("checkbox", vFlag, { label: "Flag" }), "change", A("toggle", { var: "flag" })), "on", A("set", { var: "note", value: "on" })), "off", A("set", { var: "note", value: "off" })),
    B("toggle", vEnd, { label: "Toggle end" }), N("toggle", { var: "t_own", label: "own toggle", on: true }),
    N("radio", { var: "size", items: "S\nM\nL", sel: 1, inline: true }), N("radio", { var: "size2", items: "A\nB", sel: 0 }), on(B("radio", vType, { items: "", itemsVar: vList.id, inline: true }), "change", A("toast", { text: "r" })),
    on(B("slider", vLevel, { label: "Level", min: 0, max: 1, fmt: "%.2f", width: 90 }), "change", A("toast", { text: "lvl {level}" })), B("slider", vCount, { label: "as int", min: 0, max: 10 }),
    N("slider", { var: "own_s", label: "own", min: 0, max: 5, value: 2, fmt: "" }), N("slider_int", { var: "own_i", label: "int", min: 0, max: 9, value: 4 }), B("slider_int", vCount, { label: "bound int", min: 0, max: 10 }),
    B("input", vNote, { label: "Note", cap: 80 }), N("input", { var: "pw", label: "Password", text: "", password: true, hint: "secret", cap: 40 }),
    on(on(N("input", { label: "Enter me", var: "ent", text: "abc", enter: true, hint: "type", cap: 32 }), "enter", A("toast", { text: "entered" })), "change", A("toast", { text: "typed" })),
    B("input", vLocal, { label: "Local", readonly: true }), N("input", { var: "numx", label: "Number", text: "5", number: true, noselect: true }),
    N("text_edit", { var: "body", text: "multi\nline", h: 80, cap: 500, numbers: true, wrap: true, mono: true }), B("text_edit", vNote, { h: 60, cap: 300, readonly: true }),
    N("combo", { var: "fr", label: "Fruit", items: "Mango\nBanana", sel: 1 }), on(B("combo", vNil, { label: "Fruit list", itemsVar: vList.id }), "change", A("toast", { text: "c" })), N("combo", { var: "ec", label: "empty", items: "" }),
    N("selectable", { var: "pick", items: "A\nB\nC", sel: 2 }), on(B("selectable", vNil, { itemsVar: vList.id }), "change", A("toast", { text: "c" })),
    B("color", vTint, { label: "Tint" }), N("color", { var: "own_c", label: "Own color", color: 0xFF112233 }),
    N("progress", { value: 0.25, label: "25%" }), B("progress", vLevel, {}), B("progress", vCount, { label: "{count}" }),
    N("table", { var: "tbl", cols: "Name\nSize:90\nKind", rows: "a, 1, x\nb, 2\nc", h: 90, sortable: true, resizable: true, stripes: true, borders: true }), N("table", { var: "tbl2", cols: "One", rows: "" }),
    N("plot_lines", { var: "pl", label: "Lines", values: "1 5 3 9, 4", min: 0, max: 10, h: 60 }), N("plot_bars", { var: "pb", label: "Bars", values: "4 9 6", min: 0, max: 0, h: 60 }),
    N("image", { w: 90, h: 50, radius: 8 }), on(N("image", { w: 20, h: 20, radius: 0 }), "hover", A("toast", { text: "img" })),
    N("scroll", { var: "sc", h: 70 }, [N("label", { label: "in scroll" }), N("label", { label: "line two" })]),
    N("split", { var: "sp", frac: 0.4 }, [[N("label", { label: "left" })], [N("label", { label: "right" })]]),
    Object.assign(N("split", { var: "sp2", vertical: true, frac: 0.5 }, [[N("label", { label: "top" })], [N("label", { label: "bottom" })]]), { slotStyle: { 0: { c: { panel: 0xFF101010 } }, 1: { n: { pad: 2 } } } }),
    on(tabs, "change", A("toast", { text: "tab" })), N("tabs", { var: "own_tab", items: "A\nB", sel: 1 }, [[N("label", { label: "a" })], [N("label", { label: "b" })]]),
    B("tabs", vNil, { items: "", itemsVar: vList.id }, [[N("label", { label: "l0" })], [], [N("label", { label: "l2" })]]),
    N("collapsing", { label: "More", var: "more", open: true }, [N("label", { label: "inside {note}" })]),
    on(B("collapsing", vFlag, { label: "Bound more" }, [N("label", { label: "x" })]), "change", A("toast", { text: "toggled" })),
    N("tree", { label: "src", var: "tree1", open: false }, [N("label", { label: "main.c" }), N("tree", { label: "inner", var: "tree2", open: true }, [N("label", { label: "deep" })])]),
    B("tree", vRepeat, { label: "bound tree" }, [N("label", { label: "leaf" })]),
    events, on(N("button", { label: "Open second" }), "click", A("open", { target: second.id })), modal, popup, B("modal", vRepeat, { label: "bound modal", button: "go" }, [N("label", { label: "x" })]),
    N("toast", { label: "Show toast", action: "toast", toast: "hello", ms: 900 }),
    N("label", { label: "only when big", showIf: "count > 5" }), N("button", { label: "maybe", enableIf: "flag && count < 8" }),
    N("slider", { label: "gated", var: "gated", min: 0, max: 1, value: 0.5, showIf: "flag && function > 0", enableIf: "!flag || (function > 2 ? true : false)" }),
    N("checkbox", { label: "gated check", var: "enc", on: false, enableIf: "count != 3" }),
    Object.assign(N("label", { label: "styled" }), { style: { c: { accent: 0xFFFF8800, text: 0xFFFFFFFF }, n: { radius: 2, font_size: 20, align: 2, ease: 4 }, radii: [1, 2, 3, 4] } }),
    Object.assign(N("button", { label: "pinned" }), { abs: { x: 300, y: 10, w: 80, h: 24 } }),
    N("label", { label: "wide", width: 120 }),
    inst(byName("pill_switch")), inst(byName("knob_slider")), inst(byName("toggle_pill"), { w: 80, h: 40, init: { on: true } }),
    on(on(inst(byName("swatch"), { params: { color: 0xFFFF0000 } }), "click", A("toast", { text: "swatch" })), "hover", A("toast", { text: "over" })),
    inst(byName("progress_ring"), { params: { label: "42%" } }), inst(byName("node_box"), { params: { title: "T" } }),
    on(inst(byName("knob")), "change", A("set", { var: "level", value: "level" })), inst(byName("slot")),
    inst(rich, { params: { nil: 5, label: "yo", tint: 0xFF00AA00, local: false }, init: { count: 2, armed: true } }),
  ];
  const warm = GM.normTheme({ name: "warm", base: "light", accent: 0xFFFF9900, radius: 3, font_mono: "monospace" });
  p.themes.push(warm);
  const themed = Object.assign(N("button", { label: "themed" }), { style: { theme: warm.id, c: { text: 0xFF000000 } } });
  const main = N("window", { label: "Widgets", var: "main", x: 20, y: 20, w: 420, h: 0, bind: vOpen.id, close: true }, body.concat([themed]));
  main.style = { c: { panel: 0xF0202020 } };
  const fixed = N("window", { label: "Fixed {note}", var: "fixed", x: 720, y: 20, w: 240, h: 0, move: false, resize: false, collapse: false, notitle: true }, [N("label", { label: "x" }), inst(byName("crosshair"))]);
  p.root = [main, second, fixed, inst(byName("crosshair"), { x: 600, y: 300 }), N("label", { label: "not a window" })];
  p.elements = lib;
  p.hotkeys = [{ id: GM.uid("h"), combo: "alt+h", actions: [A("toggle", { var: "menu_open" }), A("toast", { text: "hotkey" })] }, { id: GM.uid("h"), combo: "ctrl+shift+q", actions: [A("quit"), A("copy", { text: "bye {note}" })] }];
  p.config = GM.normConfig({ tip_delay_ms: 100, scroll_lines: 5, esc_closes: 0, focus_on_mouse: 1, cursor: { button: "HAND", custom_xy: "WAIT" }, keys: { copy: "ctrl+c", undo: "" }, mask: "#" });
  p.theme = GM.normTheme(Object.assign({}, GM.PRESETS[2], {
    accent: 0xFF00FF00, radius: 4, font_small: "sans", ease: 2, align: 1, icon_tint: 1, icons: { check: { img: PNG, file: "check.png" } },
    skin_button: { img: PNG, file: "button.png", l: 2, t: 2, r: 2, b: 2 }, skin_slider_track: { img: PNG, file: "track.png", l: 1, t: 1, r: 1, b: 1 },
  }));

  const clone = () => JSON.parse(JSON.stringify(p));
  const app = clone();
  app.mode = "app";
  app.title = "app mode";
  app.app = { w: 800, h: 500, titlebar: false, menubar: true, statusbar: true, nopad: true, status: "{count} items" };
  app.root = [N("menubar", {}, [N("menu", { label: "File" }, [on(N("menu_item", { label: "Open", shortcut: "Ctrl+O" }), "click", A("toast", { text: "open" })), N("menu_item", { label: "Plain" }), N("menu_sep"),
    B("menu_item", vFlag, { label: "Checked", check: true, shortcut: "Ctrl+B" }), on(N("menu_item", { label: "Own", check: true, var: "own_mi", on: true }), "click", A("toast", { text: "own" })), N("menu", { label: "Sub" }, [N("menu_item", { label: "Deep" })])])])].concat(body.slice(0, 12));
  app.theme = GM.normTheme(Object.assign({}, GM.PRESETS[1], { quick: { accent: 0xFF3366FF, dark: false, radius: 6, scale: 1.5 } }));
  const titled = clone();
  Object.assign(titled, { mode: "app", title: "with titlebar", app: { w: 700, h: 400, titlebar: true, menubar: false, statusbar: false, nopad: false, status: "" }, root: body.slice(0, 6) });
  const files = clone();
  files.settings = Object.assign({}, GM.SETTINGS_DEFAULT, { iconSource: "file", indent: 2 });

  const many = GM.starterProject();
  many.root = [Object.assign(GM.newNode("window", null), { kids: [Array.from({ length: 260 }, (x, i) => on(GM.newNode(i % 2 ? "label" : "button", null), "hover", A("toast")))] })];
  const presets = GM.PRESETS.map((t) => {
    const q = GM.starterProject();
    q.theme = GM.normTheme(t);
    return ["preset " + t.id, q];
  });
  const full = GM.starterProject();
  const ft = { name: "full", base: "dark", icon_tint: 1, font_heading: "serif", font_mono: "monospace", font_small: "sans", icons: {} };
  GM.THEME_COLORS.forEach((c, i) => (ft[c] = (0xFF000000 | (i * 2654435)) >>> 0));
  GM.THEME_SIZES.forEach((c) => (ft[c] = (GM.THEME_REST[c] === undefined ? GM.DARK[c] : GM.THEME_REST[c]) + 1));
  GM.THEME_SKINS.concat(GM.EXTRA_SKINS).forEach((c) => (ft[c] = { img: PNG, file: c + ".png", l: 1, t: 2, r: 3, b: 4 }));
  GM.ICON_NAMES.forEach((c) => (ft.icons[c] = { img: PNG, file: c + ".png" }));
  full.theme = GM.normTheme(ft);
  const fc = { mask: "@", cursor: {}, keys: {} };
  GM.CFG_NUMS.forEach(([c, d, lo]) => (fc[c] = lo + 1));
  GM.CFG_TOGGLES.forEach(([c, d]) => (fc[c] = d ? 0 : 1));
  GM.CFG_CURSORS.forEach(([c]) => (fc.cursor[c] = "NO"));
  GM.CFG_KEYS.forEach(([c]) => (fc.keys[c] = "ctrl+q"));
  full.config = GM.normConfig(fc);
  const quick = GM.starterProject();
  quick.theme = GM.normTheme({ quick: { accent: 0xFF336699, dark: true, radius: 3, scale: 1 }, font_heading: "serif" });
  const plain = GM.starterProject();
  plain.root = [];
  const broken = GM.starterProject();
  broken.root[0].kids[0].push(N("checkbox", { label: "bad show", var: "bs", showIf: "nope +" }), N("checkbox", { label: "bad enable", var: "be", enableIf: "unknown" }), B("checkbox", vLevel, { label: "wrong type" }),
    on(N("button", { label: "dead" }), "click", A("set", { var: "nothere", value: "1" }), A("tab", { target: "nope", tab: 1 }), A("add", { var: "flag", value: "1" })));
  broken.vars.push(vFlag, vLevel);
  return [["coverage overlay", p], ["coverage app", GM.normProject(app)], ["coverage app titlebar", GM.normProject(titled)], ["coverage file icons", files], ["many locals", many], ["every theme field", full], ["quick theme", quick], ["empty", plain], ["broken", broken]].concat(presets);
}

const all = () => docs().concat(coverage());
const gen = (p) => X.generate(p, "lua");
const luac = process.env.LUAC || "luac";
const haveLuac = spawnSync(luac, ["-v"]).status === 0;
const parses = (code, name) => {
  const r = spawnSync(luac, ["-p", "-"], { input: code, encoding: "utf8" });
  assert.strictEqual(r.status, 0, name + "\n" + r.stderr);
};

test("registered", () => {
  assert.strictEqual(X.langs.lua.label, "Lua");
  assert.strictEqual(X.langs.lua.ext, ".lua");
  assert.match(X.hint(GM.starterProject(), "lua"), /luarocks install/);
});

test("every layout and coverage doc makes code", () => {
  for (const [name, p] of all()) {
    const r = gen(p);
    assert.ok(r.code.length > 100, name);
    assert.match(r.code, /^local goome = require\("goome"\)\n/, name);
    assert.match(r.code, /os\.exit\(main\(\)\)\n$/, name);
    const bare = r.code.replace(/\[=\[[\s\S]*?\]=\]/g, "").replace(/"(?:\\.|[^"\\])*"/g, '""');
    assert.ok(!/--/.test(bare), name + " has a comment");
  }
});

test("every doc parses as lua", { skip: !haveLuac }, () => {
  for (const [name, p] of all()) parses(gen(p).code, name);
});

test("output is deterministic", () => {
  for (const [name, p] of all()) assert.strictEqual(gen(p).code, gen(p).code, name);
});

test("real api names and argument order", () => {
  const code = gen(coverage()[0][1]).code;
  const acode = gen(coverage()[1][1]).code;
  const tcode = gen(coverage()[2][1]).code;
  for (const re of [
    /if ui:window\("Widgets", s\.window, goome\.WIN_MOVE \+ goome\.WIN_RESIZE \+ goome\.WIN_COLLAPSE \+ goome\.WIN_CLOSE\) then/, /ui:window_end\(\)/,
    /s\.window\.open = s\.menu_open/, /s\.menu_open = s\.window\.open/, /ui:window\(string\.format\("Fixed %s", s\.note\), s\.fixed_v, goome\.WIN_NO_TITLE\)/,
    /s\.level, edited = ui:slider\("Level", s\.level, 0, 1, "%\.2f"\)/, /s\.count = ui:slider_int\("as int", s\.count, 0, 10\)/, /s\.note = ui:input\("Note", s\.note, 300\)/,
    /ui:input_ex\("Password", s\.pw, goome\.INPUT_PASSWORD, "secret", 40\)/, /ui:input_ex\("Enter me", s\.ent, goome\.INPUT_ENTER_RETURNS, "type", 32\)/,
    /ui:text_edit\("body", s\.body, 80, goome\.EDIT_LINE_NUMBERS \+ goome\.EDIT_WRAP \+ goome\.EDIT_MONO, 500\)/,
    /s\.fr = ui:combo\("Fruit", s\.fr \+ 1, data\.fr_items\) - 1/, /s\.tabv, edited = ui:tabs\("tabs", data\.tabs_names, s\.tabv \+ 1\)/, /s\.tabv = s\.tabv - 1/,
    /for i, item in ipairs\(s\.fruits\) do/, /ui:selectable\(item, s\.nil_v == i - 1\)/, /ui:radio\("M", s\.size_\d+, 1\)/, /ui:color\("Tint", s\.tint\)/,
    /ui:scroll\("sc", 70\)/, /ui:scroll_end\(\)/, /_, s\.sp_frac = ui:split\("sp", s\.sp_frac, false\)/, /ui:split_next\(\)/, /ui:split_end\(\)/,
    /ui:table\("tbl", 3, 90, goome\.TABLE_SORTABLE \+ goome\.TABLE_RESIZABLE \+ goome\.TABLE_STRIPES \+ goome\.TABLE_BORDERS\)/, /ui:table_column\("Size", 90\)/, /ui:table_next\(\)/, /ui:table_end\(\)/,
    /ui:plot_lines\("Lines", data\.pl, 0, 10, 60\)/, /ui:plot_bars\("Bars", data\.pb, 0, 0, 60\)/, /ui:image\(data\.placeholder, 90, 50, 8\)/,
    /shown\d+, s\.more_\d+ = ui:collapsing\("More", s\.more_\d+\)/, /shown\d+, s\.tree1 = ui:tree\("src", s\.tree1\)/, /ui:tree_end\(\)/, /ui:modal\("Sure\?", s\.sure\)/, /ui:modal_end\(\)/,
    /ui:popup\("more"\)/, /ui:popup_open\("more"\)/, /ui:popup_close\(\)/, /ui:popup_end\(\)/, /ui:toast\(string\.format\("count %d", s\.count\), 1500\)/, /win:clipboard\(string\.format\("%s", s\.note\)\)/, /win:push\(goome\.CLOSE\)/,
    /ui:push_color\(goome\.S_PANEL, 0xF0202020\)/, /ui:push_num\(goome\.S_ALIGN, goome\.ALIGN_CENTER\)/, /ui:push_radii\(\{1, 2, 3, 4\}\)/, /ui:push_theme\(data\.theme_warm\)/, /ui:pop\(\d\)/,
    /ui:pos\(300, 10\)/, /ui:size\(80, 24\)/, /ui:width\(90\)/, /ui:progress\(s\.level, "60%"\)/, /ui:progress\(0\.25, "25%"\)/, /ui:tooltip\("tip"\)/,
    /local store = ui:store\(sid, \d+\)/, /select\(2, ui:custom\("##el", store\[2\], store\[3\], goome\.ITEM_NO_HIT\)\)/, /c:rrect\(/, /c:font_text\(nil, /, /c:rrect_grad\(/, /c:bitmap\(data\.bm_/, /c:clip_push\(/, /c:poly\(\{/, /c:arc\(/,
    /goome\.ITEM_DRAG_X \+ goome\.ITEM_DRAG_Y/, /ui:push_id\(sid\)/, /ui:pop_id\(\)/, /ui:canvas\(\)/, /ui:theme\(\)/,
    /t:preset\(goome\.PRESET_MIDNIGHT\)/, /t\.skin_button = \{data\.skin_button, 2, 2, 2, 2\}/, /t\.skin_slider = \{data\.skin_slider_track, 1, 1, 1, 1\}/, /t:icon\(goome\.ICON_CHECK, data\.icon_check\)/,
    /cfg:cursor\(goome\.CUR_BUTTON, goome\.CURSOR_HAND\)/, /cfg\.tip_delay_ms = 100/, /cfg\.esc_closes = false/, /cfg\.mask = "#"/, /ui:bind\(goome\.ACT_COPY, "ctrl\+c"\)/,
    /g:hotkey\(combo, n\)/, /if ev\.type == goome\.HOTKEY then/, /goome\.open\{title = "goome ui", no_capture = true\}/, /g:backend_name\(\):match\("\^test"\)/, /goome\.pacer\(60\)/, /ui:begin\(0\)/, /ui:finish\(\)/,
    /goome\.bitmap_from_bytes\(decode64\(data\.\w+_png\)\)/, /goome\.bitmap_from_argb\(/, /goome\.font_system\("sans"\)/,
  ]) assert.match(code, re);
  for (const re of [
    /goome\.app\("app mode", 800, 500, \{flags = goome\.APP_MENUBAR \+ goome\.APP_STATUSBAR \+ goome\.APP_NO_PAD\}\)/, /app:on_start\(function\(\)/, /app:event\(function\(ev\)/, /app:frame\(draw\)/, /app:run\(\)/,
    /ui:statusbar\(string\.format\("%d items", s\.count\)\)/, /t:make\(0xFF3366FF, false, 6\)/, /ui:scale\(1\.5\)/, /ui:menubar\(\)/, /ui:menu\("File"\)/, /ui:menu_item\("Open", "Ctrl\+O"\)/, /ui:menu_item\("Checked", "Ctrl\+B", s\.flag\)/, /ui:menu_separator\(\)/,
  ]) assert.match(acode, re);
  for (const re of [/goome\.open\{title = "with titlebar", mode = "window", width = 700, height = 400, window_flags = goome\.WINDOW_RESIZABLE \+ goome\.WINDOW_BORDERLESS/, /ui:app\("with titlebar", goome\.APP_TITLEBAR\)/, /ui:app_end\(\)/]) assert.match(tcode, re);
});

test("names that are lua keywords or globals stay valid", () => {
  const code = gen(coverage()[0][1]).code;
  for (const bad of ["end", "local", "nil", "function", "repeat", "type"]) {
    assert.ok(!new RegExp("\\bs\\." + bad + "\\b").test(code), bad);
    if (bad !== "function") assert.ok(!new RegExp("\\blocal " + bad + "[ ,=]").test(code), bad);
    assert.ok(!new RegExp("\\blocal function " + bad + "\\(").test(code), bad);
  }
  assert.match(code, /\bend_v = false,/);
  assert.match(code, /\blocal_v = "x",/);
  assert.match(code, /\bfunction_v = 1,/);
  assert.match(code, /\bnil_v = 0,/);
  assert.match(code, /\brepeat_v = true,/);
  assert.match(code, /\blocal function end_v\(\)/);
  assert.match(code, /\blocal function end_el\(ui, sid, nil_v, label, tint, local_v, init\)/);
});

test("expressions turn into lua", () => {
  const code = gen(coverage()[0][1]).code;
  for (const re of [
    /s\.flag = s\.count > 2 and s\.level < 0\.9/, /s\.count = trunc\(s\.count \* 2 \+ 1\)/, /s\.level = math\.min\(math\.max\(s\.level \+ 0\.1, 0\), 1\)/, /s\.tint = ui:theme\(\)\.accent/,
    /s\.note = string\.format\("now %d \/ %g \/ %s", s\.count, s\.level, tostring\(s\.flag\)\)/, /s\.flag = not s\.flag/, /s\.type_v = 7/, /s\.level = math\.max\(0, math\.min\(1, s\.level - 0\.1\)\)/,
    /local en\d+ = s\.flag and s\.count < 8/, /local en\d+ = not s\.flag or s\.function_v > 2/, /if s\.count > 5 then/, /local en\d+ = s\.count ~= 3/,
    /store\[\d+\] = \(not \(store\[\d+\] ~= 0\) and store\[\d+\] < 5\) and 1 or 0/, /store\[\d+\] = 1\n/, /store\[\d+\] = store\[\d+\] ~= 0 and 0 or 1/, /store\[\d+\] = \(store\[\d+\] > 3 and 0 or store\[\d+\] \+ 1\)/,
  ]) assert.match(code, re, String(re));
});

test("indent setting changes the spaces", () => {
  const f = coverage().find(([n]) => n === "coverage file icons")[1];
  const code = gen(f).code;
  assert.match(code, /\nlocal s = \{\n  flag = true,/);
  assert.match(code, /\n  local store = ui:store/);
  assert.deepStrictEqual(gen(f).files.slice().sort().slice(0, 2), ["button.png", "check.png"]);
});

test("things that cant export warn", () => {
  const w = gen(coverage().find(([n]) => n === "broken")[1]).warnings.map((x) => x.msg).join("\n");
  assert.match(w, /show if: ends too early/);
  assert.match(w, /enable if: dont know unknown/);
  assert.match(w, /theres no var called nothere/);
  assert.match(w, /the tab target has to be a tabs node/);
  assert.match(w, /cant use it, using its own var/);
  const o = gen(coverage()[0][1]).warnings.map((x) => x.msg).join("\n");
  assert.match(o, /only windows and custom elements can sit on the overlay canvas/);
  assert.match(o, /text boxes cant keep their text in goome_ui_store/);
  assert.match(o, /widget parts can only be simple widgets/);
});

test("overlay without hotkeys has no hotkey code", () => {
  const code = gen(GM.starterProject()).code;
  assert.ok(!/hotkey/i.test(code));
  assert.match(code, /ui:begin\(0\)/);
});

test("many locals stay under the lua limit", () => {
  const code = gen(coverage().find(([n]) => n === "many locals")[1]).code;
  assert.match(code, /\n {8}do\n/);
});

const real = process.env.LUA_GOOME;
test("generated programs run on the test backend", { skip: !real }, () => {
  const lua = process.env.LUA || "lua";
  const dir = fs.mkdtempSync(path.join(process.env.LUA_GOOME_TMP || os.tmpdir(), "gm-lua-"));
  try {
    all().forEach(([name, p], i) => {
      const file = path.join(dir, "p" + i + ".lua");
      fs.writeFileSync(file, gen(p).code);
      const env = Object.assign({}, process.env, { LUA_CPATH: path.resolve(real) + "/?.so;" + path.resolve(real) + "/?.dll", GOOME_BACKEND: "test", GOOME_TEST_SCRIPT: "screen 1280x720 1; 1 click 100,100; 3 click 300,200; 4 key ab; 6 hold 400,300 4; end 12" });
      const r = spawnSync(lua, [file], { env, encoding: "utf8", timeout: 60000 });
      assert.strictEqual(r.status, 0, name + "\n" + r.stderr);
      assert.ok(!/error|lua:/i.test(r.stderr), name + "\n" + r.stderr);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
