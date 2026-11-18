(function () {
  const A = window.GMApp;
  const { h, $, icon, S, note, snap, changed, findNode, clamp } = A;
  const P = () => S.project;

  const PAL = [
    ["Layout", ["window", "row", "same_line", "space", "separator", "scroll", "split", "tabs", "collapsing", "tree"]],
    ["Text", ["label", "heading", "wrapped"]],
    ["Input", ["button", "checkbox", "toggle", "radio", "slider", "slider_int", "input", "text_edit", "combo", "selectable", "color"]],
    ["Data", ["progress", "table", "plot_lines", "plot_bars", "image"]],
    ["Menus and popups", ["menubar", "menu", "menu_item", "menu_sep", "modal", "popup", "toast"]],
  ];
  const MARK = { window: "W", row: "||", same_line: "->", space: "_", separator: "--", scroll: "S", split: "/", tabs: "T", collapsing: "v", tree: ">", label: "a", heading: "H", wrapped: "p", button: "B", checkbox: "x", toggle: "o", radio: "()", slider: "=", slider_int: "#", input: "I", text_edit: "E", combo: "C", selectable: "L", color: "c", progress: "%", table: "t", plot_lines: "~", plot_bars: "b", image: "i", menubar: "M", menu: "m", menu_item: ".", menu_sep: "-", modal: "D", toast: "!", el: "*" };

  function renderPalette() {
    const pal = $("#pal");
    pal.textContent = "";
    pal.appendChild(h("div", { class: "sheet-head" }, h("span", { text: "Add stuff" }), h("button", { class: "btn sm ghost", onclick: () => mpanel(null) }, icon("x"))));
    pal.appendChild(h("div", { class: "muted", style: { fontSize: "12px", margin: "0 2px 10px" }, text: A.isMobile() ? "tap to add it next to what you picked" : "drag onto the canvas, or click to add it next to what you picked" }));
    pal.appendChild(h("div", { class: "row", style: { marginBottom: "6px" } },
      h("button", { class: "chip" + (P().mode === "app" ? " on" : ""), onclick: () => setMode(P().mode === "app" ? "overlay" : "app") }, P().mode === "app" ? "App root is on" : "Use an app root")));
    for (const [cat, list] of PAL) {
      pal.appendChild(h("h4", { text: cat }));
      const g = h("div", { class: "pal-grid" });
      for (const t of list) g.appendChild(palItem(t, GM.TYPES[t].name, { kind: "new", type: t }));
      pal.appendChild(g);
    }
    pal.appendChild(h("h4", { text: "Your elements" }));
    const g = h("div", { class: "pal-grid" });
    for (const d of P().elements) g.appendChild(palItem("el", d.name, { kind: "new", type: "el", def: d.id }));
    pal.appendChild(g);
    pal.appendChild(h("button", { class: "btn", style: { width: "100%", marginTop: "6px" }, onclick: () => openTab("elements") }, icon("plus"), "Make an element"));
  }
  function palItem(type, label, payload) {
    const b = h("button", { class: "pal-item", title: label }, h("span", { text: label }));
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startDrag(e, payload, b);
    });
    return b;
  }

  let drag = null;
  function startDrag(e, payload, srcEl) {
    const sx = e.clientX, sy = e.clientY;
    const ctype = payload.kind === "new" ? (GM.TYPES[payload.type].alias || payload.type) : (findNode(payload.ids[0]) || {}).n?.type;
    if (!ctype) return;
    drag = { payload, ctype, sx, sy, moved: false, ghost: null, drop: null, src: srcEl };
    const mv = (ev) => {
      if (!drag.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      if (!drag.moved) {
        drag.moved = true;
        const label = payload.kind === "new" ? (payload.def ? (A.elDef(payload.def) || {}).name : GM.TYPES[payload.type].name) : payload.ids.length > 1 ? payload.ids.length + " things" : GM.TYPES[ctype].name;
        drag.ghost = h("div", { class: "ghost-drag", text: label });
        document.body.appendChild(drag.ghost);
        if (A.isMobile()) mpanel(null);
      }
      drag.ghost.style.left = ev.clientX + "px";
      drag.ghost.style.top = ev.clientY + "px";
      const overLayers = document.elementsFromPoint(ev.clientX, ev.clientY).find((x) => x.classList && x.classList.contains("lay-row"));
      if (overLayers) {
        drag.drop = layerDrop(overLayers, ev.clientY, ctype);
        A.showDrop(null);
        return;
      }
      clearLayerDrop();
      drag.drop = A.findDrop(ev.clientX, ev.clientY, ctype);
      if (drag.drop) drag.drop.cx = ev.clientX, (drag.drop.cy = ev.clientY);
      A.showDrop(drag.drop);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      A.showDrop(null);
      clearLayerDrop();
      const d = drag;
      drag = null;
      if (d.ghost) d.ghost.remove();
      if (!d.moved) {
        if (payload.kind === "new") {
          addNew(payload);
          if (A.isMobile()) mpanel(null), note("added");
        }
        return;
      }
      if (d.drop) applyDrop(d, d.drop);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function makeNew(payload) {
    const n = GM.newNode(payload.type, P());
    if (S.settings && S.settings.nameStyle === "camel" && n.p.var) n.p.var = GM.uniqueVar(P(), A.camel(n.p.var));
    if (S.settings && S.settings.autoVar && GM.BIND[n.type] && !["window", "modal", "popup", "collapsing", "tree", "progress", "menu_item"].includes(n.type)) {
      const t = GM.BIND[n.type][0];
      const v = GM.newVar(P(), t, n.p.var || n.type);
      if (S.settings.nameStyle === "camel") v.name = A.camel(v.name);
      const k = A.KEYOF[n.type];
      const init = { on: n.p.on, sel: n.p.sel, v: n.p.value, text: n.p.text, color: n.p.color }[k];
      if (init != null) v.def = t === "bool" ? !!init : init;
      if (n.type === "slider" || n.type === "slider_int") (v.min = +n.p.min), (v.max = +n.p.max);
      P().vars.push(v);
      n.p.bind = v.id;
    }
    if (n.type === "el") {
      const def = A.elDef(payload.def) || P().elements[0];
      if (!def) return null;
      n.p.el = def.id;
      n.p.var = GM.uniqueVar(P(), def.name);
    }
    return n;
  }
  function listOf(pid, si) {
    if (pid === "root") return P().root;
    const info = findNode(pid);
    return info && info.n.kids ? info.n.kids[si] : null;
  }
  function ptypeOf(pid) {
    if (pid === "root") return P().mode === "app" ? "app" : "overlay";
    const info = findNode(pid);
    return info ? info.n.type : "";
  }

  function applyDrop(d, drop) {
    const payload = d.payload;
    snap();
    let nodes;
    if (payload.kind === "new") {
      const n = makeNew(payload);
      if (!n) return;
      nodes = [n];
    } else {
      const idx = GM.index(P());
      const ids = payload.ids.filter((id) => !payload.ids.some((o) => o !== id && isInside(idx, id, o)));
      if (drop.pid && drop.pid !== "root" && ids.some((id) => id === drop.pid || isInside(idx, drop.pid, id))) return note("cant put something inside itself");
      nodes = [];
      for (const id of ids) {
        const info = idx.get(id);
        if (!info) continue;
        if (drop.pid && !GM.accepts(drop.ptype || ptypeOf(drop.pid), info.n.type)) continue;
        const at = info.list.indexOf(info.n);
        if (info.list === listOf(drop.pid, drop.si) && at < drop.index) drop.index--;
        info.list.splice(at, 1);
        nodes.push(info.n);
      }
    }
    if (drop.wrapWin || (drop.canvas && nodes.some((n) => n.type !== "window" && n.type !== "el"))) {
      const pt = A.surfacePoint(drop.cx, drop.cy);
      const wins = nodes.filter((n) => n.type === "window" || (n.type === "el" && P().mode === "overlay"));
      const rest = nodes.filter((n) => !wins.includes(n));
      for (const n of wins) place(n, pt), P().root.push(n);
      if (rest.length) {
        const w = GM.newNode("window", P());
        w.p.label = "Window";
        place(w, pt);
        w.kids[0].push(...rest);
        P().root.push(w);
        S.sel = [w.id];
      }
      if (wins.length) S.sel = wins.map((n) => n.id);
      return changed();
    }
    if (drop.exact) {
      const list = listOf(drop.pid, drop.si);
      if (!list) return;
      for (const n of nodes) {
        n.abs = Object.assign({}, n.abs && { w: n.abs.w, h: n.abs.h }, { x: drop.exact.x, y: drop.exact.y });
        list.push(n);
      }
      S.sel = nodes.map((n) => n.id);
      return changed();
    }
    if (drop.canvas) {
      const pt = A.surfacePoint(drop.cx, drop.cy);
      for (const n of nodes) place(n, pt), P().root.push(n);
      S.sel = nodes.map((n) => n.id);
      return changed();
    }
    const list = listOf(drop.pid, drop.si);
    if (!list) return;
    if (P().mode === "app" && drop.pid === "root") {
      for (const n of nodes) if (n.type === "window") place(n, A.surfacePoint(drop.cx || 0, drop.cy || 0));
      if (nodes.some((n) => n.type === "menubar")) P().app.menubar = true;
    }
    list.splice(clamp(drop.index, 0, list.length), 0, ...nodes);
    for (const n of nodes) if (n.abs && drop.pid === "root" && P().mode === "overlay") delete n.abs;
    fixAutoHeight(drop.pid, nodes);
    S.sel = nodes.map((n) => n.id);
    changed();
  }
  function place(n, pt) {
    n.p.x = pt.x;
    n.p.y = pt.y;
    delete n.abs;
  }
  function fixAutoHeight(pid, nodes) {
    if (!nodes.some((n) => n.type === "split" || (n.type === "scroll" && !(n.p.h > 0)) || (n.type === "text_edit" && !(n.p.h > 0)))) return;
    const idx = GM.index(P());
    let cur = idx.get(pid);
    while (cur) {
      if (cur.n.type === "window") {
        if (!(cur.n.p.h > 0)) {
          cur.n.p.h = 420;
          note("gave the window a height, splits and full height areas need one");
        }
        return;
      }
      cur = cur.parent ? idx.get(cur.parent.id) : null;
    }
  }
  function isInside(idx, id, maybeParent) {
    let cur = idx.get(id);
    while (cur && cur.parent) {
      if (cur.parent.id === maybeParent) return true;
      cur = idx.get(cur.parent.id);
    }
    return false;
  }

  function targetFor(ctype) {
    const idx = GM.index(P());
    const sel = S.sel.length ? idx.get(S.sel[S.sel.length - 1]) : null;
    const tries = [];
    if (sel) {
      const n = sel.n;
      if (n.kids) {
        const si = n.type === "tabs" ? clamp(A.pvGet(n).sel, 0, n.kids.length - 1) : 0;
        tries.push({ pid: n.id, si, index: n.kids[si].length, ptype: n.type });
      }
      let cur = sel;
      let child = sel.n;
      while (cur) {
        const pid = cur.parent ? cur.parent.id : "root";
        tries.push({ pid, si: cur.slot, index: cur.list.indexOf(child) + 1, ptype: cur.parent ? cur.parent.type : ptypeOf("root") });
        if (!cur.parent) break;
        child = cur.parent;
        cur = idx.get(cur.parent.id);
      }
    }
    for (const t of tries) if (GM.accepts(t.ptype, ctype)) return t;
    if (ctype === "menu_item" || ctype === "menu_sep") {
      let m = null;
      GM.walk(P().root, (n) => {
        if (n.type === "menu" && !m) m = n;
      });
      if (m) return { pid: m.id, si: 0, index: m.kids[0].length, ptype: "menu" };
    }
    if (ctype === "menu") {
      let m = null;
      GM.walk(P().root, (n) => {
        if (n.type === "menubar" && !m) m = n;
      });
      if (m) return { pid: m.id, si: 0, index: m.kids[0].length, ptype: "menubar" };
    }
    const rt = ptypeOf("root");
    if (GM.accepts(rt, ctype)) return { pid: "root", si: 0, index: P().root.length, ptype: rt };
    const w = P().root.find((n) => n.type === "window");
    if (w && GM.accepts("window", ctype)) return { pid: w.id, si: 0, index: w.kids[0].length, ptype: "window" };
    return null;
  }
  function addNew(payload) {
    const n = makeNew(payload);
    if (!n) return note("make an element first");
    snap();
    let t = targetFor(n.type);
    if (!t) {
      if (n.type === "menu_item" || n.type === "menu_sep" || n.type === "menu") {
        const mb = GM.newNode("menubar", P());
        const m = mb.kids[0][0];
        if (n.type !== "menu") m.kids[0].push(n);
        else mb.kids[0] = [n];
        return insertTop(mb, n);
      }
      const w = GM.newNode("window", P());
      w.p.x = 40 + (P().root.length % 6) * 30;
      w.p.y = 40 + (P().root.length % 6) * 30;
      w.kids[0].push(n);
      P().root.push(w);
      S.sel = [n.id];
      return changed();
    }
    if (n.type === "window" || (n.type === "el" && t.pid === "root")) {
      n.p.x = 40 + (P().root.length % 8) * 28;
      n.p.y = 40 + (P().root.length % 8) * 28;
    }
    listOf(t.pid, t.si).splice(t.index, 0, n);
    if (n.type === "menubar" && t.pid === "root" && P().mode === "app") P().app.menubar = true;
    fixAutoHeight(t.pid, [n]);
    S.sel = [n.id];
    changed();
  }
  function insertTop(mb, sel) {
    const t = targetFor("menubar");
    if (t) listOf(t.pid, t.si).splice(t.index, 0, mb);
    else {
      const w = GM.newNode("window", P());
      w.kids[0].push(mb);
      P().root.push(w);
    }
    S.sel = [sel.id];
    changed();
  }

  function reId(n) {
    n.id = GM.uid();
    if (n.p && n.p.var) n.p.var = GM.uniqueVar(P(), n.p.var, n.id);
    if (n.kids) n.kids.forEach((l) => l.forEach(reId));
  }
  function topSel() {
    const idx = GM.index(P());
    return S.sel.filter((id) => idx.has(id) && !S.sel.some((o) => o !== id && isInside(idx, id, o))).map((id) => idx.get(id));
  }
  function removeSel(force) {
    const infos = topSel();
    if (!infos.length) return;
    if (!force && S.settings && S.settings.confirmDelete) return A.confirm2(infos.length === 1 ? "Delete this " + GM.TYPES[infos[0].n.type].name.toLowerCase() + "?" : "Delete " + infos.length + " things?", () => removeSel(true));
    snap();
    for (const i of infos) {
      const k = i.list.indexOf(i.n);
      if (k >= 0) i.list.splice(k, 1);
    }
    S.sel = [];
    changed();
  }
  function duplicate() {
    const infos = topSel();
    if (!infos.length) return;
    snap();
    const out = [];
    for (const i of infos) {
      const c = GM.clone(i.n);
      reId(c);
      if (c.type === "window" || (c.type === "el" && !i.parent)) (c.p.x += 24), (c.p.y += 24);
      if (c.abs) (c.abs.x += 16), (c.abs.y += 16);
      i.list.splice(i.list.indexOf(i.n) + 1, 0, c);
      out.push(c.id);
    }
    S.sel = out;
    changed();
  }
  function shift(dir) {
    const infos = topSel();
    if (!infos.length) return;
    snap();
    const sorted = infos.slice().sort((a, b) => (a.list.indexOf(a.n) - b.list.indexOf(b.n)) * -dir);
    for (const i of sorted) {
      const k = i.list.indexOf(i.n), j = k + dir;
      if (j < 0 || j >= i.list.length) continue;
      i.list.splice(k, 1);
      i.list.splice(j, 0, i.n);
    }
    changed();
  }
  function moveOut() {
    const infos = topSel();
    if (infos.length !== 1 || !infos[0].parent) return;
    const idx = GM.index(P());
    const i = infos[0], par = idx.get(i.parent.id);
    const pt = par.parent ? par.parent.type : ptypeOf("root");
    if (!GM.accepts(pt, i.n.type)) return note("it cant go there");
    snap();
    i.list.splice(i.list.indexOf(i.n), 1);
    par.list.splice(par.list.indexOf(par.n) + 1, 0, i.n);
    changed();
  }
  function copySel() {
    const infos = topSel();
    if (!infos.length) return;
    S.clip = infos.map((i) => GM.clone(i.n));
    try {
      localStorage.setItem("gm-uibuilder-clip", JSON.stringify(S.clip));
    } catch (e) {}
    note(infos.length === 1 ? "copied" : "copied " + infos.length);
  }
  function paste() {
    if (!S.clip || !S.clip.length) return note("nothing copied yet");
    snap();
    const out = [];
    for (const raw of S.clip) {
      const n = GM.clone(raw);
      reId(n);
      const t = targetFor(n.type);
      if (!t) continue;
      if (n.type === "window" || (n.type === "el" && t.pid === "root")) (n.p.x += 24), (n.p.y += 24);
      listOf(t.pid, t.si).splice(t.index, 0, n);
      out.push(n.id);
    }
    if (!out.length) return note("that cant go here");
    S.sel = out;
    changed();
  }

  function layerDrop(row, y, ctype) {
    clearLayerDrop();
    const info = findNode(row.dataset.nid);
    if (!info) return null;
    const r = row.getBoundingClientRect();
    const into = info.n.kids && y > r.top + r.height * 0.3 && y < r.bottom - r.height * 0.3 && GM.accepts(info.n.type, ctype);
    if (into) {
      row.classList.add("into");
      const si = info.n.type === "tabs" ? clamp(A.pvGet(info.n).sel, 0, info.n.kids.length - 1) : 0;
      return { pid: info.n.id, si, index: info.n.kids[si].length, ptype: info.n.type, cx: 60, cy: 60 };
    }
    const pid = info.parent ? info.parent.id : "root";
    const pt = info.parent ? info.parent.type : ptypeOf("root");
    if (!GM.accepts(pt, ctype)) return null;
    const after = y > r.top + r.height / 2;
    const line = h("div", { class: "lay-drop" });
    if (after) row.after(line);
    else row.before(line);
    const k = info.list.indexOf(info.n) + (after ? 1 : 0);
    return { pid, si: info.slot, index: k, ptype: pt, cx: 80, cy: 80 };
  }
  function clearLayerDrop() {
    document.querySelectorAll(".lay-drop").forEach((x) => x.remove());
    document.querySelectorAll(".lay-row.into").forEach((x) => x.classList.remove("into"));
  }

  function nodeName(n) {
    if (n.type === "el") {
      const d = A.elDef(n.p.el);
      return (d ? d.name : "missing") + (n.p.var ? "  " + n.p.var : "");
    }
    const lab = n.p.label || (n.type === "modal" ? n.p.button : "") || n.p.var || "";
    return String(lab).split("\n")[0].slice(0, 40);
  }
  function renderLayers(body) {
    const bar = h("div", { class: "row", style: { marginBottom: "8px" } },
      h("button", { class: "btn sm", title: "up", onclick: () => shift(-1), disabled: !S.sel.length }, icon("up")),
      h("button", { class: "btn sm", title: "down", onclick: () => shift(1), disabled: !S.sel.length }, icon("down")),
      h("button", { class: "btn sm", title: "move out of its parent", onclick: moveOut, disabled: S.sel.length !== 1 }, icon("out")),
      h("button", { class: "btn sm", title: "duplicate", onclick: duplicate, disabled: !S.sel.length }, icon("copy")),
      h("button", { class: "btn sm bad", title: "delete", onclick: removeSel, disabled: !S.sel.length }, icon("trash")),
      h("span", { class: "grow" }),
      h("span", { class: "muted", style: { fontSize: "12px" }, text: S.sel.length > 1 ? S.sel.length + " picked" : "" }));
    body.appendChild(bar);
    const box = h("div");
    const rootLabel = P().mode === "app" ? "App: " + P().title : "Overlay canvas";
    box.appendChild(h("div", { class: "lay-row" + (!S.sel.length ? " on" : ""), onclick: () => ((S.sel = []), A.markSel(), renderSide()) }, h("span", { class: "tw" }), h("span", { class: "nm", text: rootLabel })));
    const walk = (list, depth) => {
      list.forEach((n) => {
        const hasKids = n.kids && n.kids.some((l) => l.length);
        const shut = S.collapsed[n.id];
        const row = h("div", { class: "lay-row" + (S.sel.includes(n.id) ? " on" : ""), style: { paddingLeft: depth * 14 + "px" } });
        row.dataset.nid = n.id;
        const grip = h("span", { class: "grip" }, icon("grip"));
        grip.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          if (!S.sel.includes(n.id)) S.sel = [n.id];
          startDrag(e, { kind: "move", ids: S.sel.slice() });
        });
        const tw = h("span", { class: "tw" }, hasKids ? icon(shut ? "chevr" : "chevd") : null);
        tw.addEventListener("click", (e) => {
          e.stopPropagation();
          S.collapsed[n.id] = !shut;
          renderSide();
        });
        row.append(grip, tw, h("span", { class: "nm" }, h("span", { class: "ty", text: GM.TYPES[n.type].name }), nodeName(n)));
        if (S.warnIds && S.warnIds.has(n.id)) row.appendChild(h("span", { class: "wb", title: "has a warning" }));
        row.addEventListener("click", (e) => {
          A.pick(n.id, e.shiftKey || e.ctrlKey || e.metaKey || S.multi);
        });
        box.appendChild(row);
        if (n.kids && !shut) {
          if (n.type === "tabs" || n.type === "split") {
            const names = n.type === "tabs" ? GM.lines(n.p.items) : ["first pane", "second pane"];
            n.kids.forEach((l, si) => {
              box.appendChild(h("div", { class: "muted", style: { paddingLeft: depth * 14 + 54 + "px", fontSize: "12px", minHeight: "24px", display: "flex", alignItems: "center" }, text: names[si] || "page " + (si + 1) }));
              walk(l, depth + 1);
            });
          } else walk(n.kids[0], depth + 1);
        }
      });
    };
    walk(P().root, 0);
    if (!P().root.length) box.appendChild(h("div", { class: "muted", style: { padding: "10px" }, text: "nothing here yet" }));
    body.appendChild(box);
  }

  function fieldBase(label, ctrl, hint) {
    return h("label", { class: "fld" }, h("span", { text: label }), ctrl, hint ? h("span", { class: "muted", style: { fontSize: "11px" }, text: hint }) : null);
  }
  function bindIn(inp, get, set, o = {}) {
    inp.addEventListener("focus", () => snap());
    inp.addEventListener(o.ev || "input", () => {
      set(inp.type === "checkbox" ? inp.checked : inp.value);
      if (o.reset) for (const id of o.reset) for (const k in S.pv) if (k === id || k.endsWith(":" + id)) delete S.pv[k];
      changed({ noSide: !o.side });
    });
    return inp;
  }
  function fText(n, key, label, o = {}) {
    const inp = h(o.area ? "textarea" : "input", { class: "in", value: n.p[key] == null ? "" : String(n.p[key]), spellcheck: "false" });
    if (o.area) inp.value = n.p[key] || "", (inp.rows = o.rows || 4);
    bindIn(inp, null, (v) => (n.p[key] = v), { reset: o.reset ? [n.id] : null, side: o.side });
    return fieldBase(label, inp, o.hint);
  }
  function fNum(n, key, label, o = {}) {
    const inp = h("input", { class: "in", type: "number", value: n.p[key], step: o.step || "any", min: o.min });
    bindIn(inp, null, (v) => (n.p[key] = v === "" ? 0 : +v), { reset: o.reset ? [n.id] : null });
    return fieldBase(label, inp, o.hint);
  }
  function fBool(n, key, label, o = {}) {
    const inp = h("input", { type: "checkbox", checked: !!n.p[key] });
    bindIn(inp, null, (v) => (n.p[key] = !!v), { ev: "change", reset: o.reset ? [n.id] : null, side: o.side });
    return h("label", { class: "chk" }, inp, h("span", { text: label }));
  }
  function fSel(n, key, label, opts, o = {}) {
    const s = h("select", { class: "in" }, Object.entries(opts).map(([v, t]) => h("option", { value: v, text: t, selected: String(n.p[key]) === v })));
    bindIn(s, null, (v) => (n.p[key] = v), { ev: "change", side: true });
    return fieldBase(label, s);
  }
  function fVar(n, label = "Variable") {
    const inp = h("input", { class: "in", value: n.p.var || "", spellcheck: "false", style: { fontFamily: "var(--mono)" } });
    const msg = h("span", { class: "muted", style: { fontSize: "11px" } });
    inp.addEventListener("focus", () => snap());
    inp.addEventListener("change", () => {
      const want = GM.ident(inp.value, n.type);
      const v = GM.uniqueVar(P(), want, n.id);
      n.p.var = v;
      inp.value = v;
      msg.textContent = v !== inp.value.trim() || v !== want ? "renamed to " + v + " so its unique and works in every language" : "";
      changed({ noSide: true });
    });
    return h("label", { class: "fld" }, h("span", { text: label }), inp, msg);
  }
  function fColorP(n, key, label) {
    const c = n.p[key] >>> 0;
    const col = h("input", { type: "color", class: "in", value: "#" + (c & 0xFFFFFF).toString(16).padStart(6, "0") });
    const hx = h("input", { class: "in", value: GM.hex8(c), style: { fontFamily: "var(--mono)" } });
    const set = (v) => {
      n.p[key] = v >>> 0;
      delete S.pv[n.id];
      changed({ noSide: true });
    };
    col.addEventListener("focus", snap);
    hx.addEventListener("focus", snap);
    col.addEventListener("input", () => {
      set(((n.p[key] & 0xFF000000) | parseInt(col.value.slice(1), 16)) >>> 0);
      hx.value = GM.hex8(n.p[key]);
    });
    hx.addEventListener("change", () => {
      const v = parseColor(hx.value);
      if (v == null) return (hx.value = GM.hex8(n.p[key]));
      set(v);
      col.value = "#" + (v & 0xFFFFFF).toString(16).padStart(6, "0");
    });
    return fieldBase(label, h("div", { class: "row", style: { flexWrap: "nowrap" } }, col, hx));
  }
  function parseColor(s) {
    s = String(s).trim();
    let m;
    if ((m = /^0x([0-9a-f]{8})$/i.exec(s))) return parseInt(m[1], 16) >>> 0;
    if ((m = /^#?([0-9a-f]{6})$/i.exec(s))) return (0xFF000000 | parseInt(m[1], 16)) >>> 0;
    if ((m = /^#([0-9a-f]{8})$/i.exec(s))) return ((parseInt(m[1].slice(6), 16) << 24) | parseInt(m[1].slice(0, 6), 16)) >>> 0;
    return null;
  }

  function renderProps(body) {
    const sel = S.sel.map((id) => findNode(id)).filter(Boolean);
    if (sel.length > 1) return multiProps(body, sel);
    if (!sel.length) return projectProps(body);
    const { n, parent } = sel[0];
    const T = GM.TYPES[n.type];
    body.appendChild(h("div", { class: "sec" }, h("span", { text: T.name }), h("span", { class: "grow" }),
      h("button", { class: "btn sm ghost", title: "copy (ctrl+c)", onclick: copySel }, icon("copy")),
      h("button", { class: "btn sm ghost bad", title: "delete", onclick: removeSel }, icon("trash"))));
    const warns = (S.warnings || []).filter((w) => w.id === n.id);
    for (const w of warns) body.appendChild(h("div", { class: "warn", style: { marginBottom: "8px" }, text: w.msg }));
    const p = n.p, add = (x) => body.appendChild(x);
    const two = (...xs) => add(h("div", { class: "fld2" }, ...xs));
    switch (n.type) {
      case "window":
        add(fText(n, "label", "Title", { hint: "goome keys the window by its title, keep them different" }));
        add(fVar(n, "Variable (position and size)"));
        two(fNum(n, "x", "X"), fNum(n, "y", "Y"));
        two(fNum(n, "w", "Width"), fNum(n, "h", "Height", { hint: "0 = fits the content" }));
        add(h("div", { class: "sec", text: "Flags" }));
        add(fBool(n, "move", "GOOME_WIN_MOVE, drag it around"));
        add(fBool(n, "resize", "GOOME_WIN_RESIZE, corner grip"));
        add(fBool(n, "collapse", "GOOME_WIN_COLLAPSE, fold it up"));
        add(fBool(n, "close", "GOOME_WIN_CLOSE, x button (adds an open flag)"));
        add(fBool(n, "notitle", "GOOME_WIN_NO_TITLE, no title bar"));
        break;
      case "row":
        add(fNum(n, "cols", "Columns", { hint: "0 = one column per widget in it", min: 0 }));
        break;
      case "same_line":
        add(h("p", { class: "muted", text: "puts the next widget on the same line as the one before it. it doesnt draw anything." }));
        break;
      case "space":
        add(fNum(n, "px", "Pixels"));
        break;
      case "separator":
        add(h("p", { class: "muted", text: "a thin line across." }));
        break;
      case "scroll":
        add(fVar(n, "Id"));
        add(fNum(n, "h", "Height", { hint: "0 = fill what is left of the page" }));
        break;
      case "split":
        add(fVar(n, "Id"));
        add(fBool(n, "vertical", "Vertical (one pane on top of the other)"));
        add(fNum(n, "frac", "First pane size, 0 to 1", { step: 0.05 }));
        add(h("p", { class: "muted", text: "a split fills the rest of the window, so give the window a height." }));
        break;
      case "tabs":
        add(fVar(n));
        add(fText(n, "items", "Tabs, one per line", { area: true, side: true, reset: true }));
        add(fNum(n, "sel", "Starts on tab", { min: 0, reset: true }));
        break;
      case "collapsing": case "tree":
        add(fText(n, "label", "Label"));
        add(fVar(n));
        add(fBool(n, "open", "Starts open", { reset: true }));
        break;
      case "label": case "heading": case "wrapped":
        add(fText(n, "label", "Text", { area: n.type === "wrapped", hint: n.type === "label" ? "goome_ui_label is printf style, the code escapes % for you" : "" }));
        break;
      case "button":
        add(fText(n, "label", "Label"));
        add(fSel(n, "action", "When clicked", GM.ACTIONS));
        if (p.action === "toast") two(fText(n, "toast", "Toast text"), fNum(n, "ms", "Shows for ms"));
        if (p.action === "close") add(h("p", { class: "muted", text: "closes the popup or modal its in." }));
        break;
      case "checkbox": case "toggle":
        add(fText(n, "label", "Label"));
        add(fVar(n));
        add(fBool(n, "on", "Starts on", { reset: true }));
        break;
      case "radio":
        add(fVar(n));
        add(fText(n, "items", "Options, one per line", { area: true, reset: true }));
        add(fNum(n, "sel", "Picked at start", { min: 0, reset: true }));
        add(fBool(n, "inline", "On one line"));
        break;
      case "slider": case "slider_int":
        add(fText(n, "label", "Label"));
        add(fVar(n));
        add(h("div", { class: "fld3" }, fNum(n, "min", "Min", { reset: true }), fNum(n, "max", "Max", { reset: true }), fNum(n, "value", "Start", { reset: true })));
        if (n.type === "slider") add(fText(n, "fmt", "Format", { hint: "printf style, like %.2f or %.0f px" }));
        break;
      case "input":
        add(fText(n, "label", "Label", { hint: "start it with ## to hide it, like ##search" }));
        add(fVar(n));
        two(fText(n, "text", "Starting text", { reset: true }), fNum(n, "cap", "Max bytes", { min: 2 }));
        add(fText(n, "hint", "Placeholder", { hint: "grey text while its empty" }));
        add(fBool(n, "password", "GOOME_INPUT_PASSWORD, shows * and wont copy"));
        add(fBool(n, "readonly", "GOOME_INPUT_READONLY"));
        add(fBool(n, "number", "GOOME_INPUT_NUMBER, only digits + - ."));
        add(fBool(n, "enter", "GOOME_INPUT_ENTER_RETURNS, the enter event turns it on too"));
        add(fBool(n, "noselect", "GOOME_INPUT_NO_SELECT_ON_FOCUS"));
        break;
      case "text_edit":
        add(fVar(n, "Id"));
        add(fText(n, "text", "Starting text", { area: true, reset: true }));
        two(fNum(n, "h", "Height", { hint: "0 = fill" }), fNum(n, "cap", "Max bytes", { min: 2 }));
        add(fBool(n, "wrap", "GOOME_EDIT_WRAP"));
        add(fBool(n, "numbers", "GOOME_EDIT_LINE_NUMBERS"));
        add(fBool(n, "mono", "GOOME_EDIT_MONO"));
        add(fBool(n, "readonly", "GOOME_EDIT_READONLY"));
        break;
      case "combo":
        add(fText(n, "label", "Label"));
        add(fVar(n));
        add(fText(n, "items", "Items, one per line", { area: true, reset: true }));
        add(fNum(n, "sel", "Picked at start", { min: 0, reset: true }));
        break;
      case "selectable":
        add(fVar(n));
        add(fText(n, "items", "Items, one per line", { area: true, reset: true }));
        add(fNum(n, "sel", "Picked at start", { reset: true }));
        break;
      case "color":
        add(fText(n, "label", "Label"));
        add(fVar(n));
        add(fColorP(n, "color", "Starting color"));
        break;
      case "progress":
        add(fNum(n, "value", "Value, 0 to 1 (below 0 = busy)", { step: 0.05 }));
        add(fText(n, "label", "Text on it"));
        break;
      case "table":
        add(fVar(n, "Id"));
        add(fText(n, "cols", "Columns, one per line, Name or Name:width", { area: true, rows: 3 }));
        add(fText(n, "rows", "Rows, one per line, cells split by commas", { area: true }));
        add(fNum(n, "h", "Height", { hint: "0 = grows with the rows" }));
        add(fBool(n, "sortable", "GOOME_TABLE_SORTABLE"));
        add(fBool(n, "resizable", "GOOME_TABLE_RESIZABLE"));
        add(fBool(n, "stripes", "GOOME_TABLE_STRIPES"));
        add(fBool(n, "borders", "GOOME_TABLE_BORDERS"));
        break;
      case "plot_lines": case "plot_bars":
        add(fText(n, "label", "Label"));
        add(fVar(n, "Data variable"));
        add(fText(n, "values", "Values", { area: true, rows: 2 }));
        add(h("div", { class: "fld3" }, fNum(n, "min", "Min"), fNum(n, "max", "Max", { hint: "max <= min = auto" }), fNum(n, "h", "Height")));
        break;
      case "image":
        add(h("div", { class: "fld3" }, fNum(n, "w", "Width"), fNum(n, "h", "Height"), fNum(n, "radius", "Radius")));
        add(h("p", { class: "muted", text: "the code makes a grey placeholder bitmap, swap in goome_bitmap_load for a real picture." }));
        break;
      case "menubar":
        add(h("p", { class: "muted", text: "holds menus. in an app with the menu bar flag the first one at the top goes in the app bar." }));
        break;
      case "menu":
        add(fText(n, "label", "Label"));
        break;
      case "menu_item":
        add(fText(n, "label", "Label"));
        add(fText(n, "shortcut", "Shortcut text", { hint: "just shows it, hook the key up yourself" }));
        add(fBool(n, "check", "Has a check mark", { side: true }));
        if (p.check) {
          if (!p.var) p.var = GM.uniqueVar(P(), p.label);
          add(fVar(n));
          add(fBool(n, "on", "Checked at start", { reset: true }));
        }
        break;
      case "menu_sep":
        add(h("p", { class: "muted", text: "a line between menu items." }));
        break;
      case "popup":
        add(fText(n, "label", "Id"));
        add(h("p", { class: "muted", text: "opens under whatever opened it. open it with an \"Open a window, modal or popup\" action on a button." }));
        break;
      case "modal":
        add(fText(n, "label", "Title"));
        add(fText(n, "button", "Button that opens it"));
        add(fVar(n, "Open flag"));
        break;
      case "el":
        elProps(body, n, parent);
        break;
    }
    if ("tooltip" in p) {
      add(h("div", { class: "sec", text: "Extras" }));
      add(fText(n, "tooltip", "Tooltip"));
      add(fNum(n, "width", "Width", { hint: "0 = default, goome_ui_width before it" }));
    }
    const inWin = parent && n.type !== "same_line" && !["menu", "menu_item", "menu_sep"].includes(n.type) && !["menubar", "menu"].includes(parent.type);
    const inApp = !parent && P().mode === "app" && n.type !== "window";
    if (inWin || inApp) {
      const pin = h("input", { type: "checkbox", checked: !!n.abs });
      pin.addEventListener("change", () => {
        snap();
        if (pin.checked) {
          const el = $('#stageWrap [data-nid="' + n.id + '"]');
          n.abs = { x: el ? el.offsetLeft : 10, y: el ? el.offsetTop : 10 };
        } else delete n.abs;
        changed();
      });
      add(h("label", { class: "chk" }, pin, h("span", { text: "Pin it at a spot" })));
      if (n.abs) {
        add(h("div", { class: "fld2" }, numAbs(n, "x"), numAbs(n, "y")));
        add(h("div", { class: "fld2" }, numAbs(n, "w", "Width (0 = own)"), numAbs(n, "h", "Height (0 = own)")));
        add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "exported as goome_ui_pos (and goome_ui_size when you set one). the rest of the layout keeps flowing like it isnt there." }));
      }
    }
    if (A.nodeLogic) A.nodeLogic(body, n);
    if (n.type !== "same_line" && n.type !== "menu_sep") styleSection(body, n);
  }

  function styleSection(body, n) {
    S.styleOpen = S.styleOpen || {};
    const slots = n.type === "tabs" ? GM.lines(n.p.items).map((x, i) => [String(i), "page: " + x]) : n.type === "split" ? [["0", "first pane"], ["1", "second pane"]] : [];
    const which = S.styleWhich && S.styleWhich.id === n.id ? S.styleWhich.k : "all";
    const get = () => {
      if (which === "all") return n.style || (n.style = {});
      n.slotStyle = n.slotStyle || {};
      return n.slotStyle[which] || (n.slotStyle[which] = {});
    };
    const st = get();
    const cnt = GM.styleCount(st);
    const open = S.styleOpen[n.id] || cnt > 0;
    const head = h("div", { class: "sec", style: { cursor: "pointer" }, onclick: () => ((S.styleOpen[n.id] = !open), renderSide()) },
      icon(open ? "chevd" : "chevr"), h("span", { text: "Style" + (cnt ? " (" + cnt + " push" + (cnt > 1 ? "es" : "") + ")" : "") }), h("span", { class: "grow" }));
    body.appendChild(head);
    if (!open) return;
    const box = h("div");
    body.appendChild(box);
    const isSection = GM.isContainer(n.type);
    box.appendChild(h("p", { class: "muted", style: { fontSize: "12px", marginTop: 0 }, text: isSection ? "pushed before it starts and popped after its end, so everything inside gets it too." : "pushed right before this widget and popped right after." }));
    if (slots.length) {
      const sel = h("select", { class: "in" }, h("option", { value: "all", text: "the whole " + GM.TYPES[n.type].name.toLowerCase(), selected: which === "all" }), slots.map(([k, t]) => h("option", { value: k, text: t, selected: which === k })));
      sel.addEventListener("change", () => ((S.styleWhich = { id: n.id, k: sel.value }), renderSide()));
      box.appendChild(A.fieldBase("Style for", sel));
    }
    const ch = () => {
      for (const k in S.pv) if (k.startsWith("el:")) delete S.pv[k];
      changed({ noSide: true });
    };
    const themes = [["", "none"]].concat(GM.PRESETS.map((t) => [t.id, t.name]), (P().themes || []).map((t) => [t.id, t.name + " (yours)"]));
    const ts = h("select", { class: "in" }, themes.map(([v, t]) => h("option", { value: v, text: t, selected: (st.theme || "") === v })));
    ts.addEventListener("focus", snap);
    ts.addEventListener("change", () => {
      if (ts.value) st.theme = ts.value;
      else delete st.theme;
      changed();
    });
    box.appendChild(A.fieldBase("Whole theme for this part (goome_ui_push_theme)", ts));
    const eff = GM.styledTheme(P(), P().theme, st);
    st.c = st.c || {};
    st.n = st.n || {};
    S.styGrp = S.styGrp || {};
    const colorOv = (k) => {
      const on = st.c[k] != null;
      const v = on ? st.c[k] >>> 0 : (eff[k] >>> 0) || 0xFF808080;
      const cb = h("input", { type: "checkbox", checked: on, title: "override " + k });
      const col = h("input", { type: "color", class: "in", value: "#" + (v & 0xFFFFFF).toString(16).padStart(6, "0"), disabled: !on });
      const al = h("input", { class: "in", type: "number", min: 0, max: 255, value: (v >>> 24) & 255, disabled: !on, title: "alpha" });
      const setv = () => {
        st.c[k] = (((clamp(+al.value || 0, 0, 255) & 255) << 24) | parseInt(col.value.slice(1), 16)) >>> 0;
        ch();
      };
      cb.addEventListener("change", () => {
        snap();
        if (cb.checked) st.c[k] = v;
        else delete st.c[k];
        col.disabled = al.disabled = !cb.checked;
        ch();
        renderSide();
      });
      for (const x of [col, al]) x.addEventListener("focus", snap), x.addEventListener("input", setv);
      return h("div", { class: "sty-row" }, cb, h("span", { class: "nm", text: k, title: "GOOME_S_" + k.toUpperCase() }), col, al);
    };
    const numOv = (k) => {
      const on = st.n[k] != null;
      const cb = h("input", { type: "checkbox", checked: on, title: "override " + k });
      const inp = GM.THEME_ENUMS[k]
        ? h("select", { class: "in", disabled: !on }, GM.THEME_ENUMS[k].map((nm, i) => h("option", { value: i, text: nm, selected: ((on ? st.n[k] : eff[k]) | 0) === i })))
        : h("input", { class: "in", type: "number", step: GM.SIZE_RANGE[k][2], value: on ? st.n[k] : eff[k], disabled: !on });
      cb.addEventListener("change", () => {
        snap();
        if (cb.checked) st.n[k] = +inp.value || 0;
        else delete st.n[k];
        inp.disabled = !cb.checked;
        ch();
        renderSide();
      });
      inp.addEventListener("focus", snap);
      inp.addEventListener(GM.THEME_ENUMS[k] ? "change" : "input", () => ((st.n[k] = +inp.value || 0), ch()));
      return h("div", { class: "sty-row sz" }, cb, h("span", { class: "nm", text: k, title: "GOOME_S_" + k.toUpperCase() }), inp);
    };
    for (const g of GM.THEME_GROUPS) {
      const keys = g.keys.filter((k) => !GM.THEME_FONTS.includes(k));
      const nOn = keys.filter((k) => (GM.THEME_COLORS.includes(k) ? st.c[k] != null : st.n[k] != null)).length;
      const d = h("details", { class: "th-grp", open: !!S.styGrp[g.id] || nOn > 0 });
      d.addEventListener("toggle", () => (S.styGrp[g.id] = d.open));
      d.appendChild(h("summary", { text: g.name + (nOn ? " (" + nOn + ")" : "") }));
      for (const k of keys) d.appendChild(GM.THEME_COLORS.includes(k) ? colorOv(k) : numOv(k));
      box.appendChild(d);
    }
    box.appendChild(h("div", { class: "sec", text: "Corners (goome_ui_push_radii)" }));
    const rOn = Array.isArray(st.radii);
    const rcb = h("input", { type: "checkbox", checked: rOn });
    rcb.addEventListener("change", () => {
      snap();
      if (rcb.checked) {
        const r = st.n.radius != null ? st.n.radius : eff.radius;
        st.radii = [r, r, r, r];
      } else delete st.radii;
      ch();
      renderSide();
    });
    box.appendChild(h("label", { class: "chk" }, rcb, h("span", { text: "Set each corner" })));
    if (rOn) {
      S.radLink = S.radLink || {};
      const linked = S.radLink[n.id + which] !== false;
      const ins = [];
      const names = ["top left", "top right", "bottom right", "bottom left"];
      const grid = h("div", { class: "rad-grid" });
      st.radii.forEach((v, i) => {
        const inp = h("input", { class: "in", type: "number", min: 0, step: 1, value: v, title: names[i] });
        inp.addEventListener("focus", snap);
        inp.addEventListener("input", () => {
          const x = Math.max(0, +inp.value || 0);
          if (S.radLink[n.id + which] !== false) {
            st.radii = [x, x, x, x];
            ins.forEach((o) => o !== inp && (o.value = x));
          } else st.radii[i] = x;
          ch();
        });
        ins.push(inp);
        grid.appendChild(A.fieldBase(names[i], inp));
      });
      const link = h("button", { class: "btn sm" + (linked ? " pri" : ""), title: linked ? "linked, all 4 move together" : "unlinked, each corner on its own", onclick: () => ((S.radLink[n.id + which] = !linked), renderSide()) }, linked ? "Linked" : "Unlinked");
      box.appendChild(h("div", { class: "row", style: { alignItems: "flex-end", flexWrap: "nowrap" } }, h("div", { class: "grow" }, grid), link));
      const prev = h("div", { class: "rad-prev", style: { borderRadius: st.radii.map((x) => x + "px").join(" ") } });
      box.appendChild(prev);
    }
    if (cnt) box.appendChild(h("button", { class: "btn sm bad", style: { marginTop: "8px" }, onclick: () => {
      snap();
      if (which === "all") delete n.style;
      else delete n.slotStyle[which];
      changed();
    } }, icon("trash"), "Clear the style"));
  }
  function numAbs(n, k, label) {
    const inp = h("input", { class: "in", type: "number", value: n.abs[k] || 0, min: k === "w" || k === "h" ? 0 : undefined });
    bindIn(inp, null, (v) => (n.abs[k] = Math.max(k === "w" || k === "h" ? 0 : -1e9, +v || 0)));
    return fieldBase(label || k.toUpperCase(), inp);
  }

  function elProps(body, n, parent) {
    const def = A.elDef(n.p.el);
    const add = (x) => body.appendChild(x);
    add(fieldBase("Element", h("select", { class: "in", onchange: (e) => {
      snap();
      n.p.el = e.target.value;
      n.p.params = {};
      n.p.init = {};
      changed();
    } }, P().elements.map((d) => h("option", { value: d.id, text: d.name, selected: d.id === n.p.el })))));
    add(fVar(n, "Instance variable"));
    if (!def) return;
    if (!parent && P().mode === "overlay") {
      add(h("div", { class: "fld2" }, fNum(n, "x", "X"), fNum(n, "y", "Y")));
      add(h("div", { class: "fld2" }, fNum(n, "w", "Width", { hint: "0 = " + def.w, reset: true }), fNum(n, "h", "Height", { hint: "0 = " + def.h, reset: true })));
    }
    const resetEl = () => delete S.pv["el:" + n.id];
    if (def.params.length) {
      add(h("div", { class: "sec", text: "Params" }));
      for (const pr of def.params) {
        const cur = pr.name in n.p.params ? n.p.params[pr.name] : pr.def;
        let ctrl;
        if (pr.type === "bool") {
          ctrl = h("input", { type: "checkbox", checked: !!cur });
          bindIn(ctrl, null, (v) => ((n.p.params[pr.name] = !!v), resetEl()), { ev: "change" });
          add(h("label", { class: "chk" }, ctrl, h("span", { text: pr.name })));
          continue;
        }
        if (pr.type === "color") {
          const tmp = { p: { c: cur >>> 0 }, id: n.id };
          const f = fColorP(tmp, "c", pr.name);
          f.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => setTimeout(() => ((n.p.params[pr.name] = tmp.p.c), resetEl(), changed({ noSide: true })))));
          f.querySelectorAll("input").forEach((i) => i.addEventListener("change", () => setTimeout(() => ((n.p.params[pr.name] = tmp.p.c), resetEl(), changed({ noSide: true })))));
          add(f);
          continue;
        }
        ctrl = h("input", { class: "in", type: pr.type === "num" ? "number" : "text", value: cur, step: "any" });
        bindIn(ctrl, null, (v) => ((n.p.params[pr.name] = pr.type === "num" ? +v || 0 : v), resetEl()));
        add(fieldBase(pr.name, ctrl));
      }
    }
    if (def.state.length) {
      add(h("div", { class: "sec", text: "Starting state" }));
      for (const st of def.state) {
        const cur = st.name in n.p.init ? n.p.init[st.name] : st.def;
        if (st.type === "bool") {
          const c = h("input", { type: "checkbox", checked: !!cur });
          bindIn(c, null, (v) => ((n.p.init[st.name] = !!v), resetEl()), { ev: "change" });
          add(h("label", { class: "chk" }, c, h("span", { text: st.name })));
        } else {
          const c = h("input", { class: "in", type: "number", value: cur, step: "any" });
          bindIn(c, null, (v) => ((n.p.init[st.name] = +v || 0), resetEl()));
          add(fieldBase(st.name, c));
        }
      }
    }
    add(h("div", { class: "row", style: { marginTop: "8px" } }, h("button", { class: "btn", onclick: () => editElement(def) }, icon("edit"), "Edit " + def.name)));
        add(h("p", { class: "muted", text: "exported as goome_ui_custom + goome_ui_canvas + goome_ui_store, so the drag, hover and click bits are real code." }));
  }

  function multiProps(body, sel) {
    body.appendChild(h("div", { class: "sec", text: sel.length + " picked" }));
    body.appendChild(h("div", { class: "row" },
      h("button", { class: "btn", onclick: copySel }, icon("copy"), "Copy"),
      h("button", { class: "btn", onclick: duplicate }, "Duplicate"),
      h("button", { class: "btn bad", onclick: removeSel }, icon("trash"), "Delete")));
    const free = sel.filter((i) => i.n.type === "window" || (i.n.type === "el" && !i.parent) || i.n.abs);
    if (free.length > 1) {
      const pos = (n) => (n.abs ? n.abs : n.p);
      const sz = (n) => {
        const el = $('#stageWrap [data-nid="' + n.id + '"]');
        return el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 0, h: 0 };
      };
      const align = (fn) => () => {
        snap();
        fn(free.map((i) => i.n));
        changed();
      };
      body.appendChild(h("div", { class: "sec", text: "Line them up" }));
      body.appendChild(h("div", { class: "row" },
        h("button", { class: "btn", onclick: align((ns) => { const x = Math.min(...ns.map((n) => pos(n).x)); ns.forEach((n) => (pos(n).x = x)); }) }, icon("alignl"), "Left"),
        h("button", { class: "btn", onclick: align((ns) => { const y = Math.min(...ns.map((n) => pos(n).y)); ns.forEach((n) => (pos(n).y = y)); }) }, icon("alignt"), "Top"),
        h("button", { class: "btn", onclick: align((ns) => { const c = ns.reduce((a, n) => a + pos(n).x + sz(n).w / 2, 0) / ns.length; ns.forEach((n) => (pos(n).x = Math.round(c - sz(n).w / 2))); }) }, "Center"),
        h("button", { class: "btn", onclick: align((ns) => {
          const s = ns.slice().sort((a, b) => pos(a).x - pos(b).x);
          const total = s.reduce((a, n) => a + sz(n).w, 0), x0 = pos(s[0]).x, x1 = pos(s[s.length - 1]).x + sz(s[s.length - 1]).w;
          const gap = (x1 - x0 - total) / Math.max(1, s.length - 1);
          let x = x0;
          s.forEach((n) => ((pos(n).x = Math.round(x)), (x += sz(n).w + gap)));
        }) }, "Spread")));
    }
    body.appendChild(h("p", { class: "muted", text: "shift or ctrl click to pick more, or turn on Pick many above the canvas." }));
  }

  function projectProps(body) {
    const p = P(), add = (x) => body.appendChild(x);
    add(h("div", { class: "sec", text: "Project" }));
    const nm = h("input", { class: "in", value: p.name });
    nm.addEventListener("focus", snap);
    nm.addEventListener("input", () => ((p.name = nm.value), changed({ noSide: true, noStage: true })));
    add(fieldBase("Name", nm, "used for the file names"));
    const tt = h("input", { class: "in", value: p.title });
    tt.addEventListener("focus", snap);
    tt.addEventListener("input", () => ((p.title = tt.value), changed({ noSide: true })));
    add(fieldBase(p.mode === "app" ? "Window title" : "Overlay title", tt));
    add(h("div", { class: "sec", text: "Mode" }));
    add(h("div", { class: "seg" }, ["overlay", "app"].map((m) => h("button", { class: p.mode === m ? "on" : "", onclick: () => setMode(m), text: m === "app" ? "App window" : "Overlay" }))));
    add(h("p", { class: "muted", text: p.mode === "app" ? "a normal window with goome_ui_app filling it." : "a see-through overlay, only the windows take clicks." }));
    if (p.mode === "app") {
      const ap = { p: p.app, id: "app" };
      add(h("div", { class: "fld2" }, fNum(ap, "w", "Width"), fNum(ap, "h", "Height")));
      add(h("div", { class: "sec", text: "App root" }));
      add(fBool(ap, "titlebar", "GOOME_APP_TITLEBAR, goome draws the title bar"));
      add(fBool(ap, "menubar", "GOOME_APP_MENUBAR"));
      add(fBool(ap, "statusbar", "GOOME_APP_STATUSBAR", { side: true }));
      if (p.app.statusbar) add(fText(ap, "status", "Status text"));
      add(fBool(ap, "nopad", "GOOME_APP_NO_PAD"));
    }
    add(h("div", { class: "sec", text: "Grid" }));
    const g = { p: p.grid, id: "grid" };
    add(fBool(g, "snap", "Snap moves to the grid"));
    add(fBool(g, "show", "Show the grid"));
    add(fNum(g, "size", "Grid size", { min: 2 }));
    add(h("div", { class: "sec", text: "Keys" }));
    add(h("p", { class: "muted", style: { fontSize: "12px", lineHeight: "1.6" }, text: "ctrl+z undo, ctrl+y redo, ctrl+c copy, ctrl+v paste, ctrl+d duplicate, del delete, arrows nudge pinned stuff, shift+click picks more" }));
  }

  function setMode(m) {
    if (P().mode === m) return;
    snap();
    P().mode = m;
    if (m === "overlay") {
      const loose = P().root.filter((n) => n.type !== "window" && n.type !== "el");
      if (loose.length) {
        const w = GM.newNode("window", P());
        w.p.label = P().title || "Window";
        w.kids[0] = loose;
        loose.forEach((n) => delete n.abs);
        P().root = P().root.filter((n) => !loose.includes(n));
        P().root.unshift(w);
        note("put the app content in a window");
      }
    }
    changed();
    renderPalette();
    renderTop();
  }

  const TABS = { props: "Edit", layers: "Layers", vars: "Vars", theme: "Theme", elements: "Elements" };
  function renderSide() {
    const body = $("#sideBody");
    const keep = body.scrollTop;
    body.textContent = "";
    document.querySelectorAll("#sideTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    $("#sideTitle").textContent = TABS[S.tab];
    if (S.tab === "props") renderProps(body);
    else if (S.tab === "layers") renderLayers(body);
    else if (S.tab === "theme") A.renderTheme(body);
    else if (S.tab === "vars") A.renderVars(body);
    else if (S.tab === "elements") renderElements(body);
    body.scrollTop = keep;
  }
  function openTab(t) {
    S.tab = t;
    renderSide();
    if (A.isMobile()) mpanel(t);
  }

  function renderElements(body) {
    if (window.GMEl && GMEl.library) GMEl.library(body, P(), elHooks());
    else body.appendChild(h("p", { class: "muted", text: "element library didnt load" }));
  }
  function editElement(def) {
    S.editing = def.id;
    S.sel = [];
    if (A.isMobile()) mpanel(null);
    A.renderStage();
    renderSide();
  }
  function elHooks() {
    return {
      commit() {
        snap();
      },
      changed() {
        for (const k in S.pv) if (k.startsWith("el:")) delete S.pv[k];
        A.save();
        A.scheduleCode();
        A.updateUndoPublic && A.updateUndoPublic();
        renderPalette();
        if (!S.editing) A.renderStage();
        if (S.tab === "props" || S.tab === "layers") renderSide();
      },
      add(def) {
        addNew({ kind: "new", type: "el", def: def.id });
        if (S.editing) S.editing = null, A.renderStage();
        note("added " + def.name);
      },
      edit(def) {
        editElement(def);
      },
      back() {
        S.editing = null;
        A.renderStage();
        renderSide();
        renderPalette();
      },
      widgetProps(node, container) {
        const keep = S.sel;
        const tmp = h("div");
        S.sel = [];
        renderWidgetForm(node, tmp);
        S.sel = keep;
        container.appendChild(tmp);
      },
      renderFlow(nodes) {
        const d = h("div", { class: "gm" });
        A.applyVars(d, P().theme);
        d.style.padding = "10px";
        d.style.background = GM.argbCss(P().theme.panel);
        d.style.borderRadius = P().theme.radius + "px";
        d.appendChild(A.renderSlot(nodes, null, 0, { inEl: true, kp: "ed:", rootType: "el", modals: [] }));
        return d;
      },
    };
  }
  function renderWidgetForm(node, box) {
    const types = ["label", "heading", "wrapped", "button", "checkbox", "toggle", "slider", "slider_int", "input", "combo", "color", "progress", "separator", "space", "same_line"];
    const s = h("select", { class: "in" }, types.map((t) => h("option", { value: t, text: GM.TYPES[t].name, selected: node.type === t })));
    s.addEventListener("change", () => {
      snap();
      const fresh = GM.newNode(s.value, null);
      node.type = fresh.type;
      node.p = fresh.p;
      elHooks().changed();
      box.textContent = "";
      renderWidgetForm(node, box);
    });
    box.appendChild(fieldBase("Widget", s));
    const p = node.p;
    const simple = (k, label, num) => {
      const inp = h("input", { class: "in", type: num ? "number" : "text", value: p[k], step: "any" });
      inp.addEventListener("focus", snap);
      inp.addEventListener("input", () => {
        p[k] = num ? +inp.value || 0 : inp.value;
        if (k === "var") p[k] = GM.ident(inp.value);
        elHooks().changed();
      });
      box.appendChild(fieldBase(label, inp));
    };
    if ("label" in p) simple("label", "Label");
    if ("var" in p) simple("var", "Variable (lives in the elements state)");
    if ("min" in p) simple("min", "Min", true), simple("max", "Max", true), simple("value", "Start", true);
    if ("items" in p) simple("items", "Items (one per line)");
    if ("text" in p) simple("text", "Starting text");
    if ("px" in p) simple("px", "Pixels", true);
    if (node.type === "progress") simple("value", "Value", true);
  }

  function mpanel(which) {
    S.mpanel = which;
    $("#pal").classList.toggle("open", which === "pal");
    $("#side").classList.toggle("open", !!which && which !== "pal" && which !== "code");
    $("#dock").classList.toggle("open", which === "code");
    document.querySelectorAll("#mnav button").forEach((b) => b.classList.toggle("on", b.dataset.m === which));
    if (which && which !== "pal" && which !== "code") {
      S.tab = which;
      renderSide();
    }
    if (which === "code") A.renderDock();
  }

  function renderTop() {
    document.querySelectorAll("#modeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === P().mode));
    $("#gridBtn").classList.toggle("pri", !!P().grid.snap);
  }

  Object.assign(A, { renderPalette, renderSide, renderTop, startDrag, removeSel, duplicate, shift, copySel, paste, moveOut, addNew, mpanel, openTab, setMode, elHooks, editElement, parseColor, fieldBase, nodeName });
})();
