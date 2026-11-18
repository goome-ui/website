(function () {
  const A = window.GMApp;
  const { h, $, icon, S, note, snap, changed, clamp } = A;
  const P = () => S.project;
  const NAMES = { bg: "bg", panel: "panel", border: "border", text: "text", text_dim: "text_dim", accent: "accent", accent_text: "accent_text", hover: "hover", active: "active", input_bg: "input_bg", shadow: "shadow" };

  function same(a, b) {
    for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES, GM.THEME_FONTS)) if ((a[k] || 0) !== (b[k] || 0)) return false;
    if (JSON.stringify(a.quick || null) !== JSON.stringify(b.quick || null)) return false;
    for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) if (JSON.stringify(a[k] || null) !== JSON.stringify(b[k] || null)) return false;
    if (JSON.stringify(a.icons || {}) !== JSON.stringify(b.icons || {}) || (a.icon_tint || 0) !== (b.icon_tint || 0)) return false;
    return a.base === b.base;
  }
  function apply(t) {
    snap();
    const keep = { id: t.id, name: t.name };
    P().theme = GM.normTheme(GM.clone(t));
    Object.assign(P().theme, keep);
    changed();
  }
  function dot(t) {
    return h("span", { class: "th-dot", style: { background: GM.argbCss(t.panel | 0xFF000000) } }, h("i", { style: { background: GM.argbCss(t.accent) } }));
  }

  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  }
  const slug = (s) => String(s || "theme").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "theme";
  function exportTheme(t) {
    const out = GM.clone(t);
    delete out.preset;
    download(slug(t.name) + ".goome-theme.json", { format: "goome-theme", version: 1, theme: out });
  }
  function importTheme(obj) {
    const raw = obj.theme || obj;
    const t = GM.normTheme(raw);
    t.id = GM.uid("t");
    if (P().themes.some((x) => x.name === t.name)) t.name += " (imported)";
    snap();
    P().themes.push(t);
    P().theme = GM.clone(t);
    changed();
    note("got the theme " + t.name);
    return t;
  }

  function renderTheme(body) {
    const t = P().theme, add = (x) => body.appendChild(x);
    const saved = P().themes.find((x) => x.id === t.id);
    const presetOf = GM.PRESETS.find((x) => x.id === t.id);
    const dirty = saved ? !same(saved, t) : presetOf ? !same(presetOf, t) : true;
    add(h("div", { class: "sec", text: "Built in" }));
    add(h("div", { class: "row" }, GM.PRESETS.map((pr) => h("button", { class: "chip" + (t.id === pr.id && !dirty ? " on" : ""), onclick: () => apply(pr) }, dot(pr), pr.name))));
    add(h("div", { class: "sec" }, h("span", { text: "Your themes" }), h("span", { class: "grow" }),
      h("button", { class: "btn sm", title: "import a .goome-theme.json", onclick: () => A.pickFile((o) => importTheme(o)) }, icon("ul"), "Import")));
    const list = h("div", { class: "th-list" });
    if (!P().themes.length) list.appendChild(h("p", { class: "muted", text: "nothing saved yet. tweak a theme and hit save." }));
    for (const th of P().themes) {
      const nm = h("span", { class: "nm", text: th.name });
      const row = h("div", { class: "li" + (th.id === t.id ? " on" : "") }, dot(th), nm,
        h("button", { class: "btn sm ghost", title: "rename", onclick: (e) => {
          e.stopPropagation();
          const v = prompt2("New name", th.name, (v) => {
            snap();
            th.name = v;
            if (P().theme.id === th.id) P().theme.name = v;
            changed();
          });
        } }, icon("edit")),
        h("button", { class: "btn sm ghost", title: "duplicate", onclick: (e) => {
          e.stopPropagation();
          snap();
          const c = GM.clone(th);
          c.id = GM.uid("t");
          c.name = th.name + " copy";
          P().themes.push(c);
          changed();
        } }, icon("copy")),
        h("button", { class: "btn sm ghost", title: "export", onclick: (e) => (e.stopPropagation(), exportTheme(th)) }, icon("dl")),
        h("button", { class: "btn sm ghost bad", title: "delete", onclick: (e) => {
          e.stopPropagation();
          confirm2("Delete " + th.name + "?", () => {
            snap();
            P().themes = P().themes.filter((x) => x !== th);
            changed();
          });
        } }, icon("trash")));
      row.addEventListener("click", () => apply(th));
      list.appendChild(row);
    }
    add(list);
    add(h("div", { class: "row", style: { margin: "8px 0 4px" } },
      saved ? h("button", { class: "btn pri", disabled: !dirty, onclick: () => {
        snap();
        Object.assign(saved, GM.clone(P().theme));
        changed();
        note("saved " + saved.name);
      } }, "Save " + saved.name) : null,
      h("button", { class: "btn" + (saved ? "" : " pri"), onclick: () => prompt2("Name it", saved ? saved.name + " 2" : presetOf ? presetOf.name + " mine" : "My theme", (v) => {
        snap();
        const c = GM.clone(P().theme);
        c.id = GM.uid("t");
        c.name = v;
        delete c.preset;
        P().themes.push(c);
        P().theme = GM.clone(c);
        changed();
      }) }, "Save as new"),
      h("button", { class: "btn", onclick: () => exportTheme(P().theme) }, icon("dl"), "Export")));
    add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "editing: " + (t.name || "theme") + (dirty ? ", not saved" : "") }));

    add(h("div", { class: "sec", text: "Mode" }));
    add(h("div", { class: "seg" }, [["quick", "Quick"], ["full", "Every field"]].map(([m, lb]) => h("button", { class: (m === "quick") === !!t.quick ? "on" : "", text: lb, onclick: () => {
      if ((m === "quick") === !!t.quick) return;
      snap();
      if (m === "quick") {
        t.quick = { accent: t.accent >>> 0, dark: t.base !== "light", radius: t.radius, scale: 1 };
        GM.applyQuick(t);
      } else delete t.quick;
      changed();
    } }))));
    if (t.quick) {
      add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "4 knobs, the code is goome_ui_theme_make(t, accent, dark, radius) plus goome_ui_scale(u, size). switch to every field to fine tune it." }));
      add(quickBlock(t));
    } else {
      add(h("div", { class: "sec", text: "Starts from" }));
      add(h("div", { class: "seg" }, ["dark", "light"].map((b) => h("button", { class: t.base === b ? "on" : "", text: b === "dark" ? "goome_ui_theme_dark" : "goome_ui_theme_light", onclick: () => {
        snap();
        t.base = b;
        changed();
      } }))));
      add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "the code calls this first (or goome_ui_theme_preset for an untouched preset), then sets only what differs." }));
      S.thOpen = S.thOpen || {};
      for (const g of GM.THEME_GROUPS) {
        const base = GM.themeBase(t);
        const changedN = g.keys.filter((k) => (GM.THEME_FONTS.includes(k) ? !!t[k] : GM.THEME_COLORS.includes(k) ? (t[k] >>> 0) !== (base[k] >>> 0) : +t[k] !== +base[k])).length;
        const d = h("details", { class: "th-grp", open: !!S.thOpen[g.id] });
        d.addEventListener("toggle", () => (S.thOpen[g.id] = d.open));
        d.appendChild(h("summary", { text: g.name + (changedN ? " (" + changedN + " changed)" : "") }));
        for (const k of g.keys) d.appendChild(GM.THEME_COLORS.includes(k) ? colorRow(t, k) : GM.THEME_FONTS.includes(k) ? fontRow(t, k) : GM.THEME_ENUMS[k] ? enumRow(t, k) : sizeRow(t, k));
        add(d);
      }
    }
    add(behaviourBlock());
    add(h("div", { class: "sec", text: "Skins (nine slice images)" }));
    add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "load a picture, then drag the green lines to set the l, t, r, b insets. the code loads it from the file name, so keep the image next to your program." }));
    for (const k of GM.THEME_SKINS) add(skinBlock(t, k));
    add(h("div", { class: "sec", text: "More skins (goome_ui_push_skin)" }));
    add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "these parts dont have a theme field, so the code pushes them at the start of every frame." }));
    for (const k of GM.EXTRA_SKINS) add(skinBlock(t, k));
    add(h("div", { class: "sec", text: "Icons" }));
    add(h("p", { class: "muted", style: { fontSize: "12px" }, text: "swap any glyph goome draws by itself. empty = the built in one. pictures go into the shared theme file too." }));
    const tint = h("input", { type: "checkbox", checked: !t.icon_tint });
    tint.addEventListener("change", () => {
      snap();
      t.icon_tint = tint.checked ? 0 : 1;
      changed();
    });
    add(h("label", { class: "chk" }, tint, h("span", { text: "Tint them with the widget color (icon_tint 0, the picture alpha is the shape)" })));
    t.icons = t.icons || {};
    const grid = h("div", { class: "ico-grid" });
    for (const k of GM.ICON_NAMES) {
      const ic = t.icons[k];
      const pv = h("div", { class: "pv" }, ic ? h("img", { src: ic.img, alt: k }) : h("span", { text: "built in" }));
      const tile = h("div", { class: "ico-tile", title: "GOOME_ICON_" + k.toUpperCase() }, pv, h("span", { class: "nm", text: k }),
        h("div", { class: "row" },
          h("button", { class: "btn sm ghost", title: ic ? "replace" : "load a picture", onclick: () => loadImage((img, file) => {
            snap();
            t.icons[k] = { img, file: "icon_" + k + "." + (file.split(".").pop() || "png") };
            changed();
          }) }, icon("ul")),
          ic ? h("button", { class: "btn sm ghost bad", title: "back to built in", onclick: () => {
            snap();
            delete t.icons[k];
            changed();
          } }, icon("trash")) : null));
      grid.appendChild(tile);
    }
    add(grid);
  }

  function colorRow(t, k) {
    const c = t[k] >>> 0;
    if (GM.THEME_AUTO_COLORS.includes(k)) return autoColorRow(t, k);
    const col = h("input", { type: "color", class: "in", value: "#" + (c & 0xFFFFFF).toString(16).padStart(6, "0") });
    const al = h("input", { class: "in", type: "number", min: 0, max: 255, value: (c >>> 24) & 255, title: "alpha 0 to 255" });
    const nm = h("span", { class: "nm", title: GM.hex8(c) }, NAMES[k], h("br"), h("span", { class: "muted", style: { fontSize: "11px", fontFamily: "var(--mono)" }, text: GM.hex8(c) }));
    const set = () => {
      t[k] = (((clamp(+al.value || 0, 0, 255) & 255) << 24) | parseInt(col.value.slice(1), 16)) >>> 0;
      nm.lastChild.textContent = GM.hex8(t[k]);
      changed({ noSide: true });
    };
    col.addEventListener("focus", snap);
    al.addEventListener("focus", snap);
    col.addEventListener("input", set);
    al.addEventListener("input", set);
    return h("div", { class: "th-color" }, nm, col, al);
  }
  function autoColorRow(t, k) {
    const c = t[k] >>> 0, auto = !c;
    const cb = h("input", { type: "checkbox", checked: !auto, title: "set it yourself" });
    const shown = auto ? 0xFF808080 : c;
    const col = h("input", { type: "color", class: "in", value: "#" + (shown & 0xFFFFFF).toString(16).padStart(6, "0"), disabled: auto });
    const al = h("input", { class: "in", type: "number", min: 0, max: 255, value: auto ? 255 : (c >>> 24) & 255, disabled: auto, title: "alpha 0 to 255" });
    const nm = h("span", { class: "nm", title: GM.THEME_HINT[k] || k }, k, h("br"), h("span", { class: "muted", style: { fontSize: "11px", fontFamily: "var(--mono)" }, text: auto ? "auto, " + (GM.THEME_HINT[k] || "") : GM.hex8(c) }));
    const set = () => {
      t[k] = (((clamp(+al.value || 0, 0, 255) & 255) << 24) | parseInt(col.value.slice(1), 16)) >>> 0 || 0x01000000;
      nm.lastChild.textContent = GM.hex8(t[k]);
      changed({ noSide: true });
    };
    cb.addEventListener("change", () => {
      snap();
      if (cb.checked) set();
      else t[k] = 0;
      col.disabled = al.disabled = !cb.checked;
      changed();
    });
    col.addEventListener("focus", snap);
    al.addEventListener("focus", snap);
    col.addEventListener("input", set);
    al.addEventListener("input", set);
    return h("div", { class: "th-color auto" }, cb, nm, col, al);
  }
  function enumRow(t, k) {
    const s = h("select", { class: "in" }, GM.THEME_ENUMS[k].map((nm, i) => h("option", { value: i, text: (k === "align" ? "GOOME_ALIGN_" : "GOOME_EASE_") + nm.toUpperCase(), selected: (t[k] | 0) === i })));
    s.addEventListener("focus", snap);
    s.addEventListener("change", () => ((t[k] = +s.value), changed({ noSide: true })));
    return h("div", { class: "th-size en" }, h("span", { class: "nm", text: k }), s);
  }
  function fontRow(t, k) {
    const inp = h("input", { class: "in", value: t[k] || "", placeholder: "ui font", spellcheck: "false" });
    inp.addEventListener("focus", snap);
    inp.addEventListener("input", () => ((t[k] = inp.value.trim()), changed({ noSide: true })));
    return h("div", { class: "th-size en", title: GM.THEME_HINT[k] }, h("span", { class: "nm", text: k }), inp);
  }
  function quickBlock(t) {
    const q = t.quick, box = h("div");
    const re = () => {
      GM.applyQuick(t);
      changed({ noSide: true });
    };
    const col = h("input", { type: "color", class: "in", value: "#" + (q.accent & 0xFFFFFF).toString(16).padStart(6, "0") });
    col.addEventListener("focus", snap);
    col.addEventListener("input", () => ((q.accent = (0xFF000000 | parseInt(col.value.slice(1), 16)) >>> 0), re()));
    box.appendChild(h("div", { class: "th-size en" }, h("span", { class: "nm", text: "accent" }), col));
    box.appendChild(h("div", { class: "seg", style: { margin: "4px 0 8px" } }, [[true, "Dark"], [false, "Light"]].map(([v, lb]) => h("button", { class: q.dark === v ? "on" : "", text: lb, onclick: () => {
      snap();
      q.dark = v;
      GM.applyQuick(t);
      changed();
    } }))));
    const slide = (key, label, lo, hi, st, fmt) => {
      const r = h("input", { type: "range", min: lo, max: hi, step: st, value: q[key] });
      const n = h("input", { class: "in", type: "number", min: lo, max: hi, step: st, value: q[key] });
      const set = (v) => {
        q[key] = clamp(+v || 0, lo, hi) || (key === "scale" ? 1 : 0);
        r.value = n.value = q[key];
        re();
      };
      r.addEventListener("pointerdown", snap);
      n.addEventListener("focus", snap);
      r.addEventListener("input", () => set(r.value));
      n.addEventListener("input", () => set(n.value));
      return h("div", { class: "th-size" }, h("span", { class: "nm", text: label }), r, n);
    };
    box.appendChild(slide("radius", "radius", 0, 24, 1));
    box.appendChild(slide("scale", "ui size", 0.75, 2, 0.05));
    return box;
  }
  function behaviourBlock() {
    const P2 = P();
    P2.config = GM.normConfig(P2.config);
    const c = P2.config, def = GM.normConfig({});
    const diff = GM.CFG_NUMS.filter(([k]) => c[k] !== def[k]).length + GM.CFG_TOGGLES.filter(([k]) => c[k] !== def[k]).length + GM.CFG_CURSORS.filter(([k]) => c.cursor[k] !== def.cursor[k]).length + GM.CFG_KEYS.filter(([k]) => c.keys[k] !== def.keys[k]).length + (c.mask !== def.mask ? 1 : 0);
    S.thOpen = S.thOpen || {};
    const d = h("details", { class: "th-grp", open: !!S.thOpen.beh });
    d.addEventListener("toggle", () => (S.thOpen.beh = d.open));
    d.appendChild(h("summary", { text: "Behaviour" + (diff ? " (" + diff + " changed)" : "") }));
    d.appendChild(h("p", { class: "muted", style: { fontSize: "12px" }, text: "not a look, so it goes in goome_ui_cfg(u) and goome_ui_bind. its saved with the project, not the theme." }));
    const quiet = () => changed({ noSide: true, noStage: true });
    for (const [k, , lo, hi, hint] of GM.CFG_NUMS) {
      const n = h("input", { class: "in", type: "number", min: lo, max: hi, step: k === "scroll_lines" ? 0.25 : 1, value: c[k] });
      n.addEventListener("focus", snap);
      n.addEventListener("input", () => ((c[k] = clamp(+n.value || 0, lo, hi)), quiet()));
      d.appendChild(h("div", { class: "th-size en", title: hint }, h("span", { class: "nm", text: k }), n));
    }
    for (const [k, , label] of GM.CFG_TOGGLES) {
      const cb = h("input", { type: "checkbox", checked: !!c[k] });
      cb.addEventListener("change", () => (snap(), (c[k] = cb.checked ? 1 : 0), quiet()));
      d.appendChild(h("label", { class: "chk" }, cb, h("span", { text: k + ", " + label })));
    }
    d.appendChild(h("div", { class: "sec", text: "Cursors" }));
    for (const [k] of GM.CFG_CURSORS) {
      const s = h("select", { class: "in" }, GM.CURSOR_SHAPES.map((sh) => h("option", { value: sh, text: sh.toLowerCase(), selected: c.cursor[k] === sh })));
      s.addEventListener("focus", snap);
      s.addEventListener("change", () => ((c.cursor[k] = s.value), quiet()));
      d.appendChild(h("div", { class: "th-size en", title: "GOOME_CUR_" + k.toUpperCase() }, h("span", { class: "nm", text: k }), s));
    }
    d.appendChild(h("div", { class: "sec", text: "Keys in inputs and the editor" }));
    d.appendChild(h("p", { class: "muted", style: { fontSize: "12px" }, text: "up to 4 combos split by spaces, like ctrl+a cmd+a. empty takes every key off it." }));
    for (const [k, dk] of GM.CFG_KEYS) {
      const inp = h("input", { class: "in", value: c.keys[k], spellcheck: "false", placeholder: "no keys" });
      inp.addEventListener("focus", snap);
      inp.addEventListener("input", () => ((c.keys[k] = inp.value.replace(/[^\w+ ,]/g, "").slice(0, 120)), quiet()));
      const rs = h("button", { class: "btn sm ghost", title: "back to " + dk, onclick: () => (snap(), (c.keys[k] = dk), (inp.value = dk), quiet()) }, icon("out"));
      d.appendChild(h("div", { class: "th-key", title: "GOOME_ACT_" + k.toUpperCase() }, h("span", { class: "nm", text: k }), inp, rs));
    }
    const mk = h("input", { class: "in", value: c.mask, maxlength: 2 });
    mk.addEventListener("focus", snap);
    mk.addEventListener("input", () => ((c.mask = Array.from(mk.value)[0] || "*"), quiet()));
    d.appendChild(h("div", { class: "th-size en", title: "what a password box draws per letter" }, h("span", { class: "nm", text: "mask" }), mk));
    return d;
  }
  function sizeRow(t, k) {
    const [lo, hi, st] = GM.SIZE_RANGE[k];
    const r = h("input", { type: "range", min: lo, max: hi, step: st, value: t[k] });
    const n = h("input", { class: "in", type: "number", step: st, value: t[k] });
    const set = (v) => {
      t[k] = +v || 0;
      r.value = t[k];
      n.value = t[k];
      changed({ noSide: true });
    };
    r.addEventListener("pointerdown", snap);
    n.addEventListener("focus", snap);
    r.addEventListener("input", () => set(r.value));
    n.addEventListener("input", () => set(n.value));
    return h("div", { class: "th-size", title: GM.THEME_HINT[k] || "" }, h("span", { class: "nm", text: k }), r, n);
  }

  function skinBlock(t, k) {
    const s = t[k];
    const box = h("div", { style: { marginBottom: "14px" } });
    const label = { skin_button: "skin_button, buttons", skin_panel: "skin_panel, windows", skin_input: "skin_input, text inputs", skin_scrollbar: "GOOME_SKIN_SCROLLBAR", skin_slider_track: "GOOME_SKIN_SLIDER_TRACK", skin_toggle: "GOOME_SKIN_TOGGLE", skin_tab: "GOOME_SKIN_TAB", skin_titlebar: "GOOME_SKIN_TITLEBAR", skin_tooltip: "GOOME_SKIN_TOOLTIP", skin_menu: "GOOME_SKIN_MENU", skin_checkbox: "GOOME_SKIN_CHECKBOX", skin_radio: "GOOME_SKIN_RADIO", skin_slider_fill: "GOOME_SKIN_SLIDER_FILL", skin_popup: "GOOME_SKIN_POPUP" }[k];
    box.appendChild(h("div", { class: "row" }, h("b", { text: label, style: { fontWeight: 600, fontSize: "13px" } }), h("span", { class: "grow" }),
      h("button", { class: "btn sm", onclick: () => loadImage((img, file, iw, ih) => {
        snap();
        const d = Math.max(1, Math.floor(Math.min(iw, ih) / 3));
        t[k] = { img, file, l: d, t: d, r: d, b: d, iw, ih };
        changed();
      }) }, icon("ul"), s ? "Replace" : "Load image"),
      s ? h("button", { class: "btn sm ghost bad", title: "remove", onclick: () => {
        snap();
        t[k] = null;
        changed();
      } }, icon("trash")) : null));
    if (!s) return box;
    const scale = Math.max(1, Math.min(8, Math.floor(280 / Math.max(s.iw, s.ih))));
    const W = s.iw * scale, H = s.ih * scale;
    const ed = h("div", { class: "skin-ed", style: { width: W + "px", height: H + "px", maxWidth: "100%" } }, h("img", { src: s.img, alt: "" }));
    const lines = {};
    const pos = () => {
      const k2 = ed.clientWidth / s.iw;
      lines.l.style.left = s.l * k2 + "px";
      lines.r.style.left = (s.iw - s.r) * k2 + "px";
      lines.t.style.top = s.t * (ed.clientHeight / s.ih) + "px";
      lines.b.style.top = (s.ih - s.b) * (ed.clientHeight / s.ih) + "px";
    };
    const nums = {};
    for (const side of ["l", "r", "t", "b"]) {
      const ln = h("div", { class: "ln " + (side === "l" || side === "r" ? "v" : "h") });
      lines[side] = ln;
      ln.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        snap();
        ln.setPointerCapture(e.pointerId);
        ln.onpointermove = (ev) => {
          const r = ed.getBoundingClientRect();
          const fx = (ev.clientX - r.left) / r.width * s.iw, fy = (ev.clientY - r.top) / r.height * s.ih;
          if (side === "l") s.l = clamp(Math.round(fx), 0, s.iw - s.r);
          if (side === "r") s.r = clamp(Math.round(s.iw - fx), 0, s.iw - s.l);
          if (side === "t") s.t = clamp(Math.round(fy), 0, s.ih - s.b);
          if (side === "b") s.b = clamp(Math.round(s.ih - fy), 0, s.ih - s.t);
          pos();
          for (const q in nums) nums[q].value = s[q];
          changed({ noSide: true });
        };
        ln.onpointerup = () => (ln.onpointermove = null);
      });
      ed.appendChild(ln);
    }
    box.appendChild(ed);
    requestAnimationFrame(pos);
    const row = h("div", { class: "fld3", style: { gridTemplateColumns: "repeat(4, 1fr)" } });
    for (const side of ["l", "t", "r", "b"]) {
      const inp = h("input", { class: "in", type: "number", min: 0, value: s[side] });
      nums[side] = inp;
      inp.addEventListener("focus", snap);
      inp.addEventListener("input", () => {
        s[side] = clamp(+inp.value || 0, 0, side === "l" || side === "r" ? s.iw : s.ih);
        pos();
        changed({ noSide: true });
      });
      row.appendChild(A.fieldBase(side, inp));
    }
    box.appendChild(row);
    const fn = h("input", { class: "in", value: s.file, spellcheck: "false" });
    fn.addEventListener("focus", snap);
    fn.addEventListener("input", () => ((s.file = fn.value.trim() || k + ".png"), changed({ noSide: true, noStage: true })));
    box.appendChild(A.fieldBase("File name the code loads (" + s.iw + " x " + s.ih + " px)", fn));
    box.appendChild(h("button", { class: "btn sm", onclick: () => {
      const a = h("a", { href: s.img, download: s.file });
      document.body.appendChild(a);
      a.click();
      a.remove();
    } }, icon("dl"), "Save the image"));
    return box;
  }

  function loadImage(cb) {
    const inp = h("input", { type: "file", accept: "image/*" });
    inp.addEventListener("change", () => {
      const f = inp.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) return note("thats a big picture, keep these under 2 MB");
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => cb(rd.result, f.name.replace(/[^\w.-]+/g, "_"), im.naturalWidth, im.naturalHeight);
        im.onerror = () => note("couldnt read that image");
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
    inp.click();
  }

  function modalBox(title, content, onOk, okText) {
    const back = h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 80, display: "grid", placeItems: "center", padding: "16px" } });
    const box = h("div", { style: { background: "var(--c-pane2)", border: "1px solid var(--c-line2)", borderRadius: "12px", padding: "16px", width: "min(360px, 100%)", boxShadow: "0 20px 50px rgba(0,0,0,.5)" } },
      h("div", { style: { fontWeight: 600, marginBottom: "12px" }, text: title }), content,
      h("div", { class: "row", style: { justifyContent: "flex-end", marginTop: "14px" } },
        h("button", { class: "btn", onclick: () => back.remove() }, "Cancel"),
        h("button", { class: "btn pri", onclick: () => {
          if (onOk() !== false) back.remove();
        } }, okText || "OK")));
    back.appendChild(box);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) back.remove();
    });
    document.body.appendChild(back);
    return back;
  }
  function prompt2(title, val, cb) {
    const inp = h("input", { class: "in", value: val });
    const m = modalBox(title, inp, () => {
      const v = inp.value.trim();
      if (!v) return false;
      cb(v);
    }, "Save");
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const v = inp.value.trim();
        if (v) cb(v), m.remove();
      }
    });
    setTimeout(() => inp.select(), 30);
  }
  function confirm2(title, cb) {
    modalBox(title, h("p", { class: "muted", style: { margin: 0 }, text: "cant get it back unless you undo." }), cb, "Delete");
  }

  Object.assign(A, { renderTheme, importTheme, exportTheme, download, slug, prompt2, confirm2 });
})();
