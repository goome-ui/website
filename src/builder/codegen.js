(function (root) {
  const GM = typeof require !== "undefined" && typeof module !== "undefined" ? require("./model.js") : root.GM;
  const X = {};

  const C_RESERVED = new Set("index time log exp pow round floor ceil puts printf abs exit free malloc rand signal remove rename select read write close open link kill sleep y0 y1 yn j0 j1 jn gamma fmin fmax fabs sin cos sqrt tan atan stdin stdout stderr errno placeholder set_theme set_config draw load_bitmap pace ph gm_min gm_max gm_abs gm_floor gm_clamp fmt app on_hotkey".split(" "));
  const CS_RESERVED = new Set("ui u g c s e ev th app placeholder running dirty test pace err value draw setTheme tryLoad state theme".split(" "));

  const camel = (s) => s.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());
  const pascal = (s) => camel(s).replace(/^./, (c) => c.toUpperCase());
  const bytes = (s) => {
    let n = 0;
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
  };
  const cut = (s, max) => {
    s = String(s);
    while (bytes(s) > max) s = s.slice(0, -1);
    return s;
  };
  const strq = (s, lang) => {
    let v = String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
    if (lang === "c") v = v.replace(/\?\?/g, "?\\?");
    return '"' + v + '"';
  };
  const num = (v) => {
    v = +v;
    if (!Number.isFinite(v)) v = 0;
    return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  };
  const gdColor = (v) => {
    v = (+v || 0) >>> 0;
    return "Color.hex(0x" + ((((v & 0xFFFFFF) << 8) | (v >>> 24)) >>> 0).toString(16).toUpperCase().padStart(8, "0") + ")";
  };
  const hex = (v, lang) => (lang === "gd" ? gdColor(v) : "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0") + (lang === "cs" ? "u" : ""));
  const bool = (v, lang) => (lang === "py" ? (v ? "True" : "False") : lang === "c" ? (v ? "1" : "0") : v ? "true" : "false");
  const cam = (lang) => lang === "cs" || lang === "java";
  const GD_TAKEN = new Set("hit redraw push_text wants_mouse wants_keyboard get_texture get_image show hide grab_focus release_focus queue_free queue_redraw get set call free connect emit_signal notification print update reset has_focus is_visible get_rect".split(" "));
  const gdFn = (f) => (GD_TAKEN.has(f) ? f + "_fn" : f);
  const JAVA_TAKEN = new Set("App Bitmap Canvas Cell Config Event Flag Fn Font Goome GoomeException Icon Image Item ItemFlag Layout LwjglNative FfmNative Monitor Native Options Pacer PixelFormat Pointer Radii Rect Scratch Skin Sort Split Style Styled TextBuffer TextSize Theme Ui Window String Math System Object Integer Double Boolean Base64 DoubleBuffer Main".split(" "));
  const javaClass = (project) => {
    let n = pascal(GM.ident(project.name || project.title || "ui", "ui").replace(/_v$/, "")) || "Ui";
    if (/^[0-9]/.test(n)) n = "V" + n;
    if (JAVA_TAKEN.has(n)) n += "App";
    return n;
  };
  const floats = (s) => String(s || "").split(/[\s,]+/).filter((x) => x !== "").map(Number).filter(Number.isFinite);

  function Out(py) {
    this.l = [];
    this.d = 0;
    this.py = py;
    this.marks = [];
  }
  Out.prototype.add = function (s) {
    this.l.push(s === "" ? "" : "    ".repeat(this.d) + s);
  };
  Out.prototype.open = function (h) {
    this.add(this.py ? h : h + " {");
    this.d++;
    this.marks.push(this.l.length);
  };
  Out.prototype.close = function (tail) {
    const m = this.marks.pop();
    if (this.py && this.l.length === m) this.add("pass");
    this.d--;
    if (!this.py) this.add("}" + (tail || ""));
  };
  Out.prototype.text = function () {
    return this.l.join("\n");
  };

  function names(project) {
    const used = new Set();
    const map = new Map();
    const take = (base) => {
      let v = GM.ident(base);
      const bad = (x) => used.has(x) || C_RESERVED.has(x) || CS_RESERVED.has(camel(x)) || GM.RESERVED.has(camel(x));
      if (bad(v)) {
        const stem = v.replace(/_?\d+$/, "") || "v";
        let i = 2;
        while (bad(stem + i)) i++;
        v = stem + i;
      }
      used.add(v);
      for (const sfx of ["_items", "_names", "_cells", "_rows", "_x", "_y", "_w", "_h", "_open", "_frac"]) used.add(v + sfx);
      return v;
    };
    const vnm = new Map();
    for (const v of project.vars || []) vnm.set(v.id, take(v.name));
    for (const f of ["app", "fmt", "on_hotkey"]) used.add(f);
    GM.walk(project.root, (n) => {
      if (n.p && n.p.var && !n.p.bind) map.set(n.id, take(n.p.var));
      else if (["window", "scroll", "split", "tabs", "collapsing", "tree", "modal", "table", "plot_lines", "plot_bars", "combo", "selectable", "radio", "checkbox", "toggle", "slider", "slider_int", "input", "text_edit", "color", "el"].includes(n.type)) map.set(n.id, take(n.type));
      else if (n.type === "menu_item" && n.p.check) map.set(n.id, take(n.p.label || "item"));
    });
    for (const d of project.elements || []) {
      used.add(d.name + "_state");
      used.add(d.name + "_draw");
      used.add(d.name + "_ui");
    }
    map.vnm = vnm;
    map.take = take;
    return map;
  }

  const WFLAGS = [["move", "GOOME_WIN_MOVE", "WindowFlags.Move", "goome.WIN_MOVE"], ["resize", "GOOME_WIN_RESIZE", "WindowFlags.Resize", "goome.WIN_RESIZE"],
    ["collapse", "GOOME_WIN_COLLAPSE", "WindowFlags.Collapse", "goome.WIN_COLLAPSE"], ["notitle", "GOOME_WIN_NO_TITLE", "WindowFlags.NoTitle", "goome.WIN_NO_TITLE"],
    ["close", "GOOME_WIN_CLOSE", "WindowFlags.Close", "goome.WIN_CLOSE"]];
  const EFLAGS = [["readonly", "GOOME_EDIT_READONLY", "EditFlags.ReadOnly", "goome.EDIT_READONLY"], ["numbers", "GOOME_EDIT_LINE_NUMBERS", "EditFlags.LineNumbers", "goome.EDIT_LINE_NUMBERS"],
    ["wrap", "GOOME_EDIT_WRAP", "EditFlags.Wrap", "goome.EDIT_WRAP"], ["mono", "GOOME_EDIT_MONO", "EditFlags.Mono", "goome.EDIT_MONO"]];
  const TFLAGS = [["sortable", "GOOME_TABLE_SORTABLE", "TableFlags.Sortable", "goome.TABLE_SORTABLE"], ["resizable", "GOOME_TABLE_RESIZABLE", "TableFlags.Resizable", "goome.TABLE_RESIZABLE"],
    ["stripes", "GOOME_TABLE_STRIPES", "TableFlags.Stripes", "goome.TABLE_STRIPES"], ["borders", "GOOME_TABLE_BORDERS", "TableFlags.Borders", "goome.TABLE_BORDERS"]];
  const AFLAGS = [["titlebar", "GOOME_APP_TITLEBAR", "AppFlags.TitleBar", "goome.APP_TITLEBAR"], ["menubar", "GOOME_APP_MENUBAR", "AppFlags.MenuBar", "goome.APP_MENUBAR"],
    ["statusbar", "GOOME_APP_STATUSBAR", "AppFlags.StatusBar", "goome.APP_STATUSBAR"], ["nopad", "GOOME_APP_NO_PAD", "AppFlags.NoPad", "goome.APP_NO_PAD"]];
  const IFLAGS = [["password", "GOOME_INPUT_PASSWORD", "InputFlags.Password", "goome.INPUT_PASSWORD"], ["readonly", "GOOME_INPUT_READONLY", "InputFlags.ReadOnly", "goome.INPUT_READONLY"],
    ["number", "GOOME_INPUT_NUMBER", "InputFlags.Number", "goome.INPUT_NUMBER"], ["noselect", "GOOME_INPUT_NO_SELECT_ON_FOCUS", "InputFlags.NoSelectOnFocus", "goome.INPUT_NO_SELECT_ON_FOCUS"],
    ["enter", "GOOME_INPUT_ENTER_RETURNS", "InputFlags.EnterReturns", "goome.INPUT_ENTER_RETURNS"]];
  const LI = { c: 1, cs: 2, py: 3, java: 3, gd: 3 };
  const flags = (table, p, lang) => {
    const on = table.filter((f) => p[f[0]]).map((f) => (lang === "java" ? f[3].replace("goome.", "Ui.") : lang === "gd" ? f[3].replace("goome.", "GoomeUI.") : f[LI[lang]]));
    if (!on.length) return lang === "cs" ? table[0][2].split(".")[0] + ".None" : "0";
    return on.join(" | ");
  };

  const THC = { bg: "Bg", panel: "Panel", border: "Border", text: "Text", text_dim: "TextDim", accent: "Accent", accent_text: "AccentText", hover: "Hover", active: "Active", input_bg: "InputBg", shadow: "Shadow", radius: "Radius", pad: "Pad", gap: "Gap", border_width: "BorderWidth", font_size: "FontSize", shadow_blur: "ShadowBlur", anim_ms: "AnimMs" };

  function Ctx(project, lang, warn) {
    this.project = project;
    this.lang = lang;
    this.warn = warn;
    this.nm = names(project);
    this.vnm = this.nm.vnm;
    this.uniq = (b) => this.nm.take(b);
    this.top = [];
    this.consts = [];
    this.inits = [];
    this.need = { placeholder: false, math: false };
    this.files = new Set();
    this.scope = null;
    this.defs = new Map((project.elements || []).map((d) => [d.id, d]));
    this.used = new Map();
    this.insts = [];
  }
  Ctx.prototype.id = function (name) {
    return cam(this.lang) ? camel(name) : name;
  };
  Ctx.prototype.v = function (name) {
    const id = this.id(name);
    if (this.scope) return this.scope.alias[name] || id;
    if (this.lang === "py" || this.lang === "gd") return "s." + id;
    return id;
  };
  Ctx.prototype.local = function (type, name, e) {
    const lang = this.lang;
    if (lang === "py") return name + " = " + e;
    if (lang === "gd") return "var " + name + " = " + e;
    if (lang === "c") return (type === "bool" ? "int" : type === "var" ? "double" : type) + " " + name + " = " + e + ";";
    if (lang === "java") return (type === "bool" ? "boolean" : type) + " " + name + " = " + e + ";";
    return type + " " + name + " = " + e + ";";
  };
  Ctx.prototype.addr = function (name) {
    return this.lang === "c" ? "&" + this.v(name) : this.lang === "cs" ? "ref " + this.v(name) : this.v(name);
  };
  Ctx.prototype.decl = function (kind, name, val, extra) {
    const lang = this.lang;
    const id = this.id(name);
    const sc = this.scope;
    if (sc) {
      if (kind === "floats") {
        const top = sc.prefix + "_" + name;
        sc.alias[name] = cam(lang) ? camel(top) : lang === "py" || lang === "gd" ? top.toUpperCase() : top;
        if (lang === "c") this.consts.push("static float " + top + "[] = {" + (val.length ? val.map(num).join(", ") : "0") + "};");
        else if (lang === "cs") this.consts.push("float[] " + camel(top) + " = { " + val.map((x) => num(x) + "f").join(", ") + " };");
        else if (lang === "java") this.consts.push("static final float[] " + camel(top) + " = {" + val.map((x) => num(x) + "f").join(", ") + "};");
        else if (lang === "gd") this.consts.push("const " + top.toUpperCase() + ": PackedFloat32Array = [" + val.map(num).join(", ") + "]");
        else this.consts.push(top.toUpperCase() + " = [" + val.map(num).join(", ") + "]");
        return;
      }
      sc.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" || kind === "flag" ? (val ? 1 : 0) : +val || 0 });
      return;
    }
    let line;
    if (lang === "c") {
      const T = { int: "int", bool: "int", flag: "int", double: "double", color: "uint32_t" }[kind];
      if (kind === "str") {
        const cap = Math.max(2, extra | 0);
        line = sc ? ["char " + id + "[" + cap + "];", strq(cut(val, cap - 1), "c")] : "static char " + id + "[" + cap + "] = " + strq(cut(val, cap - 1), "c") + ";";
      } else if (kind === "floats") {
        const v = val.length ? val.map(num).join(", ") : "0";
        line = sc ? ["float " + id + "[" + Math.max(1, val.length) + "];", "{" + v + "}"] : "static float " + id + "[] = {" + v + "};";
      } else {
        const lit = kind === "color" ? hex(val, lang) : kind === "double" ? num(val) : kind === "int" ? String(val | 0) : val ? "1" : "0";
        line = sc ? [T + " " + id + ";", lit] : "static " + T + " " + id + " = " + lit + ";";
      }
    } else if (lang === "cs") {
      const T = { int: "int", bool: "bool", flag: "bool", double: "double", color: "uint", str: "string", floats: "float[]" }[kind];
      const lit = kind === "color" ? hex(val, lang) : kind === "double" ? num(val) : kind === "int" ? String(val | 0) : kind === "str" ? strq(cut(val, Math.max(2, extra | 0) - 1), "cs") : kind === "floats" ? "{ " + val.map((x) => num(x) + "f").join(", ") + " }" : bool(val, lang);
      line = (sc ? "public " : "") + T + " " + id + " = " + (kind === "floats" && sc ? "new float[] " + lit : lit) + ";";
    } else if (lang === "java") {
      const T = { int: "int", bool: "boolean", flag: "boolean", double: "double", color: "int", str: "String", floats: "float[]" }[kind];
      const lit = kind === "color" ? hex(val, lang) : kind === "double" ? num(val) : kind === "int" ? String(val | 0) : kind === "str" ? strq(cut(val, Math.max(2, extra | 0) - 1), "cs") : kind === "floats" ? "{" + val.map((x) => num(x) + "f").join(", ") + "}" : bool(val, lang);
      line = "static " + T + " " + id + " = " + lit + ";";
    } else if (lang === "gd") {
      const T = { int: "int", bool: "bool", flag: "bool", double: "float", color: "Color", str: "String", floats: "PackedFloat32Array" }[kind];
      const lit = kind === "color" ? hex(val, lang) : kind === "double" ? (Number.isInteger(+val) ? num(val) + ".0" : num(val)) : kind === "int" ? String(val | 0) : kind === "str" ? strq(cut(val, Math.max(2, extra | 0) - 1), "cs") : kind === "floats" ? "[" + val.map(num).join(", ") + "]" : bool(val, lang);
      line = "var " + id + ": " + T + " = " + lit;
    } else {
      const lit = kind === "color" ? hex(val, lang) : kind === "double" ? (Number.isInteger(+val) ? num(val) + ".0" : num(val)) : kind === "int" ? String(val | 0) : kind === "str" ? strq(cut(val, Math.max(2, extra | 0) - 1), "py") : kind === "floats" ? "[" + val.map(num).join(", ") + "]" : kind === "flag" ? "goome.Flag(" + bool(val, lang) + ")" : bool(val, lang);
      line = sc ? "self." + id + " = " + lit : id + " = " + lit;
    }
    (sc ? sc.fields : this.top).push(line);
  };
  Ctx.prototype.constArr = function (name, items) {
    const lang = this.lang;
    if (this.scope) name = this.scope.prefix + "_" + name;
    const id = cam(lang) ? camel(name) : lang === "py" || lang === "gd" ? name.toUpperCase() : name;
    if (lang === "c") this.consts.push("static const char *const " + id + "[] = {" + items.map((x) => strq(x, "c")).join(", ") + "};");
    else if (lang === "cs") this.consts.push("string[] " + id + " = { " + items.map((x) => strq(x, "cs")).join(", ") + " };");
    else if (lang === "java") this.consts.push("static final String[] " + id + " = {" + items.map((x) => strq(x, "cs")).join(", ") + "};");
    else if (lang === "gd") this.consts.push("const " + id + ": PackedStringArray = [" + items.map((x) => strq(x, "cs")).join(", ") + "]");
    else this.consts.push(id + " = [" + items.map((x) => strq(x, "py")).join(", ") + "]");
    return id;
  };

  const isRoot = (pt) => pt === "overlay" || pt === "app";
  const wrapped = (e) => {
    if (e[0] !== "(" || e[e.length - 1] !== ")") return false;
    let d = 0;
    for (let i = 0; i < e.length; i++) {
      if (e[i] === "(") d++;
      else if (e[i] === ")") d--;
      if (d === 0 && i < e.length - 1) return false;
    }
    return true;
  };
  const par = (e) => (/^-?[\w.]+(->\w+)?(\[\d+\])?$/.test(e) || wrapped(e) ? e : "(" + e + ")");
  const plus = (a, b) => (a === "0" ? b : b === "0" ? a : a + " + " + b);
  const minus = (a, b) => (b === "0" ? a : a + " - " + par(b));
  const neg = (e) => (e === "0" ? "0" : "-" + par(e));

  function emitList(list, ctx, out, ptype) {
    for (const n of list) emitNode(n, ctx, out, ptype);
  }

  const SFIELDS = GM.THEME_COLORS.concat(GM.THEME_SIZES);
  function styleArgs(ctx, st) {
    const lang = ctx.lang;
    const f = {};
    const th = st.theme ? GM.findTheme(ctx.project, st.theme) : null;
    if (st.theme && !th) ctx.warn("", "a style uses a theme that is gone: " + st.theme);
    if (th) {
      const t = GM.normTheme(th);
      SFIELDS.forEach((k) => {
        if (!NEWF.has(k) || +t[k] !== +GM.THEME_REST[k]) f[k] = t[k];
      });
    }
    for (const k of GM.THEME_COLORS) if (st.c && st.c[k] != null) f[k] = st.c[k];
    for (const k of GM.THEME_SIZES) if (st.n && st.n[k] != null) f[k] = st.n[k];
    const out = [];
    for (const k of SFIELDS) {
      if (!(k in f)) continue;
      const v = fieldLit(k, f[k], lang);
      out.push(lang === "cs" ? camel(k) + ": " + v : lang === "java" ? "." + camel(k) + "(" + v + ")" : lang === "gd" ? strq(k, "gd") + ": " + (GM.THEME_COLORS.includes(k) || GM.THEME_ENUMS[k] || /\./.test(v) ? v : v + ".0") : k + "=" + v);
    }
    if (Array.isArray(st.radii) && st.radii.length === 4) {
      const r = st.radii.map(num).join(", ");
      out.push(lang === "cs" ? "radii: new Radii(" + r + ")" : lang === "java" ? ".radii(" + r + ")" : lang === "gd" ? '"radii": Vector4(' + r + ")" : "radii=(" + r + ")");
    }
    return out;
  }
  function themeVar(ctx, id) {
    ctx.themeVars = ctx.themeVars || new Map();
    if (!ctx.themeVars.has(id)) {
      const t = GM.findTheme(ctx.project, id);
      let base = "theme_" + GM.ident(t ? t.name : id, "t");
      const used = new Set([...ctx.themeVars.values()]);
      let v = base, i = 2;
      while (used.has(v)) v = base + i++;
      ctx.themeVars.set(id, v);
    }
    return ctx.themeVars.get(id);
  }
  function styled(ctx, out, st, body) {
    const k = GM.styleCount(st);
    if (!k) return body();
    const lang = ctx.lang;
    if (lang === "c") {
      const th = st.theme ? GM.findTheme(ctx.project, st.theme) : null;
      let pushed = 0;
      if (st.theme && th) out.add("goome_ui_push_theme(u, &" + themeVar(ctx, st.theme) + ");"), pushed++;
      else if (st.theme) ctx.warn("", "a style uses a theme that is gone: " + st.theme);
      for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) out.add("goome_ui_push_color(u, GOOME_S_" + f.toUpperCase() + ", " + hex(st.c[f], "c") + ");"), pushed++;
      for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) out.add("goome_ui_push_num(u, GOOME_S_" + f.toUpperCase() + ", " + fieldLit(f, st.n[f], "c") + ");"), pushed++;
      if (Array.isArray(st.radii) && st.radii.length === 4) out.add("goome_ui_push_radii(u, (goome_radii){" + st.radii.map(num).join(", ") + "});"), pushed++;
      body();
      if (pushed) out.add("goome_ui_pop(u, " + pushed + ");");
      return;
    }
    const args = styleArgs(ctx, st);
    if (!args.length) return body();
    if (lang === "gd") {
      const p = "pushed" + ++ctx.k;
      out.add("var " + p + " = ui.push_style({" + args.join(", ") + "})");
      body();
      out.add("ui.pop(" + p + ")");
      return;
    }
    if (lang === "cs") out.open("using (ui.Style(" + args.join(", ") + "))");
    else if (lang === "java") out.open("try (Styled style" + ++ctx.k + " = ui.style()" + args.join("") + ".push())");
    else out.open("with ui.style(" + args.join(", ") + "):");
    body();
    out.close();
  }

  function emitSlot(n, s, ctx, out, ptype) {
    const st = n.slotStyle && n.slotStyle[String(s)];
    styled(ctx, out, st, () => emitList(n.kids[s] || [], ctx, out, ptype));
  }

  const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };
  const FLAGGY = { tree: 1, modal: 1, menu_item: 1 };

  function prepass(ctx) {
    const pj = ctx.project, lang = ctx.lang, py = lang === "py";
    ctx.refs = new Map();
    ctx.vars = new Map();
    ctx.targets = new Set();
    ctx.fns = [];
    ctx.k = 0;
    const flagVars = new Set();
    GM.walk(pj.root, (n) => {
      if (n.p && n.p.bind && FLAGGY[n.type]) flagVars.add(n.p.bind);
      const on = n.on || {};
      for (const e in on) for (const a of on[e] || []) note(a);
    });
    for (const hk of pj.hotkeys || []) for (const a of hk.actions || []) note(a);
    function note(a) {
      if (!a) return;
      if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) ctx.targets.add(a.target);
      if (a.do === "call" && a.fn) {
        const f = GM.ident(a.fn, "on_click");
        if (!ctx.fns.includes(f)) ctx.fns.push(f);
      }
    }
    const caps = {};
    GM.walk(pj.root, (n) => {
      if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
    });
    for (const v of pj.vars || []) {
      const name = ctx.vnm.get(v.id);
      const id = cam(lang) ? camel(name) : name;
      const flag = py && v.type === "bool" && flagVars.has(v.id);
      const code = py ? "s." + id + (flag ? ".value" : "") : lang === "gd" ? "s." + id : id;
      const r = { name, code, obj: py ? "s." + id : id, type: v.type, flag, v, cap: Math.max(256, caps[v.id] || 0) };
      ctx.vars.set(v.id, r);
      ctx.refs.set(v.name, r);
      declVar(ctx, r);
    }
    GM.walk(pj.root, (n) => {
      if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || ctx.refs.has(n.p.var)) return;
      const nm = ctx.nm.get(n.id);
      if (!nm) return;
      const id = cam(lang) ? camel(nm) : nm;
      const flag = py && FLAGGY[n.type];
      ctx.refs.set(n.p.var, { name: nm, code: py ? "s." + id + (flag ? ".value" : "") : lang === "gd" ? "s." + id : id, type: OWN_T[n.type] });
    });
  }

  function declVar(ctx, r) {
    const lang = ctx.lang, v = r.v, id = cam(lang) ? camel(r.name) : r.name;
    const d = v.def;
    if (v.type === "list") {
      const items = GM.lines(d);
      if (lang === "c") ctx.consts.push("static const char *const " + id + "[] = {" + (items.length ? items : [""]).map((x) => strq(x, "c")).join(", ") + "};");
      else if (lang === "cs") ctx.consts.push("string[] " + id + " = { " + items.map((x) => strq(x, "cs")).join(", ") + " };");
      else if (lang === "java") ctx.consts.push("static final String[] " + id + " = {" + items.map((x) => strq(x, "cs")).join(", ") + "};");
      else if (lang === "gd") ctx.top.push("var " + id + ": PackedStringArray = [" + items.map((x) => strq(x, "cs")).join(", ") + "]");
      else ctx.top.push(id + " = [" + items.map((x) => strq(x, "py")).join(", ") + "]");
      return;
    }
    const kind = { bool: r.flag ? "flag" : "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
    const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? (+d >>> 0) : v.type === "bool" ? !!d : +d || 0;
    const save = ctx.scope;
    ctx.scope = null;
    ctx.decl(kind, r.name, val, r.cap);
    ctx.scope = save;
  }

  function listInfo(ctx, n) {
    const p = n.p, lang = ctx.lang;
    if (p.itemsVar) {
      const r = ctx.vars.get(p.itemsVar);
      if (r && r.type === "list") {
        const len = lang === "c" ? "(int)(sizeof(" + r.code + ") / sizeof(*" + r.code + "))" : lang === "cs" ? r.code + ".Length" : lang === "java" ? r.code + ".length" : lang === "gd" ? r.code + ".size()" : "len(" + r.code + ")";
        return { arr: r.code, len, items: GM.lines(r.v.def), dyn: true };
      }
      ctx.warn(n.id, "the items list var is gone or isnt a list, using the typed items");
    }
    return null;
  }

  function exprCode(ctx, src, want, where, id) {
    const types = GM.layoutIdents(ctx.project);
    const r = GM.expr.check(src, types, want);
    if (!r.ok) {
      ctx.warn(id || "", where + ": " + r.err);
      return null;
    }
    const map = {
      id: (name) => {
        const ref = ctx.refs.get(name);
        return ref ? ref.code : name;
      },
      th: (f) => thCode(ctx.lang, f, "ui"),
    };
    let s = GM.expr.code(r.ast, ctx.lang, map, types);
    if (want === "b" && ctx.lang !== "c" && ctx.lang !== "py" && r.type !== "b") s = par(s) + " != 0";
    if (want === "n" && r.type === "b") s = ctx.lang === "py" || ctx.lang === "gd" ? "int(" + s + ")" : cam(ctx.lang) ? "(" + s + " ? 1 : 0)" : s;
    return s;
  }
  function thCode(lang, f, ui) {
    if (lang === "c") return "goome_ui_theme(u)->" + f;
    if (lang === "cs") return ui + ".Theme." + THC[f];
    if (lang === "java") return ui + ".theme()." + camel(f) + "()";
    if (lang === "gd") return ui + ".theme_get(" + strq(f, "gd") + ")";
    return ui + ".theme." + f;
  }

  function textCode(ctx, text, opts) {
    const lang = ctx.lang;
    const parts = GM.interp(text);
    const vars = parts.filter((x) => x.v && ctx.refs.has(x.v));
    for (const x of parts) if (x.v && !ctx.refs.has(x.v)) ctx.warn((opts && opts.id) || "", "theres no var called " + x.v + " for {" + x.v + "}");
    if (!vars.length) return { code: strq(text, lang), dyn: false };
    if (lang === "c") {
      let f = "";
      const args = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        if (!r) f += (x.t != null ? x.t : "{" + x.v + "}").replace(/%/g, "%%");
        else if (r.type === "float") f += "%g", args.push(r.code);
        else if (r.type === "string") f += "%s", args.push(r.code);
        else if (r.type === "color") f += "#%08X", args.push("(unsigned)" + r.code);
        else if (r.type === "list") f += "%s", args.push(r.code + "[0]");
        else f += "%d", args.push(r.code);
      }
      if (opts && opts.printf) return { code: strq(f, "c") + ", " + args.join(", "), dyn: true, printf: true };
      ctx.need.fmt = true;
      return { code: "fmt(" + strq(f, "c") + ", " + args.join(", ") + ")", dyn: true, fmt: f, args };
    }
    if (lang === "gd") {
      let f = "";
      const args = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        if (!r) f += (x.t != null ? x.t : "{" + x.v + "}").replace(/%/g, "%%");
        else if (r.type === "color") f += "#%s", args.push(r.code + ".to_html()");
        else if (r.type === "list") f += "%s", args.push(r.code + "[0]");
        else f += "%s", args.push(r.code);
      }
      return { code: strq(f, "gd") + " % [" + args.join(", ") + "]", dyn: true };
    }
    if (lang === "java") {
      const bits = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        if (!r) bits.push(strq(x.t != null ? x.t : "{" + x.v + "}", "cs"));
        else if (r.type === "color") bits.push('"#"', 'String.format("%08X", ' + r.code + ")");
        else if (r.type === "list") bits.push(r.code + "[0]");
        else bits.push(r.code);
      }
      if (!/^"/.test(bits[0])) bits.unshift('""');
      return { code: bits.join(" + "), dyn: true };
    }
    let s = "";
    for (const x of parts) {
      const r = x.v && ctx.refs.get(x.v);
      if (!r) s += strq(x.t != null ? x.t : "{" + x.v + "}", lang).slice(1, -1).replace(/\{/g, "{{").replace(/\}/g, "}}");
      else if (r.type === "color") s += lang === "cs" ? "#{" + r.code + ":X8}" : "#{" + r.code + ":08X}";
      else if (r.type === "list") s += "{" + r.code + "[0]}";
      else s += "{" + r.code + "}";
    }
    return { code: (lang === "cs" ? "$" : "f") + '"' + s + '"', dyn: true };
  }

  function emitActions(ctx, out, list, where) {
    const lang = ctx.lang, c = lang === "c", cs = lang === "cs", py = lang === "py", jv = lang === "java", gd = lang === "gd";
    const ind = py || gd;
    const St = (s) => out.add(s + (ind ? "" : ";"));
    const U = (cf, csf, pyf, args) => (c ? "goome_ui_" + cf + "(" + ["u"].concat(args).join(", ") + ")" : cs ? "ui." + csf + "(" + args.join(", ") + ")" : jv ? "ui." + camel(pyf) + "(" + args.join(", ") + ")" : "ui." + pyf + "(" + args.join(", ") + ")");
    const idx = GM.index(ctx.project);
    let any = false;
    for (const a of list || []) {
      if (!a || !a.do) continue;
      any = true;
      const refOf = (name) => {
        const r = ctx.refs.get(name);
        if (!r) ctx.warn("", where + ": theres no var called " + (name || "(none)"));
        return r;
      };
      switch (a.do) {
        case "set": {
          const r = refOf(a.var);
          if (!r) break;
          if (r.type === "string") {
            const t = textCode(ctx, a.value || "", {});
            if (c) {
              if (t.dyn) St("snprintf(" + r.code + ", sizeof(" + r.code + "), " + strq(t.fmt, "c") + ", " + t.args.join(", ") + ")");
              else St("snprintf(" + r.code + ", sizeof(" + r.code + "), \"%s\", " + t.code + ")");
            } else St(r.code + " = " + t.code);
            break;
          }
          if (r.type === "list") {
            ctx.warn("", where + ": cant set a list var, its fixed");
            break;
          }
          const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
          let e = exprCode(ctx, a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want, where);
          if (e == null) break;
          if (r.type === "int") e = c || cs || jv ? "(int)" + par(e) : "int(" + e + ")";
          if (r.type === "color" && cs) e = "(uint)" + par(e);
          St(r.code + " = " + e);
          break;
        }
        case "toggle": {
          const r = refOf(a.var);
          if (!r) break;
          if (r.type !== "bool") {
            ctx.warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
            break;
          }
          St(r.code + " = " + (ind ? "not " : "!") + r.code);
          break;
        }
        case "add":
        case "sub": {
          const r = refOf(a.var);
          if (!r) break;
          if (r.type !== "int" && r.type !== "float") {
            ctx.warn("", where + ": add/sub needs a number var");
            break;
          }
          const e = exprCode(ctx, a.value === "" || a.value == null ? "1" : a.value, "n", where);
          if (e == null) break;
          const op = a.do === "add" ? " + " : " - ";
          let v = r.code + op + par(e);
          if (r.v && +r.v.max > +r.v.min) {
            ctx.need.math = true;
            const lo = num(r.v.min), hi = num(r.v.max);
            v = c ? "gm_clamp(" + v + ", " + lo + ", " + hi + ")" : cs ? "Math.Max(" + lo + ", Math.Min(" + hi + ", " + v + "))" : jv ? "Math.max(" + lo + ", Math.min(" + hi + ", " + v + "))" : gd ? "clamp(" + v + ", " + lo + ", " + hi + ")" : "max(" + lo + ", min(" + hi + ", " + v + "))";
          }
          if (r.type === "int") v = c || cs || jv ? "(int)" + (/^\w/.test(v) && !/[ ]/.test(v) ? v : par(v)) : "int(" + v + ")";
          St(r.code + " = " + v);
          break;
        }
        case "open":
        case "close": {
          const t = idx.get(a.target);
          if (!t) {
            ctx.warn("", where + ": the " + a.do + " target is gone");
            break;
          }
          const on = a.do === "open";
          const tn = t.n;
          if (tn.type === "popup") {
            if (on) St(U("popup_open", "PopupOpen", "popup_open", [strq(tn.p.label || "popup", lang)]));
            else St(U("popup_close", "PopupClose", "popup_close", []));
          } else if (tn.type === "window" || tn.type === "modal") {
            if (gd && tn.type === "modal" && !on) ctx.warn(tn.id, where + ": godot-goome cant close a modal from code, esc or its X closes it");
            St(openSet(ctx, tn, on));
          } else ctx.warn("", where + ": can only open or close a window, modal or popup");
          break;
        }
        case "toast": {
          const t = textCode(ctx, a.text || "", {});
          St(U("toast", "Toast", "toast", [t.code, String(+a.ms > 0 ? a.ms | 0 : 2500)]));
          break;
        }
        case "tab": {
          const t = idx.get(a.target);
          if (!t || t.n.type !== "tabs") {
            ctx.warn("", where + ": the tab target has to be a tabs node");
            break;
          }
          const r = t.n.p.bind ? ctx.vars.get(t.n.p.bind) : ctx.refs.get(t.n.p.var);
          if (!r) break;
          St(r.code + " = " + (a.tab | 0));
          break;
        }
        case "copy": {
          const t = textCode(ctx, a.text || "", {});
          if (c) St("goome_clipboard_set(app, " + t.code + ")"), (ctx.need.app = true);
          else if (cs) St("ui.Goome.SetClipboard(" + t.code + ")");
          else if (jv) St("ui.goome().clipboard(" + t.code + ")");
          else if (gd) St("DisplayServer.clipboard_set(" + t.code + ")");
          else St("G.clipboard = " + t.code), (ctx.need.g = true);
          break;
        }
        case "quit":
          if (c) {
            ctx.need.app = true;
            out.add("{");
            out.add("    goome_event e = {0};");
            out.add("    e.type = GOOME_CLOSE;");
            out.add("    goome_push(app, &e);");
            out.add("}");
          } else if (cs) St("ui.Goome.Push(new Event(EventType.Close))");
          else if (jv) St("ui.goome().push(Event.of(Goome.CLOSE))");
          else if (gd) St("get_tree().quit()");
          else St("G.push(goome.CLOSE)"), (ctx.need.g = true);
          break;
        case "call": {
          const f = GM.ident(a.fn, "on_click");
          St((cs ? pascal(f) : jv ? camel(f) : gd ? gdFn(f) : f) + "()");
          break;
        }
        default:
          ctx.warn("", where + ": dont know the action " + a.do);
      }
    }
    if (!any && ind) out.add("pass");
  }

  function openRef(ctx, n) {
    const lang = ctx.lang;
    if (n.p.bind) {
      const r = ctx.vars.get(n.p.bind);
      if (r) return r.code;
    }
    const nm = ctx.nm.get(n.id) || GM.ident(n.p.var || n.type);
    if (n.type === "window") return lang === "c" ? nm + "_open" : lang === "cs" ? camel(nm) + "Open" : lang === "java" ? camel(nm) + ".open()" : lang === "gd" ? "ui.is_window_open(" + winTitle(ctx, n) + ")" : "s." + nm + ".open";
    return lang === "py" ? "s." + nm + ".value" : lang === "gd" ? "s." + nm : cam(lang) ? camel(nm) : nm;
  }
  function openSet(ctx, n, on) {
    const lang = ctx.lang, b = bool(on, lang);
    if (!n.p.bind || !ctx.vars.get(n.p.bind)) {
      if (n.type === "window" && lang === "java") return camel(ctx.nm.get(n.id) || GM.ident(n.p.var || n.type)) + ".open(" + b + ")";
      if (n.type === "window" && lang === "gd") return "ui.set_window_open(" + winTitle(ctx, n) + ", " + b + ")";
    }
    return openRef(ctx, n) + " = " + b;
  }
  function winTitle(ctx, n) {
    const t = textCode(ctx, n.p.label == null ? "" : n.p.label, { id: n.id });
    if (t.dyn) ctx.warn(n.id, "godot-goome keeps a window's spot by its title, a title with {vars} in it starts over each time the text changes");
    return t.code;
  }

  function emitNode(n, ctx, out, ptype) {
    const lang = ctx.lang, py = lang === "py" || lang === "gd";
    const go = () => styled(ctx, out, n.style, () => emitEnabled(n, ctx, out, ptype));
    if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
      const e = exprCode(ctx, n.p.showIf, "b", "show if", n.id);
      if (e != null) {
        out.open(py ? "if " + e + ":" : "if (" + e + ")");
        go();
        out.close();
        return;
      }
    }
    go();
  }

  const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };
  function emitEnabled(n, ctx, out, ptype) {
    const lang = ctx.lang, c = lang === "c", cs = lang === "cs", jv = lang === "java", gd = lang === "gd", py = lang === "py" || gd;
    const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
    if (!src) return emitBare(n, ctx, out, ptype, null);
    const e = exprCode(ctx, src, "b", "enable if", n.id);
    if (e == null) return emitBare(n, ctx, out, ptype, null);
    const en = "en" + ++ctx.k;
    out.add(ctx.local("bool", en, e));
    const dim = c ? ["goome_ui_push_color(u, GOOME_S_TEXT, goome_ui_theme(u)->text_dim);", "goome_ui_push_color(u, GOOME_S_ACCENT, (goome_ui_theme(u)->accent & 0xFFFFFF) | (goome_ui_theme(u)->accent >> 25) << 24);"]
      : cs ? ["ui.PushColor(Style.Text, ui.Theme.TextDim);", "ui.PushColor(Style.Accent, (ui.Theme.Accent & 0xFFFFFFu) | (ui.Theme.Accent >> 25) << 24);"]
      : jv ? ["ui.pushColor(Style.TEXT, ui.theme().textDim());", "ui.pushColor(Style.ACCENT, (ui.theme().accent() & 0xFFFFFF) | (ui.theme().accent() >>> 25) << 24);"]
      : gd ? ['ui.push_color(GoomeUI.S_TEXT, ui.theme_get("text_dim"))', 'ui.push_color(GoomeUI.S_ACCENT, Color(ui.theme_get("accent"), ui.theme_get("accent").a * 0.5))']
      : ["ui.push_color(goome.S_TEXT, ui.theme.text_dim)", "ui.push_color(goome.S_ACCENT, (ui.theme.accent & 0xFFFFFF) | (ui.theme.accent >> 25) << 24)"];
    out.open(py ? "if not " + en + ":" : "if (!" + en + ")");
    dim.forEach((l) => out.add(l));
    out.close();
    let saved = null;
    if (VALUE_T[n.type]) {
      const r = bareRef(ctx, n);
      if (r) {
        const w = "was" + ctx.k;
        saved = { r, w };
        if (c && r.type === "string") out.add("char " + w + "[sizeof(" + r.code + ")];"), out.add("memcpy(" + w + ", " + r.code + ", sizeof(" + w + "));");
        else if (c) out.add((r.type === "float" ? "double " : r.type === "color" ? "uint32_t " : "int ") + w + " = " + r.code + ";");
        else if (cs || jv) out.add("var " + w + " = " + r.code + ";");
        else out.add(ctx.local("var", w, r.code));
      }
    }
    emitBare(n, ctx, out, ptype, en);
    out.open(py ? "if not " + en + ":" : "if (!" + en + ")");
    if (saved) {
      if (c && saved.r.type === "string") out.add("memcpy(" + saved.r.code + ", " + saved.w + ", sizeof(" + saved.w + "));");
      else out.add(saved.r.code + " = " + saved.w + (py ? "" : ";"));
    }
    out.add(c ? "goome_ui_pop(u, 2);" : cs ? "ui.Pop(2);" : jv ? "ui.pop(2);" : "ui.pop(2)");
    out.close();
  }

  function bareRef(ctx, n) {
    if (n.p.bind) return ctx.vars.get(n.p.bind) || null;
    if (!OWN_T[n.type]) return null;
    const nm = ctx.nm.get(n.id);
    if (!nm) return null;
    const lang = ctx.lang, id = cam(lang) ? camel(nm) : nm;
    if (ctx.scope) return { name: nm, code: ctx.v(nm), type: OWN_T[n.type] };
    return { name: nm, code: lang === "py" ? "s." + id + (FLAGGY[n.type] ? ".value" : "") : lang === "gd" ? "s." + id : id, type: OWN_T[n.type] };
  }

  function emitBare(n, ctx, out, ptype, en) {
    const lang = ctx.lang, p = n.p || {}, c = lang === "c", cs = lang === "cs", py = lang === "py", jv = lang === "java", gd = lang === "gd";
    const ind = py || gd, ret = py || jv || gd;
    const q = (s) => strq(s, lang);
    const call = (cfn, csfn, pyfn, args) => (c ? "goome_ui_" + cfn + "(" + ["u"].concat(args).join(", ") + ")" : cs ? "ui." + csfn + "(" + args.join(", ") + ")" : jv ? "ui." + camel(cfn || pyfn) + "(" + args.join(", ") + ")" : gd ? "ui." + (cfn || pyfn) + "(" + args.join(", ") + ")" : "ui." + pyfn + "(" + args.join(", ") + ")");
    const st = (s) => out.add(s + (ind ? "" : ";"));
    const nil = c ? "NULL" : cs || jv ? "null" : gd ? '""' : "None";
    const T_ = bool(true, lang), F_ = bool(false, lang);
    const NOT = ind ? "not " : "!";
    const CHANGED = py ? "ui.changed" : "ui.changed()";
    const nm = ctx.nm.get(n.id) || GM.ident(p.var || n.type);
    if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
      ctx.warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
      return;
    }
    const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
    if (leaf && +p.width > 0) st(call("width", "Width", "width", [num(p.width)]));
    if (n.abs && !isRoot(ptype)) {
      st(call("pos", "Pos", "pos", [num(n.abs.x), num(n.abs.y)]));
      if (+n.abs.w > 0 || +n.abs.h > 0) st(call("size", "Size", "size", [num(+n.abs.w > 0 ? n.abs.w : 0), num(+n.abs.h > 0 ? n.abs.h : 0)]));
    }
    const on = n.on || {};
    const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
    const where = (e) => (p.label || n.type) + " " + e;
    const printLine = (txt) => (c ? "puts(" + q(txt) + ");" : cs ? "Console.WriteLine(" + q(txt) + ");" : jv ? "System.out.println(" + q(txt) + ");" : "print(" + q(txt) + ")");
    const ifActs = (cond, fill) => {
      out.open(ind ? "if " + cond + ":" : "if (" + cond + ")");
      fill();
      out.close();
    };
    const andEn = (cond) => (en ? cond + (ind ? " and " : " && ") + en : cond);
    const bound = (types) => {
      if (!p.bind) return null;
      const r = ctx.vars.get(p.bind);
      if (!r) {
        ctx.warn(n.id, "the bound var is gone, using its own var");
        return null;
      }
      if (ctx.scope) {
        ctx.warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
        return null;
      }
      if (types && !types.includes(r.type)) {
        ctx.warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
        return null;
      }
      return r;
    };
    const own = (kind, val, extra) => {
      ctx.decl(kind, nm, val, extra);
      return { name: nm, code: ctx.v(nm) + (py && kind === "flag" && !ctx.scope ? ".value" : ""), obj: ctx.v(nm), addr: ctx.addr(nm), type: kind };
    };
    const addrOf = (r) => (c ? "&" + r.code : cs ? "ref " + r.code : r.code);
    const holder = (type, suffix, init) => {
      const id = camel(ctx.uniq(nm + "_" + suffix));
      ctx.top.push("static final " + type + " " + id + " = new " + type + "(" + init + ");");
      return id;
    };
    const synced = (r, init, fill) => {
      const f = holder("Flag", "flag", init);
      st(f + ".set(" + r.code + ")");
      fill(f);
      return f;
    };
    const changeEvents = () => has("change") || has("on") || has("off");
    const fireChange = (ref) => {
      if (has("change")) emitActions(ctx, out, on.change, where("change"));
      if ((has("on") || has("off")) && ref) {
        if (has("on")) ifActs(ref.code, () => emitActions(ctx, out, on.on, where("on")));
        if (has("off")) ifActs(NOT + ref.code, () => emitActions(ctx, out, on.off, where("off")));
      }
      if (!has("change") && !has("on") && !has("off") && ind) out.add("pass");
    };
    const afterChange = (ref, cond) => {
      if (changeEvents()) ifActs(andEn(cond || CHANGED), () => fireChange(ref));
    };
    const valueWidget = (stmt, changedExpr, ref) => {
      if (ret) {
        out.add(stmt + (jv ? ";" : ""));
        afterChange(ref);
      } else if (changeEvents()) ifActs(andEn(changedExpr), () => fireChange(ref));
      else st(changedExpr);
    };
    const hover = () => {
      if (!has("hover")) return;
      const hv = ctx.uniq(nm + "_hot");
      if (c) ctx.top.push("static int " + hv + ";");
      else if (cs) ctx.top.push("bool " + camel(hv) + " = false;");
      else if (jv) ctx.top.push("static boolean " + camel(hv) + ";");
      else if (gd) ctx.top.push("var " + hv + ": bool = false");
      else ctx.top.push(hv + " = False");
      const hvc = c ? hv : cam(lang) ? camel(hv) : "s." + hv;
      const h = "h" + ++ctx.k;
      out.add(c ? "int " + h + " = goome_ui_hovered(u);" : cs ? "bool " + h + " = ui.Hovered;" : py ? h + " = ui.hovered" : ctx.local("bool", h, "ui.hovered()"));
      ifActs(h + (ind ? " and not " : " && !") + hvc, () => emitActions(ctx, out, on.hover, where("hover")));
      out.add(hvc + " = " + h + (ind ? "" : ";"));
    };
    const tooltip = () => {
      if (leaf && p.tooltip) st(call("tooltip", "Tooltip", "tooltip", [q(p.tooltip)]));
    };
    const label = (txt) => textCode(ctx, txt == null ? "" : txt, { id: n.id }).code;
    const elseIf = (cond, first) => {
      if (ind) out.open((first ? "if " : "elif ") + cond + ":");
      else if (first) out.open("if (" + cond + ")");
      else {
        out.l[out.l.length - 1] = out.l[out.l.length - 1] + " else if (" + cond + ") {";
        out.d++;
        out.marks.push(out.l.length);
      }
    };
    const loop = (len, body) => {
      if (gd) out.open("for i in range(" + len + "):");
      else out.open("for (int i = 0; i < " + len + "; i++)");
      body();
      out.close();
    };

    switch (n.type) {
      case "window": {
        if (ctx.scope) return ctx.warn(n.id, "windows cant go inside a custom element");
        const fl = flags(WFLAGS, p, lang);
        const b = bound(["bool"]);
        const needOpen = !!p.close || ctx.targets.has(n.id) || !!b;
        const title = label(p.label);
        if (c) {
          ctx.top.push("static double " + nm + "_x = " + num(p.x) + ", " + nm + "_y = " + num(p.y) + ", " + nm + "_w = " + num(p.w) + ", " + nm + "_h = " + num(p.h) + ";");
          if (needOpen && !b) ctx.top.push("static int " + nm + "_open = 1;");
          out.open("if (goome_ui_window(u, " + title + ", &" + nm + "_x, &" + nm + "_y, &" + nm + "_w, &" + nm + "_h, " + fl + ", " + (needOpen ? "&" + (b ? b.code : nm + "_open") : "NULL") + "))");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("goome_ui_window_end(u)");
        } else if (cs) {
          const id = camel(nm);
          ctx.top.push("double " + id + "X = " + num(p.x) + ", " + id + "Y = " + num(p.y) + ", " + id + "W = " + num(p.w) + ", " + id + "H = " + num(p.h) + ";");
          if (needOpen && !b) ctx.top.push("bool " + id + "Open = true;");
          out.open("if (ui.Window(" + title + ", ref " + id + "X, ref " + id + "Y, ref " + id + "W, ref " + id + "H, " + fl + (needOpen ? ", ref " + (b ? b.code : id + "Open") : "") + "))");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("ui.WindowEnd()");
        } else if (jv) {
          const id = camel(nm);
          ctx.top.push("static final Window " + id + " = new Window(" + [p.x, p.y, p.w, p.h].map(num).join(", ") + ");");
          if (b) st(id + ".open(" + b.code + ")");
          out.open("if (ui.window(" + title + ", " + id + ", " + fl + "))");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("ui.windowEnd()");
          if (b) st(b.code + " = " + id + ".open()");
        } else if (gd) {
          const key = needOpen ? winTitle(ctx, n) : title;
          const wrap = needOpen && !p.close;
          if (b) st("ui.set_window_open(" + key + ", " + b.code + ")");
          if (wrap) out.open("if ui.is_window_open(" + key + "):");
          out.open("if ui.window(" + title + ", Rect2(" + [p.x, p.y, p.w, p.h].map(num).join(", ") + "), " + fl + "):");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("ui.window_end()");
          if (wrap) out.close();
          if (b) st(b.code + " = ui.is_window_open(" + key + ")");
        } else {
          ctx.top.push(nm + " = goome.Window(" + [p.x, p.y, p.w, p.h].map(num).join(", ") + ")");
          if (b) out.add("s." + nm + ".open = " + b.code);
          out.open("with ui.window(" + title + ", s." + nm + ", " + fl + ") as shown:");
          out.open("if shown:");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          out.close();
          if (b) out.add(b.code + " = s." + nm + ".open");
        }
        return;
      }
      case "row": {
        const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
        if (k >= 2) st(call("row", "Row", "row", [String(k)]));
        emitList(n.kids[0], ctx, out, "row");
        return;
      }
      case "same_line": return st(call("same_line", "SameLine", "same_line", []));
      case "space": return st(call("space", "Space", "space", [num(p.px)]));
      case "separator": return st(call("separator", "Separator", "separator", []));
      case "scroll": {
        const args = [q(nm), num(p.h)];
        if (py) {
          out.open("with ui.scroll_begin(" + args.join(", ") + "):");
          emitList(n.kids[0], ctx, out, "scroll");
          out.close();
        } else {
          st(call("scroll_begin", "ScrollBegin", "", args));
          emitList(n.kids[0], ctx, out, "scroll");
          st(call("scroll_end", "ScrollEnd", "", []));
        }
        return;
      }
      case "split": {
        if (py) {
          ctx.top.push(nm + " = goome.Split(" + num(p.frac) + ", " + bool(p.vertical, "py") + ")");
          out.open("with ui.split(" + q(nm) + ", s." + nm + ") as panes:");
          emitSlot(n, 0, ctx, out, "split");
          out.add("panes.next()");
          emitSlot(n, 1, ctx, out, "split");
          out.close();
        } else {
          if (jv) {
            const id = holder("Split", "split", num(+p.frac || 0.3) + ", " + bool(p.vertical, lang));
            st("ui.splitBegin(" + q(nm) + ", " + id + ")");
          } else if (gd) st("ui.split_begin(" + q(nm) + ", " + bool(p.vertical, lang) + ", " + num(+p.frac || 0.3) + ")");
          else {
            const fr = nm + "_frac";
            ctx.decl("double", fr, +p.frac || 0.3);
            st(call("split_begin", "SplitBegin", "", [q(nm), c ? (p.vertical ? "1" : "0") : bool(p.vertical, "cs"), ctx.addr(fr)]));
          }
          emitSlot(n, 0, ctx, out, "split");
          st(call("split_next", "SplitNext", "", []));
          emitSlot(n, 1, ctx, out, "split");
          st(call("split_end", "SplitEnd", "", []));
        }
        return;
      }
      case "tabs": {
        const li = listInfo(ctx, n);
        const items = li ? li.items : GM.lines(p.items);
        if (!items.length) items.push("Tab");
        const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
        const arr = li ? li.arr : ctx.constArr(nm + "_names", items);
        const len = li ? li.len : String(items.length);
        const tcall = c ? "goome_ui_tabs(u, " + q(nm) + ", " + arr + ", " + len + ", &" + r.code + ")" : cs ? "ui.Tabs(" + q(nm) + ", " + arr + ", ref " + r.code + ")" : null;
        const rs = py ? r.code + " = ui.tabs(" + q(nm) + ", " + arr + ", " + r.code + ")" : jv ? r.code + " = ui.tabs(" + q(nm) + ", " + r.code + ", " + arr + ")" : gd ? r.code + " = ui.tabs(" + q(nm) + ", " + arr + ", " + r.code + ")" : tcall;
        valueWidget(rs, tcall, r);
        let first = true;
        const k = Math.max(items.length, n.kids.length);
        for (let i = 0; i < k; i++) {
          const kids = n.kids[i] || [];
          if (!kids.length) continue;
          elseIf(r.code + " == " + i, first);
          emitSlot(n, i, ctx, out, "tabs");
          out.close();
          first = false;
        }
        return;
      }
      case "collapsing": {
        const r = bound(["bool"]) || own("bool", !!p.open);
        const ev = has("change");
        const w = ev ? "was" + ++ctx.k : null;
        if (ev) out.add(c ? "int " + w + " = " + r.code + ";" : ctx.local("bool", w, r.code));
        if (jv) {
          const sh = "open" + ++ctx.k;
          synced(r, bool(!!p.open, lang), (f) => {
            out.add(ctx.local("bool", sh, "ui.collapsing(" + label(p.label) + ", " + f + ")"));
            st(r.code + " = " + f + ".get()");
          });
          if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if (" + sh + ")");
        } else if (ind) {
          if (gd && p.bind) ctx.warn(n.id, "in godot the var only follows the section, setting it from code wont open or close it");
          out.add(r.code + " = ui.collapsing(" + label(p.label) + ", " + r.code + ")");
          if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if " + r.code + ":");
        } else {
          if (ev) {
            st(call("collapsing", "Collapsing", "", [label(p.label), addrOf(r)]));
            ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
            out.open("if (" + r.code + ")");
          } else out.open("if (" + call("collapsing", "Collapsing", "", [label(p.label), addrOf(r)]) + ")");
        }
        emitList(n.kids[0], ctx, out, "collapsing");
        out.close();
        return;
      }
      case "tree": {
        const r = bound(["bool"]) || own(py ? "flag" : "bool", !!p.open);
        const obj = py ? (r.obj || r.code.replace(/\.value$/, "")) : null;
        const ev = has("change");
        const w = ev ? "was" + ++ctx.k : null;
        if (ev) out.add(c ? "int " + w + " = " + r.code + ";" : ctx.local("bool", w, r.code));
        if (py) {
          out.open("with ui.tree(" + label(p.label) + ", " + obj + ") as shown:");
          if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if shown:");
          emitList(n.kids[0], ctx, out, "tree");
          out.close();
          out.close();
        } else if (gd) {
          if (p.bind) ctx.warn(n.id, "in godot the var only follows the tree node, setting it from code wont open or close it");
          out.add(r.code + " = ui.tree(" + label(p.label) + ", " + r.code + ")");
          if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if " + r.code + ":");
          emitList(n.kids[0], ctx, out, "tree");
          st("ui.tree_end()");
          out.close();
        } else {
          const sh = "open" + (jv ? ++ctx.k : ctx.k);
          if (jv) {
            synced(r, bool(!!p.open, lang), (f) => {
              out.add(ctx.local("bool", sh, "ui.tree(" + label(p.label) + ", " + f + ")"));
              st(r.code + " = " + f + ".get()");
            });
            if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
            out.open("if (" + sh + ")");
          } else {
            const tc = call("tree", "Tree", "", [label(p.label), addrOf(r)]);
            if (ev) {
              out.add(c ? "int " + sh + " = " + tc + ";" : "bool " + sh + " = " + tc + ";");
              ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
              out.open("if (" + sh + ")");
            } else out.open("if (" + tc + ")");
          }
          emitList(n.kids[0], ctx, out, "tree");
          st(call("tree_end", "TreeEnd", "", []));
          out.close();
        }
        return;
      }
      case "modal": {
        const b = bound(["bool"]);
        const r = b || own(py ? "flag" : "bool", false);
        const obj = py ? (b ? b.obj : r.obj) : null;
        if (py && b && !b.flag) ctx.warn(n.id, "python needs a goome.Flag for the modal, bind a var that only flags use");
        if (p.button) ifActs(call("button", "Button", "button", [label(p.button)]), () => out.add(r.code + " = " + T_ + (ind ? "" : ";")));
        if (py) {
          out.open("with ui.modal(" + label(p.label) + ", " + obj + ") as shown:");
          out.open("if shown:");
          emitList(n.kids[0], ctx, out, "modal");
          out.close();
          out.close();
        } else if (gd) {
          const t = label(p.label), m = "shown" + ++ctx.k;
          ifActs(r.code + " and not ui.is_modal_open(" + t + ")", () => st("ui.modal_open(" + t + ")"));
          out.add(ctx.local("bool", m, "ui.modal_begin(" + t + ")"));
          st(r.code + " = ui.is_modal_open(" + t + ")");
          out.open("if " + m + ":");
          emitList(n.kids[0], ctx, out, "modal");
          st("ui.modal_end()");
          out.close();
        } else if (jv) {
          const m = "shown" + ++ctx.k;
          synced(r, F_, (f) => {
            out.add(ctx.local("bool", m, "ui.modalBegin(" + label(p.label) + ", " + f + ")"));
            st(r.code + " = " + f + ".get()");
          });
          out.open("if (" + m + ")");
          emitList(n.kids[0], ctx, out, "modal");
          st("ui.modalEnd()");
          out.close();
        } else {
          out.open("if (" + call("modal_begin", "ModalBegin", "", [label(p.label), addrOf(r)]) + ")");
          emitList(n.kids[0], ctx, out, "modal");
          st(call("modal_end", "ModalEnd", "", []));
          out.close();
        }
        return;
      }
      case "popup": {
        const id = q(p.label || "popup");
        const b = bound(["bool"]);
        if (b) ifActs(b.code, () => {
          st(call("popup_open", "PopupOpen", "popup_open", [id]));
          out.add(b.code + " = " + F_ + (ind ? "" : ";"));
        });
        if (py) {
          out.open("with ui.popup(" + id + ") as shown:");
          out.open("if shown:");
          emitList(n.kids[0], ctx, out, "popup");
          out.close();
          out.close();
        } else {
          out.open(ind ? "if " + call("popup_begin", "", "", [id]) + ":" : "if (" + call("popup_begin", "PopupBegin", "", [id]) + ")");
          emitList(n.kids[0], ctx, out, "popup");
          st(call("popup_end", "PopupEnd", "", []));
          out.close();
        }
        return;
      }
      case "menubar":
      case "menu": {
        const mb = n.type === "menubar";
        if (py) {
          out.open("with " + (mb ? "ui.menubar()" : "ui.menu(" + label(p.label) + ")") + " as shown:");
          out.open("if shown:");
          emitList(n.kids[0], ctx, out, n.type);
          out.close();
          out.close();
        } else {
          const b = mb ? call("menubar_begin", "MenuBarBegin", "", []) : call("menu_begin", "MenuBegin", "", [label(p.label)]);
          out.open(ind ? "if " + b + ":" : "if (" + b + ")");
          emitList(n.kids[0], ctx, out, n.type);
          st(mb ? call("menubar_end", "MenuBarEnd", "", []) : call("menu_end", "MenuEnd", "", []));
          out.close();
        }
        return;
      }
      case "menu_item": {
        const sc = p.shortcut ? q(p.shortcut) : nil;
        const b = p.check || p.bind ? bound(["bool"]) : null;
        if (p.check || b) {
          const r = b || own(py ? "flag" : "bool", !!p.on);
          const obj = py ? (b ? b.obj : r.obj) : null;
          if (py && b && !b.flag) ctx.warn(n.id, "python needs a goome.Flag for a checked menu item");
          if (jv) {
            const k = "picked" + ++ctx.k;
            synced(r, bool(!!p.on, lang), (f) => {
              out.add(ctx.local("bool", k, "ui.menuItem(" + label(p.label) + ", " + sc + ", " + f + ")"));
              st(r.code + " = " + f + ".get()");
            });
            if (has("click")) ifActs(andEn(k), () => emitActions(ctx, out, on.click, where("click")));
          } else if (gd) {
            out.add(r.code + " = ui.menu_check(" + label(p.label) + ", " + r.code + ", " + sc + ")");
            if (has("click")) ifActs(andEn(CHANGED), () => emitActions(ctx, out, on.click, where("click")));
          } else {
            const cl = c ? "goome_ui_menu_item(u, " + label(p.label) + ", " + sc + ", &" + r.code + ")" : cs ? "ui.MenuItem(" + label(p.label) + ", " + sc + ", ref " + r.code + ")" : "ui.menu_item(" + label(p.label) + ", " + sc + ", " + obj + ")";
            if (has("click")) ifActs(andEn(cl), () => emitActions(ctx, out, on.click, where("click")));
            else st(cl);
          }
        } else {
          const args = [label(p.label)].concat(c ? [sc, "NULL"] : p.shortcut ? [sc] : []);
          ifActs(andEn(call("menu_item", "MenuItem", "menu_item", args)), () => {
            if (has("click")) emitActions(ctx, out, on.click, where("click"));
            else out.add(printLine(p.label + " clicked"));
          });
        }
        return;
      }
      case "menu_sep": return st(call("menu_separator", "MenuSeparator", "menu_separator", []));
      case "label": {
        if (c) {
          const t = textCode(ctx, p.label, { printf: true, id: n.id });
          st("goome_ui_label(u, " + (t.printf ? t.code : strq(String(p.label).replace(/%/g, "%%"), "c")) + ")");
        } else st(call("", "Label", "label", [label(p.label)]));
        hover();
        break;
      }
      case "heading": st(call("heading", "Heading", "heading", [label(p.label)])); hover(); break;
      case "wrapped": st(call("wrapped", "Wrapped", "wrapped", [label(p.label)])); break;
      case "button": {
        ifActs(andEn(call("button", "Button", "button", [label(p.label)])), () => {
          if (has("click")) return emitActions(ctx, out, on.click, where("click"));
          if (p.action === "toast") st(call("toast", "Toast", "toast", [label(p.toast), String(p.ms | 0)]));
          else if (p.action === "close") st(call("popup_close", "PopupClose", "popup_close", []));
          else out.add(printLine(p.label + " clicked"));
        });
        hover();
        break;
      }
      case "checkbox":
      case "toggle": {
        const r = bound(["bool"]) || own("bool", !!p.on);
        const f = n.type, F = f === "checkbox" ? "Checkbox" : "Toggle";
        const cl = c ? "goome_ui_" + f + "(u, " + label(p.label) + ", &" + r.code + ")" : cs ? "ui." + F + "(" + label(p.label) + ", ref " + r.code + ")" : null;
        valueWidget(ret ? r.code + " = ui." + f + "(" + label(p.label) + ", " + r.code + ")" : cl, cl, r);
        hover();
        break;
      }
      case "radio": {
        const li = listInfo(ctx, n);
        const items = li ? li.items : GM.lines(p.items);
        const r = bound(["int"]) || own("int", p.sel | 0);
        const ev = changeEvents();
        const ch = ev ? "ch" + ++ctx.k : null;
        if (ev) out.add(c ? "int " + ch + " = 0;" : py ? ch + " = False" : ctx.local("bool", ch, F_));
        const one = (lab, i) => {
          if (ret) {
            out.add(r.code + " = ui.radio(" + lab + ", " + r.code + ", " + i + ")" + (jv ? ";" : ""));
            if (ev) out.add(jv ? ch + " |= ui.changed();" : ch + " = " + ch + " or " + CHANGED);
          } else {
            const cl = call("radio", "Radio", "", [lab, addrOf(r), String(i)]);
            st(ev ? ch + " |= " + cl : cl);
          }
        };
        if (li) {
          if (py) out.open("for i, item in enumerate(" + li.arr + "):");
          else if (gd) out.open("for i in range(" + li.len + "):");
          else out.open("for (int i = 0; i < " + li.len + "; i++)");
          if (p.inline) ifActs(cs || jv ? "i > 0" : "i", () => st(call("same_line", "SameLine", "same_line", [])));
          one(py ? "item" : li.arr + "[i]", "i");
          out.close();
        } else
          items.forEach((it, i) => {
            if (i && p.inline) st(call("same_line", "SameLine", "same_line", []));
            one(q(it), i);
          });
        if (ev) ifActs(andEn(ch), () => fireChange(r));
        break;
      }
      case "slider": {
        const b = bound(["float", "int"]);
        const fmt = p.fmt ? q(p.fmt) : nil;
        if (b && b.type === "int") {
          const cl = c ? "goome_ui_slider_int(u, " + [label(p.label), "&" + b.code, Math.round(p.min), Math.round(p.max)].join(", ") + ")" : cs ? "ui.SliderInt(" + [label(p.label), "ref " + b.code, Math.round(p.min), Math.round(p.max)].join(", ") + ")" : null;
          valueWidget(ret ? b.code + " = " + call("slider_int", "", "slider_int", [label(p.label), b.code, Math.round(p.min), Math.round(p.max)]) : cl, cl, b);
        } else {
          const r = b || own("double", +p.value || 0);
          const fl = (v) => (Number.isInteger(+v) ? num(v) + ".0" : num(v));
          const cl = c || cs ? call("slider", "Slider", "", [label(p.label), addrOf(r), num(p.min), num(p.max), fmt]) : null;
          valueWidget(ret ? r.code + " = ui.slider(" + [label(p.label), r.code, fl(p.min), fl(p.max), fmt].join(", ") + ")" : cl, cl, r);
        }
        hover();
        break;
      }
      case "slider_int": {
        const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
        const args = [String(Math.round(p.min)), String(Math.round(p.max))];
        const cl = c || cs ? call("slider_int", "SliderInt", "", [label(p.label), addrOf(r)].concat(args)) : null;
        valueWidget(ret ? r.code + " = " + call("slider_int", "", "slider_int", [label(p.label), r.code].concat(args)) : cl, cl, r);
        hover();
        break;
      }
      case "input": {
        const cap = Math.max(2, p.cap | 0 || 64);
        const b = bound(["string"]);
        if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
        const r = b || own("str", p.text || "", cap);
        const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
        const capS = String(b ? b.cap : cap);
        if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint) {
          const cl = c ? "goome_ui_input(u, " + label(p.label) + ", " + r.code + ", sizeof(" + r.code + "))" : cs ? "ui.Input(" + label(p.label) + ", ref " + r.code + ", " + capS + ")" : null;
          valueWidget(ret ? r.code + " = ui.input(" + label(p.label) + ", " + r.code + ", " + capS + ")" : cl, cl, r);
          hover();
          break;
        }
        const fl = flags(IFLAGS, fp, lang), hint = p.hint ? q(p.hint) : nil;
        const cl = c ? "goome_ui_input_ex(u, " + label(p.label) + ", " + r.code + ", sizeof(" + r.code + "), " + fl + ", " + hint + ")" : cs ? "ui.InputEx(" + label(p.label) + ", ref " + r.code + ", " + fl + ", " + hint + ", " + capS + ")" : null;
        const pyS = py ? r.code + " = ui.input_ex(" + label(p.label) + ", " + r.code + ", " + fl + ", " + hint + ", " + capS + ")"
          : r.code + " = " + call("input_ex", "", "", [label(p.label), r.code, capS, fl, hint]);
        if (ret) {
          out.add(pyS + (jv ? ";" : ""));
          afterChange(r, fp.enter && !py ? CHANGED + (ind ? " and not " : " && !") + "ui.entered()" : null);
          if (has("enter")) ifActs(andEn(py ? "ui.entered" : "ui.entered()"), () => emitActions(ctx, out, on.enter, where("enter")));
          hover();
          break;
        }
        if (!has("enter")) {
          valueWidget(fp.enter ? "(" + cl + ") == 1" : cl, fp.enter ? "(" + cl + ") == 1" : cl, r);
          hover();
          break;
        }
        const k = "k" + ++ctx.k;
        out.add("int " + k + " = " + cl + ";");
        if (changeEvents()) ifActs(andEn(k + " == 1"), () => fireChange(r));
        ifActs(andEn(k + " == 2"), () => emitActions(ctx, out, on.enter, where("enter")));
        hover();
        break;
      }
      case "text_edit": {
        const cap = Math.max(2, p.cap | 0 || 4096);
        const b = bound(["string"]);
        if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
        const r = b || own("str", p.text || "", cap);
        const fl2 = flags(EFLAGS, p, lang);
        const capN = b ? b.cap : cap;
        if (jv) {
          const buf = holder("TextBuffer", "buf", capN);
          out.add("if (!" + buf + ".text().equals(" + r.code + ")) " + buf + ".text(" + r.code + ");");
          out.add("if (ui.textEdit(" + q(nm) + ", " + buf + ", " + num(p.h) + ", " + fl2 + ")) " + r.code + " = " + buf + ".text();");
          afterChange(r);
          break;
        }
        const cl = c ? "goome_ui_text_edit(u, " + q(nm) + ", " + r.code + ", sizeof(" + r.code + "), " + num(p.h) + ", " + fl2 + ")" : cs ? "ui.TextEdit(" + q(nm) + ", ref " + r.code + ", " + num(p.h) + ", " + fl2 + ", " + capN + ")" : null;
        valueWidget(py ? r.code + " = ui.text_edit(" + q(nm) + ", " + r.code + ", " + num(p.h) + ", " + fl2 + ", cap=" + capN + ")" : gd ? r.code + " = ui.text_edit(" + q(nm) + ", " + r.code + ", " + num(p.h) + ", " + fl2 + ")" : cl, cl, r);
        break;
      }
      case "combo": {
        const li = listInfo(ctx, n);
        const items = li ? li.items : GM.lines(p.items);
        const r = bound(["int"]) || own("int", p.sel | 0);
        const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : [""]);
        const len = li ? li.len : String(Math.max(1, items.length));
        const cl = c ? "goome_ui_combo(u, " + label(p.label) + ", &" + r.code + ", " + arr + ", " + len + ")" : cs ? "ui.Combo(" + label(p.label) + ", ref " + r.code + ", " + arr + ")" : null;
        valueWidget(ret ? r.code + " = ui.combo(" + label(p.label) + ", " + r.code + ", " + arr + ")" : cl, cl, r);
        hover();
        break;
      }
      case "selectable": {
        const li = listInfo(ctx, n);
        const items = li ? li.items : GM.lines(p.items);
        const r = bound(["int"]) || own("int", p.sel | 0);
        const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : ["Item"]);
        const len = li ? li.len : c ? String(Math.max(1, items.length)) : jv ? arr + ".length" : gd ? arr + ".size()" : arr + ".Length";
        const v = r.code;
        const ev = changeEvents();
        const pick = () => {
          out.add(v + " = i" + (ind ? "" : ";"));
          if (ev && en) ifActs(en, () => fireChange(r));
          else if (ev) fireChange(r);
        };
        if (py) {
          out.open("for i, item in enumerate(" + arr + "):");
          ifActs("ui.selectable(item, " + v + " == i)", pick);
          out.close();
        } else loop(len, () => ifActs(call("selectable", "Selectable", "", [arr + "[i]", v + " == i"]), pick));
        break;
      }
      case "color": {
        const r = bound(["color"]) || own("color", p.color >>> 0);
        const cl = c || cs ? call("color", "Color", "", [label(p.label), addrOf(r)]) : null;
        valueWidget(ret ? r.code + " = ui.color(" + label(p.label) + ", " + r.code + ")" : cl, cl, r);
        hover();
        break;
      }
      case "progress": {
        const b = bound(["float", "int"]);
        let val = num(p.value);
        if (b) {
          const lo = +b.v.min, hi = +b.v.max;
          val = hi > lo && !(lo === 0 && hi === 1) ? (lo ? par(minus(b.code, num(lo))) : b.code) + " / " + num(hi - lo) : b.code;
          if (b.type === "int" && !py) {
            const top = hi > lo ? par(lo ? minus(b.code, num(lo)) : b.code) : b.code;
            val = (gd ? "float(" + top.replace(/^\((.*)\)$/, "$1") + ")" : "(double)" + top) + (hi > lo ? " / " + num(hi - lo) : "");
          }
        }
        st(call("progress", "Progress", "progress", [val, p.label ? label(p.label) : nil]));
        hover();
        break;
      }
      case "table":
      case "plot_lines":
      case "plot_bars":
      case "image": {
        emitData(n, ctx, out, nm);
        if (n.type === "image") hover();
        break;
      }
      case "el": {
        emitInstance(n, ctx, out, ptype);
        return;
      }
      default:
        ctx.warn(n.id, "dont know how to export " + n.type);
        return;
    }
    tooltip();
  }

  function emitData(n, ctx, out, nm) {
    const lang = ctx.lang, p = n.p || {}, c = lang === "c", cs = lang === "cs", py = lang === "py", jv = lang === "java", gd = lang === "gd";
    const q = (s) => strq(s, lang);
    const st = (s) => out.add(s + (py || gd ? "" : ";"));
    switch (n.type) {
      case "table": {
        const cols = GM.lines(p.cols).map((x) => {
          const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
          return [m[1].trim(), m[2] ? +m[2] : 0];
        });
        if (!cols.length) cols.push(["Column", 0]);
        const rows = GM.lines(p.rows).map((r) => {
          const cells = r.split(",").map((x) => x.trim());
          while (cells.length < cols.length) cells.push("");
          return cells.slice(0, cols.length);
        });
        const fl3 = flags(TFLAGS, p, lang);
        const k = cols.length;
        if (py) {
          const id = nm.toUpperCase() + "_ROWS";
          ctx.consts.push(id + " = [" + rows.map((r) => "[" + r.map((x) => strq(x, "py")).join(", ") + "]").join(", ") + "]");
          out.open("with ui.table(" + [q(nm), k, num(p.h), fl3].join(", ") + ") as t:");
          out.open("if t:");
          cols.forEach((cl) => out.add("t.column(" + q(cl[0]) + ", " + num(cl[1]) + ")"));
          out.open("for row in " + id + ":");
          out.add("t.row()");
          out.open("for j, cell in enumerate(row):");
          out.add("if j:");
          out.add("    t.next()");
          out.add("ui.label(cell)");
          out.close();
          out.close();
          out.close();
          out.close();
        } else if (gd) {
          const id = nm.toUpperCase() + "_ROWS";
          ctx.consts.push("const " + id + " = [" + rows.map((r) => "[" + r.map((x) => strq(x, "gd")).join(", ") + "]").join(", ") + "]");
          out.open("if ui.table_begin(" + [q(nm), k, num(p.h), fl3].join(", ") + "):");
          cols.forEach((cl) => out.add("ui.table_column(" + q(cl[0]) + ", " + num(cl[1]) + ")"));
          out.open("for row in " + id + ":");
          out.add("ui.table_row()");
          out.open("for j in range(row.size()):");
          out.add("if j > 0:");
          out.add("    ui.table_next()");
          out.add("ui.label(row[j])");
          out.close();
          out.close();
          out.close();
          out.add("ui.table_end()");
        } else if (c) {
          const id = nm + "_cells";
          ctx.consts.push("static const char *const " + id + "[] = {" + (rows.length ? [].concat(...rows).map((x) => strq(x, "c")).join(", ") : '""') + "};");
          out.open("if (goome_ui_table_begin(u, " + [q(nm), k, num(p.h), fl3].join(", ") + "))");
          cols.forEach((cl) => out.add("goome_ui_table_column(u, " + q(cl[0]) + ", " + num(cl[1]) + ");"));
          if (rows.length) {
            out.open("for (int i = 0; i < " + rows.length + "; i++)");
            out.add("goome_ui_table_row(u);");
            out.open("for (int j = 0; j < " + k + "; j++)");
            out.add("if (j) goome_ui_table_next(u);");
            out.add('goome_ui_label(u, "%s", ' + id + "[i * " + k + " + j]);");
            out.close();
            out.close();
          }
          out.close();
          out.add("goome_ui_table_end(u);");
        } else {
          const id = camel(nm) + "Rows";
          if (jv) ctx.consts.push("static final String[][] " + id + " = {" + rows.map((r) => "{" + r.map((x) => strq(x, "cs")).join(", ") + "}").join(", ") + "};");
          else ctx.consts.push("string[][] " + id + " = { " + rows.map((r) => "new[] { " + r.map((x) => strq(x, "cs")).join(", ") + " }").join(", ") + " };");
          const U = (f) => "ui." + (jv ? f.replace(/^./, (x) => x.toLowerCase()) : f);
          out.open("if (" + U("TableBegin") + "(" + [q(nm), k, num(p.h), fl3].join(", ") + "))");
          cols.forEach((cl) => out.add(U("TableColumn") + "(" + q(cl[0]) + ", " + num(cl[1]) + ");"));
          out.open(jv ? "for (String[] row : " + id + ")" : "foreach (var row in " + id + ")");
          out.add(U("TableRow") + "();");
          out.open("for (int j = 0; j < row." + (jv ? "length" : "Length") + "; j++)");
          out.add("if (j > 0) " + U("TableNext") + "();");
          out.add(U("Label") + "(row[j]);");
          out.close();
          out.close();
          out.close();
          out.add(U("TableEnd") + "();");
        }
        break;
      }
      case "plot_lines":
      case "plot_bars": {
        const vals = floats(p.values);
        ctx.decl("floats", nm, vals);
        const f = n.type;
        if (c) st("goome_ui_" + f + "(u, " + [q(p.label), ctx.v(nm), Math.max(1, vals.length), num(p.min), num(p.max), num(p.h)].join(", ") + ")");
        else if (cs) st("ui." + (f === "plot_lines" ? "PlotLines" : "PlotBars") + "(" + [q(p.label), ctx.v(nm), num(p.min), num(p.max), num(p.h)].join(", ") + ")");
        else st("ui." + (jv ? camel(f) : f) + "(" + [q(p.label), ctx.v(nm), num(p.min), num(p.max), num(p.h)].join(", ") + ")");
        break;
      }
      case "image": {
        if (gd) {
          ctx.warn(n.id, "godot-goome has no image widget, a grey box takes its place");
          const it = "pic" + ++ctx.k;
          out.add(ctx.local("var", it, "ui.custom(" + q(nm) + ", " + num(p.w) + ", " + num(p.h) + ", GoomeUI.ITEM_NO_HIT)"));
          out.add("ui.draw_rect(" + it + ".rect, " + hex(0xFF3A3F48, "gd") + ", " + num(p.radius) + ")");
          break;
        }
        ctx.need.placeholder = true;
        if (c) st("goome_ui_image(u, &placeholder, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
        else if (cs) st("ui.Image(placeholder, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
        else if (jv) st("ui.image(placeholder, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
        else out.add("ui.image(PLACEHOLDER, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
        break;
      }
    }
  }

  function elInfo(ctx, def) {
    let e = ctx.used.get(def.id);
    if (!e) {
      e = { def };
      ctx.used.set(def.id, e);
    }
    return e;
  }

  function litOf(type, v, lang) {
    if (type === "color") return hex(v, lang);
    if (type === "bool") return bool(!!v, lang);
    if (type === "text") return strq(v == null ? "" : v, lang);
    return num(v);
  }

  const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");

  function emitInstance(n, ctx, out, ptype) {
    const lang = ctx.lang, p = n.p, c = lang === "c", cs = lang === "cs", py = lang === "py", jv = lang === "java", gd = lang === "gd";
    const ind = py || gd;
    const def = ctx.defs.get(p.el);
    if (!def) return ctx.warn(n.id, "this custom element is gone from the library, skipped");
    if (ctx.scope) return ctx.warn(n.id, "custom elements cant go inside custom elements yet");
    const nm = ctx.nm.get(n.id) || GM.ident(p.var || def.name);
    elInfo(ctx, def);
    if (ptype === "overlay") out.add(c ? "goome_ui_pos(u, " + num(p.x) + ", " + num(p.y) + ");" : cs ? "ui.Pos(" + num(p.x) + ", " + num(p.y) + ");" : jv ? "ui.pos(" + num(p.x) + ", " + num(p.y) + ");" : "ui.pos(" + num(p.x) + ", " + num(p.y) + ")");
    const args = def.params.map((pr) => litOf(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def, lang));
    const w = +p.w || def.w, h = +p.h || def.h;
    let own = w !== def.w || h !== def.h;
    const sv = def.state.map((s) => {
      const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
      if (v !== s.def) own = true;
      return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
    });
    let init = c ? "NULL" : cs || jv ? "null" : "";
    if (own) {
      const vals = [w, h].concat(sv).map(num);
      if (c) {
        ctx.consts.push("static const double " + nm + "_init[] = {" + vals.join(", ") + "};");
        init = nm + "_init";
      } else if (cs) {
        ctx.consts.push("double[] " + camel(nm) + "Init = { " + vals.join(", ") + " };");
        init = camel(nm) + "Init";
      } else if (jv) {
        ctx.consts.push("static final double[] " + camel(nm) + "Init = {" + vals.join(", ") + "};");
        init = camel(nm) + "Init";
      } else if (gd) init = "[" + vals.join(", ") + "]";
      else init = "init=(" + vals.join(", ") + ")";
    }
    const fn = c ? def.name + "_el" : cs ? pascal(def.name) : jv ? camel(def.name) + "El" : def.name + "_el";
    const val = hasValue(def);
    const on = n.on || {};
    const evk = ["click", "change", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
    const info = ctx.used.get(def.id);
    if (evk.length) info.mask = true;
    const m = evk.length ? "m" + ++ctx.k : null;
    let callS;
    if (c) {
      const a = ["u", strq(nm, "c")].concat(args, [init]);
      if (val) {
        ctx.top.push("static double " + nm + "_value;");
        a.push("&" + nm + "_value");
      }
      callS = fn + "(" + a.join(", ") + ")";
      out.add((m ? "int " + m + " = " : "") + callS + ";");
    } else if (cs) {
      const a = ["ui", strq(nm, "cs")].concat(args, [own ? init : "null"]);
      if (val) {
        ctx.top.push("double " + camel(nm) + "Value = 0;");
        a.push("out " + camel(nm) + "Value");
      }
      callS = fn + "(" + a.join(", ") + ")";
      out.add((m ? "int " + m + " = " : "") + callS + ";");
    } else if (jv) {
      const a = ["ui", strq(nm, "cs")].concat(args, [own ? init : "null"]);
      if (val) {
        ctx.top.push("static final double[] " + camel(nm) + "Value = new double[1];");
        a.push(camel(nm) + "Value");
      }
      callS = fn + "(" + a.join(", ") + ")";
      out.add((m ? "int " + m + " = " : "") + callS + ";");
    } else if (gd) {
      const a = ["ui", strq(nm, "gd")].concat(args, [own ? init : "null"]);
      callS = fn + "(" + a.join(", ") + ")";
      if (val) {
        ctx.top.push("var " + nm + "_value: float = 0.0");
        const r = "got" + ++ctx.k;
        out.add("var " + r + ": Array = " + callS);
        if (m) out.add("var " + m + ": int = " + r + "[0]");
        out.add("s." + nm + "_value = " + r + "[1]");
      } else out.add((m ? "var " + m + ": int = " : "") + callS);
    } else {
      const a = ["ui", strq(nm, "py")].concat(args);
      if (own) a.push(init);
      callS = fn + "(" + a.join(", ") + ")";
      if (val) {
        ctx.top.push(nm + "_value = 0.0");
        out.add((m ? m : "_") + ", s." + nm + "_value = " + callS);
      } else out.add((m ? m + " = " : "") + callS);
    }
    if (m) {
      const bit = { change: 1, click: 2, dragend: 4 };
      for (const e of ["change", "click", "dragend"]) {
        if (!evk.includes(e)) continue;
        out.open(ind ? "if " + m + " & " + bit[e] + ":" : cs || jv ? "if ((" + m + " & " + bit[e] + ") != 0)" : "if (" + m + " & " + bit[e] + ")");
        emitActions(ctx, out, on[e], def.name + " " + e);
        out.close();
      }
      if (evk.includes("hover")) {
        const hv = ctx.uniq(nm + "_hot");
        if (c) ctx.top.push("static int " + hv + ";");
        else if (cs) ctx.top.push("bool " + camel(hv) + " = false;");
        else if (jv) ctx.top.push("static boolean " + camel(hv) + ";");
        else if (gd) ctx.top.push("var " + hv + ": bool = false");
        else ctx.top.push(hv + " = False");
        const hvc = c ? hv : cam(lang) ? camel(hv) : "s." + hv;
        const hb = py ? "bool(" + m + " & 8)" : gd ? "(" + m + " & 8) != 0" : "(" + m + " & 8) != 0";
        out.open(ind ? "if " + m + " & 8 and not " + hvc + ":" : cs || jv ? "if ((" + m + " & 8) != 0 && !" + hvc + ")" : "if ((" + m + " & 8) && !" + hvc + ")");
        emitActions(ctx, out, on.hover, def.name + " hover");
        out.close();
        out.add(hvc + " = " + hb + (ind ? "" : ";"));
      }
    }
  }

  function elementCode(ctx, info) {
    const lang = ctx.lang, def = info.def, c = lang === "c", cs = lang === "cs", py = lang === "py", jv = lang === "java", gd = lang === "gd";
    const ind = py || gd, brace = cs || jv;
    const warn = (msg, id) => ctx.warn(id || def.id, def.name + ": " + msg);
    const types = GM.elementIdents(def);
    const groups = GM.dragGroups(def);
    const rs = !!(def.resizable && def.resizable.on);
    const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
    const prNames = new Set(def.params.map((x) => x.name));
    for (const s of def.state) if (builtin.has(s.name)) warn("state " + s.name + " clashes with a built in name");
    for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) warn("param " + s.name + " clashes with another name");

    const scope = { slots: [], alias: {}, prefix: def.name };
    const wout = new Out(ind);
    {
      const local = new Map();
      const used = new Set(["s", "c", "o", "el", "box", "rs", "ox", "oy", "th", "u", "ui", "id", "sid", "sb", "init", "value", "changed", "hovered", "pressed", "dragging", "clicked", "released", "pressed_now", "nx", "ny"].concat([...prNames]));
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind !== "widget" || !pt.w) return;
        const b = GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type);
        let k = b, i = 2;
        while (used.has(k)) k = b + i++;
        used.add(k);
        local.set(pt.w.id, k);
      });
      const saveNm = ctx.nm;
      ctx.nm = local;
      ctx.scope = scope;
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind !== "widget" || !pt.w) return;
        const t = pt.w.type;
        if (GM.isContainer(t) || t === "window" || t === "el") warn("widget parts can only be simple widgets, skipped a " + t, pt.id);
        else if (t === "input" || t === "text_edit") warn("text boxes cant keep their text in goome_ui_store, skipped " + t, pt.id);
        else emitNode(pt.w, ctx, wout, "element");
      });
      ctx.scope = null;
      ctx.nm = saveNm;
    }

    const idx = {};
    let N = 0;
    const slot = (k) => (idx[k] = N++);
    ["init", "w", "h", "value", "hot"].forEach(slot);
    def.state.forEach((st) => slot("s:" + st.name));
    groups.forEach((g) => {
      const gv = GM.partVar(g);
      [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
    });
    if (rs) slot("rw"), slot("rh");
    scope.slots.forEach((w) => slot("w:" + w.name));
    const S = (k) => "s[" + idx[k] + "]";
    const idc = (name) => (cam(lang) ? camel(name) : name);
    const map = {
      id: (name) => {
        if (prNames.has(name)) return idc(name);
        if (name === "w" || name === "h" || name === "value") return S(name);
        if (name === "hovered" || name === "pressed" || name === "dragging") return name;
        const st = def.state.find((x) => x.name === name);
        if (st) return brace && st.type === "bool" ? "(" + S("s:" + name) + " != 0)" : S("s:" + name);
        if (idx[name] != null) return S(name);
        return name;
      },
      th: (f) => (c ? "th->" + f : cs ? "th." + THC[f] : jv ? "th." + camel(f) + "()" : gd ? thCode("gd", f, "ui") : "th." + f),
    };
    const ex = (src, want, where) => {
      if (src === "" || src == null) return want === "c" ? hex(0, lang) : "0";
      let r;
      if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 } };
      else r = GM.expr.check(src, types, want);
      if (!r.ok) {
        warn(where + ": " + r.err);
        return want === "c" ? hex(0, lang) : "0";
      }
      return GM.expr.code(r.ast, lang, map, types);
    };
    const exb = (src, where) => {
      const r = GM.expr.check(src, types, "b");
      if (!r.ok) {
        warn(where + ": " + r.err);
        return null;
      }
      let s = GM.expr.code(r.ast, lang, map, types);
      if ((brace || gd) && r.type !== "b") s = par(s) + " != 0";
      return s;
    };

    const blob = JSON.stringify(def.parts);
    const evs = (on) => (def.events || []).filter((e) => e.on === on);
    const reads = {
      hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
      pressed: /\bpressed\b/.test(blob),
      dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
      pressed_now: evs("press").length > 0,
      clicked: evs("click").length > 0,
      released: evs("release").length > 0,
    };
    const mask = !!info.mask;
    if (mask) reads.hovered = reads.clicked = reads.dragend = true;
    const fo = reads.clicked || reads.pressed_now;
    const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;
    const CHG = c ? "changed = 1" : py ? "changed = True" : "changed = true";
    const YES = c ? "1" : py ? "True" : "true";

    const T = { num: "double", color: c ? "uint32_t" : jv ? "int" : "uint", bool: c ? "int" : jv ? "boolean" : "bool", text: c ? "const char *" : jv ? "String" : "string" };
    const pargs = def.params.map((pr) => (ind ? pr.name + (gd ? " = " : "=") + litOf(pr.type, pr.def, lang) : T[pr.type] + (c && pr.type === "text" ? "" : " ") + idc(pr.name)));
    const val = hasValue(def);
    const o = new Out(ind);
    const sem = ind ? "" : ";";
    const A = (s) => o.add(s);
    const St = (s) => o.add(s + sem);
    const open = (h) => {
      if (ind) A(h + ":");
      else if (cs) A(h), A("{");
      else A(h + " {");
      o.d++;
    };
    const close = () => {
      o.d--;
      if (!ind) A("}");
    };
    const iff = (cond) => open(ind ? "if " + cond : "if (" + cond + ")");
    const two = (a, b) => {
      if (ind) A(a), A(b);
      else St(a + (c ? ", " : "; ") + b);
    };
    const dbl = (n, e) => St((c || brace ? "double " : gd ? "var " : "") + n + " = " + e);
    const fn = c ? def.name + "_el" : cs ? pascal(def.name) : jv ? camel(def.name) + "El" : def.name + "_el";
    if (c) A("static int " + fn + "(" + ["goome_ui *u", "const char *id"].concat(pargs, ["const double *init"], val ? ["double *value"] : []).join(", ") + ")");
    else if (cs) A("int " + fn + "(" + ["Ui ui", "string id"].concat(pargs, ["double[]? init"], val ? ["out double value"] : []).join(", ") + ")");
    else if (jv) A("static int " + fn + "(" + ["Ui ui", "String id"].concat(pargs, ["double[] init"], val ? ["double[] value"] : []).join(", ") + ") {");
    else if (gd) A("func " + fn + "(" + ["ui: GoomeUI", "sid: String"].concat(pargs, ["init = null"]).join(", ") + ")" + (val ? " -> Array" : " -> int") + ":");
    else A("def " + fn + "(" + ["ui", "sid"].concat(pargs, ["init=None"]).join(", ") + "):");
    if (c || cs) A("{");
    o.d++;
    if (c) St("double *s = goome_ui_store(u, id, " + N + ")"), St("if (!s) return 0");
    else if (cs) {
      St("var s = ui.Store(id, " + N + ")");
      if (val) {
        A("if (s.Length < " + N + ")");
        A("{");
        A("    value = 0;");
        A("    return 0;");
        A("}");
      } else St("if (s.Length < " + N + ") return 0");
    } else if (jv) {
      St("DoubleBuffer sb = ui.store(id, " + N + ")");
      St("double[] s = new double[" + N + "]");
      St("sb.get(0, s)");
      ctx.need.doubleBuffer = true;
    } else if (gd) {
      A("var s: PackedFloat64Array = ui.store(sid, " + N + ")");
      A("if s.size() < " + N + ":");
      A(val ? "    return [0, 0.0]" : "    return 0");
    } else {
      A("s = ui.store(sid, " + N + ")");
      A("if s is None:");
      A(val ? "    return 0, 0.0" : "    return 0");
    }
    iff(py ? "not s[0]" : c ? "!s[0]" : "s[0] == 0");
    const fromInit = (i, d) => (c ? "init ? init[" + i + "] : " + d : brace ? "init != null ? init[" + i + "] : " + d : "init[" + i + "] if init else " + d);
    St(S("init") + " = 1");
    St(S("w") + " = " + fromInit(0, num(def.w)));
    St(S("h") + " = " + fromInit(1, num(def.h)));
    def.state.forEach((st, i) => St(S("s:" + st.name) + " = " + fromInit(i + 2, st.type === "bool" ? (st.def ? "1" : "0") : num(st.def))));
    scope.slots.forEach((w) => St(S("w:" + w.name) + " = " + (w.kind === "color" ? hex(w.val, c || gd ? "c" : lang).replace(/u$/, "") : num(w.val))));
    const clampE = (v, lo, hi) => (c ? "gm_clamp(" + v + ", " + lo + ", " + hi + ")" : cs ? "Math.Max(" + lo + ", Math.Min(" + hi + ", " + v + "))" : jv ? "Math.max(" + lo + ", Math.min(" + hi + ", " + v + "))" : gd ? "clamp(" + v + ", " + lo + ", " + hi + ")" : "max(" + lo + ", min(" + hi + ", " + v + "))");
    const vd = def.value || {};
    const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
    if (val && vd.src === "drag") St(S("value") + " = " + (vst ? S("s:" + vst.name) : num(+vd.min || 0)));

    const groupBase = new Map();
    const baseWalk = (parts, bx, by) => {
      for (const pt of parts) {
        if (pt.kind !== "group") continue;
        const gx = par(ex(pt.f.x, "n", pt.name + " x")), gy = par(ex(pt.f.y, "n", pt.name + " y"));
        const dg = pt.drag && pt.drag.on;
        const sx = plus(bx, gx), sy = plus(by, gy);
        const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
        groupBase.set(pt.id, { sx, sy, ax, ay });
        baseWalk(pt.kids || [], ax, ay);
      }
    };
    baseWalk(def.parts, "0", "0");
    const bounds = (g) => {
      const b = groupBase.get(g.id), d = g.drag;
      const gw = par(ex(g.f.w, "n", g.name + " w")), gh = par(ex(g.f.h, "n", g.name + " h"));
      if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
      if (d.bounds === "rect") {
        const R = d.rect || {};
        return {
          x: [minus(num(+R.x || 0), b.sx), minus(minus(num((+R.x || 0) + (+R.w || 0)), gw), b.sx)],
          y: [minus(num(+R.y || 0), b.sy), minus(minus(num((+R.y || 0) + (+R.h || 0)), gh), b.sy)],
        };
      }
      return null;
    };
    const tOf = (o2, r) => {
      const lo = par(r[0]), hi = par(r[1]);
      return ind ? "(" + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " if " + hi + " > " + lo + " else 0)" : "(" + hi + " > " + lo + " ? " + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " : 0)";
    };
    if (val && vd.src === "drag") {
      const g = groups.find((x) => x.id === vd.part);
      const r = g && bounds(g);
      if (!g) warn("the value comes from a drag but no drag group is picked");
      else if (!r) warn("a value from a drag needs bounds on " + g.name, g.id);
      else {
        const ax = vd.axis === "y" ? "y" : "x";
        const span = (+vd.max || 0) - (+vd.min || 0);
        const t = span ? clampE(par(minus(S("value"), num(+vd.min || 0))) + (span === 1 ? "" : " / " + num(span)), "0", "1") : "0";
        St(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + plus(r[ax][0], t + " * " + par(minus(r[ax][1], r[ax][0]))));
      }
    }
    close();

    scope.slots.forEach((w) => {
      const v = S("w:" + w.name), id = idc(w.name);
      if (c) St((w.kind === "color" ? "uint32_t " : w.kind === "double" ? "double " : "int ") + id + " = " + (w.kind === "double" ? v : "(" + (w.kind === "color" ? "uint32_t" : "int") + ")" + v));
      else if (cs) St((w.kind === "color" ? "uint " : w.kind === "double" ? "double " : w.kind === "int" ? "int " : "bool ") + id + " = " + (w.kind === "double" ? v : w.kind === "color" ? "(uint)" + v : w.kind === "int" ? "(int)" + v : v + " != 0"));
      else if (jv) St((w.kind === "color" ? "int " : w.kind === "double" ? "double " : w.kind === "int" ? "int " : "boolean ") + id + " = " + (w.kind === "double" ? v : w.kind === "color" || w.kind === "int" ? "(int) " + v : v + " != 0"));
      else if (gd) {
        if (w.kind === "color") ctx.need.argb = true;
        A("var " + id + " = " + (w.kind === "double" ? v : w.kind === "color" ? "_argb(int(" + v + "))" : w.kind === "int" ? "int(" + v + ")" : v + " != 0.0"));
      } else A(id + " = " + (w.kind === "double" ? v : w.kind === "color" || w.kind === "int" ? "int(" + v + ")" : "bool(" + v + ")"));
    });

    const flagsDecl = ["changed", "hovered", "pressed", "dragging", "pressed_now", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k]);
    if (c) St("int " + flagsDecl.map((k) => k + " = 0").join(", "));
    else if (cs) St("bool " + flagsDecl.map((k) => idc(k) + " = false").join(", "));
    else if (jv) St("boolean " + flagsDecl.map((k) => idc(k) + " = false").join(", "));
    else if (gd) flagsDecl.forEach((k) => A("var " + k + " = false"));
    else A(flagsDecl.join(" = ") + " = False");
    St(c ? "goome_ui_push_id(u, id)" : cs ? "ui.PushId(id)" : jv ? "ui.pushId(id)" : "ui.push_id(sid)");
    const items = ["el", "o"];
    const IF = (k) => (c ? { 0: "0", x: "GOOME_ITEM_DRAG_X", y: "GOOME_ITEM_DRAG_Y", xy: "GOOME_ITEM_DRAG_X | GOOME_ITEM_DRAG_Y", nohit: "GOOME_ITEM_NO_HIT", fo: "GOOME_ITEM_FOCUSABLE" }
      : cs ? { 0: "ItemFlags.None", x: "ItemFlags.DragX", y: "ItemFlags.DragY", xy: "ItemFlags.DragX | ItemFlags.DragY", nohit: "ItemFlags.NoHit", fo: "ItemFlags.Focusable" }
      : jv ? { 0: "", x: "ItemFlag.DRAG_X", y: "ItemFlag.DRAG_Y", xy: "ItemFlag.DRAG_X, ItemFlag.DRAG_Y", nohit: "ItemFlag.NO_HIT", fo: "ItemFlag.FOCUSABLE" }
      : gd ? { 0: "0", x: "GoomeUI.ITEM_DRAG_X", y: "GoomeUI.ITEM_DRAG_Y", xy: "GoomeUI.ITEM_DRAG_X | GoomeUI.ITEM_DRAG_Y", nohit: "GoomeUI.ITEM_NO_HIT", fo: "GoomeUI.ITEM_FOCUSABLE" }
      : { 0: "0", x: "goome.ITEM_DRAG_X", y: "goome.ITEM_DRAG_Y", xy: "goome.ITEM_DRAG_X | goome.ITEM_DRAG_Y", nohit: "goome.ITEM_NO_HIT", fo: "goome.ITEM_FOCUSABLE" })[k];
    const F = (it, f) => it + "." + (cs ? pascal(f) : jv ? camel(f) + "()" : f);
    const custom = (name, sid, w, h, fl) => {
      if (c) St("goome_ui_custom(u, " + strq(sid, "c") + ", " + w + ", " + h + ", " + fl + ", &" + name + ")");
      else if (cs) St("ui.Custom(" + strq(sid, "cs") + ", " + w + ", " + h + ", " + fl + ", out var " + name + ")");
      else if (jv) St("Item " + name + " = ui.custom(" + [strq(sid, "cs"), w, h].concat(fl ? [fl] : []).join(", ") + ")");
      else if (gd) A("var " + name + " = ui.custom(" + strq(sid, "gd") + ", " + w + ", " + h + ", " + fl + ")");
      else A(name + " = ui.custom(" + strq(sid, "py") + ", " + w + ", " + h + ", " + fl + ")");
    };
    const pos = (x, y) => St(c ? "goome_ui_pos(u, " + x + ", " + y + ")" : cs ? "ui.Pos(" + x + ", " + y + ")" : "ui.pos(" + x + ", " + y + ")");
    const declAt = o.l.length;
    custom("el", "##el", S("w"), S("h"), IF("nohit"));
    pos("0", "0");
    custom("o", "##o", "1", "1", IF("nohit"));
    if (ind) {
      A((gd ? "var " : "") + "ox = " + F("el", "x") + " - " + F("o", "x"));
      A((gd ? "var " : "") + "oy = " + F("el", "y") + " - " + F("o", "y"));
    } else St("double ox = " + F("el", "x") + " - " + F("o", "x") + ", oy = " + F("el", "y") + " - " + F("o", "y"));
    const OR = ind ? " or " : " || ";
    const acc = (it, click) => {
      const L = [];
      const set = (k, e) => {
        if (!reads[k]) return;
        if (ind) L.push(k + " = " + k + " or " + e);
        else if (brace) L.push(idc(k) + " |= " + e + ";");
        else L.push(k + " |= " + e + ";");
      };
      set("hovered", F(it, "hovered") + OR + F(it, "held"));
      set("pressed", F(it, "held"));
      set("pressed_now", F(it, "pressed"));
      if (click) set("clicked", F(it, "clicked"));
      set("released", F(it, "released"));
      if (!click) set("dragend", F(it, "released"));
      L.forEach(A);
    };
    if (rs) {
      const R = def.resizable;
      pos(plus("ox", minus(S("w"), "14")), plus("oy", minus(S("h"), "14")));
      items.push("rs");
      custom("rs", "##rs", "14", "14", IF("xy"));
      iff(F("rs", "pressed"));
      two(S("rw") + " = " + S("w"), S("rh") + " = " + S("h"));
      close();
      iff(F("rs", "held"));
      St(S("w") + " = " + clampE(S("rw") + " + " + F("rs", "drag_x"), num(R.minW), num(R.maxW)));
      St(S("h") + " = " + clampE(S("rh") + " + " + F("rs", "drag_y"), num(R.minH), num(R.maxH)));
      St(CHG);
      if (reads.dragging) St(idc("dragging") + " = " + YES);
      close();
      acc("rs", false);
    }
    const bboxOf = (pt, bx, by) => {
      const f = pt.f, wh = (k) => (pt.name || pt.kind) + " " + k;
      const e = (k) => par(ex(f[k], "n", wh(k)));
      switch (pt.kind) {
        case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
          return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
        case "circle": case "ring": case "arc":
          return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), "2 * " + e("r"), "2 * " + e("r")];
        case "line": {
          const mn = c ? "gm_min" : cs ? "Math.Min" : jv ? "Math.min" : "min", mx = c ? "gm_max" : cs ? "Math.Max" : jv ? "Math.max" : "max", ab = c ? "gm_abs" : cs ? "Math.Abs" : jv ? "Math.abs" : "abs";
          return [plus(bx, mn + "(" + e("x0") + ", " + e("x1") + ")"), plus(by, mn + "(" + e("y0") + ", " + e("y1") + ")"), mx + "(1, " + ab + "(" + minus(e("x1"), e("x0")) + "))", mx + "(1, " + ab + "(" + minus(e("y1"), e("y0")) + "))"];
        }
        case "text": {
          const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
          const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
          const len = pr ? (c ? "(double)strlen(" + pr.name + ")" : cs ? idc(pr.name) + ".Length" : jv || gd ? idc(pr.name) + ".length()" : "len(" + pr.name + ")") : String(Array.from(String(f.text || "")).length);
          return [plus(bx, e("x")), plus(by, e("y")), len + " * " + e("size") + " * 0.55", e("size") + " * 1.25"];
        }
      }
      warn((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
      return null;
    };
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
      let r = null;
      if (d.handle) {
        let hp = null;
        GM.walkParts(g.kids || [], (pt) => {
          if (pt.id === d.handle) hp = pt;
        });
        if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
        else warn("drag handle part not found in " + g.name + ", using the group box", g.id);
      }
      if (!r) r = [b.ax, b.ay, par(ex(g.f.w, "n", g.name + " w")), par(ex(g.f.h, "n", g.name + " h"))];
      const it = c || ind ? "h_" + gv : "h" + pascal(gv);
      items.push(it);
      pos(plus("ox", r[0]), plus("oy", r[1]));
      custom(it, "##" + gv, r[2], r[3], IF(d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"));
      const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
      iff(F(it, "pressed"));
      if (py) A(sx + ", " + sy + " = " + dx + ", " + dy);
      else two(sx + " = " + dx, sy + " = " + dy);
      close();
      iff(F(it, "held"));
      const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
      const bd = bounds(g);
      const snap = +d.snap || 0;
      for (const a of axes) {
        const n2 = "n" + a;
        dbl(n2, (a === "x" ? sx : sy) + " + " + F(it, a === "x" ? "drag_x" : "drag_y"));
        if (snap > 0) St(n2 + " = " + (c ? "gm_floor" : cs ? "Math.Floor" : jv ? "Math.floor" : gd ? "floor" : "math.floor") + "(" + n2 + " / " + num(snap) + " + 0.5) * " + num(snap));
        if (bd) St(n2 + " = " + clampE(n2, bd[a][0], bd[a][1]));
      }
      if (snap > 0 && py) ctx.need.math = true;
      iff(axes.map((a) => "n" + a + " != " + (a === "x" ? dx : dy)).join(OR));
      for (const a of axes) St((a === "x" ? dx : dy) + " = n" + a);
      St(CHG);
      if (val && vd.src === "drag" && vd.part === g.id) {
        const a = vd.axis === "y" ? "y" : "x";
        if (bd) {
          const span = (+vd.max || 0) - (+vd.min || 0);
          const t = tOf(a === "x" ? dx : dy, bd[a]);
          St(S("value") + " = " + plus(num(+vd.min || 0), span === 1 ? t : t + " * " + num(span)));
          if (vst) St(S("s:" + vst.name) + " = " + S("value"));
        }
      }
      close();
      if (reads.dragging) St(idc("dragging") + " = " + YES);
      close();
      acc(it, false);
    }
    if (def.hit === "parts") {
      let k = 0;
      const walkHit = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind === "group") {
            const b = groupBase.get(pt.id);
            if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
            walkHit(pt.kids || [], b.ax, b.ay);
          } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
        }
      };
      const hitOne = (pt, bx, by) => {
        const r = bboxOf(pt, bx, by);
        if (!r) return;
        const it = "hit" + k;
        items.push(it);
        pos(plus("ox", r[0]), plus("oy", r[1]));
        custom(it, "##hit" + k++, r[2], r[3], fo ? IF("fo") : IF(0));
        acc(it, true);
      };
      walkHit(def.parts, "0", "0");
      if (!k && !groups.length && !rs && !deco) warn("hit mode is parts but no part is a hit area, nothing can be clicked");
    } else {
      items.push("box");
      pos("ox", "oy");
      custom("box", "##box", S("w"), S("h"), deco ? IF("nohit") : fo ? IF("fo") : IF(0));
      acc("box", true);
    }
    const oLines = ind ? 4 : 3;
    if (!o.l.slice(declAt + oLines + 1).some((l) => /\b(ox|oy)\b/.test(l))) {
      o.l.splice(declAt + 1, oLines);
      items.splice(items.indexOf("o"), 1);
    }
    if (c) o.l.splice(declAt, 0, "    ".repeat(o.d) + "goome_ui_item " + items.join(", ") + ";");

    const actLines = (on) => {
      for (const e of evs(on)) {
        if (e.act === "print") {
          A(c ? "puts(" + strq(e.text || "", "c") + ");" : cs ? "Console.WriteLine(" + strq(e.text || "", "cs") + ");" : jv ? "System.out.println(" + strq(e.text || "", "cs") + ");" : "print(" + strq(e.text || "", "py") + ")");
          continue;
        }
        const tg = def.state.find((s) => s.name === e.target);
        if (!tg) {
          warn(on + " event needs a state to change, skipped");
          continue;
        }
        const t = S("s:" + tg.name);
        if (e.act === "toggle") A(c ? t + " = !" + t + ";" : brace ? t + " = " + t + " != 0 ? 0 : 1;" : t + " = 0.0 if " + t + " else 1.0");
        else if (e.act === "add") {
          if (tg.type === "bool") {
            warn("cant add to a yes/no state");
            continue;
          }
          St(t + " += " + ex(e.expr || "0", "n", on + " event"));
        } else if (e.act === "set") {
          if (tg.type === "bool") {
            const b = exb(e.expr || "false", on + " event");
            if (b == null) continue;
            St(c ? t + " = " + par(b) + " != 0" : brace ? t + " = " + par(b) + " ? 1 : 0" : t + " = 1.0 if " + b + " else 0.0");
          } else St(t + " = " + ex(e.expr || "0", "n", on + " event"));
        }
        St(CHG);
      }
    };
    const evBlock = (cond, on) => {
      if (!evs(on).length) return;
      iff(cond);
      actLines(on);
      close();
    };
    const NOT = ind ? "not " : "!";
    const AND = ind ? " and " : " && ";
    if (evs("enter").length || evs("leave").length) {
      const hot = brace ? "(" + S("hot") + " != 0)" : S("hot");
      evBlock("hovered" + AND + NOT + hot, "enter");
      evBlock(NOT + "hovered" + AND + hot, "leave");
      St(S("hot") + " = " + (c ? "hovered" : brace ? "hovered ? 1 : 0" : "1.0 if hovered else 0.0"));
    }
    evBlock(idc("pressed_now"), "press");
    evBlock("dragging", "drag");
    evBlock("clicked", "click");
    evBlock("released", "release");
    if (val && vd.src === "state") {
      const vs = def.state.find((s) => s.name === vd.state);
      if (vs) St(S("value") + " = " + S("s:" + vs.name));
      else warn("value state " + (vd.state || "(none)") + " is missing");
    }

    const D = new Out(ind);
    const ELX = F("el", "x"), ELY = F("el", "y");
    const drawParts = (parts, bx, by) => {
      for (const pt of parts) {
        if (pt.kind === "widget" || pt.kind === "hit") continue;
        const where = (k) => (pt.name || pt.kind) + " " + k;
        const N2 = (k) => ex(pt.f[k], "n", where(k));
        const Cc = (k) => ex(pt.f[k], "c", where(k));
        const X0 = (k) => plus(bx, par(N2(k)));
        const Y0 = (k) => plus(by, par(N2(k)));
        const lines = [];
        const call = (cn, csn, pyn, args) => lines.push(c ? cn + "(c, " + args.join(", ") + ");" : cs ? "c." + csn + "(" + args.join(", ") + ");" : jv ? "c." + camel(pyn) + "(" + args.join(", ") + ");" : "c." + pyn + "(" + args.join(", ") + ")");
        const G = (f, args) => lines.push("ui." + f + "(" + args.join(", ") + ")");
        const R2 = (x, y, w, h) => "Rect2(" + [x, y, w, h].join(", ") + ")";
        const V2 = (x, y) => "Vector2(" + x + ", " + y + ")";
        switch (pt.kind) {
          case "rect":
            if (gd) G("draw_rect", [R2(X0("x"), Y0("y"), N2("w"), N2("h")), Cc("color")]);
            else call("goome_draw_rect", "DrawRect", "rect", [X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")]);
            break;
          case "rrect": {
            const r = [N2("tl"), N2("tr"), N2("br"), N2("bl")];
            if (gd) G("draw_rect", [R2(X0("x"), Y0("y"), N2("w"), N2("h")), Cc("color"), "Vector4(" + r.join(", ") + ")"]);
            else call("goome_draw_rrect", "DrawRRect", "rrect", [X0("x"), Y0("y"), N2("w"), N2("h"), c ? "(goome_radii){" + r.join(", ") + "}" : cs || jv ? "new Radii(" + r.join(", ") + ")" : "(" + r.join(", ") + ")", Cc("color")]);
            break;
          }
          case "frame":
            if (gd) G("draw_outline", [R2(X0("x"), Y0("y"), N2("w"), N2("h")), Cc("color"), N2("width")]);
            else call("goome_draw_frame", "DrawFrame", "frame", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")]);
            break;
          case "line":
            if (gd) G("draw_line", [V2(X0("x0"), Y0("y0")), V2(X0("x1"), Y0("y1")), Cc("color"), N2("width")]);
            else call("goome_draw_line", "DrawLine", "line", [X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")]);
            break;
          case "circle":
            if (gd) G("draw_circle", [V2(X0("cx"), Y0("cy")), N2("r"), Cc("color")]);
            else call("goome_draw_circle", "DrawCircle", "circle", [X0("cx"), Y0("cy"), N2("r"), Cc("color")]);
            break;
          case "ring":
            if (gd) G("draw_ring", [V2(X0("cx"), Y0("cy")), N2("r"), Cc("color"), N2("width")]);
            else call("goome_draw_ring", "DrawRing", "ring", [X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")]);
            break;
          case "arc":
            if (gd) G("draw_arc", [V2(X0("cx"), Y0("cy")), N2("r"), N2("a0"), N2("a1"), Cc("color"), N2("width")]);
            else call("goome_draw_arc", "DrawArc", "arc", [X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")]);
            break;
          case "poly": {
            const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
            if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
              warn(where("points") + ": needs 3 or more x,y pairs", pt.id);
              break;
            }
            const flat = [];
            pts.forEach((xy) => flat.push(plus(bx, par(ex(xy[0], "n", where("points")))), plus(by, par(ex(xy[1], "n", where("points"))))));
            const id = "pts_" + GM.partVar(pt);
            if (c) {
              lines.push("double " + id + "[] = {" + flat.join(", ") + "};");
              lines.push("goome_draw_poly(c, " + id + ", " + pts.length + ", " + Cc("color") + ");");
            } else if (cs) lines.push("c.DrawPoly(new double[] { " + flat.join(", ") + " }, " + Cc("color") + ");");
            else if (jv) lines.push("c.poly(new double[] {" + flat.join(", ") + "}, " + Cc("color") + ");");
            else if (gd) {
              const vs = [];
              for (let k = 0; k < flat.length; k += 2) vs.push(V2(flat[k], flat[k + 1]));
              G("draw_polygon", ["PackedVector2Array([" + vs.join(", ") + "])", Cc("color")]);
            } else lines.push("c.poly([" + flat.join(", ") + "], " + Cc("color") + ")");
            break;
          }
          case "grad":
            if (gd) G("draw_gradient", [R2(X0("x"), Y0("y"), N2("w"), N2("h")), Cc("from"), Cc("to"), N2("radius"), bool(!!pt.f.sideways, lang)]);
            else call("goome_draw_rrect_grad", "DrawRRectGrad", "rrect_grad", [X0("x"), Y0("y"), N2("w"), N2("h"), c ? "goome_radius(" + N2("radius") + ")" : jv ? "Radii.of(" + N2("radius") + ")" : N2("radius"), Cc("from"), Cc("to"), bool(!!pt.f.sideways, lang)]);
            break;
          case "shadow":
            if (gd) G("draw_shadow", [R2(X0("x"), Y0("y"), N2("w"), N2("h")), Cc("color"), N2("radius"), N2("blur")]);
            else call("goome_draw_shadow", "DrawShadow", "shadow", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")]);
            break;
          case "text": {
            const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
            let tx;
            if (m) {
              const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
              if (!pr) {
                warn(where("text") + ": no text param called " + m[1], pt.id);
                tx = strq("", lang);
              } else tx = idc(pr.name);
            } else tx = strq(pt.f.text || "", lang);
            if (c) lines.push("goome_text(c, NULL, " + [N2("size"), X0("x"), Y0("y"), tx, Cc("color")].join(", ") + ");");
            else if (cs) lines.push("c.DrawText(null, " + [N2("size"), X0("x"), Y0("y"), tx, Cc("color")].join(", ") + ");");
            else if (jv) lines.push("c.text(null, " + [N2("size"), X0("x"), Y0("y"), tx, Cc("color")].join(", ") + ");");
            else if (gd) G("draw_text", [V2(X0("x"), Y0("y")), tx, Cc("color"), N2("size")]);
            else lines.push("c.font_text(None, " + [N2("size"), X0("x"), Y0("y"), tx, Cc("color")].join(", ") + ")");
            break;
          }
          case "bitmap": {
            if (gd) {
              warn("godot-goome cant draw a picture inside a custom element yet, skipped " + (pt.name || "the bitmap"), pt.id);
              break;
            }
            const file = String(pt.f.file || "picture.png");
            const bid = addBitmap(ctx, "bm_" + def.name + "_" + GM.partVar(pt), file, pt.f.img);
            const tint = pt.f.tint === "" || pt.f.tint == null ? hex(0xFFFFFFFF, lang) : Cc("tint");
            const a = [X0("x"), Y0("y"), N2("w"), N2("h")];
            if (c) lines.push("if (" + bid + "_ok) goome_draw_bitmap(c, &" + bid + ", " + a.concat(["goome_radius(" + N2("radius") + ")", tint]).join(", ") + ");");
            else if (cs) lines.push("if (" + camel(bid) + " != null) c.DrawBitmap(" + camel(bid) + ", " + a.concat([N2("radius"), tint]).join(", ") + ");");
            else if (jv) lines.push("if (" + camel(bid) + " != null) c.bitmap(" + camel(bid) + ", " + a.concat([N2("radius"), tint]).join(", ") + ");");
            else lines.push("if " + bid.toUpperCase() + " is not None:", "    c.bitmap(" + bid.toUpperCase() + ", " + a.concat([N2("radius"), tint]).join(", ") + ")");
            break;
          }
          case "group": {
            const b = groupBase.get(pt.id);
            const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
            if (pt.f.clip) {
              const a = [ax, ay, N2("w"), N2("h")];
              lines.push(c ? "goome_clip_push(c, " + a.join(", ") + ");" : cs ? "c.ClipPush(" + a.join(", ") + ");" : jv ? "c.clipPush(" + a.join(", ") + ");" : gd ? "ui.push_clip(" + R2(...a) + ")" : "c.clip_push(" + a.join(", ") + ")");
            }
            const keep = D.l.length, sd = D.d;
            D.d = 0;
            drawParts(pt.kids || [], ax, ay);
            const kid = D.l.splice(keep);
            D.d = sd;
            kid.forEach((l) => lines.push(l));
            if (pt.f.clip) lines.push(c ? "goome_clip_pop(c);" : cs ? "c.ClipPop();" : jv ? "c.clipPop();" : gd ? "ui.pop_clip()" : "c.clip_pop()");
            break;
          }
        }
        if (!lines.length) continue;
        if (pt.show) {
          const b = exb(pt.show, (pt.name || pt.kind) + " show");
          if (b == null) continue;
          if (ind) D.add("if " + b + ":");
          else if (cs) D.add("if (" + b + ")"), D.add("{");
          else D.add("if (" + b + ") {");
          lines.forEach((l) => D.add("    " + l));
          if (!ind) D.add("}");
        } else lines.forEach((l) => D.add(l));
      }
    };
    drawParts(def.parts, ELX, ELY);
    if (D.l.length) {
      const usesTh = D.l.some((l) => /\bth(->|\.)/.test(l));
      if (c) {
        St("goome_canvas *c = goome_ui_canvas(u)");
        open("if (c)");
        if (usesTh) St("goome_theme *th = goome_ui_theme(u)");
      } else if (cs) {
        St("var c = ui.Canvas()");
        open("if (c != null)");
        if (usesTh) St("var th = ui.Theme");
      } else if (jv) {
        St("Canvas c = ui.canvas()");
        open("if (c != null)");
        if (usesTh) St("Theme th = ui.theme()");
      } else if (py) {
        A("c = ui.canvas");
        open("if c is not None");
        if (usesTh) A("th = ui.theme");
      }
      D.l.forEach((l) => o.add(l));
      if (!gd) close();
    }
    wout.l.forEach((l) => o.add(l));
    scope.slots.forEach((w) => {
      const v = S("w:" + w.name), id = idc(w.name);
      if (c) St(v + " = " + id);
      else if (brace) St(v + " = " + (w.kind === "bool" ? id + " ? 1 : 0" : id));
      else if (gd) A(v + " = " + (w.kind === "bool" ? "1.0 if " + id + " else 0.0" : w.kind === "color" ? id + ".to_argb32()" : id));
      else A(v + " = " + (w.kind === "bool" ? "1.0 if " + id + " else 0.0" : id));
    });
    St(c ? "goome_ui_pop_id(u)" : cs ? "ui.PopId()" : jv ? "ui.popId()" : "ui.pop_id()");
    const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]]));
    if (c) {
      if (val) A("if (value) *value = " + S("value") + ";");
      A("return " + bits.map((b) => (b[1] === 1 ? b[0] : b[0] + " << " + Math.log2(b[1]))).join(" | ") + ";");
    } else if (cs) {
      if (val) St("value = " + S("value"));
      St("return " + bits.map((b) => "(" + idc(b[0]) + " ? " + b[1] + " : 0)").join(" | "));
    } else if (jv) {
      if (val) St("if (value != null) value[0] = " + S("value"));
      St("sb.put(0, s)");
      St("return " + bits.map((b) => "(" + idc(b[0]) + " ? " + b[1] + " : 0)").join(" | "));
    } else if (gd) {
      A("ui.store_set(sid, s)");
      const m = bits.map((b) => "(" + b[1] + " if " + b[0] + " else 0)").join(" | ");
      A("return " + (val ? "[" + m + ", " + S("value") + "]" : m));
    } else {
      const m = bits.map((b) => "(" + b[1] + " if " + b[0] + " else 0)").join(" | ");
      A("return " + (val ? m + ", " + S("value") : m));
    }
    o.d--;
    if (!ind) A("}");
    if (c || py) ctx.need.math = ctx.need.math || c;
    return o.text();
  }

  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const b64bytes = (s) => {
    const out = [];
    let buf = 0, bits = 0;
    for (const ch of s) {
      const v = B64.indexOf(ch);
      if (v < 0) continue;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((buf >> bits) & 255);
      }
    }
    return out;
  };
  const dataB64 = (img) => {
    const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(img || ""));
    return m ? m[1].replace(/\s+/g, "") : null;
  };

  function addBitmap(ctx, id, file, img) {
    ctx.bitmaps = ctx.bitmaps || new Map();
    if (ctx.bitmaps.has(id)) return id;
    const set = Object.assign({}, GM.SETTINGS_DEFAULT, ctx.project.settings || {});
    let b64 = set.iconSource === "embed" ? dataB64(img) : null;
    if (set.iconSource === "embed" && !b64) ctx.warn("", file + " has no image data to embed, the code loads the file instead");
    if (!b64) ctx.files.add(file);
    ctx.bitmaps.set(id, { file, b64 });
    return id;
  }
  function bmRef(ctx, id) {
    const lang = ctx.lang, b = ctx.bitmaps.get(id);
    if (lang === "gd") return { ref: b.b64 ? "s." + id : strq("res://" + b.file, "gd"), ok: null };
    if (lang === "c") return { ref: "&" + id, ok: id + "_ok" };
    if (lang === "py") return { ref: id.toUpperCase(), ok: id.toUpperCase() + " is not None" };
    return { ref: camel(id), ok: camel(id) + " != null" };
  }
  const javaStr = (s) => {
    if (s.length <= 60000) return strq(s, "cs");
    const parts = [];
    for (let i = 0; i < s.length; i += 60000) parts.push(strq(s.slice(i, i + 60000), "cs"));
    return "String.join(\"\", " + parts.join(", ") + ")";
  };

  function bitmapLoads(ctx) {
    const lang = ctx.lang, L = { decl: [], load: [], free: [], helpers: [] };
    if (!ctx.bitmaps) return L;
    let files = false, data = false;
    for (const [id, b] of ctx.bitmaps) {
      if (lang === "c") {
        L.decl.push("static goome_bitmap " + id + ";", "static int " + id + "_ok;");
        if (b.b64) {
          const bytes = b64bytes(b.b64);
          const rows = [];
          for (let i = 0; i < bytes.length; i += 16) rows.push("    " + bytes.slice(i, i + 16).map((x) => "0x" + x.toString(16).padStart(2, "0")).join(", ") + ",");
          L.decl.push("static const unsigned char " + id + "_png[] = {", ...rows, "};");
          L.load.push(id + "_ok = goome_bitmap_load_mem(" + id + "_png, sizeof(" + id + "_png), &" + id + ") == GOOME_OK;");
        } else L.load.push(id + "_ok = goome_bitmap_load(" + strq(b.file, "c") + ", &" + id + ") == GOOME_OK;");
        L.free.push("goome_bitmap_free(&" + id + ");");
      } else if (lang === "cs") {
        if (b.b64) data = true, L.decl.push("var " + camel(id) + " = TryLoadData(" + strq(b.b64, "cs") + ");");
        else files = true, L.decl.push("var " + camel(id) + " = TryLoad(" + strq(b.file, "cs") + ");");
      } else if (lang === "java") {
        L.decl.push("static Bitmap " + camel(id) + ";");
        if (b.b64) data = true, L.load.push(camel(id) + " = tryLoadData(" + javaStr(b.b64) + ");");
        else files = true, L.load.push(camel(id) + " = tryLoad(" + strq(b.file, "cs") + ");");
      } else if (lang === "gd") {
        if (!b.b64) continue;
        data = true;
        L.decl.push("var " + id + ": Image");
        L.load.push("s." + id + " = _img(" + strq(b.b64, "gd") + ")");
      } else {
        if (b.b64) data = true, L.decl.push(id.toUpperCase() + " = load_bitmap_data(" + strq(b.b64, "py") + ")");
        else files = true, L.decl.push(id.toUpperCase() + " = load_bitmap(" + strq(b.file, "py") + ")");
      }
    }
    if (lang === "cs") {
      if (files) L.helpers.push("Bitmap? TryLoad(string path)", "{", "    try", "    {", "        return Bitmap.Load(path);", "    }", "    catch (GoomeException)", "    {", "        return null;", "    }", "}", "");
      if (data) L.helpers.push("Bitmap? TryLoadData(string b64)", "{", "    try", "    {", "        return Bitmap.Load(Convert.FromBase64String(b64));", "    }", "    catch (GoomeException)", "    {", "        return null;", "    }", "}", "");
    } else if (lang === "java") {
      if (files) L.helpers.push("static Bitmap tryLoad(String path) {", "    try {", "        return Bitmap.load(path);", "    } catch (GoomeException e) {", "        return null;", "    }", "}", "");
      if (data) {
        ctx.need.base64 = true;
        L.helpers.push("static Bitmap tryLoadData(String b64) {", "    try {", "        return Bitmap.fromBytes(Base64.getDecoder().decode(b64));", "    } catch (GoomeException e) {", "        return null;", "    }", "}", "");
      }
    } else if (lang === "gd") {
      if (data) L.helpers.push("func _img(b64: String) -> Image:", "    var img := Image.new()", "    var raw := Marshalls.base64_to_raw(b64)", "    if img.load_png_from_buffer(raw) != OK and img.load_jpg_from_buffer(raw) != OK and img.load_webp_from_buffer(raw) != OK:", "        return null", "    return img", "");
    } else if (lang === "py") {
      if (files) L.helpers.push("", "def load_bitmap(path):", "    try:", "        return goome.Bitmap.load(path)", "    except goome.GoomeError:", "        return None", "");
      if (data) {
        ctx.need.base64 = true;
        L.helpers.push("", "def load_bitmap_data(b64):", "    try:", "        return goome.Bitmap.from_bytes(base64.b64decode(b64))", "    except goome.GoomeError:", "        return None", "");
      }
    }
    return L;
  }

  const thName = (k) => THC[k] || pascal(k);
  const NEWF = new Set(GM.THEME_AUTO_COLORS.concat(GM.THEME_NEW_SIZES, GM.THEME_FONTS));
  const CS_PRESET = { DARK: "Dark", LIGHT: "Light", MIDNIGHT: "Midnight", PAPER: "Paper", MINT: "Mint", HIGH_CONTRAST: "HighContrast", ROSE: "Rose" };
  function enumLit(k, v, lang) {
    const names = GM.THEME_ENUMS[k];
    const nm = names && names[v | 0];
    if (!nm || lang === "cs") return num(v);
    const pre = k === "align" ? "ALIGN_" : "EASE_";
    return lang === "c" ? "GOOME_" + pre + nm.toUpperCase() : lang === "java" ? "Theme." + pre + nm.toUpperCase() : lang === "gd" ? "GoomeUI." + pre + nm.toUpperCase() : "goome." + pre + nm.toUpperCase();
  }
  function fieldLit(k, v, lang) {
    if (GM.THEME_COLORS.includes(k)) return hex(v, lang);
    if (GM.THEME_ENUMS[k]) return enumLit(k, v, lang);
    return num(v);
  }
  function fontLit(name, lang) {
    return lang === "c" ? "goome_font_system(" + strq(name, "c") + ")" : lang === "cs" ? "Font.System(" + strq(name, "cs") + ")" : lang === "java" ? "Font.system(" + strq(name, "cs") + ")" : lang === "gd" ? strq(name, "gd") : "goome.Font.system(" + strq(name, "py") + ")";
  }
  function themeDiff(ctx, t, base, set) {
    const lang = ctx.lang, L = [];
    for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
      const differs = GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
      if (!differs) continue;
      L.push(set(k, fieldLit(k, t[k], lang)));
    }
    for (const k of GM.THEME_FONTS) {
      if (!t[k]) continue;
      L.push(set(k, fontLit(t[k], lang)));
    }
    return L;
  }
  function themeLines(ctx) {
    const lang = ctx.lang, t = GM.applyQuick(GM.normTheme(ctx.project.theme));
    const jv = lang === "java", gd = lang === "gd";
    const L = [];
    const set = (k, v) => (lang === "c" ? "t->" + k + " = " + v + ";" : lang === "cs" ? "t." + thName(k) + " = " + v + ";" : jv ? "t." + camel(k) + "(" + v + ");" : gd ? "ui.theme_set(" + strq(k, "gd") + ", " + v + ")" : "t." + k + " = " + v);
    if (t.quick) {
      const q = t.quick;
      L.push(lang === "c" ? "goome_ui_theme_make(t, " + hex(q.accent, "c") + ", " + (q.dark ? 1 : 0) + ", " + num(q.radius) + ");" : lang === "cs" ? "t.Make(" + hex(q.accent, "cs") + ", " + bool(q.dark, "cs") + ", " + num(q.radius) + ");"
        : jv ? "t.set(Theme.make(t, " + hex(q.accent, lang) + ", " + bool(q.dark, lang) + ", " + num(q.radius) + "));" : gd ? "ui.theme_make(" + hex(q.accent, lang) + ", " + bool(q.dark, lang) + ", " + num(q.radius) + ")"
        : "t.make(" + hex(q.accent, "py") + ", " + bool(q.dark, "py") + ", " + num(q.radius) + ")");
      for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, fontLit(t[k], lang)));
    } else {
      const pr = GM.presetOf(t);
      if (pr && pr.id !== "dark") {
        const e = GM.PRESET_ENUM[pr.id];
        L.push(lang === "c" ? "goome_ui_theme_preset(t, GOOME_PRESET_" + e + ");" : lang === "cs" ? "t.Preset(Preset." + CS_PRESET[e] + ");" : jv ? "t.set(Theme.preset(t, Theme.PRESET_" + e + "));" : gd ? "ui.theme_preset(GoomeUI.PRESET_" + e + ")" : "t.preset(goome.PRESET_" + e + ")");
        L.push(...themeDiff(ctx, t, pr, set));
      } else {
        if (t.base === "light") L.push(lang === "c" ? "goome_ui_theme_light(t);" : lang === "cs" ? "t.Light();" : jv ? "t.light();" : gd ? "ui.theme_light()" : "t.light()");
        L.push(...themeDiff(ctx, t, GM.themeBase(t), set));
      }
    }
    const SK = { skin_button: "ButtonSkin", skin_panel: "PanelSkin", skin_input: "InputSkin" };
    const icons = Object.keys(t.icons || {}).filter((k) => GM.ICON_NAMES.includes(k));
    const extra = GM.EXTRA_SKINS.filter((k) => t[k]);
    if (jv || gd) {
      for (const k of GM.THEME_SKINS.concat(extra)) {
        const s = t[k];
        if (!s) continue;
        const b = bmRef(ctx, addBitmap(ctx, k, s.file, s.img));
        const e = [s.l, s.t, s.r, s.b].map(num).join(", ");
        const kind = k.replace(/^skin_/, "").toUpperCase();
        if (jv) L.push("if (" + b.ok + ") t.skin(Ui.SKIN_" + kind + ", new Skin(" + b.ref + ", " + e + "));");
        else L.push("ui.theme_set_skin(GoomeUI.SKIN_" + kind + ", " + b.ref + ", " + e + ")");
      }
      for (const k of icons) {
        const b = bmRef(ctx, addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img));
        if (jv) L.push("if (" + b.ok + ") t.icon(Icon." + k.toUpperCase() + ", " + b.ref + ");");
        else L.push("ui.theme_set_icon(GoomeUI.ICON_" + k.toUpperCase() + ", " + b.ref + ")");
      }
      if (t.icon_tint) L.push(jv ? "t.iconTint(1);" : 'ui.theme_set("icon_tint", 1)');
      return L;
    }
    for (const k of GM.THEME_SKINS) {
      const s = t[k];
      if (!s) continue;
      const id = addBitmap(ctx, k, s.file, s.img);
      const e = [s.l, s.t, s.r, s.b].map(num).join(", ");
      if (lang === "c") L.push("if (" + id + "_ok) t->" + k + " = (goome_skin){&" + id + ", " + e + "};");
      else if (lang === "cs") L.push("if (" + camel(id) + " != null) t." + SK[k] + " = new Skin(" + camel(id) + ", " + e + ");");
      else L.push("if " + id.toUpperCase() + " is not None:", "    t." + k + " = (" + id.toUpperCase() + ", " + e + ")");
    }
    if (lang !== "c") {
      const cs = lang === "cs";
      for (const k of icons) {
        const id = addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
        if (cs) L.push("if (" + camel(id) + " != null) t.Icons[Icon." + pascal(k) + "] = " + camel(id) + ";");
        else L.push("if " + id.toUpperCase() + " is not None:", "    t.icon[goome.ICON_" + k.toUpperCase() + "] = " + id.toUpperCase());
      }
      for (const k of extra) {
        const s = t[k];
        const id = addBitmap(ctx, k, s.file, s.img);
        const e = [s.l, s.t, s.r, s.b].map(num).join(", ");
        if (cs) L.push("if (" + camel(id) + " != null) t.Skins[SkinKind." + pascal(k.replace(/^skin_/, "")) + "] = new Skin(" + camel(id) + ", " + e + ");");
        else L.push("if " + id.toUpperCase() + " is not None:", "    t." + (k === "skin_slider_track" ? "skin_slider" : k) + " = (" + id.toUpperCase() + ", " + e + ")");
      }
      if (t.icon_tint) L.push(cs ? "t.IconTint = 1;" : "t.icon_tint = 1");
    }
    if (lang === "c") {
      for (const k of icons) {
        const id = addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
        L.push("if (" + id + "_ok) t->icon[GOOME_ICON_" + k.toUpperCase() + "] = &" + id + ";");
      }
      if (t.icon_tint) L.push("t->icon_tint = 1;");
      ctx.extraSkins = extra.map((k) => {
        const s = t[k];
        const id = addBitmap(ctx, k, s.file, s.img);
        return { k, id, e: [s.l, s.t, s.r, s.b].map(num).join(", ") };
      });
    }
    return L;
  }

  const CS_CUR = { ARROW: "Arrow", IBEAM: "IBeam", HAND: "Hand", MOVE: "Move", RESIZE_EW: "ResizeEW", RESIZE_NS: "ResizeNS", RESIZE_NWSE: "ResizeNWSE", RESIZE_NESW: "ResizeNESW", WAIT: "Wait", NO: "No", HIDDEN: "Hidden" };
  const CS_CFG = { dbl_click_ms: "DoubleClickMs", dbl_click_px: "DoubleClickPx" };
  const CS_CURK = { custom_xy: "CustomXY" };
  const CS_ACT = { del_word_left: "DeleteWordLeft", del_word_right: "DeleteWordRight" };
  function configLines(ctx) {
    const lang = ctx.lang, c = lang === "c", cs = lang === "cs", jv = lang === "java", gd = lang === "gd";
    const cfg = GM.normConfig(ctx.project.config), def = GM.normConfig({});
    const t = GM.normTheme(ctx.project.theme);
    const L = [], C = [];
    const set = (k, v) => C.push(c ? "cfg->" + k + " = " + v + ";" : cs ? "cfg." + (CS_CFG[k] || pascal(k)) + " = " + v + ";" : jv ? "cfg." + camel(k) + "(" + v + ");" : gd ? "ui.config_set(" + strq(k, "gd") + ", " + v + ")" : "cfg." + k + " = " + v);
    for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) set(k, jv && k !== "scroll_lines" ? String(Math.round(cfg[k])) : num(cfg[k]));
    for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) set(k, c ? String(cfg[k]) : bool(cfg[k], lang));
    for (const [k] of GM.CFG_CURSORS) {
      if (cfg.cursor[k] === def.cursor[k]) continue;
      const sh = cfg.cursor[k];
      C.push(c ? "cfg->cursor[GOOME_CUR_" + k.toUpperCase() + "] = GOOME_CURSOR_" + sh + ";" : cs ? "cfg[CursorKind." + (CS_CURK[k] || pascal(k)) + "] = CursorShape." + CS_CUR[sh] + ";"
        : jv ? "cfg.cursor(Config.CUR_" + k.toUpperCase() + ", Goome.CURSOR_" + sh + ");" : gd ? 'ui.config_set("cursor_' + k + '", GoomeUI.CURSOR_' + sh + ")" : "cfg.cursor[goome.CUR_" + k.toUpperCase() + "] = goome.CURSOR_" + sh);
    }
    if (cfg.mask !== def.mask) set("mask", strq(cfg.mask, lang));
    if (C.length) {
      if (c) L.push("goome_ui_config *cfg = goome_ui_cfg(u);");
      else if (cs) L.push("var cfg = ui.Config;");
      else if (jv) L.push("Config cfg = ui.config();");
      else if (!gd) L.push("cfg = ui.config");
      L.push(...C);
    }
    for (const [k] of GM.CFG_KEYS) {
      if (cfg.keys[k] === def.keys[k]) continue;
      const v = cfg.keys[k].trim() ? strq(cfg.keys[k].trim(), lang) : c ? "NULL" : cs || jv ? "null" : gd ? '""' : "None";
      L.push(c ? "goome_ui_bind(u, GOOME_ACT_" + k.toUpperCase() + ", " + v + ");" : cs ? "ui.Config.Bind(KeyAction." + (CS_ACT[k] || pascal(k)) + ", " + v + ");" : jv ? "ui.config().bind(Config.ACT_" + k.toUpperCase() + ", " + v + ");" : gd ? "ui.bind(GoomeUI.ACT_" + k.toUpperCase() + ", " + v + ")" : "ui.config.bind(goome.ACT_" + k.toUpperCase() + ", " + v + ")");
    }
    if (t.quick && t.quick.scale !== 1) {
      L.push(c ? "goome_ui_scale(u, " + num(t.quick.scale) + ");" : cs ? "ui.Scale(" + num(t.quick.scale) + ");" : jv ? "ui.scale(" + num(t.quick.scale) + ");" : "ui.scale(" + num(t.quick.scale) + ")");
    }
    return L;
  }

  function sectionThemes(ctx) {
    const lang = ctx.lang, L = [];
    for (const [id, v] of ctx.themeVars || []) {
      const t = GM.normTheme(GM.findTheme(ctx.project, id));
      const base = GM.themeBase(t);
      if (lang === "c") {
        L.push(v + " = *goome_ui_theme(u);");
        L.push((t.base === "light" ? "goome_ui_theme_light(&" : "goome_ui_theme_dark(&") + v + ");");
        L.push(...themeDiff(ctx, t, base, (k, x) => v + "." + k + " = " + x + ";"));
      }
    }
    return L;
  }

  const C_HELPERS = [
    "static inline double gm_min(double a, double b) { return a < b ? a : b; }",
    "static inline double gm_max(double a, double b) { return a > b ? a : b; }",
    "static inline double gm_abs(double a) { return a < 0 ? -a : a; }",
    "static inline double gm_floor(double a) { double t = (double)(long long)a; return t > a ? t - 1 : t; }",
    "static inline double gm_clamp(double v, double lo, double hi) { return v < lo ? lo : v > hi ? hi : v; }",
  ];
  const C_FMT = ["static const char *fmt(const char *f, ...)", "{", "    static char buf[8][256];", "    static int k;", "    char *b = buf[k++ & 7];", "    va_list ap;",
    "    va_start(ap, f);", "    vsnprintf(b, 256, f, ap);", "    va_end(ap);", "    return b;", "}", ""];

  function hotkeyBody(ctx, out) {
    const hk = (ctx.project.hotkeys || []).filter((k) => k && k.combo);
    const lang = ctx.lang;
    hk.forEach((k, i) => {
      const where = "hotkey " + k.combo;
      if (lang === "c") {
        out.add("case " + (i + 1) + ":");
        out.d++;
        emitActions(ctx, out, k.actions, where);
        out.add("break;");
        out.d--;
      } else if (lang === "cs" || lang === "java") {
        out.open((i ? "else if" : "if") + " (id == " + (i + 1) + ")");
        emitActions(ctx, out, k.actions, where);
        out.close();
      } else {
        out.open((i ? "elif" : "if") + " n == " + (i + 1) + ":");
        emitActions(ctx, out, k.actions, where);
        out.close();
      }
    });
    return hk;
  }

  function settingsOf(project) {
    return Object.assign({}, GM.SETTINGS_DEFAULT, project.settings || {});
  }
  function finish(code, lang, project) {
    const set = settingsOf(project);
    let L = code.split("\n");
    if (lang === "c" && set.braces === "allman") {
      const out = [];
      for (const l of L) {
        const ind = /^\s*/.exec(l)[0];
        let m;
        if ((m = /^(\s*)\} else(.*) \{$/.exec(l))) out.push(ind + "}", ind + "else" + m[2], ind + "{");
        else if (/\S \{$/.test(l) && !/= \{$/.test(l) && !/^\s*(typedef |static )?struct \{$/.test(l)) out.push(l.slice(0, -2), ind + "{");
        else out.push(l);
      }
      L = out;
    }
    if (lang === "gd") return L.map((l) => l.replace(/^( {4})+/, (m) => "\t".repeat(m.length / 4))).join("\n");
    const ind = Math.max(1, Math.min(8, set.indent | 0 || 4));
    if (ind !== 4) L = L.map((l) => l.replace(/^( {4})+/, (m) => " ".repeat((m.length / 4) * ind)));
    return L.join("\n");
  }

  function genC(project, warn) {
    const ctx = new Ctx(project, "c", warn);
    prepass(ctx);
    const app = project.mode === "app";
    const out = new Out(false);
    out.d = 1;
    if (app) {
      out.add("goome_ui_app(u, " + strq(project.title, "c") + ", " + flags(AFLAGS, project.app, "c") + ");");
      emitList(project.root, ctx, out, "app");
      if (project.app.statusbar) out.add("goome_ui_statusbar(u, " + textCode(ctx, project.app.status || "", {}).code + ");");
      out.add("goome_ui_app_end(u);");
    } else emitList(project.root, ctx, out, "overlay");
    const hout = new Out(false);
    hout.d = 2;
    const hks = hotkeyBody(ctx, hout);
    const els = [];
    for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
    const th = themeLines(ctx);
    const cl = configLines(ctx);
    const sec = sectionThemes(ctx);
    const bl = bitmapLoads(ctx);
    const all = [out.text(), hout.text()].concat(els).join("\n");
    const usesMath = /\bgm_(min|max|abs|floor|clamp)\(/.test(all);
    const L = ["#define GOOME_IMPLEMENTATION", '#include "goome.h"', ""];
    if (ctx.need.fmt) L.push("#include <stdarg.h>");
    L.push("#include <stdio.h>", "#include <string.h>", "");
    if (usesMath) L.push(...C_HELPERS, "");
    if (ctx.need.fmt) L.push(...C_FMT);
    const statics = [];
    if (ctx.need.app) statics.push("static goome *app;");
    if (ctx.need.placeholder) statics.push("static goome_bitmap placeholder;");
    statics.push(...bl.decl);
    for (const x of ctx.extraSkins || []) statics.push("static goome_skin " + x.id + "_k;");
    for (const [, v] of ctx.themeVars || []) statics.push("static goome_theme " + v + ";");
    if (statics.length) L.push(...statics, "");
    const consts = ctx.consts.concat(ctx.top);
    if (consts.length) L.push(...consts, "");
    for (const f of ctx.fns) L.push("static void " + f + "(void)", "{", "}", "");
    for (const b of els) L.push(b, "");
    if (th.length) {
      L.push("static void set_theme(goome_ui *u)", "{", "    goome_theme *t = goome_ui_theme(u);");
      th.forEach((l) => L.push("    " + l));
      L.push("}", "");
    }
    if (cl.length) L.push("static void set_config(goome_ui *u)", "{", ...cl.map((l) => "    " + l), "}", "");
    L.push("static void draw(goome_ui *u)", "{", ...out.l, "}", "");
    if (hks.length) L.push("static void on_hotkey(goome_ui *u, int id)", "{", "    (void)u;", "    switch (id) {", ...hout.l, "    }", "}", "");
    L.push("int main(void)", "{", "    int err;");
    if (app) {
      if (project.app.titlebar) {
        L.push("    goome *g = goome_open(&(goome_opts){.title = " + strq(project.title, "c") + ", .mode = GOOME_MODE_WINDOW, .width = " + (project.app.w | 0) + ", .height = " + (project.app.h | 0) + ",");
        L.push("                                        .window_flags = GOOME_WINDOW_RESIZABLE | GOOME_WINDOW_BORDERLESS | GOOME_WINDOW_TRANSPARENT | GOOME_WINDOW_CENTER},");
        L.push("                          &err);");
      } else L.push("    goome *g = goome_open_app(" + strq(project.title, "c") + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ", &err);");
      L.push("    if (!g) {", '        fprintf(stderr, "cant open a window: %s\\n", goome_strerror(err));', "        return 1;", "    }");
    } else {
      L.push("    goome *g = goome_open(&(goome_opts){.title = " + strq(project.title, "c") + ", .no_capture = 1}, &err);");
      L.push("    if (!g) {", '        fprintf(stderr, "cant open an overlay: %s\\n", goome_strerror(err));', "        return 1;", "    }");
    }
    if (ctx.need.app) L.push("    app = g;");
    L.push("    goome_ui *u = goome_ui_new(g);", "    if (!u) {", '        fprintf(stderr, "no memory for the ui\\n");', "        goome_close(g);", "        return 1;", "    }");
    bl.load.forEach((l) => L.push("    " + l));
    for (const x of ctx.extraSkins || []) L.push("    " + x.id + "_k = (goome_skin){&" + x.id + ", " + x.e + "};");
    if (th.length) L.push("    set_theme(u);");
    if (cl.length) L.push("    set_config(u);");
    sec.forEach((l) => L.push("    " + l));
    if (ctx.need.placeholder) L.push("    uint32_t ph[4] = {0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48};", "    goome_bitmap_from_argb(ph, 2, 2, &placeholder);");
    hks.forEach((k, i) => L.push("    goome_hotkey(g, " + strq(k.combo, "c") + ", " + (i + 1) + ");"));
    L.push("    int running = 1, dirty = 1, test = !strncmp(goome_backend_name(g), \"test\", 4);", "    goome_pacer pace = {0};", "    while (running) {", "        goome_event ev;");
    L.push("        int wait = dirty || test || goome_ui_animating(u) ? goome_pace(&pace, 60) : 500;");
    L.push("        while (goome_poll(g, &ev, wait) > 0) {", "            if (ev.type == GOOME_QUIT || ev.type == GOOME_CLOSE) running = 0;");
    if (hks.length) L.push("            if (ev.type == GOOME_HOTKEY) on_hotkey(u, ev.id);");
    L.push("            goome_ui_feed(u, &ev);", "            dirty = 1, wait = 0;", "        }", "        if (!running) break;");
    L.push("        if (!dirty && !test && !goome_ui_animating(u)) continue;", "        dirty = 0;");
    L.push("        if (!goome_ui_begin(u, 0)) continue;");
    const xs = ctx.extraSkins || [];
    for (const x of xs) L.push("        goome_ui_push_skin(u, GOOME_SKIN_" + x.k.replace(/^skin_/, "").toUpperCase() + ", " + x.id + "_ok ? &" + x.id + "_k : NULL);");
    L.push("        draw(u);");
    if (xs.length) L.push("        goome_ui_pop(u, " + xs.length + ");");
    L.push("        goome_ui_end(u);", "    }", "    goome_ui_free(u);");
    if (ctx.need.placeholder) L.push("    goome_bitmap_free(&placeholder);");
    bl.free.forEach((l) => L.push("    " + l));
    L.push("    goome_close(g);", "    return 0;", "}", "");
    return { code: finish(L.join("\n"), "c", project), files: [...ctx.files] };
  }

  function genCS(project, warn) {
    const ctx = new Ctx(project, "cs", warn);
    prepass(ctx);
    const app = project.mode === "app";
    const out = new Out(false);
    out.d = 1;
    emitList(project.root, ctx, out, app ? "app" : "overlay");
    if (app && project.app.statusbar) out.add("ui.StatusBar(" + textCode(ctx, project.app.status || "", {}).code + ");");
    const hout = new Out(false);
    hout.d = 1;
    const hks = hotkeyBody(ctx, hout);
    const els = [];
    for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
    const th = themeLines(ctx);
    const cl = configLines(ctx);
    const bl = bitmapLoads(ctx);
    const L = ["using System;", "using GoomeSharp;", ""];
    const tops = ctx.consts.concat(ctx.top);
    if (ctx.need.placeholder) tops.push("var placeholder = Bitmap.FromArgb(new uint[] { 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48 }, 2, 2);");
    tops.push(...bl.decl);
    if (tops.length) L.push(...tops, "");
    const reg = (gv) => hks.map((k, i) => gv + ".Hotkey(" + strq(k.combo, "cs") + ", " + (i + 1) + ");");
    if (app) {
      const fl = flags(AFLAGS, project.app, "cs");
      L.push("GoomeApp app;", "try", "{");
      if (project.app.titlebar) {
        L.push("    app = new GoomeApp(new GoomeOptions", "    {");
        L.push("        Title = " + strq(project.title, "cs") + ",", "        Mode = Mode.Window,", "        Width = " + (project.app.w | 0) + ",", "        Height = " + (project.app.h | 0) + ",");
        L.push("        WindowStyle = WindowStyle.Resizable | WindowStyle.Borderless | WindowStyle.Transparent | WindowStyle.Center,");
        L.push("    }) { Flags = " + fl + " };");
      } else L.push("    app = new GoomeApp(" + strq(project.title, "cs") + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ") { Flags = " + fl + " };");
      L.push("}", "catch (GoomeException e)", "{", "    Console.Error.WriteLine(\"cant open a window: \" + e.Message);", "    return 1;", "}");
      L.push("using (app)", "{");
      if (th.length) L.push("    SetTheme(app.Ui.Theme);");
      if (cl.length) L.push("    SetConfig(app.Ui);");
      reg("app.Goome").forEach((l) => L.push("    " + l));
      if (hks.length) L.push("    app.OnEvent += ev =>", "    {", "        if (ev.Type == EventType.Hotkey) OnHotkey(app.Ui, ev.Id);", "    };");
      L.push("    app.Run(Draw);", "}", "return 0;", "");
    } else {
      L.push("Goome g;", "try", "{", "    g = new Goome(new GoomeOptions { Title = " + strq(project.title, "cs") + ", NoCapture = true });", "}");
      L.push("catch (GoomeException e)", "{", "    Console.Error.WriteLine(\"cant open an overlay: \" + e.Message);", "    return 1;", "}");
      L.push("using (g)", "using (var u = new Ui(g))", "{");
      if (th.length) L.push("    SetTheme(u.Theme);");
      if (cl.length) L.push("    SetConfig(u);");
      reg("g").forEach((l) => L.push("    " + l));
      L.push("    bool running = true, dirty = true, test = g.BackendName.StartsWith(\"test\");", "    var pace = new Pacer();", "    while (running)", "    {");
      L.push("        int wait = dirty || test || u.Animating ? pace.Pace(60) : 500;");
      L.push("        while (g.Poll(out var ev, wait))", "        {", "            if (ev.Type == EventType.Quit || ev.Type == EventType.Close) running = false;");
      if (hks.length) L.push("            if (ev.Type == EventType.Hotkey) OnHotkey(u, ev.Id);");
      L.push("            u.Feed(ev);", "            dirty = true;", "            wait = 0;", "        }", "        if (!running) break;");
      L.push("        if (!dirty && !test && !u.Animating) continue;", "        dirty = false;");
      L.push("        if (u.Begin(0) == null) continue;", "        Draw(u);", "        u.End();", "    }", "}", "return 0;", "");
    }
    if (th.length) {
      L.push("void SetTheme(Theme t)", "{");
      th.forEach((l) => L.push("    " + l));
      L.push("}", "");
    }
    if (cl.length) L.push("void SetConfig(Ui ui)", "{", ...cl.map((l) => "    " + l), "}", "");
    L.push("void Draw(Ui ui)", "{", ...out.l, "}", "");
    if (hks.length) L.push("void OnHotkey(Ui ui, int id)", "{", ...hout.l, "}", "");
    for (const f of ctx.fns) L.push("static void " + pascal(f) + "()", "{", "}", "");
    els.forEach((b) => L.push(b, ""));
    L.push(...bl.helpers);
    return { code: finish(L.join("\n").replace(/\n+$/, "\n"), "cs", project), files: [...ctx.files] };
  }

  function genPy(project, warn) {
    const ctx = new Ctx(project, "py", warn);
    prepass(ctx);
    const app = project.mode === "app";
    const out = new Out(true);
    out.d = 1;
    emitList(project.root, ctx, out, app ? "app" : "overlay");
    if (app && project.app.statusbar) out.add("ui.statusbar(" + textCode(ctx, project.app.status || "", {}).code + ")");
    const hout = new Out(true);
    hout.d = 1;
    const hks = hotkeyBody(ctx, hout);
    const els = [];
    for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
    const th = themeLines(ctx);
    const cl = configLines(ctx);
    const bl = bitmapLoads(ctx);
    const L = [];
    if (ctx.need.base64) L.push("import base64");
    if (els.some((b) => /\bmath\./.test(b))) L.push("import math");
    L.push("import sys");
    if (ctx.need.placeholder) L.push("from array import array");
    L.push("", "import goome", "");
    if (ctx.consts.length) L.push(...ctx.consts, "");
    if (ctx.need.placeholder) L.push('PLACEHOLDER = goome.Bitmap.from_argb(array("I", [0xFF3A3F48] * 4), 2, 2)', "");
    if (bl.helpers.length) L.push(...bl.helpers, "");
    if (bl.decl.length) L.push(...bl.decl, "");
    if (ctx.need.g) L.push("G = None", "");
    L.push("", "class State:");
    if (ctx.top.length) ctx.top.forEach((l) => L.push("    " + l));
    else L.push("    pass");
    L.push("", "", "s = State()", "");
    for (const f of ctx.fns) L.push("", "def " + f + "():", "    pass", "");
    els.forEach((b) => L.push("", b, ""));
    if (th.length) {
      L.push("", "def set_theme(t):");
      th.forEach((l) => L.push("    " + l));
      L.push("");
    }
    if (cl.length) L.push("", "def set_config(ui):", ...cl.map((l) => "    " + l), "");
    L.push("", "def draw(ui):");
    if (out.l.length) L.push(...out.l);
    else L.push("    pass");
    L.push("");
    if (hks.length) L.push("", "def on_hotkey(ui, n):", ...hout.l, "");
    const regs = (gv) => hks.length ? ["    for n, combo in enumerate((" + hks.map((k) => strq(k.combo, "py")).join(", ") + (hks.length === 1 ? "," : "") + "), 1):", "        try:", "            " + gv + ".hotkey(combo, n)", "        except goome.GoomeError:", "            pass"] : [];
    if (app) {
      const fl = flags(AFLAGS, project.app, "py");
      const extra = project.app.titlebar ? ", window_flags=goome.WINDOW_RESIZABLE | goome.WINDOW_BORDERLESS | goome.WINDOW_TRANSPARENT | goome.WINDOW_CENTER" : "";
      L.push("", "app = goome.App(" + strq(project.title, "py") + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ", flags=" + fl + extra + ")", "");
      if (th.length || cl.length || ctx.need.g || hks.length) {
        L.push("", "@app.on_start", "def start():");
        if (ctx.need.g) L.push("    global G", "    G = app.g");
        if (th.length) L.push("    set_theme(app.ui.theme)");
        if (cl.length) L.push("    set_config(app.ui)");
        L.push(...regs("app.g"), "");
      }
      if (hks.length) L.push("", "@app.event", "def on_event(ev):", "    if ev.type == goome.HOTKEY:", "        on_hotkey(app.ui, ev.id)", "");
      L.push("", "@app.frame", "def frame(ui):", "    draw(ui)", "");
      L.push("", "def main():", "    try:", "        app.run()", "    except goome.GoomeError as e:", '        print("cant open a window: %s" % e, file=sys.stderr)', "        return 1", "    return 0", "");
    } else {
      L.push("", "def main():");
      if (ctx.need.g) L.push("    global G");
      L.push("    try:", "        g = goome.open(" + strq(project.title, "py") + ", no_capture=True)", "    except goome.GoomeError as e:");
      L.push('        print("cant open an overlay: %s" % e, file=sys.stderr)', "        return 1");
      if (ctx.need.g) L.push("    G = g");
      L.push("    ui = g.ui()");
      if (th.length) L.push("    set_theme(ui.theme)");
      if (cl.length) L.push("    set_config(ui)");
      L.push(...regs("g"));
      L.push('    test = g.backend_name.split()[0] == "test"', "    pace = goome.Pacer(60)", "    running, dirty = True, True", "    while running:");
      L.push("        busy = dirty or test or ui.animating");
      L.push("        for ev in g.events(pace.wait() if busy else 500):", "            if ev.type in (goome.QUIT, goome.CLOSE):", "                running = False");
      if (hks.length) L.push("            if ev.type == goome.HOTKEY:", "                on_hotkey(ui, ev.id)");
      L.push("            ui.feed(ev)", "            dirty = True", "        if not running:", "            break");
      L.push("        if not (dirty or test or ui.animating):", "            continue", "        dirty = False");
      L.push("        if ui.begin(0) is None:", "            continue", "        draw(ui)", "        ui.end()");
      L.push("    ui.close()", "    g.close()", "    return 0", "");
    }
    L.push("", 'if __name__ == "__main__":', "    sys.exit(main())", "");
    return { code: finish(L.join("\n").replace(/\n{4,}/g, "\n\n\n").replace(/^\n+/, ""), "py", project), files: [...ctx.files] };
  }

  function genJava(project, warn) {
    const ctx = new Ctx(project, "java", warn);
    prepass(ctx);
    const app = project.mode === "app";
    const cls = javaClass(project);
    const out = new Out(false);
    out.d = 2;
    emitList(project.root, ctx, out, app ? "app" : "overlay");
    if (app && project.app.statusbar) out.add("ui.statusbar(" + textCode(ctx, project.app.status || "", {}).code + ");");
    const hout = new Out(false);
    hout.d = 2;
    const hks = hotkeyBody(ctx, hout);
    const els = [];
    for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
    const th = themeLines(ctx);
    const cl = configLines(ctx);
    const bl = bitmapLoads(ctx);
    const I = (l) => (l === "" ? "" : "    " + l);
    const L = ["import io.github.goomeui.*;"];
    if (ctx.need.doubleBuffer) L.push("import java.nio.DoubleBuffer;");
    if (ctx.need.base64) L.push("import java.util.Base64;");
    L.push("", "public final class " + cls + " {");
    const fields = ctx.consts.concat(ctx.top);
    if (ctx.need.placeholder) fields.push("static Bitmap placeholder;");
    fields.push(...bl.decl);
    if (fields.length) L.push(...fields.map(I), "");
    const setup = (ui, gv) => {
      const S = bl.load.slice();
      if (ctx.need.placeholder) S.push("placeholder = Bitmap.fromArgb(new int[] {0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48}, 2, 2);");
      if (th.length) S.push("setTheme(" + ui + ".theme());");
      if (cl.length) S.push("setConfig(" + ui + ");");
      hks.forEach((k, i) => S.push("try {", "    " + gv + ".hotkey(" + strq(k.combo, "cs") + ", " + (i + 1) + ");", "} catch (GoomeException e) {", "    System.err.println(\"couldnt grab " + strq(k.combo, "cs").slice(1, -1) + ": \" + e.getMessage());", "}"));
      return S;
    };
    L.push("    public static void main(String[] args) {");
    if (app) {
      const fl = flags(AFLAGS, project.app, "java");
      L.push("        App app = new App(" + strq(project.title, "cs") + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ").flags(" + fl + ");");
      if (project.app.titlebar) L.push("        app.options(new Options().windowFlags(Goome.WINDOW_RESIZABLE | Goome.WINDOW_BORDERLESS | Goome.WINDOW_TRANSPARENT | Goome.WINDOW_CENTER));");
      const S = setup("ui", "app.goome()");
      if (S.length) L.push("        app.onStart(() -> {", "            Ui ui = app.ui();", ...S.map((l) => "            " + l), "        });");
      if (hks.length) L.push("        app.onEvent(ev -> {", "            if (ev.type() == Goome.HOTKEY) onHotkey(app.ui(), ev.id());", "            return false;", "        });");
      L.push("        app.onFrame(" + cls + "::draw);");
      L.push("        try {", "            app.run();", "        } catch (GoomeException e) {", "            System.err.println(\"cant open a window: \" + e.getMessage());", "            System.exit(1);", "        }");
    } else {
      L.push("        Goome g;", "        try {", "            g = Goome.open(new Options().title(" + strq(project.title, "cs") + ").noCapture(true));", "        } catch (GoomeException e) {");
      L.push("            System.err.println(\"cant open an overlay: \" + e.getMessage());", "            System.exit(1);", "            return;", "        }");
      L.push("        try (g; Ui u = g.ui(); Pacer pace = new Pacer(60)) {");
      setup("u", "g").forEach((l) => L.push("            " + l));
      L.push("            boolean running = true, dirty = true, test = g.backendName().startsWith(\"test\");", "            while (running) {");
      L.push("                int wait = dirty || test || u.animating() ? pace.next() : 500;");
      L.push("                for (Event ev = g.poll(wait); ev != null; ev = g.poll(0)) {", "                    if (ev.type() == Goome.QUIT || ev.type() == Goome.CLOSE) running = false;");
      if (hks.length) L.push("                    if (ev.type() == Goome.HOTKEY) onHotkey(u, ev.id());");
      L.push("                    u.feed(ev);", "                    dirty = true;", "                }", "                if (!running) break;");
      L.push("                if (!dirty && !test && !u.animating()) continue;", "                dirty = false;");
      L.push("                if (u.begin(0) == null) continue;", "                draw(u);", "                u.end();", "            }", "        }");
    }
    L.push("    }", "");
    if (th.length) L.push("    static void setTheme(Theme t) {", ...th.map((l) => "        " + l), "    }", "");
    if (cl.length) L.push("    static void setConfig(Ui ui) {", ...cl.map((l) => "        " + l), "    }", "");
    L.push("    static void draw(Ui ui) {", ...out.l, "    }", "");
    if (hks.length) L.push("    static void onHotkey(Ui ui, int id) {", ...hout.l, "    }", "");
    for (const f of ctx.fns) L.push("    static void " + camel(f) + "() {", "    }", "");
    els.forEach((b) => L.push(...b.split("\n").map(I), ""));
    bl.helpers.forEach((l) => L.push(I(l)));
    while (L[L.length - 1] === "") L.pop();
    L.push("}", "");
    return { code: finish(L.join("\n"), "java", project), files: [...ctx.files], file: cls + ".java" };
  }

  const GD_KEYS = { space: "SPACE", esc: "ESCAPE", escape: "ESCAPE", enter: "ENTER", return: "ENTER", tab: "TAB", backspace: "BACKSPACE", delete: "DELETE", del: "DELETE",
    left: "LEFT", right: "RIGHT", up: "UP", down: "DOWN", home: "HOME", end: "END", pageup: "PAGEUP", pagedown: "PAGEDOWN", insert: "INSERT", plus: "EQUAL" };
  const GD_CHARS = { "`": "QUOTELEFT", "-": "MINUS", "=": "EQUAL", "[": "BRACKETLEFT", "]": "BRACKETRIGHT", "\\": "BACKSLASH", ";": "SEMICOLON", "'": "APOSTROPHE", ",": "COMMA", ".": "PERIOD", "/": "SLASH" };
  const GD_MODS = { alt: "alt", opt: "alt", option: "alt", ctrl: "ctrl", control: "ctrl", shift: "shift", super: "meta", win: "meta", cmd: "meta", meta: "meta" };
  function gdCombo(combo) {
    let s = String(combo || "").trim();
    const m = new Set();
    for (;;) {
      const x = /^([a-z]+)\+(.+)$/i.exec(s);
      if (!x || !GD_MODS[x[1].toLowerCase()]) break;
      m.add(GD_MODS[x[1].toLowerCase()]);
      s = x[2];
    }
    let key = null;
    const lo = s.toLowerCase();
    if (s.length === 1) {
      const sh = "~!@#$%^&*()_+{}|:\"<>?".indexOf(s), pl = "`1234567890-=[]\\;',./";
      let ch = s;
      if (sh >= 0) ch = pl[sh], m.add("shift");
      if (/[A-Z]/.test(ch)) m.add("shift");
      if (/[a-z0-9]/i.test(ch)) key = "KEY_" + ch.toUpperCase();
      else if (GD_CHARS[ch]) key = "KEY_" + GD_CHARS[ch];
    } else if (/^f([1-9]|1[0-2])$/.test(lo)) key = "KEY_F" + lo.slice(1);
    else if (GD_KEYS[lo]) {
      key = "KEY_" + GD_KEYS[lo];
      if (lo === "plus") m.add("shift");
    }
    if (!key) return null;
    return ["e.keycode == " + key].concat(["ctrl", "shift", "alt", "meta"].map((k) => (m.has(k) ? "" : "not ") + "e." + k + "_pressed")).join(" and ");
  }

  function genGd(project, warn) {
    const ctx = new Ctx(project, "gd", warn);
    prepass(ctx);
    const app = project.mode === "app";
    if (!app) warn("", "godot has no see-through desktop overlay, in godot these windows float over your game inside the GoomeView instead");
    const out = new Out(true);
    out.d = 1;
    if (app) {
      out.open("if ui.app_begin(" + strq(project.title, "gd") + ", " + flags(AFLAGS, project.app, "gd") + "):");
      emitList(project.root, ctx, out, "app");
      if (project.app.statusbar) out.add("ui.statusbar(" + textCode(ctx, project.app.status || "", {}).code + ")");
      out.close();
      out.add("ui.app_end()");
    } else emitList(project.root, ctx, out, "overlay");
    const hout = new Out(true);
    hout.d = 1;
    const hks = hotkeyBody(ctx, hout);
    const els = [];
    for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
    const th = themeLines(ctx);
    const cl = configLines(ctx);
    const bl = bitmapLoads(ctx);
    const setup = bl.load.concat(th, cl);
    const L = ["extends GoomeView", ""];
    if (ctx.consts.length) L.push(...ctx.consts, "");
    const fields = ctx.top.concat(bl.decl);
    L.push("", "class State:");
    if (fields.length) fields.forEach((l) => L.push("    " + l));
    else L.push("    pass");
    L.push("", "", "var s := State.new()");
    if (setup.length) L.push("var _started := false");
    if (hks.length) L.push("var _hotkey := 0");
    L.push("", "", "func _goome_frame(ui: GoomeUI) -> void:");
    if (setup.length) L.push("    if not _started:", "        _started = true", "        _setup(ui)");
    if (hks.length) L.push("    if _hotkey:", "        var n := _hotkey", "        _hotkey = 0", "        _on_hotkey(ui, n)");
    if (out.l.length) L.push(...out.l);
    else if (!setup.length && !hks.length) L.push("    pass");
    if (setup.length) L.push("", "", "func _setup(ui: GoomeUI) -> void:", ...setup.map((l) => "    " + l));
    if (hks.length) {
      warn("", "godot cant grab hotkeys for the whole desktop, these only fire while the game window has focus");
      const conds = [];
      hks.forEach((k, i) => {
        const c = gdCombo(k.combo);
        if (c) conds.push([c, i + 1]);
        else warn("", "cant turn the hotkey " + k.combo + " into a godot key, skipped");
      });
      if (conds.length) {
        L.push("", "", "func _unhandled_key_input(event: InputEvent) -> void:", "    var e := event as InputEventKey", "    if e == null or not e.pressed or e.echo:", "        return");
        conds.forEach(([c, n], i) => L.push("    " + (i ? "elif " : "if ") + c + ":", "        _hotkey = " + n));
        L.push("    else:", "        return", "    get_viewport().set_input_as_handled()", "    redraw()");
      }
      L.push("", "", "func _on_hotkey(ui: GoomeUI, n: int) -> void:", ...hout.l);
    }
    for (const f of ctx.fns) L.push("", "", "func " + gdFn(f) + "() -> void:", "    pass");
    els.forEach((b) => L.push("", "", b));
    if (ctx.need.argb) L.push("", "", "func _argb(v: int) -> Color:", "    return Color.hex(((v & 0xFFFFFF) << 8) | ((v >> 24) & 0xFF))");
    if (bl.helpers.length) L.push("", "", ...bl.helpers);
    while (L[L.length - 1] === "") L.pop();
    L.push("");
    return { code: finish(L.join("\n"), "gd", project), files: ctx.files.size ? [...ctx.files].map((f) => "res://" + f) : [], file: GM.ident(project.name || "ui", "ui") + ".gd" };
  }

  X.langs = {};
  X.H = { GM, camel, pascal, bytes, cut, strq, num, floats, Out, names, WFLAGS, EFLAGS, TFLAGS, AFLAGS, IFLAGS, THC, finish };

  (() => {
    const { GM, strq, num, cut, Out, names, WFLAGS, EFLAGS, TFLAGS, AFLAGS, IFLAGS, finish } = X.H;

    const KW = new Set("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while abstract become box do final macro override priv typeof unsized virtual yield try gen union".split(" "));
    const FN_TAKEN = new Set("draw main set_theme set_config on_hotkey from_base64".split(" "));
    let RENAME = new Map();
    const rn = (s) => RENAME.get(s) || (KW.has(s) ? s + "_v" : s);
    const fnName = (f) => rn(FN_TAKEN.has(f) ? f + "_fn" : f);
    const q = (s) => strq(s, "rust");
    const esc = (s) => String(s).replace(/\{/g, "{{").replace(/\}/g, "}}");
    const fl = (v) => {
      v = +v;
      if (!Number.isFinite(v)) v = 0;
      const s = num(v);
      return /^-?\d+$/.test(s) ? s + ".0" : s;
    };
    const ii = (v) => String(Math.round(+v) || 0);
    const hx = (v) => "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const upper = (s) => s.toUpperCase();
    const flags = (table, p) => {
      const on = table.filter((f) => p[f[0]]).map((f) => f[3].replace("goome.", "goome::"));
      return on.length ? on.join(" | ") : "0";
    };
    const atom = (e) => /^-?[\w.]+(\[\d+\])?$/.test(e) || (e[0] === "(" && e[e.length - 1] === ")" && wrapped(e));
    function wrapped(e) {
      let d = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] === "(") d++;
        else if (e[i] === ")") d--;
        if (d === 0 && i < e.length - 1) return false;
      }
      return true;
    }
    const par = (e) => (atom(e) ? e : "(" + e + ")");
    const plus = (a, b) => (a === "0.0" ? b : b === "0.0" ? a : a + " + " + b);
    const minus = (a, b) => (b === "0.0" ? a : a + " - " + par(b));
    const neg = (e) => (e === "0.0" ? "0.0" : "-" + par(e));
    const mx = (a, b) => "f64::max(" + a + ", " + b + ")";
    const mn = (a, b) => "f64::min(" + a + ", " + b + ")";
    const clampE = (v, lo, hi) => mx(lo, mn(hi, v));

    const TY = { bool: "b", int: "i", float: "f", color: "u" };
    const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };
    const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };

    const PR = { "||": 2, "&&": 3, "==": 4, "!=": 4, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
    const wrap = (x, min) => (x.p < min ? "(" + x.s + ")" : x.s);
    const toF = (x) => {
      if (x.t === "f") return x;
      if (x.t === "b") return { s: "(if " + x.s + " { 1.0 } else { 0.0 })", t: "f", p: 10 };
      const src = x.hex ? { s: x.s + "u32", p: 10 } : x;
      return { s: wrap(src, 9) + " as f64", t: "f", p: 8 };
    };
    const toB = (x) => {
      if (x.t === "b") return x;
      return { s: wrap(x, 5) + (x.t === "f" ? " != 0.0" : " != 0"), t: "b", p: 4 };
    };
    const toI = (x) => {
      if (x.t === "i") return x;
      if (x.n !== undefined && Math.abs(x.n) < 2147483647) return { s: String(Math.trunc(x.n)), t: "i", p: 10 };
      if (x.t === "b") return { s: "i32::from(" + x.s + ")", t: "i", p: 10 };
      return { s: wrap(typed(x), 9) + " as i32", t: "i", p: 8 };
    };
    const toU = (x) => {
      if (x.t === "u") return x;
      if (x.t === "b") return { s: "u32::from(" + x.s + ")", t: "u", p: 10 };
      return { s: wrap(x, 9) + " as u32", t: "u", p: 8 };
    };
    const typed = (x) => (x.hex ? { s: x.s + "u32", t: "u", p: 10 } : x);
    const top = (s) => (/^\(if /.test(s) && wrapped(s) ? s.slice(1, -1) : s);
    const conv = (x, want) => (want === "b" ? toB(x) : want === "c" ? toU(x) : toF(x));

    function ew(a, env) {
      const go = (x) => {
        switch (x.t) {
          case "num": return { s: fl(x.v), t: "f", p: 10, n: x.v };
          case "hex": return { s: hx(x.v), t: "u", p: 10, hex: true };
          case "bool": return { s: x.v ? "true" : "false", t: "b", p: 10 };
          case "th": return env.th(x.f);
          case "id": return env.id(x.name);
          case "call": {
            const args = x.args.map((y) => toF(go(y)).s).join(", ");
            const fn = { min: "f64::min", max: "f64::max", abs: "f64::abs" }[x.fn] || "f64::" + x.fn;
            return { s: fn + "(" + args + ")", t: "f", p: 10 };
          }
          case "un": {
            const v = go(x.a);
            if (x.op === "-") return { s: "-" + wrap(toF(v), 9), t: "f", p: 9 };
            return { s: "!" + wrap(toB(v), 9), t: "b", p: 9 };
          }
          case "tern": {
            const cond = toB(go(x.c));
            const c = cond.s, a = go(x.a), b = go(x.b);
            if (a.t === "b" && b.t === "b" && a.s === "true" && b.s === "false") return cond;
            if (a.t === "b" && b.t === "b" && a.s === "false" && b.s === "true") return { s: "!" + wrap(cond, 9), t: "b", p: 9 };
            let r;
            if (a.t === "b" && b.t === "b") r = [a, b, "b"];
            else if (a.t === "u" && b.t === "u") r = a.hex && b.hex ? [typed(a), typed(b), "u"] : [a, b, "u"];
            else if (a.t === "i" && b.t === "i") r = [a, b, "i"];
            else r = [toF(a), toF(b), "f"];
            const tail = r[1].chain ? r[1].chain : "{ " + top(r[1].s) + " }";
            const chain = "if " + c + " { " + top(r[0].s) + " } else " + tail;
            return { s: "(" + chain + ")", t: r[2], p: 10, chain };
          }
          case "bin": {
            const p = PR[x.op];
            const l = go(x.a), r = go(x.b);
            if (x.op === "&&" || x.op === "||") return { s: wrap(toB(l), p) + " " + x.op + " " + wrap(toB(r), p + 1), t: "b", p };
            if (p === 4) {
              let a = l, b = r;
              if (a.hex && b.hex) a = typed(a);
              const same = (a.t === b.t && a.t !== "f") || (a.t === "b" && b.t === "b");
              if (!same) (a = toF(l)), (b = toF(r));
              const castEnd = (x.op === "<" || x.op === "<=") && /\bas (f64|i32|u32)$/.test(a.s);
              return { s: (castEnd ? "(" + a.s + ")" : wrap(a, 5)) + " " + x.op + " " + wrap(b, 5), t: "b", p };
            }
            const a = toF(l), b = toF(r);
            return { s: wrap(a, p) + " " + x.op + " " + wrap(b, p + 1), t: "f", p };
          }
        }
        return { s: "0.0", t: "f", p: 10 };
      };
      return go(a);
    }

    const fieldLit = (k, v) => {
      if (GM.THEME_COLORS.includes(k)) return hx(v);
      const names = GM.THEME_ENUMS[k];
      const nm = names && names[v | 0];
      if (nm) return "goome::" + (k === "align" ? "ALIGN_" : "EASE_") + upper(nm) + " as f64";
      return fl(v);
    };

    function Gen(project, warn) {
      this.project = project;
      this.warn = warn;
      this.nm = names(project);
      this.vnm = this.nm.vnm;
      this.uniq = (b) => this.nm.take(b);
      this.fields = [];
      this.consts = [];
      this.bitmaps = new Map();
      this.files = new Set();
      this.need = {};
      this.scope = null;
      this.defs = new Map((project.elements || []).map((d) => [d.id, d]));
      this.used = new Map();
      this.themeVars = new Map();
      this.calls = new Set();
      this.depth = 0;
      this.k = 0;
    }
    Gen.prototype.field = function (name, type, init) {
      this.fields.push({ name, type, init });
      return "s." + name;
    };
    Gen.prototype.v = function (name) {
      if (this.scope) return this.scope.alias[name] || name;
      return "s." + rn(name);
    };
    Gen.prototype.ui = function () {
      return this.depth ? "&mut ui" : "ui";
    };
    Gen.prototype.constArr = function (name, items, type) {
      if (this.scope) name = this.scope.prefix + "_" + name;
      const id = upper(name);
      if (type === "f32") this.consts.push("const " + id + ": &[f32] = &[" + items.map(fl).join(", ") + "];");
      else this.consts.push("const " + id + ": &[&str] = &[" + items.map(q).join(", ") + "];");
      return id;
    };
    Gen.prototype.decl = function (kind, name, val, extra) {
      const sc = this.scope;
      if (sc) {
        if (kind === "floats") {
          const id = sc.prefix + "_" + name;
          this.consts.push("const " + upper(id) + ": &[f32] = &[" + val.map(fl).join(", ") + "];");
          sc.alias[name] = upper(id);
          return;
        }
        sc.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" || kind === "flag" ? (val ? 1 : 0) : +val || 0 });
        return;
      }
      const id = rn(name);
      if (kind === "floats") {
        this.consts.push("const " + upper(name) + ": &[f32] = &[" + val.map(fl).join(", ") + "];");
        return;
      }
      const T = { int: "i32", bool: "bool", flag: "bool", double: "f64", color: "u32", str: "String" }[kind];
      const lit = kind === "color" ? hx(val) : kind === "double" ? fl(val) : kind === "int" ? ii(val) : kind === "str" ? q(cut(val, Math.max(2, extra | 0) - 1)) + ".to_string()" : val ? "true" : "false";
      this.field(id, T, lit);
    };
    Gen.prototype.floatsRef = function (name) {
      return this.scope ? this.scope.alias[name] : upper(name);
    };

    function prepass(c) {
      const pj = c.project;
      c.refs = new Map();
      c.vars = new Map();
      c.targets = new Set();
      c.fns = [];
      GM.walk(pj.root, (n) => {
        const on = n.on || {};
        for (const e in on) for (const a of on[e] || []) note(a);
      });
      for (const hk of pj.hotkeys || []) for (const a of hk.actions || []) note(a);
      function note(a) {
        if (!a) return;
        if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) c.targets.add(a.target);
        if (a.do === "call" && a.fn) {
          const f = GM.ident(a.fn, "on_click");
          if (!c.fns.includes(f)) c.fns.push(f);
        }
      }
      const caps = {};
      GM.walk(pj.root, (n) => {
        if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
      });
      for (const v of pj.vars || []) {
        const name = c.vnm.get(v.id);
        const id = rn(name);
        const isList = v.type === "list";
        const r = { name, code: isList ? upper(name) : "s." + id, type: v.type, v, cap: Math.max(256, caps[v.id] || 0) };
        c.vars.set(v.id, r);
        c.refs.set(v.name, r);
        const d = v.def;
        if (isList) {
          const items = GM.lines(d);
          c.consts.push("const " + upper(name) + ": &[&str] = &[" + (items.length ? items : [""]).map(q).join(", ") + "];");
          r.list = true;
          continue;
        }
        const kind = { bool: "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
        const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? +d >>> 0 : v.type === "bool" ? !!d : +d || 0;
        c.decl(kind, name, val, r.cap);
        r.userField = id;
      }
      GM.walk(pj.root, (n) => {
        if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || c.refs.has(n.p.var)) return;
        const nm = c.nm.get(n.id);
        if (!nm) return;
        c.refs.set(n.p.var, { name: nm, code: "s." + rn(nm), type: OWN_T[n.type] });
      });
    }

    function listInfo(c, n) {
      const p = n.p;
      if (p.itemsVar) {
        const r = c.vars.get(p.itemsVar);
        if (r && r.type === "list") return { arr: r.code, items: GM.lines(r.v.def), dyn: true };
        c.warn(n.id, "the items list var is gone or isnt a list, using the typed items");
      }
      return null;
    }

    function envFor(c, where, id) {
      return {
        id: (name) => {
          const ref = c.refs.get(name);
          if (!ref) {
            c.warn(id || "", where + ": theres no var called " + name + (c.scope ? " (vars cant be read inside a custom element yet)" : ""));
            return { s: "0.0", t: "f", p: 10 };
          }
          return { s: ref.code, t: TY[ref.type] || "f", p: 10 };
        },
        th: (f) => ({ s: "ui.theme()." + f, t: GM.THEME_COLORS.includes(f) ? "u" : "f", p: 10 }),
      };
    }
    function exprNode(c, src, want, where, id) {
      const types = GM.layoutIdents(c.project);
      const r = GM.expr.check(src, types, want);
      if (!r.ok) {
        c.warn(id || "", where + ": " + r.err);
        return null;
      }
      return ew(r.ast, envFor(c, where, id));
    }

    function textOf(c, text, id) {
      const parts = GM.interp(text);
      const vars = parts.filter((x) => x.v && c.refs.has(x.v));
      for (const x of parts) if (x.v && !c.refs.has(x.v)) c.warn(id || "", "theres no var called " + x.v + " for {" + x.v + "}");
      if (!vars.length) return { code: q(text), owned: q(text) + ".to_string()", dyn: false };
      let f = "";
      const args = [];
      for (const x of parts) {
        const r = x.v && c.refs.get(x.v);
        if (!r) f += esc(x.t != null ? x.t : "{" + x.v + "}");
        else if (r.type === "color") (f += "#{:08X}"), args.push(r.code);
        else if (r.type === "list") (f += "{}"), args.push(r.code + "[0]");
        else (f += "{}"), args.push(r.code);
      }
      const fmt = "format!(" + q(f) + ", " + args.join(", ") + ")";
      return { code: "&" + fmt, owned: fmt, dyn: true };
    }

    function emitList(list, c, out, ptype) {
      for (const n of list) emitNode(n, c, out, ptype);
    }

    const sub = (out, fill) => {
      const t = new Out(false);
      t.d = out.d + 1;
      fill(t);
      return t.l;
    };
    const inScope = (c, fn) => {
      c.depth++;
      const r = fn();
      c.depth--;
      return r;
    };
    function ifBlock(c, out, cond, fill) {
      const lines = sub(out, fill);
      if (!lines.length) return;
      out.add("if " + cond + " {");
      out.l.push(...lines);
      out.add("}");
    }
    function scopeStmt(c, out, expr, fill) {
      const lines = inScope(c, () => sub(out, fill));
      if (!lines.length) return out.add(expr + ";");
      out.add("{");
      out.d++;
      out.add("let mut ui = " + expr + ";");
      out.d--;
      out.l.push(...lines);
      out.add("}");
    }
    function ifLet(c, out, expr, fill) {
      const lines = inScope(c, () => sub(out, fill));
      if (!lines.length) return out.add("let _ = " + expr + ";");
      out.add("if let Some(mut ui) = " + expr + " {");
      out.l.push(...lines);
      out.add("}");
    }

    function styled(c, out, st, body) {
      if (!GM.styleCount(st)) return body();
      let pushed = 0;
      const th = st.theme ? GM.findTheme(c.project, st.theme) : null;
      if (st.theme && th && !c.scope) {
        out.add("ui.push_theme(&" + themeField(c, st.theme) + ");");
        pushed++;
      } else if (st.theme) c.warn("", c.scope ? "styles with a theme cant go inside a custom element yet" : "a style uses a theme that is gone: " + st.theme);
      for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) out.add("ui.push_color(goome::S_" + upper(f) + ", " + hx(st.c[f]) + ");"), pushed++;
      for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) out.add("ui.push_num(goome::S_" + upper(f) + ", " + fieldLit(f, st.n[f]) + ");"), pushed++;
      if (Array.isArray(st.radii) && st.radii.length === 4) out.add("ui.push_radii((" + st.radii.map(fl).join(", ") + "));"), pushed++;
      body();
      if (pushed) out.add("ui.pop(" + pushed + ");");
    }
    function themeField(c, id) {
      if (!c.themeVars.has(id)) {
        const t = GM.findTheme(c.project, id);
        const f = rn(c.uniq("theme_" + GM.ident(t ? t.name : id, "t")));
        c.themeVars.set(id, f);
        c.fields.push({ name: f, type: "Theme", init: "Theme::dark()" });
      }
      return "s." + c.themeVars.get(id);
    }
    function emitSlot(n, s, c, out, ptype) {
      const st = n.slotStyle && n.slotStyle[String(s)];
      styled(c, out, st, () => emitList(n.kids[s] || [], c, out, ptype));
    }

    function emitActions(c, out, list, where) {
      const St = (s) => out.add(s + ";");
      const idx = GM.index(c.project);
      for (const a of list || []) {
        if (!a || !a.do) continue;
        const refOf = (name) => {
          const r = c.refs.get(name);
          if (!r) c.warn("", where + ": theres no var called " + (name || "(none)"));
          return r;
        };
        switch (a.do) {
          case "set": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type === "string") {
              St(r.code + " = " + textOf(c, a.value || "", "").owned);
              break;
            }
            if (r.type === "list") {
              c.warn("", where + ": cant set a list var, its fixed");
              break;
            }
            const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
            const x = exprNode(c, a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want, where);
            if (!x) break;
            const e = r.type === "bool" ? toB(x) : r.type === "color" ? toU(x) : r.type === "int" ? toI(x) : toF(x);
            if (top(e.s) !== r.code) St(r.code + " = " + top(e.s));
            break;
          }
          case "toggle": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "bool") {
              c.warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
              break;
            }
            St(r.code + " = !" + r.code);
            break;
          }
          case "add":
          case "sub": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "int" && r.type !== "float") {
              c.warn("", where + ": add/sub needs a number var");
              break;
            }
            const src = a.value === "" || a.value == null ? "1" : a.value;
            const x = exprNode(c, src, "n", where);
            if (!x) break;
            const op = a.do === "add" ? "+" : "-";
            const clamp = r.v && +r.v.max > +r.v.min;
            if (r.type === "int" && !clamp && /^\d+$/.test(String(src).trim())) {
              St(r.code + " " + op + "= " + String(src).trim());
              break;
            }
            if (r.type === "float" && !clamp) {
              St(r.code + " " + op + "= " + top(toF(x).s));
              break;
            }
            let v = (r.type === "int" ? r.code + " as f64" : r.code) + " " + op + " " + wrap(toF(x), op === "+" ? 5 : 6);
            if (clamp) v = "(" + v + ").clamp(" + fl(r.v.min) + ", " + fl(r.v.max) + ")";
            else if (r.type === "int") v = "(" + v + ")";
            St(r.code + " = " + v + (r.type === "int" ? " as i32" : ""));
            break;
          }
          case "open":
          case "close": {
            const t = idx.get(a.target);
            if (!t) {
              c.warn("", where + ": the " + a.do + " target is gone");
              break;
            }
            const on = a.do === "open";
            const tn = t.n;
            if (tn.type === "popup") St(on ? "ui.popup_open(" + q(tn.p.label || "popup") + ")" : "ui.popup_close()");
            else if (tn.type === "window" || tn.type === "modal") St(openRef(c, tn) + " = " + (on ? "true" : "false"));
            else c.warn("", where + ": can only open or close a window, modal or popup");
            break;
          }
          case "toast": {
            const t = textOf(c, a.text || "", "");
            St("ui.toast(" + t.code + ", " + String(+a.ms > 0 ? a.ms | 0 : 2500) + ")");
            break;
          }
          case "tab": {
            const t = idx.get(a.target);
            if (!t || t.n.type !== "tabs") {
              c.warn("", where + ": the tab target has to be a tabs node");
              break;
            }
            const r = t.n.p.bind ? c.vars.get(t.n.p.bind) : c.refs.get(t.n.p.var);
            if (!r) break;
            St(r.code + " = " + (a.tab | 0));
            break;
          }
          case "copy": {
            const t = textOf(c, a.text || "", "");
            St("let _ = ui.clipboard_set(" + t.code + ")");
            break;
          }
          case "quit":
            St("let _ = ui.push(&goome::Event::new(goome::CLOSE))");
            break;
          case "call": {
            const f = fnName(GM.ident(a.fn, "on_click"));
            c.calls.add(f);
            St(f + "()");
            break;
          }
          default:
            c.warn("", where + ": dont know the action " + a.do);
        }
      }
    }

    function openRef(c, n) {
      if (n.p.bind) {
        const r = c.vars.get(n.p.bind);
        if (r) return r.code;
      }
      const nm = c.nm.get(n.id) || GM.ident(n.p.var || n.type);
      return n.type === "window" ? "s." + rn(nm) + ".open" : "s." + rn(nm);
    }

    function emitNode(n, c, out, ptype) {
      const go = () => styled(c, out, n.style, () => emitEnabled(n, c, out, ptype));
      if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
        const x = exprNode(c, n.p.showIf, "b", "show if", n.id);
        if (x) {
          out.open("if " + top(toB(x).s));
          go();
          out.close();
          return;
        }
      }
      go();
    }

    function bareRef(c, n) {
      if (n.p.bind) return c.vars.get(n.p.bind) || null;
      if (!OWN_T[n.type]) return null;
      const nm = c.nm.get(n.id);
      if (!nm) return null;
      return { name: nm, code: c.v(nm), type: OWN_T[n.type] };
    }

    function emitEnabled(n, c, out, ptype) {
      const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
      if (!src) return emitBare(n, c, out, ptype, null);
      const x = exprNode(c, src, "b", "enable if", n.id);
      if (!x) return emitBare(n, c, out, ptype, null);
      const en = "en" + ++c.k;
      out.add("let " + en + " = " + top(toB(x).s) + ";");
      out.open("if !" + en);
      out.add("let dim = ui.theme().text_dim;");
      out.add("let accent = ui.theme().accent;");
      out.add("ui.push_color(goome::S_TEXT, dim);");
      out.add("ui.push_color(goome::S_ACCENT, (accent & 0xFFFFFF) | ((accent >> 25) << 24));");
      out.close();
      let saved = null;
      if (VALUE_T[n.type]) {
        const r = bareRef(c, n);
        if (r) {
          const w = "was" + c.k;
          saved = { r, w };
          out.add("let " + w + " = " + r.code + (r.type === "string" ? ".clone()" : "") + ";");
        }
      }
      emitBare(n, c, out, ptype, en);
      out.open("if !" + en);
      if (saved) out.add(saved.r.code + " = " + saved.w + ";");
      out.add("ui.pop(2);");
      out.close();
    }

    function emitBare(n, c, out, ptype, en) {
      const p = n.p || {};
      const st = (s) => out.add(s + ";");
      const call = (fn, args) => "ui." + fn + "(" + args.join(", ") + ")";
      const nm = c.nm.get(n.id) || GM.ident(p.var || n.type);
      if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
        c.warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
        return;
      }
      const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
      if (leaf && +p.width > 0) st(call("width", [fl(p.width)]));
      if (n.abs && ptype !== "overlay" && ptype !== "app") {
        st(call("pos", [fl(n.abs.x), fl(n.abs.y)]));
        if (+n.abs.w > 0 || +n.abs.h > 0) st(call("size", [fl(+n.abs.w > 0 ? n.abs.w : 0), fl(+n.abs.h > 0 ? n.abs.h : 0)]));
      }
      let on = n.on || {};
      if (c.scope && Object.keys(on).some((e) => (on[e] || []).length)) {
        c.warn(n.id, "widget parts inside a custom element cant run actions yet, the events were skipped");
        on = {};
      }
      const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
      const where = (e) => (p.label || n.type) + " " + e;
      const printLine = (txt) => "println!(" + q(esc(txt)) + ");";
      const ifActs = (cond, fill) => {
        out.open("if " + cond);
        fill();
        out.close();
      };
      const andEn = (cond) => (en ? cond + " && " + en : cond);
      const bound = (types) => {
        if (!p.bind) return null;
        const r = c.vars.get(p.bind);
        if (!r) {
          c.warn(n.id, "the bound var is gone, using its own var");
          return null;
        }
        if (c.scope) {
          c.warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
          return null;
        }
        if (types && !types.includes(r.type)) {
          c.warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
          return null;
        }
        return r;
      };
      const own = (kind, val, extra) => {
        c.decl(kind, nm, val, extra);
        return { name: nm, code: c.v(nm), type: kind };
      };
      const changeEvents = () => has("change") || has("on") || has("off");
      const fireChange = (ref) => {
        if (has("change")) emitActions(c, out, on.change, where("change"));
        if ((has("on") || has("off")) && ref) {
          if (has("on")) ifActs(ref.code, () => emitActions(c, out, on.on, where("on")));
          if (has("off")) ifActs("!" + ref.code, () => emitActions(c, out, on.off, where("off")));
        }
      };
      const valueWidget = (expr, ref, plain) => {
        if (changeEvents()) ifActs(andEn(expr), () => fireChange(ref));
        else st(plain || expr);
      };
      const hover = () => {
        if (!has("hover")) return;
        const hv = c.field(rn(c.uniq(nm + "_hot")), "bool", "false").slice(2);
        const h = "h" + ++c.k;
        out.add("let " + h + " = ui.hovered();");
        ifActs(h + " && !s." + hv, () => emitActions(c, out, on.hover, where("hover")));
        out.add("s." + hv + " = " + h + ";");
      };
      const label = (txt) => textOf(c, txt == null ? "" : txt, n.id).code;
      const elseIf = (cond, first) => {
        if (first) out.open("if " + cond);
        else {
          out.l[out.l.length - 1] = out.l[out.l.length - 1] + " else if " + cond + " {";
          out.d++;
          out.marks.push(out.l.length);
        }
      };

      switch (n.type) {
        case "window": {
          if (c.scope) return c.warn(n.id, "windows cant go inside a custom element");
          const fl_ = flags(WFLAGS, p);
          const b = bound(["bool"]);
          const f = c.field(rn(nm), "WindowState", "WindowState::new(" + [p.x, p.y, p.w, p.h].map(fl).join(", ") + ")");
          if (b) st(f + ".open = " + b.code);
          scopeStmt(c, out, call("window", [label(p.label), "&mut " + f, fl_]), (t) => ifBlock(c, t, "ui.shown()", (t2) => emitList(n.kids[0], c, t2, "window")));
          if (b) st(b.code + " = " + f + ".open");
          return;
        }
        case "row": {
          const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
          if (k >= 2) st(call("row", [String(k)]));
          emitList(n.kids[0], c, out, "row");
          return;
        }
        case "same_line": return st(call("same_line", []));
        case "space": return st(call("space", [fl(p.px)]));
        case "separator": return st(call("separator", []));
        case "scroll": {
          scopeStmt(c, out, call("scroll", [q(nm), fl(p.h)]), (t) => emitList(n.kids[0], c, t, "scroll"));
          return;
        }
        case "split": {
          const fr = c.field(rn(nm + "_frac"), "f64", fl(+p.frac || 0.3));
          scopeStmt(c, out, call("split", [q(nm), p.vertical ? "true" : "false", "&mut " + fr]), (t) => {
            emitSlot(n, 0, c, t, "split");
            t.add("ui.split_next();");
            emitSlot(n, 1, c, t, "split");
          });
          return;
        }
        case "tabs": {
          const li = listInfo(c, n);
          const items = li ? li.items : GM.lines(p.items);
          if (!items.length) items.push("Tab");
          const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
          const arr = li ? li.arr : c.constArr(nm + "_names", items);
          valueWidget(call("tabs", [q(nm), arr, "&mut " + r.code]), r);
          let first = true;
          const k = Math.max(items.length, n.kids.length);
          for (let i = 0; i < k; i++) {
            const kids = n.kids[i] || [];
            if (!kids.length) continue;
            elseIf(r.code + " == " + i, first);
            emitSlot(n, i, c, out, "tabs");
            out.close();
            first = false;
          }
          return;
        }
        case "collapsing": {
          const r = bound(["bool"]) || own("bool", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++c.k : null;
          if (ev) out.add("let " + w + " = " + r.code + ";");
          const cl = call("collapsing", [label(p.label), "&mut " + r.code]);
          if (ev) {
            const sh = "open" + ++c.k;
            out.add("let " + sh + " = " + cl + ";");
            ifActs(andEn(r.code + " != " + w), () => emitActions(c, out, on.change, where("change")));
            out.open("if " + sh);
          } else out.open("if " + cl);
          emitList(n.kids[0], c, out, "collapsing");
          out.close();
          return;
        }
        case "tree": {
          const r = bound(["bool"]) || own("bool", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++c.k : null;
          if (ev) out.add("let " + w + " = " + r.code + ";");
          ifLet(c, out, call("tree", [label(p.label), "&mut " + r.code]), (t) => emitList(n.kids[0], c, t, "tree"));
          if (ev) ifActs(andEn(r.code + " != " + w), () => emitActions(c, out, on.change, where("change")));
          return;
        }
        case "modal": {
          const r = bound(["bool"]) || own("bool", false);
          if (p.button) ifActs(call("button", [label(p.button)]), () => out.add(r.code + " = true;"));
          ifLet(c, out, call("modal", [label(p.label), "&mut " + r.code]), (t) => emitList(n.kids[0], c, t, "modal"));
          return;
        }
        case "popup": {
          const id = q(p.label || "popup");
          const b = bound(["bool"]);
          if (b) ifActs(b.code, () => {
            st(call("popup_open", [id]));
            out.add(b.code + " = false;");
          });
          ifLet(c, out, call("popup", [id]), (t) => emitList(n.kids[0], c, t, "popup"));
          return;
        }
        case "menubar":
        case "menu": {
          const mb = n.type === "menubar";
          const b = mb ? call("menubar", []) : call("menu", [label(p.label)]);
          ifLet(c, out, b, (t) => emitList(n.kids[0], c, t, n.type));
          return;
        }
        case "menu_item": {
          const sc = p.shortcut ? "Some(" + q(p.shortcut) + ")" : "None";
          const b = p.check || p.bind ? bound(["bool"]) : null;
          if (p.check || b) {
            const r = b || own("bool", !!p.on);
            const cl = call("menu_item", [label(p.label), sc, "Some(&mut " + r.code + ")"]);
            if (has("click")) ifActs(andEn(cl), () => emitActions(c, out, on.click, where("click")));
            else st(cl);
          } else {
            ifActs(andEn(call("menu_item", [label(p.label), sc, "None"])), () => {
              if (has("click")) emitActions(c, out, on.click, where("click"));
              else out.add(printLine(p.label + " clicked"));
            });
          }
          return;
        }
        case "menu_sep": return st(call("menu_separator", []));
        case "label": st(call("label", [label(p.label)])); hover(); break;
        case "heading": st(call("heading", [label(p.label)])); hover(); break;
        case "wrapped": st(call("wrapped", [label(p.label)])); break;
        case "button": {
          ifActs(andEn(call("button", [label(p.label)])), () => {
            if (has("click")) return emitActions(c, out, on.click, where("click"));
            if (p.action === "toast") st(call("toast", [label(p.toast), String(p.ms | 0)]));
            else if (p.action === "close") st(call("popup_close", []));
            else out.add(printLine(p.label + " clicked"));
          });
          hover();
          break;
        }
        case "checkbox":
        case "toggle": {
          const r = bound(["bool"]) || own("bool", !!p.on);
          valueWidget(call(n.type, [label(p.label), "&mut " + r.code]), r);
          hover();
          break;
        }
        case "radio": {
          const li = listInfo(c, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const ev = changeEvents();
          const ch = ev ? "ch" + ++c.k : null;
          if (ev) out.add("let mut " + ch + " = false;");
          const one = (lab, i) => {
            const cl = call("radio", [lab, "&mut " + r.code, i]);
            st(ev ? ch + " |= " + cl : cl);
          };
          if (li) {
            out.open("for (i, item) in " + li.arr + ".iter().enumerate()");
            if (p.inline) ifActs("i > 0", () => st(call("same_line", [])));
            one("item", "i as i32");
            out.close();
          } else
            items.forEach((it, i) => {
              if (i && p.inline) st(call("same_line", []));
              one(q(it), String(i));
            });
          if (ev) ifActs(andEn(ch), () => fireChange(r));
          break;
        }
        case "slider": {
          const b = bound(["float", "int"]);
          if (b && b.type === "int") {
            valueWidget(call("slider_int", [label(p.label), "&mut " + b.code, ii(p.min), ii(p.max)]), b);
          } else {
            const r = b || own("double", +p.value || 0);
            const args = [label(p.label), "&mut " + r.code, fl(p.min), fl(p.max)];
            valueWidget(p.fmt ? call("slider_fmt", args.concat("Some(" + q(p.fmt) + ")")) : call("slider", args), r);
          }
          hover();
          break;
        }
        case "slider_int": {
          const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
          valueWidget(call("slider_int", [label(p.label), "&mut " + r.code, ii(p.min), ii(p.max)]), r);
          hover();
          break;
        }
        case "input": {
          const cap = Math.max(2, p.cap | 0 || 64);
          const b = bound(["string"]);
          if (c.scope && !b) return c.warn(n.id, "text boxes cant keep their text in the store, skipped");
          const r = b || own("str", p.text || "", cap);
          const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
          const capN = b ? b.cap : cap;
          if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint) {
            valueWidget(call("input_cap", [label(p.label), "&mut " + r.code, String(capN)]), r);
            hover();
            break;
          }
          const hint = p.hint ? "Some(" + q(p.hint) + ")" : "None";
          const cl = call("input_ex_cap", [label(p.label), "&mut " + r.code, flags(IFLAGS, fp), hint, String(capN)]);
          if (!has("enter")) {
            valueWidget(fp.enter ? cl + " == 1" : cl + " != 0", r, cl);
            hover();
            break;
          }
          const k = "k" + ++c.k;
          out.add("let " + k + " = " + cl + ";");
          if (changeEvents()) ifActs(andEn(k + " == 1"), () => fireChange(r));
          ifActs(andEn(k + " == 2"), () => emitActions(c, out, on.enter, where("enter")));
          hover();
          break;
        }
        case "text_edit": {
          const cap = Math.max(2, p.cap | 0 || 4096);
          const b = bound(["string"]);
          if (c.scope && !b) return c.warn(n.id, "text boxes cant keep their text in the store, skipped");
          const r = b || own("str", p.text || "", cap);
          valueWidget(call("text_edit", [q(nm), "&mut " + r.code, fl(p.h), flags(EFLAGS, p)]), r);
          break;
        }
        case "combo": {
          const li = listInfo(c, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : c.constArr(nm + "_items", items.length ? items : [""]);
          valueWidget(call("combo", [label(p.label), "&mut " + r.code, arr]), r);
          hover();
          break;
        }
        case "selectable": {
          const li = listInfo(c, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : c.constArr(nm + "_items", items.length ? items : ["Item"]);
          const ev = changeEvents();
          out.open("for (i, item) in " + arr + ".iter().enumerate()");
          ifActs(call("selectable", ["item", r.code + " == i as i32"]), () => {
            out.add(r.code + " = i as i32;");
            if (ev && en) ifActs(en, () => fireChange(r));
            else if (ev) fireChange(r);
          });
          out.close();
          break;
        }
        case "color": {
          const r = bound(["color"]) || own("color", p.color >>> 0);
          valueWidget(call("color", [label(p.label), "&mut " + r.code]), r);
          hover();
          break;
        }
        case "progress": {
          const b = bound(["float", "int"]);
          let val = fl(p.value);
          if (b) {
            const lo = +b.v.min, hi = +b.v.max;
            const base = b.type === "int" ? b.code + " as f64" : b.code;
            val = hi > lo && !(lo === 0 && hi === 1) ? (lo ? "(" + base + " - " + fl(lo) + ")" : par(base)) + " / " + fl(hi - lo) : base;
          }
          st(call("progress", [val, p.label ? "Some(" + label(p.label) + ")" : "None"]));
          hover();
          break;
        }
        case "table":
        case "plot_lines":
        case "plot_bars":
        case "image": {
          emitData(n, c, out, nm);
          if (n.type === "image") hover();
          break;
        }
        case "el": {
          emitInstance(n, c, out, ptype);
          return;
        }
        default:
          c.warn(n.id, "dont know how to export " + n.type);
          return;
      }
      if (leaf && p.tooltip) st(call("tooltip", [q(p.tooltip)]));
    }

    function emitData(n, c, out, nm) {
      const p = n.p || {};
      const st = (s) => out.add(s + ";");
      switch (n.type) {
        case "table": {
          const cols = GM.lines(p.cols).map((x) => {
            const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
            return [m[1].trim(), m[2] ? +m[2] : 0];
          });
          if (!cols.length) cols.push(["Column", 0]);
          const rows = GM.lines(p.rows).map((r) => {
            const cells = r.split(",").map((x) => x.trim());
            while (cells.length < cols.length) cells.push("");
            return cells.slice(0, cols.length);
          });
          const id = upper(nm) + "_ROWS";
          if (rows.length) c.consts.push("const " + id + ": &[&[&str]] = &[" + rows.map((r) => "&[" + r.map(q).join(", ") + "]").join(", ") + "];");
          ifLet(c, out, "ui.table(" + [q(nm), cols.length, fl(p.h), flags(TFLAGS, p)].join(", ") + ")", (t) => {
            cols.forEach((cl) => t.add("ui.table_column(" + q(cl[0]) + ", " + fl(cl[1]) + ");"));
            if (!rows.length) return;
            t.open("for row in " + id);
            t.add("ui.table_row();");
            t.open("for (j, cell) in row.iter().enumerate()");
            t.add("if j > 0 {");
            t.add("    ui.table_next();");
            t.add("}");
            t.add("ui.label(cell);");
            t.close();
            t.close();
          });
          break;
        }
        case "plot_lines":
        case "plot_bars": {
          const vals = GM.lines(p.values).length ? p.values : "";
          const nums = String(vals).split(/[\s,]+/).filter((x) => x !== "").map(Number).filter(Number.isFinite);
          c.decl("floats", nm, nums);
          st("ui." + n.type + "(" + [q(p.label), c.floatsRef(nm), fl(p.min), fl(p.max), fl(p.h)].join(", ") + ")");
          break;
        }
        case "image": {
          if (c.scope) {
            c.warn(n.id, "images cant go inside a custom element widget part yet, skipped");
            break;
          }
          const f = placeholderField(c);
          out.open("if let Some(bm) = &" + f);
          out.add("ui.image(bm, " + [fl(p.w), fl(p.h), fl(p.radius)].join(", ") + ");");
          out.close();
          break;
        }
      }
    }

    function placeholderField(c) {
      if (!c.placeholder) {
        c.placeholder = "s." + rn(c.uniq("placeholder_bm"));
        c.fields.push({ name: c.placeholder.slice(2), type: "Option<Bitmap>", init: "Bitmap::from_argb(&[0xFF3A3F48; 4], 2, 2).ok()" });
      }
      return c.placeholder;
    }

    const dataB64 = (img) => {
      const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(img || ""));
      return m ? m[1].replace(/\s+/g, "") : null;
    };
    function addBitmap(c, id, file, img) {
      if (c.bitmaps.has(id)) return c.bitmaps.get(id);
      const set = Object.assign({}, GM.SETTINGS_DEFAULT, c.project.settings || {});
      const b64 = set.iconSource === "embed" ? dataB64(img) : null;
      if (set.iconSource === "embed" && !b64) c.warn("", file + " has no image data to embed, the code loads the file instead");
      if (!b64) c.files.add(file);
      const field = rn(c.uniq(id));
      c.bitmaps.set(id, { id, field, file, b64 });
      return c.bitmaps.get(id);
    }

    const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");
    const elBitmaps = (c, def) => {
      const out = [];
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind !== "bitmap") return;
        const b = addBitmap(c, "bm_" + def.name + "_" + GM.partVar(pt), String(pt.f.file || "picture.png"), pt.f.img);
        out.push({ pt, b, first: !out.some((x) => x.b === b) });
      });
      return out;
    };

    function emitInstance(n, c, out, ptype) {
      const p = n.p;
      const def = c.defs.get(p.el);
      if (!def) return c.warn(n.id, "this custom element is gone from the library, skipped");
      if (c.scope) return c.warn(n.id, "custom elements cant go inside custom elements yet");
      const nm = c.nm.get(n.id) || GM.ident(p.var || def.name);
      let info = c.used.get(def.id);
      if (!info) {
        info = { def };
        c.used.set(def.id, info);
      }
      if (ptype === "overlay") out.add("ui.pos(" + fl(p.x) + ", " + fl(p.y) + ");");
      const lit = (type, v) => (type === "color" ? hx(v) : type === "bool" ? (v ? "true" : "false") : type === "text" ? q(v == null ? "" : v) : fl(v));
      const args = def.params.map((pr) => lit(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def));
      const w = +p.w || def.w, h = +p.h || def.h;
      let own = w !== def.w || h !== def.h;
      const sv = def.state.map((s) => {
        const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
        if (v !== s.def) own = true;
        return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
      });
      const init = own ? "Some(&[" + [w, h].concat(sv).map(fl).join(", ") + "])" : "None";
      const val = hasValue(def);
      const on = n.on || {};
      const evk = ["click", "change", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
      if (evk.length) info.mask = true;
      const m = evk.length ? "m" + ++c.k : null;
      const bms = elBitmaps(c, def).filter((x) => x.first).map((x) => "s." + x.b.field + ".as_ref()");
      const a = [c.ui(), q(nm)].concat(args, bms, [init]);
      if (val) a.push("&mut " + c.field(rn(c.uniq(nm + "_value")), "f64", "0.0"));
      const callS = def.name + "_el(" + a.join(", ") + ")";
      out.add((m ? "let " + m + " = " : "") + callS + ";");
      if (!m) return;
      const bit = { change: 1, click: 2, dragend: 4 };
      for (const e of ["change", "click", "dragend"]) {
        if (!evk.includes(e)) continue;
        out.open("if (" + m + " & " + bit[e] + ") != 0");
        emitActions(c, out, on[e], def.name + " " + e);
        out.close();
      }
      if (evk.includes("hover")) {
        const hv = c.field(rn(c.uniq(nm + "_hot")), "bool", "false").slice(2);
        out.open("if (" + m + " & 8) != 0 && !s." + hv);
        emitActions(c, out, on.hover, def.name + " hover");
        out.close();
        out.add("s." + hv + " = (" + m + " & 8) != 0;");
      }
    }

    function elementCode(c, info) {
      const def = info.def;
      const warn = (msg, id) => c.warn(id || def.id, def.name + ": " + msg);
      const types = GM.elementIdents(def);
      const groups = GM.dragGroups(def);
      const rs = !!(def.resizable && def.resizable.on);
      const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
      const prNames = new Set(def.params.map((x) => x.name));
      for (const s of def.state) if (builtin.has(s.name)) warn("state " + s.name + " clashes with a built in name");
      for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) warn("param " + s.name + " clashes with another name");

      const scope = { slots: [], alias: {}, prefix: def.name };
      const wout = new Out(false);
      {
        const local = new Map();
        const used = new Set(["s", "c", "el", "org", "body", "grip", "ox", "oy", "th", "ui", "id", "init", "value", "changed", "hovered", "pressed", "dragging", "clicked", "released", "pressed_now", "dragend", "nx", "ny", "st", "dim", "accent", "bm", "i", "j", "row", "cell", "item", "k"].concat([...KW], [...prNames]));
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const b = GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type);
          let k = b, i = 2;
          while (used.has(k) || /^(h_|hit)/.test(k)) k = b + i++;
          used.add(k);
          local.set(pt.w.id, k);
        });
        const saveNm = c.nm, saveRefs = c.refs, saveDepth = c.depth;
        c.nm = local;
        c.refs = new Map();
        c.scope = scope;
        c.depth = 0;
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const t = pt.w.type;
          if (GM.isContainer(t) || t === "window" || t === "el") warn("widget parts can only be simple widgets, skipped a " + t, pt.id);
          else if (t === "input" || t === "text_edit") warn("text boxes cant keep their text in the store, skipped " + t, pt.id);
          else emitNode(pt.w, c, wout, "element");
        });
        c.scope = null;
        c.nm = saveNm;
        c.refs = saveRefs;
        c.depth = saveDepth;
      }

      const idx = {};
      let N = 0;
      const slot = (k) => (idx[k] = N++);
      ["init", "w", "h", "value", "hot"].forEach(slot);
      def.state.forEach((st) => slot("s:" + st.name));
      groups.forEach((g) => {
        const gv = GM.partVar(g);
        [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
      });
      if (rs) slot("rw"), slot("rh");
      scope.slots.forEach((w) => slot("w:" + w.name));
      const S = (k) => "s[" + idx[k] + "]";
      const INTERNAL = new Set("s st el org body grip ox oy th c bm id ui init value changed hovered pressed dragging clicked released pressed_now dragend nx ny".split(" "));
      const idc = (name) => rn(name);
      const pn = (name) => (INTERNAL.has(name) || /^(h_|hit\d)/.test(name) ? name + "_v" : rn(name));
      const pty = { num: "f64", color: "u32", bool: "bool", text: "&str" };
      const env = {
        id: (name) => {
          if (prNames.has(name)) {
            const pr = def.params.find((x) => x.name === name);
            return { s: pn(name), t: pr.type === "color" ? "u" : pr.type === "bool" ? "b" : "f", p: 10 };
          }
          if (name === "w" || name === "h" || name === "value") return { s: S(name), t: "f", p: 10 };
          if (name === "hovered" || name === "pressed" || name === "dragging") return { s: name, t: "b", p: 10 };
          const st = def.state.find((x) => x.name === name);
          if (st) return st.type === "bool" ? { s: S("s:" + name) + " != 0.0", t: "b", p: 4 } : { s: S("s:" + name), t: "f", p: 10 };
          if (idx[name] != null) return { s: S(name), t: "f", p: 10 };
          return { s: "0.0", t: "f", p: 10 };
        },
        th: (f) => ({ s: "th." + f, t: GM.THEME_COLORS.includes(f) ? "u" : "f", p: 10 }),
      };
      const ex = (src, want, where) => {
        if (src === "" || src == null) return want === "c" ? hx(0) : "0.0";
        let r;
        if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 } };
        else r = GM.expr.check(src, types, want);
        if (!r.ok) {
          warn(where + ": " + r.err);
          return want === "c" ? hx(0) : "0.0";
        }
        return top(conv(ew(r.ast, env), want).s);
      };
      const exb = (src, where) => {
        const r = GM.expr.check(src, types, "b");
        if (!r.ok) {
          warn(where + ": " + r.err);
          return null;
        }
        return toB(ew(r.ast, env)).s;
      };

      const blob = JSON.stringify(def.parts);
      const evs = (on) => (def.events || []).filter((e) => e.on === on);
      const reads = {
        hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
        pressed: /\bpressed\b/.test(blob),
        dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
        pressed_now: evs("press").length > 0,
        clicked: evs("click").length > 0,
        released: evs("release").length > 0,
      };
      const mask = !!info.mask;
      if (mask) reads.hovered = reads.clicked = reads.dragend = true;
      const fo = reads.clicked || reads.pressed_now;
      const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;

      const bms = elBitmaps(c, def);
      const bmName = new Map(bms.map((x) => [x.b.id, "bm_" + GM.partVar(x.pt)]));
      const pargs = def.params.map((pr) => pn(pr.name) + ": " + pty[pr.type]);
      const bmargs = bms.filter((x) => x.first).map((x) => bmName.get(x.b.id) + ": Option<&Bitmap>");
      const val = hasValue(def);
      const o = new Out(false);
      const St = (s) => o.add(s + ";");
      const A = (s) => o.add(s);
      const open = (h) => o.open(h);
      const close = () => o.close();
      const iff = (cond) => open("if " + cond);
      const fn = def.name + "_el";
      const head = ["ui: &mut Ui", "id: &str"].concat(pargs, bmargs, ["init: Option<&[f64]>"], val ? ["value: &mut f64"] : []);
      A("fn " + fn + "(" + head.join(", ") + ") -> i32 {");
      o.d++;
      St("let st = ui.store(id, " + N + ")");
      A("if st.len() < " + N + " {");
      A("    return 0;");
      A("}");
      St("let mut s = [0.0; " + N + "]");
      St("s.copy_from_slice(st)");
      iff(S("init") + " == 0.0");
      const fromInit = (i, d) => "init.map_or(" + d + ", |v| v[" + i + "])";
      St(S("init") + " = 1.0");
      St(S("w") + " = " + fromInit(0, fl(def.w)));
      St(S("h") + " = " + fromInit(1, fl(def.h)));
      def.state.forEach((st, i) => St(S("s:" + st.name) + " = " + fromInit(i + 2, st.type === "bool" ? (st.def ? "1.0" : "0.0") : fl(st.def))));
      scope.slots.forEach((w) => St(S("w:" + w.name) + " = " + fl(w.val)));
      const vd = def.value || {};
      const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
      if (val && vd.src === "drag") St(S("value") + " = " + (vst ? S("s:" + vst.name) : fl(+vd.min || 0)));

      const groupBase = new Map();
      const baseWalk = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind !== "group") continue;
          const gx = par(ex(pt.f.x, "n", pt.name + " x")), gy = par(ex(pt.f.y, "n", pt.name + " y"));
          const dg = pt.drag && pt.drag.on;
          const sx = plus(bx, gx), sy = plus(by, gy);
          const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
          groupBase.set(pt.id, { sx, sy, ax, ay });
          baseWalk(pt.kids || [], ax, ay);
        }
      };
      baseWalk(def.parts, "0.0", "0.0");
      const bounds = (g) => {
        const b = groupBase.get(g.id), d = g.drag;
        const gw = par(ex(g.f.w, "n", g.name + " w")), gh = par(ex(g.f.h, "n", g.name + " h"));
        if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
        if (d.bounds === "rect") {
          const R = d.rect || {};
          return {
            x: [minus(fl(+R.x || 0), b.sx), minus(minus(fl((+R.x || 0) + (+R.w || 0)), gw), b.sx)],
            y: [minus(fl(+R.y || 0), b.sy), minus(minus(fl((+R.y || 0) + (+R.h || 0)), gh), b.sy)],
          };
        }
        return null;
      };
      const tOf = (o2, r) => {
        const lo = par(r[0]), hi = par(r[1]);
        return "(if " + hi + " > " + lo + " { " + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " } else { 0.0 })";
      };
      if (val && vd.src === "drag") {
        const g = groups.find((x) => x.id === vd.part);
        const r = g && bounds(g);
        if (!g) warn("the value comes from a drag but no drag group is picked");
        else if (!r) warn("a value from a drag needs bounds on " + g.name, g.id);
        else {
          const ax = vd.axis === "y" ? "y" : "x";
          const span = (+vd.max || 0) - (+vd.min || 0);
          const t = span ? clampE(par(minus(S("value"), fl(+vd.min || 0))) + (span === 1 ? "" : " / " + fl(span)), "0.0", "1.0") : "0.0";
          St(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + top(plus(r[ax][0], t + " * " + par(minus(r[ax][1], r[ax][0])))));
        }
      }
      close();

      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = idc(w.name);
        const e = w.kind === "double" ? v : w.kind === "color" ? v + " as u32" : w.kind === "int" ? v + " as i32" : v + " != 0.0";
        St("let mut " + id + " = " + e);
      });

      const flagsDecl = ["changed", "hovered", "pressed", "dragging", "pressed_now", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k]);
      flagsDecl.forEach((k) => St("let mut " + k + " = false"));
      St("ui.push_id(id)");
      const IF = (k) => ({ 0: "0", x: "goome::ITEM_DRAG_X", y: "goome::ITEM_DRAG_Y", xy: "goome::ITEM_DRAG_X | goome::ITEM_DRAG_Y", nohit: "goome::ITEM_NO_HIT", fo: "goome::ITEM_FOCUSABLE" })[k];
      const F = (it, f) => it + "." + f;
      const custom = (name, sid, w, h, fl_) => St("let " + name + " = ui.custom(" + [q(sid), w, h, fl_].join(", ") + ")");
      const pos = (x, y) => St("ui.pos(" + x + ", " + y + ")");
      const declAt = o.l.length;
      custom("el", "##el", S("w"), S("h"), IF("nohit"));
      pos("0.0", "0.0");
      custom("org", "##o", "1.0", "1.0", IF("nohit"));
      St("let ox = " + F("el", "x") + " - " + F("org", "x"));
      St("let oy = " + F("el", "y") + " - " + F("org", "y"));
      const acc = (it, click) => {
        const set = (k, e) => {
          if (reads[k]) St(k + " |= " + e);
        };
        set("hovered", F(it, "hovered") + " || " + F(it, "held"));
        set("pressed", F(it, "held"));
        set("pressed_now", F(it, "pressed"));
        if (click) set("clicked", F(it, "clicked"));
        set("released", F(it, "released"));
        if (!click) set("dragend", F(it, "released"));
      };
      if (rs) {
        const R = def.resizable;
        pos(plus("ox", minus(S("w"), "14.0")), plus("oy", minus(S("h"), "14.0")));
        custom("grip", "##rs", "14.0", "14.0", IF("xy"));
        iff(F("grip", "pressed"));
        St(S("rw") + " = " + S("w"));
        St(S("rh") + " = " + S("h"));
        close();
        iff(F("grip", "held"));
        St(S("w") + " = " + clampE(S("rw") + " + " + F("grip", "drag_x"), fl(R.minW), fl(R.maxW)));
        St(S("h") + " = " + clampE(S("rh") + " + " + F("grip", "drag_y"), fl(R.minH), fl(R.maxH)));
        St("changed = true");
        if (reads.dragging) St("dragging = true");
        close();
        acc("grip", false);
      }
      const bboxOf = (pt, bx, by) => {
        const f = pt.f, wh = (k) => (pt.name || pt.kind) + " " + k;
        const e = (k) => par(ex(f[k], "n", wh(k)));
        switch (pt.kind) {
          case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
            return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
          case "circle": case "ring": case "arc":
            return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), "2.0 * " + e("r"), "2.0 * " + e("r")];
          case "line":
            return [plus(bx, mn(e("x0"), e("x1"))), plus(by, mn(e("y0"), e("y1"))), mx("1.0", "f64::abs(" + minus(e("x1"), e("x0")) + ")"), mx("1.0", "f64::abs(" + minus(e("y1"), e("y0")) + ")")];
          case "text": {
            const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
            const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
            const len = pr ? pn(pr.name) + ".chars().count() as f64" : fl(Array.from(String(f.text || "")).length);
            return [plus(bx, e("x")), plus(by, e("y")), par(len) + " * " + e("size") + " * 0.55", e("size") + " * 1.25"];
          }
        }
        warn((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
        return null;
      };
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
        let r = null;
        if (d.handle) {
          let hp = null;
          GM.walkParts(g.kids || [], (pt) => {
            if (pt.id === d.handle) hp = pt;
          });
          if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
          else warn("drag handle part not found in " + g.name + ", using the group box", g.id);
        }
        if (!r) r = [b.ax, b.ay, par(ex(g.f.w, "n", g.name + " w")), par(ex(g.f.h, "n", g.name + " h"))];
        const it = "h_" + gv;
        pos(plus("ox", r[0]), plus("oy", r[1]));
        custom(it, "##" + gv, r[2], r[3], IF(d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"));
        const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
        iff(F(it, "pressed"));
        St(sx + " = " + dx);
        St(sy + " = " + dy);
        close();
        iff(F(it, "held"));
        const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
        const bd = bounds(g);
        const snap = +d.snap || 0;
        for (const a of axes) {
          const n2 = "n" + a;
          St("let mut " + n2 + " = " + (a === "x" ? sx : sy) + " + " + F(it, a === "x" ? "drag_x" : "drag_y"));
          if (snap > 0) St(n2 + " = f64::floor(" + n2 + " / " + fl(snap) + " + 0.5) * " + fl(snap));
          if (bd) St(n2 + " = " + clampE(n2, bd[a][0], bd[a][1]));
        }
        iff(axes.map((a) => "n" + a + " != " + (a === "x" ? dx : dy)).join(" || "));
        for (const a of axes) St((a === "x" ? dx : dy) + " = n" + a);
        St("changed = true");
        if (val && vd.src === "drag" && vd.part === g.id) {
          const a = vd.axis === "y" ? "y" : "x";
          if (bd) {
            const span = (+vd.max || 0) - (+vd.min || 0);
            const t = tOf(a === "x" ? dx : dy, bd[a]);
            St(S("value") + " = " + top(plus(fl(+vd.min || 0), span === 1 ? t : t + " * " + fl(span))));
            if (vst) St(S("s:" + vst.name) + " = " + S("value"));
          }
        }
        close();
        if (reads.dragging) St("dragging = true");
        close();
        acc(it, false);
      }
      if (def.hit === "parts") {
        let k = 0;
        const walkHit = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind === "group") {
              const b = groupBase.get(pt.id);
              if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
              walkHit(pt.kids || [], b.ax, b.ay);
            } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
          }
        };
        const hitOne = (pt, bx, by) => {
          const r = bboxOf(pt, bx, by);
          if (!r) return;
          const it = "hit" + k;
          pos(plus("ox", r[0]), plus("oy", r[1]));
          custom(it, "##hit" + k++, r[2], r[3], fo ? IF("fo") : IF(0));
          acc(it, true);
        };
        walkHit(def.parts, "0.0", "0.0");
        if (!k && !groups.length && !rs && !deco) warn("hit mode is parts but no part is a hit area, nothing can be clicked");
      } else {
        pos("ox", "oy");
        custom("body", "##box", S("w"), S("h"), deco ? IF("nohit") : fo ? IF("fo") : IF(0));
        acc("body", true);
      }
      const oLines = 4;
      if (!o.l.slice(declAt + oLines + 1).some((l) => /\b(ox|oy)\b/.test(l))) o.l.splice(declAt + 1, oLines);

      const actLines = (on) => {
        for (const e of evs(on)) {
          if (e.act === "print") {
            A("println!(" + q(esc(e.text || "")) + ");");
            continue;
          }
          const tg = def.state.find((s) => s.name === e.target);
          if (!tg) {
            warn(on + " event needs a state to change, skipped");
            continue;
          }
          const t = S("s:" + tg.name);
          if (e.act === "toggle") St(t + " = if " + t + " != 0.0 { 0.0 } else { 1.0 }");
          else if (e.act === "add") {
            if (tg.type === "bool") {
              warn("cant add to a yes/no state");
              continue;
            }
            St(t + " += " + ex(e.expr || "0", "n", on + " event"));
          } else if (e.act === "set") {
            if (tg.type === "bool") {
              const b = exb(e.expr || "false", on + " event");
              if (b == null) continue;
              St(t + " = if " + b + " { 1.0 } else { 0.0 }");
            } else St(t + " = " + ex(e.expr || "0", "n", on + " event"));
          }
          St("changed = true");
        }
      };
      const evBlock = (cond, on) => {
        if (!evs(on).length) return;
        iff(cond);
        actLines(on);
        close();
      };
      if (evs("enter").length || evs("leave").length) {
        evBlock("hovered && " + S("hot") + " == 0.0", "enter");
        evBlock("!hovered && " + S("hot") + " != 0.0", "leave");
        St(S("hot") + " = if hovered { 1.0 } else { 0.0 }");
      }
      evBlock("pressed_now", "press");
      evBlock("dragging", "drag");
      evBlock("clicked", "click");
      evBlock("released", "release");
      if (val && vd.src === "state") {
        const vs = def.state.find((s) => s.name === vd.state);
        if (vs) St(S("value") + " = " + S("s:" + vs.name));
        else warn("value state " + (vd.state || "(none)") + " is missing");
      }

      const D = new Out(false);
      const ELX = F("el", "x"), ELY = F("el", "y");
      const drawParts = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind === "widget" || pt.kind === "hit") continue;
          const where = (k) => (pt.name || pt.kind) + " " + k;
          const N2 = (k) => ex(pt.f[k], "n", where(k));
          const Cc = (k) => ex(pt.f[k], "c", where(k));
          const X0 = (k) => plus(bx, par(N2(k)));
          const Y0 = (k) => plus(by, par(N2(k)));
          const lines = [];
          const cl = (name, args) => lines.push("c." + name + "(" + args.join(", ") + ");");
          switch (pt.kind) {
            case "rect": cl("rect", [X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")]); break;
            case "rrect": cl("rrect", [X0("x"), Y0("y"), N2("w"), N2("h"), "(" + [N2("tl"), N2("tr"), N2("br"), N2("bl")].join(", ") + ")", Cc("color")]); break;
            case "frame": cl("frame", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")]); break;
            case "line": cl("line", [X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")]); break;
            case "circle": cl("circle", [X0("cx"), Y0("cy"), N2("r"), Cc("color")]); break;
            case "ring": cl("ring", [X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")]); break;
            case "arc": cl("arc", [X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")]); break;
            case "poly": {
              const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
              if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
                warn(where("points") + ": needs 3 or more x,y pairs", pt.id);
                break;
              }
              const vs = pts.map((xy) => "(" + plus(bx, par(ex(xy[0], "n", where("points")))) + ", " + plus(by, par(ex(xy[1], "n", where("points")))) + ")");
              lines.push("c.poly(&[" + vs.join(", ") + "], " + Cc("color") + ");");
              break;
            }
            case "grad": cl("rrect_grad", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), Cc("from"), Cc("to"), pt.f.sideways ? "true" : "false"]); break;
            case "shadow": cl("shadow", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")]); break;
            case "text": {
              const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
              let tx;
              if (m) {
                const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
                if (!pr) {
                  warn(where("text") + ": no text param called " + m[1], pt.id);
                  tx = q("");
                } else tx = pn(pr.name);
              } else tx = q(pt.f.text || "");
              cl("font_text", ["None", N2("size"), X0("x"), Y0("y"), tx, Cc("color")]);
              break;
            }
            case "bitmap": {
              const bm = bms.find((x) => x.pt === pt);
              const tint = pt.f.tint === "" || pt.f.tint == null ? hx(0xFFFFFFFF) : Cc("tint");
              lines.push("if let Some(bm) = " + bmName.get(bm.b.id) + " {");
              lines.push("    c.bitmap(" + ["bm", X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), tint].join(", ") + ");");
              lines.push("}");
              break;
            }
            case "group": {
              const b = groupBase.get(pt.id);
              const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
              if (pt.f.clip) lines.push("c.clip_push(" + [ax, ay, N2("w"), N2("h")].join(", ") + ");");
              const keep = D.l.length, sd = D.d;
              D.d = 0;
              drawParts(pt.kids || [], ax, ay);
              const kid = D.l.splice(keep);
              D.d = sd;
              kid.forEach((l) => lines.push(l));
              if (pt.f.clip) lines.push("c.clip_pop();");
              break;
            }
          }
          if (!lines.length) continue;
          if (pt.show) {
            const b = exb(pt.show, (pt.name || pt.kind) + " show");
            if (b == null) continue;
            D.add("if " + b + " {");
            lines.forEach((l) => D.add("    " + l));
            D.add("}");
          } else lines.forEach((l) => D.add(l));
        }
      };
      drawParts(def.parts, ELX, ELY);
      if (D.l.length) {
        if (D.l.some((l) => /\bth\./.test(l))) St("let th = *ui.theme()");
        open("if let Some(mut c) = ui.canvas()");
        D.l.forEach((l) => o.add(l));
        close();
      }
      wout.l.forEach((l) => o.add(l));
      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = idc(w.name);
        St(v + " = " + (w.kind === "double" ? id : w.kind === "bool" || w.kind === "flag" ? "if " + id + " { 1.0 } else { 0.0 }" : id + " as f64"));
      });
      St("ui.pop_id()");
      const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]]));
      if (val) St("*value = " + S("value"));
      St("ui.store(id, " + N + ").copy_from_slice(&s)");
      A(bits.map((b) => (b[1] === 1 ? "i32::from(" + b[0] + ")" : "(i32::from(" + b[0] + ") << " + Math.log2(b[1]) + ")")).join(" | "));
      o.d--;
      A("}");
      o.l.forEach((l, i) => {
        const m = /^(\s*)let (\w+) = (ui\.custom\(.*)$/.exec(l);
        if (m && !o.l.some((x, j) => j !== i && new RegExp("\\b" + m[2] + "\\.").test(x))) o.l[i] = m[1] + m[3];
      });
      for (const k of flagsDecl) {
        const at = o.l.findIndex((l) => l.trim() === "let mut " + k + " = false;");
        if (at >= 0 && !o.l.some((l, i) => i !== at && new RegExp("\\b" + k + " (\\|=|=) ").test(l))) o.l[at] = o.l[at].replace("let mut ", "let ");
      }
      return o.text();
    }

    const SKIN_NAME = (k) => upper(k.replace(/^skin_/, ""));
    function themeParts(c) {
      const t = GM.applyQuick(GM.normTheme(c.project.theme));
      const T = [], U = [];
      const setT = (k, v) => T.push("t." + k + " = " + v + ";");
      const diff = (t0, base) => {
        for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
          const differs = GM.THEME_COLORS.includes(k) ? (t0[k] >>> 0) !== (base[k] >>> 0) : +t0[k] !== +base[k];
          if (differs) setT(k, fieldLit(k, t0[k]));
        }
      };
      const FS = { font_heading: "set_heading_font", font_mono: "set_mono_font", font_small: "set_small_font" };
      const fonts = () => {
        for (const k of GM.THEME_FONTS) {
          if (!t[k]) continue;
          U.push("if let Ok(font) = Font::system(Some(" + q(t[k]) + ")) {");
          U.push("    ui." + FS[k] + "(Some(&font));");
          U.push("}");
        }
      };
      if (t.quick) {
        const k = t.quick;
        T.push("t.set_made(" + [hx(k.accent), k.dark ? "true" : "false", fl(k.radius)].join(", ") + ");");
      } else {
        const pr = GM.presetOf(t);
        if (pr && pr.id !== "dark") {
          T.push("let _ = t.set_preset(goome::PRESET_" + GM.PRESET_ENUM[pr.id] + ");");
          diff(t, pr);
        } else {
          if (t.base === "light") T.push("t.set_light();");
          diff(t, GM.themeBase(t));
        }
      }
      fonts();
      const skins = GM.THEME_SKINS.concat(GM.EXTRA_SKINS.filter((k) => t[k]));
      for (const k of skins) {
        const sk = t[k];
        if (!sk) continue;
        const b = addBitmap(c, k, sk.file, sk.img);
        U.push("if let Some(bm) = &s." + b.field + " {");
        U.push("    ui.set_skin(goome::SKIN_" + SKIN_NAME(k) + ", Some(&Skin::new(bm, " + [sk.l, sk.t, sk.r, sk.b].map(fl).join(", ") + ")));");
        U.push("}");
      }
      for (const k of Object.keys(t.icons || {}).filter((k) => GM.ICON_NAMES.includes(k))) {
        const b = addBitmap(c, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
        U.push("ui.set_icon(goome::ICON_" + upper(k) + ", s." + b.field + ".as_ref());");
      }
      if (t.icon_tint) T.push("t.icon_tint = 1;");
      return { T, U };
    }

    function sectionThemes(c) {
      const L = [];
      for (const [id, f] of c.themeVars) {
        const t = GM.normTheme(GM.findTheme(c.project, id));
        const base = GM.themeBase(t);
        L.push("{", "    let mut t = *ui.theme();", t.base === "light" ? "    t.set_light();" : "    t.set_dark();");
        for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
          const differs = GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
          if (differs) L.push("    t." + k + " = " + fieldLit(k, t[k]) + ";");
        }
        if (GM.THEME_FONTS.some((k) => t[k])) c.warn("", "a style theme has its own fonts, the rust theme copy cant take them, the main fonts stay");
        L.push("    s." + f + " = t;", "}");
      }
      return L;
    }

    function configLines(c) {
      const cfg = GM.normConfig(c.project.config), def = GM.normConfig({});
      const t = GM.normTheme(c.project.theme);
      const C = [], L = [];
      for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) C.push("cfg." + k + " = " + (k === "scroll_lines" ? fl(cfg[k]) : ii(cfg[k])) + ";");
      for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) C.push("cfg." + k + " = " + cfg[k] + ";");
      for (const [k] of GM.CFG_CURSORS) if (cfg.cursor[k] !== def.cursor[k]) C.push("cfg.cursor[goome::CUR_" + upper(k) + " as usize] = goome::CURSOR_" + cfg.cursor[k] + ";");
      if (C.length) L.push("let cfg = ui.config();", ...C);
      if (cfg.mask !== def.mask) L.push("ui.set_mask(Some(" + q(cfg.mask) + "));");
      for (const [k] of GM.CFG_KEYS) {
        if (cfg.keys[k] === def.keys[k]) continue;
        L.push("let _ = ui.bind(goome::ACT_" + upper(k) + ", " + q(cfg.keys[k].trim()) + ");");
      }
      if (t.quick && t.quick.scale !== 1) L.push("ui.scale(" + fl(t.quick.scale) + ");");
      return L;
    }

    const B64_FN = [
      "fn from_base64(data: &str) -> Vec<u8> {",
      "    let mut out = Vec::with_capacity(data.len() / 4 * 3);",
      "    let (mut buf, mut bits) = (0u32, 0);",
      "    for ch in data.bytes() {",
      "        let v = match ch {",
      "            b'A'..=b'Z' => ch - b'A',",
      "            b'a'..=b'z' => ch - b'a' + 26,",
      "            b'0'..=b'9' => ch - b'0' + 52,",
      "            b'+' => 62,",
      "            b'/' => 63,",
      "            _ => continue,",
      "        };",
      "        buf = (buf << 6) | u32::from(v);",
      "        bits += 6;",
      "        if bits >= 8 {",
      "            bits -= 8;",
      "            out.push((buf >> bits) as u8);",
      "            buf &= (1 << bits) - 1;",
      "        }",
      "    }",
      "    out",
      "}",
    ];

    function semis(lines) {
      const stack = [];
      const out = lines.slice();
      for (let i = 0; i < out.length; i++) {
        const t = out[i].trim();
        if (/\{$/.test(t) && !/^\}/.test(t)) stack.push(/^if let Some\(mut ui\) =/.test(t) ? i : -1);
        else if (t === "}" || /^\}[ ;]/.test(t)) {
          const o = stack.pop();
          if (o >= 0 && t === "}" && (out[i + 1] || "").trim() === "}") out[i] += ";";
        } else if (/^\} else/.test(t)) stack.push(-1);
      }
      return out;
    }
    const stripStrings = (code) => code.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    const uses = (code, name) => new RegExp("\\b" + name + "\\b").test(code);

    function generate(project, warn) {
      const c = new Gen(project, warn);
      const taken = new Set([...c.nm.values(), ...c.vnm.values()]);
      RENAME = new Map();
      for (const v of taken) {
        if (!KW.has(v)) continue;
        let alt = v + "_v";
        while (taken.has(alt)) alt += "_";
        RENAME.set(v, alt);
      }
      prepass(c);
      const app = project.mode === "app";
      const out = new Out(false);
      out.d = 1;
      emitList(project.root, c, out, app ? "app" : "overlay");
      if (app && project.app.statusbar) out.add("ui.statusbar(" + textOf(c, project.app.status || "", "").code + ");");
      const hout = new Out(false);
      hout.d = 1;
      const hks = (project.hotkeys || []).filter((k) => k && k.combo);
      hks.forEach((k, i) => {
        const cond = "id == " + (i + 1);
        if (i) {
          hout.l[hout.l.length - 1] += " else if " + cond + " {";
          hout.d++;
          hout.marks.push(hout.l.length);
        } else hout.open("if " + cond);
        emitActions(c, hout, k.actions, "hotkey " + k.combo);
        hout.close();
      });
      const els = [];
      for (const info of c.used.values()) els.push(elementCode(c, info));
      const th = themeParts(c);
      const cl = configLines(c);
      const sec = sectionThemes(c);

      for (const b of c.bitmaps.values()) {
        const init = b.b64 ? "Bitmap::from_bytes(&from_base64(" + q(b.b64) + ")).ok()" : "Bitmap::load(" + q(b.file) + ").ok()";
        c.fields.push({ name: b.field, type: "Option<Bitmap>", init });
      }
      const needB64 = [...c.bitmaps.values()].some((b) => b.b64);

      const drawBody = out.l.join("\n");
      const hotBody = hout.l.join("\n");
      const readers = [drawBody, hotBody, th.U.join("\n")].concat(els).join("\n");
      const unread = c.fields.some((f) => !new RegExp("\\bs\\." + f.name + "\\b").test(readers));

      const L = [];
      if (c.consts.length) L.push(...c.consts, "");
      if (unread) L.push("#[allow(dead_code)]");
      if (c.fields.length) L.push("struct State {", ...c.fields.map((f) => "    " + f.name + ": " + f.type + ","), "}", "");
      else L.push("struct State {}", "");
      if (needB64) L.push(...B64_FN, "");
      for (const f of c.fns) {
        const nm = fnName(f);
        if (c.calls.has(nm)) L.push("fn " + nm + "() {}", "");
      }
      els.forEach((b) => L.push(b, ""));
      if (th.T.length || th.U.length) {
        const usesS = th.U.some((l) => /\bs\./.test(l));
        L.push("fn set_theme(ui: &mut Ui, " + (usesS ? "s" : "_s") + ": &State) {");
        if (th.T.length) L.push("    let t = ui.theme();", ...th.T.map((l) => "    " + l));
        th.U.forEach((l) => L.push("    " + l));
        L.push("}", "");
      }
      if (cl.length) L.push("fn set_config(ui: &mut Ui) {", ...cl.map((l) => "    " + l), "}", "");
      const plain = (code) => stripStrings(code);
      const dbody = plain(drawBody);
      L.push("fn draw(" + (/\bui\b/.test(dbody) ? "ui" : "_ui") + ": &mut Ui, " + (/\bs\b/.test(dbody) ? "s" : "_s") + ": &mut State) {", ...out.l, "}", "");
      if (hks.length) {
        const hs = plain(hotBody);
        L.push("fn on_hotkey(" + (/\bui\b/.test(hs) ? "ui" : "_ui") + ": &mut Ui, " + (/\bs\b/.test(hs) ? "s" : "_s") + ": &mut State, id: i32) {", ...hout.l, "}", "");
      }

      const stateLit = c.fields.length ? ["    let mut s = State {", ...c.fields.map((f) => "        " + f.name + ": " + f.init + ","), "    };"] : ["    let mut s = State {};"];
      const setup = (ui, uiMut) => {
        const r = [];
        if (th.T.length || th.U.length) r.push("    set_theme(" + uiMut + ", &s);");
        if (cl.length) r.push("    set_config(" + uiMut + ");");
        sec.forEach((l) => r.push("    " + l));
        hks.forEach((k, i) => {
          r.push("    if let Err(e) = " + ui + ".hotkey(" + q(k.combo) + ", " + (i + 1) + ") {", "        eprintln!(" + q(esc("couldnt grab " + k.combo) + ": {}") + ", e);", "    }");
        });
        return r;
      };
      L.push("fn main() {");
      if (app) {
        const t = q(project.title);
        const w = project.app.w | 0, h = project.app.h | 0;
        if (project.app.titlebar) {
          L.push("    let opened = Options::new()", "        .title(" + t + ")", "        .mode(goome::MODE_WINDOW)", "        .size(" + w + ", " + h + ")",
            "        .window_flags(goome::WINDOW_RESIZABLE | goome::WINDOW_BORDERLESS | goome::WINDOW_TRANSPARENT | goome::WINDOW_CENTER)", "        .open()", "        .and_then(|g| App::from_goome(g, " + t + "));");
        } else L.push("    let opened = App::new(" + t + ", " + w + ", " + h + ");");
        L.push("    let mut app = match opened {", "        Ok(app) => app,", "        Err(e) => {", '            eprintln!("cant open a window: {}", e);', "            std::process::exit(1);", "        }", "    };");
        const af = flags(AFLAGS, project.app);
        if (af !== "0") L.push("    app.flags = " + af + ";");
        L.push(...stateLit);
        const su = setup("app.ui()", "app.ui()");
        if (sec.length) su.splice(su.findIndex((l) => l === "    " + sec[0]), 0, "    let ui = app.ui();");
        L.push(...su);
        L.push("    while let Some(mut f) = app.frame() {");
        if (hks.length) L.push("        let hits: Vec<i32> = f.events().iter().filter(|e| e.kind == goome::HOTKEY).map(|e| e.id).collect();", "        for id in hits {", "            on_hotkey(&mut f, &mut s, id);", "        }");
        L.push("        draw(&mut f, &mut s);", "    }");
      } else {
        L.push("    let mut ui = match Options::new().title(" + q(project.title) + ").no_capture(true).open().and_then(|g| g.ui()) {", "        Ok(ui) => ui,", "        Err(e) => {", '            eprintln!("cant open an overlay: {}", e);', "            std::process::exit(1);", "        }", "    };");
        L.push(...stateLit, ...setup("ui", "&mut ui"));
        L.push('    let test = ui.backend_name().starts_with("test");', "    let mut pace = Pacer::new(60);", "    let mut dirty = true;", "    loop {",
          "        let wait = if dirty || test || ui.animating() { pace.wait() } else { 500 };", "        let mut quit = false;", "        for ev in ui.pump(wait) {", "            if ev.kind == goome::QUIT || ev.kind == goome::CLOSE {", "                quit = true;", "            }");
        if (hks.length) L.push("            if ev.kind == goome::HOTKEY {", "                on_hotkey(&mut ui, &mut s, ev.id);", "            }");
        L.push("            dirty = true;", "        }", "        if quit {", "            break;", "        }", "        if !(dirty || test || ui.animating()) {", "            continue;", "        }", "        dirty = false;", "        if let Some(mut f) = ui.begin(0) {", "            draw(&mut f, &mut s);", "        }", "    }");
      }
      L.push("}", "");
      const unusedConst = (l) => {
        const m = /^const ([A-Z0-9_]+):/.exec(l);
        return m && L.join("\n").split(new RegExp("\\b" + m[1] + "\\b")).length < 3;
      };
      const text = semis(L).flatMap((l) => (unusedConst(l) ? ["#[allow(dead_code)]", l] : [l])).join("\n");
      const bare = plain(text).replace(/goome::\w+/g, "");
      const imports = ["App", "Bitmap", "Draw", "Font", "Options", "Pacer", "Skin", "Theme", "Ui", "WindowState"].filter((n) => (n === "Draw" || uses(bare, n)) && (n !== "Draw" || /ui\.canvas\(\)/.test(bare)));
      const code = "use goome::{" + imports.join(", ") + "};\n\n" + text;
      return { code: finish(code.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n"), "rust", project), files: [...c.files], file: "main.rs" };
    }

    X.langs.rust = {
      label: "Rust",
      ext: ".rs",
      generate,
      hint: () => 'cargo new ui, put goome = { git = "https://github.com/goome-ui/rust-goome", tag = "v0.5.3" } under [dependencies] in Cargo.toml (rust 1.77+ and a C compiler), paste this over src/main.rs, cargo run',
    };
  })();

  (() => {
    const { GM, camel, pascal, cut, strq, num, floats, Out, names, WFLAGS, EFLAGS, TFLAGS, AFLAGS, IFLAGS, finish } = X.H;

    const JS_BAD = new Set(("break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield " +
      "let static implements interface package private protected public await async arguments eval undefined NaN Infinity require module exports process console globalThis goome Math Number String Array Object Boolean Buffer JSON Float32Array Float64Array Uint32Array __filename __dirname").split(" "));
    const FIXED = "ui g G app main draw onHotkey setTheme setConfig loadBitmap loadBitmapData placeholder hotkeys grabHotkeys running dirty test pace ev th c el o s sid init".split(" ");
    const ELOCALS = new Set("ui sid init s c o el box rs ox oy th value changed hovered pressed dragging clicked released pressedNow dragend nx ny i j".split(" "));

    const safe = (v) => (JS_BAD.has(v) ? v + "V" : v);
    const cc = (s) => safe(camel(s));
    const hex = (v) => "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const q = (s) => strq(s, "js");
    const isRoot = (pt) => pt === "overlay" || pt === "app";

    const wrapped = (e) => {
      if (e[0] !== "(" || e[e.length - 1] !== ")") return false;
      let d = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] === "(") d++;
        else if (e[i] === ")") d--;
        if (d === 0 && i < e.length - 1) return false;
      }
      return true;
    };
    const callShaped = (e) => {
      const m = /^[\w.]+\(/.exec(e);
      if (!m) return false;
      let d = 0;
      for (let i = m[0].length - 1; i < e.length; i++) {
        if (e[i] === "(") d++;
        else if (e[i] === ")") d--;
        if (d === 0) return i === e.length - 1;
      }
      return false;
    };
    const unwrap = (e) => (wrapped(e) ? e.slice(1, -1) : e);
    const par = (e) => (/^-?[\w.]+(\[\d+\])*$/.test(e) || wrapped(e) || callShaped(e) ? e : "(" + e + ")");
    const plus = (a, b) => (a === "0" ? b : b === "0" ? a : a + " + " + b);
    const minus = (a, b) => (b === "0" ? a : a + " - " + par(b));
    const neg = (e) => (e === "0" ? "0" : "-" + par(e));
    const flagsOf = (table, p) => {
      const on = table.filter((f) => p[f[0]]).map((f) => f[3]);
      return on.length ? on.join(" | ") : "0";
    };
    const litOf = (type, v) => (type === "color" ? hex(v) : type === "bool" ? (v ? "true" : "false") : type === "text" ? q(v == null ? "" : v) : num(v));
    const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");

    const PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
    const FN = { min: "Math.min", max: "Math.max", abs: "Math.abs" };
    function writeExpr(a, map, types) {
      const tyOf = (x) => {
        try {
          return GM.expr.type(x, types);
        } catch (e) {
          return "n";
        }
      };
      const asBool = (x) => {
        const s = go(x, 0);
        if (tyOf(x) !== "b") return par(s) + " !== 0";
        return x.t === "id" && wrapped(s) ? s.slice(1, -1) : s;
      };
      const go = (x, outer) => {
        switch (x.t) {
          case "num": return num(x.v);
          case "hex": return hex(x.v);
          case "bool": return x.v ? "true" : "false";
          case "th": return map.th(x.f);
          case "id": return map.id(x.name);
          case "call": return FN[x.fn] + "(" + x.args.map((y) => go(y, 0)).join(", ") + ")";
          case "un": {
            if (x.op === "-") {
              const s = go(x.a, 7);
              return s[0] === "-" ? "-(" + s + ")" : "-" + s;
            }
            return tyOf(x.a) === "b" ? "!" + go(x.a, 7) : "(" + par(go(x.a, 0)) + " === 0)";
          }
          case "tern": return "(" + asBool(x.c) + " ? " + go(x.a, 0) + " : " + go(x.b, 0) + ")";
          case "bin": {
            const p = PREC[x.op];
            let op = x.op, l, r;
            if (op === "&&" || op === "||") {
              l = asBool(x.a);
              r = asBool(x.b);
            } else {
              l = go(x.a, p);
              r = go(x.b, p + 1);
              if (op === "==") op = "===";
              else if (op === "!=") op = "!==";
            }
            const s = l + " " + op + " " + r;
            return p < outer ? "(" + s + ")" : s;
          }
        }
        return "0";
      };
      return go(a, 0);
    }

    class Ctx {
      constructor(project, warn) {
        this.project = project;
        this.warn = warn;
        this.nm = names(project);
        this.vnm = this.nm.vnm;
        this.uniq = (b) => this.nm.take(b);
        this.top = [];
        this.consts = [];
        this.need = {};
        this.files = new Set();
        this.scope = null;
        this.defs = new Map((project.elements || []).map((d) => [d.id, d]));
        this.used = new Map();
        this.k = 0;
        this.taken = new Set(FIXED);
        this.ids = new Map();
      }

      gid(name, kind) {
        const key = (kind || "") + ":" + name;
        if (this.ids.has(key)) return this.ids.get(key);
        const base = cc(name);
        let v = base, i = 2;
        while (this.taken.has(v)) v = base + i++;
        this.taken.add(v);
        this.ids.set(key, v);
        return v;
      }

      v(name) {
        if (this.scope) return this.scope.alias[name] || cc(name);
        return this.gid(name);
      }

      decl(kind, name, val, extra) {
        const sc = this.scope;
        if (sc) {
          if (kind === "floats") {
            const top = sc.prefix + "_" + name;
            const id = this.gid(top);
            sc.alias[name] = id;
            this.consts.push("const " + id + " = [" + val.map(num).join(", ") + "];");
            return;
          }
          sc.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" || kind === "flag" ? (val ? 1 : 0) : +val || 0 });
          return;
        }
        const id = this.gid(name);
        if (kind === "flag") this.top.push("const " + id + " = new goome.Flag(" + (val ? "true" : "false") + ");");
        else if (kind === "floats") this.top.push("const " + id + " = [" + val.map(num).join(", ") + "];");
        else {
          const lit = kind === "color" ? hex(val) : kind === "double" ? num(val) : kind === "int" ? String(val | 0) : kind === "str" ? q(cut(val, Math.max(2, extra | 0) - 1)) : val ? "true" : "false";
          this.top.push("let " + id + " = " + lit + ";");
        }
      }

      constArr(name, items) {
        if (this.scope) name = this.scope.prefix + "_" + name;
        const id = this.gid(name);
        this.consts.push("const " + id + " = [" + items.map(q).join(", ") + "];");
        return id;
      }
    }

    const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };
    const FLAGGY = { tree: 1, modal: 1, menu_item: 1 };
    const NEWF = new Set(GM.THEME_AUTO_COLORS.concat(GM.THEME_NEW_SIZES, GM.THEME_FONTS));
    const SFIELDS = GM.THEME_COLORS.concat(GM.THEME_SIZES);

    function prepass(ctx) {
      const pj = ctx.project;
      ctx.refs = new Map();
      ctx.vars = new Map();
      ctx.targets = new Set();
      ctx.fns = [];
      const flagVars = new Set();
      const note = (a) => {
        if (!a) return;
        if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) ctx.targets.add(a.target);
        if (a.do === "call" && a.fn) {
          const f = GM.ident(a.fn, "on_click");
          if (!ctx.fns.includes(f)) ctx.fns.push(f);
        }
      };
      GM.walk(pj.root, (n) => {
        if (n.p && n.p.bind && FLAGGY[n.type]) flagVars.add(n.p.bind);
        const on = n.on || {};
        for (const e in on) for (const a of on[e] || []) note(a);
      });
      for (const hk of pj.hotkeys || []) for (const a of hk.actions || []) note(a);
      const caps = {};
      GM.walk(pj.root, (n) => {
        if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
      });
      for (const v of pj.vars || []) {
        const name = ctx.vnm.get(v.id);
        const flag = v.type === "bool" && flagVars.has(v.id);
        const id = ctx.gid(name);
        const r = { name, code: id + (flag ? ".value" : ""), obj: id, type: v.type, flag, v, cap: Math.max(256, caps[v.id] || 0) };
        ctx.vars.set(v.id, r);
        ctx.refs.set(v.name, r);
        declVar(ctx, r);
      }
      GM.walk(pj.root, (n) => {
        if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || ctx.refs.has(n.p.var)) return;
        const nm = ctx.nm.get(n.id);
        if (!nm) return;
        const id = ctx.gid(nm);
        ctx.refs.set(n.p.var, { name: nm, code: id + (FLAGGY[n.type] ? ".value" : ""), type: OWN_T[n.type] });
      });
    }

    function declVar(ctx, r) {
      const v = r.v, d = v.def;
      if (v.type === "list") {
        const items = GM.lines(d);
        ctx.top.push("const " + ctx.gid(r.name) + " = [" + items.map(q).join(", ") + "];");
        return;
      }
      const kind = { bool: r.flag ? "flag" : "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
      const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? +d >>> 0 : v.type === "bool" ? !!d : +d || 0;
      const save = ctx.scope;
      ctx.scope = null;
      ctx.decl(kind, r.name, val, r.cap);
      ctx.scope = save;
    }

    function listInfo(ctx, n) {
      const p = n.p;
      if (p.itemsVar) {
        const r = ctx.vars.get(p.itemsVar);
        if (r && r.type === "list") return { arr: r.code, len: r.code + ".length", items: GM.lines(r.v.def), dyn: true };
        ctx.warn(n.id, "the items list var is gone or isnt a list, using the typed items");
      }
      return null;
    }

    const thCode = (f) => "ui.theme." + camel(f);

    function exprCode(ctx, src, want, where, id) {
      const types = GM.layoutIdents(ctx.project);
      const r = GM.expr.check(src, types, want);
      if (!r.ok) {
        ctx.warn(id || "", where + ": " + r.err);
        return null;
      }
      const map = {
        id: (name) => {
          const ref = ctx.refs.get(name);
          return ref ? ref.code : cc(name);
        },
        th: thCode,
      };
      let s = writeExpr(r.ast, map, types);
      if (want === "b" && r.type !== "b") s = par(s) + " !== 0";
      return s;
    }

    const tq = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${").replace(/\r/g, "").replace(/\n/g, "\\n").replace(/\t/g, "\\t");

    function textCode(ctx, text, opts) {
      const parts = GM.interp(text);
      const vars = parts.filter((x) => x.v && ctx.refs.has(x.v));
      for (const x of parts) if (x.v && !ctx.refs.has(x.v)) ctx.warn((opts && opts.id) || "", "theres no var called " + x.v + " for {" + x.v + "}");
      if (!vars.length) return { code: q(text), dyn: false };
      const segs = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        let lit = null, e = null;
        if (!r) lit = x.t != null ? x.t : "{" + x.v + "}";
        else if (r.type === "color") lit = "#", e = r.code + '.toString(16).toUpperCase().padStart(8, "0")';
        else if (r.type === "float") e = "+" + par(r.code) + ".toPrecision(6)";
        else if (r.type === "list") e = r.code + "[0]";
        else e = r.code;
        if (lit != null) {
          if (segs.length && segs[segs.length - 1].lit != null) segs[segs.length - 1].lit += lit;
          else segs.push({ lit });
        }
        if (e != null) segs.push({ e });
      }
      return { code: "`" + segs.map((x) => (x.lit != null ? tq(x.lit) : "${" + x.e + "}")).join("") + "`", dyn: true };
    }

    function emitActions(ctx, out, list, where) {
      const St = (s) => out.add(s + ";");
      const idx = GM.index(ctx.project);
      for (const a of list || []) {
        if (!a || !a.do) continue;
        const refOf = (name) => {
          const r = ctx.refs.get(name);
          if (!r) ctx.warn("", where + ": theres no var called " + (name || "(none)"));
          return r;
        };
        switch (a.do) {
          case "set": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type === "string") {
              St(r.code + " = " + textCode(ctx, a.value || "", {}).code);
              break;
            }
            if (r.type === "list") {
              ctx.warn("", where + ": cant set a list var, its fixed");
              break;
            }
            const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
            let e = exprCode(ctx, a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want, where);
            if (e == null) break;
            if (r.type === "int") e = "Math.trunc(" + e + ")";
            St(r.code + " = " + e);
            break;
          }
          case "toggle": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "bool") {
              ctx.warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
              break;
            }
            St(r.code + " = !" + r.code);
            break;
          }
          case "add":
          case "sub": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "int" && r.type !== "float") {
              ctx.warn("", where + ": add/sub needs a number var");
              break;
            }
            const e = exprCode(ctx, a.value === "" || a.value == null ? "1" : a.value, "n", where);
            if (e == null) break;
            const clamp = r.v && +r.v.max > +r.v.min;
            const whole = /^\d+$/.test(e);
            if (!clamp && (r.type === "float" || whole)) {
              St(r.code + (a.do === "add" ? " += " : " -= ") + e);
              break;
            }
            let v = r.code + (a.do === "add" ? " + " : " - ") + par(e);
            if (clamp) v = "Math.max(" + num(r.v.min) + ", Math.min(" + num(r.v.max) + ", " + v + "))";
            if (r.type === "int" && !whole) v = "Math.trunc(" + v + ")";
            St(r.code + " = " + v);
            break;
          }
          case "open":
          case "close": {
            const t = idx.get(a.target);
            if (!t) {
              ctx.warn("", where + ": the " + a.do + " target is gone");
              break;
            }
            const on = a.do === "open";
            const tn = t.n;
            if (tn.type === "popup") St(on ? "ui.popupOpen(" + q(tn.p.label || "popup") + ")" : "ui.popupClose()");
            else if (tn.type === "window" || tn.type === "modal") St(openRef(ctx, tn) + " = " + (on ? "true" : "false"));
            else ctx.warn("", where + ": can only open or close a window, modal or popup");
            break;
          }
          case "toast": {
            const t = textCode(ctx, a.text || "", {});
            St("ui.toast(" + t.code + ", " + (+a.ms > 0 ? a.ms | 0 : 2500) + ")");
            break;
          }
          case "tab": {
            const t = idx.get(a.target);
            if (!t || t.n.type !== "tabs") {
              ctx.warn("", where + ": the tab target has to be a tabs node");
              break;
            }
            const r = t.n.p.bind ? ctx.vars.get(t.n.p.bind) : ctx.refs.get(t.n.p.var);
            if (!r) break;
            St(r.code + " = " + (a.tab | 0));
            break;
          }
          case "copy": {
            const t = textCode(ctx, a.text || "", {});
            St("G.setClipboard(" + t.code + ")");
            ctx.need.g = true;
            break;
          }
          case "quit":
            St("G.push(goome.CLOSE)");
            ctx.need.g = true;
            break;
          case "call":
            St(ctx.gid(GM.ident(a.fn, "on_click"), "fn") + "()");
            break;
          default:
            ctx.warn("", where + ": dont know the action " + a.do);
        }
      }
    }

    function openRef(ctx, n) {
      if (n.p.bind) {
        const r = ctx.vars.get(n.p.bind);
        if (r) return r.code;
      }
      const nm = ctx.nm.get(n.id) || GM.ident(n.p.var || n.type);
      return ctx.gid(nm) + (n.type === "window" ? ".open" : ".value");
    }

    function styleArgs(ctx, st) {
      const f = {};
      const th = st.theme ? GM.findTheme(ctx.project, st.theme) : null;
      if (st.theme && !th) ctx.warn("", "a style uses a theme that is gone: " + st.theme);
      if (th) {
        const t = GM.normTheme(th);
        SFIELDS.forEach((k) => {
          if (!NEWF.has(k) || +t[k] !== +GM.THEME_REST[k]) f[k] = t[k];
        });
      }
      for (const k of GM.THEME_COLORS) if (st.c && st.c[k] != null) f[k] = st.c[k];
      for (const k of GM.THEME_SIZES) if (st.n && st.n[k] != null) f[k] = st.n[k];
      const out = [];
      for (const k of SFIELDS) if (k in f) out.push(camel(k) + ": " + fieldLit(k, f[k]));
      if (Array.isArray(st.radii) && st.radii.length === 4) out.push("radii: [" + st.radii.map(num).join(", ") + "]");
      return out;
    }

    function styled(ctx, out, st, body) {
      if (!GM.styleCount(st)) return body();
      const args = styleArgs(ctx, st);
      if (!args.length) return body();
      out.open("ui.style({ " + args.join(", ") + " }, () =>");
      body();
      out.close(");");
    }

    function emitList(list, ctx, out, ptype) {
      for (const n of list) emitNode(n, ctx, out, ptype);
    }
    function emitSlot(n, s, ctx, out, ptype) {
      const st = n.slotStyle && n.slotStyle[String(s)];
      styled(ctx, out, st, () => emitList(n.kids[s] || [], ctx, out, ptype));
    }

    function emitNode(n, ctx, out, ptype) {
      const go = () => styled(ctx, out, n.style, () => emitEnabled(n, ctx, out, ptype));
      if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
        const e = exprCode(ctx, n.p.showIf, "b", "show if", n.id);
        if (e != null) {
          out.open("if (" + unwrap(e) + ")");
          go();
          out.close();
          return;
        }
      }
      go();
    }

    const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };
    function emitEnabled(n, ctx, out, ptype) {
      const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
      if (!src) return emitBare(n, ctx, out, ptype, null);
      const e = exprCode(ctx, src, "b", "enable if", n.id);
      if (e == null) return emitBare(n, ctx, out, ptype, null);
      const en = "en" + ++ctx.k;
      out.add("const " + en + " = " + e + ";");
      out.open("if (!" + en + ")");
      out.add("ui.pushColor(goome.S_TEXT, ui.theme.textDim);");
      out.add("ui.pushColor(goome.S_ACCENT, ((ui.theme.accent & 0xFFFFFF) | ((ui.theme.accent >>> 25) << 24)) >>> 0);");
      out.close();
      let saved = null;
      if (VALUE_T[n.type]) {
        const r = bareRef(ctx, n);
        if (r) {
          const w = "was" + ctx.k;
          saved = { r, w };
          out.add("const " + w + " = " + r.code + ";");
        }
      }
      emitBare(n, ctx, out, ptype, en);
      out.open("if (!" + en + ")");
      if (saved) out.add(saved.r.code + " = " + saved.w + ";");
      out.add("ui.pop(2);");
      out.close();
    }

    function bareRef(ctx, n) {
      if (n.p.bind) return ctx.vars.get(n.p.bind) || null;
      if (!OWN_T[n.type]) return null;
      const nm = ctx.nm.get(n.id);
      if (!nm) return null;
      if (ctx.scope) return { name: nm, code: ctx.v(nm), type: OWN_T[n.type] };
      return { name: nm, code: ctx.gid(nm) + (FLAGGY[n.type] ? ".value" : ""), type: OWN_T[n.type] };
    }

    function emitBare(n, ctx, out, ptype, en) {
      const p = n.p || {};
      const st = (s) => out.add(s + ";");
      const call = (fn, args) => "ui." + fn + "(" + args.join(", ") + ")";
      const nm = ctx.nm.get(n.id) || GM.ident(p.var || n.type);
      if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
        ctx.warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
        return;
      }
      const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
      if (leaf && +p.width > 0) st(call("width", [num(p.width)]));
      if (n.abs && !isRoot(ptype)) {
        st(call("pos", [num(n.abs.x), num(n.abs.y)]));
        if (+n.abs.w > 0 || +n.abs.h > 0) st(call("size", [num(+n.abs.w > 0 ? n.abs.w : 0), num(+n.abs.h > 0 ? n.abs.h : 0)]));
      }
      const on = n.on || {};
      const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
      const where = (e) => (p.label || n.type) + " " + e;
      const ifActs = (cond, fill) => {
        out.open("if (" + unwrap(cond) + ")");
        fill();
        out.close();
      };
      const andEn = (cond) => (en ? cond + " && " + en : cond);
      const bound = (types) => {
        if (!p.bind) return null;
        const r = ctx.vars.get(p.bind);
        if (!r) {
          ctx.warn(n.id, "the bound var is gone, using its own var");
          return null;
        }
        if (ctx.scope) {
          ctx.warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
          return null;
        }
        if (types && !types.includes(r.type)) {
          ctx.warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
          return null;
        }
        return r;
      };
      const own = (kind, val, extra) => {
        ctx.decl(kind, nm, val, extra);
        const id = ctx.v(nm);
        return { name: nm, code: id + (kind === "flag" && !ctx.scope ? ".value" : ""), obj: id, type: kind };
      };
      const changeEvents = () => has("change") || has("on") || has("off");
      const fireChange = (ref) => {
        if (has("change")) emitActions(ctx, out, on.change, where("change"));
        if ((has("on") || has("off")) && ref) {
          if (has("on")) ifActs(ref.code, () => emitActions(ctx, out, on.on, where("on")));
          if (has("off")) ifActs("!" + ref.code, () => emitActions(ctx, out, on.off, where("off")));
        }
      };
      const afterChange = (ref, cond) => {
        if (changeEvents()) ifActs(andEn(cond || "ui.changed"), () => fireChange(ref));
      };
      const valueWidget = (stmt, ref) => {
        st(stmt);
        afterChange(ref);
      };
      const hover = () => {
        if (!has("hover")) return;
        const hv = ctx.gid(ctx.uniq(nm + "_hot"));
        ctx.top.push("let " + hv + " = false;");
        const h = "h" + ++ctx.k;
        out.add("const " + h + " = ui.hovered;");
        ifActs(h + " && !" + hv, () => emitActions(ctx, out, on.hover, where("hover")));
        out.add(hv + " = " + h + ";");
      };
      const tooltip = () => {
        if (leaf && p.tooltip) st(call("tooltip", [q(p.tooltip)]));
      };
      const label = (txt) => textCode(ctx, txt == null ? "" : txt, { id: n.id }).code;
      const elseIf = (cond, first) => {
        if (first) out.open("if (" + cond + ")");
        else {
          out.l[out.l.length - 1] += " else if (" + cond + ") {";
          out.d++;
          out.marks.push(out.l.length);
        }
      };

      switch (n.type) {
        case "window": {
          if (ctx.scope) return ctx.warn(n.id, "windows cant go inside a custom element");
          const fl = flagsOf(WFLAGS, p);
          const b = bound(["bool"]);
          const needOpen = !!p.close || ctx.targets.has(n.id) || !!b;
          const title = label(p.label);
          const id = ctx.gid(nm);
          ctx.top.push("const " + id + " = { x: " + num(p.x) + ", y: " + num(p.y) + ", w: " + num(p.w) + ", h: " + num(p.h) + (needOpen ? ", open: true" : "") + " };");
          if (b) st(id + ".open = " + b.code);
          out.open("if (ui.window(" + title + ", " + id + ", " + fl + "))");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("ui.windowEnd()");
          if (b) st(b.code + " = " + id + ".open");
          return;
        }
        case "row": {
          const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
          if (k >= 2) st(call("row", [String(k)]));
          emitList(n.kids[0], ctx, out, "row");
          return;
        }
        case "same_line": return st(call("sameLine", []));
        case "space": return st(call("space", [num(p.px)]));
        case "separator": return st(call("separator", []));
        case "scroll": {
          st(call("scrollBegin", [q(nm), num(p.h)]));
          emitList(n.kids[0], ctx, out, "scroll");
          st(call("scrollEnd", []));
          return;
        }
        case "split": {
          const id = ctx.gid(nm);
          ctx.top.push("const " + id + " = new goome.Split(" + num(p.frac) + ", " + (p.vertical ? "true" : "false") + ");");
          st(call("split", [q(nm), id]));
          emitSlot(n, 0, ctx, out, "split");
          st(call("splitNext", []));
          emitSlot(n, 1, ctx, out, "split");
          st(call("splitEnd", []));
          return;
        }
        case "tabs": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          if (!items.length) items.push("Tab");
          const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
          const arr = li ? li.arr : ctx.constArr(nm + "_names", items);
          valueWidget(r.code + " = " + call("tabs", [q(nm), arr, r.code]), r);
          let first = true;
          const k = Math.max(items.length, n.kids.length);
          for (let i = 0; i < k; i++) {
            const kids = n.kids[i] || [];
            if (!kids.length) continue;
            elseIf(r.code + " === " + i, first);
            emitSlot(n, i, ctx, out, "tabs");
            out.close();
            first = false;
          }
          return;
        }
        case "collapsing": {
          const r = bound(["bool"]) || own("bool", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++ctx.k : null;
          if (ev) out.add("const " + w + " = " + r.code + ";");
          st(r.code + " = " + call("collapsing", [label(p.label), r.code]));
          if (ev) ifActs(andEn(r.code + " !== " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if (" + r.code + ")");
          emitList(n.kids[0], ctx, out, "collapsing");
          out.close();
          return;
        }
        case "tree": {
          const r = bound(["bool"]) || own("flag", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++ctx.k : null;
          if (ev) out.add("const " + w + " = " + r.code + ";");
          const tc = call("tree", [label(p.label), r.obj]);
          if (ev) {
            const sh = "open" + ++ctx.k;
            out.add("const " + sh + " = " + tc + ";");
            ifActs(andEn(r.code + " !== " + w), () => emitActions(ctx, out, on.change, where("change")));
            out.open("if (" + sh + ")");
          } else out.open("if (" + tc + ")");
          emitList(n.kids[0], ctx, out, "tree");
          st(call("treeEnd", []));
          out.close();
          return;
        }
        case "modal": {
          const r = bound(["bool"]) || own("flag", false);
          if (p.button) ifActs(call("button", [label(p.button)]), () => st(r.code + " = true"));
          out.open("if (" + call("modal", [label(p.label), r.obj]) + ")");
          emitList(n.kids[0], ctx, out, "modal");
          st(call("modalEnd", []));
          out.close();
          return;
        }
        case "popup": {
          const id = q(p.label || "popup");
          const b = bound(["bool"]);
          if (b) {
            ifActs(b.code, () => {
              st(call("popupOpen", [id]));
              st(b.code + " = false");
            });
          }
          out.open("if (" + call("popup", [id]) + ")");
          emitList(n.kids[0], ctx, out, "popup");
          st(call("popupEnd", []));
          out.close();
          return;
        }
        case "menubar":
        case "menu": {
          const mb = n.type === "menubar";
          out.open("if (" + (mb ? call("menubar", []) : call("menu", [label(p.label)])) + ")");
          emitList(n.kids[0], ctx, out, n.type);
          st(mb ? call("menubarEnd", []) : call("menuEnd", []));
          out.close();
          return;
        }
        case "menu_item": {
          const sc = p.shortcut ? q(p.shortcut) : "null";
          const b = p.check || p.bind ? bound(["bool"]) : null;
          if (p.check || b) {
            const r = b || own("flag", !!p.on);
            const cl = call("menuItem", [label(p.label), sc, r.obj]);
            if (has("click")) ifActs(andEn(cl), () => emitActions(ctx, out, on.click, where("click")));
            else st(cl);
          } else {
            const args = [label(p.label)].concat(p.shortcut ? [sc] : []);
            ifActs(andEn(call("menuItem", args)), () => {
              if (has("click")) emitActions(ctx, out, on.click, where("click"));
              else out.add("console.log(" + q(p.label + " clicked") + ");");
            });
          }
          return;
        }
        case "menu_sep": return st(call("menuSeparator", []));
        case "label":
          st(call("label", [label(p.label)]));
          hover();
          break;
        case "heading":
          st(call("heading", [label(p.label)]));
          hover();
          break;
        case "wrapped":
          st(call("wrapped", [label(p.label)]));
          break;
        case "button": {
          ifActs(andEn(call("button", [label(p.label)])), () => {
            if (has("click")) return emitActions(ctx, out, on.click, where("click"));
            if (p.action === "toast") st(call("toast", [label(p.toast), String(p.ms | 0)]));
            else if (p.action === "close") st(call("popupClose", []));
            else out.add("console.log(" + q(p.label + " clicked") + ");");
          });
          hover();
          break;
        }
        case "checkbox":
        case "toggle": {
          const r = bound(["bool"]) || own("bool", !!p.on);
          valueWidget(r.code + " = " + call(n.type, [label(p.label), r.code]), r);
          hover();
          break;
        }
        case "radio": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const ev = changeEvents();
          const ch = ev ? "ch" + ++ctx.k : null;
          if (ev) out.add("let " + ch + " = false;");
          const one = (lab, i) => {
            st(r.code + " = " + call("radio", [lab, r.code, i]));
            if (ev) st(ch + " = " + ch + " || ui.changed");
          };
          if (li) {
            out.open("for (let i = 0; i < " + li.len + "; i++)");
            if (p.inline) ifActs("i > 0", () => st(call("sameLine", [])));
            one(li.arr + "[i]", "i");
            out.close();
          } else {
            items.forEach((it, i) => {
              if (i && p.inline) st(call("sameLine", []));
              one(q(it), i);
            });
          }
          if (ev) ifActs(andEn(ch), () => fireChange(r));
          break;
        }
        case "slider": {
          const b = bound(["float", "int"]);
          if (b && b.type === "int") {
            valueWidget(b.code + " = " + call("sliderInt", [label(p.label), b.code, Math.round(p.min), Math.round(p.max)]), b);
          } else {
            const r = b || own("double", +p.value || 0);
            const args = [label(p.label), r.code, num(p.min), num(p.max)];
            if (p.fmt) args.push(q(p.fmt));
            valueWidget(r.code + " = " + call("slider", args), r);
          }
          hover();
          break;
        }
        case "slider_int": {
          const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
          valueWidget(r.code + " = " + call("sliderInt", [label(p.label), r.code, Math.round(p.min), Math.round(p.max)]), r);
          hover();
          break;
        }
        case "input": {
          const cap = Math.max(2, p.cap | 0 || 64);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
          const capS = String(b ? b.cap : cap);
          if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint) {
            valueWidget(r.code + " = " + call("input", [label(p.label), r.code, capS]), r);
            hover();
            break;
          }
          const hint = p.hint ? q(p.hint) : "null";
          st(r.code + " = " + call("inputEx", [label(p.label), r.code, flagsOf(IFLAGS, fp), hint, capS]));
          afterChange(r, fp.enter ? "ui.changed && !ui.entered" : null);
          if (has("enter")) ifActs(andEn("ui.entered"), () => emitActions(ctx, out, on.enter, where("enter")));
          hover();
          break;
        }
        case "text_edit": {
          const cap = Math.max(2, p.cap | 0 || 4096);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          valueWidget(r.code + " = " + call("textEdit", [q(nm), r.code, num(p.h), flagsOf(EFLAGS, p), b ? b.cap : cap]), r);
          break;
        }
        case "combo": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : [""]);
          valueWidget(r.code + " = " + call("combo", [label(p.label), r.code, arr]), r);
          hover();
          break;
        }
        case "selectable": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : ["Item"]);
          const len = li ? li.len : arr + ".length";
          const ev = changeEvents();
          out.open("for (let i = 0; i < " + len + "; i++)");
          ifActs(call("selectable", [arr + "[i]", r.code + " === i"]), () => {
            st(r.code + " = i");
            if (ev && en) ifActs(en, () => fireChange(r));
            else if (ev) fireChange(r);
          });
          out.close();
          break;
        }
        case "color": {
          const r = bound(["color"]) || own("color", p.color >>> 0);
          valueWidget(r.code + " = " + call("color", [label(p.label), r.code]), r);
          hover();
          break;
        }
        case "progress": {
          const b = bound(["float", "int"]);
          let val = num(p.value);
          if (b) {
            const lo = +b.v.min, hi = +b.v.max;
            val = hi > lo && !(lo === 0 && hi === 1) ? (lo ? par(minus(b.code, num(lo))) : b.code) + " / " + num(hi - lo) : b.code;
          }
          st(call("progress", p.label ? [val, label(p.label)] : [val]));
          hover();
          break;
        }
        case "table":
        case "plot_lines":
        case "plot_bars":
        case "image": {
          emitData(n, ctx, out, nm);
          if (n.type === "image") hover();
          break;
        }
        case "el": {
          emitInstance(n, ctx, out, ptype);
          return;
        }
        default:
          ctx.warn(n.id, "dont know how to export " + n.type);
          return;
      }
      tooltip();
    }

    function emitData(n, ctx, out, nm) {
      const p = n.p || {};
      const st = (s) => out.add(s + ";");
      switch (n.type) {
        case "table": {
          const cols = GM.lines(p.cols).map((x) => {
            const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
            return [m[1].trim(), m[2] ? +m[2] : 0];
          });
          if (!cols.length) cols.push(["Column", 0]);
          const rows = GM.lines(p.rows).map((r) => {
            const cells = r.split(",").map((x) => x.trim());
            while (cells.length < cols.length) cells.push("");
            return cells.slice(0, cols.length);
          });
          const id = ctx.gid(nm + "_rows");
          ctx.consts.push("const " + id + " = [" + rows.map((r) => "[" + r.map(q).join(", ") + "]").join(", ") + "];");
          out.open("if (ui.table(" + [q(nm), cols.length, num(p.h), flagsOf(TFLAGS, p)].join(", ") + "))");
          cols.forEach((cl) => out.add("ui.tableColumn(" + q(cl[0]) + (cl[1] ? ", " + num(cl[1]) : "") + ");"));
          out.open("for (const row of " + id + ")");
          out.add("ui.tableRow();");
          out.open("for (let j = 0; j < row.length; j++)");
          out.add("if (j > 0) ui.tableNext();");
          out.add("ui.label(row[j]);");
          out.close();
          out.close();
          out.close();
          out.add("ui.tableEnd();");
          break;
        }
        case "plot_lines":
        case "plot_bars": {
          const vals = floats(p.values);
          ctx.decl("floats", nm, vals);
          st("ui." + camel(n.type) + "(" + [q(p.label), ctx.v(nm), num(p.min), num(p.max), num(p.h)].join(", ") + ")");
          break;
        }
        case "image": {
          ctx.need.placeholder = true;
          st("ui.image(placeholder, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
          break;
        }
      }
    }

    function emitInstance(n, ctx, out, ptype) {
      const p = n.p;
      const def = ctx.defs.get(p.el);
      if (!def) return ctx.warn(n.id, "this custom element is gone from the library, skipped");
      if (ctx.scope) return ctx.warn(n.id, "custom elements cant go inside custom elements yet");
      const nm = ctx.nm.get(n.id) || GM.ident(p.var || def.name);
      let info = ctx.used.get(def.id);
      if (!info) {
        info = { def };
        ctx.used.set(def.id, info);
      }
      if (ptype === "overlay") out.add("ui.pos(" + num(p.x) + ", " + num(p.y) + ");");
      const args = def.params.map((pr) => litOf(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def));
      const w = +p.w || def.w, h = +p.h || def.h;
      let own = w !== def.w || h !== def.h;
      const sv = def.state.map((s) => {
        const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
        if (v !== s.def) own = true;
        return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
      });
      const val = hasValue(def);
      const on = n.on || {};
      const evk = ["click", "change", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
      if (evk.length) info.mask = true;
      const m = evk.length ? "m" + ++ctx.k : null;
      const fn = ctx.gid(def.name + "_el");
      const a = ["ui", q(nm)].concat(args);
      if (own) a.push("[" + [w, h].concat(sv).map(num).join(", ") + "]");
      const callS = fn + "(" + a.join(", ") + ")";
      if (val) {
        const vid = ctx.gid(nm + "_value");
        ctx.top.push("let " + vid + " = 0;");
        const r = "got" + ++ctx.k;
        out.add("const " + r + " = " + callS + ";");
        if (m) out.add("const " + m + " = " + r + "[0];");
        out.add(vid + " = " + r + "[1];");
      } else out.add((m ? "const " + m + " = " : "") + callS + ";");
      if (m) {
        const bit = { change: 1, click: 2, dragend: 4 };
        for (const e of ["change", "click", "dragend"]) {
          if (!evk.includes(e)) continue;
          out.open("if (" + m + " & " + bit[e] + ")");
          emitActions(ctx, out, on[e], def.name + " " + e);
          out.close();
        }
        if (evk.includes("hover")) {
          const hv = ctx.gid(ctx.uniq(nm + "_hot"));
          ctx.top.push("let " + hv + " = false;");
          out.open("if ((" + m + " & 8) && !" + hv + ")");
          emitActions(ctx, out, on.hover, def.name + " hover");
          out.close();
          out.add(hv + " = (" + m + " & 8) !== 0;");
        }
      }
    }

    function elementCode(ctx, info) {
      const def = info.def;
      const warn = (msg, id) => ctx.warn(id || def.id, def.name + ": " + msg);
      const types = GM.elementIdents(def);
      const groups = GM.dragGroups(def);
      const rs = !!(def.resizable && def.resizable.on);
      const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
      for (const s of def.state) if (builtin.has(s.name)) warn("state " + s.name + " clashes with a built in name");
      for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) warn("param " + s.name + " clashes with another name");
      const taken = new Set(ELOCALS);
      groups.forEach((g) => taken.add("h" + pascal(GM.partVar(g))));
      const pid = new Map();
      for (const pr of def.params) {
        let v = cc(pr.name);
        while (taken.has(v) || /^hit\d+$/.test(v)) v += "Arg";
        taken.add(v);
        pid.set(pr.name, v);
      }
      const prNames = new Set(def.params.map((x) => x.name));

      const scope = { slots: [], alias: {}, prefix: def.name };
      const wout = new Out(false);
      {
        const local = new Map();
        const used = new Set(["s", "c", "o", "el", "box", "rs", "ox", "oy", "th", "u", "ui", "id", "sid", "sb", "init", "value", "changed", "hovered", "pressed", "dragging", "clicked", "released", "pressed_now", "nx", "ny"].concat([...prNames]));
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const b = GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type);
          let k = b, i = 2;
          while (used.has(k)) k = b + i++;
          used.add(k);
          local.set(pt.w.id, k);
        });
        const saveNm = ctx.nm;
        ctx.nm = local;
        ctx.scope = scope;
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const t = pt.w.type;
          if (GM.isContainer(t) || t === "window" || t === "el") warn("widget parts can only be simple widgets, skipped a " + t, pt.id);
          else if (t === "input" || t === "text_edit") warn("text boxes cant keep their text in goome_ui_store, skipped " + t, pt.id);
          else emitNode(pt.w, ctx, wout, "element");
        });
        ctx.scope = null;
        ctx.nm = saveNm;
      }

      const idx = {};
      let N = 0;
      const slot = (k) => (idx[k] = N++);
      ["init", "w", "h", "value", "hot"].forEach(slot);
      def.state.forEach((s) => slot("s:" + s.name));
      groups.forEach((g) => {
        const gv = GM.partVar(g);
        [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
      });
      if (rs) slot("rw"), slot("rh");
      scope.slots.forEach((w) => slot("w:" + w.name));
      const S = (k) => "s[" + idx[k] + "]";
      const map = {
        id: (name) => {
          if (prNames.has(name)) return pid.get(name);
          if (name === "w" || name === "h" || name === "value") return S(name);
          if (name === "hovered" || name === "pressed" || name === "dragging") return name;
          const st = def.state.find((x) => x.name === name);
          if (st) return st.type === "bool" ? "(" + S("s:" + name) + " !== 0)" : S("s:" + name);
          if (idx[name] != null) return S(name);
          return name;
        },
        th: (f) => "th." + camel(f),
      };
      const ex = (src, want, where) => {
        if (src === "" || src == null) return want === "c" ? hex(0) : "0";
        let r;
        if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 } };
        else r = GM.expr.check(src, types, want);
        if (!r.ok) {
          warn(where + ": " + r.err);
          return want === "c" ? hex(0) : "0";
        }
        return writeExpr(r.ast, map, types);
      };
      const exb = (src, where) => {
        const r = GM.expr.check(src, types, "b");
        if (!r.ok) {
          warn(where + ": " + r.err);
          return null;
        }
        let s = writeExpr(r.ast, map, types);
        if (r.type !== "b") s = par(s) + " !== 0";
        return s;
      };

      const blob = JSON.stringify(def.parts);
      const evs = (on) => (def.events || []).filter((e) => e.on === on);
      const reads = {
        hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
        pressed: /\bpressed\b/.test(blob),
        dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
        pressed_now: evs("press").length > 0,
        clicked: evs("click").length > 0,
        released: evs("release").length > 0,
      };
      const mask = !!info.mask;
      if (mask) reads.hovered = reads.clicked = reads.dragend = true;
      const fo = reads.clicked || reads.pressed_now;
      const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;
      const idc = (name) => (name === "pressed_now" ? "pressedNow" : name);

      const pargs = def.params.map((pr) => pid.get(pr.name) + " = " + litOf(pr.type, pr.def));
      const val = hasValue(def);
      const o = new Out(false);
      const A = (s) => o.add(s);
      const St = (s) => o.add(s + ";");
      const iff = (cond) => o.open("if (" + unwrap(cond) + ")");
      const close = () => o.close();
      const dbl = (n, e) => St("const " + n + " = " + e);
      const fn = ctx.gid(def.name + "_el");
      o.d = 0;
      o.open("function " + fn + "(" + ["ui", "sid"].concat(pargs, ["init = null"]).join(", ") + ")");
      St("const s = ui.store(sid, " + N + ")");
      iff("!s[0]");
      const fromInit = (i, d) => "init ? init[" + i + "] : " + d;
      St(S("init") + " = 1");
      St(S("w") + " = " + fromInit(0, num(def.w)));
      St(S("h") + " = " + fromInit(1, num(def.h)));
      def.state.forEach((s, i) => St(S("s:" + s.name) + " = " + fromInit(i + 2, s.type === "bool" ? (s.def ? "1" : "0") : num(s.def))));
      scope.slots.forEach((w) => St(S("w:" + w.name) + " = " + (w.kind === "color" ? hex(w.val) : num(w.val))));
      const clampE = (v, lo, hi) => "Math.max(" + lo + ", Math.min(" + hi + ", " + v + "))";
      const vd = def.value || {};
      const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
      if (val && vd.src === "drag") St(S("value") + " = " + (vst ? S("s:" + vst.name) : num(+vd.min || 0)));

      const groupBase = new Map();
      const baseWalk = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind !== "group") continue;
          const gx = par(ex(pt.f.x, "n", pt.name + " x")), gy = par(ex(pt.f.y, "n", pt.name + " y"));
          const dg = pt.drag && pt.drag.on;
          const sx = plus(bx, gx), sy = plus(by, gy);
          const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
          groupBase.set(pt.id, { sx, sy, ax, ay });
          baseWalk(pt.kids || [], ax, ay);
        }
      };
      baseWalk(def.parts, "0", "0");
      const bounds = (g) => {
        const b = groupBase.get(g.id), d = g.drag;
        const gw = par(ex(g.f.w, "n", g.name + " w")), gh = par(ex(g.f.h, "n", g.name + " h"));
        if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
        if (d.bounds === "rect") {
          const R = d.rect || {};
          return {
            x: [minus(num(+R.x || 0), b.sx), minus(minus(num((+R.x || 0) + (+R.w || 0)), gw), b.sx)],
            y: [minus(num(+R.y || 0), b.sy), minus(minus(num((+R.y || 0) + (+R.h || 0)), gh), b.sy)],
          };
        }
        return null;
      };
      const tOf = (o2, r) => {
        const lo = par(r[0]), hi = par(r[1]);
        return "(" + hi + " > " + lo + " ? " + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " : 0)";
      };
      if (val && vd.src === "drag") {
        const g = groups.find((x) => x.id === vd.part);
        const r = g && bounds(g);
        if (!g) warn("the value comes from a drag but no drag group is picked");
        else if (!r) warn("a value from a drag needs bounds on " + g.name, g.id);
        else {
          const ax = vd.axis === "y" ? "y" : "x";
          const span = (+vd.max || 0) - (+vd.min || 0);
          const t = span ? clampE(par(minus(S("value"), num(+vd.min || 0))) + (span === 1 ? "" : " / " + num(span)), "0", "1") : "0";
          St(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + plus(r[ax][0], t + " * " + par(minus(r[ax][1], r[ax][0]))));
        }
      }
      close();

      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = cc(w.name);
        St("let " + id + " = " + (w.kind === "bool" ? v + " !== 0" : v));
      });

      const thAt = o.l.length;
      const flagsDecl = ["changed", "hovered", "pressed", "dragging", "pressed_now", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k]);
      St("let " + flagsDecl.map((k) => idc(k) + " = false").join(", "));
      St("ui.pushId(sid)");
      const IF = (k) => ({ 0: "0", x: "goome.ITEM_DRAG_X", y: "goome.ITEM_DRAG_Y", xy: "goome.ITEM_DRAG_X | goome.ITEM_DRAG_Y", nohit: "goome.ITEM_NO_HIT", fo: "goome.ITEM_FOCUSABLE" })[k];
      const F = (it, f) => it + "." + camel(f);
      const custom = (name, sid, w, h, fl) => St("const " + name + " = ui.custom(" + [q(sid), w, h, fl].join(", ") + ")");
      const pos = (x, y) => St("ui.pos(" + x + ", " + y + ")");
      const declAt = o.l.length;
      custom("el", "##el", S("w"), S("h"), IF("nohit"));
      pos("0", "0");
      custom("o", "##o", "1", "1", IF("nohit"));
      St("const ox = " + F("el", "x") + " - " + F("o", "x") + ", oy = " + F("el", "y") + " - " + F("o", "y"));
      const acc = (it, click) => {
        const set = (k, e) => {
          if (reads[k]) A(idc(k) + " = " + idc(k) + " || " + e + ";");
        };
        set("hovered", F(it, "hovered") + " || " + F(it, "held"));
        set("pressed", F(it, "held"));
        set("pressed_now", F(it, "pressed"));
        if (click) set("clicked", F(it, "clicked"));
        set("released", F(it, "released"));
        if (!click) set("dragend", F(it, "released"));
      };
      if (rs) {
        const R = def.resizable;
        pos(plus("ox", minus(S("w"), "14")), plus("oy", minus(S("h"), "14")));
        custom("rs", "##rs", "14", "14", IF("xy"));
        iff(F("rs", "pressed"));
        St(S("rw") + " = " + S("w"));
        St(S("rh") + " = " + S("h"));
        close();
        iff(F("rs", "held"));
        St(S("w") + " = " + clampE(S("rw") + " + " + F("rs", "dragX"), num(R.minW), num(R.maxW)));
        St(S("h") + " = " + clampE(S("rh") + " + " + F("rs", "dragY"), num(R.minH), num(R.maxH)));
        St("changed = true");
        if (reads.dragging) St("dragging = true");
        close();
        acc("rs", false);
      }
      const bboxOf = (pt, bx, by) => {
        const f = pt.f, wh = (k) => (pt.name || pt.kind) + " " + k;
        const e = (k) => par(ex(f[k], "n", wh(k)));
        switch (pt.kind) {
          case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
            return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
          case "circle": case "ring": case "arc":
            return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), "2 * " + e("r"), "2 * " + e("r")];
          case "line":
            return [plus(bx, "Math.min(" + e("x0") + ", " + e("x1") + ")"), plus(by, "Math.min(" + e("y0") + ", " + e("y1") + ")"), "Math.max(1, Math.abs(" + minus(e("x1"), e("x0")) + "))", "Math.max(1, Math.abs(" + minus(e("y1"), e("y0")) + "))"];
          case "text": {
            const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
            const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
            const len = pr ? pid.get(pr.name) + ".length" : String(Array.from(String(f.text || "")).length);
            return [plus(bx, e("x")), plus(by, e("y")), len + " * " + e("size") + " * 0.55", e("size") + " * 1.25"];
          }
        }
        warn((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
        return null;
      };
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
        let r = null;
        if (d.handle) {
          let hp = null;
          GM.walkParts(g.kids || [], (pt) => {
            if (pt.id === d.handle) hp = pt;
          });
          if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
          else warn("drag handle part not found in " + g.name + ", using the group box", g.id);
        }
        if (!r) r = [b.ax, b.ay, par(ex(g.f.w, "n", g.name + " w")), par(ex(g.f.h, "n", g.name + " h"))];
        const it = "h" + pascal(gv);
        pos(plus("ox", r[0]), plus("oy", r[1]));
        custom(it, "##" + gv, r[2], r[3], IF(d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"));
        const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
        iff(F(it, "pressed"));
        St(sx + " = " + dx);
        St(sy + " = " + dy);
        close();
        iff(F(it, "held"));
        const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
        const bd = bounds(g);
        const snap = +d.snap || 0;
        for (const a of axes) {
          const n2 = "n" + a;
          A("let " + n2 + " = " + (a === "x" ? sx : sy) + " + " + F(it, a === "x" ? "dragX" : "dragY") + ";");
          if (snap > 0) St(n2 + " = Math.floor(" + n2 + " / " + num(snap) + " + 0.5) * " + num(snap));
          if (bd) St(n2 + " = " + clampE(n2, bd[a][0], bd[a][1]));
        }
        iff(axes.map((a) => "n" + a + " !== " + (a === "x" ? dx : dy)).join(" || "));
        for (const a of axes) St((a === "x" ? dx : dy) + " = n" + a);
        St("changed = true");
        if (val && vd.src === "drag" && vd.part === g.id) {
          const a = vd.axis === "y" ? "y" : "x";
          if (bd) {
            const span = (+vd.max || 0) - (+vd.min || 0);
            const t = tOf(a === "x" ? dx : dy, bd[a]);
            St(S("value") + " = " + plus(num(+vd.min || 0), span === 1 ? t : t + " * " + num(span)));
            if (vst) St(S("s:" + vst.name) + " = " + S("value"));
          }
        }
        close();
        if (reads.dragging) St("dragging = true");
        close();
        acc(it, false);
      }
      if (def.hit === "parts") {
        let k = 0;
        const hitOne = (pt, bx, by) => {
          const r = bboxOf(pt, bx, by);
          if (!r) return;
          const it = "hit" + k;
          pos(plus("ox", r[0]), plus("oy", r[1]));
          custom(it, "##hit" + k++, r[2], r[3], fo ? IF("fo") : IF(0));
          acc(it, true);
        };
        const walkHit = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind === "group") {
              const b = groupBase.get(pt.id);
              if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
              walkHit(pt.kids || [], b.ax, b.ay);
            } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
          }
        };
        walkHit(def.parts, "0", "0");
        if (!k && !groups.length && !rs && !deco) warn("hit mode is parts but no part is a hit area, nothing can be clicked");
      } else {
        pos("ox", "oy");
        custom("box", "##box", S("w"), S("h"), deco ? IF("nohit") : fo ? IF("fo") : IF(0));
        acc("box", true);
      }
      if (!o.l.slice(declAt + 4).some((l) => /\b(ox|oy)\b/.test(l))) o.l.splice(declAt + 1, 3);

      const actLines = (on) => {
        for (const e of evs(on)) {
          if (e.act === "print") {
            A("console.log(" + q(e.text || "") + ");");
            continue;
          }
          const tg = def.state.find((s) => s.name === e.target);
          if (!tg) {
            warn(on + " event needs a state to change, skipped");
            continue;
          }
          const t = S("s:" + tg.name);
          if (e.act === "toggle") St(t + " = " + t + " ? 0 : 1");
          else if (e.act === "add") {
            if (tg.type === "bool") {
              warn("cant add to a yes/no state");
              continue;
            }
            St(t + " += " + ex(e.expr || "0", "n", on + " event"));
          } else if (e.act === "set") {
            if (tg.type === "bool") {
              const b = exb(e.expr || "false", on + " event");
              if (b == null) continue;
              St(t + " = " + (b === "true" ? "1" : b === "false" ? "0" : b + " ? 1 : 0"));
            } else St(t + " = " + ex(e.expr || "0", "n", on + " event"));
          }
          St("changed = true");
        }
      };
      const evBlock = (cond, on) => {
        if (!evs(on).length) return;
        iff(cond);
        actLines(on);
        close();
      };
      if (evs("enter").length || evs("leave").length) {
        const hot = "(" + S("hot") + " !== 0)";
        evBlock("hovered && !" + hot, "enter");
        evBlock("!hovered && " + hot, "leave");
        St(S("hot") + " = hovered ? 1 : 0");
      }
      evBlock("pressedNow", "press");
      evBlock("dragging", "drag");
      evBlock("clicked", "click");
      evBlock("released", "release");
      if (val && vd.src === "state") {
        const vs = def.state.find((s) => s.name === vd.state);
        if (vs) St(S("value") + " = " + S("s:" + vs.name));
        else warn("value state " + (vd.state || "(none)") + " is missing");
      }

      const D = new Out(false);
      const ELX = F("el", "x"), ELY = F("el", "y");
      const drawParts = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind === "widget" || pt.kind === "hit") continue;
          const where = (k) => (pt.name || pt.kind) + " " + k;
          const N2 = (k) => ex(pt.f[k], "n", where(k));
          const Cc = (k) => ex(pt.f[k], "c", where(k));
          const X0 = (k) => plus(bx, par(N2(k)));
          const Y0 = (k) => plus(by, par(N2(k)));
          const lines = [];
          const call = (name, args) => lines.push("c." + name + "(" + args.join(", ") + ");");
          switch (pt.kind) {
            case "rect": call("rect", [X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")]); break;
            case "rrect": call("rrect", [X0("x"), Y0("y"), N2("w"), N2("h"), "[" + [N2("tl"), N2("tr"), N2("br"), N2("bl")].join(", ") + "]", Cc("color")]); break;
            case "frame": call("frame", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")]); break;
            case "line": call("line", [X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")]); break;
            case "circle": call("circle", [X0("cx"), Y0("cy"), N2("r"), Cc("color")]); break;
            case "ring": call("ring", [X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")]); break;
            case "arc": call("arc", [X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")]); break;
            case "poly": {
              const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
              if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
                warn(where("points") + ": needs 3 or more x,y pairs", pt.id);
                break;
              }
              const flat = [];
              pts.forEach((xy) => flat.push(plus(bx, par(ex(xy[0], "n", where("points")))), plus(by, par(ex(xy[1], "n", where("points"))))));
              call("poly", ["[" + flat.join(", ") + "]", Cc("color")]);
              break;
            }
            case "grad": call("rrectGrad", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), Cc("from"), Cc("to"), pt.f.sideways ? "true" : "false"]); break;
            case "shadow": call("shadow", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")]); break;
            case "text": {
              const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
              let tx;
              if (m) {
                const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
                if (!pr) {
                  warn(where("text") + ": no text param called " + m[1], pt.id);
                  tx = q("");
                } else tx = pid.get(pr.name);
              } else tx = q(pt.f.text || "");
              call("fontText", ["null", N2("size"), X0("x"), Y0("y"), tx, Cc("color")]);
              break;
            }
            case "bitmap": {
              const file = String(pt.f.file || "picture.png");
              const bid = addBitmap(ctx, "bm_" + def.name + "_" + GM.partVar(pt), file, pt.f.img);
              const tint = pt.f.tint === "" || pt.f.tint == null ? hex(0xFFFFFFFF) : Cc("tint");
              const a = [X0("x"), Y0("y"), N2("w"), N2("h")];
              const bm = ctx.gid(bid);
              lines.push("if (" + bm + ") c.bitmap(" + [bm].concat(a, [N2("radius"), tint]).join(", ") + ");");
              break;
            }
            case "group": {
              const b = groupBase.get(pt.id);
              const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
              if (pt.f.clip) lines.push("c.clipPush(" + [ax, ay, N2("w"), N2("h")].join(", ") + ");");
              const keep = D.l.length, sd = D.d;
              D.d = 0;
              drawParts(pt.kids || [], ax, ay);
              const kid = D.l.splice(keep);
              D.d = sd;
              kid.forEach((l) => lines.push(l));
              if (pt.f.clip) lines.push("c.clipPop();");
              break;
            }
          }
          if (!lines.length) continue;
          if (pt.show) {
            const b = exb(pt.show, (pt.name || pt.kind) + " show");
            if (b == null) continue;
            D.add("if (" + unwrap(b) + ") {");
            lines.forEach((l) => D.add("    " + l));
            D.add("}");
          } else lines.forEach((l) => D.add(l));
        }
      };
      drawParts(def.parts, ELX, ELY);
      if (D.l.length) {
        St("const c = ui.canvas");
        o.open("if (c)");
        D.l.forEach((l) => o.add(l));
        close();
      }
      wout.l.forEach((l) => o.add(l));
      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = cc(w.name);
        St(v + " = " + (w.kind === "bool" ? id + " ? 1 : 0" : id));
      });
      St("ui.popId()");
      const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]]));
      const m = bits.map((b) => "(" + b[0] + " ? " + b[1] + " : 0)").join(" | ");
      St("return " + (val ? "[" + m + ", " + S("value") + "]" : m));
      close();
      if (o.l.some((l) => /\bth\./.test(l))) o.l.splice(thAt, 0, "    const th = ui.theme;");
      return o.text();
    }

    const B64 = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/;
    function addBitmap(ctx, id, file, img) {
      ctx.bitmaps = ctx.bitmaps || new Map();
      if (ctx.bitmaps.has(id)) return id;
      const set = Object.assign({}, GM.SETTINGS_DEFAULT, ctx.project.settings || {});
      const m = B64.exec(String(img || ""));
      let b64 = set.iconSource === "embed" && m ? m[1].replace(/\s+/g, "") : null;
      if (set.iconSource === "embed" && !b64) ctx.warn("", file + " has no image data to embed, the code loads the file instead");
      if (!b64) ctx.files.add(file);
      ctx.bitmaps.set(id, { file, b64 });
      return id;
    }

    function bitmapLoads(ctx) {
      const L = { decl: [], helpers: [] };
      if (!ctx.bitmaps) return L;
      let files = false, data = false;
      for (const [id, b] of ctx.bitmaps) {
        if (b.b64) data = true, L.decl.push("const " + ctx.gid(id) + " = loadBitmapData(" + q(b.b64) + ");");
        else files = true, L.decl.push("const " + ctx.gid(id) + " = loadBitmap(" + q(b.file) + ");");
      }
      const tryLoad = (name, arg, load) => [
        "function " + name + "(" + arg + ") {", "    try {", "        return " + load + ";", "    } catch (e) {", "        if (e instanceof goome.GoomeError) return null;", "        throw e;", "    }", "}", "",
      ];
      if (files) L.helpers.push(...tryLoad("loadBitmap", "path", "goome.Bitmap.load(path)"));
      if (data) L.helpers.push(...tryLoad("loadBitmapData", "b64", 'goome.Bitmap.fromBytes(Buffer.from(b64, "base64"))'));
      return L;
    }

    function enumLit(k, v) {
      const nm = GM.THEME_ENUMS[k] && GM.THEME_ENUMS[k][v | 0];
      if (!nm) return num(v);
      return "goome." + (k === "align" ? "ALIGN_" : "EASE_") + nm.toUpperCase();
    }
    function fieldLit(k, v) {
      if (GM.THEME_COLORS.includes(k)) return hex(v);
      if (GM.THEME_ENUMS[k]) return enumLit(k, v);
      return num(v);
    }
    function themeDiff(t, base, set) {
      const L = [];
      for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
        const differs = GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
        if (differs) L.push(set(k, fieldLit(k, t[k])));
      }
      for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, "goome.Font.system(" + q(t[k]) + ")"));
      return L;
    }
    function themeLines(ctx) {
      const t = GM.applyQuick(GM.normTheme(ctx.project.theme));
      const L = [];
      const set = (k, v) => "t." + camel(k) + " = " + v + ";";
      if (t.quick) {
        const k = t.quick;
        L.push("t.make(" + hex(k.accent) + ", " + (k.dark ? "true" : "false") + ", " + num(k.radius) + ");");
        for (const f of GM.THEME_FONTS) if (t[f]) L.push(set(f, "goome.Font.system(" + q(t[f]) + ")"));
      } else {
        const pr = GM.presetOf(t);
        if (pr && pr.id !== "dark") {
          L.push("t.preset(goome.PRESET_" + GM.PRESET_ENUM[pr.id] + ");");
          L.push(...themeDiff(t, pr, set));
        } else {
          if (t.base === "light") L.push("t.light();");
          L.push(...themeDiff(t, GM.themeBase(t), set));
        }
      }
      const skin = (k, name) => {
        const s = t[k];
        const id = ctx.gid(addBitmap(ctx, k, s.file, s.img));
        L.push("if (" + id + ") t." + camel(name || k) + " = [" + [id, s.l, s.t, s.r, s.b].map((x, i) => (i ? num(x) : x)).join(", ") + "];");
      };
      for (const k of GM.THEME_SKINS) if (t[k]) skin(k);
      for (const k of Object.keys(t.icons || {}).filter((x) => GM.ICON_NAMES.includes(x))) {
        const id = ctx.gid(addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img));
        L.push("if (" + id + ") t.setIcon(goome.ICON_" + k.toUpperCase() + ", " + id + ");");
      }
      for (const k of GM.EXTRA_SKINS) if (t[k]) skin(k, k === "skin_slider_track" ? "skin_slider" : k);
      if (t.icon_tint) L.push("t.iconTint = 1;");
      return L;
    }

    function configLines(ctx) {
      const cfg = GM.normConfig(ctx.project.config), def = GM.normConfig({});
      const t = GM.normTheme(ctx.project.theme);
      const L = [], C = [];
      const set = (k, v) => C.push("cfg." + camel(k) + " = " + v + ";");
      for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) set(k, num(cfg[k]));
      for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) set(k, cfg[k] ? "true" : "false");
      for (const [k] of GM.CFG_CURSORS) {
        if (cfg.cursor[k] !== def.cursor[k]) C.push("cfg.setCursor(goome.CUR_" + k.toUpperCase() + ", goome.CURSOR_" + cfg.cursor[k] + ");");
      }
      if (cfg.mask !== def.mask) set("mask", q(cfg.mask));
      if (C.length) L.push("const cfg = ui.config;", ...C);
      for (const [k] of GM.CFG_KEYS) {
        if (cfg.keys[k] === def.keys[k]) continue;
        L.push("ui.config.bind(goome.ACT_" + k.toUpperCase() + ", " + (cfg.keys[k].trim() ? q(cfg.keys[k].trim()) : "null") + ");");
      }
      if (t.quick && t.quick.scale !== 1) L.push("ui.scale(" + num(t.quick.scale) + ");");
      return L;
    }

    function hotkeyBody(ctx, out) {
      const hk = (ctx.project.hotkeys || []).filter((k) => k && k.combo);
      hk.forEach((k, i) => {
        const where = "hotkey " + k.combo;
        if (i) {
          out.l[out.l.length - 1] += " else if (n === " + (i + 1) + ") {";
          out.d++;
          out.marks.push(out.l.length);
        } else out.open("if (n === 1)");
        emitActions(ctx, out, k.actions, where);
        out.close();
      });
      return hk;
    }

    function generate(project, warn) {
      const ctx = new Ctx(project, warn);
      prepass(ctx);
      const app = project.mode === "app";
      const out = new Out(false);
      out.d = 1;
      emitList(project.root, ctx, out, app ? "app" : "overlay");
      if (app && project.app.statusbar) out.add("ui.statusbar(" + textCode(ctx, project.app.status || "", {}).code + ");");
      const hout = new Out(false);
      hout.d = 1;
      const hks = hotkeyBody(ctx, hout);
      const els = [];
      for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
      const th = themeLines(ctx);
      const cl = configLines(ctx);
      const bl = bitmapLoads(ctx);
      const L = ['"use strict";', 'const goome = require("goome");', ""];
      if (bl.helpers.length) L.push(...bl.helpers);
      if (ctx.consts.length) L.push(...ctx.consts, "");
      if (ctx.need.placeholder) L.push("const placeholder = goome.Bitmap.fromArgb(new Uint32Array(4).fill(0xFF3A3F48), 2, 2);", "");
      if (bl.decl.length) L.push(...bl.decl, "");
      if (ctx.need.g) L.push("let G = null;");
      if (ctx.top.length) L.push(...ctx.top);
      if (ctx.need.g || ctx.top.length) L.push("");
      if (hks.length) L.push("const hotkeys = [" + hks.map((k) => q(k.combo)).join(", ") + "];", "");
      for (const f of ctx.fns) L.push("function " + ctx.gid(f, "fn") + "() {}", "");
      els.forEach((b) => L.push(b, ""));
      if (th.length) L.push("function setTheme(t) {", ...th.map((l) => "    " + l), "}", "");
      if (cl.length) L.push("function setConfig(ui) {", ...cl.map((l) => "    " + l), "}", "");
      if (out.l.length) L.push("function draw(ui) {", ...out.l, "}", "");
      else L.push("function draw(ui) {}", "");
      if (hks.length) L.push("function onHotkey(ui, n) {", ...hout.l, "}", "");
      if (hks.length) {
        L.push("function grabHotkeys(g) {", "    hotkeys.forEach((combo, i) => {", "        try {", "            g.hotkey(combo, i + 1);", "        } catch (e) {",
          "            console.error(`couldnt grab ${combo}: ${e.message}`);", "        }", "    });", "}", "");
      }
      if (app) {
        const fl = flagsOf(AFLAGS, project.app);
        const extra = project.app.titlebar ? ", windowFlags: goome.WINDOW_RESIZABLE | goome.WINDOW_BORDERLESS | goome.WINDOW_TRANSPARENT | goome.WINDOW_CENTER" : "";
        L.push("const app = new goome.App({ title: " + q(project.title) + ", width: " + (project.app.w | 0) + ", height: " + (project.app.h | 0) + ", flags: " + fl + extra + " });", "");
        if (th.length || cl.length || ctx.need.g || hks.length) {
          L.push("app.onStart((a) => {");
          if (ctx.need.g) L.push("    G = a.g;");
          if (th.length) L.push("    setTheme(a.ui.theme);");
          if (cl.length) L.push("    setConfig(a.ui);");
          if (hks.length) L.push("    grabHotkeys(a.g);");
          L.push("});", "");
        }
        if (hks.length) L.push("app.onEvent((ev) => {", "    if (ev.type === goome.HOTKEY) onHotkey(app.ui, ev.id);", "});", "");
        L.push("app.frame(draw);", "");
        L.push("function main() {", "    try {", "        app.run();", "    } catch (e) {", "        if (!(e instanceof goome.GoomeError)) throw e;", "        console.error(`cant open a window: ${e.message}`);", "        return 1;", "    }", "    return 0;", "}", "");
      } else {
        L.push("function main() {", "    let g;", "    try {", "        g = goome.open({ title: " + q(project.title) + ", noCapture: true });", "    } catch (e) {");
        L.push("        if (!(e instanceof goome.GoomeError)) throw e;", "        console.error(`cant open an overlay: ${e.message}`);", "        return 1;", "    }");
        if (ctx.need.g) L.push("    G = g;");
        L.push("    const ui = g.ui();");
        if (th.length) L.push("    setTheme(ui.theme);");
        if (cl.length) L.push("    setConfig(ui);");
        if (hks.length) L.push("    grabHotkeys(g);");
        L.push('    const test = g.backendName.split(" ")[0] === "test";', "    const pace = new goome.Pacer(60);", "    let running = true;", "    let dirty = true;", "    while (running) {");
        L.push("        const busy = dirty || test || ui.animating;", "        for (const ev of g.events(busy ? pace.wait() : 500)) {", "            if (ev.type === goome.QUIT || ev.type === goome.CLOSE) running = false;");
        if (hks.length) L.push("            if (ev.type === goome.HOTKEY) onHotkey(ui, ev.id);");
        L.push("            ui.feed(ev);", "            dirty = true;", "        }", "        if (!running) break;");
        L.push("        if (!(dirty || test || ui.animating)) continue;", "        dirty = false;");
        L.push("        if (!ui.begin(0)) continue;", "        draw(ui);", "        ui.end();", "    }", "    ui.close();", "    g.close();", "    return 0;", "}", "");
      }
      L.push("process.exitCode = main();", "");
      return { code: finish(L.join("\n").replace(/\n{3,}/g, "\n\n"), "js", project), files: [...ctx.files] };
    }

    X.langs.node = {
      label: "Node",
      ext: ".js",
      generate,
      hint: () => "node 18+: npm install https://github.com/goome-ui/node-goome/releases/download/v0.5.3/goome-0.5.3.tgz, save this as main.js and run node main.js",
    };
  })();

  (function () {
    const { GM, camel, pascal, strq, num, floats, cut, Out, AFLAGS, EFLAGS, TFLAGS, WFLAGS, IFLAGS } = X.H;

    const KEYWORDS = new Set("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var".split(" "));
    const BUILTINS = "any append bool byte cap clear close complex copy delete error false float32 float64 int int8 int16 int32 int64 iota len make max min new nil panic print println real recover rune string true uint uint8 uint16 uint32 uint64 uintptr".split(" ");
    const FIXED = "s ui c g err ev st id start host draw main setTheme setConfig onHotkey pick fade state fmt os math strings base64 goome tryLoad tryLoadData placeholder el o box rs ox oy th t cfg i j row item ok app a running dirty test pace changed hovered pressed dragging pressedNow clicked released dragend value result accent".split(" ");
    const LOCALS = new Set(KEYWORDS);
    for (const w of BUILTINS.concat(FIXED)) LOCALS.add(w);

    const PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3, "+": 4, "-": 4, "|": 4, "*": 5, "/": 5, "&": 5, "<<": 5, ">>": 5 };
    const strNode = (n) => typeof n === "string";
    const signed = (x) => (typeof x === "string" && /^-[\w.[]/.test(x) ? { k: "un", op: "-", a: x.slice(1) } : x);
    const bin = (op, a, b) => {
      a = signed(a);
      b = signed(b);
      if (a && a.k === "bin" && PREC[a.op] < PREC[op]) a = { k: "paren", a };
      if (b && b.k === "bin" && PREC[b.op] <= PREC[op]) b = { k: "paren", a: b };
      return { k: "bin", op, a, b };
    };
    const un = (op, a) => ({ k: "un", op, a: (a && a.k === "bin") || (typeof a === "string" && a[0] === "-") ? { k: "paren", a } : a });
    const call = (fn, ...args) => ({ k: "call", fn, args });
    const idx = (a, i) => ({ k: "idx", a, i });
    const paren = (a) => ({ k: "paren", a });

    const walkBin = (e) => {
      let has4 = false, has5 = false, mp = 0;
      const p = PREC[e.op];
      if (p === 4) has4 = true;
      if (p === 5) has5 = true;
      const l = e.a, r = e.b;
      if (l.k === "bin" && PREC[l.op] >= p) {
        const x = walkBin(l);
        has4 = has4 || x[0];
        has5 = has5 || x[1];
        mp = Math.max(mp, x[2]);
      }
      if (r.k === "bin" && PREC[r.op] > p) {
        const x = walkBin(r);
        has4 = has4 || x[0];
        has5 = has5 || x[1];
        mp = Math.max(mp, x[2]);
      } else if (r.k === "un" && e.op === "-" && r.op === "-") mp = Math.max(mp, 4);
      return [has4, has5, mp];
    };
    const cutoff = (e, depth) => {
      const [h4, h5, mp] = walkBin(e);
      if (mp > 0) return mp + 1;
      if (h4 && h5) return depth === 1 ? 5 : 4;
      return depth === 1 ? 6 : 4;
    };
    const R = (n, depth = 1) => {
      if (n == null) return "";
      if (strNode(n)) return n;
      switch (n.k) {
        case "bin": {
          const cut1 = cutoff(n, depth);
          const prec = PREC[n.op];
          const blanks = prec < cut1;
          const operand = (x, d) => (x.k === "bin" ? R(x, d) : R(x, d));
          const dl = depth + (n.a.k === "bin" && PREC[n.a.op] === prec ? 0 : 1);
          const l = operand(n.a, dl), r = operand(n.b, depth + 1);
          return blanks ? l + " " + n.op + " " + r : l + n.op + r;
        }
        case "un": return n.op + R(n.a, depth);
        case "paren": return "(" + R(n.a, Math.max(1, depth - 1)) + ")";
        case "call": {
          const d = n.args.length > 1 ? depth + 1 : depth;
          return n.fn + "(" + n.args.map((a) => R(a, d)).join(", ") + ")";
        }
        case "idx": return R(n.a, depth) + "[" + R(n.i, depth + 1) + "]";
      }
      return String(n);
    };

    const hex = (v) => "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const numLit = (v) => {
      v = +v;
      if (!Number.isFinite(v)) v = 0;
      return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
    };
    const q = (s) => strq(s, "cs");
    const plus = (a, b) => (a === "0" ? b : b === "0" ? a : bin("+", a, b));
    const minus = (a, b) => (b === "0" ? a : bin("-", a, b));
    const neg = (a) => (a === "0" ? "0" : un("-", a));
    const times = (a, b) => bin("*", a, b);
    const sel = (o, f) => o + "." + f;

    const flagNode = (table, p, extra) => {
      const on = table.filter((f) => p[f[0]]).map((f) => "goome." + pascal(f[1].replace(/^GOOME_/, "").toLowerCase()));
      if (!on.length) return "0";
      return on.reduce((a, b) => bin("|", a, b));
    };

    const VT = { bool: "bool", int: "int", float: "float64", color: "uint32", string: "string" };
    const KIND_T = { bool: "bool", flag: "bool", int: "int", double: "float64", color: "uint32", str: "string" };
    const KIND_V = { bool: "bool", flag: "bool", int: "int", double: "float", color: "color", str: "string" };
    const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };
    const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };
    const CUR = { ARROW: "Arrow", IBEAM: "IBeam", HAND: "Hand", MOVE: "Move", RESIZE_EW: "ResizeEW", RESIZE_NS: "ResizeNS", RESIZE_NWSE: "ResizeNWSE", RESIZE_NESW: "ResizeNESW", WAIT: "Wait", NO: "No", HIDDEN: "Hidden" };

    const isConst = (x) => {
      switch (x.t) {
        case "num": case "hex": case "bool": return true;
        case "un": return isConst(x.a);
        case "bin": return isConst(x.a) && isConst(x.b);
        case "call": return x.args.every(isConst);
        case "tern": return isConst(x.c) && isConst(x.a) && isConst(x.b);
      }
      return false;
    };
    const folded = (x) => GM.expr.eval(x, { th: {}, v: {} });

    function exprNode(ast, types, map, need) {
      const typeOf = (x) => {
        try {
          return GM.expr.type(x, types);
        } catch (e) {
          return "n";
        }
      };
      const asF = (r) => (r.t === "c" && !r.lit ? call("float64", r.n) : r.n);
      const asB = (r) => (r.t === "b" ? r.n : bin("!=", r.t === "c" ? r.n : asF(r), "0"));
      const go = (x) => {
        switch (x.t) {
          case "num": return { n: numLit(x.v), t: "n", lit: true };
          case "hex": return { n: hex(x.v), t: "c", lit: true };
          case "bool": return { n: x.v ? "true" : "false", t: "b" };
          case "th": return { n: map.th(x.f), t: GM.THEME_COLORS.includes(x.f) ? "c" : "n" };
          case "id": return { n: map.id(x.name), t: typeOf(x) };
          case "call": {
            const a = x.args.map((y) => asF(go(y)));
            if (x.fn === "abs") {
              need.math = true;
              return { n: call("math.Abs", a[0]), t: "n" };
            }
            return { n: call(x.fn, a[0], a[1]), t: "n" };
          }
          case "un": {
            const r = go(x.a);
            if (x.op === "-") return { n: un("-", asF(r)), t: "n" };
            if (r.t === "b" && r.n.k === "bin" && (r.n.op === "!=" || r.n.op === "==")) return { n: bin(r.n.op === "!=" ? "==" : "!=", r.n.a, r.n.b), t: "b" };
            return { n: r.t === "b" ? un("!", r.n) : bin("==", r.t === "c" ? r.n : asF(r), "0"), t: "b" };
          }
          case "tern": {
            const c = asB(go(x.c)), a = go(x.a), b = go(x.b);
            need.pick = true;
            if (a.t === b.t && a.t === "b") return { n: call("pick[bool]", c, a.n, b.n), t: "b" };
            if (a.t === b.t && a.t === "c") return { n: call("pick[uint32]", c, a.n, b.n), t: "c" };
            return { n: call("pick[float64]", c, asF(a), asF(b)), t: "n" };
          }
          case "bin": {
            if (x.op === "/" && isConst(x)) {
              const v = folded(x);
              return { n: numLit(Number.isFinite(v) ? v : 0), t: "n", lit: true };
            }
            if (x.op === "/" && isConst(x.b) && folded(x.b) === 0) return { n: "0", t: "n", lit: true };
            const a = go(x.a), b = go(x.b);
            if (x.op === "&&" || x.op === "||") return { n: bin(x.op, asB(a), asB(b)), t: "b" };
            if ("+-*/".includes(x.op)) return { n: bin(x.op, asF(a), asF(b)), t: "n" };
            if (a.t === b.t && (a.t === "b" || a.t === "c")) return { n: bin(x.op, a.n, b.n), t: "b" };
            return { n: bin(x.op, asF(a), asF(b)), t: "b" };
          }
        }
        return { n: "0", t: "n" };
      };
      return go(ast);
    }

    function generate(project, warn) {
      const need = { math: false, pick: false, fade: false, host: false, placeholder: false, b64: false, strings: false, fmt: true };
      const fields = [];
      const pkg = [];
      const consts = [];
      const files = new Set();
      const fns = [];
      const fnNames = new Map();
      const used = new Map();
      const refs = new Map();
      const vars = new Map();
      const targets = new Set();
      const defs = new Map((project.elements || []).map((d) => [d.id, d]));
      const st = { k: 0, scope: null, nm: new Map(), themeVars: null, bitmaps: null, pkgUsed: new Set(), fieldUsed: new Set() };
      const idxNodes = GM.index(project);

      const takeIn = (set, base) => {
        let v = GM.ident(base);
        const bad = (x) => set.has(camel(x)) || LOCALS.has(camel(x));
        if (bad(v)) {
          const stem = v.replace(/_?\d+$/, "") || "v";
          let i = 2;
          while (bad(stem + i)) i++;
          v = stem + i;
        }
        set.add(camel(v));
        return v;
      };
      const takeField = (base) => takeIn(st.fieldUsed, base);
      const takePkg = (base) => camel(takeIn(st.pkgUsed, base));
      const pkgFree = (base) => {
        let v = camel(GM.ident(base)), i = 2;
        const b = v;
        while (st.pkgUsed.has(v) || LOCALS.has(v)) v = b + i++;
        st.pkgUsed.add(v);
        return v;
      };

      const addField = (name, type, init) => {
        fields.push({ name: camel(name), type, init });
        return "s." + camel(name);
      };

      const decl = (kind, name, val, extra) => {
        const sc = st.scope;
        if (sc) {
          if (kind === "floats") {
            const id = pkgFree(sc.prefix + "_" + name);
            sc.alias[name] = id;
            consts.push("var " + id + " = []float32{" + val.map(numLit).join(", ") + "}");
            return;
          }
          sc.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" || kind === "flag" ? (val ? 1 : 0) : +val || 0 });
          return;
        }
        const T = kind === "floats" ? "[]float32" : KIND_T[kind];
        let lit;
        if (kind === "color") lit = hex(val);
        else if (kind === "double") lit = numLit(val);
        else if (kind === "int") lit = String(val | 0);
        else if (kind === "str") lit = q(cut(val, Math.max(2, extra | 0) - 1));
        else if (kind === "floats") lit = "[]float32{" + val.map(numLit).join(", ") + "}";
        else lit = val ? "true" : "false";
        return addField(name, T, lit);
      };
      const vref = (name) => {
        if (st.scope) return st.scope.alias[name] || camel(name);
        return "s." + camel(name);
      };
      const constArr = (name, items) => {
        if (st.scope) name = st.scope.prefix + "_" + name;
        const id = pkgFree(name);
        consts.push("var " + id + " = []string{" + items.map(q).join(", ") + "}");
        return id;
      };

      GM.walk(project.root, (n) => {
        const on = n.on || {};
        for (const e in on) for (const a of on[e] || []) note(a);
      });
      for (const hk of project.hotkeys || []) for (const a of hk.actions || []) note(a);
      function note(a) {
        if (!a) return;
        if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) targets.add(a.target);
        if (a.do === "call" && a.fn) {
          const f = GM.ident(a.fn, "on_click");
          if (!fns.includes(f)) fns.push(f);
        }
      }

      const nmMap = new Map();
      const vnm = new Map();
      for (const v of project.vars || []) vnm.set(v.id, takeField(v.name));
      GM.walk(project.root, (n) => {
        if (n.p && n.p.var && !n.p.bind) nmMap.set(n.id, takeField(n.p.var));
        else if (["window", "scroll", "split", "tabs", "collapsing", "tree", "modal", "table", "plot_lines", "plot_bars", "combo", "selectable", "radio", "checkbox", "toggle", "slider", "slider_int", "input", "text_edit", "color", "el"].includes(n.type)) nmMap.set(n.id, takeField(n.type));
        else if (n.type === "menu_item" && n.p.check) nmMap.set(n.id, takeField(n.p.label || "item"));
      });
      st.nm = nmMap;
      for (const f of fns) fnNames.set(f, pkgFree(f));
      const takeNm = (base) => takeField(base);

      const caps = {};
      GM.walk(project.root, (n) => {
        if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
      });
      for (const v of project.vars || []) {
        const name = vnm.get(v.id);
        const r = { name, code: "s." + camel(name), type: v.type, v, cap: Math.max(256, caps[v.id] || 0) };
        vars.set(v.id, r);
        refs.set(v.name, r);
        const d = v.def;
        if (v.type === "list") {
          const items = GM.lines(d);
          addField(name, "[]string", "[]string{" + (items.length ? items : [""]).map(q).join(", ") + "}");
          continue;
        }
        const kind = { bool: "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
        const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? +d >>> 0 : v.type === "bool" ? !!d : +d || 0;
        const save = st.scope;
        st.scope = null;
        decl(kind, name, val, r.cap);
        st.scope = save;
      }
      GM.walk(project.root, (n) => {
        if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || refs.has(n.p.var)) return;
        const nm = st.nm.get(n.id);
        if (!nm) return;
        refs.set(n.p.var, { name: nm, code: "s." + camel(nm), type: OWN_T[n.type] });
      });

      const listInfo = (n) => {
        const p = n.p;
        if (p.itemsVar) {
          const r = vars.get(p.itemsVar);
          if (r && r.type === "list") return { arr: r.code, len: call("len", r.code), items: GM.lines(r.v.def), dyn: true };
          warn(n.id, "the items list var is gone or isnt a list, using the typed items");
        }
        return null;
      };

      const thCode = (f, ui) => ui + ".Theme()." + pascal(f);
      const exprFor = (src, want, where, id) => {
        const types = GM.layoutIdents(project);
        const r = GM.expr.check(src, types, want);
        if (!r.ok) {
          warn(id || "", where + ": " + r.err);
          return null;
        }
        const map = {
          id: (name) => {
            const ref = refs.get(name);
            if (!ref) return name;
            return ref.type === "int" ? call("float64", ref.code) : ref.code;
          },
          th: (f) => thCode(f, "ui"),
        };
        return finishExpr(r, want, map, types);
      };
      const finishExpr = (r, want, map, types) => {
        const e = exprNode(r.ast, types, map, need);
        const asF = e.t === "c" && !e.lit ? call("float64", e.n) : e.n;
        if (want === "b") return e.t === "b" ? e.n : bin("!=", e.t === "c" ? e.n : asF, "0");
        if (want === "n") {
          if (e.t === "b") {
            need.pick = true;
            return call("pick[float64]", e.n, "1", "0");
          }
          return asF;
        }
        return e.n;
      };

      const textCode = (text, opts) => {
        const parts = GM.interp(text);
        const vs = parts.filter((x) => x.v && refs.has(x.v));
        for (const x of parts) if (x.v && !refs.has(x.v)) warn((opts && opts.id) || "", "theres no var called " + x.v + " for {" + x.v + "}");
        if (!vs.length) return { n: q(text), dyn: false };
        let f = "";
        const args = [];
        for (const x of parts) {
          const r = x.v && refs.get(x.v);
          if (!r) f += (x.t != null ? x.t : "{" + x.v + "}").replace(/%/g, "%%");
          else if (r.type === "float") f += "%g", args.push(r.code);
          else if (r.type === "string") f += "%s", args.push(r.code);
          else if (r.type === "bool") f += "%t", args.push(r.code);
          else if (r.type === "color") f += "#%08X", args.push(r.code);
          else if (r.type === "list") f += "%s", args.push(idx(r.code, "0"));
          else f += "%d", args.push(r.code);
        }
        return { n: call("fmt.Sprintf", q(f), ...args), dyn: true };
      };

      const winTitle = (n) => textCode(n.p.label == null ? "" : n.p.label, { id: n.id }).n;

      const openRef = (n) => {
        if (n.p.bind) {
          const r = vars.get(n.p.bind);
          if (r) return r.code;
        }
        const nm = st.nm.get(n.id) || GM.ident(n.p.var || n.type);
        return "s." + camel(nm);
      };

      function emitActions(out, list, where) {
        const S = (x) => out.add(R(x));
        for (const a of list || []) {
          if (!a || !a.do) continue;
          const refOf = (name) => {
            const r = refs.get(name);
            if (!r) warn("", where + ": theres no var called " + (name || "(none)"));
            return r;
          };
          switch (a.do) {
            case "set": {
              const r = refOf(a.var);
              if (!r) break;
              if (r.type === "string") {
                S("" + r.code + " = " + R(textCode(a.value || "", {}).n, 1));
                break;
              }
              if (r.type === "list") {
                warn("", where + ": cant set a list var, its fixed");
                break;
              }
              const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
              const src = a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value;
              const e = exprFor(src, want, where);
              if (e == null) break;
              if (r.type === "int") {
                const ck = GM.expr.check(src, GM.layoutIdents(project), "n");
                if (ck.ok && isConst(ck.ast)) {
                  const v = folded(ck.ast);
                  out.add(r.code + " = " + String(Math.trunc(Number.isFinite(+v) ? +v : 0)));
                } else out.add(r.code + " = " + R(call("int", e)));
              } else out.add(r.code + " = " + R(e));
              break;
            }
            case "toggle": {
              const r = refOf(a.var);
              if (!r) break;
              if (r.type !== "bool") {
                warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
                break;
              }
              out.add(r.code + " = !" + r.code);
              break;
            }
            case "add":
            case "sub": {
              const r = refOf(a.var);
              if (!r) break;
              if (r.type !== "int" && r.type !== "float") {
                warn("", where + ": add/sub needs a number var");
                break;
              }
              const e = exprFor(a.value === "" || a.value == null ? "1" : a.value, "n", where);
              if (e == null) break;
              let v = bin(a.do === "add" ? "+" : "-", r.type === "int" ? call("float64", r.code) : r.code, e);
              if (r.v && +r.v.max > +r.v.min) v = call("max", numLit(r.v.min), call("min", numLit(r.v.max), v));
              if (r.type === "int") v = call("int", v);
              out.add(r.code + " = " + R(v));
              break;
            }
            case "open":
            case "close": {
              const t = idxNodes.get(a.target);
              if (!t) {
                warn("", where + ": the " + a.do + " target is gone");
                break;
              }
              const on = a.do === "open";
              const tn = t.n;
              if (tn.type === "popup") {
                if (on) S(call("ui.PopupOpen", q(tn.p.label || "popup")));
                else S(call("ui.PopupClose"));
              } else if (tn.type === "window" || tn.type === "modal") {
                if (tn.type === "window" && !(tn.p.bind && vars.get(tn.p.bind))) out.add(openRef(tn) + ".Closed = " + (on ? "false" : "true"));
                else out.add(openRef(tn) + " = " + (on ? "true" : "false"));
              } else warn("", where + ": can only open or close a window, modal or popup");
              break;
            }
            case "toast": {
              const t = textCode(a.text || "", {});
              S(call("ui.Toast", t.n, String(+a.ms > 0 ? a.ms | 0 : 2500)));
              break;
            }
            case "tab": {
              const t = idxNodes.get(a.target);
              if (!t || t.n.type !== "tabs") {
                warn("", where + ": the tab target has to be a tabs node");
                break;
              }
              const r = t.n.p.bind ? vars.get(t.n.p.bind) : refs.get(t.n.p.var);
              if (!r) break;
              out.add(r.code + " = " + (a.tab | 0));
              break;
            }
            case "copy": {
              const t = textCode(a.text || "", {});
              need.host = true;
              S(call("host.SetClipboard", t.n));
              break;
            }
            case "quit":
              need.host = true;
              out.add("host.Push(goome.Event{Type: goome.EventClose})");
              break;
            case "call": {
              const f = GM.ident(a.fn, "on_click");
              out.add(fnNames.get(f) + "()");
              break;
            }
            default:
              warn("", where + ": dont know the action " + a.do);
          }
        }
      }

      function styled(out, stl, body) {
        const k = GM.styleCount(stl);
        if (!k) return body();
        let pushed = 0;
        const th = stl.theme ? GM.findTheme(project, stl.theme) : null;
        if (stl.theme && th) {
          out.add("ui.PushTheme(&" + themeVar(stl.theme) + ")");
          pushed++;
        } else if (stl.theme) warn("", "a style uses a theme that is gone: " + stl.theme);
        for (const f of GM.THEME_COLORS) if (stl.c && stl.c[f] != null) out.add(R(call("ui.PushColor", "goome.Style" + pascal(f), hex(stl.c[f])))), pushed++;
        for (const f of GM.THEME_SIZES) if (stl.n && stl.n[f] != null) out.add(R(call("ui.PushNum", "goome.Style" + pascal(f), fieldLit(f, stl.n[f])))), pushed++;
        if (Array.isArray(stl.radii) && stl.radii.length === 4) {
          const r = stl.radii.map(numLit);
          out.add("ui.PushRadii(goome.Radii{TL: " + r[0] + ", TR: " + r[1] + ", BR: " + r[2] + ", BL: " + r[3] + "})");
          pushed++;
        }
        body();
        if (pushed) out.add("ui.Pop(" + pushed + ")");
      }
      function themeVar(id) {
        st.themeVars = st.themeVars || new Map();
        if (!st.themeVars.has(id)) {
          const t = GM.findTheme(project, id);
          st.themeVars.set(id, pkgFree("theme_" + GM.ident(t ? t.name : id, "t")));
        }
        return st.themeVars.get(id);
      }
      const ENUM_PRE = { align: "Align", ease: "Ease" };
      function fieldLit(k, v) {
        if (GM.THEME_COLORS.includes(k)) return hex(v);
        const names = GM.THEME_ENUMS[k];
        const nm = names && names[v | 0];
        if (nm) return "goome." + ENUM_PRE[k] + pascal(nm);
        return numLit(v);
      }

      function emitList(list, out, ptype) {
        for (const n of list) emitNode(n, out, ptype);
      }
      function emitSlot(n, s, out, ptype) {
        const stl = n.slotStyle && n.slotStyle[String(s)];
        styled(out, stl, () => emitList(n.kids[s] || [], out, ptype));
      }
      function emitNode(n, out, ptype) {
        const go = () => styled(out, n.style, () => emitEnabled(n, out, ptype));
        if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
          const e = exprFor(n.p.showIf, "b", "show if", n.id);
          if (e != null) {
            out.open("if " + R(e));
            go();
            out.close();
            return;
          }
        }
        go();
      }

      function bareRef(n) {
        if (n.p.bind) return vars.get(n.p.bind) || null;
        if (!OWN_T[n.type]) return null;
        const nm = st.nm.get(n.id);
        if (!nm) return null;
        return { name: nm, code: st.scope ? vref(nm) : "s." + camel(nm), type: OWN_T[n.type] };
      }

      function emitEnabled(n, out, ptype) {
        const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
        if (!src) return emitBare(n, out, ptype, null);
        const e = exprFor(src, "b", "enable if", n.id);
        if (e == null) return emitBare(n, out, ptype, null);
        const en = "en" + ++st.k;
        need.fade = true;
        out.add(en + " := " + R(e));
        out.open("if !" + en);
        out.add("ui.PushColor(goome.StyleText, ui.Theme().TextDim)");
        out.add("ui.PushColor(goome.StyleAccent, fade(ui.Theme().Accent))");
        out.close();
        let saved = null;
        if (VALUE_T[n.type]) {
          const r = bareRef(n);
          if (r) {
            const w = "was" + st.k;
            saved = { r, w };
            out.add(w + " := " + r.code);
          }
        }
        emitBare(n, out, ptype, en);
        out.open("if !" + en);
        if (saved) out.add(saved.r.code + " = " + saved.w);
        out.add("ui.Pop(2)");
        out.close();
      }

      function emitBare(n, out, ptype, en) {
        const p = n.p || {};
        const st1 = (s) => out.add(typeof s === "string" ? s : R(s));
        const nm = st.nm.get(n.id) || GM.ident(p.var || n.type);
        const U = (f, ...args) => call("ui." + f, ...args);
        if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
          warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
          return;
        }
        const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
        if (leaf && +p.width > 0) st1(U("Width", numLit(p.width)));
        if (n.abs && ptype !== "overlay" && ptype !== "app") {
          st1(U("Pos", numLit(n.abs.x), numLit(n.abs.y)));
          if (+n.abs.w > 0 || +n.abs.h > 0) st1(U("Size", numLit(+n.abs.w > 0 ? n.abs.w : 0), numLit(+n.abs.h > 0 ? n.abs.h : 0)));
        }
        const on = n.on || {};
        const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
        const where = (e) => (p.label || n.type) + " " + e;
        const ifActs = (cond, fill) => {
          out.open("if " + (typeof cond === "string" ? cond : R(cond)));
          fill();
          out.close();
        };
        const andEn = (cond) => (en ? bin("&&", cond, en) : cond);
        const bound = (types) => {
          if (!p.bind) return null;
          const r = vars.get(p.bind);
          if (!r) {
            warn(n.id, "the bound var is gone, using its own var");
            return null;
          }
          if (st.scope) {
            warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
            return null;
          }
          if (types && !types.includes(r.type)) {
            warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
            return null;
          }
          return r;
        };
        const own = (kind, val, extra) => {
          const code = decl(kind, nm, val, extra);
          return { name: nm, code: st.scope ? vref(nm) : code, type: KIND_V[kind] };
        };
        const changeEvents = () => has("change") || has("on") || has("off");
        const fireChange = (ref) => {
          if (has("change")) emitActions(out, on.change, where("change"));
          if ((has("on") || has("off")) && ref) {
            if (has("on")) ifActs(ref.code, () => emitActions(out, on.on, where("on")));
            if (has("off")) ifActs("!" + ref.code, () => emitActions(out, on.off, where("off")));
          }
        };
        const valueWidget = (callNode, ref) => {
          if (changeEvents()) ifActs(andEn(callNode), () => fireChange(ref));
          else st1(callNode);
        };
        const hover = () => {
          if (!has("hover")) return;
          const hv = takeNm(nm + "_hot");
          addField(hv, "bool", "false");
          const code = "s." + camel(hv);
          const h = "h" + ++st.k;
          out.add(h + " := ui.Hovered()");
          ifActs(h + " && !" + code, () => emitActions(out, on.hover, where("hover")));
          out.add(code + " = " + h);
        };
        const tooltip = () => {
          if (leaf && p.tooltip) st1(U("Tooltip", q(p.tooltip)));
        };
        const label = (txt) => textCode(txt == null ? "" : txt, { id: n.id }).n;

        switch (n.type) {
          case "window": {
            if (st.scope) return warn(n.id, "windows cant go inside a custom element");
            const b = bound(["bool"]);
            const wf = decl2("window", nm, "*goome.Window", "goome.NewWindow(" + [p.x, p.y, p.w, p.h].map(numLit).join(", ") + ")");
            if (b) out.add(wf + ".Closed = !" + b.code);
            out.open("if " + R(U("Window", label(p.label), wf, flagNode(WFLAGS, p))));
            emitList(n.kids[0], out, "window");
            out.close();
            out.add("ui.End()");
            if (b) {
              out.open("if " + wf + ".Closed");
              out.add(b.code + " = false");
              out.close();
            }
            return;
          }
          case "row": {
            const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
            if (k >= 2) st1(U("Row", String(k)));
            emitList(n.kids[0], out, "row");
            return;
          }
          case "same_line": return st1(U("SameLine"));
          case "space": return st1(U("Space", numLit(p.px)));
          case "separator": return st1(U("Separator"));
          case "scroll": {
            st1(U("Scroll", q(nm), numLit(p.h)));
            emitList(n.kids[0], out, "scroll");
            out.add("ui.End()");
            return;
          }
          case "split": {
            const sp = decl2("split", nm, "*goome.Split", "&goome.Split{Frac: " + numLit(+p.frac || 0.3) + (p.vertical ? ", Vertical: true" : "") + "}");
            st1(U("Split", q(nm), sp));
            emitSlot(n, 0, out, "split");
            st1(U("SplitNext"));
            emitSlot(n, 1, out, "split");
            out.add("ui.End()");
            return;
          }
          case "tabs": {
            const li = listInfo(n);
            const items = li ? li.items : GM.lines(p.items);
            if (!items.length) items.push("Tab");
            const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
            const arr = li ? li.arr : constArr(nm + "_names", items);
            valueWidget(U("Tabs", q(nm), arr, "&" + r.code), r);
            const k = Math.max(items.length, n.kids.length);
            const live = [];
            for (let i = 0; i < k; i++) if ((n.kids[i] || []).length) live.push(i);
            if (live.length) {
              out.add("switch " + r.code + " {");
              for (const i of live) {
                out.add("case " + i + ":");
                out.d++;
                emitSlot(n, i, out, "tabs");
                out.d--;
              }
              out.add("}");
            }
            return;
          }
          case "collapsing": {
            const r = bound(["bool"]) || own("bool", !!p.open);
            const ev = has("change");
            const w = ev ? "was" + ++st.k : null;
            if (ev) out.add(w + " := " + r.code);
            if (ev) {
              st1(U("Collapsing", label(p.label), "&" + r.code));
              ifActs(andEn(r.code + " != " + w), () => emitActions(out, on.change, where("change")));
              out.open("if " + r.code);
            } else out.open("if " + R(U("Collapsing", label(p.label), "&" + r.code)));
            emitList(n.kids[0], out, "collapsing");
            out.close();
            return;
          }
          case "tree": {
            const r = bound(["bool"]) || own("bool", !!p.open);
            const ev = has("change");
            const w = ev ? "was" + ++st.k : null;
            if (ev) out.add(w + " := " + r.code);
            const tc = U("Tree", label(p.label), "&" + r.code);
            if (ev) {
              const sh = "open" + ++st.k;
              out.add(sh + " := " + R(tc));
              ifActs(andEn(r.code + " != " + w), () => emitActions(out, on.change, where("change")));
              out.open("if " + sh);
            } else out.open("if " + R(tc));
            emitList(n.kids[0], out, "tree");
            out.close();
            out.add("ui.End()");
            return;
          }
          case "modal": {
            const b = bound(["bool"]);
            const r = b || own("bool", false);
            if (p.button) ifActs(U("Button", label(p.button)), () => out.add(r.code + " = true"));
            out.open("if " + R(U("Modal", label(p.label), "&" + r.code)));
            emitList(n.kids[0], out, "modal");
            out.close();
            out.add("ui.End()");
            return;
          }
          case "popup": {
            const id = q(p.label || "popup");
            const b = bound(["bool"]);
            if (b) ifActs(b.code, () => {
              st1(U("PopupOpen", id));
              out.add(b.code + " = false");
            });
            out.open("if " + R(U("Popup", id)));
            emitList(n.kids[0], out, "popup");
            out.close();
            out.add("ui.End()");
            return;
          }
          case "menubar":
          case "menu": {
            const mb = n.type === "menubar";
            out.open("if " + R(mb ? U("Menubar") : U("Menu", label(p.label))));
            emitList(n.kids[0], out, n.type);
            out.close();
            out.add("ui.End()");
            return;
          }
          case "menu_item": {
            const sc = p.shortcut ? q(p.shortcut) : '""';
            const b = p.check || p.bind ? bound(["bool"]) : null;
            if (p.check || b) {
              const r = b || own("bool", !!p.on);
              const cl = U("MenuItem", label(p.label), sc, "&" + r.code);
              if (has("click")) ifActs(andEn(cl), () => emitActions(out, on.click, where("click")));
              else st1(cl);
            } else {
              ifActs(andEn(U("MenuItem", label(p.label), sc, "nil")), () => {
                if (has("click")) emitActions(out, on.click, where("click"));
                else out.add(R(call("fmt.Println", q(p.label + " clicked"))));
              });
            }
            return;
          }
          case "menu_sep": return st1(U("MenuSeparator"));
          case "label": st1(U("Label", label(p.label))); hover(); break;
          case "heading": st1(U("Heading", label(p.label))); hover(); break;
          case "wrapped": st1(U("Wrapped", label(p.label))); break;
          case "button": {
            ifActs(andEn(U("Button", label(p.label))), () => {
              if (has("click")) return emitActions(out, on.click, where("click"));
              if (p.action === "toast") st1(U("Toast", label(p.toast), String(p.ms | 0)));
              else if (p.action === "close") st1(U("PopupClose"));
              else out.add(R(call("fmt.Println", q(p.label + " clicked"))));
            });
            hover();
            break;
          }
          case "checkbox":
          case "toggle": {
            const r = bound(["bool"]) || own("bool", !!p.on);
            valueWidget(U(n.type === "checkbox" ? "Checkbox" : "Toggle", label(p.label), "&" + r.code), r);
            hover();
            break;
          }
          case "radio": {
            const li = listInfo(n);
            const items = li ? li.items : GM.lines(p.items);
            const r = bound(["int"]) || own("int", p.sel | 0);
            const ev = changeEvents();
            const ch = ev ? "ch" + ++st.k : null;
            if (ev) out.add(ch + " := false");
            const one = (lab, i) => {
              const cl = U("Radio", lab, "&" + r.code, String(i));
              if (ev) out.add(ch + " = " + R(cl) + " || " + ch);
              else st1(cl);
            };
            if (li) {
              out.open("for i, item := range " + li.arr);
              if (p.inline) ifActs("i > 0", () => st1(U("SameLine")));
              one("item", "i");
              out.close();
            } else {
              items.forEach((it, i) => {
                if (i && p.inline) st1(U("SameLine"));
                one(q(it), i);
              });
            }
            if (ev) ifActs(andEn(ch), () => fireChange(r));
            break;
          }
          case "slider": {
            const b = bound(["float", "int"]);
            if (b && b.type === "int") {
              valueWidget(U("SliderInt", label(p.label), "&" + b.code, String(Math.round(p.min)), String(Math.round(p.max))), b);
            } else {
              const r = b || own("double", +p.value || 0);
              valueWidget(p.fmt ? U("SliderFmt", label(p.label), "&" + r.code, numLit(p.min), numLit(p.max), q(p.fmt)) : U("Slider", label(p.label), "&" + r.code, numLit(p.min), numLit(p.max)), r);
            }
            hover();
            break;
          }
          case "slider_int": {
            const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
            valueWidget(U("SliderInt", label(p.label), "&" + r.code, String(Math.round(p.min)), String(Math.round(p.max))), r);
            hover();
            break;
          }
          case "input": {
            const cap = Math.max(2, p.cap | 0 || 64);
            const b = bound(["string"]);
            if (st.scope && !b) return warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
            const r = b || own("str", p.text || "", cap);
            const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
            const capN = b ? b.cap : cap;
            if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint && capN === 256) {
              valueWidget(U("Input", label(p.label), "&" + r.code), r);
              hover();
              break;
            }
            st1(U("InputEx", label(p.label), "&" + r.code, flagNode(IFLAGS, fp), q(p.hint || ""), String(capN)));
            if (changeEvents()) ifActs(andEn(fp.enter ? "ui.Changed && !ui.Entered" : "ui.Changed"), () => fireChange(r));
            if (has("enter")) ifActs(andEn("ui.Entered"), () => emitActions(out, on.enter, where("enter")));
            hover();
            break;
          }
          case "text_edit": {
            const b = bound(["string"]);
            if (st.scope && !b) return warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
            const r = b || own("str", p.text || "", Math.max(2, p.cap | 0 || 4096));
            valueWidget(U("TextEdit", q(nm), "&" + r.code, numLit(p.h), flagNode(EFLAGS, p)), r);
            break;
          }
          case "combo": {
            const li = listInfo(n);
            const items = li ? li.items : GM.lines(p.items);
            const r = bound(["int"]) || own("int", p.sel | 0);
            const arr = li ? li.arr : constArr(nm + "_items", items.length ? items : [""]);
            valueWidget(U("Combo", label(p.label), "&" + r.code, arr), r);
            hover();
            break;
          }
          case "selectable": {
            const li = listInfo(n);
            const items = li ? li.items : GM.lines(p.items);
            const r = bound(["int"]) || own("int", p.sel | 0);
            const arr = li ? li.arr : constArr(nm + "_items", items.length ? items : ["Item"]);
            const ev = changeEvents();
            out.open("for i, item := range " + arr);
            ifActs(U("Selectable", "item", r.code + " == i"), () => {
              out.add(r.code + " = i");
              if (ev && en) ifActs(en, () => fireChange(r));
              else if (ev) fireChange(r);
            });
            out.close();
            break;
          }
          case "color": {
            const r = bound(["color"]) || own("color", p.color >>> 0);
            valueWidget(U("Color", label(p.label), "&" + r.code), r);
            hover();
            break;
          }
          case "progress": {
            const b = bound(["float", "int"]);
            let val = numLit(p.value);
            if (b) {
              const lo = +b.v.min, hi = +b.v.max;
              val = b.type === "int" ? call("float64", b.code) : b.code;
              if (hi > lo && !(lo === 0 && hi === 1)) val = bin("/", lo ? bin("-", val, numLit(lo)) : val, numLit(hi - lo));
            }
            st1(U("Progress", val, p.label ? label(p.label) : '""'));
            hover();
            break;
          }
          case "table":
          case "plot_lines":
          case "plot_bars":
          case "image": {
            emitData(n, out, nm);
            if (n.type === "image") hover();
            break;
          }
          case "el": {
            emitInstance(n, out, ptype);
            return;
          }
          default:
            warn(n.id, "dont know how to export " + n.type);
            return;
        }
        tooltip();
      }

      function decl2(kind, name, type, init) {
        if (st.scope) {
          warn("", "windows and splits cant go inside a custom element");
          return "nil";
        }
        return addField(name, type, init);
      }

      function emitData(n, out, nm) {
        const p = n.p || {};
        const U = (f, ...args) => out.add(R(call("ui." + f, ...args)));
        switch (n.type) {
          case "table": {
            const cols = GM.lines(p.cols).map((x) => {
              const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
              return [m[1].trim(), m[2] ? +m[2] : 0];
            });
            if (!cols.length) cols.push(["Column", 0]);
            const rows = GM.lines(p.rows).map((r) => {
              const cells = r.split(",").map((x) => x.trim());
              while (cells.length < cols.length) cells.push("");
              return cells.slice(0, cols.length);
            });
            const id = pkgFree((st.scope ? st.scope.prefix + "_" : "") + nm + "_rows");
            consts.push("var " + id + " = [][]string{" + rows.map((r) => "{" + r.map(q).join(", ") + "}").join(", ") + "}");
            out.open("if " + R(call("ui.Table", q(nm), String(cols.length), numLit(p.h), flagNode(TFLAGS, p))));
            cols.forEach((cl) => U("TableColumn", q(cl[0]), numLit(cl[1])));
            out.open("for _, row := range " + id);
            out.add("ui.TableRow()");
            out.open("for j, cell := range row");
            out.add("if j > 0 {");
            out.add("    ui.TableNext()");
            out.add("}");
            out.add("ui.Label(cell)");
            out.close();
            out.close();
            out.close();
            out.add("ui.End()");
            break;
          }
          case "plot_lines":
          case "plot_bars": {
            const vals = floats(p.values);
            decl("floats", nm, vals);
            const ref = st.scope ? st.scope.alias[nm] : "s." + camel(nm);
            U(n.type === "plot_lines" ? "PlotLines" : "PlotBars", q(p.label), ref, numLit(p.min), numLit(p.max), numLit(p.h));
            break;
          }
          case "image": {
            need.placeholder = true;
            U("Image", "placeholder", numLit(p.w), numLit(p.h), numLit(p.radius));
            break;
          }
        }
      }

      const litOf = (type, v) => {
        if (type === "color") return hex(v);
        if (type === "bool") return v ? "true" : "false";
        if (type === "text") return q(v == null ? "" : v);
        return numLit(v);
      };
      const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");
      const elFn = (def) => {
        let e = used.get(def.id);
        if (!e) {
          e = { def };
          used.set(def.id, e);
        }
        if (!e.fn) e.fn = pkgFree(def.name + "_el");
        return e;
      };

      function emitInstance(n, out, ptype) {
        const p = n.p;
        const def = defs.get(p.el);
        if (!def) return warn(n.id, "this custom element is gone from the library, skipped");
        if (st.scope) return warn(n.id, "custom elements cant go inside custom elements yet");
        const nm = st.nm.get(n.id) || GM.ident(p.var || def.name);
        const info = elFn(def);
        if (ptype === "overlay") out.add(R(call("ui.Pos", numLit(p.x), numLit(p.y))));
        const args = def.params.map((pr) => litOf(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def));
        const w = +p.w || def.w, h = +p.h || def.h;
        let ownInit = w !== def.w || h !== def.h;
        const sv = def.state.map((s) => {
          const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
          if (v !== s.def) ownInit = true;
          return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
        });
        let init = "nil";
        if (ownInit) {
          const id = pkgFree(nm + "_init");
          consts.push("var " + id + " = []float64{" + [w, h].concat(sv).map(numLit).join(", ") + "}");
          init = id;
        }
        const val = hasValue(def);
        const on = n.on || {};
        const evk = ["click", "change", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
        if (evk.length) info.mask = true;
        const m = evk.length ? "m" + ++st.k : null;
        const a = ["ui", q(nm)].concat(args, [init]);
        const callS = R(call(info.fn, ...a));
        if (val) {
          addField(nm + "_value", "float64", "0");
          if (m) out.add("var " + m + " int");
          out.add((m || "_") + ", s." + camel(nm + "_value") + " = " + callS);
        } else out.add((m ? m + " := " : "") + callS);
        if (m) {
          const bit = { change: 1, click: 2, dragend: 4 };
          for (const e of ["change", "click", "dragend"]) {
            if (!evk.includes(e)) continue;
            out.open("if " + R(bin("!=", bin("&", m, String(bit[e])), "0")));
            emitActions(out, on[e], def.name + " " + e);
            out.close();
          }
          if (evk.includes("hover")) {
            const hv = takeNm(nm + "_hot");
            addField(hv, "bool", "false");
            const hvc = "s." + camel(hv);
            out.open("if " + R(bin("!=", bin("&", m, "8"), "0")) + " && !" + hvc);
            emitActions(out, on.hover, def.name + " hover");
            out.close();
            out.add(hvc + " = " + R(bin("!=", bin("&", m, "8"), "0")));
          }
        }
      }

      function paramNames(def) {
        if (def._pn) return def._pn;
        const used2 = new Set(LOCALS);
        const map = new Map();
        for (const pr of def.params) {
          let v = camel(GM.ident(pr.name)), i = 2;
          const b = v;
          while (used2.has(v)) v = b + i++;
          used2.add(v);
          map.set(pr.name, v);
        }
        return map;
      }

      function elementCode(info) {
        const def = info.def;
        const wr = (msg, id) => warn(id || def.id, def.name + ": " + msg);
        const types = GM.elementIdents(def);
        const groups = GM.dragGroups(def);
        const rs = !!(def.resizable && def.resizable.on);
        const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
        const prNames = new Set(def.params.map((x) => x.name));
        const pn = paramNames(def);
        for (const s of def.state) if (builtin.has(s.name)) wr("state " + s.name + " clashes with a built in name");
        for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) wr("param " + s.name + " clashes with another name");

        const scope = { slots: [], alias: {}, prefix: def.name };
        const wout = new Out(false);
        {
          const local = new Map();
          const taken = new Set(LOCALS);
          for (const v of pn.values()) taken.add(v);
          GM.walkParts(def.parts, (pt) => {
            if (pt.kind !== "widget" || !pt.w) return;
            const b = camel(GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type));
            let k = b, i = 2;
            while (taken.has(k)) k = b + i++;
            taken.add(k);
            local.set(pt.w.id, k);
          });
          const saveNm = st.nm;
          st.nm = local;
          st.scope = scope;
          GM.walkParts(def.parts, (pt) => {
            if (pt.kind !== "widget" || !pt.w) return;
            const t = pt.w.type;
            if (GM.isContainer(t) || t === "window" || t === "el") wr("widget parts can only be simple widgets, skipped a " + t, pt.id);
            else if (t === "input" || t === "text_edit") wr("text boxes cant keep their text in goome_ui_store, skipped " + t, pt.id);
            else emitNode(pt.w, wout, "element");
          });
          st.scope = null;
          st.nm = saveNm;
        }

        const idxs = {};
        let N = 0;
        const slot = (k) => (idxs[k] = N++);
        ["init", "w", "h", "value", "hot"].forEach(slot);
        def.state.forEach((s) => slot("s:" + s.name));
        groups.forEach((g) => {
          const gv = GM.partVar(g);
          [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
        });
        if (rs) slot("rw"), slot("rh");
        scope.slots.forEach((w) => slot("w:" + w.name));
        const S = (k) => "st[" + idxs[k] + "]";
        const map = {
          id: (name) => {
            if (prNames.has(name)) return pn.get(name);
            if (name === "w" || name === "h" || name === "value") return S(name);
            if (name === "hovered" || name === "pressed" || name === "dragging") return name;
            const s = def.state.find((x) => x.name === name);
            if (s) return s.type === "bool" ? bin("!=", S("s:" + name), "0") : S("s:" + name);
            if (idxs[name] != null) return S(name);
            return name;
          },
          th: (f) => "th." + pascal(f),
        };
        const ex = (src, want, where) => {
          if (src === "" || src == null) return want === "c" ? "0x00000000" : "0";
          let r;
          if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 }, type: "c" };
          else r = GM.expr.check(src, types, want);
          if (!r.ok) {
            wr(where + ": " + r.err);
            return want === "c" ? "0x00000000" : "0";
          }
          const res = finishExpr(r, want, map, types);
          return res;
        };
        const exb = (src, where) => {
          const r = GM.expr.check(src, types, "b");
          if (!r.ok) {
            wr(where + ": " + r.err);
            return null;
          }
          return finishExpr(r, "b", map, types);
        };

        const blob = JSON.stringify(def.parts);
        const evs = (on) => (def.events || []).filter((e) => e.on === on);
        const reads = {
          hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
          pressed: /\bpressed\b/.test(blob),
          dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
          pressed_now: evs("press").length > 0,
          clicked: evs("click").length > 0,
          released: evs("release").length > 0,
        };
        const mask = !!info.mask;
        if (mask) reads.hovered = reads.clicked = reads.dragend = true;
        const fo = reads.clicked || reads.pressed_now;
        const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;
        const val = hasValue(def);

        const T = { num: "float64", color: "uint32", bool: "bool", text: "string" };
        const pargs = ["ui *goome.UI", "id string"].concat(def.params.map((pr) => pn.get(pr.name) + " " + T[pr.type]), ["start []float64"]);
        const o = new Out(false);
        const A = (s) => o.add(typeof s === "string" ? s : R(s));
        const open = (h) => o.open(h);
        const close = () => o.close();
        const iff = (cond) => open("if " + (typeof cond === "string" ? cond : R(cond)));
        const dbl = (nme, e) => A(nme + " := " + R(e));
        const fn = info.fn;
        const rets = val ? "(int, float64)" : "int";
        o.d = 0;
        o.l.push("func " + fn + "(" + pargs.join(", ") + ") " + rets + " {");
        o.d = 1;
        A("st := ui.Store(id, " + N + ")");
        iff("len(st) < " + N);
        A(val ? "return 0, 0" : "return 0");
        close();
        iff(S("init") + " == 0");
        A(S("init") + " = 1");
        A(S("w") + " = " + numLit(def.w));
        A(S("h") + " = " + numLit(def.h));
        def.state.forEach((s) => A(S("s:" + s.name) + " = " + (s.type === "bool" ? (s.def ? "1" : "0") : numLit(s.def))));
        scope.slots.forEach((w) => A(S("w:" + w.name) + " = " + (w.kind === "color" ? hex(w.val) : numLit(w.val))));
        iff("start != nil");
        A(S("w") + " = start[0]");
        A(S("h") + " = start[1]");
        def.state.forEach((s, i) => A(S("s:" + s.name) + " = start[" + (i + 2) + "]"));
        close();
        const clampE = (v, lo, hi) => call("max", lo, call("min", hi, v));
        const vd = def.value || {};
        const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
        if (val && vd.src === "drag") A(S("value") + " = " + (vst ? S("s:" + vst.name) : numLit(+vd.min || 0)));

        const groupBase = new Map();
        const baseWalk = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind !== "group") continue;
            const gx = ex(pt.f.x, "n", pt.name + " x"), gy = ex(pt.f.y, "n", pt.name + " y");
            const dg = pt.drag && pt.drag.on;
            const sx = plus(bx, gx), sy = plus(by, gy);
            const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
            groupBase.set(pt.id, { sx, sy, ax, ay });
            baseWalk(pt.kids || [], ax, ay);
          }
        };
        baseWalk(def.parts, "0", "0");
        const bounds = (g) => {
          const b = groupBase.get(g.id), d = g.drag;
          const gw = ex(g.f.w, "n", g.name + " w"), gh = ex(g.f.h, "n", g.name + " h");
          if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
          if (d.bounds === "rect") {
            const Rc = d.rect || {};
            return {
              x: [minus(numLit(+Rc.x || 0), b.sx), minus(minus(numLit((+Rc.x || 0) + (+Rc.w || 0)), gw), b.sx)],
              y: [minus(numLit(+Rc.y || 0), b.sy), minus(minus(numLit((+Rc.y || 0) + (+Rc.h || 0)), gh), b.sy)],
            };
          }
          return null;
        };
        const tOf = (o2, r) => {
          const lo = r[0], hi = r[1];
          return call("pick[float64]", bin(">", hi, lo), bin("/", minus(o2, lo), minus(hi, lo)), "0");
        };
        if (val && vd.src === "drag") {
          const g = groups.find((x) => x.id === vd.part);
          const r = g && bounds(g);
          if (!g) wr("the value comes from a drag but no drag group is picked");
          else if (!r) wr("a value from a drag needs bounds on " + g.name, g.id);
          else {
            const ax = vd.axis === "y" ? "y" : "x";
            const span = (+vd.max || 0) - (+vd.min || 0);
            const t = span ? clampE(span === 1 ? minus(S("value"), numLit(+vd.min || 0)) : bin("/", minus(S("value"), numLit(+vd.min || 0)), numLit(span)), "0", "1") : "0";
            A(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + R(plus(r[ax][0], times(t, minus(r[ax][1], r[ax][0])))));
          }
        }
        close();

        scope.slots.forEach((w) => {
          const v = S("w:" + w.name), lname = w.name;
          let e;
          if (w.kind === "double") e = v;
          else if (w.kind === "color") e = R(call("uint32", v));
          else if (w.kind === "int") e = R(call("int", v));
          else e = v + " != 0";
          A(lname + " := " + e);
        });

        const flagsDecl = ["changed", "hovered", "pressed", "dragging", "pressedNow", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k === "pressedNow" ? "pressed_now" : k]);
        A("var " + flagsDecl.join(", ") + " bool");
        A("ui.ID(id)");
        const items = ["el", "o"];
        const IF = (k) => ({ 0: "0", x: "goome.ItemDragX", y: "goome.ItemDragY", xy: bin("|", "goome.ItemDragX", "goome.ItemDragY"), nohit: "goome.ItemNoHit", fo: "goome.ItemFocusable" })[k];
        const F = (it, f) => it + "." + pascal(f);
        const custom = (name, sid, w, h, fl) => A(name + ", _ := " + R(call("ui.Custom", q(sid), w, h, fl)));
        const pos = (x, y) => A(call("ui.Pos", x, y));
        const declAt = o.l.length;
        custom("el", "##el", S("w"), S("h"), IF("nohit"));
        pos("0", "0");
        custom("o", "##o", "1", "1", IF("nohit"));
        A("ox, oy := " + R(bin("-", F("el", "x"), F("o", "x")), 2) + ", " + R(bin("-", F("el", "y"), F("o", "y")), 2));
        const acc = (it, click) => {
          const L = [];
          const set = (k, e) => {
            const key = k === "pressed_now" ? "pressedNow" : k;
            if (!reads[k]) return;
            L.push(key + " = " + key + " || " + e);
          };
          set("hovered", F(it, "hovered") + " || " + F(it, "held"));
          set("pressed", F(it, "held"));
          set("pressed_now", F(it, "pressed"));
          if (click) set("clicked", F(it, "clicked"));
          set("released", F(it, "released"));
          if (!click) set("dragend", F(it, "released"));
          L.forEach(A);
        };
        if (rs) {
          const Rz = def.resizable;
          pos(plus("ox", minus(S("w"), "14")), plus("oy", minus(S("h"), "14")));
          items.push("rs");
          custom("rs", "##rs", "14", "14", IF("xy"));
          iff(F("rs", "pressed"));
          A(S("rw") + ", " + S("rh") + " = " + S("w") + ", " + S("h"));
          close();
          iff(F("rs", "held"));
          A(S("w") + " = " + R(clampE(bin("+", S("rw"), F("rs", "drag_x")), numLit(Rz.minW), numLit(Rz.maxW))));
          A(S("h") + " = " + R(clampE(bin("+", S("rh"), F("rs", "drag_y")), numLit(Rz.minH), numLit(Rz.maxH))));
          A("changed = true");
          if (reads.dragging) A("dragging = true");
          close();
          acc("rs", false);
        }
        const bboxOf = (pt, bx, by) => {
          const f = pt.f, whr = (k) => (pt.name || pt.kind) + " " + k;
          const e = (k) => ex(f[k], "n", whr(k));
          switch (pt.kind) {
            case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
              return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
            case "circle": case "ring": case "arc":
              return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), times("2", e("r")), times("2", e("r"))];
            case "line":
              need.math = true;
              return [plus(bx, call("min", e("x0"), e("x1"))), plus(by, call("min", e("y0"), e("y1"))), call("max", "1", call("math.Abs", minus(e("x1"), e("x0")))), call("max", "1", call("math.Abs", minus(e("y1"), e("y0"))))];
            case "text": {
              const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
              const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
              const len = pr ? call("float64", call("len", pn.get(pr.name))) : String(Array.from(String(f.text || "")).length);
              return [plus(bx, e("x")), plus(by, e("y")), times(times(len, e("size")), "0.55"), times(e("size"), "1.25")];
            }
          }
          wr((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
          return null;
        };
        let mathUsed = false;
        for (let i = groups.length - 1; i >= 0; i--) {
          const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
          let r = null;
          if (d.handle) {
            let hp = null;
            GM.walkParts(g.kids || [], (pt) => {
              if (pt.id === d.handle) hp = pt;
            });
            if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
            else wr("drag handle part not found in " + g.name + ", using the group box", g.id);
          }
          if (!r) r = [b.ax, b.ay, ex(g.f.w, "n", g.name + " w"), ex(g.f.h, "n", g.name + " h")];
          const it = "h" + pascal(gv);
          items.push(it);
          pos(plus("ox", r[0]), plus("oy", r[1]));
          custom(it, "##" + gv, r[2], r[3], IF(d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"));
          const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
          iff(F(it, "pressed"));
          A(sx + ", " + sy + " = " + dx + ", " + dy);
          close();
          iff(F(it, "held"));
          const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
          const bd = bounds(g);
          const snap = +d.snap || 0;
          for (const a of axes) {
            const n2 = "n" + a;
            let e = bin("+", a === "x" ? sx : sy, F(it, a === "x" ? "drag_x" : "drag_y"));
            dbl(n2, e);
            if (snap > 0) {
              mathUsed = true;
              A(n2 + " = " + R(times(call("math.Floor", bin("+", bin("/", n2, numLit(snap)), "0.5")), numLit(snap))));
            }
            if (bd) A(n2 + " = " + R(clampE(n2, bd[a][0], bd[a][1])));
          }
          iff(axes.map((a) => "n" + a + " != " + (a === "x" ? dx : dy)).join(" || "));
          for (const a of axes) A((a === "x" ? dx : dy) + " = n" + a);
          A("changed = true");
          if (val && vd.src === "drag" && vd.part === g.id) {
            const a = vd.axis === "y" ? "y" : "x";
            if (bd) {
              const span = (+vd.max || 0) - (+vd.min || 0);
              const t = tOf(a === "x" ? dx : dy, bd[a]);
              need.pick = true;
              A(S("value") + " = " + R(plus(numLit(+vd.min || 0), span === 1 ? t : times(t, numLit(span)))));
              if (vst) A(S("s:" + vst.name) + " = " + S("value"));
            }
          }
          close();
          if (reads.dragging) A("dragging = true");
          close();
          acc(it, false);
        }
        if (def.hit === "parts") {
          let k = 0;
          const walkHit = (parts, bx, by) => {
            for (const pt of parts) {
              if (pt.kind === "group") {
                const b = groupBase.get(pt.id);
                if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
                walkHit(pt.kids || [], b.ax, b.ay);
              } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
            }
          };
          const hitOne = (pt, bx, by) => {
            const r = bboxOf(pt, bx, by);
            if (!r) return;
            const it = "hit" + k;
            items.push(it);
            pos(plus("ox", r[0]), plus("oy", r[1]));
            custom(it, "##hit" + k++, r[2], r[3], fo ? IF("fo") : IF(0));
            acc(it, true);
          };
          walkHit(def.parts, "0", "0");
          if (!k && !groups.length && !rs && !deco) wr("hit mode is parts but no part is a hit area, nothing can be clicked");
        } else {
          items.push("box");
          pos("ox", "oy");
          custom("box", "##box", S("w"), S("h"), deco ? IF("nohit") : fo ? IF("fo") : IF(0));
          acc("box", true);
        }
        if (!o.l.slice(declAt + 4).some((l) => /\b(ox|oy)\b/.test(l))) {
          o.l.splice(declAt + 1, 3);
          items.splice(items.indexOf("o"), 1);
        }

        const actLines = (on) => {
          for (const e of evs(on)) {
            if (e.act === "print") {
              A(R(call("fmt.Println", q(e.text || ""))));
              continue;
            }
            const tg = def.state.find((s) => s.name === e.target);
            if (!tg) {
              wr(on + " event needs a state to change, skipped");
              continue;
            }
            const t = S("s:" + tg.name);
            if (e.act === "toggle") A(t + " = " + R(call("pick[float64]", bin("!=", t, "0"), "0", "1")));
            else if (e.act === "add") {
              if (tg.type === "bool") {
                wr("cant add to a yes/no state");
                continue;
              }
              A(t + " += " + R(ex(e.expr || "0", "n", on + " event")));
            } else if (e.act === "set") {
              if (tg.type === "bool") {
                const b = exb(e.expr || "false", on + " event");
                if (b == null) continue;
                A(t + " = " + R(call("pick[float64]", b, "1", "0")));
              } else A(t + " = " + R(ex(e.expr || "0", "n", on + " event")));
            }
            A("changed = true");
          }
        };
        const evBlock = (cond, on) => {
          if (!evs(on).length) return;
          iff(cond);
          actLines(on);
          close();
        };
        if (evs("enter").length || evs("leave").length) {
          evBlock("hovered && " + S("hot") + " == 0", "enter");
          evBlock("!hovered && " + S("hot") + " != 0", "leave");
          A(S("hot") + " = " + R(call("pick[float64]", "hovered", "1", "0")));
        }
        evBlock("pressedNow", "press");
        evBlock("dragging", "drag");
        evBlock("clicked", "click");
        evBlock("released", "release");
        if (val && vd.src === "state") {
          const vs = def.state.find((s) => s.name === vd.state);
          if (vs) A(S("value") + " = " + S("s:" + vs.name));
          else wr("value state " + (vd.state || "(none)") + " is missing");
        }

        const D = new Out(false);
        const ELX = F("el", "x"), ELY = F("el", "y");
        const drawParts = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind === "widget" || pt.kind === "hit") continue;
            const whr = (k) => (pt.name || pt.kind) + " " + k;
            const N2 = (k) => ex(pt.f[k], "n", whr(k));
            const Cc = (k) => ex(pt.f[k], "c", whr(k));
            const X0 = (k) => plus(bx, N2(k));
            const Y0 = (k) => plus(by, N2(k));
            const lines = [];
            const cl = (fnc, ...args) => lines.push(R(call("c." + fnc, ...args)));
            switch (pt.kind) {
              case "rect": cl("Rect", X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")); break;
              case "rrect": cl("RRect", X0("x"), Y0("y"), N2("w"), N2("h"), "goome.Radii{TL: " + R(N2("tl")) + ", TR: " + R(N2("tr")) + ", BR: " + R(N2("br")) + ", BL: " + R(N2("bl")) + "}", Cc("color")); break;
              case "frame": cl("Frame", X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")); break;
              case "line": cl("Line", X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")); break;
              case "circle": cl("Circle", X0("cx"), Y0("cy"), N2("r"), Cc("color")); break;
              case "ring": cl("Ring", X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")); break;
              case "arc": cl("Arc", X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")); break;
              case "poly": {
                const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
                if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
                  wr(whr("points") + ": needs 3 or more x,y pairs", pt.id);
                  break;
                }
                const flat = [];
                pts.forEach((xy) => flat.push(R(plus(bx, ex(xy[0], "n", whr("points")))), R(plus(by, ex(xy[1], "n", whr("points"))))));
                cl("Poly", "[]float64{" + flat.join(", ") + "}", Cc("color"));
                break;
              }
              case "grad": cl("RRectGrad", X0("x"), Y0("y"), N2("w"), N2("h"), "goome.Radius(" + R(N2("radius")) + ")", Cc("from"), Cc("to"), pt.f.sideways ? "true" : "false"); break;
              case "shadow": cl("Shadow", X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")); break;
              case "text": {
                const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
                let tx;
                if (m) {
                  const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
                  if (!pr) {
                    wr(whr("text") + ": no text param called " + m[1], pt.id);
                    tx = '""';
                  } else tx = pn.get(pr.name);
                } else tx = q(pt.f.text || "");
                cl("FontText", "nil", N2("size"), X0("x"), Y0("y"), tx, Cc("color"));
                break;
              }
              case "bitmap": {
                const file = String(pt.f.file || "picture.png");
                const bid = addBitmap("bm_" + def.name + "_" + GM.partVar(pt), file, pt.f.img);
                const tint = pt.f.tint === "" || pt.f.tint == null ? hex(0xFFFFFFFF) : Cc("tint");
                const a = [X0("x"), Y0("y"), N2("w"), N2("h")];
                lines.push("if " + bid + " != nil {");
                lines.push("    " + R(call("c.Bitmap", bid, ...a, "goome.Radius(" + R(N2("radius")) + ")", tint)));
                lines.push("}");
                break;
              }
              case "group": {
                const b = groupBase.get(pt.id);
                const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
                if (pt.f.clip) lines.push(R(call("c.ClipPush", ax, ay, N2("w"), N2("h"))));
                const keep = D.l.length, sd = D.d;
                D.d = 0;
                drawParts(pt.kids || [], ax, ay);
                const kid = D.l.splice(keep);
                D.d = sd;
                kid.forEach((l) => lines.push(l));
                if (pt.f.clip) lines.push("c.ClipPop()");
                break;
              }
            }
            if (!lines.length) continue;
            if (pt.show) {
              const b = exb(pt.show, (pt.name || pt.kind) + " show");
              if (b == null) continue;
              D.add("if " + R(b) + " {");
              lines.forEach((l) => D.add("    " + l));
              D.add("}");
            } else lines.forEach((l) => D.add(l));
          }
        };
        drawParts(def.parts, ELX, ELY);
        if (D.l.length) {
          const usesTh = D.l.some((l) => /\bth\./.test(l));
          open("if c := ui.Canvas(); c != nil");
          if (usesTh) A("th := ui.Theme()");
          D.l.forEach((l) => o.add(l));
          close();
        }
        wout.l.forEach((l) => o.add(l));
        scope.slots.forEach((w) => {
          const v = S("w:" + w.name), id = w.name;
          if (w.kind === "bool") {
            need.pick = true;
            A(v + " = " + R(call("pick[float64]", id, "1", "0")));
          } else if (w.kind === "double") A(v + " = " + id);
          else A(v + " = " + R(call("float64", id)));
        });
        A("ui.End()");
        const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]]));
        if (val) A("value := " + S("value"));
        need.pick = true;
        const m = bits.map((b) => (b[1] === 1 ? "pick(" + b[0] + ", 1, 0)" : "pick(" + b[0] + ", " + b[1] + ", 0)")).join(" | ");
        A("return " + m + (val ? ", value" : ""));
        if (mathUsed) need.math = true;
        o.d = 0;
        o.add("}");
        let lines = o.l;
        lines = tidyItems(lines, items, flagsDecl);
        return lines.join("\n");
      }

      function tidyItems(lines, items, flagsDecl) {
        for (const name of items) {
          const re = new RegExp("\\b" + name + "\\b");
          const at = lines.findIndex((l) => l.startsWith("    " + name + ", _ := "));
          if (at < 0) continue;
          const others = lines.filter((l, i) => i !== at);
          if (!others.some((l) => re.test(l))) lines[at] = lines[at].replace(name + ", _ := ", "");
        }
        const drop = [];
        for (const k of ["dragging", "pressed", "hovered", "pressedNow", "clicked", "released", "dragend"]) {
          if (!flagsDecl.includes(k)) continue;
          const re = new RegExp("\\b" + k + "\\b");
          const reUse = lines.some((l) => !/^\s+var /.test(l) && !new RegExp("^\\s+" + k + " = (true|" + k + " \\|\\| .*)$").test(l) && re.test(l));
          if (!reUse) drop.push(k);
        }
        if (drop.length) {
          const left = flagsDecl.filter((k) => !drop.includes(k));
          const out = [];
          for (const l of lines) {
            if (/^\s+var changed/.test(l)) out.push("    var " + left.join(", ") + " bool");
            else if (drop.some((k) => new RegExp("^\\s+" + k + " = (true|" + k + " \\|\\| .*)$").test(l))) continue;
            else out.push(l);
          }
          lines = out;
        }
        return lines;
      }

      const bitmaps = new Map();
      function addBitmap(id, file, img) {
        if (bitmaps.has(id)) return bitmaps.get(id).name;
        const set = Object.assign({}, GM.SETTINGS_DEFAULT, project.settings || {});
        let b64 = set.iconSource === "embed" ? dataB64(img) : null;
        if (set.iconSource === "embed" && !b64) warn("", file + " has no image data to embed, the code loads the file instead");
        if (!b64) files.add(file);
        const name = pkgFree(id);
        bitmaps.set(id, { file, b64, name });
        return name;
      }
      const dataB64 = (img) => {
        const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(img || ""));
        return m ? m[1].replace(/\s+/g, "") : null;
      };

      function fontLines(t, k, v) {
        const slot = "goome.Font" + pascal(k.replace(/^font_/, ""));
        return ["if f, err := goome.SystemFont(" + q(v) + "); err == nil {", "    " + t + ".SetFont(" + slot + ", f)", "}"];
      }
      function themeDiff(t, base, tv) {
        const L = [];
        for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
          const differs = GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
          if (!differs) continue;
          L.push(tv + "." + pascal(k) + " = " + fieldLit(k, t[k]));
        }
        for (const k of GM.THEME_FONTS) if (t[k]) L.push(...fontLines(tv, k, t[k]));
        return L;
      }
      function themeLines() {
        const t = GM.applyQuick(GM.normTheme(project.theme));
        const L = [];
        if (t.quick) {
          const qk = t.quick;
          L.push("t.Make(" + hex(qk.accent) + ", " + (qk.dark ? "true" : "false") + ", " + numLit(qk.radius) + ")");
          for (const k of GM.THEME_FONTS) if (t[k]) L.push(...fontLines("t", k, t[k]));
        } else {
          const pr = GM.presetOf(t);
          if (pr && pr.id !== "dark") {
            const e = GM.PRESET_ENUM[pr.id];
            L.push("t.Preset(goome.Preset" + pascal(e.toLowerCase()) + ")");
            L.push(...themeDiff(t, pr, "t"));
          } else {
            if (t.base === "light") L.push("t.Light()");
            L.push(...themeDiff(t, GM.themeBase(t), "t"));
          }
        }
        const icons = Object.keys(t.icons || {}).filter((k) => GM.ICON_NAMES.includes(k));
        const extra = GM.EXTRA_SKINS.filter((k) => t[k]);
        for (const k of GM.THEME_SKINS.concat(extra)) {
          const s = t[k];
          if (!s) continue;
          const id = addBitmap(k, s.file, s.img);
          const e = [s.l, s.t, s.r, s.b].map(numLit).join(", ");
          L.push("if " + id + " != nil {", "    t.SetSkin(goome.Skin" + pascal(k.replace(/^skin_/, "")) + ", goome.NewSkin(" + id + ", " + e + "))", "}");
        }
        for (const k of icons) {
          const id = addBitmap("icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
          L.push("if " + id + " != nil {", "    t.SetIcon(goome.Icon" + pascal(k) + ", " + id + ")", "}");
        }
        if (t.icon_tint) L.push("t.IconTint = 1");
        return L;
      }
      function configLines() {
        const cfg = GM.normConfig(project.config), def = GM.normConfig({});
        const t = GM.normTheme(project.theme);
        const C = [], L = [];
        for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) C.push("cfg." + pascal(k) + " = " + numLit(cfg[k]));
        for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) C.push("cfg." + pascal(k) + " = " + cfg[k]);
        for (const [k] of GM.CFG_CURSORS) {
          if (cfg.cursor[k] === def.cursor[k]) continue;
          C.push("cfg.Cursor[goome.Cur" + pascal(k) + "] = goome.Cursor" + CUR[cfg.cursor[k]]);
        }
        if (cfg.mask !== def.mask) C.push("cfg.SetMask(" + q(cfg.mask) + ")");
        if (C.length) L.push("cfg := ui.Config()", ...C);
        for (const [k] of GM.CFG_KEYS) {
          if (cfg.keys[k] === def.keys[k]) continue;
          L.push("ui.Bind(goome.Act" + pascal(k) + ", " + q(cfg.keys[k].trim()) + ")");
        }
        if (t.quick && t.quick.scale !== 1) L.push("ui.Scale(" + numLit(t.quick.scale) + ")");
        return L;
      }
      function sectionThemes() {
        const L = [];
        for (const [id, v] of st.themeVars || []) {
          const t = GM.normTheme(GM.findTheme(project, id));
          let fn = "make" + v[0].toUpperCase() + v.slice(1), fi = 2;
          const fb = fn;
          while (st.pkgUsed.has(fn) || LOCALS.has(fn)) fn = fb + fi++;
          st.pkgUsed.add(fn);
          L.push({ fn, v, lines: ["t := ui.Theme()", "saved := *t", "t" + (t.base === "light" ? ".Light()" : ".Dark()")].concat(themeDiff(t, GM.themeBase(t), "t"), ["made := *t", "*t = saved", "return made"]) });
        }
        return L;
      }

      function hotkeyBody(out) {
        const hk = (project.hotkeys || []).filter((k) => k && k.combo);
        if (!hk.length) return hk;
        out.add("switch id {");
        hk.forEach((k, i) => {
          out.add("case " + (i + 1) + ":");
          out.d++;
          emitActions(out, k.actions, "hotkey " + k.combo);
          out.d--;
        });
        out.add("}");
        return hk;
      }

      const app = project.mode === "app";
      const out = new Out(false);
      out.d = 1;
      if (app) {
        emitList(project.root, out, "app");
        if (project.app.statusbar) out.add(R(call("ui.Statusbar", textCode(project.app.status || "", {}).n)));
      } else emitList(project.root, out, "overlay");
      const hout = new Out(false);
      hout.d = 1;
      const hks = hotkeyBody(hout);
      const els = [];
      for (const info of used.values()) els.push(elementCode(info));
      const th = themeLines();
      const cl = configLines();
      const sec = sectionThemes();
      const bitmapDecl = [], bitmapLoad = [];
      for (const [id, b] of bitmaps) {
        bitmapDecl.push("var " + b.name + " *goome.Bitmap");
        if (b.b64) {
          need.b64 = true;
          bitmapLoad.push(b.name + " = tryLoadData(" + q(b.b64) + ")");
        } else bitmapLoad.push(b.name + " = tryLoad(" + q(b.file) + ")");
      }
      const anyFiles = [...bitmaps.values()].some((b) => !b.b64), anyData = [...bitmaps.values()].some((b) => b.b64);

      const allText = [out.text(), hout.text()].concat(els).join("\n") + th.join("\n") + cl.join("\n");
      const usesStrings = !app;
      if (/\bpick[\[(]/.test(allText)) need.pick = true;
      if (/\bfade\(/.test(allText)) need.fade = true;
      const L = ["package main", "", "import ("];
      if (need.b64) L.push('\t"encoding/base64"');
      L.push('\t"fmt"');
      if (need.math) L.push('\t"math"');
      L.push('\t"os"');
      if (usesStrings) L.push('\t"strings"');
      L.push("", '\t"github.com/goome-ui/go-goome"', ")", "");

      if (fields.length) {
        const w = Math.max(...fields.map((f) => f.name.length));
        L.push("type state struct {");
        fields.forEach((f) => L.push("    " + f.name.padEnd(w) + " " + f.type));
        L.push("}", "");
        const set = fields.filter((f) => !/^(0|false|""|\[\]float32\{\})$/.test(f.init));
        if (set.length) {
          const w2 = Math.max(...set.map((f) => f.name.length));
          L.push("var s = state{");
          set.forEach((f) => L.push("    " + (f.name + ":").padEnd(w2 + 1) + " " + f.init + ","));
          L.push("}", "");
        } else L.push("var s state", "");
      }
      const globals = [];
      if (need.host) globals.push("var host *goome.Goome");
      if (need.placeholder) globals.push("var placeholder *goome.Bitmap");
      globals.push(...bitmapDecl);
      for (const [, v] of st.themeVars || []) globals.push("var " + v + " goome.Theme");
      globals.push(...consts);
      if (globals.length) L.push(...globals, "");
      for (const f of fns) L.push("func " + fnNames.get(f) + "() {", "}", "");
      for (const b of els) L.push(b, "");
      if (th.length) L.push("func setTheme(t *goome.Theme) {", ...th.map((l) => "    " + l), "}", "");
      if (cl.length) L.push("func setConfig(ui *goome.UI) {", ...cl.map((l) => "    " + l), "}", "");
      for (const x of sec) L.push("func " + x.fn + "(ui *goome.UI) goome.Theme {", ...x.lines.map((l) => "    " + l), "}", "");
      L.push("func draw(ui *goome.UI) {", ...out.l, "}", "");
      if (hks.length) L.push("func onHotkey(ui *goome.UI, id int) {", ...hout.l, "}", "");

      const setup = (uiv, gv) => {
        const S = [];
        if (need.host) S.push("host = " + gv);
        S.push(...bitmapLoad);
        if (need.placeholder) S.push("placeholder, _ = goome.BitmapFromARGB([]uint32{0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48}, 2, 2)");
        if (th.length) S.push("setTheme(" + uiv + ".Theme())");
        if (cl.length) S.push("setConfig(" + uiv + ")");
        for (const x of sec) S.push(x.v + " = " + x.fn + "(" + uiv + ")");
        if (hks.length) {
          S.push("for i, combo := range []string{" + hks.map((k) => q(k.combo)).join(", ") + "} {");
          S.push("    if err := " + gv + ".Hotkey(combo, i+1); err != nil {");
          S.push('        fmt.Fprintln(os.Stderr, "couldnt grab", combo+":", err)');
          S.push("    }");
          S.push("}");
        }
        return S;
      };
      L.push("func main() {");
      if (app) {
        L.push("    app := goome.NewApp(" + q(project.title) + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ", " + R(flagNode(AFLAGS, project.app), 2) + ")");
        if (project.app.titlebar) L.push("    app.Options = goome.Options{WindowFlags: goome.WindowResizable | goome.WindowBorderless | goome.WindowTransparent | goome.WindowCenter}");
        const S = setup("a.UI", "a.G");
        if (S.length) L.push("    app.OnStart = func(a *goome.App) {", ...S.map((l) => "        " + l), "    }");
        if (hks.length) L.push("    app.OnEvent = func(a *goome.App, ev goome.Event) bool {", "        if ev.Type == goome.EventHotkey {", "            onHotkey(a.UI, ev.ID)", "        }", "        return false", "    }");
        L.push("    if err := app.Run(draw); err != nil {", '        fmt.Fprintln(os.Stderr, "cant open a window:", err)', "        os.Exit(1)", "    }");
      } else {
        L.push("    g, err := goome.Open(goome.Options{Title: " + q(project.title) + ", NoCapture: true})", "    if err != nil {", '        fmt.Fprintln(os.Stderr, "cant open an overlay:", err)', "        os.Exit(1)", "    }", "    defer g.Close()");
        L.push("    ui, err := g.NewUI()", "    if err != nil {", '        fmt.Fprintln(os.Stderr, "no memory for the ui:", err)', "        os.Exit(1)", "    }", "    defer ui.Free()");
        setup("ui", "g").forEach((l) => L.push("    " + l));
        L.push("    pace := goome.NewPacer(60)", "    defer pace.Free()");
        L.push('    test := strings.HasPrefix(g.BackendName(), "test")', "    running, dirty := true, true", "    for running {", "        wait := 500", "        if dirty || test || ui.Animating() {", "            wait = pace.Wait()", "        }");
        L.push("        for ev := range g.Events(wait) {", "            if ev.Type == goome.EventQuit || ev.Type == goome.EventClose {", "                running = false", "            }");
        if (hks.length) L.push("            if ev.Type == goome.EventHotkey {", "                onHotkey(ui, ev.ID)", "            }");
        L.push("            ui.Feed(ev)", "            dirty = true", "        }", "        if !running {", "            break", "        }");
        L.push("        if !dirty && !test && !ui.Animating() {", "            continue", "        }", "        dirty = false");
        L.push("        if ui.Begin(0) == nil {", "            ui.End()", "            continue", "        }", "        draw(ui)", "        ui.End()", "    }");
      }
      L.push("}", "");

      if (need.pick) L.push("func pick[T any](cond bool, a, b T) T {", "    if cond {", "        return a", "    }", "    return b", "}", "");
      if (need.fade) L.push("func fade(c uint32) uint32 {", "    return c&0xFFFFFF | c>>25<<24", "}", "");
      if (anyFiles) L.push("func tryLoad(path string) *goome.Bitmap {", "    b, err := goome.LoadBitmap(path)", "    if err != nil {", "        return nil", "    }", "    return b", "}", "");
      if (anyData) L.push("func tryLoadData(b64 string) *goome.Bitmap {", "    raw, err := base64.StdEncoding.DecodeString(b64)", "    if err != nil {", "        return nil", "    }", "    b, err := goome.BitmapFromBytes(raw)", "    if err != nil {", "        return nil", "    }", "    return b", "}", "");
      while (L[L.length - 1] === "") L.pop();
      L.push("");
      return { code: tabs(L.join("\n")), files: [...files], file: "main.go" };
    }

    const tabs = (code) => code.replace(/^( {4})+/gm, (m) => "\t".repeat(m.length / 4)).replace(/\n{3,}/g, "\n\n");

    const hint = () => "mkdir ui && cd ui && go mod init ui && go get github.com/goome-ui/go-goome@latest, save this as main.go, then go run . (needs cgo and a C compiler, first build takes a bit)";

    X.langs.go = { label: "Go", ext: ".go", generate, hint };
  })();

  (() => {
    const { GM, camel, cut, num, floats, Out, names, WFLAGS, EFLAGS, TFLAGS, AFLAGS, IFLAGS, finish } = X.H;
    const E = GM.expr;

    const KW = new Set("addrspace align allowzero and anyframe anytype asm async await break callconv catch comptime const continue defer else enum errdefer error export extern fn for if inline linksection noalias noinline nosuspend opaque or orelse packed pub resume return struct suspend switch test threadlocal try union unreachable usingnamespace var volatile while".split(" "));
    const PRIM = /^([iu][0-9]+|f16|f32|f64|f80|f128|isize|usize|c_char|c_short|c_ushort|c_int|c_uint|c_long|c_ulong|c_longlong|c_ulonglong|c_longdouble|anyopaque|anyerror|bool|comptime_int|comptime_float|noreturn|type|void|true|false|null|undefined)$/;
    const FIXED = new Set("s std goome State draw main fmt fixed host placeholder placeholder_px setTheme setConfig onHotkey fmt_bufs fmt_next".split(" "));
    const LOCALS = new Set("u g id st el o box rs ox oy c th cv ev i j k v b it item en was h ch m got res changed hovered pressed dragging clicked released pressed_now dragend nx ny init value e t cfg wait running dirty pace test_backend idx pick".split(" "));
    const zid = (n) => (KW.has(n) || PRIM.test(n) ? '@"' + n + '"' : n);
    const fld = (k) => (k === "align" ? '@"align"' : k);
    const pm = (n) => zid(LOCALS.has(n) || FIXED.has(n) ? n + "_" : n);
    const fnName = (n) => zid(FIXED.has(camel(n)) ? camel(n) + "Fn" : camel(n));

    const tup = (a) => (a.length === 1 ? a[0] : a.length ? " " + a.join(", ") + " " : "");
    const arr = (a) => (a.length === 1 ? a[0] : " " + a.join(", ") + " ");
    const zq = (s) => {
      let v = "";
      for (const ch of String(s == null ? "" : s)) {
        const c = ch.codePointAt(0);
        if (ch === "\\") v += "\\\\";
        else if (ch === '"') v += '\\"';
        else if (ch === "\n") v += "\\n";
        else if (ch === "\t") v += "\\t";
        else if (ch === "\r") continue;
        else if (c < 0x20 || c === 0x7f) v += "\\x" + c.toString(16).padStart(2, "0");
        else v += ch;
      }
      return '"' + v + '"';
    };
    const brace = (s) => String(s).replace(/\{/g, "{{").replace(/\}/g, "}}");
    const hexZ = (v) => "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const fl = (v) => {
      const s = num(v);
      return /^-?\d+$/.test(s) ? s + ".0" : s;
    };
    const isColorField = (f) => GM.THEME_COLORS.includes(f);

    const par = (e) => (/^-?[\w.]+(\[\d+\])?$/.test(e) || wrapped(e) ? e : "(" + e + ")");
    const wrapped = (e) => {
      if (e[0] !== "(" || e[e.length - 1] !== ")") return false;
      let d = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] === "(") d++;
        else if (e[i] === ")") d--;
        if (d === 0 && i < e.length - 1) return false;
      }
      return true;
    };
    const plus = (a, b) => (a === "0" ? b : b === "0" ? a : a + " + " + b);
    const minus = (a, b) => (b === "0" ? a : a + " - " + par(b));
    const neg = (e) => (e === "0" ? "0" : "-" + par(e));
    const usedIn = (text, name) => new RegExp("(^|[^\\w.@\"])" + name.replace(/[$]/g, "\\$") + "(?![\\w])").test(String(text).replace(/(^|[^@])"(\\.|[^"\\])*"/g, '$1""'));

    const WNAME = { move: "move", resize: "resize", collapse: "collapse", notitle: "no_title", close: "close" };
    const flagsZ = (table, p, win) => {
      const on = table.filter((f) => p[f[0]]).map((f) => (win ? "goome.win." + WNAME[f[0]] : "goome.c." + f[1]));
      return on.length ? on.join(" | ") : "0";
    };

    const wrapP = (r, min) => (r.p < min ? "(" + r.s + ")" : r.s);
    function zx(ast, types, map) {
      const atom = (s, t) => ({ s, t, p: 10 });
      const toN = (r) => (r.iz ? atom("@as(f64, @floatFromInt(" + r.s + "))", "n") : r.t === "n" ? r : r.t === "c" ? atom("@as(f64, @floatFromInt(" + r.s + "))", "n") : atom("@as(f64, if (" + r.s + ") 1.0 else 0.0)", "n"));
      const toB = (r) => (r.t === "b" ? r : { s: wrapP(r, 4) + " != 0", t: "b", p: 3 });
      const FN = { min: "@min", max: "@max", abs: "@abs" };
      const go = (x) => {
        switch (x.t) {
          case "num": return Object.assign(atom(fl(x.v), "n"), Number.isInteger(x.v) ? { lit: String(x.v) } : {});
          case "hex": return atom(hexZ(x.v), "c");
          case "bool": return atom(x.v ? "true" : "false", "b");
          case "th": {
            const m = map.th(x.f);
            return atom(m.s, isColorField(x.f) ? "c" : "n");
          }
          case "id": {
            const m = map.id(x.name);
            const t = types[x.name] || "n";
            if (m.z === "i") return Object.assign(atom(m.s, "n"), { iz: true });
            return atom(m.s, t);
          }
          case "call": return atom(FN[x.fn] + "(" + x.args.map((y) => toN(go(y)).s).join(", ") + ")", "n");
          case "un": {
            if (x.op === "-") {
              const a = toN(go(x.a));
              return { s: "-" + wrapP(a, 10), t: "n", p: 7 };
            }
            const a = toB(go(x.a));
            return { s: "!" + wrapP(a, 7), t: "b", p: 7 };
          }
          case "tern": {
            const c = toB(go(x.c));
            let a = go(x.a), b = go(x.b);
            if (a.t !== b.t || a.t === "n") (a = toN(a)), (b = toN(b));
            const body = "if (" + c.s + ") " + a.s + " else " + b.s;
            return atom(a.t === "n" ? "@as(f64, " + body + ")" : a.t === "c" ? "@as(u32, " + body + ")" : "(" + body + ")", a.t);
          }
          case "bin": {
            const op = x.op;
            if (op === "&&" || op === "||") {
              const p = op === "&&" ? 2 : 1;
              const l = toB(go(x.a)), r = toB(go(x.b));
              return { s: wrapP(l, p) + (op === "&&" ? " and " : " or ") + wrapP(r, p + 1), t: "b", p };
            }
            if (["+", "-", "*", "/"].includes(op)) {
              const p = op === "+" || op === "-" ? 5 : 6;
              const l = toN(go(x.a)), r = toN(go(x.b));
              return { s: wrapP(l, p) + " " + op + " " + wrapP(r, p + 1), t: "n", p };
            }
            let l = go(x.a), r = go(x.b);
            const eq = op === "==" || op === "!=";
            const whole = (r) => r.iz || r.lit != null;
            if (l.t === "n" && r.t === "n" && (l.iz || r.iz) && whole(l) && whole(r)) return { s: (l.iz ? l.s : l.lit) + " " + op + " " + (r.iz ? r.s : r.lit), t: "b", p: 3 };
            if (!(l.t === r.t && (l.t !== "b" || eq))) (l = toN(l)), (r = toN(r));
            return { s: wrapP(l, 4) + " " + op + " " + wrapP(r, 4), t: "b", p: 3 };
          }
        }
        return atom("0.0", "n");
      };
      return { go: () => go(ast), toN, toB };
    }

    function Ctx(project, warn) {
      this.project = project;
      this.warn = warn;
      this.nm = names(project);
      this.vnm = this.nm.vnm;
      const take = this.nm.take;
      this.uniq = (b) => take(b);
      this.top = [];
      this.consts = [];
      this.need = {};
      this.files = new Set();
      this.scope = null;
      this.defs = new Map((project.elements || []).map((d) => [d.id, d]));
      this.used = new Map();
      this.k = 0;
    }
    Ctx.prototype.v = function (name) {
      const id = zid(name);
      if (this.scope) return this.scope.alias[name] || id;
      return "s." + id;
    };
    Ctx.prototype.decl = function (kind, name, val, extra) {
      if (this.scope) {
        this.scope.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" ? (val ? 1 : 0) : +val || 0 });
        return;
      }
      const id = zid(name);
      let line;
      if (kind === "str") {
        const cap = Math.max(2, extra | 0);
        line = id + ": [" + cap + ":0]u8 = fixed(" + cap + ", " + zq(cut(val, cap - 1)) + "),";
      } else if (kind === "int") line = id + ": i32 = " + (val | 0) + ",";
      else if (kind === "bool") line = id + ": bool = " + (val ? "true" : "false") + ",";
      else if (kind === "color") line = id + ": u32 = " + hexZ(val) + ",";
      else line = id + ": f64 = " + num(val) + ",";
      this.top.push(line);
    };
    Ctx.prototype.constArr = function (name, items) {
      const id = this.scope ? this.scope.prefix + "_" + name : name;
      this.consts.push("const " + id + " = [_][*:0]const u8{" + arr(items.map(zq)) + "};");
      return id;
    };

    const isRoot = (pt) => pt === "overlay" || pt === "app";
    const ZT = { bool: "b", int: "i", float: "f", color: "u", string: "s" };

    function emitList(list, ctx, out, ptype) {
      for (const n of list) emitNode(n, ctx, out, ptype);
    }

    function themeVar(ctx, id) {
      ctx.themeVars = ctx.themeVars || new Map();
      if (!ctx.themeVars.has(id)) {
        const t = GM.findTheme(ctx.project, id);
        const base = "theme_" + GM.ident(t ? t.name : id, "t");
        const used = new Set([...ctx.themeVars.values()]);
        let v = base, i = 2;
        while (used.has(v)) v = base + i++;
        ctx.themeVars.set(id, v);
      }
      return ctx.themeVars.get(id);
    }

    function fieldLit(k, v) {
      if (isColorField(k)) return hexZ(v);
      return num(v);
    }

    function styled(ctx, out, st, body) {
      if (!GM.styleCount(st)) return body();
      const th = st.theme ? GM.findTheme(ctx.project, st.theme) : null;
      let pushed = 0;
      if (st.theme && th) out.add("u.pushTheme(&" + themeVar(ctx, st.theme) + ");"), pushed++;
      else if (st.theme) ctx.warn("", "a style uses a theme that is gone: " + st.theme);
      for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) out.add("u.pushColor(goome.c.GOOME_S_" + f.toUpperCase() + ", " + hexZ(st.c[f]) + ");"), pushed++;
      for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) out.add("u.pushNum(goome.c.GOOME_S_" + f.toUpperCase() + ", " + fieldLit(f, st.n[f]) + ");"), pushed++;
      if (Array.isArray(st.radii) && st.radii.length === 4) out.add("u.pushRadii(goome.corners(" + st.radii.map(num).join(", ") + "));"), pushed++;
      body();
      if (pushed) out.add("u.pop(" + pushed + ");");
    }

    function emitSlot(n, s, ctx, out, ptype) {
      const st = n.slotStyle && n.slotStyle[String(s)];
      styled(ctx, out, st, () => emitList(n.kids[s] || [], ctx, out, ptype));
    }

    const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };

    function prepass(ctx) {
      const pj = ctx.project;
      ctx.refs = new Map();
      ctx.vars = new Map();
      ctx.targets = new Set();
      ctx.fns = [];
      const note = (a) => {
        if (!a) return;
        if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) ctx.targets.add(a.target);
        if (a.do === "call" && a.fn) {
          const f = GM.ident(a.fn, "on_click");
          if (!ctx.fns.includes(f)) ctx.fns.push(f);
        }
      };
      GM.walk(pj.root, (n) => {
        const on = n.on || {};
        for (const e in on) for (const a of on[e] || []) note(a);
      });
      for (const hk of pj.hotkeys || []) for (const a of hk.actions || []) note(a);
      const caps = {};
      GM.walk(pj.root, (n) => {
        if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
      });
      for (const v of pj.vars || []) {
        const name = ctx.vnm.get(v.id);
        const r = { name, code: v.type === "list" ? name + "_items" : "s." + zid(name), type: v.type, v, cap: Math.max(256, caps[v.id] || 0) };
        ctx.vars.set(v.id, r);
        ctx.refs.set(v.name, r);
        declVar(ctx, r);
      }
      GM.walk(pj.root, (n) => {
        if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || ctx.refs.has(n.p.var)) return;
        const nm = ctx.nm.get(n.id);
        if (!nm) return;
        ctx.refs.set(n.p.var, { name: nm, code: "s." + zid(nm), type: OWN_T[n.type] });
      });
    }

    function declVar(ctx, r) {
      const v = r.v, d = v.def;
      if (v.type === "list") {
        const items = GM.lines(d);
        ctx.consts.push("const " + r.code + " = [_][*:0]const u8{" + arr((items.length ? items : [""]).map(zq)) + "};");
        return;
      }
      const kind = { bool: "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
      const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? +d >>> 0 : v.type === "bool" ? !!d : +d || 0;
      const save = ctx.scope;
      ctx.scope = null;
      ctx.decl(kind, r.name, val, r.cap);
      ctx.scope = save;
    }

    function listInfo(ctx, n) {
      const p = n.p;
      if (p.itemsVar) {
        const r = ctx.vars.get(p.itemsVar);
        if (r && r.type === "list") return { arr: r.code, items: GM.lines(r.v.def) };
        ctx.warn(n.id, "the items list var is gone or isnt a list, using the typed items");
      }
      return null;
    }

    function exprCode(ctx, src, want, where, id) {
      const types = GM.layoutIdents(ctx.project);
      const r = E.check(src, types, want);
      if (!r.ok) {
        ctx.warn(id || "", where + ": " + r.err);
        return null;
      }
      const map = {
        id: (name) => {
          const ref = ctx.refs.get(name);
          return ref ? { s: ref.code, z: ZT[ref.type] } : { s: name, z: "f" };
        },
        th: (f) => ({ s: "u.theme()." + fld(f) }),
      };
      const z = zx(r.ast, types, map);
      const e = z.go();
      return want === "b" ? z.toB(e).s : want === "n" ? z.toN(e).s : e.s;
    }

    function textCode(ctx, text, opts) {
      const parts = GM.interp(text);
      const vars = parts.filter((x) => x.v && ctx.refs.has(x.v));
      for (const x of parts) if (x.v && !ctx.refs.has(x.v)) ctx.warn((opts && opts.id) || "", "theres no var called " + x.v + " for {" + x.v + "}");
      if (!vars.length) return { code: zq(text), dyn: false };
      let f = "";
      const args = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        if (!r) f += brace(x.t != null ? x.t : "{" + x.v + "}");
        else if (r.type === "float") (f += "{d:.2}"), args.push(r.code);
        else if (r.type === "string") (f += "{s}"), args.push("goome.text(&" + r.code + ")");
        else if (r.type === "color") (f += "#{X:0>8}"), args.push(r.code);
        else if (r.type === "bool") (f += "{}"), args.push(r.code);
        else if (r.type === "list") (f += "{s}"), args.push(r.code + "[0]");
        else (f += "{d}"), args.push(r.code);
      }
      ctx.need.fmt = true;
      return { code: "fmt(" + zq(f) + ", .{" + tup(args) + "})", dyn: true, f: zq(f), args };
    }

    function emitActions(ctx, out, list, where) {
      const St = (s) => out.add(s + ";");
      const idx = GM.index(ctx.project);
      for (const a of list || []) {
        if (!a || !a.do) continue;
        const refOf = (name) => {
          const r = ctx.refs.get(name);
          if (!r) ctx.warn("", where + ": theres no var called " + (name || "(none)"));
          return r;
        };
        switch (a.do) {
          case "set": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type === "string") {
              const t = textCode(ctx, a.value || "", {});
              St("goome.setText(&" + r.code + ", " + (t.dyn ? "std.mem.span(" + t.code + ")" : t.code) + ")");
              break;
            }
            if (r.type === "list") {
              ctx.warn("", where + ": cant set a list var, its fixed");
              break;
            }
            const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
            const e = exprCode(ctx, a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want, where);
            if (e == null) break;
            St(r.code + " = " + (r.type === "int" ? "std.math.lossyCast(i32, " + e + ")" : e));
            break;
          }
          case "toggle": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "bool") {
              ctx.warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
              break;
            }
            St(r.code + " = !" + r.code);
            break;
          }
          case "add":
          case "sub": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "int" && r.type !== "float") {
              ctx.warn("", where + ": add/sub needs a number var");
              break;
            }
            const src = a.value === "" || a.value == null ? "1" : a.value;
            const op = a.do === "add" ? " + " : " - ";
            const lim = r.v && +r.v.max > +r.v.min;
            const whole = r.type === "int" && /^\d+$/.test(String(src).trim());
            let v;
            if (whole) v = r.code + op + String(src).trim();
            else {
              const e = exprCode(ctx, src, "n", where);
              if (e == null) break;
              v = r.type === "int" ? "std.math.lossyCast(i32, @as(f64, @floatFromInt(" + r.code + "))" + op + par(e) + ")" : r.code + op + par(e);
            }
            if (lim) v = "std.math.clamp(" + v + ", " + (r.type === "int" ? Math.round(r.v.min) + ", " + Math.round(r.v.max) : num(r.v.min) + ", " + num(r.v.max)) + ")";
            St(r.code + " = " + v);
            break;
          }
          case "open":
          case "close": {
            const t = idx.get(a.target);
            if (!t) {
              ctx.warn("", where + ": the " + a.do + " target is gone");
              break;
            }
            const on = a.do === "open";
            const tn = t.n;
            if (tn.type === "popup") {
              if (on) St("u.popupOpen(" + zq(tn.p.label || "popup") + ")");
              else St("u.popupClose()");
            } else if (tn.type === "window" || tn.type === "modal") St(openSet(ctx, tn, on));
            else ctx.warn("", where + ": can only open or close a window, modal or popup");
            break;
          }
          case "toast": {
            const t = textCode(ctx, a.text || "", {});
            St("u.toast(" + t.code + ", " + String(+a.ms > 0 ? a.ms | 0 : 2500) + ")");
            break;
          }
          case "tab": {
            const t = idx.get(a.target);
            if (!t || t.n.type !== "tabs") {
              ctx.warn("", where + ": the tab target has to be a tabs node");
              break;
            }
            const r = t.n.p.bind ? ctx.vars.get(t.n.p.bind) : ctx.refs.get(t.n.p.var);
            if (!r) break;
            St(r.code + " = " + (a.tab | 0));
            break;
          }
          case "copy": {
            const t = textCode(ctx, a.text || "", {});
            ctx.need.host = true;
            St("host.setClipboard(" + t.code + ") catch {}");
            break;
          }
          case "quit":
            ctx.need.host = true;
            St("host.push(.{ .kind = .close }) catch {}");
            break;
          case "call":
            St(fnName(GM.ident(a.fn, "on_click")) + "()");
            break;
          default:
            ctx.warn("", where + ": dont know the action " + a.do);
        }
      }
    }

    function openSet(ctx, n, on) {
      const b = on ? "true" : "false";
      if (n.p.bind) {
        const r = ctx.vars.get(n.p.bind);
        if (r) return r.code + " = " + b;
      }
      const nm = ctx.nm.get(n.id) || GM.ident(n.p.var || n.type);
      if (n.type === "window") return "s." + zid(nm) + ".setOpen(" + b + ")";
      return "s." + zid(nm) + " = " + b;
    }

    function emitNode(n, ctx, out, ptype) {
      const go = () => styled(ctx, out, n.style, () => emitEnabled(n, ctx, out, ptype));
      if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
        const e = exprCode(ctx, n.p.showIf, "b", "show if", n.id);
        if (e != null) {
          out.open("if (" + e + ")");
          go();
          out.close();
          return;
        }
      }
      go();
    }

    const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };
    function emitEnabled(n, ctx, out, ptype) {
      const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
      if (!src) return emitBare(n, ctx, out, ptype, null);
      const e = exprCode(ctx, src, "b", "enable if", n.id);
      if (e == null) return emitBare(n, ctx, out, ptype, null);
      const en = "en" + ++ctx.k;
      out.add("const " + en + " = " + e + ";");
      out.open("if (!" + en + ")");
      out.add("u.pushColor(goome.c.GOOME_S_TEXT, u.theme().text_dim);");
      out.add("u.pushColor(goome.c.GOOME_S_ACCENT, (u.theme().accent & 0xFFFFFF) | (u.theme().accent >> 25) << 24);");
      out.close();
      let saved = null;
      if (VALUE_T[n.type]) {
        const r = bareRef(ctx, n);
        if (r) {
          const w = "was" + ctx.k;
          saved = { r, w };
          out.add("const " + w + " = " + r.code + ";");
        }
      }
      emitBare(n, ctx, out, ptype, en);
      out.open("if (!" + en + ")");
      if (saved) out.add(saved.r.code + " = " + saved.w + ";");
      out.add("u.pop(2);");
      out.close();
    }

    function bareRef(ctx, n) {
      if (n.p.bind) return ctx.vars.get(n.p.bind) || null;
      if (!OWN_T[n.type]) return null;
      const nm = ctx.nm.get(n.id);
      if (!nm) return null;
      return { name: nm, code: ctx.v(nm), type: OWN_T[n.type] };
    }

    function emitBare(n, ctx, out, ptype, en) {
      const p = n.p || {};
      const q = zq;
      const st = (s) => out.add(s + ";");
      const call = (f, args) => st("u." + f + "(" + (args || []).join(", ") + ")");
      const nm = ctx.nm.get(n.id) || GM.ident(p.var || n.type);
      if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
        ctx.warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
        return;
      }
      const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
      if (leaf && +p.width > 0) call("width", [num(p.width)]);
      if (n.abs && !isRoot(ptype)) {
        call("pos", [num(n.abs.x), num(n.abs.y)]);
        if (+n.abs.w > 0 || +n.abs.h > 0) call("size", [num(+n.abs.w > 0 ? n.abs.w : 0), num(+n.abs.h > 0 ? n.abs.h : 0)]);
      }
      const on = n.on || {};
      const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
      const where = (e) => (p.label || n.type) + " " + e;
      const printLine = (txt) => "std.debug.print(" + zq(brace(txt) + "\n") + ", .{});";
      const ifActs = (cond, fill) => {
        out.open("if (" + cond + ")");
        fill();
        out.close();
      };
      const andEn = (cond) => (en ? cond + " and " + en : cond);
      const bound = (types) => {
        if (!p.bind) return null;
        const r = ctx.vars.get(p.bind);
        if (!r) {
          ctx.warn(n.id, "the bound var is gone, using its own var");
          return null;
        }
        if (ctx.scope) {
          ctx.warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
          return null;
        }
        if (types && !types.includes(r.type)) {
          ctx.warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
          return null;
        }
        return r;
      };
      const own = (kind, val, extra) => {
        ctx.decl(kind, nm, val, extra);
        return { name: nm, code: ctx.v(nm), type: kind };
      };
      const addrOf = (r) => "&" + r.code;
      const changeEvents = () => has("change") || has("on") || has("off");
      const fireChange = (ref) => {
        if (has("change")) emitActions(ctx, out, on.change, where("change"));
        if ((has("on") || has("off")) && ref) {
          if (has("on")) ifActs(ref.code, () => emitActions(ctx, out, on.on, where("on")));
          if (has("off")) ifActs("!" + ref.code, () => emitActions(ctx, out, on.off, where("off")));
        }
      };
      const valueWidget = (cl, ref) => {
        if (changeEvents()) ifActs(andEn(cl), () => fireChange(ref));
        else st("_ = " + cl);
      };
      const U = (f, args) => "u." + f + "(" + args.join(", ") + ")";
      const hover = () => {
        if (!has("hover")) return;
        const hv = ctx.uniq(nm + "_hot");
        ctx.top.push(zid(hv) + ": bool = false,");
        const hvc = "s." + zid(hv);
        const h = "h" + ++ctx.k;
        out.add("const " + h + " = u.hovered();");
        ifActs(h + " and !" + hvc, () => emitActions(ctx, out, on.hover, where("hover")));
        out.add(hvc + " = " + h + ";");
      };
      const tooltip = () => {
        if (leaf && p.tooltip) call("tooltip", [q(p.tooltip)]);
      };
      const label = (txt) => textCode(ctx, txt == null ? "" : txt, { id: n.id }).code;
      const elseIf = (cond, first) => {
        if (first) out.open("if (" + cond + ")");
        else {
          out.l[out.l.length - 1] = out.l[out.l.length - 1] + " else if (" + cond + ") {";
          out.d++;
          out.marks.push(out.l.length);
        }
      };

      switch (n.type) {
        case "window": {
          if (ctx.scope) return ctx.warn(n.id, "windows cant go inside a custom element");
          const fl2 = flagsZ(WFLAGS, p, true);
          const b = bound(["bool"]);
          const win = "s." + zid(nm);
          ctx.top.push(zid(nm) + ": goome.Window = .{ .x = " + num(p.x) + ", .y = " + num(p.y) + ", .w = " + num(p.w) + ", .h = " + num(p.h) + " },");
          if (b) st(win + ".setOpen(" + b.code + ")");
          out.open("if (" + U("window", [label(p.label), "&" + win, fl2]) + ")");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          call("windowEnd");
          if (b) st(b.code + " = " + win + ".isOpen()");
          return;
        }
        case "row": {
          const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
          if (k >= 2) call("row", [String(k)]);
          emitList(n.kids[0], ctx, out, "row");
          return;
        }
        case "same_line": return call("sameLine");
        case "space": return call("space", [num(p.px)]);
        case "separator": return call("separator");
        case "scroll": {
          st("_ = " + U("scrollBegin", [q(nm), num(p.h)]));
          emitList(n.kids[0], ctx, out, "scroll");
          call("scrollEnd");
          return;
        }
        case "split": {
          const fr = nm + "_frac";
          ctx.decl("double", fr, +p.frac || 0.3);
          st("_ = " + U("splitBegin", [q(nm), p.vertical ? "true" : "false", "&" + ctx.v(fr)]));
          emitSlot(n, 0, ctx, out, "split");
          call("splitNext");
          emitSlot(n, 1, ctx, out, "split");
          call("splitEnd");
          return;
        }
        case "tabs": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          if (!items.length) items.push("Tab");
          const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
          const arr = li ? li.arr : ctx.constArr(nm + "_names", items);
          valueWidget(U("tabs", [q(nm), "&" + arr, addrOf(r)]), r);
          let first = true;
          const k = Math.max(items.length, n.kids.length);
          for (let i = 0; i < k; i++) {
            const kids = n.kids[i] || [];
            if (!kids.length) continue;
            elseIf(r.code + " == " + i, first);
            emitSlot(n, i, ctx, out, "tabs");
            out.close();
            first = false;
          }
          return;
        }
        case "collapsing": {
          const r = bound(["bool"]) || own("bool", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++ctx.k : null;
          if (ev) out.add("const " + w + " = " + r.code + ";");
          const cl = U("collapsing", [label(p.label), addrOf(r)]);
          if (ev) {
            st("_ = " + cl);
            ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
            out.open("if (" + r.code + ")");
          } else out.open("if (" + cl + ")");
          emitList(n.kids[0], ctx, out, "collapsing");
          out.close();
          return;
        }
        case "tree": {
          const r = bound(["bool"]) || own("bool", !!p.open);
          const ev = has("change");
          const w = ev ? "was" + ++ctx.k : null;
          if (ev) out.add("const " + w + " = " + r.code + ";");
          const tc = U("tree", [label(p.label), addrOf(r)]);
          if (ev) {
            const sh = "open" + ++ctx.k;
            out.add("const " + sh + " = " + tc + ";");
            ifActs(andEn(r.code + " != " + w), () => emitActions(ctx, out, on.change, where("change")));
            out.open("if (" + sh + ")");
          } else out.open("if (" + tc + ")");
          emitList(n.kids[0], ctx, out, "tree");
          call("treeEnd");
          out.close();
          return;
        }
        case "modal": {
          const b = bound(["bool"]);
          const r = b || own("bool", false);
          if (p.button) ifActs(U("button", [label(p.button)]), () => st(r.code + " = true"));
          const m = "open" + ++ctx.k;
          out.add("var " + m + ": c_int = @intFromBool(" + r.code + ");");
          out.open("if (" + U("modalBegin", [label(p.label), "&" + m]) + ")");
          emitList(n.kids[0], ctx, out, "modal");
          call("modalEnd");
          out.close();
          st(r.code + " = " + m + " != 0");
          return;
        }
        case "popup": {
          const id = q(p.label || "popup");
          const b = bound(["bool"]);
          if (b)
            ifActs(b.code, () => {
              call("popupOpen", [id]);
              st(b.code + " = false");
            });
          out.open("if (" + U("popupBegin", [id]) + ")");
          emitList(n.kids[0], ctx, out, "popup");
          call("popupEnd");
          out.close();
          return;
        }
        case "menubar":
        case "menu": {
          const mb = n.type === "menubar";
          out.open("if (" + (mb ? U("menubarBegin", []) : U("menuBegin", [label(p.label)])) + ")");
          emitList(n.kids[0], ctx, out, n.type);
          call(mb ? "menubarEnd" : "menuEnd");
          out.close();
          return;
        }
        case "menu_item": {
          const sc = p.shortcut ? q(p.shortcut) : "null";
          const b = p.check || p.bind ? bound(["bool"]) : null;
          if (p.check || b) {
            const r = b || own("bool", !!p.on);
            const cl = U("menuItem", [label(p.label), sc, addrOf(r)]);
            if (has("click")) ifActs(andEn(cl), () => emitActions(ctx, out, on.click, where("click")));
            else st("_ = " + cl);
          } else {
            ifActs(andEn(U("menuItem", [label(p.label), sc, "null"])), () => {
              if (has("click")) emitActions(ctx, out, on.click, where("click"));
              else out.add(printLine(p.label + " clicked"));
            });
          }
          return;
        }
        case "menu_sep": return call("menuSeparator");
        case "label": {
          const t = textCode(ctx, p.label == null ? "" : p.label, { id: n.id });
          if (t.dyn) st("u.labelFmt(" + t.f + ", .{" + tup(t.args) + "})");
          else call("label", [t.code]);
          hover();
          break;
        }
        case "heading": call("heading", [label(p.label)]); hover(); break;
        case "wrapped": call("wrapped", [label(p.label)]); break;
        case "button": {
          ifActs(andEn(U("button", [label(p.label)])), () => {
            if (has("click")) return emitActions(ctx, out, on.click, where("click"));
            if (p.action === "toast") call("toast", [label(p.toast), String(p.ms | 0)]);
            else if (p.action === "close") call("popupClose");
            else out.add(printLine(p.label + " clicked"));
          });
          hover();
          break;
        }
        case "checkbox":
        case "toggle": {
          const r = bound(["bool"]) || own("bool", !!p.on);
          valueWidget(U(n.type, [label(p.label), addrOf(r)]), r);
          hover();
          break;
        }
        case "radio": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const ev = changeEvents();
          const ch = ev ? "ch" + ++ctx.k : null;
          if (ev) out.add("var " + ch + " = false;");
          const one = (lab, i) => {
            const cl = U("radio", [lab, addrOf(r), i]);
            if (ev) ifActs(cl, () => st(ch + " = true"));
            else st("_ = " + cl);
          };
          if (li) {
            out.open("for (&" + li.arr + ", 0..) |item, i|");
            if (p.inline) ifActs("i > 0", () => call("sameLine"));
            one("item", "@intCast(i)");
            out.close();
          } else
            items.forEach((it, i) => {
              if (i && p.inline) call("sameLine");
              one(q(it), String(i));
            });
          if (ev) ifActs(andEn(ch), () => fireChange(r));
          break;
        }
        case "slider": {
          const b = bound(["float", "int"]);
          const fmtS = p.fmt ? q(p.fmt) : "null";
          if (b && b.type === "int") valueWidget(U("sliderInt", [label(p.label), addrOf(b), Math.round(p.min), Math.round(p.max)]), b);
          else {
            const r = b || own("double", +p.value || 0);
            valueWidget(U("slider", [label(p.label), addrOf(r), num(p.min), num(p.max), fmtS]), r);
          }
          hover();
          break;
        }
        case "slider_int": {
          const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
          valueWidget(U("sliderInt", [label(p.label), addrOf(r), Math.round(p.min), Math.round(p.max)]), r);
          hover();
          break;
        }
        case "input": {
          const cap = Math.max(2, p.cap | 0 || 64);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
          if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint) {
            valueWidget(U("input", [label(p.label), addrOf(r)]), r);
            hover();
            break;
          }
          const fl2 = flagsZ(IFLAGS, fp), hint = p.hint ? q(p.hint) : "null";
          if (!has("enter") && !fp.enter) {
            valueWidget(U("inputEx", [label(p.label), addrOf(r), fl2, hint]), r);
            hover();
            break;
          }
          const raw = "goome.c.goome_ui_input_ex(u.raw(), " + [label(p.label), addrOf(r), r.code + ".len", fl2, hint].join(", ") + ")";
          if (!has("enter")) {
            valueWidget(raw + " == 1", r);
            hover();
            break;
          }
          const k = "k" + ++ctx.k;
          out.add("const " + k + " = " + raw + ";");
          if (changeEvents()) ifActs(andEn(k + " == 1"), () => fireChange(r));
          ifActs(andEn(k + " == 2"), () => emitActions(ctx, out, on.enter, where("enter")));
          hover();
          break;
        }
        case "text_edit": {
          const cap = Math.max(2, p.cap | 0 || 4096);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          valueWidget(U("textEdit", [q(nm), addrOf(r), num(p.h), flagsZ(EFLAGS, p)]), r);
          break;
        }
        case "combo": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : [""]);
          valueWidget(U("combo", [label(p.label), addrOf(r), "&" + arr]), r);
          hover();
          break;
        }
        case "selectable": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : ["Item"]);
          const ev = changeEvents();
          out.open("for (&" + arr + ", 0..) |item, i|");
          out.add("const idx: i32 = @intCast(i);");
          ifActs(andEn(U("selectable", ["item", r.code + " == idx"])), () => {
            st(r.code + " = idx");
            if (ev) fireChange(r);
          });
          out.close();
          break;
        }
        case "color": {
          const r = bound(["color"]) || own("color", p.color >>> 0);
          valueWidget(U("color", [label(p.label), addrOf(r)]), r);
          hover();
          break;
        }
        case "progress": {
          const b = bound(["float", "int"]);
          let val = num(p.value);
          if (b) {
            const lo = +b.v.min, hi = +b.v.max;
            const base = b.type === "int" ? "@as(f64, @floatFromInt(" + b.code + "))" : b.code;
            val = hi > lo && !(lo === 0 && hi === 1) ? (lo ? par(minus(base, num(lo))) : base) + " / " + num(hi - lo) : base;
          }
          call("progress", [val, p.label ? label(p.label) : "null"]);
          hover();
          break;
        }
        case "table":
        case "plot_lines":
        case "plot_bars":
        case "image": {
          emitData(n, ctx, out, nm);
          if (n.type === "image") hover();
          break;
        }
        case "el": {
          emitInstance(n, ctx, out, ptype);
          return;
        }
        default:
          ctx.warn(n.id, "dont know how to export " + n.type);
          return;
      }
      tooltip();
    }

    function emitData(n, ctx, out, nm) {
      const p = n.p || {};
      const q = zq;
      const st = (s) => out.add(s + ";");
      switch (n.type) {
        case "table": {
          const cols = GM.lines(p.cols).map((x) => {
            const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
            return [m[1].trim(), m[2] ? +m[2] : 0];
          });
          if (!cols.length) cols.push(["Column", 0]);
          const rows = GM.lines(p.rows).map((r) => {
            const cells = r.split(",").map((x) => x.trim());
            while (cells.length < cols.length) cells.push("");
            return cells.slice(0, cols.length);
          });
          const k = cols.length;
          const id = nm + "_cells";
          ctx.consts.push("const " + id + " = [_][*:0]const u8{" + arr(rows.length ? [].concat(...rows).map(zq) : ['""']) + "};");
          out.open("if (u.tableBegin(" + [q(nm), k, num(p.h), flagsZ(TFLAGS, p)].join(", ") + "))");
          cols.forEach((cl) => out.add("u.tableColumn(" + q(cl[0]) + ", " + num(cl[1]) + ");"));
          if (rows.length) {
            out.open("for (0.." + rows.length + ") |i|");
            out.add("u.tableRow();");
            out.open("for (0.." + k + ") |j|");
            out.add("if (j > 0) u.tableNext();");
            out.add("u.label(" + id + "[i * " + k + " + j]);");
            out.close();
            out.close();
          }
          out.close();
          out.add("u.tableEnd();");
          break;
        }
        case "plot_lines":
        case "plot_bars": {
          const vals = floats(p.values);
          const id = ctx.scope ? ctx.scope.prefix + "_" + nm + "_values" : nm + "_values";
          ctx.consts.push("const " + id + " = [_]f32{" + arr(vals.length ? vals.map(num) : ["0"]) + "};");
          st("u." + (n.type === "plot_lines" ? "plotLines" : "plotBars") + "(" + [q(p.label), "&" + id, num(p.min), num(p.max), num(p.h)].join(", ") + ")");
          break;
        }
        case "image": {
          ctx.need.placeholder = true;
          st("u.image(&placeholder, " + [num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
          break;
        }
      }
    }

    function elInfo(ctx, def) {
      let e = ctx.used.get(def.id);
      if (!e) {
        e = { def };
        ctx.used.set(def.id, e);
      }
      return e;
    }

    const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");
    const litOf = (type, v) => (type === "color" ? hexZ(v) : type === "bool" ? (v ? "true" : "false") : type === "text" ? zq(v == null ? "" : v) : num(v));
    const elFn = (def) => zid(camel(def.name) + "El");

    function emitInstance(n, ctx, out, ptype) {
      const p = n.p;
      const def = ctx.defs.get(p.el);
      if (!def) return ctx.warn(n.id, "this custom element is gone from the library, skipped");
      if (ctx.scope) return ctx.warn(n.id, "custom elements cant go inside custom elements yet");
      const nm = ctx.nm.get(n.id) || GM.ident(p.var || def.name);
      elInfo(ctx, def);
      if (ptype === "overlay") out.add("u.pos(" + num(p.x) + ", " + num(p.y) + ");");
      const args = def.params.map((pr) => litOf(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def));
      const w = +p.w || def.w, h = +p.h || def.h;
      let own = w !== def.w || h !== def.h;
      const sv = def.state.map((s) => {
        const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
        if (v !== s.def) own = true;
        return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
      });
      let init = "null";
      if (own) {
        const id = nm + "_init";
        ctx.consts.push("const " + id + " = [_]f64{" + arr([w, h].concat(sv).map(num)) + "};");
        init = "&" + id;
      }
      const val = hasValue(def);
      const on = n.on || {};
      const evk = ["click", "change", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
      const info = ctx.used.get(def.id);
      if (evk.length) info.mask = true;
      const m = evk.length ? "m" + ++ctx.k : null;
      const a = ["u", zq(nm)].concat(args, [init]);
      if (val) {
        ctx.top.push(zid(nm + "_value") + ": f64 = 0,");
        a.push("&s." + zid(nm + "_value"));
      }
      const callS = elFn(def) + "(" + a.join(", ") + ")";
      out.add(m ? "const " + m + " = " + callS + ";" : "_ = " + callS + ";");
      if (m) {
        const bit = { change: 1, click: 2, dragend: 4 };
        for (const e of ["change", "click", "dragend"]) {
          if (!evk.includes(e)) continue;
          out.open("if ((" + m + " & " + bit[e] + ") != 0)");
          emitActions(ctx, out, on[e], def.name + " " + e);
          out.close();
        }
        if (evk.includes("hover")) {
          const hv = ctx.uniq(nm + "_hot");
          ctx.top.push(zid(hv) + ": bool = false,");
          const hvc = "s." + zid(hv);
          out.open("if ((" + m + " & 8) != 0 and !" + hvc + ")");
          emitActions(ctx, out, on.hover, def.name + " hover");
          out.close();
          out.add(hvc + " = (" + m + " & 8) != 0;");
        }
      }
    }

    function addBitmap(ctx, id, file, img) {
      ctx.bitmaps = ctx.bitmaps || new Map();
      if (ctx.bitmaps.has(id)) return id;
      const set = Object.assign({}, GM.SETTINGS_DEFAULT, ctx.project.settings || {});
      const m = set.iconSource === "embed" ? /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(img || "")) : null;
      const b64 = m ? m[1].replace(/\s+/g, "") : null;
      if (set.iconSource === "embed" && !b64) ctx.warn("", file + " has no image data to embed, the code loads the file instead");
      if (!b64) ctx.files.add(file);
      ctx.bitmaps.set(id, { file, b64 });
      return id;
    }

    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    function b64bytes(s) {
      const out = [];
      let buf = 0, bits = 0;
      for (const ch of s) {
        const v = B64.indexOf(ch);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
          bits -= 8;
          out.push((buf >> bits) & 255);
        }
      }
      return out;
    }

    function bitmapLoads(ctx) {
      const L = { decl: [], load: [], free: [] };
      if (!ctx.bitmaps) return L;
      for (const [id, b] of ctx.bitmaps) {
        L.decl.push("var " + id + ": ?goome.Bitmap = null;");
        if (b.b64) {
          const bytes = b64bytes(b.b64);
          const rows = [];
          for (let i = 0; i < bytes.length; i += 16) rows.push("    " + bytes.slice(i, i + 16).map((x) => "0x" + x.toString(16).padStart(2, "0")).join(", ") + ",");
          L.decl.push("const " + id + "_png = [_]u8{", ...rows, "};");
          L.load.push(id + " = goome.Bitmap.loadMem(&" + id + "_png) catch null;");
        } else L.load.push(id + " = goome.Bitmap.load(" + zq(b.file) + ") catch null;");
        L.free.push("defer if (" + id + ") |*b| b.deinit();");
      }
      return L;
    }

    function elementCode(ctx, info) {
      const def = info.def;
      const warn = (msg, id) => ctx.warn(id || def.id, def.name + ": " + msg);
      const types = GM.elementIdents(def);
      const groups = GM.dragGroups(def);
      const rs = !!(def.resizable && def.resizable.on);
      const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
      const prNames = new Set(def.params.map((x) => x.name));
      for (const s of def.state) if (builtin.has(s.name)) warn("state " + s.name + " clashes with a built in name");
      for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) warn("param " + s.name + " clashes with another name");

      const scope = { slots: [], alias: {}, prefix: def.name };
      const wout = new Out(false);
      {
        const local = new Map();
        const used = new Set([...LOCALS, ...FIXED, ...[...prNames].map(pm)]);
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const b = GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type);
          let k = b, i = 2;
          while (used.has(k)) k = b + i++;
          used.add(k);
          local.set(pt.w.id, k);
        });
        const saveNm = ctx.nm;
        ctx.nm = local;
        ctx.scope = scope;
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const t = pt.w.type;
          if (GM.isContainer(t) || t === "window" || t === "el") warn("widget parts can only be simple widgets, skipped a " + t, pt.id);
          else if (t === "input" || t === "text_edit") warn("text boxes cant keep their text in goome_ui_store, skipped " + t, pt.id);
          else emitNode(pt.w, ctx, wout, "element");
        });
        ctx.scope = null;
        ctx.nm = saveNm;
      }

      const idx = {};
      let N = 0;
      const slot = (k) => (idx[k] = N++);
      ["init", "w", "h", "value", "hot"].forEach(slot);
      def.state.forEach((st) => slot("s:" + st.name));
      groups.forEach((g) => {
        const gv = GM.partVar(g);
        [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
      });
      if (rs) slot("rw"), slot("rh");
      scope.slots.forEach((w) => slot("w:" + w.name));
      const S = (k) => "st[" + idx[k] + "]";
      const map = {
        id: (name) => {
          if (prNames.has(name)) return { s: pm(name), z: "f" };
          if (name === "w" || name === "h" || name === "value") return { s: S(name), z: "f" };
          if (name === "hovered" || name === "pressed" || name === "dragging") return { s: name, z: "b" };
          const st = def.state.find((x) => x.name === name);
          if (st) return st.type === "bool" ? { s: "(" + S("s:" + name) + " != 0)", z: "b" } : { s: S("s:" + name), z: "f" };
          if (idx[name] != null) return { s: S(name), z: "f" };
          return { s: name, z: "f" };
        },
        th: (f) => ({ s: "th." + fld(f) }),
      };
      const ex = (src, want, where) => {
        if (src === "" || src == null) return want === "c" ? hexZ(0) : "0";
        let r;
        if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 } };
        else r = E.check(src, types, want);
        if (!r.ok) {
          warn(where + ": " + r.err);
          return want === "c" ? hexZ(0) : "0";
        }
        const z = zx(r.ast, types, map);
        const e = z.go();
        return want === "n" ? z.toN(e).s : e.s;
      };
      const exb = (src, where) => {
        const r = E.check(src, types, "b");
        if (!r.ok) {
          warn(where + ": " + r.err);
          return null;
        }
        const z = zx(r.ast, types, map);
        return z.toB(z.go()).s;
      };

      const blob = JSON.stringify(def.parts);
      const evs = (on) => (def.events || []).filter((e) => e.on === on);
      const reads = {
        hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
        pressed: /\bpressed\b/.test(blob),
        dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
        pressed_now: evs("press").length > 0,
        clicked: evs("click").length > 0,
        released: evs("release").length > 0,
      };
      const mask = !!info.mask;
      if (mask) reads.hovered = reads.clicked = reads.dragend = true;
      const fo = reads.clicked || reads.pressed_now;
      const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;

      const T = { num: "f64", color: "u32", bool: "bool", text: "[*:0]const u8" };
      const pargs = def.params.map((pr) => pm(pr.name) + ": " + T[pr.type]);
      const val = hasValue(def);
      const o = new Out(false);
      const A = (s) => o.add(s);
      const St = (s) => o.add(s + ";");
      const open = (h) => {
        A(h + " {");
        o.d++;
      };
      const close = () => {
        o.d--;
        A("}");
      };
      const iff = (cond) => open("if (" + cond + ")");
      const fn = elFn(def);
      A("fn " + fn + "(" + ["u: *goome.Ui", "id: [*:0]const u8"].concat(pargs, ["init: ?[]const f64"], val ? ["value: *f64"] : []).join(", ") + ") u8 {");
      o.d++;
      St("const st = u.store(id, " + N + ") orelse return 0");
      iff("st[0] == 0");
      const fromInit = (i, d) => "if (init) |v| v[" + i + "] else " + d;
      St(S("init") + " = 1");
      St(S("w") + " = " + fromInit(0, num(def.w)));
      St(S("h") + " = " + fromInit(1, num(def.h)));
      def.state.forEach((st, i) => St(S("s:" + st.name) + " = " + fromInit(i + 2, st.type === "bool" ? (st.def ? "1" : "0") : num(st.def))));
      scope.slots.forEach((w) => St(S("w:" + w.name) + " = " + (w.kind === "color" ? hexZ(w.val) : num(w.val))));
      const clampE = (v, lo, hi) => "std.math.clamp(" + v + ", " + lo + ", " + hi + ")";
      const vd = def.value || {};
      const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
      if (val && vd.src === "drag") St(S("value") + " = " + (vst ? S("s:" + vst.name) : num(+vd.min || 0)));

      const groupBase = new Map();
      const baseWalk = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind !== "group") continue;
          const gx = par(ex(pt.f.x, "n", pt.name + " x")), gy = par(ex(pt.f.y, "n", pt.name + " y"));
          const dg = pt.drag && pt.drag.on;
          const sx = plus(bx, gx), sy = plus(by, gy);
          const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
          groupBase.set(pt.id, { sx, sy, ax, ay });
          baseWalk(pt.kids || [], ax, ay);
        }
      };
      baseWalk(def.parts, "0", "0");
      const bounds = (g) => {
        const b = groupBase.get(g.id), d = g.drag;
        const gw = par(ex(g.f.w, "n", g.name + " w")), gh = par(ex(g.f.h, "n", g.name + " h"));
        if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
        if (d.bounds === "rect") {
          const R = d.rect || {};
          return {
            x: [minus(num(+R.x || 0), b.sx), minus(minus(num((+R.x || 0) + (+R.w || 0)), gw), b.sx)],
            y: [minus(num(+R.y || 0), b.sy), minus(minus(num((+R.y || 0) + (+R.h || 0)), gh), b.sy)],
          };
        }
        return null;
      };
      const tOf = (o2, r) => {
        const lo = par(r[0]), hi = par(r[1]);
        return "(if (" + hi + " > " + lo + ") " + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " else 0)";
      };
      if (val && vd.src === "drag") {
        const g = groups.find((x) => x.id === vd.part);
        const r = g && bounds(g);
        if (!g) warn("the value comes from a drag but no drag group is picked");
        else if (!r) warn("a value from a drag needs bounds on " + g.name, g.id);
        else {
          const ax = vd.axis === "y" ? "y" : "x";
          const span = (+vd.max || 0) - (+vd.min || 0);
          const t = span ? clampE(par(minus(S("value"), num(+vd.min || 0))) + (span === 1 ? "" : " / " + num(span)), "0", "1") : "0";
          St(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + plus(r[ax][0], t + " * " + par(minus(r[ax][1], r[ax][0]))));
        }
      }
      close();

      const SLOT_T = { color: "u32", double: "f64", int: "i32", bool: "bool" };
      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = zid(w.name);
        const init = w.kind === "double" ? v : w.kind === "bool" ? v + " != 0" : "@intFromFloat(" + v + ")";
        St("var " + id + ": " + SLOT_T[w.kind] + " = " + init);
      });

      const flagNames = ["changed", "hovered", "pressed", "dragging", "pressed_now", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k]);
      const flagAt = new Map();
      flagNames.forEach((k) => {
        flagAt.set(k, o.l.length);
        St("var " + k + " = false");
      });
      St("u.pushId(id)");
      const IFL = { 0: "0", x: "goome.c.GOOME_ITEM_DRAG_X", y: "goome.c.GOOME_ITEM_DRAG_Y", xy: "goome.c.GOOME_ITEM_DRAG_X | goome.c.GOOME_ITEM_DRAG_Y", nohit: "goome.c.GOOME_ITEM_NO_HIT", fo: "goome.c.GOOME_ITEM_FOCUSABLE" };
      const IF = (k) => IFL[k];
      const custom = (name, sid, w, h, flg) => {
        A("var " + name + ": goome.Item = .{};");
        St("_ = u.custom(" + zq(sid) + ", " + [w, h, flg, "&" + name].join(", ") + ")");
      };
      const pos = (x, y) => St("u.pos(" + x + ", " + y + ")");
      custom("el", "##el", S("w"), S("h"), IF("nohit"));
      const oAt = o.l.length;
      pos("0", "0");
      custom("o", "##o", "1", "1", IF("nohit"));
      St("const ox = el.x - o.x");
      St("const oy = el.y - o.y");
      const oEnd = o.l.length;
      const acc = (it, click) => {
        const L = [];
        const set = (k, e) => {
          if (reads[k]) L.push(k + " = " + k + " or " + e + ";");
        };
        set("hovered", it + ".hovered != 0 or " + it + ".held != 0");
        set("pressed", it + ".held != 0");
        set("pressed_now", it + ".pressed != 0");
        if (click) set("clicked", it + ".clicked != 0");
        set("released", it + ".released != 0");
        if (!click) set("dragend", it + ".released != 0");
        L.forEach(A);
      };
      if (rs) {
        const R = def.resizable;
        pos(plus("ox", minus(S("w"), "14")), plus("oy", minus(S("h"), "14")));
        custom("rs", "##rs", "14", "14", IF("xy"));
        iff("rs.pressed != 0");
        St(S("rw") + " = " + S("w"));
        St(S("rh") + " = " + S("h"));
        close();
        iff("rs.held != 0");
        St(S("w") + " = " + clampE(S("rw") + " + rs.drag_x", num(R.minW), num(R.maxW)));
        St(S("h") + " = " + clampE(S("rh") + " + rs.drag_y", num(R.minH), num(R.maxH)));
        St("changed = true");
        if (reads.dragging) St("dragging = true");
        close();
        acc("rs", false);
      }
      const bboxOf = (pt, bx, by) => {
        const f = pt.f, wh = (k) => (pt.name || pt.kind) + " " + k;
        const e = (k) => par(ex(f[k], "n", wh(k)));
        switch (pt.kind) {
          case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
            return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
          case "circle": case "ring": case "arc":
            return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), "2 * " + e("r"), "2 * " + e("r")];
          case "line":
            return [plus(bx, "@min(" + e("x0") + ", " + e("x1") + ")"), plus(by, "@min(" + e("y0") + ", " + e("y1") + ")"), "@max(1, @abs(" + minus(e("x1"), e("x0")) + "))", "@max(1, @abs(" + minus(e("y1"), e("y0")) + "))"];
          case "text": {
            const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
            const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
            const len = pr ? "@as(f64, @floatFromInt(std.mem.len(" + pm(pr.name) + ")))" : fl(Array.from(String(f.text || "")).length);
            return [plus(bx, e("x")), plus(by, e("y")), len + " * " + e("size") + " * 0.55", e("size") + " * 1.25"];
          }
        }
        warn((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
        return null;
      };
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
        let r = null;
        if (d.handle) {
          let hp = null;
          GM.walkParts(g.kids || [], (pt) => {
            if (pt.id === d.handle) hp = pt;
          });
          if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
          else warn("drag handle part not found in " + g.name + ", using the group box", g.id);
        }
        if (!r) r = [b.ax, b.ay, par(ex(g.f.w, "n", g.name + " w")), par(ex(g.f.h, "n", g.name + " h"))];
        const it = "h_" + gv;
        pos(plus("ox", r[0]), plus("oy", r[1]));
        custom(it, "##" + gv, r[2], r[3], IF(d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"));
        const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
        iff(it + ".pressed != 0");
        St(sx + " = " + dx);
        St(sy + " = " + dy);
        close();
        iff(it + ".held != 0");
        const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
        const bd = bounds(g);
        const snap = +d.snap || 0;
        for (const a of axes) {
          const n2 = "n" + a;
          St((snap > 0 || bd ? "var " : "const ") + n2 + " = " + (a === "x" ? sx : sy) + " + " + it + (a === "x" ? ".drag_x" : ".drag_y"));
          if (snap > 0) St(n2 + " = @floor(" + n2 + " / " + num(snap) + " + 0.5) * " + num(snap));
          if (bd) St(n2 + " = " + clampE(n2, bd[a][0], bd[a][1]));
        }
        iff(axes.map((a) => "n" + a + " != " + (a === "x" ? dx : dy)).join(" or "));
        for (const a of axes) St((a === "x" ? dx : dy) + " = n" + a);
        St("changed = true");
        if (val && vd.src === "drag" && vd.part === g.id) {
          const a = vd.axis === "y" ? "y" : "x";
          if (bd) {
            const span = (+vd.max || 0) - (+vd.min || 0);
            const t = tOf(a === "x" ? dx : dy, bd[a]);
            St(S("value") + " = " + plus(num(+vd.min || 0), span === 1 ? t : t + " * " + num(span)));
            if (vst) St(S("s:" + vst.name) + " = " + S("value"));
          }
        }
        close();
        if (reads.dragging) St("dragging = true");
        close();
        acc(it, false);
      }
      if (def.hit === "parts") {
        let k = 0;
        const walkHit = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind === "group") {
              const b = groupBase.get(pt.id);
              if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
              walkHit(pt.kids || [], b.ax, b.ay);
            } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
          }
        };
        const hitOne = (pt, bx, by) => {
          const r = bboxOf(pt, bx, by);
          if (!r) return;
          const it = "hit" + k;
          pos(plus("ox", r[0]), plus("oy", r[1]));
          custom(it, "##hit" + k++, r[2], r[3], fo ? IF("fo") : IF(0));
          acc(it, true);
        };
        walkHit(def.parts, "0", "0");
        if (!k && !groups.length && !rs && !deco) warn("hit mode is parts but no part is a hit area, nothing can be clicked");
      } else {
        pos("ox", "oy");
        custom("box", "##box", S("w"), S("h"), deco ? IF("nohit") : fo ? IF("fo") : IF(0));
        acc("box", true);
      }
      {
        const rest = o.l.slice(oEnd).join("\n");
        const useX = usedIn(rest, "ox"), useY = usedIn(rest, "oy");
        if (!useX && !useY) o.l.splice(oAt, oEnd - oAt);
        else if (!useY) o.l.splice(oEnd - 1, 1);
        else if (!useX) o.l.splice(oEnd - 2, 1);
      }

      const actLines = (on) => {
        for (const e of evs(on)) {
          if (e.act === "print") {
            A("std.debug.print(" + zq(brace(e.text || "") + "\n") + ", .{});");
            continue;
          }
          const tg = def.state.find((s) => s.name === e.target);
          if (!tg) {
            warn(on + " event needs a state to change, skipped");
            continue;
          }
          const t = S("s:" + tg.name);
          if (e.act === "toggle") St(t + " = if (" + t + " != 0) 0 else 1");
          else if (e.act === "add") {
            if (tg.type === "bool") {
              warn("cant add to a yes/no state");
              continue;
            }
            St(t + " += " + ex(e.expr || "0", "n", on + " event"));
          } else if (e.act === "set") {
            if (tg.type === "bool") {
              const b = exb(e.expr || "false", on + " event");
              if (b == null) continue;
              St(t + " = if (" + b + ") 1 else 0");
            } else St(t + " = " + ex(e.expr || "0", "n", on + " event"));
          }
          St("changed = true");
        }
      };
      const evBlock = (cond, on) => {
        if (!evs(on).length) return;
        iff(cond);
        actLines(on);
        close();
      };
      if (evs("enter").length || evs("leave").length) {
        const hot = "(" + S("hot") + " != 0)";
        evBlock("hovered and !" + hot, "enter");
        evBlock("!hovered and " + hot, "leave");
        St(S("hot") + " = if (hovered) 1 else 0");
      }
      evBlock("pressed_now", "press");
      evBlock("dragging", "drag");
      evBlock("clicked", "click");
      evBlock("released", "release");
      if (val && vd.src === "state") {
        const vs = def.state.find((s) => s.name === vd.state);
        if (vs) St(S("value") + " = " + S("s:" + vs.name));
        else warn("value state " + (vd.state || "(none)") + " is missing");
      }

      const D = new Out(false);
      const ELX = "el.x", ELY = "el.y";
      const drawParts = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind === "widget" || pt.kind === "hit") continue;
          const where = (k) => (pt.name || pt.kind) + " " + k;
          const N2 = (k) => ex(pt.f[k], "n", where(k));
          const Cc = (k) => ex(pt.f[k], "c", where(k));
          const X0 = (k) => plus(bx, par(N2(k)));
          const Y0 = (k) => plus(by, par(N2(k)));
          const lines = [];
          const call = (name, args) => lines.push("c." + name + "(" + args.join(", ") + ");");
          switch (pt.kind) {
            case "rect": call("rect", [X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")]); break;
            case "rrect": call("rrect", [X0("x"), Y0("y"), N2("w"), N2("h"), "goome.corners(" + [N2("tl"), N2("tr"), N2("br"), N2("bl")].join(", ") + ")", Cc("color")]); break;
            case "frame": call("frame", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")]); break;
            case "line": call("line", [X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")]); break;
            case "circle": call("circle", [X0("cx"), Y0("cy"), N2("r"), Cc("color")]); break;
            case "ring": call("ring", [X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")]); break;
            case "arc": call("arc", [X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")]); break;
            case "poly": {
              const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
              if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
                warn(where("points") + ": needs 3 or more x,y pairs", pt.id);
                break;
              }
              const id = "pts_" + GM.partVar(pt);
              const pairs = pts.map((xy) => ".{ " + plus(bx, par(ex(xy[0], "n", where("points")))) + ", " + plus(by, par(ex(xy[1], "n", where("points")))) + " }");
              lines.push("const " + id + " = [_][2]f64{" + arr(pairs) + "};");
              lines.push("c.poly(&" + id + ", " + Cc("color") + ");");
              break;
            }
            case "grad": call("rrectGrad", [X0("x"), Y0("y"), N2("w"), N2("h"), "goome.radius(" + N2("radius") + ")", Cc("from"), Cc("to"), pt.f.sideways ? "true" : "false"]); break;
            case "shadow": call("shadow", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")]); break;
            case "text": {
              const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
              let tx;
              if (m) {
                const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
                if (!pr) {
                  warn(where("text") + ": no text param called " + m[1], pt.id);
                  tx = zq("");
                } else tx = pm(pr.name);
              } else tx = zq(pt.f.text || "");
              lines.push("_ = c.fontText(null, " + [N2("size"), X0("x"), Y0("y"), tx, Cc("color")].join(", ") + ");");
              break;
            }
            case "bitmap": {
              const file = String(pt.f.file || "picture.png");
              const bid = addBitmap(ctx, "bm_" + def.name + "_" + GM.partVar(pt), file, pt.f.img);
              const tint = pt.f.tint === "" || pt.f.tint == null ? hexZ(0xFFFFFFFF) : Cc("tint");
              const a = [X0("x"), Y0("y"), N2("w"), N2("h")];
              lines.push("if (" + bid + ") |*b| c.bitmap(" + ["b"].concat(a, ["goome.radius(" + N2("radius") + ")", tint]).join(", ") + ");");
              break;
            }
            case "group": {
              const b = groupBase.get(pt.id);
              const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
              if (pt.f.clip) lines.push("c.clipPush(" + [ax, ay, N2("w"), N2("h")].join(", ") + ");");
              const keep = D.l.length, sd = D.d;
              D.d = 0;
              drawParts(pt.kids || [], ax, ay);
              const kid = D.l.splice(keep);
              D.d = sd;
              kid.forEach((l) => lines.push(l));
              if (pt.f.clip) lines.push("c.clipPop();");
              break;
            }
          }
          if (!lines.length) continue;
          if (pt.show) {
            const b = exb(pt.show, (pt.name || pt.kind) + " show");
            if (b == null) continue;
            D.add("if (" + b + ") {");
            lines.forEach((l) => D.add("    " + l));
            D.add("}");
          } else lines.forEach((l) => D.add(l));
        }
      };
      drawParts(def.parts, ELX, ELY);
      if (D.l.length) {
        open("if (u.canvas()) |c|");
        if (D.l.some((l) => /\bth\./.test(l))) St("const th = u.theme()");
        D.l.forEach((l) => o.add(l));
        close();
      }
      wout.l.forEach((l) => o.add(l));
      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = zid(w.name);
        St(v + " = " + (w.kind === "double" ? id : w.kind === "bool" ? "if (" + id + ") 1 else 0" : "@floatFromInt(" + id + ")"));
      });
      St("u.popId()");
      const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]]));
      if (val) St("value.* = " + S("value"));
      St("return " + bits.map((b) => "@as(u8, @intFromBool(" + b[0] + "))" + (b[1] === 1 ? "" : " << " + Math.log2(b[1]))).join(" | "));
      o.d--;
      A("}");

      const body = o.l.join("\n");
      flagAt.forEach((at, k) => {
        if (!new RegExp("(^|[^\\w.])" + k + "\\s*(\\|?=)(?!=)", "m").test(o.l.filter((l, i) => i !== at).join("\n"))) o.l[at] = o.l[at].replace("var ", "const ");
      });
      const heads = [];
      def.params.forEach((pr) => {
        const nmP = pm(pr.name);
        if (!usedIn(body.slice(body.indexOf("\n")), nmP)) heads.push("    _ = " + nmP + ";");
      });
      if (heads.length) o.l.splice(1, 0, ...heads);
      return o.text();
    }

    function themeDiff(t, base, set) {
      const L = [];
      for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
        const differs = isColorField(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
        if (differs) L.push(set(k, fieldLit(k, t[k])));
      }
      for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, "goome.c.goome_font_system(" + zq(t[k]) + ")"));
      return L;
    }

    const SKIN_FIELD = { skin_slider_track: "skin_slider" };
    function themeLines(ctx) {
      const t = GM.applyQuick(GM.normTheme(ctx.project.theme));
      const L = [];
      const set = (k, v) => "t." + fld(k) + " = " + v + ";";
      if (t.quick) {
        const q = t.quick;
        L.push("u.themeMake(" + hexZ(q.accent) + ", " + (q.dark ? "true" : "false") + ", " + num(q.radius) + ");");
        for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, "goome.c.goome_font_system(" + zq(t[k]) + ")"));
      } else {
        const pr = GM.presetOf(t);
        if (pr && pr.id !== "dark") {
          L.push("u.themePreset(goome.c.GOOME_PRESET_" + GM.PRESET_ENUM[pr.id] + ") catch {};");
          L.push(...themeDiff(t, pr, set));
        } else {
          if (t.base === "light") L.push("u.themeLight();");
          L.push(...themeDiff(t, GM.themeBase(t), set));
        }
      }
      for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) {
        const s = t[k];
        if (!s) continue;
        const id = addBitmap(ctx, k, s.file, s.img);
        L.push("if (" + id + ") |*b| t." + (SKIN_FIELD[k] || k) + " = .{ .bm = &b.raw, .l = " + num(s.l) + ", .t = " + num(s.t) + ", .r = " + num(s.r) + ", .b = " + num(s.b) + " };");
      }
      for (const k of Object.keys(t.icons || {}).filter((k) => GM.ICON_NAMES.includes(k))) {
        const id = addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
        L.push("if (" + id + ") |*b| t.icon[goome.c.GOOME_ICON_" + k.toUpperCase() + "] = &b.raw;");
      }
      if (t.icon_tint) L.push("t.icon_tint = 1;");
      return L;
    }

    function configLines(ctx) {
      const cfg = GM.normConfig(ctx.project.config), def = GM.normConfig({});
      const t = GM.normTheme(ctx.project.theme);
      const L = [], C = [];
      const set = (k, v) => C.push("cfg." + k + " = " + v + ";");
      for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) set(k, k === "scroll_lines" ? num(cfg[k]) : String(Math.round(cfg[k])));
      for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) set(k, String(cfg[k] ? 1 : 0));
      for (const [k] of GM.CFG_CURSORS) {
        if (cfg.cursor[k] !== def.cursor[k]) C.push("cfg.cursor[goome.c.GOOME_CUR_" + k.toUpperCase() + "] = goome.c.GOOME_CURSOR_" + cfg.cursor[k] + ";");
      }
      if (cfg.mask !== def.mask) set("mask", zq(cfg.mask));
      if (C.length) L.push("const cfg = u.config();", ...C);
      for (const [k] of GM.CFG_KEYS) {
        if (cfg.keys[k] === def.keys[k]) continue;
        const v = cfg.keys[k].trim();
        const act = "goome.c.GOOME_ACT_" + k.toUpperCase();
        L.push(v ? "u.bind(" + act + ", " + zq(v) + ") catch {};" : "_ = goome.c.goome_ui_bind(u.raw(), " + act + ", null);");
      }
      if (t.quick && t.quick.scale !== 1) L.push("u.scale(" + num(t.quick.scale) + ");");
      return L;
    }

    function sectionThemes(ctx) {
      const L = [];
      for (const [id, v] of ctx.themeVars || []) {
        const t = GM.normTheme(GM.findTheme(ctx.project, id));
        L.push(v + " = u.theme().*;");
        L.push("goome.c.goome_ui_theme_" + (t.base === "light" ? "light" : "dark") + "(&" + v + ");");
        L.push(...themeDiff(t, GM.themeBase(t), (k, x) => v + "." + fld(k) + " = " + x + ";"));
      }
      return L;
    }

    function hotkeyBody(ctx, out) {
      const hk = (ctx.project.hotkeys || []).filter((k) => k && k.combo);
      hk.forEach((k, i) => {
        const head = out.l.length;
        out.add((i + 1) + " => {");
        out.d++;
        emitActions(ctx, out, k.actions, "hotkey " + k.combo);
        out.d--;
        if (out.l.length === head + 1) out.l[head] += "},";
        else out.add("},");
      });
      return hk;
    }

    function generate(project, warn) {
      const ctx = new Ctx(project, warn);
      prepass(ctx);
      const app = project.mode === "app";
      const out = new Out(false);
      out.d = 1;
      if (app) {
        out.add("_ = u.app(" + zq(project.title) + ", " + flagsZ(AFLAGS, project.app) + ");");
        emitList(project.root, ctx, out, "app");
        if (project.app.statusbar) out.add("u.statusbar(" + textCode(ctx, project.app.status || "", {}).code + ");");
        out.add("u.appEnd();");
      } else emitList(project.root, ctx, out, "overlay");
      const hout = new Out(false);
      hout.d = 2;
      const hks = hotkeyBody(ctx, hout);
      const els = [];
      for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
      const th = themeLines(ctx);
      const cl = configLines(ctx);
      const sec = sectionThemes(ctx);
      const bl = bitmapLoads(ctx);

      const L = ['const std = @import("std");', 'const goome = @import("goome");', ""];
      const consts = ctx.consts;
      if (consts.length) L.push(...consts, "");
      if (ctx.need.placeholder) L.push("const placeholder_px = [_]u32{ 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48 };", "");
      const usesFixed = ctx.top.some((l) => /\bfixed\(/.test(l));
      if (ctx.top.length) {
        L.push("const State = struct {", ...ctx.top.map((l) => "    " + l), "};", "", "var s: State = .{};", "");
      }
      const statics = [];
      if (ctx.need.host) statics.push("var host: *goome.Goome = undefined;");
      if (ctx.need.placeholder) statics.push("var placeholder: goome.Bitmap = .{};");
      statics.push(...bl.decl);
      for (const [, v] of ctx.themeVars || []) statics.push("var " + v + ": goome.Theme = undefined;");
      if (statics.length) L.push(...statics, "");
      if (ctx.need.fmt) {
        L.push("var fmt_bufs: [8][256]u8 = undefined;", "var fmt_next: usize = 0;", "");
        L.push("fn fmt(comptime f: []const u8, args: anytype) [*:0]const u8 {", "    const b = &fmt_bufs[fmt_next % fmt_bufs.len];", "    fmt_next +%= 1;", "    return (std.fmt.bufPrintZ(b, f, args) catch \"\").ptr;", "}", "");
      }
      if (usesFixed) L.push("fn fixed(comptime n: usize, text: []const u8) [n:0]u8 {", "    var b = std.mem.zeroes([n:0]u8);", "    @memcpy(b[0..text.len], text);", "    return b;", "}", "");
      for (const f of ctx.fns) L.push("fn " + fnName(f) + "() void {}", "");
      for (const b of els) L.push(b, "");
      const bodyUses = (lines, re) => lines.some((l) => re.test(l));
      if (th.length) {
        L.push("fn setTheme(u: *goome.Ui) void {");
        if (bodyUses(th, /\bt\./)) L.push("    const t = u.theme();");
        th.forEach((l) => L.push("    " + l));
        L.push("}", "");
      }
      if (cl.length) L.push("fn setConfig(u: *goome.Ui) void {", ...cl.map((l) => "    " + l), "}", "");
      const drawBody = out.l;
      L.push("fn draw(u: *goome.Ui) void {");
      if (!bodyUses(drawBody, /\bu\./)) L.push("    _ = u;");
      L.push(...drawBody, "}", "");
      if (hks.length) {
        L.push("fn onHotkey(u: *goome.Ui, id: i32) void {");
        if (!bodyUses(hout.l, /\bu\./)) L.push("    _ = u;");
        L.push("    switch (id) {", ...hout.l, "        else => {},", "    }", "}", "");
      }
      L.push("pub fn main() !void {");
      if (app) {
        if (project.app.titlebar) {
          L.push("    const g = goome.Goome.open(.{", "        .title = " + zq(project.title) + ",", "        .mode = .window,", "        .width = " + (project.app.w | 0) + ",", "        .height = " + (project.app.h | 0) + ",");
          L.push("        .window_flags = goome.window_flags.resizable | goome.window_flags.borderless | goome.window_flags.transparent | goome.window_flags.center,", "    }) catch |e| {");
        } else L.push("    const g = goome.Goome.openApp(" + zq(project.title) + ", " + (project.app.w | 0) + ", " + (project.app.h | 0) + ") catch |e| {");
        L.push('        std.debug.print("cant open a window: {s}\\n", .{goome.strerror(goome.errorCode(e))});');
      } else {
        L.push("    const g = goome.Goome.open(.{ .title = " + zq(project.title) + ", .no_capture = true }) catch |e| {");
        L.push('        std.debug.print("cant open an overlay: {s}\\n", .{goome.strerror(goome.errorCode(e))});');
      }
      L.push("        std.process.exit(1);", "    };", "    defer g.deinit();", "    const u = try g.ui();", "    defer u.deinit();");
      if (ctx.need.host) L.push("    host = g;");
      if (ctx.need.placeholder) L.push("    placeholder = goome.Bitmap.fromArgb(&placeholder_px, 2, 2) catch .{};", "    defer placeholder.deinit();");
      bl.load.forEach((l) => L.push("    " + l));
      bl.free.forEach((l) => L.push("    " + l));
      if (th.length) L.push("    setTheme(u);");
      if (cl.length) L.push("    setConfig(u);");
      sec.forEach((l) => L.push("    " + l));
      hks.forEach((k, i) => L.push("    g.hotkey(" + zq(k.combo) + ", " + (i + 1) + ") catch {};"));
      L.push("    var running = true;", "    var dirty = true;", '    const test_backend = std.mem.startsWith(u8, g.backendName(), "test");', "    var pace: goome.Pacer = .{};", "    while (running) {");
      L.push("        var wait: i32 = if (dirty or test_backend or u.animating()) pace.wait(60) else 500;");
      L.push("        while (try g.poll(wait)) |ev| {", "            if (ev.kind == .quit or ev.kind == .close) running = false;");
      if (hks.length) L.push("            if (ev.kind == .hotkey) onHotkey(u, ev.id);");
      L.push("            _ = u.feed(ev);", "            dirty = true;", "            wait = 0;", "        }", "        if (!running) break;");
      L.push("        if (!dirty and !test_backend and !u.animating()) continue;", "        dirty = false;");
      L.push("        _ = u.begin(0) orelse continue;", "        draw(u);", "        u.end();", "    }", "}", "");
      const merged = [];
      for (const l of L.join("\n").split("\n")) {
        if (l.trim() === "}" && merged.length && /\) \{$/.test(merged[merged.length - 1])) merged[merged.length - 1] += "}";
        else merged.push(l);
      }
      return { code: finish(merged.join("\n").replace(/\n{3,}/g, "\n\n"), "zig", project), files: [...ctx.files], file: "main.zig" };
    }

    X.langs.zig = {
      label: "Zig",
      ext: ".zig",
      generate,
      hint: () => "zig 0.15.2: paste this over src/main.zig of goome-app-template-zig (or any project with zig-goome as its goome dependency), then zig build run",
    };
  })();

  (() => {
    const { GM, strq, num, floats, cut, names, WFLAGS, EFLAGS, TFLAGS, AFLAGS, IFLAGS, finish } = X.H;

    const KEYWORDS = new Set("and break do else elseif end false for function goto if in local nil not or repeat return then true until while".split(" "));
    const TAKEN = new Set("goome math string table os io pairs ipairs print type select tostring tonumber next error assert pcall require setmetatable getmetatable rawget rawset unpack data win trunc decode64 main draw on_hotkey set_theme set_config".split(" "));
    const safe = (s) => (KEYWORDS.has(s) || TAKEN.has(s) ? s + "_v" : s);
    const q = (s) => strq(s, "lua");
    const hex = (v) => "0x" + ((+v || 0) >>> 0).toString(16).toUpperCase().padStart(8, "0");
    const tf = (b) => (b ? "true" : "false");
    const flagsOf = (table, p) => {
      const on = table.filter((f) => p[f[0]]).map((f) => f[3]);
      return on.length ? on.join(" + ") : "0";
    };
    const isRoot = (pt) => pt === "overlay" || pt === "app";

    function Out() {
      this.l = [];
      this.d = 0;
      this.scopes = [{ n: 0, extra: 0 }];
    }
    Out.prototype.add = function (s) {
      if (/^local /.test(s)) this.scopes[this.scopes.length - 1].n++;
      this.l.push(s === "" ? "" : "    ".repeat(this.d) + s);
    };
    Out.prototype.checkpoint = function () {
      const top = this.scopes[this.scopes.length - 1];
      if (top.n < 60) return;
      if (top.extra) {
        this.d--;
        this.add("end");
      }
      this.add("do");
      this.d++;
      top.extra = 1;
      top.n = 0;
    };
    Out.prototype.unwrap = function () {
      const top = this.scopes[this.scopes.length - 1];
      if (top.extra) {
        this.d--;
        this.add("end");
      }
      top.extra = 0;
      top.n = 0;
    };
    Out.prototype.open = function (h) {
      this.add(h);
      this.d++;
      this.scopes.push({ n: 0, extra: 0 });
    };
    Out.prototype.mid = function (h) {
      this.unwrap();
      this.d--;
      this.add(h);
      this.d++;
    };
    Out.prototype.close = function (tail) {
      this.unwrap();
      this.scopes.pop();
      this.d--;
      this.add(tail || "end");
    };

    const wrapped = (e) => {
      if (e[0] !== "(" || e[e.length - 1] !== ")") return false;
      let d = 0;
      for (let i = 0; i < e.length; i++) {
        if (e[i] === "(") d++;
        else if (e[i] === ")") d--;
        if (d === 0 && i < e.length - 1) return false;
      }
      return true;
    };
    const par = (e) => (/^-?[\w.]+(\[\d+\])?$/.test(e) || /^ui:theme\(\)\.\w+$/.test(e) || wrapped(e) ? e : "(" + e + ")");
    const plus = (a, b) => (a === "0" ? b : b === "0" ? a : a + " + " + b);
    const minus = (a, b) => (b === "0" ? a : a + " - " + par(b));
    const neg = (e) => (e === "0" ? "0" : "-" + (e[0] === "-" ? "(" + e + ")" : par(e)));

    const LP = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 3, ">": 3, "<=": 3, ">=": 3, "+": 5, "-": 5, "*": 6, "/": 6 };
    const numStr = (v) => (Number.isInteger(v) ? String(v) : String(+v.toFixed(6)));
    function writeExpr(a, map, types) {
      const tyOf = (x) => {
        try {
          return GM.expr.type(x, types);
        } catch (e) {
          return "n";
        }
      };
      const truthy = (x, p) => (tyOf(x) === "b" ? go(x, p) : par(go(x, 0)) + " ~= 0");
      const asNum = (x, p) => (tyOf(x) === "b" ? "(" + go(x, 0) + " and 1 or 0)" : go(x, p));
      const go = (x, outer) => {
        switch (x.t) {
          case "num": return numStr(x.v);
          case "hex": return hex(x.v);
          case "bool": return tf(x.v);
          case "th": return map.th(x.f);
          case "id": return map.id(x.name);
          case "call": return "math." + x.fn + "(" + x.args.map((y) => go(y, 0)).join(", ") + ")";
          case "un": {
            if (x.op === "-") {
              const inner = go(x.a, 7);
              return "-" + (inner[0] === "-" ? "(" + inner + ")" : inner);
            }
            if (tyOf(x.a) !== "b") return "(" + go(x.a, 0) + " == 0)";
            return "not " + go(x.a, 7);
          }
          case "tern": {
            const c = truthy(x.c, 2);
            if (tyOf(x) !== "b") return "(" + c + " and " + go(x.a, 2) + " or " + go(x.b, 1) + ")";
            const la = x.a.t === "bool" ? x.a.v : null, lb = x.b.t === "bool" ? x.b.v : null;
            if (la === true && lb === false) return truthy(x.c, outer);
            if (la === false && lb === true) return "not " + par(truthy(x.c, 0));
            if (la === true) return "(" + truthy(x.c, 1) + " or " + go(x.b, 1) + ")";
            if (la === false) return "(not " + par(truthy(x.c, 0)) + " and " + go(x.b, 2) + ")";
            if (lb === false) return "(" + c + " and " + go(x.a, 2) + ")";
            if (lb === true) return "(not " + par(truthy(x.c, 0)) + " or " + go(x.a, 1) + ")";
            return "((" + c + " and " + go(x.a, 2) + ") or (not " + par(truthy(x.c, 0)) + " and " + go(x.b, 2) + "))";
          }
          case "bin": {
            const p = LP[x.op];
            let l, r, op = x.op;
            if (op === "&&" || op === "||") {
              op = op === "&&" ? "and" : "or";
              l = truthy(x.a, p);
              r = truthy(x.b, p + 1);
            } else if (p === 3) {
              op = op === "!=" ? "~=" : op;
              const mixed = (tyOf(x.a) === "b") !== (tyOf(x.b) === "b");
              l = mixed ? asNum(x.a, 4) : go(x.a, 4);
              r = mixed ? asNum(x.b, 4) : go(x.b, 4);
            } else {
              l = go(x.a, p);
              r = go(x.b, p + 1);
            }
            const s = l + " " + op + " " + r;
            return p < outer ? "(" + s + ")" : s;
          }
        }
        return "0";
      };
      return go(a, 0);
    }

    const THC_SIZE_ENUM = { align: "ALIGN_", ease: "EASE_" };
    function fieldLit(k, v) {
      if (GM.THEME_COLORS.includes(k)) return hex(v);
      const names2 = GM.THEME_ENUMS[k];
      const nm = names2 && names2[v | 0];
      if (nm) return "goome." + THC_SIZE_ENUM[k] + nm.toUpperCase();
      return num(v);
    }

    function Ctx(project, warn) {
      this.project = project;
      this.warn = warn;
      this.nm = names(project);
      for (const [k, v] of this.nm) this.nm.set(k, safe(v));
      this.vnm = this.nm.vnm;
      for (const [k, v] of this.vnm) this.vnm.set(k, safe(v));
      this.uniq = (b) => safe(this.nm.take(b));
      this.top = [];
      this.data = [];
      this.fns = [];
      this.need = { win: false, trunc: false, b64: false, placeholder: false };
      this.files = new Set();
      this.scope = null;
      this.defs = new Map((project.elements || []).map((d) => [d.id, d]));
      this.used = new Map();
      this.k = 0;
    }
    Ctx.prototype.v = function (name) {
      if (this.scope) return this.scope.alias[name] || name;
      return "s." + name;
    };
    Ctx.prototype.decl = function (kind, name, val, extra) {
      const sc = this.scope;
      if (sc) {
        if (kind === "floats") {
          const key = sc.prefix + "_" + name;
          sc.alias[name] = "data." + key;
          this.data.push(key + " = {" + val.map(num).join(", ") + "}");
          return;
        }
        sc.slots.push({ kind, name, val: kind === "color" ? val >>> 0 : kind === "bool" ? (val ? 1 : 0) : +val || 0 });
        return;
      }
      if (kind === "floats") {
        this.data.push(name + " = {" + val.map(num).join(", ") + "}");
        return;
      }
      const lit = kind === "color" ? hex(val) : kind === "double" ? num(val) : kind === "int" ? String(val | 0) : kind === "str" ? q(cut(val, Math.max(2, extra | 0) - 1)) : tf(val);
      this.top.push(name + " = " + lit);
    };
    Ctx.prototype.constArr = function (name, items) {
      if (this.scope) name = this.scope.prefix + "_" + name;
      this.data.push(name + " = {" + items.map(q).join(", ") + "}");
      return "data." + name;
    };

    function emitList(list, ctx, out, ptype) {
      for (const n of list) {
        out.checkpoint();
        emitNode(n, ctx, out, ptype);
      }
    }

    function themeVar(ctx, id) {
      ctx.themeVars = ctx.themeVars || new Map();
      if (!ctx.themeVars.has(id)) {
        const t = GM.findTheme(ctx.project, id);
        const base = "theme_" + GM.ident(t ? t.name : id, "t");
        const taken = new Set([...ctx.themeVars.values()]);
        let v = base, i = 2;
        while (taken.has(v)) v = base + i++;
        ctx.themeVars.set(id, v);
      }
      return ctx.themeVars.get(id);
    }

    function styled(ctx, out, st, body) {
      if (!GM.styleCount(st)) return body();
      let pushed = 0;
      const th = st.theme ? GM.findTheme(ctx.project, st.theme) : null;
      if (st.theme && th) out.add("ui:push_theme(data." + themeVar(ctx, st.theme) + ")"), pushed++;
      else if (st.theme) ctx.warn("", "a style uses a theme that is gone: " + st.theme);
      for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) out.add("ui:push_color(goome.S_" + f.toUpperCase() + ", " + hex(st.c[f]) + ")"), pushed++;
      for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) out.add("ui:push_num(goome.S_" + f.toUpperCase() + ", " + fieldLit(f, st.n[f]) + ")"), pushed++;
      if (Array.isArray(st.radii) && st.radii.length === 4) out.add("ui:push_radii({" + st.radii.map(num).join(", ") + "})"), pushed++;
      body();
      if (pushed) out.add("ui:pop(" + pushed + ")");
    }

    function emitSlot(n, s, ctx, out, ptype) {
      const st = n.slotStyle && n.slotStyle[String(s)];
      styled(ctx, out, st, () => emitList(n.kids[s] || [], ctx, out, ptype));
    }

    const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int", selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };

    function prepass(ctx) {
      const pj = ctx.project;
      ctx.refs = new Map();
      ctx.vars = new Map();
      ctx.targets = new Set();
      const note = (a) => {
        if (!a) return;
        if ((a.do === "open" || a.do === "close" || a.do === "tab") && a.target) ctx.targets.add(a.target);
        if (a.do === "call" && a.fn) {
          const f = safe(GM.ident(a.fn, "on_click"));
          if (!ctx.fns.includes(f)) ctx.fns.push(f);
        }
      };
      GM.walk(pj.root, (n) => {
        const on = n.on || {};
        for (const e in on) for (const a of on[e] || []) note(a);
      });
      for (const hk of pj.hotkeys || []) for (const a of hk.actions || []) note(a);
      const caps = {};
      GM.walk(pj.root, (n) => {
        if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
      });
      for (const v of pj.vars || []) {
        const name = ctx.vnm.get(v.id);
        const r = { name, code: "s." + name, type: v.type, v, cap: Math.max(256, caps[v.id] || 0) };
        ctx.vars.set(v.id, r);
        ctx.refs.set(v.name, r);
        declVar(ctx, r);
      }
      GM.walk(pj.root, (n) => {
        if (!n.p || !n.p.var || n.p.bind || !OWN_T[n.type] || ctx.refs.has(n.p.var)) return;
        const nm = ctx.nm.get(n.id);
        if (!nm) return;
        ctx.refs.set(n.p.var, { name: nm, code: "s." + nm, type: OWN_T[n.type] });
      });
    }

    function declVar(ctx, r) {
      const v = r.v, d = v.def;
      if (v.type === "list") {
        ctx.top.push(r.name + " = {" + GM.lines(d).map(q).join(", ") + "}");
        return;
      }
      const kind = { bool: "bool", int: "int", float: "double", color: "color", string: "str" }[v.type];
      const val = v.type === "string" ? String(d == null ? "" : d) : v.type === "color" ? +d >>> 0 : v.type === "bool" ? !!d : +d || 0;
      ctx.decl(kind, r.name, val, r.cap);
    }

    function listInfo(ctx, n) {
      const p = n.p;
      if (p.itemsVar) {
        const r = ctx.vars.get(p.itemsVar);
        if (r && r.type === "list") return { arr: r.code, len: "#" + r.code, items: GM.lines(r.v.def) };
        ctx.warn(n.id, "the items list var is gone or isnt a list, using the typed items");
      }
      return null;
    }

    function exprCode(ctx, src, want, where, id) {
      const types = GM.layoutIdents(ctx.project);
      const r = GM.expr.check(src, types, want);
      if (!r.ok) {
        ctx.warn(id || "", where + ": " + r.err);
        return null;
      }
      const map = {
        id: (name) => {
          const ref = ctx.refs.get(name);
          return ref ? ref.code : name;
        },
        th: (f) => "ui:theme()." + f,
      };
      let s = writeExpr(r.ast, map, types);
      if (want === "b" && r.type !== "b") s = par(s) + " ~= 0";
      if (want === "n" && r.type === "b") s = "(" + s + " and 1 or 0)";
      return s;
    }

    function textCode(ctx, text, opts) {
      const parts = GM.interp(text);
      const vars = parts.filter((x) => x.v && ctx.refs.has(x.v));
      for (const x of parts) if (x.v && !ctx.refs.has(x.v)) ctx.warn((opts && opts.id) || "", "theres no var called " + x.v + " for {" + x.v + "}");
      if (!vars.length) return { code: q(text) };
      let f = "";
      const args = [];
      for (const x of parts) {
        const r = x.v && ctx.refs.get(x.v);
        if (!r) f += (x.t != null ? x.t : "{" + x.v + "}").replace(/%/g, "%%");
        else if (r.type === "float") f += "%g", args.push(r.code);
        else if (r.type === "string") f += "%s", args.push(r.code);
        else if (r.type === "color") f += "#%08X", args.push(r.code);
        else if (r.type === "list") f += "%s", args.push(r.code + "[1]");
        else if (r.type === "bool") f += "%s", args.push("tostring(" + r.code + ")");
        else f += "%d", args.push(r.code);
      }
      return { code: "string.format(" + q(f) + ", " + args.join(", ") + ")" };
    }

    function emitActions(ctx, out, list, where) {
      const St = (s) => out.add(s);
      const idx = GM.index(ctx.project);
      for (const a of list || []) {
        if (!a || !a.do) continue;
        const refOf = (name) => {
          const r = ctx.refs.get(name);
          if (!r) ctx.warn("", where + ": theres no var called " + (name || "(none)"));
          return r;
        };
        switch (a.do) {
          case "set": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type === "string") {
              St(r.code + " = " + textCode(ctx, a.value || "", {}).code);
              break;
            }
            if (r.type === "list") {
              ctx.warn("", where + ": cant set a list var, its fixed");
              break;
            }
            const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
            let e = exprCode(ctx, a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want, where);
            if (e == null) break;
            if (r.type === "int" && !/^-?\d+$/.test(e)) {
              ctx.need.trunc = true;
              e = "trunc(" + e + ")";
            }
            St(r.code + " = " + e);
            break;
          }
          case "toggle": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "bool") {
              ctx.warn("", where + ": toggle needs a yes/no var, " + r.name + " isnt one");
              break;
            }
            St(r.code + " = not " + r.code);
            break;
          }
          case "add":
          case "sub": {
            const r = refOf(a.var);
            if (!r) break;
            if (r.type !== "int" && r.type !== "float") {
              ctx.warn("", where + ": add/sub needs a number var");
              break;
            }
            const src = a.value === "" || a.value == null ? "1" : a.value;
            const e = exprCode(ctx, src, "n", where);
            if (e == null) break;
            let v = r.code + (a.do === "add" ? " + " : " - ") + par(e);
            if (r.v && +r.v.max > +r.v.min) v = "math.max(" + num(r.v.min) + ", math.min(" + num(r.v.max) + ", " + v + "))";
            const clamp = r.v && +r.v.max > +r.v.min;
            if (r.type === "int" && !(/^-?\d+$/.test(String(src).trim()) && (!clamp || (Number.isInteger(+r.v.min) && Number.isInteger(+r.v.max))))) {
              ctx.need.trunc = true;
              v = "trunc(" + v + ")";
            }
            St(r.code + " = " + v);
            break;
          }
          case "open":
          case "close": {
            const t = idx.get(a.target);
            if (!t) {
              ctx.warn("", where + ": the " + a.do + " target is gone");
              break;
            }
            const on = a.do === "open";
            if (t.n.type === "popup") St(on ? "ui:popup_open(" + q(t.n.p.label || "popup") + ")" : "ui:popup_close()");
            else if (t.n.type === "window" || t.n.type === "modal") St(openRef(ctx, t.n) + " = " + tf(on));
            else ctx.warn("", where + ": can only open or close a window, modal or popup");
            break;
          }
          case "toast":
            St("ui:toast(" + textCode(ctx, a.text || "", {}).code + ", " + (+a.ms > 0 ? a.ms | 0 : 2500) + ")");
            break;
          case "tab": {
            const t = idx.get(a.target);
            if (!t || t.n.type !== "tabs") {
              ctx.warn("", where + ": the tab target has to be a tabs node");
              break;
            }
            const r = t.n.p.bind ? ctx.vars.get(t.n.p.bind) : ctx.refs.get(t.n.p.var);
            if (!r) break;
            St(r.code + " = " + (a.tab | 0));
            break;
          }
          case "copy":
            ctx.need.win = true;
            St("win:clipboard(" + textCode(ctx, a.text || "", {}).code + ")");
            break;
          case "quit":
            ctx.need.win = true;
            St("win:push(goome.CLOSE)");
            break;
          case "call":
            St(safe(GM.ident(a.fn, "on_click")) + "()");
            break;
          default:
            ctx.warn("", where + ": dont know the action " + a.do);
        }
      }
    }

    function openRef(ctx, n) {
      if (n.p.bind) {
        const r = ctx.vars.get(n.p.bind);
        if (r) return r.code;
      }
      const nm = ctx.nm.get(n.id) || safe(GM.ident(n.p.var || n.type));
      return n.type === "window" ? "s." + nm + ".open" : "s." + nm;
    }

    function emitNode(n, ctx, out, ptype) {
      const go = () => styled(ctx, out, n.style, () => emitEnabled(n, ctx, out, ptype));
      if (n.p && n.p.showIf && String(n.p.showIf).trim()) {
        const e = exprCode(ctx, n.p.showIf, "b", "show if", n.id);
        if (e != null) {
          out.open("if " + e + " then");
          go();
          out.close();
          return;
        }
      }
      go();
    }

    const VALUE_T = { checkbox: 1, toggle: 1, radio: 1, slider: 1, slider_int: 1, input: 1, text_edit: 1, combo: 1, selectable: 1, color: 1, tabs: 1, collapsing: 1, tree: 1 };
    function bareRef(ctx, n) {
      if (n.p.bind) return ctx.vars.get(n.p.bind) || null;
      if (!OWN_T[n.type]) return null;
      const nm = ctx.nm.get(n.id);
      if (!nm) return null;
      return { name: nm, code: ctx.v(nm), type: OWN_T[n.type] };
    }

    function emitEnabled(n, ctx, out, ptype) {
      const src = n.p && n.p.enableIf && String(n.p.enableIf).trim();
      if (!src) return emitBare(n, ctx, out, ptype, null);
      const e = exprCode(ctx, src, "b", "enable if", n.id);
      if (e == null) return emitBare(n, ctx, out, ptype, null);
      const en = "en" + ++ctx.k;
      out.add("local " + en + " = " + e);
      out.open("if not " + en + " then");
      out.add("local th = ui:theme()");
      out.add("ui:push_color(goome.S_TEXT, th.text_dim)");
      out.add("ui:push_color(goome.S_ACCENT, th.accent % 0x1000000 + math.floor(th.accent / 0x2000000) * 0x1000000)");
      out.close();
      let saved = null;
      if (VALUE_T[n.type]) {
        const r = bareRef(ctx, n);
        if (r) {
          const w = "was" + ++ctx.k;
          saved = { r, w };
          out.add("local " + w + " = " + r.code);
        }
      }
      emitBare(n, ctx, out, ptype, en);
      out.open("if not " + en + " then");
      if (saved) out.add(saved.r.code + " = " + saved.w);
      out.add("ui:pop(2)");
      out.close();
    }

    function emitBare(n, ctx, out, ptype, en) {
      const p = n.p || {};
      const U = (name, args) => "ui:" + name + "(" + (args || []).join(", ") + ")";
      const st = (s) => out.add(s);
      const nm = ctx.nm.get(n.id) || safe(GM.ident(p.var || n.type));
      if (ptype === "overlay" && n.type !== "window" && n.type !== "el") {
        ctx.warn(n.id, "only windows and custom elements can sit on the overlay canvas, skipped");
        return;
      }
      const leaf = !GM.isContainer(n.type) && !["same_line", "space", "separator", "menu_item", "menu_sep", "el"].includes(n.type);
      if (leaf && +p.width > 0) st(U("width", [num(p.width)]));
      if (n.abs && !isRoot(ptype)) {
        st(U("pos", [num(n.abs.x), num(n.abs.y)]));
        if (+n.abs.w > 0 || +n.abs.h > 0) st(U("size", [num(+n.abs.w > 0 ? n.abs.w : 0), num(+n.abs.h > 0 ? n.abs.h : 0)]));
      }
      const on = n.on || {};
      const has = (e) => Array.isArray(on[e]) && on[e].length > 0;
      const where = (e) => (p.label || n.type) + " " + e;
      const printLine = (txt) => "print(" + q(txt) + ")";
      const ifActs = (cond, fill) => {
        out.open("if " + cond + " then");
        fill();
        out.close();
      };
      const andEn = (cond) => (en ? cond + " and " + en : cond);
      const bound = (types) => {
        if (!p.bind) return null;
        const r = ctx.vars.get(p.bind);
        if (!r) {
          ctx.warn(n.id, "the bound var is gone, using its own var");
          return null;
        }
        if (ctx.scope) {
          ctx.warn(n.id, "widget parts inside a custom element cant bind a project var yet, using its own");
          return null;
        }
        if (types && !types.includes(r.type)) {
          ctx.warn(n.id, r.name + " is a " + r.type + " var, " + n.type + " cant use it, using its own var");
          return null;
        }
        return r;
      };
      const own = (kind, val, extra) => {
        ctx.decl(kind, nm, val, extra);
        return { name: nm, code: ctx.v(nm), type: kind === "double" ? "float" : kind === "str" ? "string" : kind };
      };
      const changeEvents = () => has("change") || has("on") || has("off");
      const fireChange = (ref) => {
        if (has("change")) emitActions(ctx, out, on.change, where("change"));
        if ((has("on") || has("off")) && ref) {
          if (has("on")) ifActs(ref.code, () => emitActions(ctx, out, on.on, where("on")));
          if (has("off")) ifActs("not " + ref.code, () => emitActions(ctx, out, on.off, where("off")));
        }
      };
      const afterEdit = (ref, cond) => {
        if (changeEvents()) ifActs(andEn(cond || "edited"), () => fireChange(ref));
      };
      const value = (target, call, ref, shift) => {
        if (changeEvents()) {
          out.add(target + ", edited = " + call);
          if (shift) out.add(target + " = " + target + " - 1");
          afterEdit(ref);
        } else out.add(target + " = " + call + (shift ? " - 1" : ""));
      };
      const hover = () => {
        if (!has("hover")) return;
        const hv = ctx.uniq(nm + "_hot");
        ctx.top.push(hv + " = false");
        const h = "hov" + ++ctx.k;
        out.add("local " + h + " = ui:hovered()");
        ifActs(h + " and not s." + hv, () => emitActions(ctx, out, on.hover, where("hover")));
        out.add("s." + hv + " = " + h);
      };
      const tooltip = () => {
        if (leaf && p.tooltip) st(U("tooltip", [q(p.tooltip)]));
      };
      const label = (txt) => textCode(ctx, txt == null ? "" : txt, { id: n.id }).code;
      const shownVar = () => {
        const sh = "shown" + ++ctx.k;
        out.add("local " + sh);
        return sh;
      };

      switch (n.type) {
        case "window": {
          if (ctx.scope) return ctx.warn(n.id, "windows cant go inside a custom element");
          const b = bound(["bool"]);
          const needOpen = !!p.close || ctx.targets.has(n.id) || !!b;
          const ws = "s." + nm;
          ctx.top.push(nm + " = {x = " + num(p.x) + ", y = " + num(p.y) + ", w = " + num(p.w) + ", h = " + num(p.h) + (needOpen && !b ? ", open = true" : "") + "}");
          if (b) st(ws + ".open = " + b.code);
          out.open("if " + U("window", [label(p.label), ws, flagsOf(WFLAGS, p)]) + " then");
          emitList(n.kids[0], ctx, out, "window");
          out.close();
          st("ui:window_end()");
          if (b) st(b.code + " = " + ws + ".open");
          return;
        }
        case "row": {
          const k = +p.cols > 0 ? +p.cols : n.kids[0].length;
          if (k >= 2) st(U("row", [String(k)]));
          emitList(n.kids[0], ctx, out, "row");
          return;
        }
        case "same_line": return st(U("same_line"));
        case "space": return st(U("space", [num(p.px)]));
        case "separator": return st(U("separator"));
        case "scroll": {
          st(U("scroll", [q(nm), num(p.h)]));
          emitList(n.kids[0], ctx, out, "scroll");
          st(U("scroll_end"));
          return;
        }
        case "split": {
          const fr = nm + "_frac";
          ctx.decl("double", fr, +p.frac || 0.3);
          const code = ctx.v(fr);
          st("local _");
          st("_, " + code + " = " + U("split", [q(nm), code, tf(p.vertical)]));
          emitSlot(n, 0, ctx, out, "split");
          st(U("split_next"));
          emitSlot(n, 1, ctx, out, "split");
          st(U("split_end"));
          return;
        }
        case "tabs": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          if (!items.length) items.push("Tab");
          const r = bound(["int"]) || own("int", Math.min(items.length - 1, Math.max(0, p.sel | 0)));
          const arr = li ? li.arr : ctx.constArr(nm + "_names", items);
          value(r.code, U("tabs", [q(nm), arr, r.code + " + 1"]), r, true);
          let first = true;
          const k = Math.max(items.length, n.kids.length);
          for (let i = 0; i < k; i++) {
            if (!(n.kids[i] || []).length) continue;
            if (first) out.open("if " + r.code + " == " + i + " then");
            else out.mid("elseif " + r.code + " == " + i + " then");
            emitSlot(n, i, ctx, out, "tabs");
            first = false;
          }
          if (!first) out.close();
          return;
        }
        case "collapsing":
        case "tree": {
          const tree = n.type === "tree";
          const r = bound(["bool"]) || own("bool", !!p.open);
          const w = has("change") ? "was" + ++ctx.k : null;
          if (w) out.add("local " + w + " = " + r.code);
          const sh = shownVar();
          out.add(sh + ", " + r.code + " = " + U(n.type, [label(p.label), r.code]));
          if (w) ifActs(andEn(r.code + " ~= " + w), () => emitActions(ctx, out, on.change, where("change")));
          out.open("if " + sh + " then");
          emitList(n.kids[0], ctx, out, n.type);
          if (tree) st(U("tree_end"));
          out.close();
          return;
        }
        case "modal": {
          const r = bound(["bool"]) || own("bool", false);
          if (p.button) ifActs(U("button", [label(p.button)]), () => out.add(r.code + " = true"));
          const sh = shownVar();
          out.add(sh + ", " + r.code + " = " + U("modal", [label(p.label), r.code]));
          out.open("if " + sh + " then");
          emitList(n.kids[0], ctx, out, "modal");
          st(U("modal_end"));
          out.close();
          return;
        }
        case "popup": {
          const id = q(p.label || "popup");
          const b = bound(["bool"]);
          if (b) ifActs(b.code, () => {
            st(U("popup_open", [id]));
            out.add(b.code + " = false");
          });
          out.open("if " + U("popup", [id]) + " then");
          emitList(n.kids[0], ctx, out, "popup");
          st(U("popup_end"));
          out.close();
          return;
        }
        case "menubar":
        case "menu": {
          const mb = n.type === "menubar";
          out.open("if " + (mb ? U("menubar") : U("menu", [label(p.label)])) + " then");
          emitList(n.kids[0], ctx, out, n.type);
          st(mb ? U("menubar_end") : U("menu_end"));
          out.close();
          return;
        }
        case "menu_item": {
          const sc = p.shortcut ? q(p.shortcut) : "nil";
          const b = p.check || p.bind ? bound(["bool"]) : null;
          if (p.check || b) {
            const r = b || own("bool", !!p.on);
            const cl = U("menu_item", [label(p.label), sc, r.code]);
            if (has("click")) {
              const k = "picked" + ++ctx.k;
              out.add("local " + k);
              out.add(k + ", " + r.code + " = " + cl);
              ifActs(andEn(k), () => emitActions(ctx, out, on.click, where("click")));
            } else {
              out.add("local _");
              out.add("_, " + r.code + " = " + cl);
            }
          } else {
            const args = [label(p.label)].concat(p.shortcut ? [sc] : []);
            ifActs(andEn(U("menu_item", args)), () => {
              if (has("click")) emitActions(ctx, out, on.click, where("click"));
              else out.add(printLine(p.label + " clicked"));
            });
          }
          return;
        }
        case "menu_sep": return st(U("menu_separator"));
        case "label": st(U("label", [label(p.label)])); hover(); break;
        case "heading": st(U("heading", [label(p.label)])); hover(); break;
        case "wrapped": st(U("wrapped", [label(p.label)])); break;
        case "button": {
          ifActs(andEn(U("button", [label(p.label)])), () => {
            if (has("click")) return emitActions(ctx, out, on.click, where("click"));
            if (p.action === "toast") st(U("toast", [label(p.toast), String(p.ms | 0)]));
            else if (p.action === "close") st(U("popup_close"));
            else out.add(printLine(p.label + " clicked"));
          });
          hover();
          break;
        }
        case "checkbox":
        case "toggle": {
          const r = bound(["bool"]) || own("bool", !!p.on);
          value(r.code, U(n.type, [label(p.label), r.code]), r);
          hover();
          break;
        }
        case "radio": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const ev = changeEvents();
          const was = ev ? "was" + ++ctx.k : null;
          if (ev) out.add("local " + was + " = " + r.code);
          if (li) {
            out.open("for i, item in ipairs(" + li.arr + ") do");
            if (p.inline) ifActs("i > 1", () => st(U("same_line")));
            out.add(r.code + " = " + U("radio", ["item", r.code, "i - 1"]));
            out.close();
          } else items.forEach((it, i) => {
            if (i && p.inline) st(U("same_line"));
            out.add(r.code + " = " + U("radio", [q(it), r.code, String(i)]));
          });
          if (ev) ifActs(andEn(r.code + " ~= " + was), () => fireChange(r));
          break;
        }
        case "slider": {
          const b = bound(["float", "int"]);
          if (b && b.type === "int") {
            value(b.code, U("slider_int", [label(p.label), b.code, String(Math.round(p.min)), String(Math.round(p.max))]), b);
          } else {
            const r = b || own("double", +p.value || 0);
            value(r.code, U("slider", [label(p.label), r.code, num(p.min), num(p.max)].concat(p.fmt ? [q(p.fmt)] : [])), r);
          }
          hover();
          break;
        }
        case "slider_int": {
          const r = bound(["int"]) || own("int", Math.round(+p.value || 0));
          value(r.code, U("slider_int", [label(p.label), r.code, String(Math.round(p.min)), String(Math.round(p.max))]), r);
          hover();
          break;
        }
        case "input": {
          const cap = Math.max(2, p.cap | 0 || 64);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          const fp = Object.assign({}, p, { enter: !!p.enter || has("enter") });
          const capS = String(b ? b.cap : cap);
          if (!IFLAGS.some((f) => fp[f[0]]) && !p.hint) {
            value(r.code, U("input", [label(p.label), r.code, capS]), r);
            hover();
            break;
          }
          const call = U("input_ex", [label(p.label), r.code, flagsOf(IFLAGS, fp), p.hint ? q(p.hint) : "nil", capS]);
          if (!fp.enter) {
            value(r.code, call, r);
            hover();
            break;
          }
          const was = "was" + ++ctx.k;
          out.add("local " + was + " = " + r.code);
          out.add(r.code + ", edited = " + call);
          if (changeEvents()) ifActs(andEn("edited and " + r.code + " ~= " + was), () => fireChange(r));
          if (has("enter")) ifActs(andEn("edited and " + r.code + " == " + was), () => emitActions(ctx, out, on.enter, where("enter")));
          hover();
          break;
        }
        case "text_edit": {
          const cap = Math.max(2, p.cap | 0 || 4096);
          const b = bound(["string"]);
          if (ctx.scope && !b) return ctx.warn(n.id, "text boxes cant keep their text in goome_ui_store, skipped");
          const r = b || own("str", p.text || "", cap);
          value(r.code, U("text_edit", [q(nm), r.code, num(p.h), flagsOf(EFLAGS, p), String(b ? b.cap : cap)]), r);
          break;
        }
        case "combo": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : [""]);
          value(r.code, U("combo", [label(p.label), r.code + " + 1", arr]), r, true);
          hover();
          break;
        }
        case "selectable": {
          const li = listInfo(ctx, n);
          const items = li ? li.items : GM.lines(p.items);
          const r = bound(["int"]) || own("int", p.sel | 0);
          const arr = li ? li.arr : ctx.constArr(nm + "_items", items.length ? items : ["Item"]);
          const ev = changeEvents();
          out.open("for i, item in ipairs(" + arr + ") do");
          ifActs(U("selectable", ["item", r.code + " == i - 1"]), () => {
            out.add(r.code + " = i - 1");
            if (ev && en) ifActs(en, () => fireChange(r));
            else if (ev) fireChange(r);
          });
          out.close();
          break;
        }
        case "color": {
          const r = bound(["color"]) || own("color", p.color >>> 0);
          value(r.code, U("color", [label(p.label), r.code]), r);
          hover();
          break;
        }
        case "progress": {
          const b = bound(["float", "int"]);
          let val = num(p.value);
          if (b) {
            const lo = +b.v.min, hi = +b.v.max;
            val = hi > lo && !(lo === 0 && hi === 1) ? (lo ? par(minus(b.code, num(lo))) : b.code) + " / " + num(hi - lo) : b.code;
          }
          st(U("progress", [val].concat(p.label ? [label(p.label)] : [])));
          hover();
          break;
        }
        case "table":
        case "plot_lines":
        case "plot_bars":
        case "image": {
          emitData(n, ctx, out, nm);
          if (n.type === "image") hover();
          break;
        }
        case "el": {
          emitInstance(n, ctx, out, ptype);
          return;
        }
        default:
          ctx.warn(n.id, "dont know how to export " + n.type);
          return;
      }
      tooltip();
    }

    function emitData(n, ctx, out, nm) {
      const p = n.p || {};
      const st = (s) => out.add(s);
      switch (n.type) {
        case "table": {
          const cols = GM.lines(p.cols).map((x) => {
            const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
            return [m[1].trim(), m[2] ? +m[2] : 0];
          });
          if (!cols.length) cols.push(["Column", 0]);
          const rows = GM.lines(p.rows).map((r) => {
            const cells = r.split(",").map((x) => x.trim());
            while (cells.length < cols.length) cells.push("");
            return cells.slice(0, cols.length);
          });
          const fl = flagsOf(TFLAGS, p);
          const key = nm + "_rows";
          ctx.data.push(key + " = {" + rows.map((r) => "{" + r.map(q).join(", ") + "}").join(", ") + "}");
          const args = [q(nm), String(cols.length)];
          if (fl !== "0") args.push(num(p.h), fl);
          else if (+p.h) args.push(num(p.h));
          out.open("if " + "ui:table(" + args.join(", ") + ") then");
          cols.forEach((cl) => out.add("ui:table_column(" + q(cl[0]) + (cl[1] ? ", " + num(cl[1]) : "") + ")"));
          out.open("for _, row in ipairs(data." + key + ") do");
          out.add("ui:table_row()");
          out.open("for j, cell in ipairs(row) do");
          out.add("if j > 1 then");
          out.add("    ui:table_next()");
          out.add("end");
          out.add("ui:label(cell)");
          out.close();
          out.close();
          out.close();
          st("ui:table_end()");
          break;
        }
        case "plot_lines":
        case "plot_bars": {
          const vals = floats(p.values);
          ctx.decl("floats", nm, vals);
          st("ui:" + n.type + "(" + [q(p.label), ctx.scope ? ctx.v(nm) : "data." + nm, num(p.min), num(p.max), num(p.h)].join(", ") + ")");
          break;
        }
        case "image": {
          ctx.need.placeholder = true;
          st("ui:image(" + ["data.placeholder", num(p.w), num(p.h), num(p.radius)].join(", ") + ")");
          break;
        }
      }
    }

    function elInfo(ctx, def) {
      let e = ctx.used.get(def.id);
      if (!e) {
        e = { def };
        ctx.used.set(def.id, e);
      }
      return e;
    }

    function litOf(type, v) {
      if (type === "color") return hex(v);
      if (type === "bool") return tf(!!v);
      if (type === "text") return q(v == null ? "" : v);
      return num(v);
    }

    const hasValue = (def) => !!(def.value && def.value.src && def.value.src !== "none");
    const elFn = (def) => safe(def.name + "_el");
    const EL_LOCALS = new Set("s store c o el box rs ox oy th ui sid init value changed hovered pressed dragging clicked released pressed_now dragend nx ny edited".split(" "));
    const pname = (name) => safe(EL_LOCALS.has(name) ? name + "_p" : name);

    function emitInstance(n, ctx, out, ptype) {
      const p = n.p;
      const def = ctx.defs.get(p.el);
      if (!def) return ctx.warn(n.id, "this custom element is gone from the library, skipped");
      if (ctx.scope) return ctx.warn(n.id, "custom elements cant go inside custom elements yet");
      const nm = ctx.nm.get(n.id) || safe(GM.ident(p.var || def.name));
      elInfo(ctx, def);
      if (ptype === "overlay") out.add("ui:pos(" + num(p.x) + ", " + num(p.y) + ")");
      const args = def.params.map((pr) => litOf(pr.type, p.params && pr.name in p.params ? p.params[pr.name] : pr.def));
      const w = +p.w || def.w, h = +p.h || def.h;
      let own = w !== def.w || h !== def.h;
      const sv = def.state.map((s) => {
        const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
        if (v !== s.def) own = true;
        return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
      });
      const a = ["ui", q(nm)].concat(args);
      if (own) {
        const key = nm + "_init";
        ctx.data.push(key + " = {" + [w, h].concat(sv).map(num).join(", ") + "}");
        a.push("data." + key);
      }
      const val = hasValue(def);
      const on = n.on || {};
      const evk = ["change", "click", "dragend", "hover"].filter((e) => Array.isArray(on[e]) && on[e].length);
      const info = ctx.used.get(def.id);
      if (evk.length) info.mask = true;
      const call = elFn(def) + "(" + a.join(", ") + ")";
      const k = ++ctx.k;
      const tags = ["change", "click", "dragend", "hover"];
      const last = evk.length ? Math.max(...evk.map((e) => tags.indexOf(e))) : -1;
      const vars = tags.slice(0, last + 1).map((e) => (evk.includes(e) ? "m" + k + "_" + e : "_"));
      const stateKey = "s." + nm + "_value";
      if (val) ctx.top.push(nm + "_value = 0");
      if (!evk.length) out.add(val ? stateKey + " = " + call : call);
      else if (!val) out.add("local " + vars.join(", ") + " = " + call);
      else {
        out.add("local " + vars.join(", "));
        out.add([stateKey].concat(vars).join(", ") + " = " + call);
      }
      for (const e of ["change", "click", "dragend"]) if (evk.includes(e)) ifActsFor(out, "m" + k + "_" + e, () => emitActions(ctx, out, on[e], def.name + " " + e));
      if (evk.includes("hover")) {
        const hv = ctx.uniq(nm + "_hot");
        ctx.top.push(hv + " = false");
        ifActsFor(out, "m" + k + "_hover and not s." + hv, () => emitActions(ctx, out, on.hover, def.name + " hover"));
        out.add("s." + hv + " = m" + k + "_hover");
      }
    }
    function ifActsFor(out, cond, fill) {
      out.open("if " + cond + " then");
      fill();
      out.close();
    }

    function elementCode(ctx, info) {
      const def = info.def;
      const warn = (msg, id) => ctx.warn(id || def.id, def.name + ": " + msg);
      const types = GM.elementIdents(def);
      const groups = GM.dragGroups(def);
      const rs = !!(def.resizable && def.resizable.on);
      const builtin = new Set(["w", "h", "value", "hovered", "pressed", "dragging"]);
      const prNames = new Set(def.params.map((x) => x.name));
      for (const s of def.state) if (builtin.has(s.name)) warn("state " + s.name + " clashes with a built in name");
      for (const s of def.params) if (builtin.has(s.name) || def.state.some((x) => x.name === s.name)) warn("param " + s.name + " clashes with another name");

      const scope = { slots: [], alias: {}, prefix: def.name };
      const wout = new Out();
      {
        const local = new Map();
        const used = new Set([...EL_LOCALS, "data", "goome", "math", "string", "table", "trunc"].concat([...prNames].map(pname)));
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const b = safe(GM.ident(pt.w.p && pt.w.p.var ? pt.w.p.var : pt.w.type));
          let k = b, i = 2;
          while (used.has(k)) k = b + i++;
          used.add(k);
          local.set(pt.w.id, k);
        });
        const saveNm = ctx.nm;
        ctx.nm = local;
        ctx.scope = scope;
        GM.walkParts(def.parts, (pt) => {
          if (pt.kind !== "widget" || !pt.w) return;
          const t = pt.w.type;
          if (GM.isContainer(t) || t === "window" || t === "el") warn("widget parts can only be simple widgets, skipped a " + t, pt.id);
          else if (t === "input" || t === "text_edit") warn("text boxes cant keep their text in goome_ui_store, skipped " + t, pt.id);
          else emitNode(pt.w, ctx, wout, "element");
        });
        ctx.scope = null;
        ctx.nm = saveNm;
        wout.unwrap();
      }

      const idx = {};
      let N = 0;
      const slot = (k) => (idx[k] = N++);
      ["init", "w", "h", "value", "hot"].forEach(slot);
      def.state.forEach((st) => slot("s:" + st.name));
      groups.forEach((g) => {
        const gv = GM.partVar(g);
        [gv + "_dx", gv + "_dy", gv + "_sx", gv + "_sy"].forEach(slot);
      });
      if (rs) slot("rw"), slot("rh");
      scope.slots.forEach((w) => slot("w:" + w.name));
      const S = (k) => "store[" + (idx[k] + 1) + "]";
      const map = {
        id: (name) => {
          if (prNames.has(name)) return pname(name);
          if (name === "w" || name === "h" || name === "value") return S(name);
          if (name === "hovered" || name === "pressed" || name === "dragging") return name;
          const st = def.state.find((x) => x.name === name);
          if (st) return st.type === "bool" ? "(" + S("s:" + name) + " ~= 0)" : S("s:" + name);
          if (idx[name] != null) return S(name);
          return name;
        },
        th: (f) => "th." + f,
      };
      const ex = (src, want, where) => {
        if (src === "" || src == null) return want === "c" ? hex(0) : "0";
        let r;
        if (typeof src === "number" && want === "c") r = { ok: true, ast: { t: "hex", v: src >>> 0 } };
        else r = GM.expr.check(src, types, want);
        if (!r.ok) {
          warn(where + ": " + r.err);
          return want === "c" ? hex(0) : "0";
        }
        return writeExpr(r.ast, map, types);
      };
      const exb = (src, where) => {
        const r = GM.expr.check(src, types, "b");
        if (!r.ok) {
          warn(where + ": " + r.err);
          return null;
        }
        const s = writeExpr(r.ast, map, types);
        return r.type !== "b" ? par(s) + " ~= 0" : s;
      };

      const blob = JSON.stringify(def.parts);
      const evs = (on) => (def.events || []).filter((e) => e.on === on);
      const reads = {
        hovered: /\bhovered\b/.test(blob) || evs("enter").length + evs("leave").length > 0,
        pressed: /\bpressed\b/.test(blob),
        dragging: /\bdragging\b/.test(blob) || evs("drag").length > 0,
        pressed_now: evs("press").length > 0,
        clicked: evs("click").length > 0,
        released: evs("release").length > 0,
      };
      const mask = !!info.mask;
      if (mask) reads.hovered = reads.clicked = reads.dragend = true;
      const fo = reads.clicked || reads.pressed_now;
      const deco = !(def.events || []).length && !hasValue(def) && !groups.length && !rs && !mask;

      const pargs = def.params.map((pr) => pname(pr.name));
      const val = hasValue(def);
      const o = new Out();
      o.d = 1;
      const A = (s) => o.add(s);
      const iff = (cond) => {
        A("if " + cond + " then");
        o.d++;
      };
      const close = () => {
        o.d--;
        A("end");
      };
      const dbl = (name, e) => A("local " + name + " = " + e);
      const fn = elFn(def);
      const clampE = (v, lo, hi) => "math.max(" + lo + ", math.min(" + hi + ", " + v + "))";
      const emptyRet = val ? "return 0, false" : "return false";
      const head = "local function " + fn + "(" + ["ui", "sid"].concat(pargs, ["init"]).join(", ") + ")";
      A("local store = ui:store(sid, " + N + ")");
      iff("not store");
      A(emptyRet);
      close();
      iff(S("init") + " == 0");
      const fromInit = (i, d) => "init and init[" + (i + 1) + "] or " + d;
      A(S("init") + " = 1");
      A(S("w") + " = " + fromInit(0, num(def.w)));
      A(S("h") + " = " + fromInit(1, num(def.h)));
      def.state.forEach((st, i) => A(S("s:" + st.name) + " = " + fromInit(i + 2, st.type === "bool" ? (st.def ? "1" : "0") : num(st.def))));
      scope.slots.forEach((w) => A(S("w:" + w.name) + " = " + (w.kind === "color" ? hex(w.val) : num(w.val))));
      const vd = def.value || {};
      const vst = vd.state ? def.state.find((x) => x.name === vd.state && x.type !== "bool") : null;
      if (val && vd.src === "drag") A(S("value") + " = " + (vst ? S("s:" + vst.name) : num(+vd.min || 0)));

      const groupBase = new Map();
      const baseWalk = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind !== "group") continue;
          const gx = par(ex(pt.f.x, "n", pt.name + " x")), gy = par(ex(pt.f.y, "n", pt.name + " y"));
          const dg = pt.drag && pt.drag.on;
          const sx = plus(bx, gx), sy = plus(by, gy);
          const ax = dg ? plus(sx, S(GM.partVar(pt) + "_dx")) : sx, ay = dg ? plus(sy, S(GM.partVar(pt) + "_dy")) : sy;
          groupBase.set(pt.id, { sx, sy, ax, ay });
          baseWalk(pt.kids || [], ax, ay);
        }
      };
      baseWalk(def.parts, "0", "0");
      const bounds = (g) => {
        const b = groupBase.get(g.id), d = g.drag;
        const gw = par(ex(g.f.w, "n", g.name + " w")), gh = par(ex(g.f.h, "n", g.name + " h"));
        if (d.bounds === "element") return { x: [neg(b.sx), minus(minus(S("w"), gw), b.sx)], y: [neg(b.sy), minus(minus(S("h"), gh), b.sy)] };
        if (d.bounds === "rect") {
          const R = d.rect || {};
          return {
            x: [minus(num(+R.x || 0), b.sx), minus(minus(num((+R.x || 0) + (+R.w || 0)), gw), b.sx)],
            y: [minus(num(+R.y || 0), b.sy), minus(minus(num((+R.y || 0) + (+R.h || 0)), gh), b.sy)],
          };
        }
        return null;
      };
      const tOf = (o2, r) => {
        const lo = par(r[0]), hi = par(r[1]);
        return "(" + hi + " > " + lo + " and " + par(minus(o2, lo)) + " / " + par(minus(hi, lo)) + " or 0)";
      };
      if (val && vd.src === "drag") {
        const g = groups.find((x) => x.id === vd.part);
        const r = g && bounds(g);
        if (!g) warn("the value comes from a drag but no drag group is picked");
        else if (!r) warn("a value from a drag needs bounds on " + g.name, g.id);
        else {
          const ax = vd.axis === "y" ? "y" : "x";
          const span = (+vd.max || 0) - (+vd.min || 0);
          const t = span ? clampE(par(minus(S("value"), num(+vd.min || 0))) + (span === 1 ? "" : " / " + num(span)), "0", "1") : "0";
          A(S(GM.partVar(g) + (ax === "y" ? "_dy" : "_dx")) + " = " + plus(r[ax][0], t + " * " + par(minus(r[ax][1], r[ax][0]))));
        }
      }
      close();

      scope.slots.forEach((w) => {
        const v = S("w:" + w.name), id = w.name;
        A("local " + id + " = " + (w.kind === "double" || w.kind === "color" ? v : w.kind === "int" ? "math.floor(" + v + ")" : v + " ~= 0"));
      });

      const flagAt = o.l.length;
      const flagsDecl = ["changed", "hovered", "pressed", "dragging", "pressed_now", "clicked", "released", "dragend"].filter((k) => k === "changed" || reads[k]);
      A("local " + flagsDecl.join(", ") + " = " + flagsDecl.map(() => "false").join(", "));
      A("ui:push_id(sid)");
      const items = ["el", "o"];
      const IF = { 0: "0", x: "goome.ITEM_DRAG_X", y: "goome.ITEM_DRAG_Y", xy: "goome.ITEM_DRAG_X + goome.ITEM_DRAG_Y", nohit: "goome.ITEM_NO_HIT", fo: "goome.ITEM_FOCUSABLE" };
      const custom = (name, sid2, w, h, fl) => A("local " + name + " = select(2, ui:custom(" + [q(sid2), w, h, fl].join(", ") + "))");
      const pos = (x, y) => A("ui:pos(" + x + ", " + y + ")");
      const declAt = o.l.length;
      custom("el", "##el", S("w"), S("h"), IF.nohit);
      pos("0", "0");
      custom("o", "##o", "1", "1", IF.nohit);
      A("local ox, oy = el.x - o.x, el.y - o.y");
      const acc = (it, click) => {
        const set = (k, e) => {
          if (reads[k]) A(k + " = " + k + " or " + e);
        };
        set("hovered", it + ".hovered or " + it + ".held");
        set("pressed", it + ".held");
        set("pressed_now", it + ".pressed");
        if (click) set("clicked", it + ".clicked");
        set("released", it + ".released");
        if (!click) set("dragend", it + ".released");
      };
      if (rs) {
        const R = def.resizable;
        pos(plus("ox", minus(S("w"), "14")), plus("oy", minus(S("h"), "14")));
        items.push("rs");
        custom("rs", "##rs", "14", "14", IF.xy);
        iff("rs.pressed");
        A(S("rw") + " = " + S("w"));
        A(S("rh") + " = " + S("h"));
        close();
        iff("rs.held");
        A(S("w") + " = " + clampE(S("rw") + " + rs.drag_x", num(R.minW), num(R.maxW)));
        A(S("h") + " = " + clampE(S("rh") + " + rs.drag_y", num(R.minH), num(R.maxH)));
        A("changed = true");
        if (reads.dragging) A("dragging = true");
        close();
        acc("rs", false);
      }
      const bboxOf = (pt, bx, by) => {
        const f = pt.f, wh = (k) => (pt.name || pt.kind) + " " + k;
        const e = (k) => par(ex(f[k], "n", wh(k)));
        switch (pt.kind) {
          case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
            return [plus(bx, e("x")), plus(by, e("y")), e("w"), e("h")];
          case "circle": case "ring": case "arc":
            return [plus(bx, minus(e("cx"), e("r"))), plus(by, minus(e("cy"), e("r"))), "2 * " + e("r"), "2 * " + e("r")];
          case "line":
            return [plus(bx, "math.min(" + e("x0") + ", " + e("x1") + ")"), plus(by, "math.min(" + e("y0") + ", " + e("y1") + ")"), "math.max(1, math.abs(" + minus(e("x1"), e("x0")) + "))", "math.max(1, math.abs(" + minus(e("y1"), e("y0")) + "))"];
          case "text": {
            const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
            const pr = m && def.params.find((x) => x.name === m[1] && x.type === "text");
            const len = pr ? "#" + pname(pr.name) : String(Array.from(String(f.text || "")).length);
            return [plus(bx, e("x")), plus(by, e("y")), len + " * " + e("size") + " * 0.55", e("size") + " * 1.25"];
          }
        }
        warn((pt.name || pt.kind) + " cant be a hit area, use a hit part", pt.id);
        return null;
      };
      for (let i = groups.length - 1; i >= 0; i--) {
        const g = groups[i], gv = GM.partVar(g), d = g.drag, b = groupBase.get(g.id);
        let r = null;
        if (d.handle) {
          let hp = null;
          GM.walkParts(g.kids || [], (pt) => {
            if (pt.id === d.handle) hp = pt;
          });
          if (hp && hp.kind !== "group" && hp.kind !== "widget") r = bboxOf(hp, b.ax, b.ay);
          else warn("drag handle part not found in " + g.name + ", using the group box", g.id);
        }
        if (!r) r = [b.ax, b.ay, par(ex(g.f.w, "n", g.name + " w")), par(ex(g.f.h, "n", g.name + " h"))];
        const it = "h_" + gv;
        items.push(it);
        pos(plus("ox", r[0]), plus("oy", r[1]));
        custom(it, "##" + gv, r[2], r[3], IF[d.axis === "x" ? "x" : d.axis === "y" ? "y" : "xy"]);
        const dx = S(gv + "_dx"), dy = S(gv + "_dy"), sx = S(gv + "_sx"), sy = S(gv + "_sy");
        iff(it + ".pressed");
        A(sx + " = " + dx);
        A(sy + " = " + dy);
        close();
        iff(it + ".held");
        const axes = d.axis === "x" ? ["x"] : d.axis === "y" ? ["y"] : ["x", "y"];
        const bd = bounds(g);
        const snap = +d.snap || 0;
        for (const a of axes) {
          const n2 = "n" + a;
          dbl(n2, (a === "x" ? sx : sy) + " + " + it + (a === "x" ? ".drag_x" : ".drag_y"));
          if (snap > 0) A(n2 + " = math.floor(" + n2 + " / " + num(snap) + " + 0.5) * " + num(snap));
          if (bd) A(n2 + " = " + clampE(n2, bd[a][0], bd[a][1]));
        }
        iff(axes.map((a) => "n" + a + " ~= " + (a === "x" ? dx : dy)).join(" or "));
        for (const a of axes) A((a === "x" ? dx : dy) + " = n" + a);
        A("changed = true");
        if (val && vd.src === "drag" && vd.part === g.id) {
          const a = vd.axis === "y" ? "y" : "x";
          if (bd) {
            const span = (+vd.max || 0) - (+vd.min || 0);
            const t = tOf(a === "x" ? dx : dy, bd[a]);
            A(S("value") + " = " + plus(num(+vd.min || 0), span === 1 ? t : t + " * " + num(span)));
            if (vst) A(S("s:" + vst.name) + " = " + S("value"));
          }
        }
        close();
        if (reads.dragging) A("dragging = true");
        close();
        acc(it, false);
      }
      if (def.hit === "parts") {
        let k = 0;
        const walkHit = (parts, bx, by) => {
          for (const pt of parts) {
            if (pt.kind === "group") {
              const b = groupBase.get(pt.id);
              if (pt.hit && !(pt.drag && pt.drag.on)) hitOne(pt, bx, by);
              walkHit(pt.kids || [], b.ax, b.ay);
            } else if (pt.kind === "hit" || pt.hit) hitOne(pt, bx, by);
          }
        };
        const hitOne = (pt, bx, by) => {
          const r = bboxOf(pt, bx, by);
          if (!r) return;
          const it = "hit" + k;
          items.push(it);
          pos(plus("ox", r[0]), plus("oy", r[1]));
          custom(it, "##hit" + k++, r[2], r[3], fo ? IF.fo : IF[0]);
          acc(it, true);
        };
        walkHit(def.parts, "0", "0");
        if (!k && !groups.length && !rs && !deco) warn("hit mode is parts but no part is a hit area, nothing can be clicked");
      } else {
        items.push("box");
        pos("ox", "oy");
        custom("box", "##box", S("w"), S("h"), deco ? IF.nohit : fo ? IF.fo : IF[0]);
        acc("box", true);
      }
      if (!o.l.slice(declAt + 4).some((l) => /\b(ox|oy)\b/.test(l))) {
        o.l.splice(declAt + 1, 3);
        items.splice(items.indexOf("o"), 1);
      }

      const actLines = (on) => {
        for (const e of evs(on)) {
          if (e.act === "print") {
            A("print(" + q(e.text || "") + ")");
            continue;
          }
          const tg = def.state.find((s) => s.name === e.target);
          if (!tg) {
            warn(on + " event needs a state to change, skipped");
            continue;
          }
          const t = S("s:" + tg.name);
          if (e.act === "toggle") A(t + " = " + t + " ~= 0 and 0 or 1");
          else if (e.act === "add") {
            if (tg.type === "bool") {
              warn("cant add to a yes/no state");
              continue;
            }
            A(t + " = " + t + " + " + par(ex(e.expr || "0", "n", on + " event")));
          } else if (e.act === "set") {
            if (tg.type === "bool") {
              const b = exb(e.expr || "false", on + " event");
              if (b == null) continue;
              A(t + " = " + (b === "true" ? "1" : b === "false" ? "0" : par(b) + " and 1 or 0"));
            } else A(t + " = " + ex(e.expr || "0", "n", on + " event"));
          }
          A("changed = true");
        }
      };
      const evBlock = (cond, on) => {
        if (!evs(on).length) return;
        iff(cond);
        actLines(on);
        close();
      };
      if (evs("enter").length || evs("leave").length) {
        evBlock("hovered and " + S("hot") + " == 0", "enter");
        evBlock("not hovered and " + S("hot") + " ~= 0", "leave");
        A(S("hot") + " = hovered and 1 or 0");
      }
      evBlock("pressed_now", "press");
      evBlock("dragging", "drag");
      evBlock("clicked", "click");
      evBlock("released", "release");
      if (val && vd.src === "state") {
        const vs = def.state.find((s) => s.name === vd.state);
        if (vs) A(S("value") + " = " + S("s:" + vs.name));
        else warn("value state " + (vd.state || "(none)") + " is missing");
      }

      const D = new Out();
      const ELX = "el.x", ELY = "el.y";
      const drawParts = (parts, bx, by) => {
        for (const pt of parts) {
          if (pt.kind === "widget" || pt.kind === "hit") continue;
          const where = (k) => (pt.name || pt.kind) + " " + k;
          const N2 = (k) => ex(pt.f[k], "n", where(k));
          const Cc = (k) => ex(pt.f[k], "c", where(k));
          const X0 = (k) => plus(bx, par(N2(k)));
          const Y0 = (k) => plus(by, par(N2(k)));
          const lines = [];
          const call = (name, args) => lines.push("c:" + name + "(" + args.join(", ") + ")");
          switch (pt.kind) {
            case "rect": call("rect", [X0("x"), Y0("y"), N2("w"), N2("h"), Cc("color")]); break;
            case "rrect": call("rrect", [X0("x"), Y0("y"), N2("w"), N2("h"), "{" + [N2("tl"), N2("tr"), N2("br"), N2("bl")].join(", ") + "}", Cc("color")]); break;
            case "frame": call("frame", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("width"), Cc("color")]); break;
            case "line": call("line", [X0("x0"), Y0("y0"), X0("x1"), Y0("y1"), N2("width"), Cc("color")]); break;
            case "circle": call("circle", [X0("cx"), Y0("cy"), N2("r"), Cc("color")]); break;
            case "ring": call("ring", [X0("cx"), Y0("cy"), N2("r"), N2("width"), Cc("color")]); break;
            case "arc": call("arc", [X0("cx"), Y0("cy"), N2("r"), N2("width"), N2("a0"), N2("a1"), Cc("color")]); break;
            case "poly": {
              const pts = String(pt.f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(","));
              if (pts.length < 3 || pts.some((x) => x.length !== 2)) {
                warn(where("points") + ": needs 3 or more x,y pairs", pt.id);
                break;
              }
              const flat = [];
              pts.forEach((xy) => flat.push(plus(bx, par(ex(xy[0], "n", where("points")))), plus(by, par(ex(xy[1], "n", where("points"))))));
              call("poly", ["{" + flat.join(", ") + "}", Cc("color")]);
              break;
            }
            case "grad": call("rrect_grad", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), Cc("from"), Cc("to"), tf(!!pt.f.sideways)]); break;
            case "shadow": call("shadow", [X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), N2("blur"), Cc("color")]); break;
            case "text": {
              const m = /^\{(\w+)\}$/.exec(String(pt.f.text || ""));
              let tx;
              if (m) {
                const pr = def.params.find((x) => x.name === m[1] && x.type === "text");
                if (!pr) {
                  warn(where("text") + ": no text param called " + m[1], pt.id);
                  tx = q("");
                } else tx = pname(pr.name);
              } else tx = q(pt.f.text || "");
              call("font_text", ["nil", N2("size"), X0("x"), Y0("y"), tx, Cc("color")]);
              break;
            }
            case "bitmap": {
              const file = String(pt.f.file || "picture.png");
              const bid = addBitmap(ctx, "bm_" + def.name + "_" + GM.partVar(pt), file, pt.f.img);
              const tint = pt.f.tint === "" || pt.f.tint == null ? hex(0xFFFFFFFF) : Cc("tint");
              lines.push("if data." + bid + " then");
              lines.push("    c:bitmap(" + ["data." + bid, X0("x"), Y0("y"), N2("w"), N2("h"), N2("radius"), tint].join(", ") + ")");
              lines.push("end");
              break;
            }
            case "group": {
              const b = groupBase.get(pt.id);
              const ax = plus(ELX, b.ax), ay = plus(ELY, b.ay);
              if (pt.f.clip) lines.push("c:clip_push(" + [ax, ay, N2("w"), N2("h")].join(", ") + ")");
              const keep = D.l.length, sd = D.d;
              D.d = 0;
              drawParts(pt.kids || [], ax, ay);
              const kid = D.l.splice(keep);
              D.d = sd;
              kid.forEach((l) => lines.push(l));
              if (pt.f.clip) lines.push("c:clip_pop()");
              break;
            }
          }
          if (!lines.length) continue;
          if (pt.show) {
            const b = exb(pt.show, (pt.name || pt.kind) + " show");
            if (b == null) continue;
            D.add("if " + b + " then");
            lines.forEach((l) => D.add("    " + l));
            D.add("end");
          } else lines.forEach((l) => D.add(l));
        }
      };
      drawParts(def.parts, ELX, ELY);
      if (D.l.length) {
        A("local c = ui:canvas()");
        iff("c");
        D.l.forEach((l) => A(l));
        close();
      }
      wout.l.forEach((l) => A(l));
      scope.slots.forEach((w) => {
        const v = S("w:" + w.name);
        A(v + " = " + (w.kind === "bool" ? w.name + " and 1 or 0" : w.name));
      });
      A("ui:pop_id()");
      const bits = [["changed", 1], ["clicked", 2], ["dragend", 4], ["hovered", 8]].filter((b) => b[0] === "changed" || (mask && reads[b[0]])).map((b) => b[0]);
      A("return " + (val ? S("value") + ", " : "") + bits.join(", "));
      const pre = [];
      if (/\bedited\b/.test(o.l.join("\n"))) pre.push("    local edited");
      if (o.l.some((l) => /\bth\./.test(l))) pre.push("    local th = ui:theme()");
      o.l.splice(flagAt, 0, ...pre);
      const text = o.l.join("\n");
      return head + "\n" + text + "\nend";
    }

    const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const dataB64 = (img) => {
      const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(img || ""));
      return m ? m[1].replace(/\s+/g, "") : null;
    };

    function addBitmap(ctx, id, file, img) {
      ctx.bitmaps = ctx.bitmaps || new Map();
      if (ctx.bitmaps.has(id)) return id;
      const set = Object.assign({}, GM.SETTINGS_DEFAULT, ctx.project.settings || {});
      const b64 = set.iconSource === "embed" ? dataB64(img) : null;
      if (set.iconSource === "embed" && !b64) ctx.warn("", file + " has no image data to embed, the code loads the file instead");
      if (!b64) ctx.files.add(file);
      ctx.bitmaps.set(id, { file, b64 });
      return id;
    }

    function bitmapLoads(ctx) {
      const L = [];
      if (!ctx.bitmaps) return L;
      for (const [id, b] of ctx.bitmaps) {
        if (b.b64) {
          ctx.need.b64 = true;
          const rows = b.b64.match(/.{1,76}/g) || [""];
          ctx.data.push(id + "_png = [=[\n" + rows.join("\n") + "\n]=]");
          L.push("data." + id + " = goome.bitmap_from_bytes(decode64(data." + id + "_png))");
        } else L.push("data." + id + " = goome.bitmap_load(" + q(b.file) + ")");
      }
      return L;
    }

    function fontLit(name) {
      return "goome.font_system(" + q(name) + ")";
    }
    function themeDiff(t, base, set) {
      const L = [];
      for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) {
        const differs = GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k];
        if (differs) L.push(set(k, fieldLit(k, t[k])));
      }
      for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, fontLit(t[k])));
      return L;
    }
    function themeLines(ctx) {
      const t = GM.applyQuick(GM.normTheme(ctx.project.theme));
      const L = [];
      const set = (k, v) => "t." + k + " = " + v;
      if (t.quick) {
        const qk = t.quick;
        L.push("t:make(" + hex(qk.accent) + ", " + tf(qk.dark) + ", " + num(qk.radius) + ")");
        for (const k of GM.THEME_FONTS) if (t[k]) L.push(set(k, fontLit(t[k])));
      } else {
        const pr = GM.presetOf(t);
        if (pr && pr.id !== "dark") {
          L.push("t:preset(goome.PRESET_" + GM.PRESET_ENUM[pr.id] + ")");
          L.push(...themeDiff(t, pr, set));
        } else {
          if (t.base === "light") L.push("t:light()");
          L.push(...themeDiff(t, GM.themeBase(t), set));
        }
      }
      const icons = Object.keys(t.icons || {}).filter((k) => GM.ICON_NAMES.includes(k));
      for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) {
        const s = t[k];
        if (!s) continue;
        const id = addBitmap(ctx, k, s.file, s.img);
        const e = [s.l, s.t, s.r, s.b].map(num).join(", ");
        L.push("if data." + id + " then", "    t." + (k === "skin_slider_track" ? "skin_slider" : k) + " = {data." + id + ", " + e + "}", "end");
      }
      for (const k of icons) {
        const id = addBitmap(ctx, "icon_" + k, t.icons[k].file || "icon_" + k + ".png", t.icons[k].img);
        L.push("if data." + id + " then", "    t:icon(goome.ICON_" + k.toUpperCase() + ", data." + id + ")", "end");
      }
      if (t.icon_tint) L.push("t.icon_tint = 1");
      return L;
    }

    function configLines(ctx) {
      const cfg = GM.normConfig(ctx.project.config), def = GM.normConfig({});
      const t = GM.normTheme(ctx.project.theme);
      const L = [], C = [];
      const set = (k, v) => C.push("cfg." + k + " = " + v);
      for (const [k] of GM.CFG_NUMS) if (cfg[k] !== def[k]) set(k, num(cfg[k]));
      for (const [k] of GM.CFG_TOGGLES) if (cfg[k] !== def[k]) set(k, tf(cfg[k]));
      for (const [k] of GM.CFG_CURSORS) if (cfg.cursor[k] !== def.cursor[k]) C.push("cfg:cursor(goome.CUR_" + k.toUpperCase() + ", goome.CURSOR_" + cfg.cursor[k] + ")");
      if (cfg.mask !== def.mask) set("mask", q(cfg.mask));
      if (C.length) L.push("local cfg = ui:config()", ...C);
      for (const [k] of GM.CFG_KEYS) if (cfg.keys[k] !== def.keys[k]) L.push("ui:bind(goome.ACT_" + k.toUpperCase() + ", " + q(cfg.keys[k].trim()) + ")");
      if (t.quick && t.quick.scale !== 1) L.push("ui:scale(" + num(t.quick.scale) + ")");
      return L;
    }

    function sectionThemes(ctx) {
      const L = [];
      for (const [id, v] of ctx.themeVars || []) {
        const t = GM.normTheme(GM.findTheme(ctx.project, id));
        const base = GM.themeBase(t);
        L.push("do", "    local t = goome.theme()");
        if (t.base === "light") L.push("    t:light()");
        themeDiff(t, base, (k, x) => "t." + k + " = " + x).forEach((l) => L.push("    " + l));
        L.push("    data." + v + " = t", "end");
      }
      return L;
    }

    function hotkeyBody(ctx, out) {
      const hk = (ctx.project.hotkeys || []).filter((k) => k && k.combo);
      hk.forEach((k, i) => {
        const cond = "n == " + (i + 1);
        if (i) out.mid("elseif " + cond + " then");
        else out.open("if " + cond + " then");
        emitActions(ctx, out, k.actions, "hotkey " + k.combo);
      });
      if (hk.length) out.close();
      return hk;
    }

    const DECODE64 = [
      'local alphabet = "' + B64 + '"',
      "",
      "local function decode64(text)",
      "    local out, bits, acc = {}, 0, 0",
      '    for ch in text:gmatch("[A-Za-z0-9+/]") do',
      "        acc = acc * 64 + (alphabet:find(ch, 1, true) - 1)",
      "        bits = bits + 6",
      "        if bits >= 8 then",
      "            bits = bits - 8",
      "            local step = 2 ^ bits",
      "            out[#out + 1] = string.char(math.floor(acc / step) % 256)",
      "            acc = acc % step",
      "        end",
      "    end",
      '    return table.concat(out)',
      "end",
    ];
    const TRUNC = ["local function trunc(v)", "    if v >= 0 then", "        return math.floor(v)", "    end", "    return math.ceil(v)", "end"];

    function table_(name, lines) {
      if (!lines.length) return [];
      return ["local " + name + " = {", ...lines.map((l) => "    " + l + ","), "}", ""];
    }

    function generate(project, warn) {
      const ctx = new Ctx(project, warn);
      prepass(ctx);
      const app = project.mode === "app";
      const out = new Out();
      out.d = 1;
      emitList(project.root, ctx, out, app ? "app" : "overlay");
      if (app && project.app.statusbar) out.add("ui:statusbar(" + textCode(ctx, project.app.status || "", {}).code + ")");
      out.unwrap();
      const hout = new Out();
      hout.d = 1;
      const hks = hotkeyBody(ctx, hout);
      const els = [];
      for (const info of ctx.used.values()) els.push(elementCode(ctx, info));
      const th = themeLines(ctx);
      const cl = configLines(ctx);
      const sec = sectionThemes(ctx);
      const bl = bitmapLoads(ctx);

      const drawLines = out.l.slice();
      if (/\bedited\b/.test(drawLines.join("\n"))) drawLines.unshift("    local edited");
      const hotLines = hout.l;

      const L = ['local goome = require("goome")', ""];
      L.push(...table_("s", ctx.top));
      L.push(...table_("data", ctx.data));
      if (ctx.need.win) L.push("local win", "");
      if (ctx.need.trunc) L.push(...TRUNC, "");
      if (ctx.need.b64) L.push(...DECODE64, "");
      for (const f of ctx.fns) L.push("local function " + f + "()", "end", "");
      for (const b of els) L.push(b, "");
      if (th.length) L.push("local function set_theme(t)", ...th.map((l) => "    " + l), "end", "");
      if (cl.length) L.push("local function set_config(ui)", ...cl.map((l) => "    " + l), "end", "");
      L.push("local function draw(ui)", ...drawLines, "end", "");
      if (hks.length) L.push("local function on_hotkey(ui, n)", ...hotLines, "end", "");

      const pre = [];
      pre.push(...bl);
      if (ctx.need.placeholder) pre.push("data.placeholder = goome.bitmap_from_argb({0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48, 0xFF3A3F48}, 2, 2)");
      pre.push(...sec);
      const combos = hks.map((k) => q(k.combo)).join(", ");
      const grab = (g) => ["for n, combo in ipairs({" + combos + "}) do", "    " + g + ":hotkey(combo, n)", "end"];
      const ind = (lines, n) => lines.map((l) => (l === "" ? l : " ".repeat(n) + l));
      const title = q(project.title);
      L.push("local function main()");
      L.push(...ind(pre, 4));
      if (app && !project.app.titlebar) {
        const fl = flagsOf(AFLAGS, project.app);
        L.push("    local app = goome.app(" + [title, project.app.w | 0, project.app.h | 0].join(", ") + (fl === "0" ? "" : ", {flags = " + fl + "}") + ")");
        const start = [];
        if (ctx.need.win) start.push("win = app.g");
        if (th.length) start.push("set_theme(app.ui:theme())");
        if (cl.length) start.push("set_config(app.ui)");
        if (hks.length) start.push(...grab("app.g"));
        if (start.length) L.push("    app:on_start(function()", ...ind(start, 8), "    end)");
        if (hks.length) L.push("    app:event(function(ev)", "        if ev.type == goome.HOTKEY then", "            on_hotkey(app.ui, ev.id)", "        end", "    end)");
        L.push("    app:frame(draw)", "    local ok, err = app:run()", "    if not ok then", '        io.stderr:write("cant open a window: " .. tostring(err) .. "\\n")', "        return 1", "    end", "    return 0");
      } else {
        if (app) {
          const wf = "goome.WINDOW_RESIZABLE + goome.WINDOW_BORDERLESS + goome.WINDOW_TRANSPARENT + goome.WINDOW_CENTER";
          L.push("    local g, err = goome.open{title = " + title + ", mode = \"window\", width = " + (project.app.w | 0) + ", height = " + (project.app.h | 0) + ", window_flags = " + wf + "}");
        } else L.push("    local g, err = goome.open{title = " + title + ", no_capture = true}");
        L.push("    if not g then", '        io.stderr:write("cant open ' + (app ? "a window" : "an overlay") + ': " .. tostring(err) .. "\\n")', "        return 1", "    end");
        if (ctx.need.win) L.push("    win = g");
        L.push("    local ui = g:ui()");
        if (th.length) L.push("    set_theme(ui:theme())");
        if (cl.length) L.push("    set_config(ui)");
        if (hks.length) L.push(...ind(grab("g"), 4));
        L.push('    local test = g:backend_name():match("^test") ~= nil', "    local pace = goome.pacer(60)", "    local running, dirty = true, true", "    while running do",
          "        local busy = dirty or test or ui:animating()", "        for ev in g:events(busy and pace:wait() or 500) do",
          "            if ev.type == goome.QUIT or ev.type == goome.CLOSE then", "                running = false", "            end");
        if (hks.length) L.push("            if ev.type == goome.HOTKEY then", "                on_hotkey(ui, ev.id)", "            end");
        L.push("            ui:feed(ev)", "            dirty = true", "        end", "        if not running then", "            break", "        end",
          "        if dirty or test or ui:animating() then", "            dirty = false", "            if ui:begin(0) then");
        if (app) L.push("                ui:app(" + title + ", " + flagsOf(AFLAGS, project.app) + ")", "                draw(ui)", "                ui:app_end()");
        else L.push("                draw(ui)");
        L.push("                ui:finish()", "            end", "        end", "    end", "    ui:close()", "    g:close()", "    return 0");
      }
      L.push("end", "", "os.exit(main())", "");
      return { code: finish(L.join("\n"), "lua", project), files: [...ctx.files] };
    }

    X.langs.lua = {
      label: "Lua",
      ext: ".lua",
      generate,
      hint: () => "lua 5.4 or luajit: luarocks install --local https://github.com/goome-ui/lua-goome/releases/download/v0.5.3/goome-0.5.3-1.src.rock, then eval \"$(luarocks path)\" and lua ui.lua",
    };
  })();

  const bare = (project) => JSON.parse(JSON.stringify(project, (k, v) => (k === "toString" || k === "valueOf" || k === "__proto__" ? undefined : v)));
  X.generate = (project, lang) => {
    const warnings = [];
    const seen = new Set();
    const warn = (id, msg) => {
      const k = id + "|" + msg;
      if (seen.has(k)) return;
      seen.add(k);
      warnings.push({ id, msg });
    };
    const pj = GM.normProject(bare(project));
    const ext = X.langs[lang];
    const r = ext ? ext.generate(pj, warn, X.H) : lang === "cs" ? genCS(pj, warn) : lang === "py" ? genPy(pj, warn) : lang === "java" ? genJava(pj, warn) : lang === "gd" ? genGd(pj, warn) : genC(pj, warn);
    return { code: r.code, warnings, files: r.files, file: r.file };
  };

  X.hint = (project, lang) => {
    if (X.langs[lang]) return X.langs[lang].hint(GM.normProject(bare(project)));
    if (lang === "cs") return "dotnet new console -n ui, reference GoomeSharp, paste this over Program.cs, dotnet run";
    if (lang === "py") return "PYTHONPATH=path/to/python-goome python3 ui.py";
    if (lang === "java") {
      const n = javaClass(GM.normProject(bare(project)));
      return "java 22+: java --enable-native-access=ALL-UNNAMED -cp goome-0.2.0.jar " + n + ".java    or javac -cp goome-0.2.0.jar " + n + ".java, then run it with -cp goome-0.2.0.jar:.";
    }
    if (lang === "gd") return "put addons/goome in your project, add a GoomeView node (anchors Full Rect) and attach this script to it";
    return "linux/mac: cc -std=c99 -I path/to/c-goome ui.c -o ui && ./ui    windows: cl /std:c11 /I path\\to\\c-goome ui.c";
  };

  if (typeof module !== "undefined" && module.exports) module.exports = X;
  else root.GMCode = X;
})(typeof window !== "undefined" ? window : globalThis);
