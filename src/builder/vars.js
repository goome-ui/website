(function () {
  const A = window.GMApp;
  const { h, $, icon, S, note, snap, changed, clamp } = A;
  const P = () => S.project;
  const KEY = { checkbox: "on", toggle: "on", menu_item: "on", radio: "sel", combo: "sel", selectable: "sel", tabs: "sel", slider: "v", slider_int: "v", input: "text", text_edit: "text", color: "color", collapsing: "open", tree: "open", modal: "open", window: "open", popup: "open", progress: "v" };
  S.vals = S.vals || {};

  function valOf(v) {
    if (!(v.name in S.vals)) S.vals[v.name] = v.type === "list" ? GM.lines(v.def) : v.type === "bool" ? !!v.def : v.type === "string" ? String(v.def || "") : v.type === "color" ? v.def >>> 0 : +v.def || 0;
    return S.vals[v.name];
  }
  function resetVals() {
    S.vals = {};
  }

  function boundPv(n, base) {
    const v = GM.varById(P(), n.p.bind);
    if (!v) return base;
    const k = KEY[n.type];
    if (!k || base.__bound === v.name) return base;
    valOf(v);
    const toVar = (x) => (v.type === "bool" ? !!x : v.type === "int" ? Math.round(+x || 0) : v.type === "float" ? +x || 0 : v.type === "color" ? x >>> 0 : x);
    const fromVar = (x) => (k === "on" || k === "open" ? !!x : k === "sel" ? Math.round(+x || 0) : k === "text" ? String(x == null ? "" : x) : x);
    Object.defineProperty(base, k, { get: () => fromVar(S.vals[v.name]), set: (x) => (S.vals[v.name] = toVar(x)), configurable: true, enumerable: true });
    Object.defineProperty(base, "__bound", { value: v.name, configurable: true });
    return base;
  }

  function env() {
    const v = {};
    for (const x of P().vars || []) v[x.name] = valOf(x);
    GM.walk(P().root, (n) => {
      if (n.p && n.p.var && !n.p.bind && KEY[n.type] && !(n.p.var in v)) {
        const st = A.pvGet(n);
        v[n.p.var] = st[KEY[n.type]];
      }
    });
    return v;
  }
  function setNamed(name, val) {
    const pv = GM.varByName(P(), name);
    if (pv) {
      S.vals[name] = pv.type === "int" ? Math.round(val) : val;
      if ((pv.type === "int" || pv.type === "float") && pv.max > pv.min) S.vals[name] = clamp(S.vals[name], pv.min, pv.max);
      return true;
    }
    let done = false;
    GM.walk(P().root, (n) => {
      if (!done && n.p && n.p.var === name && !n.p.bind && KEY[n.type]) {
        A.pvGet(n)[KEY[n.type]] = val;
        done = true;
      }
    });
    return done;
  }
  function evalExpr(src, want) {
    if (src == null || String(src).trim() === "") return want === "b" ? true : 0;
    const r = GM.expr.check(src, GM.layoutIdents(P()), want);
    if (!r.ok) return want === "b" ? true : 0;
    return GM.expr.eval(r.ast, { v: env(), th: P().theme });
  }
  function fmtVal(x) {
    if (typeof x === "boolean") return x ? "1" : "0";
    if (typeof x === "number") return Number.isInteger(x) ? String(x) : String(+x.toPrecision(6));
    if (Array.isArray(x)) return x.join(", ");
    return String(x);
  }
  function interp(text) {
    const s = String(text == null ? "" : text);
    if (!s.includes("{")) return s;
    const e = env();
    return s.replace(/\{([a-z_]\w*)\}/gi, (m, k) => (k in e ? (GM.varByName(P(), k) || {}).type === "color" ? "#" + (e[k] >>> 0).toString(16).toUpperCase().padStart(8, "0") : fmtVal(e[k]) : m));
  }

  function nodeById(id) {
    const i = A.findNode(id);
    return i ? i.n : null;
  }
  function run(actions, ctx) {
    let redraw = false;
    for (const a of actions || []) {
      const v = a.var;
      const cur = () => env()[v];
      switch (a.do) {
        case "set": {
          const pv = GM.varByName(P(), v);
          const t = pv ? pv.type : typeof cur() === "boolean" ? "bool" : typeof cur() === "string" ? "string" : "float";
          setNamed(v, t === "string" ? interp(a.value) : t === "bool" ? !!evalExpr(a.value, "b") : t === "color" ? evalExpr(a.value, "c") >>> 0 : +evalExpr(a.value, "n"));
          redraw = true;
          break;
        }
        case "toggle": setNamed(v, !cur()); redraw = true; break;
        case "add": setNamed(v, (+cur() || 0) + +evalExpr(a.value || "1", "n")); redraw = true; break;
        case "sub": setNamed(v, (+cur() || 0) - +evalExpr(a.value || "1", "n")); redraw = true; break;
        case "open": case "close": {
          const t = nodeById(a.target);
          if (t) {
            A.pvGet(t).open = a.do === "open";
            if (t.type === "window" && a.do === "open") A.pvGet(t).collapsed = false;
            if (t.type === "popup" && a.do === "open") S.popAnchor = ctx && ctx.el;
          }
          redraw = true;
          break;
        }
        case "toast": A.stageToast(interp(a.text), +a.ms || 2500); break;
        case "tab": {
          const t = nodeById(a.target);
          if (t) A.pvGet(t).sel = +a.tab || 0;
          redraw = true;
          break;
        }
        case "copy": {
          const txt = interp(a.text);
          try {
            navigator.clipboard.writeText(txt);
          } catch (e) {}
          A.stageToast("copied: " + txt, 1600);
          break;
        }
        case "quit": A.stageToast("the app would close here (GOOME_CLOSE)", 1800); break;
        case "call": A.stageToast((a.fn || "fn") + "() gets called here", 1600); break;
      }
    }
    if (redraw) later();
  }

  function fire(n, ev, el) {
    const list = n.on && n.on[ev];
    if (list && list.length) run(list, { el });
  }
  function valueChanged(n, el, deferDraw) {
    const st = A.pvGet(n, "");
    fire(n, "change", el);
    const k = KEY[n.type];
    if ((k === "on" || k === "open") && n.on) fire(n, st[k] ? "on" : "off", el);
    if (needsLive()) later(deferDraw);
  }
  function needsLive() {
    let yes = (P().vars || []).length > 0;
    if (!yes) GM.walk(P().root, (n) => {
      if (n.p && (n.p.showIf || n.p.enableIf || (typeof n.p.label === "string" && n.p.label.includes("{")))) yes = true;
    });
    return yes;
  }
  let laterT = 0, pending = false;
  function later(defer) {
    pending = true;
    if (defer) return;
    clearTimeout(laterT);
    laterT = setTimeout(flush, 30);
  }
  function flush() {
    if (!pending) return;
    if (S.dragging || (document.activeElement && document.activeElement.closest && document.activeElement.closest("#stageWrap") && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) {
      clearTimeout(laterT);
      laterT = setTimeout(flush, 250);
      return;
    }
    pending = false;
    A.renderStage();
  }
  document.addEventListener("focusout", () => pending && later());
  window.addEventListener("pointerup", () => pending && setTimeout(() => later(), 0));

  function parseCombo(c) {
    const parts = String(c || "").toLowerCase().split("+").map((x) => x.trim()).filter(Boolean);
    return { ctrl: parts.includes("ctrl"), shift: parts.includes("shift"), alt: parts.includes("alt"), meta: parts.includes("super") || parts.includes("cmd"), key: parts.filter((x) => !["ctrl", "shift", "alt", "super", "cmd"].includes(x))[0] || "" };
  }
  window.addEventListener("keydown", (e) => {
    if (S.editing) return;
    const t = e.target;
    if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    for (const hk of P().hotkeys || []) {
      const c = parseCombo(hk.combo);
      const k = e.key.toLowerCase();
      const keyOk = c.key === k || (c.key === "space" && k === " ") || (c.key === "esc" && k === "escape") || (c.key === "ins" && k === "insert");
      if (keyOk && c.ctrl === e.ctrlKey && c.shift === e.shiftKey && c.alt === e.altKey && c.meta === e.metaKey) {
        e.preventDefault();
        run(hk.actions);
        A.stageToast("hotkey " + hk.combo, 900);
      }
    }
  });

  function varOptions(types, cur, none = "its own variable") {
    const list = (P().vars || []).filter((v) => !types || types.includes(v.type));
    return [h("option", { value: "", text: none, selected: !cur })].concat(list.map((v) => h("option", { value: v.id, text: v.name + "  (" + v.type + ")", selected: v.id === cur })));
  }
  function nameOptions(cur) {
    const ids = GM.layoutIdents(P());
    return [h("option", { value: "", text: "pick one", selected: !cur })].concat(Object.keys(ids).filter((k) => ids[k] !== "s" || GM.varByName(P(), k)).map((k) => h("option", { value: k, text: k, selected: k === cur })));
  }
  function targetOptions(kinds, cur) {
    const out = [h("option", { value: "", text: "pick one", selected: !cur })];
    GM.walk(P().root, (n) => {
      if (kinds.includes(n.type)) out.push(h("option", { value: n.id, text: GM.TYPES[n.type].name + ": " + (n.p.label || n.p.var || ""), selected: n.id === cur }));
    });
    return out;
  }

  function exprField(label, val, set, want, hint) {
    const inp = h("input", { class: "in", value: val || "", spellcheck: "false", style: { fontFamily: "var(--mono)" }, placeholder: hint || "" });
    const msg = h("span", { class: "muted", style: { fontSize: "11px" } });
    const check = () => {
      const s = inp.value.trim();
      if (!s) return (msg.textContent = ""), (msg.className = "muted");
      const r = GM.expr.check(s, GM.layoutIdents(P()), want);
      msg.textContent = r.ok ? "ok" : r.err;
      msg.className = r.ok ? "muted" : "err";
    };
    inp.addEventListener("focus", snap);
    inp.addEventListener("input", () => {
      set(inp.value);
      check();
      changed({ noSide: true });
    });
    check();
    return h("label", { class: "fld" }, h("span", { text: label }), inp, msg);
  }

  function actionsEditor(box, list, onChange) {
    list.forEach((a, i) => {
      const card = h("div", { class: "act-card" });
      const kind = h("select", { class: "in" }, Object.entries(GM.ACTION_KINDS).map(([k, t]) => h("option", { value: k, text: t, selected: a.do === k })));
      kind.addEventListener("focus", snap);
      kind.addEventListener("change", () => {
        const fresh = GM.newAction(kind.value);
        Object.keys(a).forEach((k) => delete a[k]);
        Object.assign(a, fresh);
        onChange(true);
      });
      card.appendChild(h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, kind),
        h("button", { class: "btn sm ghost", title: "up", disabled: i === 0, onclick: () => (snap(), list.splice(i - 1, 0, list.splice(i, 1)[0]), onChange(true)) }, icon("up")),
        h("button", { class: "btn sm ghost bad", title: "remove", onclick: () => (snap(), list.splice(i, 1), onChange(true)) }, icon("trash"))));
      const sel = (opts, key, label) => {
        const s = h("select", { class: "in" }, opts);
        s.addEventListener("focus", snap);
        s.addEventListener("change", () => ((a[key] = s.value), onChange(false)));
        card.appendChild(A.fieldBase(label, s));
      };
      const txt = (key, label, ph) => {
        const t = h("input", { class: "in", value: a[key] || "", placeholder: ph || "" });
        t.addEventListener("focus", snap);
        t.addEventListener("input", () => ((a[key] = t.value), onChange(false)));
        card.appendChild(A.fieldBase(label, t));
      };
      if (["set", "toggle", "add", "sub"].includes(a.do)) sel(nameOptions(a.var), "var", "Variable");
      if (a.do === "set") {
        const pv = GM.varByName(P(), a.var);
        if (pv && pv.type === "string") txt("value", "Text, {name} puts a variable in");
        else card.appendChild(exprField("Value", a.value, (v) => ((a.value = v), onChange(false)), pv && pv.type === "bool" ? "b" : pv && pv.type === "color" ? "c" : "n", "like 0.5, true or volume * 2"));
      }
      if (a.do === "add" || a.do === "sub") card.appendChild(exprField("By", a.value, (v) => ((a.value = v), onChange(false)), "n", "1"));
      if (a.do === "open" || a.do === "close") sel(targetOptions(["window", "modal", "popup"], a.target), "target", "Which one");
      if (a.do === "tab") {
        sel(targetOptions(["tabs"], a.target), "target", "Tabs");
        const t = h("input", { class: "in", type: "number", min: 0, value: a.tab || 0 });
        t.addEventListener("input", () => ((a.tab = +t.value || 0), onChange(false)));
        card.appendChild(A.fieldBase("Tab number (from 0)", t));
      }
      if (a.do === "toast") {
        txt("text", "Text, {name} puts a variable in", "saved {name}");
        const t = h("input", { class: "in", type: "number", value: a.ms || 2500 });
        t.addEventListener("input", () => ((a.ms = +t.value || 2500), onChange(false)));
        card.appendChild(A.fieldBase("Shows for ms", t));
      }
      if (a.do === "copy") txt("text", "Text to copy, {name} works here too");
      if (a.do === "call") {
        const t = h("input", { class: "in", value: a.fn || "", style: { fontFamily: "var(--mono)" } });
        t.addEventListener("focus", snap);
        t.addEventListener("change", () => ((a.fn = GM.ident(t.value, "on_click")), (t.value = a.fn), onChange(false)));
        card.appendChild(A.fieldBase("Function name (you get an empty one in the code to fill in)", t));
      }
      if (a.do === "quit") card.appendChild(h("p", { class: "muted", style: { margin: "4px 0", fontSize: "12px" }, text: "pushes GOOME_CLOSE, same as the x button." }));
      box.appendChild(card);
    });
    const add = h("select", { class: "in" }, h("option", { value: "", text: "+ add an action" }), Object.entries(GM.ACTION_KINDS).map(([k, t]) => h("option", { value: k, text: t })));
    add.addEventListener("change", () => {
      if (!add.value) return;
      snap();
      list.push(GM.newAction(add.value));
      onChange(true);
    });
    box.appendChild(add);
  }

  function nodeLogic(body, n) {
    const add = (x) => body.appendChild(x);
    const types = GM.BIND[n.type];
    if (types) {
      add(h("div", { class: "sec", text: "Variable" }));
      const s = h("select", { class: "in" }, varOptions(types, n.p.bind, n.p.var ? "its own: " + n.p.var : "none"));
      s.addEventListener("focus", snap);
      s.addEventListener("change", () => {
        if (s.value) n.p.bind = s.value;
        else delete n.p.bind;
        A.renderSide();
        changed();
      });
      add(A.fieldBase("Uses", s));
      add(h("div", { class: "row", style: { marginBottom: "8px" } }, h("button", { class: "btn sm", onclick: () => {
        snap();
        const v = GM.newVar(P(), types[0], n.p.var || n.p.label || n.type);
        const st = A.pvGet(n);
        const k = KEY[n.type];
        if (k && st[k] != null) v.def = types[0] === "list" ? v.def : st[k];
        if (n.type === "slider" || n.type === "slider_int") (v.min = +n.p.min), (v.max = +n.p.max);
        P().vars.push(v);
        n.p.bind = v.id;
        changed();
      } }, icon("plus"), "Make a variable for it")));
      if (GM.ITEMS_FROM_LIST[n.type]) {
        const l = h("select", { class: "in" }, varOptions(["list"], n.p.itemsVar, "the items above"));
        l.addEventListener("focus", snap);
        l.addEventListener("change", () => {
          if (l.value) n.p.itemsVar = l.value;
          else delete n.p.itemsVar;
          changed();
        });
        add(A.fieldBase("Items from", l));
      }
    }
    if (n.type !== "same_line" && n.type !== "menu_sep") {
      add(h("div", { class: "sec", text: "Show and enable" }));
      add(exprField("Only show it when", n.p.showIf, (v) => (v.trim() ? (n.p.showIf = v) : delete n.p.showIf), "b", "like wifi && volume > 0.5"));
      if (GM.EVENTS[n.type] || types) add(exprField("Only let it work when", n.p.enableIf, (v) => (v.trim() ? (n.p.enableIf = v) : delete n.p.enableIf), "b", "empty = always"));
    }
    const evs = GM.EVENTS[n.type];
    if (!evs) return;
    add(h("div", { class: "sec", text: "Actions" }));
    n.on = n.on || {};
    for (const ev of evs) {
      const list = n.on[ev] || [];
      const open = list.length || (S.evOpen && S.evOpen[n.id + ev]);
      const head = h("div", { class: "ev-head", onclick: () => {
        S.evOpen = S.evOpen || {};
        S.evOpen[n.id + ev] = !open;
        A.renderSide();
      } }, icon(open ? "chevd" : "chevr"), h("span", { text: GM.EVENT_NAMES[ev] }), list.length ? h("span", { class: "muted", text: " " + list.length }) : null);
      add(head);
      if (!open) continue;
      const box = h("div", { class: "ev-box" });
      actionsEditor(box, list, (re) => {
        if (list.length) n.on[ev] = list;
        else delete n.on[ev];
        changed({ noSide: !re });
      });
      if (!n.on[ev]) n.on[ev] = list;
      add(box);
    }
  }

  function renderVars(body) {
    const add = (x) => body.appendChild(x);
    add(h("div", { class: "sec" }, h("span", { text: "Variables" }), h("span", { class: "grow" }),
      h("select", { class: "in", style: { width: "auto", minHeight: "36px" }, onchange: (e) => {
        if (!e.target.value) return;
        snap();
        P().vars.push(GM.newVar(P(), e.target.value, e.target.value === "bool" ? "enabled" : e.target.value === "list" ? "items" : e.target.value === "string" ? "text" : e.target.value === "color" ? "tint" : "amount"));
        changed();
      } }, h("option", { value: "", text: "+ new" }), Object.entries(GM.VAR_TYPES).map(([k, t]) => h("option", { value: k, text: t })))));
    add(h("p", { class: "muted", style: { fontSize: "12px", marginTop: 0 }, text: "widgets pick one of these under Variable. one variable can drive as many widgets as you want. the dot is its live value." }));
    if (!P().vars.length) add(h("p", { class: "muted", text: "no variables yet." }));
    for (const v of P().vars) {
      const card = h("div", { class: "act-card" });
      const nm = h("input", { class: "in", value: v.name, style: { fontFamily: "var(--mono)" } });
      nm.addEventListener("focus", snap);
      nm.addEventListener("change", () => {
        const old = v.name;
        const want = S.settings && S.settings.nameStyle === "camel" ? camel(nm.value) : GM.ident(nm.value, v.type);
        v.name = uniqueName(want, v.id);
        nm.value = v.name;
        renameRefs(old, v.name);
        resetVals();
        changed();
      });
      const ty = h("select", { class: "in" }, Object.entries(GM.VAR_TYPES).map(([k, t]) => h("option", { value: k, text: k, selected: v.type === k })));
      ty.addEventListener("focus", snap);
      ty.addEventListener("change", () => {
        v.type = ty.value;
        v.def = GM.varDefault(v.type);
        resetVals();
        changed();
      });
      const live = valOf(v);
      card.appendChild(h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, nm), h("div", { style: { width: "92px", flex: "none" } }, ty),
        h("button", { class: "btn sm ghost bad", title: "delete", onclick: () => {
          snap();
          P().vars = P().vars.filter((x) => x !== v);
          GM.walk(P().root, (n) => {
            if (n.p.bind === v.id) delete n.p.bind;
            if (n.p.itemsVar === v.id) delete n.p.itemsVar;
          });
          changed();
        } }, icon("trash"))));
      let defCtl;
      if (v.type === "bool") {
        defCtl = h("input", { type: "checkbox", checked: !!v.def });
        defCtl.addEventListener("change", () => ((v.def = defCtl.checked), delete S.vals[v.name], changed({ noSide: true })));
        card.appendChild(h("label", { class: "chk" }, defCtl, h("span", { text: "starts on" })));
      } else if (v.type === "color") {
        const tmp = { p: { c: v.def >>> 0 }, id: "var" };
        const f = A.fieldBase("Starts as", h("input", { class: "in", value: GM.hex8(v.def), style: { fontFamily: "var(--mono)" }, onchange: (e) => {
          const c = A.parseColor(e.target.value);
          if (c == null) return (e.target.value = GM.hex8(v.def));
          snap();
          v.def = c;
          delete S.vals[v.name];
          changed({ noSide: true });
        } }));
        card.appendChild(f);
      } else if (v.type === "list") {
        const ta = h("textarea", { class: "in", rows: 3 });
        ta.value = v.def;
        ta.addEventListener("focus", snap);
        ta.addEventListener("input", () => ((v.def = ta.value), delete S.vals[v.name], changed({ noSide: true })));
        card.appendChild(A.fieldBase("Items, one per line", ta));
      } else if (v.type === "string") {
        const t = h("input", { class: "in", value: v.def });
        t.addEventListener("focus", snap);
        t.addEventListener("input", () => ((v.def = t.value), delete S.vals[v.name], changed({ noSide: true })));
        card.appendChild(A.fieldBase("Starts as", t));
      } else {
        const mk = (k, label) => {
          const t = h("input", { class: "in", type: "number", step: v.type === "int" ? 1 : "any", value: v[k] });
          t.addEventListener("focus", snap);
          t.addEventListener("input", () => ((v[k] = +t.value || 0), k === "def" && delete S.vals[v.name], changed({ noSide: true })));
          return A.fieldBase(label, t);
        };
        card.appendChild(h("div", { class: "fld3" }, mk("def", "Starts at"), mk("min", "Min"), mk("max", "Max")));
      }
      const users = [];
      GM.walk(P().root, (n) => {
        if (n.p.bind === v.id || n.p.itemsVar === v.id) users.push(n);
      });
      card.appendChild(h("div", { class: "muted", style: { fontSize: "12px" } }, h("span", { class: "live-dot" }), "now " + fmtVal(live) + (users.length ? ", used by " + users.length + (users.length === 1 ? " widget" : " widgets") : ", not used yet")));
      add(card);
    }
    add(h("div", { class: "sec" }, h("span", { text: "Hotkeys" }), h("span", { class: "grow" }), h("button", { class: "btn sm", onclick: () => {
      snap();
      P().hotkeys.push({ id: GM.uid("k"), combo: "ctrl+m", actions: [] });
      changed();
    } }, icon("plus"), "Add")));
    add(h("p", { class: "muted", style: { fontSize: "12px", marginTop: 0 }, text: "goome_hotkey, works even when your overlay doesnt have focus. try them here too, click the canvas first." }));
    for (const hk of P().hotkeys) {
      const card = h("div", { class: "act-card" });
      const c = h("input", { class: "in", value: hk.combo, style: { fontFamily: "var(--mono)" }, placeholder: "ctrl+m, insert, f1" });
      c.addEventListener("focus", snap);
      c.addEventListener("change", () => ((hk.combo = c.value.trim().toLowerCase() || "ctrl+m"), changed({ noSide: true })));
      card.appendChild(h("div", { class: "row", style: { flexWrap: "nowrap" } }, h("div", { class: "grow" }, c), h("button", { class: "btn sm ghost bad", onclick: () => {
        snap();
        P().hotkeys = P().hotkeys.filter((x) => x !== hk);
        changed();
      } }, icon("trash"))));
      actionsEditor(card, hk.actions, (re) => changed({ noSide: !re }));
      add(card);
    }
  }
  function camel(s) {
    const id = GM.ident(s, "v");
    const c = id.replace(/_([a-z0-9])/g, (m, x) => x.toUpperCase());
    return GM.RESERVED.has(c) ? c + "V" : c;
  }
  function uniqueName(want, skipId) {
    const used = new Set(Object.keys(GM.layoutIdents(P())));
    for (const v of P().vars) if (v.id === skipId) used.delete(v.name);
    if (!used.has(want)) return want;
    for (let i = 2; ; i++) if (!used.has(want + i)) return want + i;
  }
  function renameRefs(old, nu) {
    const re = new RegExp("\\b" + old + "\\b", "g"), reb = new RegExp("\\{" + old + "\\}", "g");
    const fixActs = (list) => (list || []).forEach((a) => {
      if (a.var === old) a.var = nu;
      if (a.value) a.value = String(a.value).replace(re, nu);
      if (a.text) a.text = String(a.text).replace(reb, "{" + nu + "}");
    });
    GM.walk(P().root, (n) => {
      for (const k of ["showIf", "enableIf"]) if (n.p[k]) n.p[k] = n.p[k].replace(re, nu);
      for (const k of ["label", "toast", "button"]) if (typeof n.p[k] === "string") n.p[k] = n.p[k].replace(reb, "{" + nu + "}");
      if (n.on) for (const ev in n.on) fixActs(n.on[ev]);
    });
    for (const hk of P().hotkeys) fixActs(hk.actions);
  }

  Object.assign(A, { boundPv, valueChanged, fire, run, interp, evalExpr, nodeLogic, renderVars, resetVals, camel, KEYOF: KEY, liveLater: later });
})();
