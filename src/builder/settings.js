(function () {
  const A = window.GMApp;
  const { h, $, icon, S, note, snap, changed } = A;
  const P = () => S.project;
  const KEY = "gm-uibuilder-settings";
  const CODE_KEYS = ["indent", "braces", "iconSource", "nameStyle"];

  function load() {
    let o = {};
    try {
      o = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    } catch (e) {}
    S.settings = Object.assign({}, GM.SETTINGS_DEFAULT, o);
  }
  function store() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S.settings));
    } catch (e) {}
  }
  function sync() {
    if (!S.project) return;
    S.project.settings = Object.assign({}, S.settings);
    if (S.dropMode == null) S.dropMode = S.settings.autoPin ? "exact" : "flow";
    const w = $("#stageWrap");
    if (w) w.classList.toggle("show-hits", !!S.settings.showHits);
  }
  function adopt(project) {
    if (project && project.settings) for (const k of CODE_KEYS) if (k in project.settings) S.settings[k] = project.settings[k];
    store();
    sync();
  }
  function fresh() {
    const p = GM.starterProject();
    const t = GM.PRESETS.find((x) => x.id === S.settings.defaultTheme) || (P().themes || []).find((x) => x.id === S.settings.defaultTheme);
    if (t) p.theme = GM.normTheme(GM.clone(t));
    if (S.settings.defaultMode === "app") {
      p.mode = "app";
      p.root = p.root[0].kids[0];
    }
    p.settings = Object.assign({}, S.settings);
    return p;
  }

  function open() {
    const st = S.settings;
    const back = h("div", { class: "set-back" });
    const box = h("div", { class: "set-box" });
    const set = (k, v, re) => {
      st[k] = v;
      store();
      sync();
      if (k === "autoPin") S.dropMode = v ? "exact" : "flow";
      if (re) changed();
      else A.scheduleCode();
    };
    const chk = (k, label, re) => {
      const c = h("input", { type: "checkbox", checked: !!st[k] });
      c.addEventListener("change", () => set(k, c.checked, re));
      return h("label", { class: "chk" }, c, h("span", { text: label }));
    };
    const sel = (k, label, opts, re) => {
      const s = h("select", { class: "in" }, Object.entries(opts).map(([v, t]) => h("option", { value: v, text: t, selected: String(st[k]) === v })));
      s.addEventListener("change", () => set(k, isNaN(+s.value) || s.value === "" ? s.value : +s.value, re));
      return A.fieldBase(label, s);
    };
    const num = (label, get, put, o = {}) => {
      const i = h("input", { class: "in", type: "number", value: get(), min: o.min, max: o.max, step: o.step || 1 });
      i.addEventListener("change", () => put(+i.value));
      return A.fieldBase(label, i, o.hint);
    };
    const themes = {};
    for (const t of GM.PRESETS) themes[t.id] = t.name;
    for (const t of P().themes || []) themes[t.id] = t.name + " (yours)";
    box.append(
      h("div", { class: "row", style: { marginBottom: "6px" } }, h("b", { text: "Builder settings", style: { fontSize: "15px" } }), h("span", { class: "grow" }), h("button", { class: "btn sm ghost", onclick: () => back.remove() }, icon("x"))),
      h("p", { class: "muted", style: { margin: "0 0 8px", fontSize: "12px" }, text: "kept in this browser, and saved into project files too." }),
      h("div", { class: "sec", text: "Adding stuff" }),
      chk("autoPin", "New widgets stay exactly where i drop them (off = they go in line)"),
      chk("autoVar", "Make a variable for every new input"),
      sel("nameStyle", "Names for new variables", { snake: "snake_case", camel: "camelCase" }),
      chk("confirmDelete", "Ask before deleting"),
      h("div", { class: "sec", text: "Canvas" }),
      h("label", { class: "chk" }, (() => {
        const c = h("input", { type: "checkbox", checked: !!P().grid.snap });
        c.addEventListener("change", () => {
          snap();
          P().grid.snap = c.checked;
          changed();
          A.renderTop();
        });
        return c;
      })(), h("span", { text: "Snap to the grid" })),
      num("Grid size", () => P().grid.size, (v) => {
        snap();
        P().grid.size = Math.max(2, Math.min(64, v || 8));
        changed();
      }, { min: 2, max: 64 }),
      chk("showHits", "Show hit areas (where goome takes clicks)", true),
      chk("showHidden", "Show hidden elements (their show if is false right now)", true),
      h("div", { class: "sec", text: "New projects" }),
      sel("defaultTheme", "Theme", themes),
      sel("defaultMode", "Mode", { overlay: "Overlay", app: "App window" }),
      h("div", { class: "sec", text: "Code" }),
      sel("indent", "Indent", { 2: "2 spaces", 4: "4 spaces", 8: "8 spaces" }),
      sel("braces", "C braces", { kr: "same line  if (x) {", allman: "own line  if (x)\n{" }),
      sel("iconSource", "Icons and skins load from", { embed: "bytes baked into the code", files: "files next to the program" }),
      h("div", { class: "sec", text: "Saving" }),
      sel("autosave", "Save to this browser", { 250: "right away", 2000: "every 2 seconds", 10000: "every 10 seconds", 60000: "every minute" }));
    back.appendChild(box);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) back.remove();
    });
    const esc = (e) => {
      if (e.key === "Escape") back.remove(), window.removeEventListener("keydown", esc);
    };
    window.addEventListener("keydown", esc);
    document.body.appendChild(back);
  }

  load();
  Object.assign(A, { openSettings: open, syncSettings: sync, adoptSettings: adopt, freshProject: fresh });
})();
