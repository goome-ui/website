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

  const vOpen = V("type", "bool", true), vOn = V("fn", "bool", false), vNum = V("loop", "int", 3, 0, 10), vF = V("match", "float", 0.5, 0, 1);
  const vStr = V("self", "string", "hi"), vCol = V("move", "color", 0xFF4FA3FF), vList = V("ref", "list", "one\ntwo\nthree"), vSel = V("mod", "int", 0, 0, 2);
  const vTab = V("crate", "int", 0, 0, 1), vTree = V("super", "bool", true), vModal = V("where", "bool", false), vPop = V("static", "bool", false), vChk = V("box", "bool", true);
  const vFloat2 = V("ui", "float", 2.5, 0, 5), vCount = V("s", "int", 7, 0, 99);
  const vFreeI = V("free_i", "int", 0, 0, 0), vFreeF = V("free_f", "float", 0, 0, 0);
  V("unused_list", "list", "");
  V("unused_text", "string", "x");

  const alt = GM.normTheme({ name: "alt", base: "light", accent: 0xFFC0572B });
  p.themes.push(alt);
  p.theme = GM.normTheme(Object.assign({}, GM.PRESETS[2], { skin_button: { img: PNG, file: "btn.png", l: 1, t: 1, r: 1, b: 1 }, skin_slider_track: { img: PNG, file: "track.png", l: 1, t: 1, r: 1, b: 1 }, icons: { close: { img: PNG, file: "close.png" } }, icon_tint: 1, font_mono: "monospace", accent: 0xFFFF8800 }));
  p.config = GM.normConfig({ tip_delay_ms: 100, dbl_click_ms: 300, raise_on_click: 0, scroll_lines: 5, mask: "#", cursor: { button: "HAND" }, keys: { copy: "ctrl+c", paste: "" } });
  p.hotkeys = [{ id: GM.uid("h"), combo: "alt+h", actions: [A("toggle", { var: "type" })] }, { id: GM.uid("h"), combo: "ctrl+shift+q", actions: [A("quit"), A("copy", { text: "bye {self} {}" })] }, { id: GM.uid("h"), combo: "f5", actions: [] }];

  const pill = GM.sampleElements();
  const tpl = GM.TEMPLATES();
  const rich = GM.newElement("rich_thing");
  rich.w = 160, rich.h = 90, rich.hit = "parts";
  rich.resizable = { on: true, minW: 60, minH: 40, maxW: 300, maxH: 200 };
  rich.params.push({ name: "default", type: "num", def: 3 }, { name: "label", type: "text", def: "hey {x}" }, { name: "tint", type: "color", def: 0xFF112233 }, { name: "flag", type: "bool", def: true });
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
  const wtext = part("widget", {}, { name: "w4" });
  wtext.w = N("input", { label: "txt" });
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
    part("bitmap", { x: 0, y: 0, w: 16, h: 16, radius: 2, tint: 0xFFFFFFFF, img: PNG, file: "dot.png" }, { name: "dot" }),
    part("bitmap", { x: 20, y: 0, w: 16, h: 16, radius: 0, tint: "tint", img: "", file: "gone.png" }, { name: "gone" }),
    grp, wslider, wcheck, wcol, wtext,
    part("hit", { x: 0, y: 0, w: 30, h: 30 }));
  rich.events.push({ on: "enter", act: "print", target: "", expr: "", text: "in {a}" }, { on: "leave", act: "toggle", target: "armed", expr: "", text: "" },
    { on: "press", act: "add", target: "count", expr: "abs(-1)", text: "" }, { on: "drag", act: "set", target: "count", expr: "count > 3 ? 0 : count + 1", text: "" },
    { on: "click", act: "set", target: "armed", expr: "!armed && count < 5", text: "" }, { on: "release", act: "print", target: "", expr: "", text: "up" });
  const inst = (def, props) => N("el", Object.assign({ el: def.id, var: def.name }, props || {}));

  const cell = N("window", { label: "cells {match}", var: "cells", x: 400, y: 20, w: 300, h: 0, bind: vOpen.id, close: true });
  const kids = [];
  const add = (...ns) => kids.push(...ns);
  add(N("heading", { label: "Heading {match}" }), N("label", { label: "val {loop} {self} {move} {ref} {type} {nothere} 100% `tick` ${x} {{}}", tooltip: "tip" }), N("wrapped", { label: "wrapped text" }));
  add(N("row", { cols: 2 }, [N("button", { label: "A", action: "toast", toast: "hi {loop}", ms: 800 }), N("button", { label: "B", action: "print" })]));
  add(N("same_line"), N("space", { px: 5 }), N("separator"));
  add(on(on(N("button", { label: "events", action: "" }), "click", A("set", { var: "loop", value: "loop + 1.5" }), A("set", { var: "self", value: "n={loop}" }), A("set", { var: "move", value: "0xFF00FF00" }),
    A("set", { var: "type", value: "!type" }), A("toggle", { var: "fn" }), A("add", { var: "loop", value: "2" }), A("sub", { var: "match", value: "0.1" }), A("add", { var: "s", value: "s / 2" }),
    A("add", { var: "ui", value: "1" }), A("add", { var: "free_i", value: "3" }), A("sub", { var: "free_f", value: "0.25" }), A("add", { var: "free_i", value: "s * 2" }), A("set", { var: "loop", value: "" }), A("set", { var: "ref", value: "1" }),
    A("open", { target: cell.id }), A("close", { target: cell.id }), A("toast", { text: "t {s}", ms: 0 }), A("tab", { target: "x", tab: 1 }), A("copy", { text: "c" }), A("call", { fn: "box" }),
    A("call", { fn: "main" }), A("call", { fn: "draw" }), A("call", { fn: "on_click" }), A("quit")), "hover", A("toast", { text: "hover" })));
  add(on(B("checkbox", vOn, { label: "check", tooltip: "tt" }), "change", A("toast", { text: "chg" })), on(N("toggle", { label: "own toggle", var: "own_t", on: true }), "on", A("toast", { text: "on" })));
  add(on(N("checkbox", { label: "own check", var: "own_c" }), "off", A("toast", { text: "off" })));
  add(on(N("radio", { var: "rad", items: "a\nb\nc", sel: 1, inline: true }), "change", A("toast", { text: "r" })), B("radio", vSel, { items: "", itemsVar: vList.id, inline: true }));
  add(on(B("slider", vF, { label: "f", min: 0, max: 1, fmt: "%.2f", width: 90 }), "change", A("toast", { text: "s" })), B("slider", vCount, { label: "as int", min: 0, max: 99 }), B("slider_int", vCount, { label: "i", min: 0, max: 99 }), N("slider", { label: "own f", var: "of", min: -1, max: 1, value: 0.25 }), N("slider_int", { label: "own i", var: "oi", min: 0, max: 9, value: 3 }));
  add(on(B("input", vStr, { label: "in", cap: 32, hint: "hint", password: true, enter: true }), "enter", A("toast", { text: "e" })), N("input", { label: "plain", var: "plain", text: "abc", cap: 8 }), on(B("input", vStr, { label: "numeric", number: true, readonly: true, noselect: true }), "change", A("toast", { text: "c" })));
  add(B("text_edit", vStr, { h: 80, cap: 512, readonly: true, numbers: true, wrap: false, mono: true }), N("text_edit", { var: "scratch", text: "own", h: 50 }));
  add(on(B("combo", vSel, { label: "combo", itemsVar: vList.id }), "change", A("toast", { text: "c" })), N("combo", { label: "own combo", var: "oc", items: "x\ny" }), N("combo", { label: "empty", var: "ec", items: "" }));
  add(on(B("selectable", vSel, { itemsVar: vList.id }), "change", A("toast", { text: "c" })), N("selectable", { var: "os", items: "p\nq" }), N("selectable", { var: "es", items: "" }));
  add(B("color", vCol, { label: "col" }), N("color", { label: "own col", var: "ocol", color: 0xFFAA5500 }));
  add(B("progress", vF, { label: "pct" }), B("progress", vCount, {}), N("progress", { value: 0.3, label: "" }), N("progress", { value: 0.7, label: "{loop} done" }));
  add(N("table", { var: "t1", cols: "Name\nSize:90", rows: "a, 1\nb\nc, 3, 4", h: 60, sortable: true, resizable: true, stripes: false, borders: true }), N("table", { var: "t2", cols: "", rows: "" }));
  add(N("plot_lines", { label: "pl", var: "p1", values: "1 2 3, 4", min: 0, max: 5, h: 40 }), N("plot_bars", { label: "pb", var: "p2", values: "", min: 0, max: 0, h: 30 }));
  add(on(N("image", { w: 40, h: 30, radius: 4 }), "hover", A("toast", { text: "img" })), on(N("label", { label: "hov" }), "hover", A("toast", { text: "h" })));
  add(inst(pill[0], { x: 0, y: 0 }), N("space", { px: 2 }));
  const tabs = B("tabs", vTab, { items: "One\nTwo" }, [[N("label", { label: "t1" })], [N("label", { label: "t2" }), N("separator")]]);
  add(on(tabs, "change", A("toast", { text: "tab" })), N("tabs", { var: "tabs2", items: "Only", sel: 0 }, [[N("label", { label: "only" })]]), B("tabs", vTab, { items: "", itemsVar: vList.id }, [[N("label", { label: "l0" })], [], [N("label", { label: "l2" })]]));
  add(on(B("collapsing", vChk, { label: "coll" }, [N("label", { label: "inside" })]), "change", A("toast", { text: "c" })), N("collapsing", { label: "own coll", var: "oco", open: false }, [N("label", { label: "in2" })]));
  add(on(B("tree", vTree, { label: "tree" }, [N("label", { label: "leaf" })]), "change", A("toast", { text: "t" })), N("tree", { label: "own tree", var: "otree", open: false }, [N("label", { label: "leaf2" })]), N("tree", { label: "empty tree", var: "etree" }, []));
  add(N("scroll", { var: "sc", h: 50 }, [N("label", { label: "scrolled" }), N("label", { label: "more" })]), N("scroll", { var: "sc2", h: 20 }, []));
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
  const gated = N("slider", { label: "gated", var: "gated", min: 0, max: 1, value: 0.5, showIf: "fn && loop > 1", enableIf: "!fn || (loop > 2 ? true : false)" });
  add(gated, N("checkbox", { label: "bad show", var: "bs", showIf: "nope +" }), N("checkbox", { label: "bad enable", var: "be", enableIf: "unknown" }), N("button", { label: "dead", action: "" }));
  add(N("input", { label: "gated input", var: "gi", text: "x", cap: 12, enableIf: "fn" }), N("combo", { label: "gated combo", var: "gc", items: "a\nb", enableIf: "!fn" }), N("button", { label: "gated button", action: "print", enableIf: "ui > 1 ? true : false" }));
  add(N("label", { label: "maths", showIf: "(loop * 2 - s / 3) >= 1 && !(match < 0.2) || type == fn" }), N("label", { label: "colors", showIf: "move == 0xFF4FA3FF || th.accent != #112233" }));
  add(B("checkbox", vF, { label: "wrong type" }), B("slider", vStr, { label: "wrong" }));
  cell.kids = [kids];

  const bar = N("menubar", {}, [N("menu", { label: "File" }, [on(N("menu_item", { label: "Open", shortcut: "Ctrl+O" }), "click", A("toast", { text: "open" })), N("menu_item", { label: "Plain" }), N("menu_sep"),
    B("menu_item", vTree, { label: "Checked", check: true, shortcut: "Ctrl+B" }), on(N("menu_item", { label: "Own", check: true, var: "own_mi", on: true }), "click", A("toast", { text: "own" }))]), N("menu", { label: "Empty" }, [])]);
  const sidewin = N("window", { label: "side", var: "side", x: 20, y: 20, w: 200, h: 100, move: false, resize: false, collapse: false, notitle: true });
  sidewin.kids = [[bar, N("label", { label: "side window" }), inst(pill[1]), inst(tpl[0], { w: 80, h: 80, params: {}, init: { level: 0.9 } }), inst(rich, { params: { default: 5, label: "yo", tint: 0xFF00AA00, flag: false }, init: { count: 2, armed: true } }), inst(tpl[1]), inst(tpl[2], { params: { title: "T" } })]];
  p.root = [cell, sidewin, N("window", { label: "empty", var: "empty_w" }), inst(tpl[3], { x: 500, y: 500 }), inst(tpl[4], { x: 500, y: 560, params: { color: 0xFFAA2200 } }), inst(tpl[5], { x: 500, y: 620 }), N("label", { label: "not a window" })];
  p.elements = [].concat(pill, tpl, [rich]);

  const app = JSON.parse(JSON.stringify(p));
  app.mode = "app";
  app.title = "app mode";
  app.app = { w: 800, h: 500, titlebar: true, menubar: true, statusbar: true, nopad: true, status: "{loop} items" };
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
  const embed = JSON.parse(JSON.stringify(p));
  embed.settings = Object.assign({}, GM.SETTINGS_DEFAULT, { iconSource: "embed" });
  embed.hotkeys = [];
  embed.theme = full.theme;
  embed.config = full.config;
  const fileDoc = JSON.parse(JSON.stringify(p));
  fileDoc.settings = Object.assign({}, GM.SETTINGS_DEFAULT, { iconSource: "file" });
  fileDoc.theme = full.theme;
  const ex = GM.starterProject();
  const ev = (name, type, def, min, max) => {
    const v = { id: GM.uid("v"), name, type, def, min: min == null ? 0 : min, max: max == null ? 10 : max };
    ex.vars.push(v);
    return v;
  };
  const xa = ev("a", "int", 4), xb = ev("b", "float", 2.5), xf = ev("flag", "bool", true), xc = ev("col", "color", 0xFF4FA3FF);
  const exw = N("window", { label: "exprs", var: "exprs", x: 10, y: 10, w: 300, h: 0 });
  exw.kids = [[
    ...[
      "a - b < 3 && a < b && -a < 1 && a + 1 <= b * 2", "(a > 1 ? (b > 2 ? 1 : 2) : 3) > 1", "a > 1 ? true : false", "a > 1 ? false : true", "min(a, b) < max(a, 3) || abs(a - b) > 0.5",
      "col == 0xFF4FA3FF ? a > 1 : b < 2", "a == b", "flag == true", "flag != (a > 2)", "-a * -b > -3", "a / b > 1 && a / 2 < b", "th.accent == col", "th.radius + 1 > a", "!flag || !(b > 1)", "a * (b + 1) / (a - 1) >= 0",
      "flag ? 1 : 0", "col", "a", "(a)", "((b))", "a - (b - 1) > 0", "a - b - 1 > 0", "a / (b / 2) > 1", "0 < a", "1 + 2 < 4", "-1 < a",
    ].map((e) => N("label", { label: e, showIf: e })),
    on(N("button", { label: "set", action: "" }), "click", A("set", { var: "b", value: "a > 1 ? b / 2 : b * 2" }), A("set", { var: "col", value: "flag ? 0xFF0000FF : th.accent" }), A("set", { var: "a", value: "a > 1 ? a - 1 : a + 1" }),
      A("set", { var: "flag", value: "a > 2 && b < 3" }), A("set", { var: "a", value: "b * 2" }), A("set", { var: "flag", value: "a" }), A("set", { var: "b", value: "flag" }), A("add", { var: "a", value: "b" }), A("sub", { var: "b", value: "a" })),
  ]];
  ex.root = [exw];
  ex.elements = [GM.TEMPLATES()[4]];
  const plainApp = GM.starterProject();
  plainApp.mode = "app";
  plainApp.root = [N("heading", { label: "plain app" }), N("button", { label: "go", action: "toast" })];
  return [["coverage overlay", p], ["coverage app", GM.normProject(app)], ["coverage embedded bitmaps", GM.normProject(embed)], ["expressions", ex], ["plain app", plainApp], ["empty overlay", plain], ["every theme field", full], ["quick theme", quick], ["coverage file bitmaps", GM.normProject(fileDoc)]].concat(presets);
}

const all = () => docs().concat(coverage());
const gen = (p) => X.generate(p, "rust");
const bare = (code) => code.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)'/g, "''");
const balanced = (code, name) => {
  const s = bare(code);
  for (const [a, b] of [["{", "}"], ["(", ")"], ["[", "]"]]) assert.strictEqual(s.split(a).length, s.split(b).length, name + " unbalanced " + a);
};

test("registered", () => {
  assert.strictEqual(X.langs.rust.label, "Rust");
  assert.strictEqual(X.langs.rust.ext, ".rs");
  assert.match(X.hint(GM.starterProject(), "rust"), /cargo run/);
  assert.match(X.hint(GM.starterProject(), "rust"), /rust-goome/);
});

test("every layout and coverage doc makes code", () => {
  for (const [name, p] of all()) {
    const r = gen(p);
    assert.ok(r.code.length > 100, name);
    assert.match(r.code, /^use goome::\{[\w, ]*\};\n/, name);
    assert.match(r.code, /\nfn main\(\) \{\n/, name);
    assert.match(r.code, /\nfn draw\(_?ui: &mut Ui, _?s: &mut State\) \{\n/, name);
    assert.strictEqual(r.file, "main.rs");
    assert.ok(!/(^|[^:"])\/\/|\/\*/m.test(bare(r.code)), name + " has a comment");
    assert.ok(!/^\s*#\s/m.test(r.code), name + " has a hash comment");
    balanced(r.code, name);
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
    /ui\.window\(&format!\("cells \{\}", s\.match_v\), &mut s\.window, goome::WIN_MOVE \| goome::WIN_RESIZE \| goome::WIN_COLLAPSE \| goome::WIN_CLOSE\)/,
    /ui\.slider_fmt\("f", &mut s\.match_v, 0\.0, 1\.0, Some\("%\.2f"\)\)/, /ui\.slider_int\("i", &mut s\.s_v, 0, 99\)/, /ui\.slider_int\("as int", &mut s\.s_v, 0, 99\)/,
    /ui\.input_cap\("plain", &mut s\.plain, 8\)/, /ui\.input_ex_cap\("in", &mut s\.self_v, goome::INPUT_PASSWORD \| goome::INPUT_ENTER_RETURNS, Some\("hint"\), 512\)/,
    /ui\.text_edit\("scratch", &mut s\.scratch, 50\.0, goome::EDIT_WRAP\)/, /ui\.combo\("own combo", &mut s\.oc, OC_ITEMS\)/, /ui\.tabs\("\w+", \w+, &mut s\.crate_v\)/,
    /ui\.scroll\("sc", 50\.0\)/, /ui\.split\("sp", true, &mut s\.sp_frac\)/, /ui\.split_next\(\)/, /ui\.table\("t1", 2, 60\.0, goome::TABLE_SORTABLE \| goome::TABLE_RESIZABLE \| goome::TABLE_BORDERS\)/,
    /ui\.table_column\("Size", 90\.0\)/, /ui\.plot_lines\("pl", P1, 0\.0, 5\.0, 40\.0\)/, /ui\.plot_bars\(/, /ui\.tree\("tree", &mut s\.super_v\)/, /ui\.modal\("modal", &mut s\.where_v\)/,
    /ui\.popup_open\(/, /ui\.menu_item\("Checked", Some\("Ctrl\+B"\), Some\(&mut s\.super_v\)\)/, /ui\.toast\(/, /ui\.push_color\(goome::S_ACCENT, 0xFFFF0000\)/, /ui\.push_num\(goome::S_ALIGN, goome::ALIGN_CENTER as f64\)/,
    /ui\.push_radii\(\(1\.0, 2\.0, 3\.0, 4\.0\)\)/, /ui\.push_theme\(&s\.theme_alt\)/, /ui\.pop\(\d+\)/, /ui\.custom\("##el", s\[1\], s\[2\], goome::ITEM_NO_HIT\)/, /c\.rrect\(/, /c\.font_text\(None, /, /c\.rrect_grad\(/, /c\.bitmap\(/,
    /c\.clip_push\(/, /c\.poly\(&\[/, /ui\.store\(id, \d+\)/, /ui\.push_id\(id\)/, /let _ = ui\.push\(&goome::Event::new\(goome::CLOSE\)\)/, /let _ = ui\.clipboard_set\(/,
    /ui\.hotkey\("alt\+h", 1\)/, /Options::new\(\)\.title\("goome ui"\)\.no_capture\(true\)\.open\(\)\.and_then\(\|g\| g\.ui\(\)\)/, /ui\.pump\(wait\)/, /ui\.begin\(0\)/, /goome::HOTKEY/, /Pacer::new\(60\)/,
    /ui\.set_skin\(goome::SKIN_BUTTON, Some\(&Skin::new\(bm, 1\.0, 1\.0, 1\.0, 1\.0\)\)\)/, /ui\.set_icon\(goome::ICON_CLOSE, /, /ui\.set_mask\(Some\("#"\)\)/, /cfg\.cursor\[goome::CUR_BUTTON as usize\] = goome::CURSOR_HAND;/,
    /let _ = ui\.bind\(goome::ACT_COPY, "ctrl\+c"\)/, /Font::system\(Some\("monospace"\)\)/, /ui\.set_mono_font\(Some\(&font\)\)/, /t\.icon_tint = 1;/, /Bitmap::load\("gone\.png"\)\.ok\(\)/,
  ]) {
    assert.match(code, re);
  }
  for (const re of [
    /App::new\("app mode", 800, 500\)|Options::new\(\)\s+\.title\("app mode"\)\s+\.mode\(goome::MODE_WINDOW\)\s+\.size\(800, 500\)\s+\.window_flags\(goome::WINDOW_RESIZABLE \| goome::WINDOW_BORDERLESS \| goome::WINDOW_TRANSPARENT \| goome::WINDOW_CENTER\)/,
    /App::from_goome\(g, "app mode"\)/, /app\.flags = goome::APP_TITLEBAR \| goome::APP_MENUBAR \| goome::APP_STATUSBAR \| goome::APP_NO_PAD;/, /while let Some\(mut f\) = app\.frame\(\)/, /ui\.statusbar\(/,
    /t\.set_made\(0xFF3366FF, false, 6\.0\)/, /ui\.scale\(1\.5\)/, /f\.events\(\)/, /app\.ui\(\)\.hotkey\(/,
  ]) {
    assert.match(acode, re);
  }
  assert.match(gen(coverage()[4][1]).code, /App::new\("goome ui", 960, 640\)/);
});

test("names that are rust keywords or take over our own stay valid", () => {
  const [, p] = coverage()[0];
  const code = gen(p).code;
  for (const bad of ["type", "fn", "loop", "match", "self", "move", "ref", "mod", "crate", "super", "where", "static", "box"]) {
    assert.ok(!new RegExp("\\bs\\." + bad + "\\b").test(code), bad);
    assert.ok(!new RegExp("\\b(let|fn) " + bad + "\\b").test(code), bad);
  }
  assert.match(code, /\n {4}type_v: bool,\n/);
  assert.match(code, /\n {4}match_v: f64,\n/);
  assert.match(code, /\n {4}s_v: i32,\n/);
  assert.match(code, /\bfn box_v\(\) \{\}/);
  assert.match(code, /\bfn main_v\(\) \{\}/);
  assert.match(code, /\bfn draw_v\(\) \{\}/);
  assert.match(code, /\bfn on_click\(\) \{\}/);
});

test("expressions are typed so ints, floats, bools and colors mix", () => {
  const [, p] = coverage()[0];
  const code = gen(p).code;
  assert.match(code, /s\.loop_v as f64 \* 2\.0/);
  assert.match(code, /s\.s_v as f64 \/ 3\.0/);
  assert.match(code, /s\.type_v == s\.fn_v/);
  assert.match(code, /s\.move_v == 0xFF4FA3FF/);
  assert.match(code, /s\.loop_v = \(s\.loop_v as f64 \+ 1\.5\) as i32;/);
  assert.match(code, /s\.free_i \+= 3;/);
  assert.match(code, /s\.free_f -= 0\.25;/);
  assert.match(code, /s\.free_i = \(s\.free_i as f64 \+ s\.s_v as f64 \* 2\.0\) as i32;/);
  assert.match(code, /s\.loop_v = \(s\.loop_v as f64 \+ 2\.0\)\.clamp\(0\.0, 10\.0\) as i32;/);
  assert.match(code, /s\.match_v = \(s\.match_v - 0\.1\)\.clamp\(0\.0, 1\.0\);/);
  assert.match(code, /s\.ui_v = \(s\.ui_v \+ 1\.0\)\.clamp\(0\.0, 5\.0\);/);
});

test("things that cant export warn", () => {
  const [, p] = coverage()[0];
  const w = gen(p).warnings.map((x) => x.msg).join("\n");
  assert.match(w, /only windows and custom elements can sit on the overlay canvas/);
  assert.match(w, /theres no var called/);
  assert.match(w, /the tab target has to be a tabs node/);
  assert.match(w, /show if: ends too early/);
  assert.match(w, /cant set a list var/);
  assert.match(w, /cant bind a project var yet|cant use it, using its own var/);
  assert.match(w, /text boxes cant keep their text in the store/);
});

test("no hotkey code without hotkeys, one hotkey setup with them", () => {
  const code = gen(GM.starterProject()).code;
  assert.ok(!/hotkey/i.test(code));
  assert.match(code, /ui\.begin\(0\)/);
  const hk = gen(coverage()[0][1]).code;
  assert.match(hk, /fn on_hotkey\(/);
  assert.match(hk, /if id == 1 \{/);
  assert.match(hk, /\} else if id == 2 \{/);
  assert.match(hk, /\} else if id == 3 \{/);
});

test("bitmaps are embedded or loaded by file", () => {
  const emb = gen(coverage()[2][1]);
  assert.match(emb.code, /fn from_base64\(/);
  assert.match(emb.code, /Bitmap::from_bytes\(&from_base64\("iVBOR/);
  assert.ok(!/Bitmap::load/.test(emb.code) || /gone\.png/.test(emb.code));
  const mixed = gen(coverage()[0][1]);
  assert.deepStrictEqual(mixed.files, ["gone.png"]);
  assert.match(mixed.code, /Bitmap::load\("gone\.png"\)\.ok\(\)/);
  const file = gen(coverage()[8][1]);
  assert.ok(file.files.includes("skin_button.png") && file.files.includes("dot.png") && file.files.includes("close.png"));
  assert.match(file.code, /Bitmap::load\("dot\.png"\)\.ok\(\)/);
  assert.ok(!/from_base64/.test(file.code));
});

const real = process.env.RUST_GOOME;
test("generated programs build and run on the test backend", { skip: !real }, () => {
  const dir = path.join(process.env.RUST_GOOME_TMP || os.tmpdir(), "gm-rust-check");
  fs.rmSync(path.join(dir, "src"), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "src", "bin"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Cargo.toml"), '[package]\nname = "gen"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n\n[dependencies]\ngoome = { path = ' + JSON.stringify(path.resolve(real)) + " }\n\n[profile.dev]\ndebug = 0\n");
  fs.writeFileSync(path.join(dir, "src", "main.rs"), "fn main() {}\n");
  const names = all().map(([name, p], i) => {
    const n = "p" + i;
    fs.writeFileSync(path.join(dir, "src", "bin", n + ".rs"), gen(p).code);
    return [name, n];
  });
  const env = Object.assign({}, process.env, { RUSTFLAGS: "-D warnings" });
  const build = spawnSync("cargo", ["build", "--offline", "--bins"], { cwd: dir, env, encoding: "utf8", timeout: 900000 });
  assert.strictEqual(build.status, 0, build.stderr);
  const target = process.env.CARGO_TARGET_DIR || path.join(dir, "target");
  for (const [name, n] of names) {
    const run = Object.assign({}, process.env, { GOOME_BACKEND: "test", GOOME_TEST_SCRIPT: "screen 1280x720 1; 1 click 100,100; 3 click 300,200; 4 key ab; 6 hold 400,300 4; end 12" });
    const r = spawnSync(path.join(target, "debug", n), [], { env: run, encoding: "utf8", timeout: 60000 });
    assert.strictEqual(r.status, 0, name + "\n" + r.stderr);
  }
});

module.exports = { coverage };
