(function () {
  const A = window.GMApp;
  const { h, $, icon, CHEV, TICK, XS, S, pvGet, clamp } = A;
  const FILL = new Set(["toggle", "slider", "slider_int", "input", "text_edit", "combo", "selectable", "color", "progress", "table", "plot_lines", "plot_bars", "separator", "tabs", "collapsing", "tree", "scroll", "split", "menubar", "wrapped", "row", "space"]);
  let layer = null, surfaceEl = null, pops = [];

  function closePops(keep) {
    pops = pops.filter((p) => {
      if (keep && (p === keep || keep.contains(p))) return true;
      if (p._anchor) p._anchor.classList.remove("open");
      p.remove();
      return false;
    });
  }
  document.addEventListener("pointerdown", (e) => {
    if (pops.some((p) => p.contains(e.target))) return;
    if (e.target.closest && e.target.closest("[data-popper]")) return;
    closePops();
  }, true);

  function relRect(el) {
    const a = el.getBoundingClientRect(), b = layer.getBoundingClientRect();
    return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
  }
  function popAt(pop, r, side) {
    layer.appendChild(pop);
    pops.push(pop);
    const lw = layer.clientWidth, lh = layer.clientHeight, pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.x, y = r.y + r.h + 3;
    if (side === "right") (x = r.x + r.w - 3), (y = r.y - 5);
    if (side === "right" && x + pw > lw - 6) x = r.x - pw + 3;
    if (side !== "right" && y + ph > lh - 6 && r.y - ph - 3 > 0) y = r.y - ph - 3;
    pop.style.left = clamp(x, 6, Math.max(6, lw - pw - 6)) + "px";
    pop.style.top = clamp(y, 6, Math.max(6, lh - ph - 6)) + "px";
    return pop;
  }

  let tipTimer = 0, tipEl = null;
  function bindTip(el, text) {
    if (!text) return;
    el.addEventListener("pointerenter", (e) => {
      clearTimeout(tipTimer);
      const mx = e.clientX, my = e.clientY;
      tipTimer = setTimeout(() => {
        if (!layer) return;
        const b = layer.getBoundingClientRect();
        tipEl = h("div", { class: "g-tip", text });
        layer.appendChild(tipEl);
        tipEl.style.left = Math.min(mx - b.left + 14, layer.clientWidth - tipEl.offsetWidth - 4) + "px";
        tipEl.style.top = my - b.top + 20 + "px";
      }, 500);
    });
    el.addEventListener("pointerleave", () => {
      clearTimeout(tipTimer);
      if (tipEl) tipEl.remove(), (tipEl = null);
    });
  }

  function toast(text, ms) {
    let box = $(".g-toasts", layer);
    if (!box) layer.appendChild((box = h("div", { class: "g-toasts" })));
    const t = h("div", { class: "g-toast", text });
    box.prepend(t);
    setTimeout(() => t.classList.add("out"), Math.max(200, ms - 260));
    setTimeout(() => t.remove(), Math.max(200, ms));
  }

  function fieldLabel(label) {
    const shown = String(label || "").split("##")[0];
    return shown ? h("div", { class: "g-fieldlab", text: shown }) : null;
  }
  const shown = (s) => String(s == null ? "" : s).split("##")[0];
  const fmtC = (fmt, v) => {
    const m = /%([-+ 0#]*)(\d*)(?:\.(\d+))?([dfgeis%])/.exec(fmt || "%.2f");
    if (!m) return String(fmt).replace(/%%/g, "%");
    let s = m[4] === "d" || m[4] === "i" ? String(Math.round(v)) : m[4] === "g" ? String(+v.toPrecision(m[3] ? +m[3] || 1 : 6)) : m[4] === "e" ? v.toExponential(m[3] ? +m[3] : 6) : v.toFixed(m[3] ? +m[3] : 6);
    return (fmt.slice(0, m.index) + s + fmt.slice(m.index + m[0].length)).replace(/%%/g, "%");
  };
  function gi(name, fb, cls) {
    const t = S.project.theme;
    const ic = t.icons && t.icons[name];
    if (!ic) return fb(cls);
    const el = h("i", { class: "g-ico" + (cls ? " " + cls : "") + (t.icon_tint ? " raw" : "") });
    el.style.setProperty("--src", 'url("' + ic.img + '")');
    return el;
  }
  const lab = (n) => A.interp(shown(n.p.label));
  const itemsOf = (n) => {
    const v = n.p.itemsVar && GM.varById(S.project, n.p.itemsVar);
    if (v) {
      const e = S.vals && S.vals[v.name];
      return Array.isArray(e) ? e : GM.lines(v.def);
    }
    return GM.lines(n.p.items);
  };
  const vchg = (n, el, defer) => A.valueChanged && A.valueChanged(n, el, defer);
  const nums = (s) => String(s || "").split(/[\s,]+/).map(parseFloat).filter((x) => Number.isFinite(x));

  function wrap(n, ctx, el, fill) {
    el.classList.add("g-w");
    if (fill === undefined ? FILL.has(n.type) : fill) el.classList.add("g-fill");
    if (!ctx.inEl) el.dataset.nid = n.id;
    if (n.p.width > 0) {
      el.style.width = n.p.width + "px";
      el.style.flex = "none";
      el.classList.remove("g-fill");
      el.style.alignSelf = "flex-start";
    }
    bindTip(el, n.p.tooltip);
    if (S.warnIds && S.warnIds.has(n.id)) el.classList.add("has-warn");
    return el;
  }

  function renderSlot(list, owner, si, ctx, cls) {
    const pt = owner ? owner.type : ctx.rootType;
    const slot = h("div", { class: "g-slot" + (cls ? " " + cls : "") });
    if (owner && owner.slotStyle && owner.slotStyle[si] && GM.styleCount(owner.slotStyle[si])) {
      ctx = styleCtx(ctx, owner.slotStyle[si]);
      paintStyle(slot, ctx);
    }
    slot.dataset.slot = (owner ? owner.id : "root") + ":" + si;
    if (!owner && ctx.appRoot && !ctx.win) slot.dataset.absPad = ctx.absPad || 0;
    if (owner && (owner.type === "window" || owner.type === "split")) slot.dataset.exact = "1";
    if (!owner && ctx.appRoot && !ctx.win) slot.dataset.exact = "1";
    slot.dataset.ptype = pt;
    if (!list.length && !ctx.inEl) slot.classList.add("empty"), (slot.dataset.empty = pt === "menubar" ? "drop a menu here" : pt === "menu" ? "drop menu items here" : "drop widgets here");
    let line = null;
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.type === "same_line") {
        const mark = h("span", { class: "g-w", style: { display: "none" } });
        if (!ctx.inEl) mark.dataset.nid = n.id;
        mark.dataset.i = i;
        (line || slot).appendChild(mark);
        if (!line) {
          const prev = slot.lastElementChild && slot.lastElementChild.previousElementSibling;
          if (prev && prev.classList.contains("g-w") && !prev.classList.contains("g-abs")) {
            line = h("div", { class: "g-line" });
            slot.insertBefore(line, prev);
            line.appendChild(prev);
            line.appendChild(mark);
          }
        }
        continue;
      }
      const el = renderNode(n, ctx);
      if (!el) continue;
      el.dataset.i = i;
      if (n.abs && ctx.absOk) {
        const pad = +slot.dataset.absPad || 0;
        el.classList.add("g-abs");
        el.dataset.absPad = pad;
        el.style.left = n.abs.x + pad + "px";
        el.style.top = n.abs.y + pad + "px";
        if (n.abs.w > 0) el.style.width = n.abs.w + "px";
        if (n.abs.h > 0) el.style.height = n.abs.h + "px";
        if (!el.style.width && FILL.has(n.type)) el.style.width = "200px";
        slot.appendChild(el);
        continue;
      }
      if (line && list[i - 1] && list[i - 1].type === "same_line") line.appendChild(el);
      else {
        line = null;
        if (list[i + 1] && list[i + 1].type === "same_line") {
          line = h("div", { class: "g-line" });
          line.appendChild(el);
          slot.appendChild(line);
        } else slot.appendChild(el);
      }
      if (n.type === "heading" && i > 0) el.classList.add("after");
    }
    return slot;
  }

  function styleCtx(ctx, st) {
    if (!st || !GM.styleCount(st)) return ctx;
    const t = GM.styledTheme(S.project, ctx.theme || S.project.theme, st);
    return Object.assign({}, ctx, { theme: t, radii: Array.isArray(st.radii) ? st.radii : ctx.radii, styled: true });
  }
  function paintStyle(el, ctx) {
    A.applyVars(el, ctx.theme);
    if (ctx.radii) el.style.setProperty("--rads", ctx.radii.map((x) => (+x || 0) + "px").join(" "));
  }
  function renderNode(n, ctx) {
    const R = R_[n.type];
    if (!R) return null;
    const c2 = styleCtx(ctx, n.style);
    const el = R(n, c2, pvGet(n, ctx.kp || ""));
    if (el && c2 !== ctx) {
      paintStyle(el, c2);
      el.classList.add("styled");
    }
    if (el && !ctx.inEl && n.p) {
      if (n.p.showIf && !A.evalExpr(n.p.showIf, "b")) el.classList.add(S.settings && S.settings.showHidden ? "g-hidden" : "g-gone");
      if (n.p.enableIf && !A.evalExpr(n.p.enableIf, "b")) el.classList.add("g-disabled");
      if (n.on && n.on.hover && n.on.hover.length) el.addEventListener("pointerenter", () => !el.classList.contains("g-disabled") && A.fire(n, "hover", el));
    }
    return el;
  }

  function themeSkin(k) {
    const t = S.project.theme;
    return t[k] && t[k].img;
  }

  function slideDrag(track, n, st, set) {
    track.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (track.closest(".g-disabled")) return;
      track.setPointerCapture(e.pointerId);
      track.classList.add("held");
      S.dragging = true;
      const mv = (ev) => {
        const r = track.getBoundingClientRect(), kr = 8;
        set(clamp((ev.clientX - r.left - kr) / Math.max(1, r.width - 2 * kr), 0, 1));
      };
      mv(e);
      const up = () => {
        S.dragging = false;
        track.classList.remove("held");
        track.removeEventListener("pointermove", mv);
        track.removeEventListener("pointerup", up);
        track.removeEventListener("pointercancel", up);
      };
      track.addEventListener("pointermove", mv);
      track.addEventListener("pointerup", up);
      track.addEventListener("pointercancel", up);
    });
  }

  function hsv2rgb(hh, s, v) {
    const i = Math.floor(hh * 6) % 6, f = hh * 6 - Math.floor(hh * 6), p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
    return ((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)) >>> 0;
  }
  function rgb2hsv(c) {
    const r = ((c >>> 16) & 255) / 255, g = ((c >>> 8) & 255) / 255, b = (c & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hh = 0;
    if (d > 0) hh = (mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d) / 6;
    if (hh < 0) hh += 1;
    return [hh, mx > 0 ? d / mx : 0, mx];
  }
  const hexOf = (c) => ((c >>> 24) === 255 ? "#" + (c & 0xFFFFFF).toString(16).toUpperCase().padStart(6, "0") : "#" + (((c << 8) | (c >>> 24)) >>> 0).toString(16).toUpperCase().padStart(8, "0"));

  function picker(st, onSet, anchor) {
    let [hh, ss, vv] = rgb2hsv(st.color);
    let a = ((st.color >>> 24) & 255) / 255;
    const sq = h("div", { class: "sq" }), hue = h("div", { class: "hue" }), al = h("div", { class: "alpha" });
    const m1 = h("i", { class: "mk" }), m2 = h("i", { class: "mk" }), m3 = h("i", { class: "mk" });
    sq.appendChild(m1), hue.appendChild(m2), al.appendChild(m3);
    const sw = h("div", { class: "swatch" }, h("i")), info = h("span");
    const pop = h("div", { class: "g-pop g-picker" }, sq, hue, al, h("div", { class: "info" }, h("div", { class: "g-color", style: { padding: 0, height: "auto" } }, sw), info));
    const paint = () => {
      const rgb = hsv2rgb(hh, ss, vv), hueC = hsv2rgb(hh, 1, 1);
      st.color = ((Math.round(a * 255) << 24) | rgb) >>> 0;
      sq.style.background = "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, " + GM.argbCss(0xFF000000 | hueC) + ")";
      al.style.background = "linear-gradient(90deg, transparent, " + GM.argbCss(0xFF000000 | rgb) + "), repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 8px 8px";
      m1.style.left = ss * 100 + "%", (m1.style.top = (1 - vv) * 100 + "%"), (m1.style.background = GM.argbCss(0xFF000000 | rgb));
      m2.style.left = hh * 100 + "%", (m2.style.background = GM.argbCss(0xFF000000 | hueC));
      m3.style.left = a * 100 + "%", (m3.style.background = GM.argbCss(0xFF000000 | rgb));
      sw.firstChild.style.background = GM.argbCss(st.color);
      info.textContent = hexOf(st.color) + "  a " + Math.round(a * 255);
      onSet();
    };
    const drag = (el, fn) => el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        const r = el.getBoundingClientRect();
        fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1));
        paint();
      };
      mv(e);
      el.onpointermove = mv;
      el.onpointerup = () => (el.onpointermove = null);
    });
    drag(sq, (x, y) => ((ss = x), (vv = 1 - y)));
    drag(hue, (x) => (hh = Math.min(x, 0.9999)));
    drag(al, (x) => (a = x));
    paint();
    popAt(pop, relRect(anchor.querySelector(".swatch")), "below");
    pop._anchor = anchor;
    anchor.classList.add("open");
  }

  function menuPop(menu, r, side, ctx) {
    const pop = h("div", { class: "g-pop menu" });
    pop.dataset.slot = menu.id + ":0";
    pop.dataset.ptype = "menu";
    const list = menu.kids[0];
    if (!list.length) pop.appendChild(h("div", { class: "it", style: { color: "var(--g-dim)" }, text: "empty menu" }));
    list.forEach((it, i) => {
      let row;
      if (it.type === "menu_sep") row = h("hr");
      else if (it.type === "menu") {
        row = h("div", { class: "it" }, shown(it.p.label), svgArrow());
        row.addEventListener("pointerenter", () => {
          closePops(pop);
          popsUnder(pop);
          const sub = menuPop(it, relRect(row), "right", ctx);
          sub._parent = pop;
        });
      } else {
        const st = pvGet(it);
        row = h("div", { class: "it" }, it.p.check && st.on ? gi("check", TICK, "mk") : null, A.interp(shown(it.p.label)), it.p.shortcut ? h("span", { class: "sc", text: it.p.shortcut }) : null);
        row.addEventListener("click", () => {
          if (it.p.check) st.on = !st.on;
          closePops();
          A.fire(it, "click", row);
          if (it.p.check) vchg(it, row);
        });
        row.addEventListener("pointerenter", () => popsUnder(pop));
      }
      row.dataset.nid = it.id;
      row.dataset.i = i;
      row.classList.add("g-w");
      pop.appendChild(row);
    });
    return popAt(pop, r, side);
  }
  function popsUnder(pop) {
    pops = pops.filter((p) => {
      let q = p;
      while (q && q !== pop) q = q._parent;
      if (p !== pop && q === pop) {
        p.remove();
        return false;
      }
      return true;
    });
  }
  const svgArrow = () => gi("arrow_right", () => A.svgRaw('<path d="M2 1.5 6 5 2 8.5"/>', "0 0 8 10", "ar"), "ar");

  function renderMenubar(n, ctx, inApp) {
    const bar = h("div", { class: "g-menubar" + (inApp ? " app" : "") });
    bar.dataset.slot = n.id + ":0";
    bar.dataset.ptype = "menubar";
    const menus = n.kids[0];
    if (!menus.length) bar.appendChild(h("span", { style: { color: "var(--g-dim)", padding: "0 6px" }, text: "menu bar, drop menus here" }));
    menus.forEach((m, i) => {
      const b = h("div", { class: "mb g-w", text: shown(m.p.label) });
      b.dataset.nid = m.id;
      b.dataset.i = i;
      b.dataset.popper = "1";
      const open = () => {
        closePops();
        b.classList.add("open");
        const p = menuPop(m, relRect(b), "below", ctx);
        p._anchor = b;
      };
      b.addEventListener("click", () => (b.classList.contains("open") ? closePops() : open()));
      b.addEventListener("pointerenter", () => {
        if (pops.length && !b.classList.contains("open") && bar.querySelector(".mb.open")) open();
      });
      bar.appendChild(b);
    });
    return bar;
  }

  const R_ = {
    window(n, ctx, st) {
      const p = n.p;
      if (!st.open) {
        const c = h("div", { class: "g-closed", style: { left: p.x + "px", top: p.y + "px" }, text: shown(p.label) + " is closed, tap to open it", onclick: () => ((st.open = true), A.renderStage()) });
        c.dataset.nid = n.id;
        return c;
      }
      const el = h("div", { class: "g-win" + (st.collapsed ? " collapsed" : "") + (themeSkin("skin_panel") ? " skin" : "") });
      el.style.left = p.x + "px";
      el.style.top = p.y + "px";
      el.style.width = Math.max(80, p.w) + "px";
      if (p.h > 0 && !st.collapsed) el.style.height = p.h + "px";
      el.dataset.nid = n.id;
      el.dataset.canvas = "1";
      if (!p.notitle) {
        const tb = h("div", { class: "g-tbar" });
        if (p.collapse) tb.appendChild(h("div", { class: "g-chev", onclick: () => ((st.collapsed = !st.collapsed), A.renderStage()) }, gi(st.collapsed ? "expand" : "collapse", CHEV)));
        tb.appendChild(h("div", { class: "t", text: A.interp(shown(p.label)) }));
        if (p.close) tb.appendChild(h("div", { class: "g-x", onclick: () => ((st.open = false), A.renderStage()) }, gi("close", XS)));
        tb.dataset.move = n.id;
        el.appendChild(tb);
      } else el.dataset.moveSelf = "1";
      const body = h("div", { class: "g-body" });
      body.appendChild(renderSlot(n.kids[0], n, 0, Object.assign({}, ctx, { absOk: true, win: n })));
      el.appendChild(body);
      if (p.resize) {
        const g = h("div", { class: "g-grip" });
        g.dataset.resize = n.id;
        el.appendChild(g);
      }
      if (S.warnIds && S.warnIds.has(n.id)) el.classList.add("has-warn");
      return el;
    },
    row(n, ctx) {
      const k = n.p.cols > 1 ? n.p.cols : Math.max(1, n.kids[0].length);
      const s = renderSlot(n.kids[0], n, 0, ctx, "g-rowc");
      s.style.display = "grid";
      s.style.gridTemplateColumns = "repeat(" + k + ", minmax(0, 1fr))";
      s.dataset.horiz = "1";
      return wrap(n, ctx, s);
    },
    space(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-space", style: { height: Math.max(0, n.p.px - +S.project.theme.gap) + "px" } }));
    },
    separator(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-sep" }));
    },
    label(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-label", text: A.interp(String(n.p.label).replace(/%%/g, "%")) }), false);
    },
    heading(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-heading", text: lab(n) }), false);
    },
    wrapped(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-wrapped", text: A.interp(n.p.label) }));
    },
    button(n, ctx) {
      const b = h("div", { class: "g-btn" + (themeSkin("skin_button") ? " skin" : ""), text: lab(n) || " " });
      b.addEventListener("click", () => {
        if (b.closest(".g-disabled")) return;
        if (n.on && n.on.click && n.on.click.length) A.fire(n, "click", b);
        if (n.p.action === "toast") toast(n.p.toast || "", +n.p.ms || 2500);
        else if (n.p.action === "close" && ctx.modal) ((pvGet(ctx.modal).open = false), closePops(), A.renderStage());
        else if (n.p.action === "print") toast(shown(n.p.label) + " clicked (prints to the console)", 1400);
      });
      return wrap(n, ctx, b, false);
    },
    checkbox(n, ctx, st) {
      const el = h("div", { class: "g-check" + (st.on ? " on" : "") }, h("div", { class: "g-box" }, gi("check", TICK)), shown(n.p.label) ? h("span", { text: shown(n.p.label) }) : null);
      el.addEventListener("click", () => (el.classList.toggle("on", (st.on = !st.on)), vchg(n, el)));
      return wrap(n, ctx, el, false);
    },
    toggle(n, ctx, st) {
      const el = h("div", { class: "g-toggle" + (st.on ? " on" : "") }, h("span", { class: "lb", text: shown(n.p.label) }), h("div", { class: "g-sw" }));
      el.addEventListener("click", () => (el.classList.toggle("on", (st.on = !st.on)), vchg(n, el)));
      return wrap(n, ctx, el);
    },
    radio(n, ctx, st) {
      const box = h("div", { class: "g-radios" + (n.p.inline ? " inline" : "") });
      itemsOf(n).forEach((lb, i) => {
        const r = h("div", { class: "g-radio" + (st.sel === i ? " on" : "") }, h("div", { class: "g-dot" }), h("span", { text: shown(lb) }));
        r.addEventListener("click", () => {
          if (st.sel === i) return;
          st.sel = i;
          box.querySelectorAll(".g-radio").forEach((x, j) => x.classList.toggle("on", j === i));
          vchg(n, r);
        });
        box.appendChild(r);
      });
      return wrap(n, ctx, box, !n.p.inline);
    },
    slider(n, ctx, st, whole) {
      const p = n.p, lo = +p.min, hi = +p.max;
      const val = h("span", { class: "v" }), fill = h("div", { class: "g-fillbar" }), knob = h("div", { class: "g-knob" });
      const track = h("div", { class: "g-track" }, h("div", { class: "g-rail" }), fill, knob);
      const paint = () => {
        const t = hi !== lo ? clamp((st.v - lo) / (hi - lo), 0, 1) : 0;
        const pos = "calc(8px * var(--em) + (100% - 16px * var(--em)) * " + t + ")";
        knob.style.left = pos;
        fill.style.width = pos;
        val.textContent = whole ? String(Math.round(st.v)) : fmtC(p.fmt || "%.2f", st.v);
      };
      slideDrag(track, n, st, (t) => {
        const old = st.v;
        st.v = lo + t * (hi - lo);
        if (whole) st.v = Math.round(st.v);
        paint();
        if (st.v !== old) vchg(n, track, true);
      });
      const el = h("div", { class: "g-slider" }, shown(p.label) ? h("div", { class: "top" }, h("span", { text: lab(n) }), val) : null, track);
      paint();
      return wrap(n, ctx, el);
    },
    slider_int(n, ctx, st) {
      return R_.slider(n, ctx, st, true);
    },
    input(n, ctx, st) {
      const inp = h("input", { class: "g-input" + (themeSkin("skin_input") ? " skin" : ""), value: st.text, maxlength: Math.max(1, (+n.p.cap || 64) - 1), spellcheck: "false" });
      inp.addEventListener("input", () => ((st.text = inp.value), vchg(n, inp, true)));
      return wrap(n, ctx, h("div", null, fieldLabel(n.p.label), inp));
    },
    text_edit(n, ctx, st) {
      const p = n.p;
      const ta = h("textarea", { class: "g-edit" + (p.mono ? " mono" : "") + (p.wrap ? "" : " nowrap"), readOnly: !!p.readonly, spellcheck: "false" });
      ta.value = st.text;
      const hh = p.h > 0 ? p.h : 160;
      ta.style.height = hh + "px";
      ta.addEventListener("input", () => {
        st.text = ta.value;
        vchg(n, ta, true);
        if (nm) nm.textContent = ta.value.split("\n").map((_, i) => i + 1).join("\n");
      });
      let nm = null;
      if (p.numbers) {
        nm = h("div", { class: "nums", text: st.text.split("\n").map((_, i) => i + 1).join("\n") });
        ta.addEventListener("scroll", () => (nm.scrollTop = ta.scrollTop));
        nm.style.height = hh + "px";
        nm.style.overflow = "hidden";
        ta.style.borderRadius = "0 var(--r) var(--r) 0";
        return wrap(n, ctx, h("div", { class: "g-editwrap" }, nm, ta));
      }
      return wrap(n, ctx, ta);
    },
    combo(n, ctx, st) {
      const items = itemsOf(n);
      const box = h("div", { class: "g-combo" }, h("span", { text: items[st.sel] || "" }), gi("arrow_down", CHEV));
      box.dataset.popper = "1";
      box.addEventListener("click", () => {
        if (box.classList.contains("open")) return closePops();
        closePops();
        const pop = h("div", { class: "g-pop" });
        items.forEach((it, i) => {
          const row = h("div", { class: "it" + (i === st.sel ? " on" : "") }, h("span", { text: it }), i === st.sel ? gi("check", TICK, "ck") : null);
          row.addEventListener("click", () => {
            const was = st.sel;
            st.sel = i;
            box.firstChild.textContent = it;
            closePops();
            if (was !== i) vchg(n, box);
          });
          pop.appendChild(row);
        });
        box.classList.add("open");
        pop._anchor = box;
        const r = relRect(box);
        pop.style.width = r.w + "px";
        popAt(pop, r, "below");
      });
      return wrap(n, ctx, h("div", null, fieldLabel(n.p.label), box));
    },
    selectable(n, ctx, st) {
      const box = h("div", { class: "g-sels" });
      itemsOf(n).forEach((it, i) => {
        const r = h("div", { class: "g-sel" + (i === st.sel ? " on" : ""), text: shown(it) });
        r.addEventListener("click", () => {
          if (st.sel === i) return;
          st.sel = i;
          box.querySelectorAll(".g-sel").forEach((x, j) => x.classList.toggle("on", j === i));
          vchg(n, r);
        });
        box.appendChild(r);
      });
      return wrap(n, ctx, box);
    },
    color(n, ctx, st) {
      const sw = h("div", { class: "swatch" }, h("i", { style: { background: GM.argbCss(st.color) } }));
      const hx = h("span", { class: "hx", text: hexOf(st.color) });
      const el = h("div", { class: "g-color" }, sw, shown(n.p.label) ? h("span", { text: shown(n.p.label) }) : null, hx);
      el.dataset.popper = "1";
      el.addEventListener("click", (e) => {
        if (el.classList.contains("open")) return closePops();
        closePops();
        picker(st, () => {
          sw.firstChild.style.background = GM.argbCss(st.color);
          hx.textContent = hexOf(st.color);
          vchg(n, el, true);
        }, el);
      });
      return wrap(n, ctx, el);
    },
    tabs(n, ctx, st) {
      const names = itemsOf(n).slice();
      if (!names.length) names.push("Tab");
      st.sel = clamp(st.sel, 0, names.length - 1);
      const bar = h("div", { class: "g-tabs" });
      const pill = h("div", { class: "pill" });
      bar.appendChild(pill);
      const w = 100 / names.length;
      pill.style.width = "calc((100% - 6px) / " + names.length + ")";
      pill.style.left = "calc(3px + (100% - 6px) * " + st.sel / names.length + ")";
      names.forEach((nm, i) => {
        const t = h("div", { class: "tb" + (i === st.sel ? " on" : ""), text: shown(nm) });
        t.addEventListener("click", () => {
          if (st.sel === i) return;
          st.sel = i;
          vchg(n, t);
          A.renderStage();
        });
        bar.appendChild(t);
      });
      const box = h("div", { class: "g-elflow" }, bar, renderSlot(n.kids[st.sel] || [], n, st.sel, ctx));
      return wrap(n, ctx, box);
    },
    collapsing(n, ctx, st) {
      const head = h("div", { class: "g-coll" + (st.open ? " open" : "") }, gi("arrow_right", CHEV, "rot"), h("span", { text: lab(n) }));
      head.addEventListener("click", () => ((st.open = !st.open), vchg(n, head), A.renderStage()));
      return wrap(n, ctx, h("div", { class: "g-elflow" }, head, st.open ? renderSlot(n.kids[0], n, 0, ctx) : null));
    },
    tree(n, ctx, st) {
      const head = h("div", { class: "g-tree" + (st.open ? " open" : "") }, gi("arrow_right", CHEV, "rot"), h("span", { text: lab(n) }));
      head.addEventListener("click", () => ((st.open = !st.open), vchg(n, head), A.renderStage()));
      const box = h("div", { class: "g-elflow" }, head);
      if (st.open) box.appendChild(h("div", { class: "g-treekids" }, renderSlot(n.kids[0], n, 0, ctx)));
      return wrap(n, ctx, box);
    },
    scroll(n, ctx) {
      const page = !(n.p.h > 0);
      const el = h("div", { class: "g-scroll" + (page ? " page g-grow" : "") });
      if (!page) el.style.height = n.p.h + "px";
      el.appendChild(renderSlot(n.kids[0], n, 0, ctx));
      return wrap(n, ctx, el);
    },
    split(n, ctx) {
      const v = !!n.p.vertical, frac = clamp(+n.p.frac || 0.3, 0.05, 0.95);
      const root = ctx.appRoot && !ctx.win;
      const el = h("div", { class: "g-split" + (v ? " v" : "") + (root ? " root" : "") });
      const a = h("div", { class: "g-pane a" }, renderSlot(n.kids[0], n, 0, ctx));
      const b = h("div", { class: "g-pane b" }, renderSlot(n.kids[1], n, 1, ctx));
      const dv = h("div", { class: "g-div" });
      a.style.flex = "0 0 " + frac * 100 + "%";
      el.append(a, dv, b);
      if (root) el.style.height = "100%";
      else el.classList.add("g-grow");
      dv.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        A.snap();
        dv.setPointerCapture(e.pointerId);
        dv.classList.add("held");
        dv.onpointermove = (ev) => {
          const r = el.getBoundingClientRect();
          const f = v ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width;
          n.p.frac = Math.round(clamp(f, 0.08, 0.92) * 100) / 100;
          a.style.flex = "0 0 " + n.p.frac * 100 + "%";
        };
        dv.onpointerup = () => {
          dv.onpointermove = null;
          dv.classList.remove("held");
          A.changed({ noStage: true });
        };
      });
      return wrap(n, ctx, el);
    },
    progress(n, ctx, st) {
      const v = clamp(n.p.bind ? +st.v : +n.p.value, -1, 1), txt = A.interp(n.p.label);
      const el = h("div", { class: "g-progress" + (txt ? "" : " thin") });
      const fill = h("div", { class: "fill" });
      if (v < 0) {
        fill.style.width = "30%";
        fill.animate([{ left: "-30%" }, { left: "100%" }], { duration: 1600, iterations: Infinity, easing: "ease-in-out" });
      } else fill.style.width = v * 100 + "%";
      el.appendChild(fill);
      if (txt) {
        el.appendChild(h("div", { class: "tx", text: txt }));
        const over = h("div", { class: "tx over", text: txt });
        over.style.clipPath = "inset(0 " + (100 - Math.max(0, v) * 100) + "% 0 0)";
        el.appendChild(over);
      }
      return wrap(n, ctx, el);
    },
    table(n, ctx) {
      const p = n.p;
      const cols = GM.lines(p.cols).map((c) => {
        const m = /^(.*?)(?::\s*(\d+))?$/.exec(c);
        return { name: m[1].trim(), w: m[2] ? +m[2] : 0 };
      });
      const tb = h("table");
      const cg = h("colgroup");
      cols.forEach((c) => cg.appendChild(h("col", { style: c.w ? { width: c.w + "px" } : null })));
      tb.appendChild(cg);
      tb.appendChild(h("thead", null, h("tr", null, cols.map((c, i) => h("th", null, c.name, p.sortable && i === 0 ? gi("sort_down", () => A.svgRaw('<path d="M1 1.5 4 4.5 7 1.5"/>', "0 0 8 6", "ar"), "ar") : null)))));
      const body = h("tbody");
      GM.lines(p.rows).forEach((r) => {
        const cells = r.split(",").map((x) => x.trim());
        body.appendChild(h("tr", null, cols.map((_, i) => h("td", { text: cells[i] || "" }))));
      });
      tb.appendChild(body);
      const el = h("div", { class: "g-table" + (p.stripes ? " stripes" : "") + (p.borders ? " borders" : "") }, tb);
      if (p.h > 0) el.style.height = p.h + "px";
      return wrap(n, ctx, el);
    },
    plot_lines(n, ctx) {
      return plot(n, ctx, false);
    },
    plot_bars(n, ctx) {
      return plot(n, ctx, true);
    },
    image(n, ctx) {
      const el = h("div", { class: "g-img", text: n.p.w + " x " + n.p.h });
      el.style.width = n.p.w + "px";
      el.style.height = n.p.h + "px";
      el.style.setProperty("--ir", n.p.radius + "px");
      return wrap(n, ctx, el, false);
    },
    menubar(n, ctx) {
      return wrap(n, ctx, renderMenubar(n, ctx, false));
    },
    menu(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-elnote", text: "menus go in a menu bar" }));
    },
    menu_item(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-elnote", text: "menu items go in a menu" }));
    },
    menu_sep(n, ctx) {
      return wrap(n, ctx, h("div", { class: "g-sep" }));
    },
    popup(n, ctx, st) {
      const mark = wrap(n, ctx, h("div", { class: "g-popmark", title: "popup " + n.p.label }), false);
      if (st.open) ctx.popups = (ctx.popups || []).concat([n]);
      if (st.open) setTimeout(() => {
        if (!layer || !mark.isConnected) return;
        const anchor = S.popAnchor && S.popAnchor.isConnected ? S.popAnchor : mark.previousElementSibling || mark;
        const box = h("div", { class: "g-pop g-flyout" }, renderSlot(n.kids[0], n, 0, Object.assign({}, ctx, { modal: n, modals: [] })));
        box.dataset.nid = n.id;
        box._anchor = { classList: { remove() {}, add() {} } };
        popAt(box, relRect(anchor), "below");
        box.addEventListener("pointerdown", (e) => e.stopPropagation());
        const off = (e) => {
          if (box.contains(e.target)) return;
          st.open = false;
          document.removeEventListener("pointerdown", off, true);
        };
        document.addEventListener("pointerdown", off, true);
      }, 0);
      return mark;
    },
    modal(n, ctx, st) {
      const b = h("div", { class: "g-btn" + (themeSkin("skin_button") ? " skin" : ""), text: shown(n.p.button) || "Open" });
      b.addEventListener("click", () => ((st.open = true), A.renderStage()));
      const el = wrap(n, ctx, b, false);
      if (st.open) ctx.modals.push(n);
      return el;
    },
    el(n, ctx) {
      const def = A.elDef(n.p.el);
      if (!def) return wrap(n, ctx, h("div", { class: "g-elnote", text: "this element is gone from the library" }));
      if (ctx.canvasLevel) {
        const host = h("div", { class: "g-el canvas" });
        host.style.left = n.p.x + "px";
        host.style.top = n.p.y + "px";
        host.dataset.nid = n.id;
        host.dataset.canvas = "1";
        mountEl(host, def, n, ctx);
        return host;
      }
      const parts = def.parts.filter((pt) => pt.kind === "widget" && pt.w);
      const box = h("div", { class: "g-elflow" });
      if (def.parts.some((pt) => pt.kind !== "widget")) {
        const host = h("div", { class: "g-el" });
        mountEl(host, def, n, ctx);
        box.appendChild(host);
      }
      if (parts.length) box.appendChild(renderSlot(parts.map((pt) => pt.w), null, 0, Object.assign({}, ctx, { inEl: true, kp: n.id + ":", rootType: "el" })));
      return wrap(n, ctx, box, false);
    },
  };

  const mounts = [];
  function mountEl(host, def, n, ctx) {
    if (!window.GMEl || !GMEl.mount) {
      host.appendChild(h("div", { class: "g-elnote", text: "element runtime didnt load" }));
      return;
    }
    const key = "el:" + n.id;
    if (!S.pv[key] || S.pv[key]._def !== def.id) {
      S.pv[key] = GMEl.initState(def, n);
      S.pv[key]._def = def.id;
    }
    try {
      const m = GMEl.mount(host, def, n, S.pv[key], { theme: () => (ctx && ctx.theme) || S.project.theme, grid: () => S.project.grid, onChange() {}, onCommit() {}, onPrint: (t) => toast(t + " (prints to the console)", 1600) });
      mounts.push(m);
    } catch (e) {
      host.appendChild(h("div", { class: "g-elnote", text: "couldnt draw " + def.name + ": " + e.message }));
    }
  }

  function plot(n, ctx, bars) {
    const p = n.p, v = nums(p.values), hh = p.h > 0 ? p.h : 90;
    let lo = +p.min, hi = +p.max;
    if (!(hi > lo)) {
      lo = Math.min(...v, bars ? 0 : Infinity);
      hi = Math.max(...v, bars ? 0 : -Infinity);
      if (!(hi > lo)) hi = lo + 1;
    }
    const top = shown(p.label) ? h("div", { class: "top" }, h("span", { text: shown(p.label) }), h("b", { text: v.length ? String(+v[v.length - 1].toPrecision(4)) : "" })) : null;
    const box = h("div", { class: "box", style: { height: hh + "px" } });
    const W = 300, H = hh, x0 = 6, x1 = W - 6, y0 = 6, y1 = H - 6;
    const yOf = (x) => y1 - (y1 - y0) * clamp((x - lo) / (hi - lo), 0, 1);
    let svg = "";
    const acc = "var(--g-acc)";
    if (!bars) {
      for (let i = 1; i < 4; i++) svg += '<rect x="6" y="' + Math.round((H * i) / 4) + '" width="' + (W - 12) + '" height="1" fill="var(--g-text)" opacity=".05"/>';
      if (v.length > 1) {
        const pts = v.map((x, i) => (x0 + ((x1 - x0) * i) / (v.length - 1)).toFixed(1) + "," + yOf(x).toFixed(1));
        svg += '<polygon points="' + pts.join(" ") + " " + x1 + "," + H + " " + x0 + "," + H + '" fill="' + acc + '" opacity=".16"/>';
        svg += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + acc + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>';
      }
    } else if (v.length) {
      const zero = yOf(0), slot = (x1 - x0) / v.length, gap = slot > 6 ? Math.min(slot * 0.25, 8) : slot > 2 ? 1 : 0;
      if (zero > y0 && zero < y1) svg += '<rect x="4" y="' + Math.round(zero) + '" width="' + (W - 8) + '" height="1" fill="var(--g-text)" opacity=".12"/>';
      v.forEach((x, i) => {
        const y = yOf(x), top2 = Math.min(y, zero), bh = Math.max(1, Math.abs(zero - y));
        svg += '<rect x="' + (x0 + i * slot + gap / 2).toFixed(1) + '" y="' + top2.toFixed(1) + '" width="' + Math.max(1, slot - gap).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3" fill="' + acc + '"/>';
      });
    }
    box.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none">' + svg + "</svg>";
    return wrap(n, ctx, h("div", { class: "g-plot" }, top, box));
  }

  function renderModals(ctx) {
    for (const n of ctx.modals) {
      const st = pvGet(n);
      const x = h("div", { class: "mx", onclick: () => ((st.open = false), A.renderStage()) }, gi("close", XS));
      const box = h("div", { class: "g-modal" }, h("div", { class: "mh" }, h("span", { text: shown(n.p.label) }), x), renderSlot(n.kids[0], n, 0, Object.assign({}, ctx, { modal: n, modals: [] })));
      box.dataset.nid = n.id;
      const dim = h("div", { class: "g-modal-dim" }, box);
      dim.addEventListener("pointerdown", (e) => {
        if (e.target === dim) (st.open = false), A.renderStage();
      });
      layer.appendChild(dim);
    }
  }

  function renderStage() {
    const wrapEl = $("#stageWrap");
    const keepX = wrapEl.scrollLeft, keepY = wrapEl.scrollTop;
    for (const m of mounts.splice(0)) try {
      m.destroy && m.destroy();
    } catch (e) {}
    closePops();
    wrapEl.textContent = "";
    const P = S.project;
    wrapEl.classList.toggle("grid", !!(P.grid && P.grid.show));
    wrapEl.style.setProperty("--grid", (P.grid.size || 8) + "px");
    if (S.editing) {
      const def = A.elDef(S.editing);
      const box = h("div", { class: "el-editor-host" });
      wrapEl.appendChild(box);
      if (window.GMEl && GMEl.editor) GMEl.editor(box, P, def, A.elHooks());
      else box.appendChild(h("div", { class: "muted", style: { padding: "20px" }, text: "element editor didnt load" }));
      return;
    }
    if (window.GMWasm && GMWasm.stage(wrapEl)) return;
    const bar = h("div", { class: "stage-bar" });
    bar.appendChild(h("span", { text: P.mode === "app" ? "app window " + P.app.w + " x " + P.app.h : "overlay, the grey is your desktop" }));
    bar.appendChild(h("span", { class: "grow" }));
    if (S.sel.length > 1) bar.appendChild(h("span", { text: S.sel.length + " picked" }));
    bar.appendChild(h("div", { class: "seg", title: "where dropped widgets go inside a window" }, h("button", { class: S.dropMode !== "flow" ? "on" : "", onclick: () => ((S.dropMode = "exact"), renderStage()), text: "Drop exactly there" }), h("button", { class: S.dropMode === "flow" ? "on" : "", onclick: () => ((S.dropMode = "flow"), renderStage()), text: "In line" })));
    bar.appendChild(h("button", { class: "chip" + (S.multi ? " on" : ""), onclick: () => ((S.multi = !S.multi), renderStage()), title: "tap more than one thing" }, "Pick many"));
    if (window.GMWasm) bar.appendChild(GMWasm.toggle());
    wrapEl.appendChild(bar);
    const ctx = { modals: [], rootType: P.mode === "app" ? "app" : "overlay" };
    let surf;
    if (P.mode === "overlay") {
      surf = h("div", { class: "surface desk gm" });
      let mw = 600, mh = 560;
      for (const n of P.root) {
        const w = n.type === "window" ? n.p.w : n.p.w || (A.elDef(n.p.el) || {}).w || 100;
        const hh = n.type === "window" ? n.p.h || 420 : n.p.h || (A.elDef(n.p.el) || {}).h || 60;
        mw = Math.max(mw, n.p.x + w + 40);
        mh = Math.max(mh, n.p.y + hh + 40);
      }
      surf.style.width = "max(calc(100% - 48px), " + mw + "px)";
      surf.style.height = mh + "px";
      const slot = h("div", { class: "g-slot", style: { position: "absolute", inset: "0", display: "block" } });
      slot.dataset.slot = "root:0";
      slot.dataset.ptype = "overlay";
      slot.dataset.canvasRoot = "1";
      P.root.forEach((n, i) => {
        const el = renderNode(n, Object.assign({}, ctx, { canvasLevel: true }));
        if (!el) return;
        el.dataset.i = i;
        if (n.type === "el") el.style.zIndex = "0";
        slot.appendChild(el);
      });
      surf.appendChild(slot);
      surf.appendChild(h("div", { class: "desk-note", text: P.root.length ? "clicks outside the windows go to your desktop" : "drop a window here to start" }));
    } else {
      const a = P.app;
      surf = h("div", { class: "surface g-app gm" + (a.titlebar ? " round" : "") + (a.menubar ? " has-mb" : "") + (a.nopad ? " nopad" : "") });
      surf.style.width = a.w + "px";
      surf.style.maxWidth = "calc(100% - 48px)";
      surf.style.height = a.h + "px";
      surf.dataset.nid = "";
      if (a.titlebar) {
        surf.appendChild(h("div", { class: "g-atitle" }, h("span", { text: P.title }), h("div", { class: "caps" },
          h("i", null, gi("minimize", () => A.svgRaw('<path d="M1 5h8"/>', "0 0 10 10"))), h("i", null, gi("maximize", () => A.svgRaw('<path d="M1.5 1.5h7v7h-7z"/>', "0 0 10 10"))), h("i", null, gi("close", XS)))));
      }
      let rootList = P.root, mbNode = null;
      if (a.menubar) {
        mbNode = P.root.find((n) => n.type === "menubar");
        const mbz = h("div", { class: "g-amb" });
        if (mbNode) {
          const mb = renderMenubar(mbNode, ctx, true);
          mb.dataset.nid = mbNode.id;
          mb.classList.add("g-w");
          mbz.appendChild(mb);
        } else mbz.appendChild(h("div", { class: "g-menubar app" }, h("span", { style: { color: "var(--g-dim)", padding: "0 6px" }, text: "drop a menu bar on the app to fill this" })));
        surf.appendChild(mbz);
      }
      const body = h("div", { class: "g-abody" });
      const rctx = Object.assign({}, ctx, { appRoot: true, absOk: true, absPad: a.nopad ? 0 : +P.theme.pad + 4 });
      const slot = renderSlot(rootList.filter((n) => n !== mbNode && n.type !== "window"), null, 0, rctx);
      slot.querySelectorAll("[data-i]").forEach((el) => {
        if (el.closest("[data-slot]") !== slot) return;
        const k = rootList.filter((n) => n !== mbNode && n.type !== "window")[+el.dataset.i];
        el.dataset.i = rootList.indexOf(k);
      });
      const onlySplit = rootList.filter((n) => n !== mbNode && n.type !== "window");
      if (onlySplit.length === 1 && onlySplit[0].type === "split") slot.style.height = "100%";
      body.appendChild(slot);
      surf.appendChild(body);
      if (a.statusbar) surf.appendChild(h("div", { class: "g-astatus", text: A.interp(a.status || "") }));
      P.root.forEach((n, i) => {
        if (n.type !== "window") return;
        const el = renderNode(n, ctx);
        el.dataset.i = i;
        el.style.zIndex = "4";
        surf.appendChild(el);
      });
    }
    A.applyVars(surf, P.theme);
    surfaceEl = surf;
    layer = h("div", { class: "layer" });
    surf.appendChild(layer);
    wrapEl.appendChild(surf);
    renderModals(ctx);
    markSel();
    wrapEl.scrollLeft = keepX;
    wrapEl.scrollTop = keepY;
  }

  function markSel() {
    const wrapEl = $("#stageWrap");
    wrapEl.querySelectorAll(".picked,.picked2").forEach((e) => e.classList.remove("picked", "picked2"));
    $(".sel-bar", wrapEl) && $(".sel-bar", wrapEl).remove();
    if (!S.sel.length || S.editing) return;
    let last = null;
    S.sel.forEach((id, i) => {
      const el = wrapEl.querySelector('[data-nid="' + id + '"]');
      if (!el) return;
      const tgt = el.style.display === "none" ? null : el;
      if (!tgt) return;
      tgt.classList.add(i === S.sel.length - 1 ? "picked" : "picked2");
      if (i === S.sel.length - 1) last = tgt;
    });
    if (last) placeBar(last);
  }

  function placeBar(el) {
    const wrapEl = $("#stageWrap");
    const info = A.findNode(S.sel[S.sel.length - 1]);
    if (!info) return;
    const free = info.n.type === "window" || (info.n.type === "el" && !info.parent && S.project.mode === "overlay") || info.n.abs;
    const bar = h("div", { class: "sel-bar" });
    const mv = h("button", { title: free ? "drag to move" : "drag to put it somewhere else" }, icon(free ? "move" : "grip"));
    mv.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (free) startMove(e, S.sel.slice());
      else A.startDrag(e, { kind: "move", ids: S.sel.slice() });
    });
    bar.appendChild(mv);
    bar.appendChild(h("button", { title: "up", onclick: () => A.shift(-1) }, icon("up")));
    bar.appendChild(h("button", { title: "down", onclick: () => A.shift(1) }, icon("down")));
    bar.appendChild(h("button", { title: "duplicate (ctrl+d)", onclick: () => A.duplicate() }, icon("copy")));
    bar.appendChild(h("button", { title: "delete (del)", onclick: () => A.removeSel() }, icon("trash")));
    wrapEl.appendChild(bar);
    const r = el.getBoundingClientRect(), w = wrapEl.getBoundingClientRect();
    let x = r.right - w.left + wrapEl.scrollLeft - bar.offsetWidth;
    let y = r.top - w.top + wrapEl.scrollTop - bar.offsetHeight - 8;
    if (y < wrapEl.scrollTop + 44) y = r.bottom - w.top + wrapEl.scrollTop + 8;
    bar.style.left = clamp(x, wrapEl.scrollLeft + 4, wrapEl.scrollLeft + wrapEl.clientWidth - bar.offsetWidth - 4) + "px";
    bar.style.top = y + "px";
  }

  function snapTo(v) {
    const g = S.project.grid;
    return g.snap && g.size > 1 ? Math.round(v / g.size) * g.size : Math.round(v);
  }
  function posOf(n) {
    return n.abs ? n.abs : n.p;
  }
  function sizeOf(n) {
    const el = $('#stageWrap [data-nid="' + n.id + '"]');
    if (el) return { w: el.offsetWidth, h: el.offsetHeight };
    return { w: n.p.w || 100, h: n.p.h || 40 };
  }
  function clearGuides() {
    document.querySelectorAll(".guide,.size-tip").forEach((g) => g.remove());
  }
  function guide(container, vert, at, from, to) {
    const g = h("div", { class: "guide " + (vert ? "v" : "h") });
    if (vert) Object.assign(g.style, { left: at + "px", top: from + "px", height: to - from + "px" });
    else Object.assign(g.style, { top: at + "px", left: from + "px", width: to - from + "px" });
    container.appendChild(g);
  }

  function startMove(e, ids) {
    const infos = ids.map((id) => A.findNode(id)).filter((x) => x && (x.n.type === "window" || x.n.type === "el" || x.n.abs));
    if (!infos.length) return;
    A.snap();
    const sx = e.clientX, sy = e.clientY;
    const start = infos.map((x) => ({ n: x.n, x: posOf(x.n).x, y: posOf(x.n).y, sz: sizeOf(x.n), el: $('#stageWrap [data-nid="' + x.n.id + '"]') }));
    const lead = start[start.length - 1];
    const cont = lead.el ? lead.el.parentElement : surfaceEl;
    const others = [];
    cont.querySelectorAll(":scope > [data-nid]").forEach((el) => {
      if (start.some((s) => s.el === el)) return;
      others.push({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    });
    others.push({ x: 0, y: 0, w: cont.clientWidth, h: cont.clientHeight });
    const mv = (ev) => {
      clearGuides();
      let dx = ev.clientX - sx, dy = ev.clientY - sy;
      let nx = snapTo(lead.x + dx), ny = snapTo(lead.y + dy);
      const w = lead.sz.w, hh = lead.sz.h;
      let gx = null, gy = null;
      for (const o of others) {
        for (const [a, b] of [[nx, o.x], [nx + w, o.x + o.w], [nx, o.x + o.w], [nx + w, o.x], [nx + w / 2, o.x + o.w / 2]]) if (gx == null && Math.abs(a - b) < 6) (nx += b - a), (gx = { at: b, o });
        for (const [a, b] of [[ny, o.y], [ny + hh, o.y + o.h], [ny, o.y + o.h], [ny + hh, o.y], [ny + hh / 2, o.y + o.h / 2]]) if (gy == null && Math.abs(a - b) < 6) (ny += b - a), (gy = { at: b, o });
      }
      nx = Math.max(0, Math.round(nx));
      ny = Math.max(0, Math.round(ny));
      if (gx) guide(cont, true, gx.at, Math.min(ny, gx.o.y), Math.max(ny + hh, gx.o.y + gx.o.h));
      if (gy) guide(cont, false, gy.at, Math.min(nx, gy.o.x), Math.max(nx + w, gy.o.x + gy.o.w));
      const ddx = nx - lead.x, ddy = ny - lead.y;
      for (const s of start) {
        const p = posOf(s.n);
        p.x = Math.max(0, s.x + ddx);
        p.y = Math.max(0, s.y + ddy);
        const ap = s.el ? +s.el.dataset.absPad || 0 : 0;
        if (s.el) (s.el.style.left = p.x + ap + "px"), (s.el.style.top = p.y + ap + "px");
      }
      const tip = h("div", { class: "size-tip", text: Math.round(nx) + ", " + Math.round(ny) });
      tip.style.left = nx + "px";
      tip.style.top = Math.max(0, ny - 22) + "px";
      cont.appendChild(tip);
      markSel();
    };
    const up = () => {
      clearGuides();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      A.changed();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  function startResize(e, n, el) {
    A.snap();
    const sx = e.clientX, sy = e.clientY, w0 = el.offsetWidth, h0 = el.offsetHeight;
    const cont = el.parentElement;
    const mv = (ev) => {
      clearGuides();
      n.p.w = Math.max(140, snapTo(w0 + ev.clientX - sx));
      n.p.h = Math.max(80, snapTo(h0 + ev.clientY - sy));
      el.style.width = n.p.w + "px";
      el.style.height = n.p.h + "px";
      const tip = h("div", { class: "size-tip", text: n.p.w + " x " + n.p.h });
      tip.style.left = n.p.x + n.p.w + 6 + "px";
      tip.style.top = n.p.y + n.p.h + 6 + "px";
      cont.appendChild(tip);
      markSel();
    };
    const up = () => {
      clearGuides();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      A.changed();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  }

  function stageDown(e) {
    if (S.editing) return;
    const t = e.target;
    if (t.closest(".sel-bar") || t.closest(".stage-bar")) return;
    const mvh = t.closest("[data-move]");
    if (mvh && !t.closest(".g-chev") && !t.closest(".g-x")) {
      const id = mvh.dataset.move;
      if (!S.sel.includes(id) || S.sel.length === 1) pick(id, e.shiftKey || e.ctrlKey || e.metaKey || S.multi);
      e.preventDefault();
      startMove(e, S.sel.includes(id) ? S.sel.slice() : [id]);
      return;
    }
    const rz = t.closest("[data-resize]");
    if (rz) {
      const info = A.findNode(rz.dataset.resize);
      if (info) {
        e.preventDefault();
        startResize(e, info.n, rz.parentElement);
      }
      return;
    }
    const el = t.closest("[data-nid]");
    if (el && el.dataset.nid) {
      pick(el.dataset.nid, e.shiftKey || e.ctrlKey || e.metaKey || S.multi);
      const info = A.findNode(el.dataset.nid);
      if (info && info.n.abs && e.altKey) startMove(e, [info.n.id]);
    } else if (t.closest(".surface") || t === $("#stageWrap")) {
      if (!S.sel.length) return;
      S.sel = [];
      markSel();
      A.renderSide();
    }
  }

  function pick(id, add) {
    if (add) {
      const i = S.sel.indexOf(id);
      if (i >= 0) S.sel.splice(i, 1);
      else S.sel.push(id);
    } else {
      if (S.sel.length === 1 && S.sel[0] === id) return;
      S.sel = [id];
    }
    if (S.tab !== "layers" && S.tab !== "props" && !A.isMobile()) S.tab = "props";
    markSel();
    A.renderSide();
  }

  function findDrop(x, y, ctype) {
    const els = document.elementsFromPoint(x, y);
    let slotEl = null;
    for (const e of els) {
      const s = e.closest && e.closest("[data-slot]");
      if (!s) continue;
      let c = s;
      while (c) {
        if (GM.accepts(c.dataset.ptype, ctype)) {
          slotEl = c;
          break;
        }
        c = c.parentElement && c.parentElement.closest("[data-slot]");
      }
      if (slotEl) break;
    }
    if (!slotEl) {
      const surf = els.find((e) => e.classList && e.classList.contains("surface"));
      if (surf) return { wrapWin: true, surf };
      return null;
    }
    const [pid, si] = slotEl.dataset.slot.split(":");
    const horiz = slotEl.dataset.horiz === "1";
    const items = [...slotEl.querySelectorAll("[data-i]")].filter((el) => el.closest("[data-slot]") === slotEl && el.style.display !== "none" && !el.classList.contains("g-abs") && !el.classList.contains("g-win") && !el.classList.contains("canvas"));
    let index = null, ref = null, before = true;
    if (slotEl.dataset.canvasRoot) return { pid, si: +si, slotEl, canvas: true };
    if (S.dropMode !== "flow" && slotEl.dataset.exact && ctype !== "window" && ctype !== "menu" && ctype !== "menu_item" && ctype !== "menu_sep") {
      const r = slotEl.getBoundingClientRect(), pad = +slotEl.dataset.absPad || 0;
      return { pid, si: +si, slotEl, exact: { x: snapTo(Math.max(0, x - r.left - pad)), y: snapTo(Math.max(0, y - r.top - pad)) }, index: Infinity };
    }
    for (const it of items) {
      const r = it.getBoundingClientRect();
      const inLine = it.parentElement.classList.contains("g-line");
      if (horiz || (inLine && y >= r.top && y <= r.bottom)) {
        if (x < r.left + r.width / 2 && (horiz || y <= r.bottom)) {
          index = +it.dataset.i, ref = it;
          break;
        }
        continue;
      }
      if (y < r.top + r.height / 2) {
        index = +it.dataset.i, ref = it;
        break;
      }
    }
    if (index == null) {
      const last = items[items.length - 1];
      index = last ? +last.dataset.i + 1 : 0;
      ref = last || null;
      before = false;
    }
    return { pid, si: +si, index, ref, before, slotEl, horiz };
  }

  function showDrop(d) {
    document.querySelectorAll(".drop-line,.drop-box").forEach((x) => x.remove());
    if (!d) return;
    const wrapEl = $("#stageWrap"), w = wrapEl.getBoundingClientRect();
    const put = (cls, r) => {
      const e = h("div", { class: cls });
      Object.assign(e.style, { left: r.x - w.left + wrapEl.scrollLeft + "px", top: r.y - w.top + wrapEl.scrollTop + "px", width: r.w + "px", height: r.h + "px" });
      wrapEl.appendChild(e);
    };
    if (d.exact) {
      const r = d.slotEl.getBoundingClientRect(), pad = +d.slotEl.dataset.absPad || 0;
      put("drop-box", { x: r.left - 3, y: r.top - 3, w: r.width + 6, h: Math.max(r.height, 20) + 6 });
      put("drop-line", { x: r.left + pad + d.exact.x - 1, y: r.top + pad + d.exact.y - 1, w: 14, h: 3 });
      put("drop-line", { x: r.left + pad + d.exact.x - 1, y: r.top + pad + d.exact.y - 1, w: 3, h: 14 });
      return;
    }
    if (d.wrapWin || d.canvas) {
      const r = (d.slotEl || d.surf).getBoundingClientRect();
      put("drop-box", { x: r.left, y: r.top, w: r.width, h: r.height });
      return;
    }
    const sr = d.slotEl.getBoundingClientRect();
    put("drop-box", { x: sr.left - 3, y: sr.top - 3, w: sr.width + 6, h: Math.max(sr.height, 20) + 6 });
    if (d.ref) {
      const r = d.ref.getBoundingClientRect();
      const vertical = d.horiz || d.ref.parentElement.classList.contains("g-line");
      if (vertical) put("drop-line", { x: (d.before ? r.left : r.right) - 2, y: r.top, w: 3, h: r.height });
      else put("drop-line", { x: r.left, y: (d.before ? r.top : r.bottom) - 2, w: r.width, h: 3 });
    } else put("drop-line", { x: sr.left + 4, y: sr.top + 4, w: sr.width - 8, h: 3 });
  }

  function surfacePoint(x, y) {
    const r = surfaceEl.getBoundingClientRect();
    return { x: snapTo(Math.max(0, x - r.left)), y: snapTo(Math.max(0, y - r.top)) };
  }

  window.addEventListener("resize", () => markSel());
  Object.assign(A, { renderStage, markSel, findDrop, showDrop, surfacePoint, stageDown, pick, renderSlot, renderNode, closePops, stageToast: toast });
})();
