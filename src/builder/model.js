(function (root) {
  const GM = {};

  let seq = 0;
  GM.uid = (p = "n") => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  GM.clone = (o) => JSON.parse(JSON.stringify(o));

  GM.THEME_AUTO_COLORS = ["focus", "select", "caret", "link", "badge", "toast", "tooltip", "danger", "knob", "dim"];
  GM.THEME_COLORS = ["bg", "panel", "border", "text", "text_dim", "accent", "accent_text", "hover", "active", "input_bg", "shadow"].concat(GM.THEME_AUTO_COLORS);
  GM.THEME_NEW_SIZES = ["check_size", "check_radius", "toggle_w", "toggle_h", "slider_h", "slider_track", "knob_size", "scroll_w", "scroll_min", "item_h", "menu_item_h", "tab_h",
    "win_title_h", "app_title_h", "menubar_h", "statusbar_h", "focus_w", "focus_gap", "sep_w", "grip", "indent", "plot_w", "spinner", "caret_w",
    "win_min_w", "win_min_h", "pop_gap", "menu_gap", "tip_pad_x", "tip_pad_y", "tip_x", "tip_y", "tip_radius", "shadow_x", "shadow_y", "align",
    "heading_size", "small_size", "ease", "hover_ms", "press_ms", "popup_ms", "collapse_ms", "toast_fade_ms"];
  GM.THEME_EM = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, -1, -1, -1, -1, -1, -1];
  GM.THEME_SIZES = ["radius", "pad", "gap", "border_width", "font_size", "shadow_blur", "anim_ms"].concat(GM.THEME_NEW_SIZES);
  GM.THEME_FONTS = ["font_heading", "font_mono", "font_small"];
  GM.THEME_ENUMS = { align: ["auto", "left", "center", "right"], ease: ["smooth", "linear", "out", "in_out", "back"] };
  GM.THEME_GROUPS = [
    { id: "colors", name: "Colors", keys: GM.THEME_COLORS },
    { id: "sizes", name: "Sizes", keys: ["radius", "pad", "gap", "border_width", "shadow_blur", "shadow_x", "shadow_y", "item_h", "check_size", "check_radius", "toggle_w", "toggle_h",
      "slider_h", "slider_track", "knob_size", "scroll_w", "scroll_min", "menu_item_h", "tab_h", "win_title_h", "app_title_h", "menubar_h", "statusbar_h", "focus_w", "focus_gap",
      "sep_w", "grip", "indent", "plot_w", "spinner", "caret_w", "win_min_w", "win_min_h", "pop_gap", "menu_gap", "tip_pad_x", "tip_pad_y", "tip_x", "tip_y", "tip_radius"] },
    { id: "text", name: "Text", keys: ["font_size", "heading_size", "small_size", "align"].concat(GM.THEME_FONTS) },
    { id: "motion", name: "Motion", keys: ["anim_ms", "ease", "hover_ms", "press_ms", "popup_ms", "collapse_ms", "toast_fade_ms"] },
  ];
  GM.THEME_HINT = {
    focus: "focus ring", select: "text selection", caret: "text caret", link: "links", badge: "badges", toast: "toast background", tooltip: "tooltip background", danger: "red close buttons", knob: "slider and toggle knobs", dim: "behind modals",
    item_h: "every widget row, 0 = from the font", menu_item_h: "0 = from the font", tab_h: "0 = from the font", win_title_h: "0 = from the font", app_title_h: "0 = from the font", menubar_h: "0 = from the font", statusbar_h: "0 = from the font",
    spinner: "0 = from the font", caret_w: "0 = thin, go wide for a block", heading_size: "0 = font size x 1.3", small_size: "0 = from the font", knob_size: "slider knob radius",
    hover_ms: "below 0 follows anim_ms", press_ms: "below 0 follows anim_ms", popup_ms: "below 0 follows anim_ms", collapse_ms: "below 0 follows anim_ms", toast_fade_ms: "below 0 follows anim_ms",
    font_heading: "system font name, empty = the ui font", font_mono: "system font name, empty = the ui font", font_small: "system font name, empty = the ui font",
  };
  GM.THEME_SKINS = ["skin_button", "skin_panel", "skin_input"];
  GM.EXTRA_SKINS = ["skin_scrollbar", "skin_slider_track", "skin_toggle", "skin_tab", "skin_titlebar", "skin_tooltip", "skin_menu", "skin_checkbox", "skin_radio", "skin_slider_fill", "skin_popup"];
  GM.ICON_NAMES = ["arrow_down", "arrow_right", "arrow_up", "arrow_left", "check", "radio_dot", "close", "minimize", "maximize", "restore", "resize",
    "sort_up", "sort_down", "plus", "minus", "slider_knob", "toggle_knob", "collapse", "expand", "drag_handle", "toast", "picker"];
  GM.SIZE_RANGE = {
    radius: [0, 30, 1], pad: [0, 30, 1], gap: [0, 30, 1], border_width: [0, 6, 0.5], font_size: [9, 28, 1], shadow_blur: [0, 60, 1], anim_ms: [0, 600, 10],
    check_size: [8, 40, 1], check_radius: [0, 20, 1], toggle_w: [20, 80, 1], toggle_h: [10, 44, 1], slider_h: [10, 44, 1], slider_track: [1, 20, 1], knob_size: [2, 20, 0.5],
    scroll_w: [1, 20, 1], scroll_min: [8, 80, 1], item_h: [0, 64, 1], menu_item_h: [0, 64, 1], tab_h: [0, 64, 1], win_title_h: [0, 64, 1], app_title_h: [0, 64, 1],
    menubar_h: [0, 64, 1], statusbar_h: [0, 64, 1], focus_w: [0, 6, 0.5], focus_gap: [0, 10, 0.5], sep_w: [0, 6, 0.5], grip: [6, 40, 1], indent: [0, 48, 1], plot_w: [0.5, 8, 0.5],
    spinner: [0, 64, 1], caret_w: [0, 16, 0.5], win_min_w: [40, 600, 1], win_min_h: [20, 400, 1], pop_gap: [0, 30, 1], menu_gap: [0, 30, 1], tip_pad_x: [0, 30, 1],
    tip_pad_y: [0, 30, 1], tip_x: [-40, 60, 1], tip_y: [-40, 60, 1], tip_radius: [0, 30, 1], shadow_x: [-30, 30, 1], shadow_y: [-30, 30, 1], align: [0, 3, 1],
    heading_size: [0, 48, 1], small_size: [0, 28, 1], ease: [0, 4, 1], hover_ms: [-1, 600, 10], press_ms: [-1, 600, 10], popup_ms: [-1, 600, 10], collapse_ms: [-1, 600, 10], toast_fade_ms: [-1, 1000, 10],
  };
  GM.THEME_REST = {
    focus: 0, select: 0, caret: 0, link: 0, badge: 0, toast: 0, tooltip: 0, danger: 0, knob: 0, dim: 0,
    check_size: 18, check_radius: 5, toggle_w: 38, toggle_h: 22, slider_h: 22, slider_track: 6, knob_size: 8, scroll_w: 4, scroll_min: 28,
    item_h: 0, menu_item_h: 0, tab_h: 0, win_title_h: 0, app_title_h: 0, menubar_h: 0, statusbar_h: 0,
    focus_w: 2, focus_gap: 3, sep_w: 1, grip: 18, indent: 16, plot_w: 2, spinner: 0, caret_w: 0,
    win_min_w: 140, win_min_h: 50, pop_gap: 6, menu_gap: 3, tip_pad_x: 10, tip_pad_y: 7, tip_x: 14, tip_y: 20, tip_radius: 8,
    shadow_x: 0, shadow_y: 5, align: 0, heading_size: 0, small_size: 0, ease: 0, hover_ms: -1, press_ms: -1, popup_ms: -1, collapse_ms: -1, toast_fade_ms: -1,
  };

  GM.DARK = {
    bg: 0xFF14161A, panel: 0xEC1B1D22, border: 0x1CFFFFFF, text: 0xFFE9EBEE, text_dim: 0xFF969CA6,
    accent: 0xFF6FDC5F, accent_text: 0xFF0F1D0C, hover: 0xFF363A44, active: 0xFF424752, input_bg: 0xFF272A31, shadow: 0x8C000000,
    radius: 10, pad: 10, gap: 8, border_width: 1, font_size: 15, shadow_blur: 22, anim_ms: 120,
  };
  GM.LIGHT = {
    bg: 0xFFF4F5F7, panel: 0xF4FDFDFE, border: 0x24000000, text: 0xFF1C1F24, text_dim: 0xFF656C77,
    accent: 0xFF45B934, accent_text: 0xFFFFFFFF, hover: 0xFFDCE0E5, active: 0xFFCDD2D9, input_bg: 0xFFE9ECF0, shadow: 0x40000000,
    radius: 10, pad: 10, gap: 8, border_width: 1, font_size: 15, shadow_blur: 22, anim_ms: 120,
  };

  Object.assign(GM.DARK, GM.THEME_REST);
  Object.assign(GM.LIGHT, GM.THEME_REST);
  const preset = (id, name, base, over) => Object.assign({ id, name, base, preset: true, skin_button: null, skin_panel: null, skin_input: null, icons: {}, icon_tint: 0 }, base === "light" ? GM.LIGHT : GM.DARK, over);
  GM.PRESETS = [
    preset("dark", "goome dark", "dark", {}),
    preset("light", "goome light", "light", {}),
    preset("midnight", "Midnight", "dark", {
      bg: 0xFF0E1320, panel: 0xF0151B2B, border: 0x22FFFFFF, text: 0xFFE6EAF2, text_dim: 0xFF8A94A8, accent: 0xFF6EA8FF,
      accent_text: 0xFF0B1424, hover: 0xFF243049, active: 0xFF2E3B58, input_bg: 0xFF1C2438, shadow: 0x99000000, radius: 8,
    }),
    preset("paper", "Paper", "light", {
      bg: 0xFFF3EFE6, panel: 0xFAFBF8F1, border: 0x2A3B2F1E, text: 0xFF2B2620, text_dim: 0xFF7A6F60, accent: 0xFFC0572B,
      accent_text: 0xFFFFFFFF, hover: 0xFFE7E0D2, active: 0xFFDCD3C1, input_bg: 0xFFEDE7DA, shadow: 0x30402A10, radius: 6, shadow_blur: 14,
    }),
    preset("mint", "Mint", "dark", {
      bg: 0xFF101815, panel: 0xEE16211C, border: 0x1E9BFFCB, text: 0xFFE3F2EA, text_dim: 0xFF86A397, accent: 0xFF5FE0A8,
      accent_text: 0xFF06231A, hover: 0xFF22332B, active: 0xFF2B4036, input_bg: 0xFF1B2923, radius: 12,
    }),
    preset("contrast", "High contrast", "dark", {
      bg: 0xFF000000, panel: 0xFF000000, border: 0xFFFFFFFF, text: 0xFFFFFFFF, text_dim: 0xFFD0D0D0, accent: 0xFFFFE600,
      accent_text: 0xFF000000, hover: 0xFF333333, active: 0xFF555555, input_bg: 0xFF1A1A1A, shadow: 0x00000000, radius: 4, border_width: 2, shadow_blur: 0,
    }),
    preset("rose", "Rose", "dark", {
      bg: 0xFF1C1418, panel: 0xEE241A1F, border: 0x22FFD6E4, text: 0xFFF5E8EE, text_dim: 0xFFB09AA5, accent: 0xFFF27BA6,
      accent_text: 0xFF2A0D18, hover: 0xFF3A2A31, active: 0xFF46333C, input_bg: 0xFF2E2228, radius: 14,
    }),
  ];
  GM.themeBase = (t) => (t && t.base === "light" ? GM.LIGHT : GM.DARK);
  GM.normTheme = (t) => {
    const base = GM.themeBase(t);
    const out = { id: (t && t.id) || GM.uid("t"), name: (t && t.name) || "My theme", base: t && t.base === "light" ? "light" : "dark" };
    for (const k of GM.THEME_COLORS) out[k] = t && Number.isFinite(+t[k]) ? (+t[k]) >>> 0 : base[k];
    for (const k of GM.THEME_SIZES) out[k] = t && Number.isFinite(+t[k]) ? +t[k] : base[k];
    for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) out[k] = t && t[k] && t[k].img ? { img: String(t[k].img), file: String(t[k].file || k + ".png"), l: +t[k].l || 0, t: +t[k].t || 0, r: +t[k].r || 0, b: +t[k].b || 0, iw: +t[k].iw || 0, ih: +t[k].ih || 0 } : null;
    out.icons = {};
    if (t && t.icons) for (const k of GM.ICON_NAMES) if (t.icons[k] && t.icons[k].img) out.icons[k] = { img: String(t.icons[k].img), file: String(t.icons[k].file || "icon_" + k + ".png") };
    out.icon_tint = t && +t.icon_tint ? 1 : 0;
    for (const k of GM.THEME_FONTS) out[k] = t && typeof t[k] === "string" ? t[k].slice(0, 80) : "";
    const q = t && t.quick;
    if (q) out.quick = { accent: (+q.accent >>> 0) || 0xFF6FDC5F, dark: q.dark !== false, radius: Number.isFinite(+q.radius) ? +q.radius : 10, scale: +q.scale > 0 ? Math.min(4, +q.scale) : 1 };
    return out;
  };
  GM.PRESET_ENUM = { dark: "DARK", light: "LIGHT", midnight: "MIDNIGHT", paper: "PAPER", mint: "MINT", contrast: "HIGH_CONTRAST", rose: "ROSE" };
  GM.themeMake = (accent, dark, radius) => {
    const t = Object.assign({}, dark ? GM.DARK : GM.LIGHT);
    const mix = (a, b, x) => {
      const k = Math.floor(Math.max(0, Math.min(1, x)) * 256 + 0.5);
      let o = 0;
      for (let s = 0; s < 32; s += 8) {
        const p = (a >>> s) & 255, q = (b >>> s) & 255;
        o += ((p + (((q - p) * k) >> 8)) & 255) * 2 ** s;
      }
      return o >>> 0;
    };
    const tint = (c, to, x) => mix(c, ((c & 0xFF000000) | (to & 0xFFFFFF)) >>> 0, x);
    accent = (accent | 0xFF000000) >>> 0;
    const lum = Math.trunc((((accent >>> 16) & 255) * 299 + ((accent >>> 8) & 255) * 587 + (accent & 255) * 114) / 1000);
    t.accent = accent;
    t.accent_text = lum > 150 ? mix(accent, 0xFF000000, 0.86) : 0xFFFFFFFF;
    const k = dark ? 1 : 0.6;
    t.bg = tint(t.bg, accent, 0.03 * k), t.panel = tint(t.panel, accent, 0.04 * k), t.input_bg = tint(t.input_bg, accent, 0.05 * k);
    t.hover = tint(t.hover, accent, 0.08 * k), t.active = tint(t.active, accent, 0.12 * k), t.text_dim = tint(t.text_dim, accent, 0.1 * k);
    if (!(radius >= 0)) radius = 10;
    t.radius = radius;
    t.check_radius = Math.min(Math.floor(radius * 0.5 + 0.5), 9), t.tip_radius = Math.min(Math.floor(radius * 0.8 + 0.5), 12);
    return t;
  };
  GM.themeScale = (t, s) => {
    if (!(s > 0) || s === 1) return t;
    for (const k of ["font_size", "radius", "pad", "gap", "border_width", "shadow_blur"]) t[k] *= s;
    GM.THEME_NEW_SIZES.forEach((k, i) => {
      if (!GM.THEME_EM[i]) t[k] *= s;
    });
    return t;
  };
  GM.applyQuick = (t) => {
    if (!t.quick) return t;
    const q = t.quick, m = GM.themeScale(GM.themeMake(q.accent, q.dark, q.radius), q.scale);
    for (const k of GM.THEME_COLORS.concat(GM.THEME_SIZES)) t[k] = m[k];
    t.base = q.dark ? "dark" : "light";
    return t;
  };
  GM.presetOf = (t) => {
    const pr = GM.PRESETS.find((x) => x.id === t.id) || GM.PRESETS.find((x) => x.base === t.base && GM.THEME_COLORS.every((k) => (x[k] >>> 0) === (t[k] >>> 0)) && GM.THEME_SIZES.every((k) => +x[k] === +t[k]));
    return pr && pr.base === t.base ? pr : null;
  };
  GM.CFG_NUMS = [
    ["tip_delay_ms", 500, 0, 3000, "tooltip delay"], ["dbl_click_ms", 450, 100, 1500, "double click time"], ["dbl_click_px", 5, 0, 40, "double click distance"],
    ["drag_px", 4, 0, 40, "drag threshold"], ["repeat_delay_ms", 380, 50, 2000, "key repeat delay"], ["repeat_ms", 55, 10, 500, "key repeat rate"],
    ["blink_ms", 530, 0, 2000, "caret blink, 0 = no blink"], ["menu_delay_ms", 120, 0, 1000, "submenu delay"], ["toast_ms", 3000, 200, 20000, "default toast time"],
    ["scroll_lines", 3, 0.25, 20, "scroll speed in lines"],
  ];
  GM.CFG_TOGGLES = [["raise_on_click", 1, "raise windows on click"], ["esc_closes", 1, "esc closes popups"], ["tab_nav", 1, "tab moves focus"], ["focus_on_mouse", 0, "focus ring after a mouse click too"]];
  GM.CFG_CURSORS = [["button", "ARROW"], ["input", "IBEAM"], ["link", "HAND"], ["drag_value", "RESIZE_EW"], ["split_x", "RESIZE_EW"], ["split_y", "RESIZE_NS"], ["grip", "RESIZE_NWSE"],
    ["column", "RESIZE_EW"], ["drag_drop", "MOVE"], ["custom_x", "RESIZE_EW"], ["custom_y", "RESIZE_NS"], ["custom_xy", "MOVE"]];
  GM.CURSOR_SHAPES = ["ARROW", "IBEAM", "HAND", "MOVE", "RESIZE_EW", "RESIZE_NS", "RESIZE_NWSE", "RESIZE_NESW", "WAIT", "NO", "HIDDEN"];
  GM.CFG_KEYS = [["copy", "ctrl+c super+c"], ["cut", "ctrl+x super+x"], ["paste", "ctrl+v super+v"], ["undo", "ctrl+z super+z"], ["redo", "ctrl+y ctrl+shift+z super+y super+shift+z"],
    ["select_all", "ctrl+a super+a"], ["word_left", "ctrl+left super+left"], ["word_right", "ctrl+right super+right"], ["del_word_left", "ctrl+backspace super+backspace"],
    ["del_word_right", "ctrl+delete super+delete"], ["doc_start", "ctrl+home super+home"], ["doc_end", "ctrl+end super+end"]];
  GM.CFG_MASK = "*";
  GM.normConfig = (c) => {
    c = c || {};
    const out = {};
    for (const [k, d, lo, hi] of GM.CFG_NUMS) out[k] = Number.isFinite(+c[k]) ? Math.max(lo, Math.min(hi, +c[k])) : d;
    for (const [k, d] of GM.CFG_TOGGLES) out[k] = c[k] == null ? d : c[k] ? 1 : 0;
    out.cursor = {};
    for (const [k, d] of GM.CFG_CURSORS) out.cursor[k] = c.cursor && GM.CURSOR_SHAPES.includes(c.cursor[k]) ? c.cursor[k] : d;
    out.keys = {};
    for (const [k, d] of GM.CFG_KEYS) out.keys[k] = c.keys && typeof c.keys[k] === "string" ? c.keys[k].replace(/[^\w+ ,]/g, "").slice(0, 120) : d;
    out.mask = typeof c.mask === "string" && c.mask.length ? Array.from(c.mask)[0] : GM.CFG_MASK;
    return out;
  };

  GM.CONTAINERS = { window: 1, row: 1, scroll: 1, split: 2, tabs: -1, collapsing: 1, tree: 1, modal: 1, popup: 1, menubar: 1, menu: 1 };
  GM.isContainer = (t) => !!GM.CONTAINERS[t];
  GM.slotCount = (n) => {
    const c = GM.CONTAINERS[n.type];
    if (!c) return 0;
    if (c === -1) return Math.max(1, GM.lines(n.p.items).length);
    return c;
  };
  GM.lines = (s) => String(s == null ? "" : s).split("\n").map((x) => x.trim()).filter((x) => x.length);

  const LEAF = { tooltip: "", width: 0 };
  GM.TYPES = {
    window: { name: "Window", cat: "Layout", p: { label: "Window", var: "win", x: 40, y: 40, w: 340, h: 0, move: true, resize: true, collapse: true, notitle: false, close: false } },
    row: { name: "Row", cat: "Layout", p: { cols: 0 } },
    same_line: { name: "Same line", cat: "Layout", p: {} },
    space: { name: "Space", cat: "Layout", p: { px: 12 } },
    separator: { name: "Separator", cat: "Layout", p: {} },
    scroll: { name: "Scroll area", cat: "Layout", p: { var: "list", h: 150 } },
    split: { name: "Split", cat: "Layout", p: { var: "panes", vertical: false, frac: 0.35 } },
    tabs: { name: "Tabs", cat: "Layout", p: { var: "tab", items: "General\nAdvanced", sel: 0 } },
    collapsing: { name: "Collapsing", cat: "Layout", p: { label: "More stuff", var: "more", open: true } },
    tree: { name: "Tree node", cat: "Layout", p: { label: "src", var: "src_open", open: true } },
    label: { name: "Label", cat: "Text", p: Object.assign({ label: "some text" }, LEAF) },
    heading: { name: "Heading", cat: "Text", p: Object.assign({ label: "Heading" }, LEAF) },
    wrapped: { name: "Wrapped text", cat: "Text", p: Object.assign({ label: "this text wraps when it runs into the edge of the window, so long lines are fine." }, LEAF) },
    button: { name: "Button", cat: "Input", p: Object.assign({ label: "Click me", action: "print", toast: "Saved", ms: 2500 }, LEAF) },
    checkbox: { name: "Checkbox", cat: "Input", p: Object.assign({ label: "Show grid", var: "show_grid", on: true }, LEAF) },
    toggle: { name: "Toggle", cat: "Input", p: Object.assign({ label: "Wi-Fi", var: "wifi", on: true }, LEAF) },
    radio: { name: "Radio group", cat: "Input", p: Object.assign({ var: "size", items: "Small\nMedium\nLarge", sel: 1, inline: true }, LEAF) },
    slider: { name: "Slider", cat: "Input", p: Object.assign({ label: "Volume", var: "volume", min: 0, max: 1, value: 0.65, fmt: "%.2f" }, LEAF) },
    slider_int: { name: "Slider int", cat: "Input", p: Object.assign({ label: "Count", var: "count", min: 0, max: 100, value: 42 }, LEAF) },
    input: { name: "Input", cat: "Input", p: Object.assign({ label: "Name", var: "name", text: "goome", cap: 64, hint: "", password: false, readonly: false, number: false, enter: false, noselect: false }, LEAF) },
    text_edit: { name: "Text edit", cat: "Input", p: Object.assign({ var: "notes", text: "type here", h: 140, cap: 4096, readonly: false, numbers: false, wrap: true, mono: false }, LEAF) },
    combo: { name: "Combo", cat: "Input", p: Object.assign({ label: "Fruit", var: "fruit", items: "Mango\nBanana\nCherry\nKiwi", sel: 0 }, LEAF) },
    selectable: { name: "Selectable list", cat: "Input", p: Object.assign({ var: "picked", items: "Item 1\nItem 2\nItem 3", sel: 0 }, LEAF) },
    color: { name: "Color", cat: "Input", p: Object.assign({ label: "Highlight", var: "highlight", color: 0xFF4FA3FF }, LEAF) },
    progress: { name: "Progress", cat: "Data", p: Object.assign({ value: 0.6, label: "60%" }, LEAF) },
    table: { name: "Table", cat: "Data", p: Object.assign({ var: "files", cols: "Name\nSize:90", rows: "notes.txt, 2 KB\nlogo.png, 18 KB\nbuild.sh, 1 KB", h: 0, sortable: false, resizable: false, stripes: true, borders: false }, LEAF) },
    plot_lines: { name: "Plot lines", cat: "Data", p: Object.assign({ label: "CPU", var: "cpu", values: "12 30 25 48 40 62 55 70 66 80", min: 0, max: 100, h: 90 }, LEAF) },
    plot_bars: { name: "Plot bars", cat: "Data", p: Object.assign({ label: "Requests", var: "requests", values: "4 9 6 12 8 15 11", min: 0, max: 0, h: 90 }, LEAF) },
    image: { name: "Image", cat: "Data", p: Object.assign({ w: 120, h: 80, radius: 10 }, LEAF) },
    menubar: { name: "Menu bar", cat: "Menus", p: {} },
    menu: { name: "Menu", cat: "Menus", p: { label: "File" } },
    menu_item: { name: "Menu item", cat: "Menus", p: { label: "Open", shortcut: "Ctrl+O", check: false, var: "", on: false } },
    menu_sep: { name: "Menu separator", cat: "Menus", p: {} },
    popup: { name: "Popup", cat: "Menus", p: { label: "more" } },
    modal: { name: "Modal", cat: "Menus", p: { label: "Settings", var: "settings_open", button: "Open settings" } },
    toast: { name: "Toast", cat: "Menus", alias: "button", p: Object.assign({ label: "Show toast", action: "toast", toast: "Saved", ms: 2500 }, LEAF) },
    el: { name: "Custom element", cat: "Custom", p: { el: "", var: "thing", x: 420, y: 60, w: 0, h: 0, params: {}, init: {} } },
  };

  GM.ACTIONS = { print: "Print to the console", toast: "Show a toast", close: "Close the popup or modal" };

  GM.accepts = (ptype, ctype) => {
    if (ctype === "toast") ctype = "button";
    if (ctype === "menu") return ptype === "menubar" || ptype === "menu";
    if (ctype === "menu_item" || ctype === "menu_sep") return ptype === "menu";
    if (ptype === "menubar" || ptype === "menu") return false;
    if (ctype === "window") return ptype === "overlay" || ptype === "app";
    if (ptype === "overlay") return ctype === "el";
    if (ptype === "row") return !GM.isContainer(ctype) && ctype !== "same_line";
    return true;
  };

  GM.newNode = (type, project) => {
    const def = GM.TYPES[type];
    const real = def.alias || type;
    const n = { id: GM.uid(), type: real, p: GM.clone(def.p) };
    const k = GM.slotCount(n);
    if (k) n.kids = Array.from({ length: k }, () => []);
    if (project && n.p.var) n.p.var = GM.uniqueVar(project, n.p.var);
    if (project && "label" in n.p && (real === "button" || real === "checkbox" || real === "toggle")) n.p.label = GM.uniqueLabel(project, real, n.p.label);
    if (real === "modal") {
      const t = GM.newNode("wrapped", null);
      t.p.label = "stuff in here sits on top of everything else.";
      const b = GM.newNode("button", null);
      b.p.label = "Done";
      b.p.action = "close";
      n.kids[0].push(t, b);
    }
    if (real === "menubar") {
      const m = GM.newNode("menu", null);
      const a = GM.newNode("menu_item", null);
      const s = GM.newNode("menu_sep", null);
      const q = GM.newNode("menu_item", null);
      q.p.label = "Quit";
      q.p.shortcut = "Ctrl+Q";
      m.kids[0].push(a, s, q);
      n.kids[0].push(m);
    }
    return n;
  };

  GM.walk = (list, fn, parent = null, slot = 0) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (fn(n, parent, slot, i, list) === false) return false;
      if (n.kids) for (let s = 0; s < n.kids.length; s++) if (GM.walk(n.kids[s], fn, n, s) === false) return false;
    }
  };

  GM.index = (project) => {
    const map = new Map();
    GM.walk(project.root, (n, parent, slot, i, list) => {
      map.set(n.id, { n, parent, slot, list });
    });
    return map;
  };

  const RESERVED = new Set(("u g c t s th ev err running dirty test pace main draw set_theme app img i j k x y w h mouse state ui " +
    "auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while " +
    "abstract as base bool byte catch checked class decimal delegate event explicit false finally fixed foreach implicit in interface internal is lock namespace new null object operator out override params private protected public readonly ref sbyte sealed stackalloc string this throw true try typeof uint ulong unchecked unsafe ushort using virtual var " +
    "and assert async await def del elif except exec from global import lambda nonlocal not or pass print raise with yield None True False self goome math sys array open min max abs list dict str len range type id " +
    "boolean extends final implements instanceof native package strictfp super synchronized throws transient record permits args " +
    "func signal onready tool export match when preload breakpoint class_name await PI TAU INF NAN clamp lerp floor ceil round sign load get set call free connect notification").split(/\s+/));
  GM.RESERVED = RESERVED;
  GM.ident = (s, fallback = "v") => {
    let v = String(s || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").replace(/__+/g, "_");
    if (!v) v = fallback;
    if (/^[0-9]/.test(v)) v = "v_" + v;
    if (RESERVED.has(v)) v += "_v";
    return v.slice(0, 40);
  };
  GM.allVars = (project, skipId) => {
    const set = new Set();
    GM.walk(project.root, (n) => {
      if (n.id !== skipId && n.p && n.p.var) set.add(n.p.var);
    });
    return set;
  };
  GM.uniqueVar = (project, base, skipId) => {
    const used = GM.allVars(project, skipId);
    let v = GM.ident(base);
    if (!used.has(v)) return v;
    const stem = v.replace(/_?\d+$/, "") || "v";
    for (let i = 2; ; i++) if (!used.has(stem + i)) return stem + i;
  };
  GM.uniqueLabel = (project, type, base) => {
    const used = new Set();
    GM.walk(project.root, (n) => {
      if (n.type === type && n.p.label) used.add(n.p.label);
    });
    if (!used.has(base)) return base;
    for (let i = 2; ; i++) if (!used.has(base + " " + i)) return base + " " + i;
  };

  GM.PART_KINDS = {
    rect: { name: "Rect", call: "goome_draw_rect", f: { x: 0, y: 0, w: 60, h: 30, color: "th.accent" } },
    rrect: { name: "Round rect", call: "goome_draw_rrect", f: { x: 0, y: 0, w: 60, h: 30, tl: 8, tr: 8, br: 8, bl: 8, color: "th.input_bg" } },
    frame: { name: "Frame", call: "goome_draw_frame", f: { x: 0, y: 0, w: 60, h: 30, width: 1, color: "th.border" } },
    line: { name: "Line", call: "goome_draw_line", f: { x0: 0, y0: 0, x1: 60, y1: 30, width: 2, color: "th.text_dim" } },
    circle: { name: "Circle", call: "goome_draw_circle", f: { cx: 15, cy: 15, r: 10, color: "th.accent" } },
    ring: { name: "Ring", call: "goome_draw_ring", f: { cx: 15, cy: 15, r: 10, width: 2, color: "th.text" } },
    arc: { name: "Arc", call: "goome_draw_arc", f: { cx: 30, cy: 30, r: 20, width: 4, a0: -1.5708, a1: 1.5708, color: "th.accent" } },
    poly: { name: "Poly", call: "goome_draw_poly", f: { points: "0,30 30,0 60,30", color: "th.accent" } },
    grad: { name: "Gradient", call: "goome_draw_rrect_grad", f: { x: 0, y: 0, w: 60, h: 30, radius: 8, from: "th.accent", to: "th.panel", sideways: false } },
    shadow: { name: "Shadow", call: "goome_draw_shadow", f: { x: 0, y: 0, w: 60, h: 30, radius: 8, blur: 12, color: "th.shadow" } },
    text: { name: "Text", call: "goome_text", f: { x: 0, y: 0, size: 15, text: "hello", color: "th.text" } },
    bitmap: { name: "Bitmap", call: "goome_draw_bitmap", f: { x: 0, y: 0, w: 48, h: 48, radius: 0, tint: 0xFFFFFFFF, img: "", file: "picture.png" } },
    hit: { name: "Hit area", call: "goome_ui_hit", f: { x: 0, y: 0, w: 60, h: 30 } },
    group: { name: "Group", call: "", f: { x: 0, y: 0, w: 30, h: 30, clip: false } },
    widget: { name: "Widget", call: "", f: { wtype: "button" } },
  };
  GM.NUM_FIELDS = new Set(["x", "y", "w", "h", "tl", "tr", "br", "bl", "width", "x0", "y0", "x1", "y1", "cx", "cy", "r", "a0", "a1", "radius", "blur", "size"]);
  GM.COLOR_FIELDS = new Set(["color", "from", "to", "tint"]);

  GM.newPart = (kind) => {
    const k = GM.PART_KINDS[kind];
    const p = { id: GM.uid("p"), kind, name: kind, show: "", f: GM.clone(k.f) };
    if (kind === "group") {
      p.kids = [];
      p.drag = { on: false, axis: "free", snap: 0, bounds: "element", rect: { x: 0, y: 0, w: 100, h: 40 }, handle: "" };
    }
    if (kind === "widget") p.w = GM.newNode("button", null);
    if (kind !== "hit" && kind !== "group" && kind !== "widget") p.hit = false;
    return p;
  };

  GM.newElement = (name) => ({
    id: GM.uid("e"), name: GM.ident(name || "thing"), w: 120, h: 40,
    resizable: { on: false, minW: 40, minH: 20, maxW: 400, maxH: 300 },
    params: [], state: [], hit: "box",
    value: { src: "none", state: "", part: "", axis: "x", min: 0, max: 1 },
    events: [], parts: [],
  });

  GM.sampleElements = () => {
    const sw = GM.newElement("pill_switch");
    sw.w = 56, sw.h = 30;
    sw.params.push({ name: "on_color", type: "color", def: 0xFF6FDC5F });
    sw.state.push({ name: "on", type: "bool", def: true });
    const bg = GM.newPart("rrect");
    bg.name = "track";
    Object.assign(bg.f, { x: 0, y: 0, w: "w", h: "h", tl: "h / 2", tr: "h / 2", br: "h / 2", bl: "h / 2", color: "on ? on_color : (hovered ? th.hover : th.input_bg)" });
    const kn = GM.newPart("circle");
    kn.name = "knob";
    Object.assign(kn.f, { cx: "on ? w - h / 2 : h / 2", cy: "h / 2", r: "h / 2 - 4", color: "0xFFFFFFFF" });
    sw.parts.push(bg, kn);
    sw.events.push({ on: "click", act: "toggle", target: "on", expr: "", text: "" });

    const sl = GM.newElement("knob_slider");
    sl.w = 220, sl.h = 28;
    sl.state.push({ name: "level", type: "num", def: 0.5 });
    sl.value = { src: "drag", state: "level", part: "", axis: "x", min: 0, max: 1 };
    const rail = GM.newPart("rrect");
    rail.name = "rail";
    Object.assign(rail.f, { x: 0, y: "h / 2 - 3", w: "w", h: 6, tl: 3, tr: 3, br: 3, bl: 3, color: "th.input_bg" });
    const fill = GM.newPart("rrect");
    fill.name = "fill";
    Object.assign(fill.f, { x: 0, y: "h / 2 - 3", w: "knob_dx + 14", h: 6, tl: 3, tr: 3, br: 3, bl: 3, color: "th.accent" });
    const g = GM.newPart("group");
    g.name = "knob";
    Object.assign(g.f, { x: 0, y: 0, w: 28, h: 28 });
    g.drag = { on: true, axis: "x", snap: 0, bounds: "element", rect: { x: 0, y: 0, w: 220, h: 28 }, handle: "" };
    const kc = GM.newPart("circle");
    Object.assign(kc.f, { cx: 14, cy: 14, r: "dragging ? 11 : 10", color: "0xFFFFFFFF" });
    const kr = GM.newPart("ring");
    Object.assign(kr.f, { cx: 14, cy: 14, r: "dragging ? 11 : 10", width: 1, color: "0x30000000" });
    g.kids.push(kc, kr);
    sl.parts.push(rail, fill, g);
    sl.value.part = g.id;
    return [sw, sl];
  };

  GM.TEMPLATES = () => {
    const part = (kind, name, f, extra) => Object.assign(GM.newPart(kind), { name }, extra || {}, { f: Object.assign(GM.newPart(kind).f, f) });
    const grp = (name, f, drag, kids) => {
      const g = part("group", name, f);
      Object.assign(g.drag, drag);
      g.kids = kids || [];
      return g;
    };
    const el = (name, about, w, h) => Object.assign(GM.newElement(name), { about, w, h });

    const knob = el("knob", "drag up or down to turn it, 0 to 1", 64, 64);
    knob.state.push({ name: "level", type: "num", def: 0.5 });
    const grip = grp("grip", { x: 0, y: -30, w: 64, h: 124 }, { on: true, axis: "y", snap: 0, bounds: "rect", rect: { x: 0, y: -60, w: 64, h: 184 } });
    knob.parts.push(
      part("arc", "track", { cx: 32, cy: 32, r: 26, width: 6, a0: 2.3562, a1: 7.0686, color: "th.input_bg" }),
      part("arc", "amount", { cx: 32, cy: 32, r: 26, width: 6, a0: 2.3562, a1: "2.3562 + max(value, 0.001) * 4.7124", color: "th.accent" }),
      part("circle", "cap", { cx: 32, cy: 32, r: "dragging ? 17 : 16", color: "hovered ? th.hover : th.input_bg" }),
      grip);
    knob.value = { src: "drag", state: "level", part: grip.id, axis: "y", min: 1, max: 0 };

    const sl = el("slider_handle", "x only, snaps to 10 steps, stays on the track", 240, 28);
    sl.state.push({ name: "amount", type: "num", def: 0.5 });
    const hd = grp("handle", { x: 0, y: 0, w: 20, h: 28 }, { on: true, axis: "x", snap: 22, bounds: "element" }, [
      part("rrect", "body", { x: 0, y: 2, w: 20, h: 24, tl: 6, tr: 6, br: 6, bl: 6, color: "dragging ? th.accent : 0xFFFFFFFF" }),
      part("rrect", "edge", { x: 9, y: 8, w: 2, h: 12, tl: 1, tr: 1, br: 1, bl: 1, color: "0x40000000" }),
    ]);
    sl.parts.push(
      part("rrect", "track", { x: 0, y: 11, w: "w", h: 6, tl: 3, tr: 3, br: 3, bl: 3, color: "th.input_bg" }),
      part("rrect", "fill", { x: 0, y: 11, w: "handle_dx + 10", h: 6, tl: 3, tr: 3, br: 3, bl: 3, color: "th.accent" }),
      hd);
    sl.value = { src: "drag", state: "amount", part: hd.id, axis: "x", min: 0, max: 1 };

    const nb = el("node_box", "a box you can drag anywhere inside, snaps to 10", 300, 200);
    nb.params.push({ name: "title", type: "text", def: "Node" }, { name: "body", type: "text", def: "drag me by the title" });
    const node = grp("node", { x: 20, y: 20, w: 150, h: 84 }, { on: true, axis: "free", snap: 10, bounds: "element" });
    const bar = part("rrect", "bar", { x: 0, y: 0, w: 150, h: 26, tl: 8, tr: 8, br: 0, bl: 0, color: "dragging ? th.accent : th.hover" });
    node.kids.push(
      part("shadow", "shade", { x: 0, y: 4, w: 150, h: 84, radius: 8, blur: 14, color: "th.shadow" }),
      part("rrect", "panel", { x: 0, y: 0, w: 150, h: 84, tl: 8, tr: 8, br: 8, bl: 8, color: "th.input_bg" }),
      bar,
      part("text", "title", { x: 10, y: 5, size: 14, text: "{title}", color: "dragging ? th.accent_text : th.text" }),
      part("text", "body", { x: 10, y: 38, size: 13, text: "{body}", color: "th.text_dim" }));
    node.drag.handle = bar.id;
    nb.parts.push(part("frame", "edge", { x: 0, y: 0, w: "w", h: "h", width: 1, color: "th.border" }), node);

    const pill = el("toggle_pill", "click it to flip it", 64, 32);
    pill.state.push({ name: "on", type: "bool", def: false });
    pill.parts.push(
      part("rrect", "track", { x: 0, y: 0, w: "w", h: "h", tl: "h / 2", tr: "h / 2", br: "h / 2", bl: "h / 2", color: "on ? th.accent : (hovered ? th.hover : th.input_bg)" }),
      part("circle", "knob", { cx: "on ? w - h / 2 : h / 2", cy: "h / 2", r: "pressed ? h / 2 - 3 : h / 2 - 4", color: "0xFFFFFFFF" }));
    pill.events.push({ on: "click", act: "toggle", target: "on", expr: "", text: "" });

    const sw = el("swatch", "a color you can pick, rings on hover", 44, 44);
    sw.params.push({ name: "color", type: "color", def: 0xFF4FA3FF });
    sw.state.push({ name: "picked", type: "bool", def: false });
    sw.parts.push(
      part("ring", "hover_ring", { cx: 22, cy: 22, r: 20, width: 2, color: "th.text_dim" }, { show: "hovered && !picked" }),
      part("ring", "picked_ring", { cx: 22, cy: 22, r: 20, width: 3, color: "th.accent" }, { show: "picked" }),
      part("circle", "fill", { cx: 22, cy: 22, r: "pressed ? 14 : 15", color: "color" }));
    sw.events.push({ on: "click", act: "set", target: "picked", expr: "true", text: "" });

    const pr = el("progress_ring", "shows a 0 to 1 value as a ring", 72, 72);
    pr.params.push({ name: "label", type: "text", def: "65%" });
    pr.state.push({ name: "progress", type: "num", def: 0.65 });
    pr.parts.push(
      part("arc", "back", { cx: 36, cy: 36, r: 30, width: 7, a0: 0, a1: 6.2832, color: "th.input_bg" }),
      part("arc", "done", { cx: 36, cy: 36, r: 30, width: 7, a0: -1.5708, a1: "-1.5708 + max(min(value, 1), 0.001) * 6.2832", color: "th.accent" }),
      part("text", "label", { x: 21, y: 27, size: 15, text: "{label}", color: "th.text" }));
    pr.value = { src: "state", state: "progress", part: "", axis: "x", min: 0, max: 1 };

    return [knob, sl, nb, pill, sw, pr];
  };

  GM.starterProject = () => {
    const p = {
      format: "goome-project", version: 1, name: "my ui", mode: "overlay", title: "goome ui",
      app: { w: 960, h: 640, titlebar: false, menubar: false, statusbar: false, nopad: false, status: "ready" },
      root: [], theme: GM.normTheme(GM.PRESETS[0]), themes: [], elements: GM.sampleElements(),
      grid: { size: 8, snap: true, show: false }, vars: [], hotkeys: [], config: GM.normConfig(),
    };
    const w = GM.newNode("window", p);
    w.p.label = "goome ui";
    p.root.push(w);
    for (const t of ["heading", "button", "checkbox", "toggle", "slider", "input", "combo", "progress"]) {
      const n = GM.newNode(t, p);
      if (t === "heading") n.p.label = "Hello";
      w.kids[0].push(n);
    }
    return p;
  };

  const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  GM.normProject = (o) => {
    const p = GM.starterProject();
    if (!o || typeof o !== "object") return p;
    const out = {
      format: "goome-project", version: 1, name: String(o.name || "my ui"), mode: o.mode === "app" ? "app" : "overlay", title: String(o.title || "goome ui"),
      app: Object.assign({}, p.app, o.app || {}), root: Array.isArray(o.root) ? o.root : [], theme: GM.applyQuick(GM.normTheme(o.theme || GM.PRESETS[0])),
      themes: Array.isArray(o.themes) ? o.themes.map(GM.normTheme) : [], elements: Array.isArray(o.elements) ? o.elements.map(GM.normElement) : [],
      grid: Object.assign({}, p.grid, o.grid || {}),
      vars: Array.isArray(o.vars) ? o.vars.filter((v) => v && v.name && GM.VAR_TYPES[v.type]).map((v) => Object.assign({ id: GM.uid("v"), min: 0, max: 1 }, v)) : [],
      hotkeys: Array.isArray(o.hotkeys) ? o.hotkeys.filter((k) => k && k.combo) : [],
      config: GM.normConfig(o.config),
    };
    if (o.settings && typeof o.settings === "object") out.settings = Object.assign({}, GM.SETTINGS_DEFAULT, o.settings);
    GM.walk(out.root, (n) => {
      if (!n.id) n.id = GM.uid();
      const def = GM.TYPES[n.type];
      n.p = Object.assign(GM.clone(def ? def.p : {}), n.p || {});
      const k = GM.slotCount(n);
      if (k) {
        n.kids = Array.isArray(n.kids) ? n.kids : [];
        while (n.kids.length < k) n.kids.push([]);
      }
    });
    out.root = out.root.filter((n) => GM.TYPES[n.type]);
    return out;
  };

  GM.normElement = (e) => {
    const d = GM.newElement(e && e.name);
    if (!e) return d;
    const out = Object.assign(d, GM.clone(e));
    out.id = out.id || GM.uid("e");
    out.name = GM.ident(out.name);
    out.resizable = Object.assign(GM.newElement().resizable, out.resizable || {});
    out.value = Object.assign(GM.newElement().value, out.value || {});
    for (const k of ["params", "state", "events", "parts"]) out[k] = Array.isArray(out[k]) ? out[k].filter(plain) : [];
    for (const x of out.params.concat(out.state)) if (typeof x.name !== "string" || !/^[A-Za-z_]\w*$/.test(x.name)) x.name = GM.ident(typeof x.name === "string" ? x.name : "");
    const fix = (list) => list.forEach((pt) => {
      pt.id = pt.id || GM.uid("p");
      const k = GM.PART_KINDS[pt.kind];
      if (k) pt.f = Object.assign(GM.clone(k.f), pt.f || {});
      if (pt.kind === "group") {
        pt.kids = Array.isArray(pt.kids) ? pt.kids : [];
        pt.drag = Object.assign({ on: false, axis: "free", snap: 0, bounds: "element", rect: { x: 0, y: 0, w: 100, h: 40 }, handle: "" }, pt.drag || {});
        fix(pt.kids);
      }
    });
    fix(out.parts);
    return out;
  };

  GM.walkParts = (parts, fn, parent = null) => {
    for (const pt of parts) {
      fn(pt, parent);
      if (pt.kids) GM.walkParts(pt.kids, fn, pt);
    }
  };
  GM.dragGroups = (def) => {
    const out = [];
    GM.walkParts(def.parts, (pt) => {
      if (pt.kind === "group" && pt.drag && pt.drag.on) out.push(pt);
    });
    return out;
  };
  GM.partVar = (pt) => GM.ident(pt.name || pt.kind, "part");

  GM.elementIdents = (def) => {
    const types = { w: "n", h: "n", hovered: "b", pressed: "b", dragging: "b", value: "n" };
    for (const p of def.params) types[p.name] = p.type === "color" ? "c" : p.type === "bool" ? "b" : p.type === "text" ? "s" : "n";
    for (const s of def.state) types[s.name] = s.type === "bool" ? "b" : "n";
    for (const g of GM.dragGroups(def)) {
      types[GM.partVar(g) + "_dx"] = "n";
      types[GM.partVar(g) + "_dy"] = "n";
    }
    return types;
  };

  const E = {};
  GM.expr = E;
  const OPS = ["&&", "||", "==", "!=", "<=", ">=", "<", ">", "+", "-", "*", "/", "!", "?", ":", "(", ")", ","];
  E.FUNCS = { min: 2, max: 2, abs: 1 };
  E.tokens = (src) => {
    const out = [];
    let i = 0;
    const s = String(src);
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      let m;
      const rest = s.slice(i);
      if ((m = /^0x[0-9a-f]+/i.exec(rest))) out.push({ k: "hex", v: parseInt(m[0], 16) >>> 0, s: m[0] });
      else if ((m = /^#([0-9a-f]{8}|[0-9a-f]{6})(?![0-9a-z])/i.exec(rest))) {
        const h = m[1];
        const v = h.length === 6 ? (0xFF000000 | parseInt(h, 16)) >>> 0 : ((parseInt(h.slice(6), 16) << 24) | parseInt(h.slice(0, 6), 16)) >>> 0;
        out.push({ k: "hex", v, s: m[0] });
      } else if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) out.push({ k: "num", v: parseFloat(m[0]), s: m[0] });
      else if ((m = /^[a-z_]\w*(\.[a-z_]\w*)?/i.exec(rest))) out.push({ k: "id", v: m[0], s: m[0] });
      else {
        const op = OPS.find((o) => rest.startsWith(o));
        if (!op) throw new Error("dont know what '" + c + "' means here");
        out.push({ k: "op", v: op, s: op });
        m = [op];
      }
      i += m[0].length;
    }
    return out;
  };
  E.parse = (src) => {
    const tk = E.tokens(src);
    let i = 0;
    const peek = () => tk[i];
    const isop = (v) => tk[i] && tk[i].k === "op" && tk[i].v === v;
    const want = (v) => {
      if (!isop(v)) throw new Error("expected '" + v + "'");
      i++;
    };
    const prim = () => {
      const t = tk[i++];
      if (!t) throw new Error("ends too early");
      if (t.k === "num") return { t: "num", v: t.v };
      if (t.k === "hex") return { t: "hex", v: t.v };
      if (t.k === "op" && t.v === "(") {
        const e = tern();
        want(")");
        return e;
      }
      if (t.k === "op" && (t.v === "-" || t.v === "!")) return { t: "un", op: t.v, a: unary() };
      if (t.k === "id") {
        if (t.v === "true" || t.v === "false") return { t: "bool", v: t.v === "true" };
        if (t.v.startsWith("th.")) {
          const f = t.v.slice(3);
          if (!GM.THEME_COLORS.includes(f) && !GM.THEME_SIZES.includes(f)) throw new Error("theme has no " + f);
          return { t: "th", f };
        }
        if (t.v.includes(".")) throw new Error("only th.<field> can have a dot");
        if (isop("(")) {
          if (!(t.v in E.FUNCS)) throw new Error("no function called " + t.v);
          i++;
          const args = [];
          if (!isop(")")) {
            args.push(tern());
            while (isop(",")) i++, args.push(tern());
          }
          want(")");
          if (args.length !== E.FUNCS[t.v]) throw new Error(t.v + " wants " + E.FUNCS[t.v] + " values");
          return { t: "call", fn: t.v, args };
        }
        return { t: "id", name: t.v };
      }
      throw new Error("didnt expect '" + t.s + "'");
    };
    const unary = () => prim();
    const LV = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/"]];
    const bin = (lv) => {
      if (lv >= LV.length) return unary();
      let a = bin(lv + 1);
      while (tk[i] && tk[i].k === "op" && LV[lv].includes(tk[i].v)) {
        const op = tk[i++].v;
        a = { t: "bin", op, a, b: bin(lv + 1) };
      }
      return a;
    };
    const tern = () => {
      const c = bin(0);
      if (isop("?")) {
        i++;
        const a = tern();
        want(":");
        return { t: "tern", c, a, b: tern() };
      }
      return c;
    };
    if (!tk.length) throw new Error("empty");
    const e = tern();
    if (i < tk.length) throw new Error("didnt expect '" + tk[i].s + "'");
    return e;
  };
  E.type = (a, types) => {
    switch (a.t) {
      case "num": return "n";
      case "hex": return "c";
      case "bool": return "b";
      case "th": return GM.THEME_COLORS.includes(a.f) ? "c" : "n";
      case "id": {
        const t = types[a.name];
        if (!t) throw new Error("dont know " + a.name);
        if (t === "s") throw new Error(a.name + " is text, use it as {" + a.name + "} in a text part");
        return t;
      }
      case "call": a.args.forEach((x) => {
        if (E.type(x, types) === "b") throw new Error(a.fn + " wants numbers");
      });
        return "n";
      case "un": {
        const t = E.type(a.a, types);
        if (a.op === "-") {
          if (t === "b") throw new Error("cant negate a yes/no");
          return "n";
        }
        return "b";
      }
      case "tern": {
        E.type(a.c, types);
        const x = E.type(a.a, types), y = E.type(a.b, types);
        if ((x === "b") !== (y === "b")) throw new Error("both sides of ? : need the same kind of value");
        return x === y ? x : "n";
      }
      case "bin": {
        const x = E.type(a.a, types), y = E.type(a.b, types);
        if ("+-*/".includes(a.op)) {
          if (x === "b" || y === "b") throw new Error("cant do math on a yes/no, try (on ? 10 : 0)");
          return "n";
        }
        if (a.op === "&&" || a.op === "||") return "b";
        if ((x === "b") !== (y === "b") && a.op !== "==" && a.op !== "!=") throw new Error("cant compare a yes/no with a number");
        return "b";
      }
    }
    throw new Error("bad expression");
  };
  E.check = (src, types, want) => {
    try {
      const ast = typeof src === "number" ? { t: Number.isInteger(src) && src > 0xFFFFFF ? "hex" : "num", v: src } : E.parse(src);
      const t = E.type(ast, types);
      if (want === "c" && t !== "c") throw new Error("this needs a color like 0xFF6FDC5F, #6fdc5f or th.accent");
      if (want === "n" && t === "b") throw new Error("this needs a number");
      if (want === "b" && t !== "b" && t !== "n") throw new Error("this needs a yes/no");
      return { ok: true, ast, type: t };
    } catch (e) {
      return { ok: false, err: e.message };
    }
  };
  E.eval = (a, env) => {
    switch (a.t) {
      case "num": case "hex": return a.v;
      case "bool": return a.v;
      case "th": return env.th[a.f];
      case "id": return env.v[a.name];
      case "call": {
        const v = a.args.map((x) => +E.eval(x, env));
        return a.fn === "min" ? Math.min(v[0], v[1]) : a.fn === "max" ? Math.max(v[0], v[1]) : Math[a.fn](v[0]);
      }
      case "un": return a.op === "-" ? -E.eval(a.a, env) : !E.eval(a.a, env);
      case "tern": return E.eval(a.c, env) ? E.eval(a.a, env) : E.eval(a.b, env);
      case "bin": {
        const x = E.eval(a.a, env);
        if (a.op === "&&") return !!x && !!E.eval(a.b, env);
        if (a.op === "||") return !!x || !!E.eval(a.b, env);
        const y = E.eval(a.b, env);
        switch (a.op) {
          case "+": return +x + +y;
          case "-": return x - y;
          case "*": return x * y;
          case "/": return y === 0 ? 0 : x / y;
          case "<": return x < y;
          case ">": return x > y;
          case "<=": return x <= y;
          case ">=": return x >= y;
          case "==": return x == y;
          case "!=": return x != y;
        }
      }
    }
    return 0;
  };
  const PREC = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6 };
  const numStr = (v) => {
    if (Number.isInteger(v)) return String(v);
    return String(+v.toFixed(6));
  };
  E.code = (a, lang, map, types) => {
    const gd = lang === "gd", jv = lang === "java", py = lang === "py" || gd, cs = lang === "cs" || jv;
    const tyOf = (x) => {
      try {
        return E.type(x, types);
      } catch (e) {
        return "n";
      }
    };
    const asBool = (x) => {
      const s = go(x, 0);
      if (cs && tyOf(x) !== "b") return "(" + s + " != 0)";
      return s;
    };
    const go = (x, outer) => {
      switch (x.t) {
        case "num": return numStr(x.v);
        case "hex": {
          const v = x.v >>> 0;
          if (gd) return "Color.hex(0x" + ((((v & 0xFFFFFF) << 8) | (v >>> 24)) >>> 0).toString(16).toUpperCase().padStart(8, "0") + ")";
          return "0x" + v.toString(16).toUpperCase().padStart(8, "0") + (lang === "cs" ? "u" : "");
        }
        case "bool": return gd ? String(x.v) : py ? (x.v ? "True" : "False") : cs ? String(x.v) : x.v ? "1" : "0";
        case "th": return map.th(x.f);
        case "id": return map.id(x.name);
        case "call": {
          const args = x.args.map((y) => go(y, 0)).join(", ");
          const fnc = { min: "gm_min", max: "gm_max", abs: "gm_abs" };
          const fcs = { min: "Math.Min", max: "Math.Max", abs: "Math.Abs", sin: "Math.Sin", cos: "Math.Cos", sqrt: "Math.Sqrt" };
          const fpy = { min: "min", max: "max", abs: "abs", sin: "math.sin", cos: "math.cos", sqrt: "math.sqrt" };
          const fjv = { min: "Math.min", max: "Math.max", abs: "Math.abs", sin: "Math.sin", cos: "Math.cos", sqrt: "Math.sqrt" };
          const fgd = { min: "min", max: "max", abs: "abs", sin: "sin", cos: "cos", sqrt: "sqrt" };
          return (gd ? fgd : py ? fpy : jv ? fjv : cs ? fcs : fnc)[x.fn] + "(" + args + ")";
        }
        case "un":
          if (x.op === "-") return "-" + go(x.a, 7);
          if (py) return "(not " + go(x.a, 7) + ")";
          if (cs && tyOf(x.a) !== "b") return "(" + go(x.a, 0) + " == 0)";
          return "!" + go(x.a, 7);
        case "tern": {
          const s = py ? go(x.a, 0) + " if " + go(x.c, 0) + " else " + go(x.b, 0) : asBool(x.c) + " ? " + go(x.a, 0) + " : " + go(x.b, 0);
          return "(" + s + ")";
        }
        case "bin": {
          const p = PREC[x.op];
          let op = x.op;
          let l, r;
          if (op === "&&" || op === "||") {
            if (py) op = op === "&&" ? "and" : "or";
            l = cs ? asBool(x.a) : go(x.a, p);
            r = cs ? asBool(x.b) : go(x.b, p + 1);
          } else {
            l = go(x.a, p);
            r = go(x.b, p + 1);
            if (op === "/" && (!py || gd) && (x.a.t === "num" || x.a.t === "hex") && (x.b.t === "num" || x.b.t === "hex") && !l.includes(".")) l = l + ".0";
          }
          const s = l + " " + op + " " + r;
          return p < outer ? "(" + s + ")" : s;
        }
      }
      return "0";
    };
    return go(a, 0);
  };

  GM.VAR_TYPES = { bool: "yes/no", int: "whole number", float: "number", string: "text", color: "color", list: "list of text" };
  GM.varDefault = (type) => ({ bool: false, int: 0, float: 0, string: "", color: 0xFF6FDC5F, list: "one\ntwo\nthree" })[type];
  GM.newVar = (project, type, base) => {
    const v = { id: GM.uid("v"), name: GM.uniqueVar(project, base || type), type, def: GM.varDefault(type), min: 0, max: type === "int" ? 100 : 1 };
    return v;
  };
  GM.BIND = {
    checkbox: ["bool"], toggle: ["bool"], slider: ["float", "int"], slider_int: ["int"], input: ["string"], text_edit: ["string"],
    combo: ["int"], radio: ["int"], selectable: ["int"], tabs: ["int"], color: ["color"], collapsing: ["bool"], tree: ["bool"],
    modal: ["bool"], window: ["bool"], progress: ["float", "int"], menu_item: ["bool"], popup: ["bool"],
  };
  GM.ITEMS_FROM_LIST = { combo: 1, radio: 1, selectable: 1, tabs: 1 };
  GM.EVENTS = {
    button: ["click", "hover"], checkbox: ["change", "on", "off", "hover"], toggle: ["change", "on", "off", "hover"],
    slider: ["change", "hover"], slider_int: ["change", "hover"], input: ["change", "enter", "hover"], text_edit: ["change"], combo: ["change", "hover"],
    radio: ["change"], selectable: ["change"], color: ["change", "hover"], tabs: ["change"], collapsing: ["change"], tree: ["change"],
    menu_item: ["click"], el: ["click", "change", "dragend", "hover"], label: ["hover"], heading: ["hover"], image: ["hover"], progress: ["hover"],
  };
  GM.EVENT_NAMES = { click: "When clicked", change: "When it changes", on: "When turned on", off: "When turned off", hover: "When the mouse gets on it", enter: "When enter is pressed", dragend: "When a drag ends" };
  GM.ACTION_KINDS = {
    set: "Set a variable", toggle: "Flip a yes/no", add: "Add to a variable", sub: "Take from a variable", open: "Open a window, modal or popup",
    close: "Close a window, modal or popup", toast: "Show a toast", tab: "Switch tab", copy: "Copy text to the clipboard", quit: "Close the app", call: "Call my function",
  };
  GM.newAction = (kind) => ({ do: kind, var: "", value: "", target: "", tab: 0, text: kind === "toast" ? "done" : kind === "copy" ? "" : "", ms: 2500, fn: kind === "call" ? "on_click" : "" });
  GM.varByName = (project, name) => (project.vars || []).find((v) => v.name === name);
  GM.varById = (project, id) => (project.vars || []).find((v) => v.id === id);
  GM.layoutIdents = (project) => {
    const types = {};
    const map = { bool: "b", int: "n", float: "n", color: "c", string: "s", list: "s" };
    for (const v of project.vars || []) types[v.name] = map[v.type] || "n";
    const own = { checkbox: "b", toggle: "b", collapsing: "b", tree: "b", modal: "b", slider: "n", slider_int: "n", combo: "n", radio: "n", selectable: "n", tabs: "n", color: "c", input: "s", text_edit: "s" };
    GM.walk(project.root || [], (n) => {
      if (n.p && n.p.var && !n.p.bind && own[n.type] && !(n.p.var in types)) types[n.p.var] = own[n.type];
    });
    return types;
  };
  GM.interp = (text) => {
    const parts = [];
    const re = /\{([a-z_]\w*)\}/gi;
    let last = 0, m;
    const s = String(text == null ? "" : text);
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push({ t: s.slice(last, m.index) });
      parts.push({ v: m[1] });
      last = re.lastIndex;
    }
    if (last < s.length) parts.push({ t: s.slice(last) });
    return parts;
  };
  GM.SETTINGS_DEFAULT = {
    autoPin: true, autoVar: false, nameStyle: "snake", showHits: false, showHidden: false, defaultTheme: "dark", defaultMode: "overlay",
    indent: 4, braces: "kr", confirmDelete: false, autosave: 250, iconSource: "embed",
  };

  GM.styleCount = (st) => {
    if (!st) return 0;
    let k = st.theme ? 1 : 0;
    for (const f of GM.THEME_COLORS) if (st.c && st.c[f] != null) k++;
    for (const f of GM.THEME_SIZES) if (st.n && st.n[f] != null) k++;
    if (Array.isArray(st.radii) && st.radii.length === 4) k++;
    return k;
  };
  GM.findTheme = (project, id) => (id ? (project.themes || []).find((t) => t.id === id) || GM.PRESETS.find((t) => t.id === id) || null : null);
  GM.styledTheme = (project, base, st) => {
    let t = base;
    if (!st) return t;
    const sec = GM.findTheme(project, st.theme);
    if (sec) t = Object.assign({}, t, GM.normTheme(sec), { skin_button: t.skin_button, skin_panel: t.skin_panel, skin_input: t.skin_input });
    if (st.c || st.n) t = Object.assign({}, t, st.c || {}, st.n || {});
    return t;
  };

  GM.argbCss = (c) => {
    c = c >>> 0;
    return "rgba(" + ((c >>> 16) & 255) + "," + ((c >>> 8) & 255) + "," + (c & 255) + "," + +(((c >>> 24) & 255) / 255).toFixed(3) + ")";
  };
  GM.fade = (c, k) => ((Math.max(0, Math.min(255, Math.round(((c >>> 24) & 255) * k))) << 24) | (c & 0xFFFFFF)) >>> 0;
  GM.mix = (a, b, k) => {
    let out = 0;
    for (let s = 0; s < 32; s += 8) {
      const x = (a >>> s) & 255, y = (b >>> s) & 255;
      out |= Math.round(x + (y - x) * k) << s;
    }
    return out >>> 0;
  };
  GM.hex8 = (c) => "0x" + (c >>> 0).toString(16).toUpperCase().padStart(8, "0");

  if (typeof module !== "undefined" && module.exports) module.exports = GM;
  else root.GM = GM;
})(typeof window !== "undefined" ? window : globalThis);
