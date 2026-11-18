(function () {
  const KEY = "gm-uibuilder-project-v2";
  const ICONS = {
    undo: "M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
    redo: "m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
    grid: "M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16",
    file: "M4 5.5h5.5l2 2H20v11H4z",
    x: "M6 6l12 12M18 6 6 18",
    up: "m6 14 6-6 6 6",
    down: "m6 10 6 6 6-6",
    copy: "M8 8h11v11H8zM5 16V5h11",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
    move: "M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
    grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
    plus: "M12 5v14M5 12h14",
    out: "M15 6 9 12l6 6",
    chevr: "m9 6 6 6-6 6",
    chevd: "m6 9 6 6 6-6",
    dl: "M12 4v11M7 10l5 5 5-5M5 20h14",
    ul: "M12 20V9M7 14l5-5 5 5M5 4h14",
    edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    layers: "m12 4 8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
    brush: "M14 4l6 6-8 8H6v-6zM4 20h4",
    box: "M4 6h16v12H4zM8 6v12",
    code: "m9 8-5 4 5 4M15 8l5 4-5 4",
    pin: "M12 3v6M8 9h8l-1 5H9zM12 14v7",
    alignl: "M4 4v16M8 7h10M8 12h6M8 17h12",
    alignt: "M4 4h16M7 8v10M12 8v6M17 8v12",
    gear: "M10.72 5.73L10.88 3.47A8.6 8.6 0 0 1 13.12 3.47L13.28 5.73A6.4 6.4 0 0 1 15.53 6.66L17.24 5.18A8.6 8.6 0 0 1 18.82 6.76L17.34 8.47A6.4 6.4 0 0 1 18.27 10.72L20.53 10.88A8.6 8.6 0 0 1 20.53 13.12L18.27 13.28A6.4 6.4 0 0 1 17.34 15.53L18.82 17.24A8.6 8.6 0 0 1 17.24 18.82L15.53 17.34A6.4 6.4 0 0 1 13.28 18.27L13.12 20.53A8.6 8.6 0 0 1 10.88 20.53L10.72 18.27A6.4 6.4 0 0 1 8.47 17.34L6.76 18.82A8.6 8.6 0 0 1 5.18 17.24L6.66 15.53A6.4 6.4 0 0 1 5.73 13.28L3.47 13.12A8.6 8.6 0 0 1 3.47 10.88L5.73 10.72A6.4 6.4 0 0 1 6.66 8.47L5.18 6.76A8.6 8.6 0 0 1 6.76 5.18L8.47 6.66A6.4 6.4 0 0 1 10.72 5.73ZM14.5 12a2.5 2.5 0 1 0 -5 0a2.5 2.5 0 1 0 5 0",
    vars: "M7 4c-2 0-2 2-2 4s-1 4-2 4c1 0 2 2 2 4s0 4 2 4M17 4c2 0 2 2 2 4s1 4 2 4c-1 0-2 2-2 4s0 4-2 4M10 9l4 6M14 9l-4 6",
  };
  const icon = (name, cls = "ico") => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", cls);
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[name] || "");
    s.appendChild(p);
    return s;
  };
  const svgRaw = (inner, vb, cls) => {
    const d = document.createElement("span");
    d.innerHTML = '<svg viewBox="' + vb + '"' + (cls ? ' class="' + cls + '"' : "") + ">" + inner + "</svg>";
    return d.firstChild;
  };
  const CHEV = () => svgRaw('<path d="M2 3.5 5 6.5 8 3.5"/>', "0 0 10 10");
  const TICK = (cls) => svgRaw('<path d="M2.5 6.2 5 8.6 9.6 3.4"/>', "0 0 12 12", cls);
  const XS = () => svgRaw('<path d="M1 1l8 8M9 1 1 9"/>', "0 0 10 10");

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "text") el.textContent = v;
        else if (k in el && typeof v !== "string") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    return el;
  }
  const $ = (s, el = document) => el.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

  let toastTimer = 0;
  function note(msg) {
    let t = $(".toastx");
    if (!t) document.body.appendChild((t = h("div", { class: "toastx" })));
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.style.display = "none"), 2200);
  }

  const S = {
    project: null, sel: [], tab: "props", lang: "c", dock: true, editing: null, pv: {}, clip: null,
    undo: [], redo: [], lastSnap: "", collapsed: {}, multi: false, mpanel: null,
  };
  try {
    S.lang = localStorage.getItem("gm-uibuilder-lang") || "c";
    S.clip = JSON.parse(localStorage.getItem("gm-uibuilder-clip") || "null");
  } catch (e) {}

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return GM.normProject(JSON.parse(raw));
    } catch (e) {}
    return GM.starterProject();
  }
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S.project));
      } catch (e) {
        note("couldnt save to this browser, export the project to keep it");
      }
    }, (S.settings && +S.settings.autosave) || 250);
  }

  function snap() {
    const j = JSON.stringify(S.project);
    if (j === S.lastSnap) return;
    S.undo.push(j);
    if (S.undo.length > 120) S.undo.shift();
    S.redo = [];
    S.lastSnap = j;
    updateUndo();
  }
  function settle() {
    S.lastSnap = JSON.stringify(S.project);
  }
  function undo() {
    const cur = JSON.stringify(S.project);
    while (S.undo.length) {
      const j = S.undo.pop();
      if (j === cur) continue;
      S.redo.push(cur);
      S.project = GM.normProject(JSON.parse(j));
      S.lastSnap = j;
      afterLoad();
      return;
    }
    note("nothing to undo");
  }
  function redo() {
    const j = S.redo.pop();
    if (!j) return note("nothing to redo");
    S.undo.push(JSON.stringify(S.project));
    S.project = GM.normProject(JSON.parse(j));
    S.lastSnap = j;
    afterLoad();
  }
  function afterLoad() {
    const idx = GM.index(S.project);
    S.sel = S.sel.filter((id) => idx.has(id));
    if (S.editing && !S.project.elements.find((e) => e.id === S.editing)) S.editing = null;
    save();
    BOOT.renderAll();
  }
  function updateUndo() {
    $("#undoBtn").disabled = !S.undo.length;
    $("#redoBtn").disabled = !S.redo.length;
  }

  function changed(o = {}) {
    save();
    if (!o.noStage) BOOT.renderStage();
    if (!o.noSide) BOOT.renderSide();
    BOOT.scheduleCode();
    updateUndo();
  }

  function findNode(id) {
    return GM.index(S.project).get(id);
  }
  function primary() {
    return S.sel.length ? findNode(S.sel[S.sel.length - 1]) : null;
  }
  function elDef(id) {
    return S.project.elements.find((e) => e.id === id);
  }

  function themeVars(t) {
    const fs = t.font_size > 0 ? t.font_size : 15, lh = Math.round(fs * 1.3), em = Math.max(1, fs / 15);
    const fh = t.item_h > 0 ? Math.round(t.item_h) : Math.round(lh + Math.max(6, t.pad * 1.2));
    const c = GM.argbCss, f = GM.fade, m = GM.mix, solid = (x) => (x | 0xFF000000) >>> 0;
    const ms = (x) => (x >= 0 ? x : t.anim_ms) + "ms", or = (x, d) => (x > 0 ? x : d) + "px", hs = t.heading_size > 0 ? t.heading_size : Math.round(fs * 1.3);
    const al = ["", "left", "center", "right"][t.align | 0], jc = { left: "flex-start", center: "center", right: "flex-end" }[al];
    const v = {
      "--fs": fs + "px", "--lh": lh + "px", "--fh": fh + "px", "--em": em, "--r": t.radius + "px", "--pad": t.pad + "px", "--gap": t.gap + "px",
      "--bw": t.border_width + "px", "--blur": t.shadow_blur + "px", "--anim": t.anim_ms + "ms", "--tbar": or(t.win_title_h, fh + 6), "--bpad": Math.round(t.pad * 1.3) + "px",
      "--cb": Math.round((t.check_size || 18) * em) + "px", "--sw": Math.round((t.toggle_w || 38) * em) + "px", "--sh": Math.round((t.toggle_h || 22) * em) + "px", "--fs-h": hs + "px",
      "--lh-h": Math.round(hs * 1.362) + "px", "--fs-s": or(t.small_size, Math.round(fs * 0.93)), "--cbr": (t.check_radius >= 0 ? t.check_radius : 5) + "px",
      "--slh": Math.round((t.slider_h || 22) * em) + "px", "--slt": (t.slider_track || 6) + "px", "--kn": Math.round((t.knob_size || 8) * 2 * em) + "px",
      "--tabh": or(t.tab_h, fh + 6), "--mih": or(t.menu_item_h, lh + 9), "--mbh": or(t.menubar_h, lh + 14), "--sbh": or(t.statusbar_h, lh + 10), "--ath": or(t.app_title_h, lh + 20),
      "--ind": Math.round((t.indent >= 0 ? t.indent : 16) * em) + "px", "--sepw": (t.sep_w >= 0 ? t.sep_w : 1) + "px", "--shx": (+t.shadow_x || 0) + "px", "--shy": (t.shadow_y == null ? 5 : +t.shadow_y) + "px",
      "--scw": (t.scroll_w || 4) + "px", "--focw": (t.focus_w >= 0 ? t.focus_w : 2) + "px", "--tipr": (t.tip_radius >= 0 ? t.tip_radius : 8) + "px", "--tippad": (t.tip_pad_y >= 0 ? t.tip_pad_y : 7) + "px " + (t.tip_pad_x >= 0 ? t.tip_pad_x : 10) + "px",
      "--grip": (t.grip || 18) + "px", "--caretw": (t.caret_w > 0 ? t.caret_w : 1) + "px",
      "--anim-hover": ms(t.hover_ms), "--anim-press": ms(t.press_ms), "--anim-pop": ms(t.popup_ms), "--anim-coll": ms(t.collapse_ms), "--anim-toast": ms(t.toast_fade_ms),
      "--ease": ["ease", "linear", "ease-out", "ease-in-out", "cubic-bezier(.34, 1.56, .64, 1)"][t.ease | 0] || "ease",
      "--jc-btn": jc || "center", "--al-txt": al || "left",
      "--g-caret": c(t.caret || t.accent), "--g-link": c(t.link || t.accent), "--g-badge": c(t.badge || t.accent), "--g-danger": c(t.danger || 0xFFE5534B), "--g-knob": c(t.knob || 0xFFFFFFFF),
      "--g-modaldim": t.dim ? c(t.dim) : "rgba(0, 0, 0, .45)", "--gap-h": Math.round(t.gap * 0.5) + "px", "--pr": Math.min(t.radius, (lh + 6) / 2) + "px",
      "--g-text": c(t.text), "--g-dim": c(t.text_dim), "--g-panel": c(t.panel), "--g-border": c(t.border), "--g-acc": c(t.accent), "--g-acctext": c(t.accent_text),
      "--g-hover": c(t.hover), "--g-active": c(t.active), "--g-input": c(t.input_bg), "--g-shadow": c(t.shadow),
      "--g-titlebg": c(f(t.text, 0.04)), "--g-border2": c(f(t.text_dim, 0.35)), "--g-chkline": c(f(t.text_dim, 0.75)), "--g-tglline": c(f(t.text_dim, 0.35)),
      "--g-knobring": c(f(t.text, 0.12)), "--g-pressring": c(f(t.accent, 0.22)), "--g-focus": c(t.focus || f(t.accent, 0.28)), "--g-dim50": c(f(t.text_dim, 0.5)),
      "--g-selbg": c(t.select || f(t.accent, 0.32)), "--g-popbg": c(m(solid(t.panel), solid(t.hover), 0.22)), "--g-shadow50": c(f(t.shadow, 0.5)), "--g-shadow140": c(f(t.shadow, 1.4)),
      "--g-hover80": c(f(t.hover, 0.8)), "--g-hover70": c(f(t.hover, 0.7)), "--g-hover40": c(f(t.hover, 0.4)), "--g-selbg16": c(f(t.accent, 0.16)),
      "--g-seltext": c(m(t.text, t.accent, 0.6)), "--g-selhov": c(m(f(t.accent, 0.16), t.hover, 0.4)), "--g-collbg": c(f(t.input_bg, 0.7)), "--g-treeline": c(f(t.text_dim, 0.28)),
      "--g-scrollbg": c(f(t.input_bg, 0.55)), "--g-scroll": c(f(t.text, 0.25)), "--g-splitbg": c(f(t.input_bg, 0.45)), "--g-panelsolid": c(solid(t.panel)),
      "--g-tablebg": c(f(t.input_bg, 0.55)), "--g-tablehead": c(m(solid(t.panel), solid(t.input_bg), 0.6)), "--g-stripe": c(f(t.text, 0.035)), "--g-border70": c(f(t.border, 0.7)),
      "--g-plotbg": c(f(t.input_bg, 0.8)), "--g-imgbg": c(f(t.text_dim, 0.25)), "--g-mbbg": c(f(t.input_bg, 0.6)), "--g-modalbg": c(m(solid(t.panel), solid(t.hover), 0.12)),
      "--g-toastbg": c(t.toast || m(solid(t.panel), solid(t.hover), 0.3)), "--g-tipbg": c(t.tooltip || solid(m(t.bg, t.hover, 0.35))), "--g-acc18": c(f(t.accent, 0.18)), "--g-bgsolid": c(solid(t.bg)),
      "--g-griptone": c(f(t.text_dim, 0.5)),
    };
    if (t.icons) for (const k of ["slider_knob", "toggle_knob", "radio_dot", "resize", "check"]) if (t.icons[k]) v["--ico-" + k.replace(/_/g, "-")] = 'url("' + t.icons[k].img + '")';
    for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS || [])) {
      const s = t[k];
      const nm = k.slice(5);
      if (s && s.img) {
        v["--skin-" + nm] = 'url("' + s.img + '") ' + s.t + " " + s.r + " " + s.b + " " + s.l + " fill / " + s.t + "px " + s.r + "px " + s.b + "px " + s.l + "px stretch";
        v["--skin-" + nm + "-w"] = s.t + "px " + s.r + "px " + s.b + "px " + s.l + "px";
        v["--skin-" + nm + "-pad"] = Math.min(s.l, s.r) + "px";
      }
    }
    return v;
  }
  function applyVars(el, t) {
    const v = themeVars(t);
    for (const k in v) el.style.setProperty(k, v[k]);
    for (const k of ["slider_knob", "toggle_knob", "radio_dot", "resize"]) el.classList.toggle("ico-" + k, !!(t.icons && t.icons[k]));
    el.classList.toggle("ico-raw", !!t.icon_tint);
    for (const k of GM.EXTRA_SKINS || []) el.classList.toggle(k.replace(/_/g, "-"), !!(t[k] && t[k].img));
  }

  function pvGet(n, kp = "") {
    const key = kp + n.id;
    let v = S.pv[key];
    if (v) return n.p && n.p.bind && BOOT.boundPv ? BOOT.boundPv(n, v) : v;
    const p = n.p;
    v = {};
    switch (n.type) {
      case "checkbox": case "toggle": v.on = !!p.on; break;
      case "radio": case "combo": case "selectable": case "tabs": v.sel = +p.sel || 0; break;
      case "slider": case "slider_int": v.v = +p.value || 0; break;
      case "input": case "text_edit": v.text = String(p.text || ""); break;
      case "collapsing": case "tree": v.open = !!p.open; break;
      case "color": v.color = p.color >>> 0; break;
      case "window": v.open = true; v.collapsed = false; break;
      case "modal": v.open = false; break;
      case "menu_item": v.on = !!p.on; break;
    }
    S.pv[key] = v;
    if (p && p.bind && BOOT.boundPv) v = BOOT.boundPv(n, v);
    return v;
  }

  window.addEventListener("error", (e) => {
    if (e && e.message) console.warn(e.message);
  });

  var BOOT = { h, $, icon, svgRaw, CHEV, TICK, XS, S, note, snap, settle, changed, save, findNode, primary, elDef, themeVars, applyVars, pvGet, clamp, isMobile, undo, redo, afterLoad };
  window.GMApp = BOOT;
})();
