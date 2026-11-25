(function (root) {
  const GM = root.GM || (typeof require !== "undefined" ? require("./model.js") : null);

  const OP = { window: 0, row: 1, same_line: 2, space: 3, separator: 4, scroll: 5, split: 6, tabs: 7, collapsing: 8, tree: 9, modal: 10, popup: 11, menubar: 12, menu: 13,
    menu_item: 14, menu_sep: 15, label: 16, heading: 17, wrapped: 18, button: 19, checkbox: 20, toggle: 21, radio: 22, slider: 23, slider_int: 24, input: 25, text_edit: 26,
    combo: 27, selectable: 28, color: 29, progress: 30, table: 31, plot_lines: 32, plot_bars: 33, image: 34, el: 35 };
  const S_ORDER = GM.THEME_COLORS.slice(0, 11).concat(GM.THEME_SIZES.slice(0, 7), GM.THEME_AUTO_COLORS, GM.THEME_NEW_SIZES);
  const SIDX = (f) => S_ORDER.indexOf(f);
  const BIN = ["||", "&&", "==", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/"];
  const FN = { min: 0, max: 1, abs: 2 };
  const VT = { float: 0, int: 1, bool: 2, color: 3, string: 4, list: 5 };
  const PART = { rect: 0, rrect: 1, frame: 2, line: 3, circle: 4, ring: 5, arc: 6, poly: 7, grad: 8, shadow: 9, text: 10, bitmap: 11, hit: 12, group: 13, widget: 14 };
  const SKIN = { skin_button: 0, skin_panel: 1, skin_input: 2, skin_checkbox: 3, skin_radio: 4, skin_toggle: 5, skin_slider_track: 6, skin_slider_fill: 7, skin_scrollbar: 8,
    skin_tab: 9, skin_titlebar: 10, skin_tooltip: 11, skin_menu: 12, skin_popup: 13 };
  const EL_ON = { enter: 0, leave: 1, press: 2, drag: 3, click: 4, release: 5 };
  const EL_ACT = { print: 0, toggle: 1, add: 2, set: 3 };
  const OWN_T = { checkbox: "bool", toggle: "bool", collapsing: "bool", tree: "bool", modal: "bool", slider: "float", slider_int: "int", combo: "int", radio: "int",
    selectable: "int", tabs: "int", color: "color", input: "string", text_edit: "string" };
  const NO_LEAF = new Set(["same_line", "space", "separator", "menu_item", "menu_sep", "el"]);
  const bits = (list, p) => list.reduce((a, k, i) => a | (p[k] ? 1 << i : 0), 0);

  function lower(project, opts) {
    const P = project;
    opts = opts || {};
    const prog = { v: [], th: null, ths: [], sk: [], ic: [], bm: [], el: [], r: [], hk: [] };
    const refs = new Map(), byId = new Map(), own = new Map(), themeIx = new Map(), defIx = new Map(), bmIx = new Map();
    const idx = GM.index(P);
    const types = GM.layoutIdents(P);
    const used = new Set();
    const uniq = (base) => {
      let v = GM.ident(base), i = 2;
      while (used.has(v)) v = GM.ident(base) + i++;
      used.add(v);
      return v;
    };
    const addVar = (type, def, cap, key) => prog.v.push(cap ? [type, def, cap, key] : [type, def, 0, key]) - 1;
    const bitmap = (img) => {
      if (!img || typeof img !== "string") return -1;
      const m = /^data:[^,]*;base64,(.*)$/.exec(img);
      if (!m) return -1;
      if (!bmIx.has(img)) bmIx.set(img, prog.bm.push(m[1]) - 1);
      return bmIx.get(img);
    };

    const caps = {};
    GM.walk(P.root, (n) => {
      if (n.p && n.p.bind && (n.type === "input" || n.type === "text_edit")) caps[n.p.bind] = Math.max(caps[n.p.bind] || 0, +n.p.cap || 0);
    });
    for (const v of P.vars || []) {
      const t = VT[v.type];
      if (t == null) continue;
      const def = v.type === "list" ? GM.lines(v.def) : v.type === "string" ? String(v.def == null ? "" : v.def) : v.type === "bool" ? (v.def ? 1 : 0) : v.type === "color" ? +v.def >>> 0 : +v.def || 0;
      const slot = addVar(t, def, v.type === "string" ? Math.max(256, caps[v.id] || 0) + 1 : 0, "v:" + v.id);
      const r = { slot, type: v.type, v };
      byId.set(v.id, r);
      refs.set(v.name, r);
    }
    const bound = (n, okTypes) => {
      if (!n.p || !n.p.bind) return null;
      const r = byId.get(n.p.bind);
      if (!r || (okTypes && !okTypes.includes(r.type))) return null;
      return r;
    };
    const ownVar = (n, type, def, cap) => {
      const key = "n:" + n.id;
      if (own.has(key)) return own.get(key);
      const r = { slot: addVar(VT[type], def, cap, key), type };
      own.set(key, r);
      if (n.p && n.p.var && !n.p.bind && !refs.has(n.p.var)) refs.set(n.p.var, r);
      return r;
    };
    const ownDefault = (n) => {
      const p = n.p;
      switch (n.type) {
        case "checkbox": case "toggle": return [p.on ? 1 : 0];
        case "collapsing": case "tree": return [p.open ? 1 : 0];
        case "modal": return [0];
        case "slider": return [+p.value || 0];
        case "slider_int": return [Math.round(+p.value || 0)];
        case "combo": case "radio": case "selectable": return [p.sel | 0];
        case "tabs": {
          const it = itemsOf(n);
          return [Math.min(Math.max(1, it.length) - 1, Math.max(0, p.sel | 0))];
        }
        case "color": return [p.color >>> 0];
        case "input": return [String(p.text || ""), Math.max(2, p.cap | 0 || 64)];
        case "text_edit": return [String(p.text || ""), Math.max(2, p.cap | 0 || 4096)];
      }
      return [0];
    };
    const varFor = (n, okTypes) => {
      const b = bound(n, okTypes);
      if (b) return b;
      const [d, cap] = ownDefault(n);
      return ownVar(n, OWN_T[n.type], d, cap);
    };
    const itemsVar = (n) => {
      if (!n.p.itemsVar) return null;
      const r = byId.get(n.p.itemsVar);
      return r && r.type === "list" ? r : null;
    };
    const itemsOf = (n) => {
      const r = itemsVar(n);
      return r ? GM.lines(r.v.def) : GM.lines(n.p.items);
    };

    GM.walk(P.root, (n) => {
      if (!n.p) return;
      if (OWN_T[n.type] && !bound(n, null)) varFor(n, null);
    });

    const conv = (a, map) => {
      switch (a.t) {
        case "num": case "hex": return [0, a.v];
        case "bool": return [0, a.v ? 1 : 0];
        case "th": return [5, SIDX(a.f)];
        case "id": return map(a.name);
        case "call": return [6, FN[a.fn]].concat(a.args.map((x) => conv(x, map)));
        case "un": return [7, a.op === "-" ? 0 : 1, conv(a.a, map)];
        case "tern": return [8, conv(a.c, map), conv(a.a, map), conv(a.b, map)];
        case "bin": return [9, BIN.indexOf(a.op), conv(a.a, map), conv(a.b, map)];
      }
      return [0, 0];
    };
    const layoutMap = (name) => {
      const r = refs.get(name);
      return r ? [1, r.slot] : [0, 0];
    };
    const lexpr = (src, want) => {
      if (src == null || String(src).trim() === "") return null;
      const r = GM.expr.check(src, types, want);
      return r.ok ? conv(r.ast, layoutMap) : null;
    };
    const text = (s) => {
      const parts = GM.interp(s == null ? "" : s);
      if (!parts.some((x) => x.v && refs.has(x.v))) return String(s == null ? "" : s);
      return parts.map((x) => (x.v ? (refs.has(x.v) ? refs.get(x.v).slot : "{" + x.v + "}") : x.t));
    };
    const openSlot = (n) => {
      const b = bound(n, ["bool"]);
      if (b) return b.slot;
      if (n.type === "window") return winVars(n).o;
      if (n.type === "modal") return varFor(n, ["bool"]).slot;
      return -1;
    };
    const wins = new Map();
    const winVars = (n) => {
      if (!wins.has(n.id)) {
        const p = n.p, k = "n:" + n.id;
        const vx = addVar(0, +p.x || 0, 0, k + ":x");
        addVar(0, +p.y || 0, 0, k + ":y");
        addVar(0, +p.w || 0, 0, k + ":w");
        addVar(0, +p.h || 0, 0, k + ":h");
        wins.set(n.id, { vx, o: addVar(2, 1, 0, k + ":open") });
      }
      return wins.get(n.id);
    };

    const acts = (list) => {
      const out = [];
      for (const a of list || []) {
        if (!a || !a.do) continue;
        const r = refs.get(a.var);
        switch (a.do) {
          case "set": {
            if (!r || r.type === "list") break;
            if (r.type === "string") out.push([1, r.slot, text(a.value || "")]);
            else {
              const want = r.type === "bool" ? "b" : r.type === "color" ? "c" : "n";
              const e = lexpr(a.value === "" || a.value == null ? (r.type === "bool" ? "false" : "0") : a.value, want);
              if (e) out.push([0, r.slot, e, r.type === "int" ? 1 : 0]);
            }
            break;
          }
          case "toggle": if (r && r.type === "bool") out.push([2, r.slot]); break;
          case "add": case "sub": {
            if (!r || (r.type !== "int" && r.type !== "float")) break;
            const e = lexpr(a.value === "" || a.value == null ? "1" : a.value, "n");
            if (!e) break;
            const lim = r.v && +r.v.max > +r.v.min;
            out.push([3, r.slot, e, a.do === "add" ? 1 : -1, lim ? +r.v.min : null, lim ? +r.v.max : null, r.type === "int" ? 1 : 0]);
            break;
          }
          case "open": case "close": {
            const t = idx.get(a.target);
            if (!t) break;
            const on = a.do === "open";
            if (t.n.type === "popup") out.push(on ? [5, t.n.p.label || "popup"] : [6]);
            else if (t.n.type === "window" || t.n.type === "modal") out.push([4, openSlot(t.n), on ? 1 : 0]);
            break;
          }
          case "toast": out.push([7, text(a.text || ""), +a.ms > 0 ? a.ms | 0 : 2500]); break;
          case "tab": {
            const t = idx.get(a.target);
            if (!t || t.n.type !== "tabs") break;
            out.push([0, varFor(t.n, ["int"]).slot, [0, a.tab | 0], 1]);
            break;
          }
          case "copy": out.push([8, text(a.text || "")]); break;
          case "quit": out.push([9]); break;
          case "call": out.push([10, "called " + GM.ident(a.fn, "on_click") + "()"]); break;
        }
      }
      return out;
    };
    const events = (n) => {
      const on = n.on || {}, out = {};
      let any = false;
      for (const e in on) {
        if (!Array.isArray(on[e]) || !on[e].length) continue;
        out[e] = acts(on[e]);
        any = true;
      }
      return any ? out : null;
    };
    const styles = (st) => {
      if (!GM.styleCount(st)) return null;
      const out = [];
      if (st.theme) {
        const th = GM.findTheme(P, st.theme);
        if (th) {
          if (!themeIx.has(st.theme)) themeIx.set(st.theme, prog.ths.push(themeArr(GM.normTheme(th))) - 1);
          out.push([3, themeIx.get(st.theme)]);
        }
      }
      for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) out.push([0, SIDX(f), +st.c[f] >>> 0]);
      for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) out.push([1, SIDX(f), +st.n[f]]);
      if (Array.isArray(st.radii) && st.radii.length === 4) out.push([2, 0, st.radii.map((x) => +x || 0)]);
      return out.length ? out : null;
    };

    const nodes = (list, ptype, scope) => (list || []).map((n) => node(n, ptype, scope)).filter(Boolean);
    const slots = (n, ptype, scope) => (n.kids || []).map((k) => nodes(k, ptype, scope));
    const slotStyles = (n) => {
      if (!n.slotStyle) return null;
      const k = (n.kids || []).map((_, i) => styles(n.slotStyle[String(i)]));
      return k.some(Boolean) ? k : null;
    };

    function node(n, ptype, scope) {
      if (!n || OP[n.type] == null) return null;
      const p = n.p || {};
      const o = { t: OP[n.type] };
      const root = ptype === "overlay" || ptype === "app";
      if (ptype === "overlay" && n.type !== "window" && n.type !== "el") return null;
      const sh = p.showIf ? lexpr(p.showIf, "b") : null;
      if (sh) o.sh = sh;
      const en = p.enableIf ? lexpr(p.enableIf, "b") : null;
      if (en) o.en = en;
      const st = styles(n.style);
      if (st) o.st = st;
      const leaf = !GM.isContainer(n.type) && !NO_LEAF.has(n.type);
      if (leaf && +p.width > 0) o.wd = +p.width;
      if (n.abs && !root) o.ab = [+n.abs.x || 0, +n.abs.y || 0, +n.abs.w > 0 ? +n.abs.w : 0, +n.abs.h > 0 ? +n.abs.h : 0];
      if (leaf && p.tooltip) o.tp = String(p.tooltip);
      const ev = events(n);
      if (ev) o.on = ev;
      if (ev && ev.hover) o.hv = addVar(2, 0, 0, null);
      if ("label" in p) o.l = text(p.label);
      const nm = () => uniq(p.var || n.type);
      const items = () => {
        const r = itemsVar(n);
        if (r) o.iv = r.slot;
        else o.it = GM.lines(p.items);
      };
      switch (n.type) {
        case "window": {
          if (scope) return null;
          const w = winVars(n);
          o.vx = w.vx;
          const b = bound(n, ["bool"]);
          const targeted = [...(P.hotkeys || []).flatMap((h) => h.actions || [])].concat(allActs).some((a) => a && (a.do === "open" || a.do === "close") && a.target === n.id);
          if (p.close || b || targeted) o.o = b ? b.slot : w.o;
          o.f = bits(["move", "resize", "collapse", "notitle", "close"], p);
          o.k = slots(n, "window", scope);
          break;
        }
        case "row": o.c = +p.cols > 0 ? +p.cols : (n.kids[0] || []).length; o.k = slots(n, "row", scope); break;
        case "space": o.px = +p.px || 0; break;
        case "scroll": o.id = nm(); o.h = +p.h || 0; o.k = slots(n, "scroll", scope); break;
        case "split":
          o.id = nm();
          o.vert = p.vertical ? 1 : 0;
          o.v = addVar(0, +p.frac || 0.3, 0, "n:" + n.id + ":frac");
          o.k = slots(n, "split", scope);
          break;
        case "tabs": {
          o.id = nm();
          items();
          if (o.it && !o.it.length) o.it = ["Tab"];
          o.v = varFor(n, ["int"]).slot;
          o.k = slots(n, "tabs", scope);
          break;
        }
        case "collapsing": case "tree": o.v = varFor(n, ["bool"]).slot; o.k = slots(n, n.type, scope); break;
        case "modal":
          o.v = varFor(n, ["bool"]).slot;
          if (p.button) o.btn = text(p.button);
          o.k = slots(n, "modal", scope);
          break;
        case "popup": {
          o.id = p.label || "popup";
          const b = bound(n, ["bool"]);
          if (b) o.v = b.slot;
          o.k = slots(n, "popup", scope);
          break;
        }
        case "menubar": case "menu": o.k = slots(n, n.type, scope); break;
        case "menu_item":
          if (p.shortcut) o.sc = String(p.shortcut);
          if (p.check || p.bind) o.v = (bound(n, ["bool"]) || ownVar(n, "bool", p.on ? 1 : 0)).slot;
          break;
        case "button":
          o.act = p.action === "toast" ? 1 : p.action === "close" ? 2 : 0;
          o.toast = text(p.toast);
          o.ms = p.ms | 0;
          break;
        case "checkbox": case "toggle": o.v = varFor(n, ["bool"]).slot; break;
        case "radio": items(); o.v = varFor(n, ["int"]).slot; o.inline = p.inline ? 1 : 0; break;
        case "slider": {
          const b = bound(n, ["float", "int"]);
          o.v = b ? b.slot : ownVar(n, "float", +p.value || 0).slot;
          o.min = b && b.type === "int" ? Math.round(p.min) : +p.min;
          o.max = b && b.type === "int" ? Math.round(p.max) : +p.max;
          if (p.fmt) o.fmt = String(p.fmt);
          break;
        }
        case "slider_int": o.v = varFor(n, ["int"]).slot; o.min = Math.round(p.min); o.max = Math.round(p.max); break;
        case "input": {
          if (scope && !bound(n, ["string"])) return null;
          o.v = varFor(n, ["string"]).slot;
          o.f = bits(["password", "readonly", "number", "noselect", "enter"], Object.assign({}, p, { enter: !!p.enter || !!(ev && ev.enter) }));
          if (p.hint) o.hint = String(p.hint);
          break;
        }
        case "text_edit":
          if (scope && !bound(n, ["string"])) return null;
          o.id = nm();
          o.v = varFor(n, ["string"]).slot;
          o.h = +p.h || 0;
          o.f = bits(["readonly", "numbers", "wrap", "mono"], p);
          break;
        case "combo": items(); if (o.it && !o.it.length) o.it = [""]; o.v = varFor(n, ["int"]).slot; break;
        case "selectable": items(); if (o.it && !o.it.length) o.it = ["Item"]; o.v = varFor(n, ["int"]).slot; break;
        case "color": o.v = varFor(n, ["color"]).slot; break;
        case "progress": {
          const b = bound(n, ["float", "int"]);
          if (b) {
            o.pv = b.slot;
            o.lo = +b.v.min || 0;
            o.hi = +b.v.max || 0;
          } else o.val = +p.value || 0;
          if (!p.label) delete o.l;
          break;
        }
        case "table": {
          o.id = nm();
          const cols = GM.lines(p.cols).map((x) => {
            const m = /^(.*?)(?::\s*(\d+(?:\.\d+)?))?$/s.exec(x);
            return [m[1].trim(), m[2] ? +m[2] : 0];
          });
          if (!cols.length) cols.push(["Column", 0]);
          o.cols = cols;
          o.rows = GM.lines(p.rows).map((r) => {
            const cells = r.split(",").map((x) => x.trim());
            while (cells.length < cols.length) cells.push("");
            return cells.slice(0, cols.length);
          });
          o.h = +p.h || 0;
          o.f = bits(["sortable", "resizable", "stripes", "borders"], p);
          break;
        }
        case "plot_lines": case "plot_bars":
          o.l = String(p.label || "");
          o.vals = String(p.values || "").split(/[\s,]+/).filter((x) => x !== "").map(Number).filter(Number.isFinite);
          o.min = +p.min || 0;
          o.max = +p.max || 0;
          o.h = +p.h || 0;
          break;
        case "image": o.w = +p.w || 0; o.h = +p.h || 0; o.r = +p.radius || 0; break;
        case "el": {
          if (scope) return null;
          const def = P.elements.find((e) => e.id === p.el);
          if (!def) return null;
          o.d = elDef(def);
          o.id = uniq(p.var || def.name);
          o.x = +p.x || 0;
          o.y = +p.y || 0;
          o.args = def.params.map((pr) => {
            const v = p.params && pr.name in p.params ? p.params[pr.name] : pr.def;
            return pr.type === "text" ? String(v == null ? "" : v) : pr.type === "bool" ? (v ? 1 : 0) : pr.type === "color" ? +v >>> 0 : +v || 0;
          });
          const w = +p.w || def.w, h = +p.h || def.h;
          let mine = w !== def.w || h !== def.h;
          const sv = def.state.map((s) => {
            const v = p.init && s.name in p.init ? p.init[s.name] : s.def;
            if (v !== s.def) mine = true;
            return s.type === "bool" ? (v ? 1 : 0) : +v || 0;
          });
          if (mine) o.init = [w, h].concat(sv);
          break;
        }
      }
      if ("l" in o && o.l === undefined) delete o.l;
      return o;
    }

    const masked = new Set();
    GM.walk(P.root, (n) => {
      if (n.type === "el" && n.on && ["click", "change", "dragend", "hover"].some((e) => Array.isArray(n.on[e]) && n.on[e].length)) masked.add(n.p.el);
    });

    function elDef(def) {
      if (defIx.has(def.id)) return defIx.get(def.id);
      const di = prog.el.length;
      defIx.set(def.id, di);
      const out = {};
      prog.el.push(out);
      const types = GM.elementIdents(def);
      const groups = GM.dragGroups(def);
      const st = {};
      let N = 5;
      def.state.forEach((s) => (st[s.name] = N++));
      const gdx = new Map();
      groups.forEach((g) => {
        gdx.set(g.id, N);
        N += 4;
      });
      const rs = !!(def.resizable && def.resizable.on);
      if (rs) out.rw = N, N += 2;
      const pid = new Map();
      let pk = 0, gbk = 0;
      GM.walkParts(def.parts, (pt) => pid.set(pt.id, pk++));
      const gbOf = new Map();
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind === "group") gbOf.set(pt.id, gbk++);
      });
      const pIx = new Map(def.params.map((x, i) => [x.name, i]));
      const map = (name) => {
        if (pIx.has(name)) return [3, pIx.get(name)];
        if (name === "w") return [2, 1];
        if (name === "h") return [2, 2];
        if (name === "value") return [2, 3];
        if (name === "hovered") return [4, 0];
        if (name === "pressed") return [4, 1];
        if (name === "dragging") return [4, 2];
        if (name in st) return [2, st[name]];
        for (const g of groups) {
          const gv = GM.partVar(g);
          if (name === gv + "_dx") return [2, gdx.get(g.id)];
          if (name === gv + "_dy") return [2, gdx.get(g.id) + 1];
        }
        return [0, 0];
      };
      const ex = (src, want) => {
        if (src === "" || src == null) return [0, 0];
        if (typeof src === "number") return [0, want === "c" ? src >>> 0 : src];
        const r = GM.expr.check(src, types, want);
        return r.ok ? conv(r.ast, map) : [0, 0];
      };
      const evs = (on) => (def.events || []).filter((e) => e.on === on);
      const mask = masked.has(def.id);
      const clicked = evs("click").length > 0 || mask, pressNow = evs("press").length > 0;
      const hasVal = !!(def.value && def.value.src && def.value.src !== "none");
      out.n = 0;
      out.w = def.w;
      out.h = def.h;
      out.hit = def.hit === "parts" ? 1 : 0;
      out.fo = clicked || pressNow ? 1 : 0;
      out.deco = !(def.events || []).length && !hasVal && !groups.length && !rs && !mask ? 1 : 0;
      out.el = evs("enter").length || evs("leave").length ? 1 : 0;
      if (rs) out.rs = [+def.resizable.minW || 0, +def.resizable.minH || 0, +def.resizable.maxW || 0, +def.resizable.maxH || 0];
      out.st = def.state.map((s) => [st[s.name], s.type === "bool" ? (s.def ? 1 : 0) : +s.def || 0]);
      const parts = (list) => (list || []).map((pt) => {
        const k = PART[pt.kind];
        if (k == null) return null;
        const o = { k, id: pid.get(pt.id) };
        if (pt.show && String(pt.show).trim()) {
          const r = GM.expr.check(pt.show, types, "b");
          if (r.ok) o.sh = conv(r.ast, map);
        }
        if (pt.hit) o.hit = 1;
        const f = pt.f || {}, of = {};
        for (const key in f) {
          if (GM.NUM_FIELDS.has(key)) of[key] = ex(f[key], "n");
          else if (GM.COLOR_FIELDS.has(key)) of[key] = f[key] === "" || f[key] == null ? (key === "tint" ? [0, 0xFFFFFFFF] : [0, 0]) : ex(f[key], "c");
        }
        o.f = of;
        if (pt.kind === "text") {
          const m = /^\{(\w+)\}$/.exec(String(f.text || ""));
          const pr = m && def.params.findIndex((x) => x.name === m[1] && x.type === "text");
          if (m && pr >= 0) o.tp = pr;
          else o.tx = m ? "" : String(f.text || "");
        }
        if (pt.kind === "poly") {
          o.pts = String(f.points || "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(",")).filter((xy) => xy.length === 2).map((xy) => [ex(xy[0], "n"), ex(xy[1], "n")]);
        }
        if (pt.kind === "grad" && f.sideways) o.side = 1;
        if (pt.kind === "bitmap") o.bm = bitmap(f.img);
        if (pt.kind === "group") {
          o.gb = gbOf.get(pt.id);
          if (pt.drag && pt.drag.on) o.dx = gdx.get(pt.id);
          if (f.clip) o.clip = 1;
          o.kids = parts(pt.kids).filter(Boolean);
        }
        return o;
      });
      out.parts = parts(def.parts).filter(Boolean);
      out.g = groups.map((g) => {
        const d = g.drag, o = { gb: gbOf.get(g.id), dx: gdx.get(g.id), pid: pid.get(g.id), id: "##" + GM.partVar(g),
          ax: d.axis === "x" ? 1 : d.axis === "y" ? 2 : 0, snap: +d.snap || 0, bd: d.bounds === "element" ? 1 : d.bounds === "rect" ? 2 : 0 };
        if (d.bounds === "rect") {
          const R = d.rect || {};
          o.rc = [+R.x || 0, +R.y || 0, +R.w || 0, +R.h || 0];
        }
        if (d.handle) {
          let hp = null;
          GM.walkParts(g.kids || [], (pt) => {
            if (pt.id === d.handle) hp = pt;
          });
          if (hp && hp.kind !== "group" && hp.kind !== "widget") o.hd = pid.get(hp.id);
        }
        return o;
      });
      if (hasVal) {
        const vd = def.value;
        if (vd.src === "drag") {
          const vst = def.state.find((x) => x.name === vd.state && x.type !== "bool");
          const gi = groups.findIndex((x) => x.id === vd.part);
          out.val = { src: 1, vs: vst ? st[vst.name] : -1, g: gi, ax: vd.axis === "y" ? 1 : 0, min: +vd.min || 0, max: +vd.max || 0 };
        } else if (vd.src === "state") {
          const vs = def.state.find((x) => x.name === vd.state);
          out.val = { src: 2, vs: vs ? st[vs.name] : -1 };
        }
      }
      out.ev = [];
      for (const on of ["enter", "leave", "press", "drag", "click", "release"])
        for (const e of evs(on)) {
          const act = EL_ACT[e.act];
          if (act == null) continue;
          const tg = def.state.find((s) => s.name === e.target);
          if (act === 0) {
            out.ev.push([EL_ON[on], 0, -1, null, 0, String(e.text || "")]);
            continue;
          }
          if (!tg || (act === 2 && tg.type === "bool")) continue;
          const isB = act === 3 && tg.type === "bool";
          const e2 = act === 1 ? null : isB ? ex(e.expr || "false", "b") : ex(e.expr || "0", "n");
          out.ev.push([EL_ON[on], act, st[tg.name], e2, isB ? 1 : 0, ""]);
        }
      const ws = [], wp = [];
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind !== "widget" || !pt.w) return;
        const t = pt.w.type;
        if (GM.isContainer(t) || t === "window" || t === "el" || t === "input" || t === "text_edit") return;
        const n = GM.clone(pt.w);
        n.id = def.id + ":" + pt.id;
        if (n.p) delete n.p.bind;
        if (OWN_T[t] && !own.has("n:" + n.id)) {
          const [d] = ownDefault(n);
          const r = ownVar(n, OWN_T[t], d);
          ws.push([N++, r.slot, d]);
        }
        const lo = node(n, "element", true);
        if (lo) wp.push(lo);
      });
      if (wp.length) out.wp = wp, out.ws = ws;
      out.n = N;
      return di;
    }

    const allActs = [];
    GM.walk(P.root, (n) => {
      for (const e in n.on || {}) for (const a of n.on[e] || []) allActs.push(a);
    });

    const t = GM.applyQuick(GM.normTheme(P.theme));
    function themeArr(th) {
      return S_ORDER.map((k) => (GM.THEME_COLORS.includes(k) ? +th[k] >>> 0 : +th[k] || 0));
    }
    prog.th = themeArr(t);
    if (opts.noAnim) prog.th[SIDX("anim_ms")] = 0;
    for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) {
      const s = t[k];
      if (!s || !s.img || SKIN[k] == null) continue;
      const b = bitmap(s.img);
      if (b >= 0) prog.sk.push([SKIN[k], b, +s.l || 0, +s.t || 0, +s.r || 0, +s.b || 0]);
    }
    for (const k of Object.keys(t.icons || {})) {
      const i = GM.ICON_NAMES.indexOf(k), b = bitmap(t.icons[k] && t.icons[k].img);
      if (i >= 0 && b >= 0) prog.ic.push([i, b]);
    }
    if (t.icon_tint) prog.it = 1;
    const cfg = GM.normConfig(P.config), dcfg = GM.normConfig({});
    prog.cfg = {
      n: GM.CFG_NUMS.map(([k]) => cfg[k]), t: GM.CFG_TOGGLES.map(([k]) => cfg[k]),
      cur: GM.CFG_CURSORS.map(([k]) => GM.CURSOR_SHAPES.indexOf(cfg.cursor[k])),
      k: GM.CFG_KEYS.map(([k], i) => [i, cfg.keys[k]]).filter(([i]) => cfg.keys[GM.CFG_KEYS[i][0]] !== dcfg.keys[GM.CFG_KEYS[i][0]]),
    };
    if (cfg.mask !== dcfg.mask) prog.cfg.m = cfg.mask;
    const app = P.mode === "app";
    prog.r = nodes(P.root, app ? "app" : "overlay", false);
    if (app) {
      prog.app = { title: String(P.title || ""), f: bits(["titlebar", "menubar", "statusbar", "nopad"], P.app) };
      if (P.app.statusbar) prog.app.st = text(P.app.status || "");
    }
    prog.hk = (P.hotkeys || []).filter((k) => k && k.combo).map((k) => [String(k.combo), acts(k.actions)]);
    let w, h;
    if (app) (w = P.app.w | 0 || 960), (h = P.app.h | 0 || 640);
    else {
      w = 600, h = 560;
      for (const n of P.root) {
        const def = n.type === "el" ? P.elements.find((e) => e.id === n.p.el) || {} : {};
        const nw = n.type === "window" ? +n.p.w || 0 : +n.p.w || def.w || 100;
        const nh = n.type === "window" ? +n.p.h || 420 : +n.p.h || def.h || 60;
        w = Math.max(w, (+n.p.x || 0) + nw + 40);
        h = Math.max(h, (+n.p.y || 0) + nh + 40);
      }
      if (opts.minW) w = Math.max(w, opts.minW);
    }
    return { prog, w: Math.min(4096, Math.round(w)), h: Math.min(4096, Math.round(h)) };
  }

  const GMWasm = { lower };

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const KEYS = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27, " ": 32, Delete: 127, ArrowLeft: 0x90, ArrowRight: 0x91, ArrowUp: 0x92, ArrowDown: 0x93,
      Home: 0x94, End: 0x95, PageUp: 0x96, PageDown: 0x97, Insert: 0x98 };
    const CURSORS = ["default", "text", "pointer", "move", "ew-resize", "ns-resize", "nwse-resize", "nesw-resize", "wait", "not-allowed", "none"];
    const PREF = "gm-uibuilder-preview";
    const enc = new TextEncoder(), dec = new TextDecoder();
    let ex = null, failed = "", loading = null, cv = null, ctx2 = null, lastJson = "", size = "", raf = 0, hot = false, lastClip = "", fontName = "", pasteWait = 0;
    let mode = "real";
    try {
      mode = localStorage.getItem(PREF) || "real";
    } catch (e) {}

    const cstr = (s) => {
      const b = enc.encode(String(s) + "\0");
      const p = ex.gw_alloc(b.length);
      new Uint8Array(ex.memory.buffer, p, b.length).set(b);
      return p;
    };
    const rstr = (p) => {
      if (!p) return "";
      const m = new Uint8Array(ex.memory.buffer);
      let e = p;
      while (m[e]) e++;
      return dec.decode(m.subarray(p, e));
    };

    function load() {
      if (loading) return loading;
      loading = (async () => {
        try {
          const res = await fetch("goome.wasm");
          if (!res.ok) throw new Error("goome.wasm is missing (" + res.status + ")");
          const r = WebAssembly.instantiateStreaming && /wasm/.test(res.headers.get("content-type") || "")
            ? await WebAssembly.instantiateStreaming(res, {})
            : await WebAssembly.instantiate(await res.arrayBuffer(), {});
          ex = r.instance.exports;
        } catch (e) {
          failed = e.message || String(e);
          console.warn("real goome preview is off: " + failed);
        }
        const A = window.GMApp;
        if (A && A.renderStage) A.renderStage();
      })();
      return loading;
    }

    const real = () => ex && mode === "real";

    function toggle() {
      const A = window.GMApp;
      const set = (m) => () => {
        mode = m;
        try {
          localStorage.setItem(PREF, m);
        } catch (e) {}
        A.renderStage();
      };
      const b1 = A.h("button", { class: mode !== "real" || !ex ? "on" : "", onclick: set("css"), text: "CSS", title: "the quick look-alike, you can drag things around on it" });
      const b2 = A.h("button", { class: real() ? "on" : "", onclick: set("real"), text: "Real goome",
        title: ex ? "goome itself, built to webassembly. click and type on it to try the widgets" : failed ? "couldnt load goome.wasm: " + failed : "loading goome.wasm" });
      if (!ex) b2.disabled = true;
      return A.h("div", { class: "seg", title: "which preview to show" }, b1, b2);
    }

    function pushKey(e, down) {
      if (!down) return;
      const mods = (e.shiftKey ? 0x100 : 0) | (e.ctrlKey ? 0x200 : 0) | (e.altKey ? 0x400 : 0) | (e.metaKey ? 0x800 : 0);
      let key = KEYS[e.key] || 0;
      const m = /^F(\d{1,2})$/.exec(e.key);
      if (m && +m[1] >= 1 && +m[1] <= 12) key = 0x80 + +m[1];
      const cp = Array.from(e.key);
      let text = "";
      if (!key && cp.length === 1) {
        const c = cp[0].toLowerCase();
        key = c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 0;
        if (!e.ctrlKey && !e.metaKey) text = cp[0];
      }
      if (key === 32 && !e.ctrlKey && !e.metaKey) text = " ";
      if (!key && !text) return;
      const tp = text ? cstr(text) : 0;
      ex.gw_push(5, 0, 0, 0, 0, key, mods, tp);
      if (tp) ex.gw_free(tp);
      kick();
    }

    function at(e) {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }

    function makeCanvas() {
      cv = document.createElement("canvas");
      cv.className = "gm-real";
      cv.tabIndex = 0;
      cv.style.display = "block";
      cv.style.outline = "none";
      cv.style.touchAction = "none";
      ctx2 = cv.getContext("2d");
      const btn = (e) => (e.button === 2 ? 3 : e.button === 1 ? 2 : 1);
      cv.addEventListener("pointerdown", (e) => {
        if (!ex) return;
        cv.focus({ preventScroll: true });
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (er) {}
        const [x, y] = at(e);
        ex.gw_push(3, x, y, 0, 0, 0, 0, 0);
        ex.gw_push(1, x, y, btn(e), 0, 0, 0, 0);
        e.preventDefault();
        kick();
      });
      cv.addEventListener("pointermove", (e) => {
        if (!ex) return;
        const [x, y] = at(e);
        ex.gw_push(3, x, y, 0, 0, 0, 0, 0);
        hot = true;
        kick();
      });
      cv.addEventListener("pointerup", (e) => {
        if (!ex) return;
        const [x, y] = at(e);
        ex.gw_push(2, x, y, btn(e), 0, 0, 0, 0);
        kick();
      });
      cv.addEventListener("pointerleave", () => {
        if (!ex) return;
        hot = false;
        ex.gw_push(3, -100000, -100000, 0, 0, 0, 0, 0);
        kick();
      });
      cv.addEventListener("contextmenu", (e) => e.preventDefault());
      let wheel = 0;
      cv.addEventListener("wheel", (e) => {
        if (!ex) return;
        wheel += e.deltaMode === 1 ? e.deltaY : e.deltaMode === 2 ? e.deltaY * 3 : e.deltaY / 40;
        const k = wheel > 0 ? Math.floor(wheel) : Math.ceil(wheel);
        if (k) {
          const [x, y] = at(e);
          wheel -= k;
          ex.gw_push(4, x, y, 0, k, 0, 0, 0);
          kick();
        }
        e.preventDefault();
      }, { passive: false });
      cv.addEventListener("keydown", (e) => {
        if (!ex) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
          e.stopPropagation();
          clearTimeout(pasteWait);
          const mods = (e.shiftKey ? 0x100 : 0) | (e.ctrlKey ? 0x200 : 0) | (e.altKey ? 0x400 : 0) | (e.metaKey ? 0x800 : 0);
          pasteWait = setTimeout(() => ex && (ex.gw_push(5, 0, 0, 0, 0, 118, mods, 0), kick()), 150);
          return;
        }
        if (e.key === "F5" || e.key === "F12") return;
        e.preventDefault();
        e.stopPropagation();
        pushKey(e, true);
      });
      cv.addEventListener("keyup", (e) => e.stopPropagation());
      cv.addEventListener("paste", (e) => {
        if (!ex) return;
        const s = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
        const p = cstr(s);
        ex.gw_clip_set(p);
        ex.gw_free(p);
        lastClip = s;
        clearTimeout(pasteWait);
        ex.gw_push(5, 0, 0, 0, 0, 118, navigator.platform && /Mac/.test(navigator.platform) ? 0x800 : 0x200, 0);
        e.preventDefault();
        kick();
      });
      cv.addEventListener("focus", () => ex && (ex.gw_push(11, 0, 0, 1, 0, 0, 0, 0), kick()));
      cv.addEventListener("blur", () => ex && (ex.gw_push(11, 0, 0, 0, 0, 0, 0, 0), kick()));
    }

    function kick() {
      if (!raf) raf = requestAnimationFrame(frame);
    }

    function frame() {
      raf = 0;
      if (!ex || !cv || !cv.isConnected) return;
      const r = ex.gw_frame(performance.now());
      if (r & 1) {
        const w = ex.gw_width(), h = ex.gw_height(), p = ex.gw_pixels();
        if (p && w && h) {
          if (cv.width !== w || cv.height !== h) (cv.width = w), (cv.height = h);
          ctx2.putImageData(new ImageData(new Uint8ClampedArray(ex.memory.buffer, p, w * h * 4).slice(), w, h), 0, 0);
        }
      }
      cv.style.cursor = CURSORS[ex.gw_cursor()] || "default";
      const log = rstr(ex.gw_log_take());
      if (log) {
        const A = window.GMApp;
        for (const line of log.split("\n").filter(Boolean)) {
          console.log("[goome] " + line);
          if (A && A.note) A.note(line);
        }
      }
      const clip = rstr(ex.gw_clip_get());
      if (clip !== lastClip) {
        lastClip = clip;
        if (navigator.clipboard && clip) navigator.clipboard.writeText(clip).catch(() => {});
      }
      if (r & 2 || hot || document.activeElement === cv) setTimeout(kick, r & 2 || hot ? 0 : 120);
    }

    function pickFont() {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = ".ttf,.otf,.ttc";
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f || !ex) return;
        const b = new Uint8Array(await f.arrayBuffer());
        const p = ex.gw_alloc(b.length);
        new Uint8Array(ex.memory.buffer, p, b.length).set(b);
        const ok = ex.gw_font_mem(p, b.length) === 0;
        ex.gw_free(p);
        const A = window.GMApp;
        if (!ok) return A.note("goome couldnt read that font");
        fontName = f.name;
        A.renderStage();
        kick();
      };
      inp.click();
    }

    function stage(wrapEl) {
      if (!real()) return false;
      const A = window.GMApp, P = A.S.project;
      const bar = A.h("div", { class: "stage-bar" });
      bar.appendChild(A.h("span", { text: (P.mode === "app" ? "app window " + P.app.w + " x " + P.app.h : "overlay") + ", real goome: click and type on it" }));
      bar.appendChild(A.h("span", { class: "grow" }));
      if (fontName) bar.appendChild(A.h("button", { class: "chip on", title: "back to the built in font", onclick: () => (ex.gw_font_mem(0, 0), (fontName = ""), A.renderStage()) }, fontName));
      else bar.appendChild(A.h("button", { class: "chip", title: "goome uses the system font on a real desktop, pick a .ttf to match it", onclick: pickFont }, "Font"));
      bar.appendChild(toggle());
      wrapEl.appendChild(bar);
      let out;
      try {
        out = lower(P, { minW: Math.max(0, wrapEl.clientWidth - 48) });
      } catch (e) {
        wrapEl.appendChild(A.h("div", { class: "muted", style: { padding: "20px" }, text: "couldnt build the real preview: " + e.message }));
        return true;
      }
      const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      if (!cv) makeCanvas();
      const sz = out.w + "x" + out.h + "@" + scale;
      if (!size) {
        if (ex.gw_init(out.w, out.h, scale)) {
          failed = "goome wouldnt open offscreen";
          ex = null;
          mode = "css";
          A.renderStage();
          return true;
        }
      } else if (sz !== size) ex.gw_resize(out.w, out.h, scale);
      size = sz;
      const json = JSON.stringify(out.prog);
      if (json !== lastJson) {
        const p = cstr(json);
        const rc = ex.gw_load(p, enc.encode(json).length);
        ex.gw_free(p);
        if (rc) A.note("real preview: " + rstr(ex.gw_error()));
        lastJson = json;
      }
      const surf = A.h("div", { class: "surface" + (P.mode === "app" ? "" : " desk") });
      surf.style.width = out.w + "px";
      surf.style.height = out.h + "px";
      surf.style.minHeight = "0";
      cv.style.width = out.w + "px";
      cv.style.height = out.h + "px";
      surf.appendChild(cv);
      wrapEl.appendChild(surf);
      kick();
      return true;
    }

    window.addEventListener("resize", () => {
      const A = window.GMApp;
      if (real() && A && A.renderStage) A.renderStage();
    });
    GMWasm.stage = stage;
    GMWasm.toggle = toggle;
    GMWasm.ready = () => !!ex;
    load();
  }

  if (typeof module !== "undefined" && module.exports) module.exports = GMWasm;
  else root.GMWasm = GMWasm;
})(typeof window !== "undefined" ? window : globalThis);
