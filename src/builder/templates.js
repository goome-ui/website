(function (root) {
  const GM = root.GM || (typeof require !== "undefined" ? require("./model.js") : null);

  function kit() {
    let k = 0;
    const vars = [];
    const V = (name, type, def, min, max) => {
      const v = { id: GM.uid("v"), name, type, def, min: min == null ? 0 : min, max: max == null ? (type === "int" ? 100 : 1) : max };
      vars.push(v);
      return v;
    };
    const N = (type, p, kids) => {
      const n = GM.newNode(type, null);
      Object.assign(n.p, p || {});
      if (n.p.var === GM.TYPES[n.type].p.var && n.p.var) n.p.var = n.p.var + "_" + ++k;
      if (kids) n.kids = kids.length && !Array.isArray(kids[0]) ? [kids] : kids;
      else if (n.kids && n.type !== "modal" && n.type !== "menubar") n.kids = n.kids.map(() => []);
      const cnt = GM.slotCount(n);
      if (cnt) while (n.kids.length < cnt) n.kids.push([]);
      return n;
    };
    const B = (type, v, p, kids) => N(type, Object.assign({ bind: v.id, var: "w_" + v.name + "_" + ++k }, p || {}), kids);
    const A = (d, o) => Object.assign(GM.newAction(d), o || {});
    const on = (n, ev, ...acts) => {
      n.on = n.on || {};
      n.on[ev] = (n.on[ev] || []).concat(acts);
      return n;
    };
    const style = (n, st) => {
      n.style = st;
      return n;
    };
    const pin = (n, x, y, w, h) => {
      n.abs = { x, y };
      if (w) n.abs.w = w;
      if (h) n.abs.h = h;
      return n;
    };
    const win = (label, varName, x, y, w, h, flags, kids) => N("window", Object.assign({ label, var: varName, x, y, w, h, move: true, resize: true, collapse: true, notitle: false, close: false }, flags || {}), kids);
    const proj = (o) => Object.assign({
      format: "goome-project", version: 1, mode: "overlay", app: { w: 960, h: 640, titlebar: false, menubar: false, statusbar: false, nopad: false, status: "ready" },
      root: [], themes: [], elements: [], grid: { size: 8, snap: true, show: false }, vars, hotkeys: [],
    }, o, { theme: GM.normTheme(GM.PRESETS.find((t) => t.id === (o.themeId || "dark"))) });
    const hotkey = (combo, ...actions) => ({ id: GM.uid("h"), combo, actions });
    return { V, N, B, A, on, style, pin, win, proj, hotkey };
  }

  function crosshair() {
    const d = GM.newElement("crosshair");
    d.w = 24, d.h = 24, d.hit = "parts";
    d.params.push({ name: "color", type: "color", def: 0xFF6FDC5F });
    const ln = (x0, y0, x1, y1) => Object.assign(GM.newPart("line"), { name: "arm", f: { x0, y0, x1, y1, width: 2, color: "color" } });
    const dot = GM.newPart("circle");
    Object.assign(dot.f, { cx: 12, cy: 12, r: 1.5, color: "color" });
    d.parts.push(ln(12, 2, 12, 8), ln(12, 16, 12, 22), ln(2, 12, 8, 12), ln(16, 12, 22, 12), dot);
    return d;
  }

  function slotEl() {
    const d = GM.newElement("slot");
    d.w = 56, d.h = 56;
    d.params.push({ name: "item", type: "color", def: 0xFF4FA3FF }, { name: "full", type: "bool", def: true }, { name: "count", type: "text", def: "1" });
    const bg = GM.newPart("rrect");
    Object.assign(bg.f, { x: 0, y: 0, w: "w", h: "h", tl: 8, tr: 8, br: 8, bl: 8, color: "pressed ? th.active : (hovered ? th.hover : th.input_bg)" });
    const gem = GM.newPart("rrect");
    gem.show = "full";
    Object.assign(gem.f, { x: 14, y: 12, w: 28, h: 28, tl: 6, tr: 6, br: 6, bl: 6, color: "item" });
    const n = GM.newPart("text");
    n.show = "full";
    Object.assign(n.f, { x: 33, y: 36, size: 12, text: "{count}", color: "th.text" });
    bg.name = "bg", gem.name = "gem", n.name = "count";
    d.parts.push(bg, gem, n);
    return d;
  }

  const inst = (def, varName, p) => ({ id: GM.uid(), type: "el", p: Object.assign({ el: def.id, var: varName, x: 0, y: 0, w: 0, h: 0, params: {}, init: {} }, p || {}) });

  function modSide() {
    const { V, N, B, A, on, win, proj, hotkey } = kit();
    const open = V("menu_open", "bool", true), page = V("page", "int", 0, 0, 3);
    const fly = V("fly", "bool", false), speed = V("speed", "float", 2, 1, 10), nofall = V("no_fall", "bool", true);
    const esp = V("esp", "bool", true), espColor = V("esp_color", "color", 0xFF6EA8FF), fov = V("fov", "int", 90, 60, 120);
    const bright = V("fullbright", "bool", false), tod = V("time_of_day", "float", 12, 0, 24), weather = V("weather", "int", 0, 0, 2);
    const pageOf = (i, label, kids) => [N("heading", { label })].concat(kids).map((n) => ((n.p.showIf = "page == " + i), n));
    let hide;
    const w = win("mod menu", "menu", 60, 60, 540, 360, { bind: open.id, close: true }, [
      N("split", { var: "side", frac: 0.3 }, [
        [B("selectable", page, { items: "Movement\nVisuals\nWorld\nSettings" })],
        [].concat(
          pageOf(0, "Movement", [
            on(B("toggle", fly, { label: "Fly" }), "on", A("toast", { text: "flying, speed {speed}" })),
            B("slider", speed, { label: "Fly speed", min: 1, max: 10, fmt: "%.1f", enableIf: "fly" }),
            B("toggle", nofall, { label: "No fall damage" }),
            on(N("button", { label: "Reset speed", action: "", tooltip: "back to 2" }), "click", A("set", { var: "speed", value: "2" }), A("toast", { text: "speed back to {speed}" })),
          ]),
          pageOf(1, "Visuals", [
            B("toggle", esp, { label: "ESP boxes" }),
            B("color", espColor, { label: "Box color", enableIf: "esp" }),
            B("slider_int", fov, { label: "FOV", min: 60, max: 120 }),
          ]),
          pageOf(2, "World", [
            B("toggle", bright, { label: "Fullbright" }),
            B("slider", tod, { label: "Time of day", min: 0, max: 24, fmt: "%.0f h" }),
            N("label", { label: "Weather" }),
            B("radio", weather, { items: "Clear\nRain\nStorm", inline: true }),
          ]),
          pageOf(3, "Settings", [
            N("wrapped", { label: "insert opens and closes this menu. drag the title bar to move it." }),
            (hide = on(N("button", { label: "Hide menu", action: "" }), "click", A("close", { target: "" }))),
            on(N("button", { label: "Unload", action: "" }), "click", A("quit")),
          ]),
        ),
      ]),
    ]);
    hide.on.click[0].target = w.id;
    return proj({ name: "mod menu", title: "mod menu", themeId: "midnight", root: [w], hotkeys: [hotkey("insert", A("toggle", { var: "menu_open" }))] });
  }

  function modStacked() {
    const { V, N, B, A, on, win, proj, hotkey, style } = kit();
    const open = V("menu_open", "bool", true);
    const god = V("god_mode", "bool", false), jump = V("jump", "float", 1.5, 1, 5), reach = V("reach", "float", 4.5, 3, 8);
    const trigger = V("trigger_bot", "bool", false), delay = V("delay_ms", "int", 80, 0, 300);
    const tracers = V("tracers", "bool", true), glow = V("glow", "color", 0xFF5FE0A8), zoom = V("zoom", "float", 1, 1, 8);
    const sec = (label, varName, openNow, kids) => N("collapsing", { label, var: varName, open: openNow }, kids);
    const w = win("tweaks", "tweaks", 40, 40, 320, 0, { bind: open.id, close: true, resize: false }, [
      sec("Player", "sec_player", true, [
        on(B("checkbox", god, { label: "God mode" }), "change", A("toast", { text: "god mode {god_mode}" })),
        B("slider", jump, { label: "Jump height", min: 1, max: 5, fmt: "%.1fx" }),
        B("slider", reach, { label: "Reach", min: 3, max: 8, fmt: "%.1f m" }),
      ]),
      sec("Combat", "sec_combat", false, [
        B("toggle", trigger, { label: "Trigger bot" }),
        B("slider_int", delay, { label: "Delay", min: 0, max: 300, showIf: "trigger_bot" }),
      ]),
      sec("Visuals", "sec_visuals", false, [
        B("toggle", tracers, { label: "Tracers" }),
        B("color", glow, { label: "Glow" }),
        B("slider", zoom, { label: "Zoom", min: 1, max: 8, fmt: "%.1fx" }),
      ]),
      N("separator"),
      style(N("label", { label: "ctrl+m hides this" }), { c: { text: 0xFF86A397 } }),
    ]);
    return proj({ name: "stacked menu", title: "tweaks", themeId: "mint", root: [w], hotkeys: [hotkey("ctrl+m", A("toggle", { var: "menu_open" }))] });
  }

  function modTabbed() {
    const { V, N, B, A, on, win, proj, hotkey } = kit();
    const open = V("menu_open", "bool", true), tab = V("tab", "int", 0, 0, 2);
    const aim = V("aim_assist", "bool", true), smooth = V("smooth", "float", 0.4, 0, 1), bone = V("bone", "int", 0, 0, 2);
    const chams = V("chams", "bool", true), chamColor = V("cham_color", "color", 0xFFF27BA6), dist = V("max_dist", "int", 150, 10, 500);
    const cfg = V("cfg_name", "string", "default"), profiles = V("profiles", "list", "default\nlegit\nrage"), prof = V("profile", "int", 0, 0, 2);
    const tabs = B("tabs", tab, { items: "Aim\nVisuals\nConfig" });
    tabs.kids = [
      [
        B("toggle", aim, { label: "Aim assist" }),
        B("slider", smooth, { label: "Smoothing", min: 0, max: 1, fmt: "%.2f", enableIf: "aim_assist" }),
        B("combo", bone, { label: "Target", items: "Head\nChest\nNearest", enableIf: "aim_assist" }),
      ],
      [B("toggle", chams, { label: "Chams" }), B("color", chamColor, { label: "Cham color", showIf: "chams" }), B("slider_int", dist, { label: "Max distance", min: 10, max: 500 })],
      [
        B("combo", prof, { label: "Profile", itemsVar: profiles.id }),
        B("input", cfg, { label: "Config name", cap: 32 }),
        N("row", { cols: 2 }, [
          on(N("button", { label: "Save", action: "" }), "click", A("toast", { text: "saved {cfg_name}" })),
          on(N("button", { label: "Load", action: "" }), "click", A("toast", { text: "loaded {cfg_name}" })),
        ]),
      ],
    ];
    const w = win("menu", "menu", 80, 80, 420, 300, { bind: open.id, close: true }, [tabs]);
    return proj({ name: "tabbed menu", title: "menu", themeId: "rose", root: [w], hotkeys: [hotkey("ctrl+t", A("toggle", { var: "menu_open" }))] });
  }

  function hud() {
    const { V, N, B, A, on, win, proj, pin, style } = kit();
    const hp = V("health", "float", 0.8, 0, 1), mp = V("mana", "float", 0.55, 0, 1), ammo = V("ammo", "int", 24, 0, 30), kills = V("kills", "int", 3, 0, 999);
    const cross = crosshair();
    const stats = style(win("##stats", "stats", 20, 20, 250, 112, { notitle: true, resize: false, collapse: false }, [
      pin(N("label", { label: "HP" }), 0, 4),
      pin(B("progress", hp, { label: "" }), 34, 10, 192, 0),
      pin(N("label", { label: "MP" }), 0, 32),
      pin(B("progress", mp, { label: "" }), 34, 38, 192, 0),
      pin(N("label", { label: "ammo {ammo} / 30" }), 0, 62),
      pin(N("label", { label: "kills {kills}" }), 150, 62),
    ]), { c: { panel: 0xB0101216, border: 0x00000000 }, n: { radius: 8, pad: 12 } });
    const dbg = win("debug", "debug", 20, 510, 250, 0, { resize: false }, [
      N("row", { cols: 2 }, [
        on(N("button", { label: "Take hit", action: "" }), "click", A("sub", { var: "health", value: "0.15" }), A("toast", { text: "ouch" })),
        on(N("button", { label: "Heal", action: "" }), "click", A("set", { var: "health", value: "1" }), A("toast", { text: "full health" })),
      ]),
      N("row", { cols: 2 }, [
        on(N("button", { label: "Shoot", action: "" }), "click", A("sub", { var: "ammo", value: "1" })),
        on(N("button", { label: "Reload", action: "" }), "click", A("set", { var: "ammo", value: "30" }), A("toast", { text: "reloaded" })),
      ]),
      on(N("button", { label: "Got a kill", action: "" }), "click", A("add", { var: "kills", value: "1" }), A("toast", { text: "{kills} kills" })),
    ]);
    return proj({ name: "game hud", title: "hud", themeId: "dark", elements: [cross], root: [stats, dbg, inst(cross, "crosshair", { x: 628, y: 348 })] });
  }

  function settings() {
    const { V, N, B, A, on, win, proj, hotkey } = kit();
    const open = V("settings_open", "bool", true), mode = V("theme_mode", "int", 2, 0, 2), scale = V("ui_scale", "float", 1, 0.75, 2);
    const accent = V("accent", "color", 0xFF45B934), vol = V("volume", "float", 0.7, 0, 1), mute = V("mute", "bool", false);
    const notif = V("notifications", "bool", true), sound = V("notify_sound", "bool", true), updates = V("auto_update", "bool", true);
    const w = win("Settings", "settings", 80, 60, 400, 0, { bind: open.id, close: true, resize: false }, [
      N("heading", { label: "Look" }),
      B("radio", mode, { items: "Dark\nLight\nAuto", inline: true }),
      B("slider", scale, { label: "UI scale", min: 0.75, max: 2, fmt: "%.2fx" }),
      B("color", accent, { label: "Accent" }),
      N("separator"),
      N("heading", { label: "Sound" }),
      B("toggle", mute, { label: "Mute" }),
      B("slider", vol, { label: "Volume", min: 0, max: 1, fmt: "%.2f", enableIf: "!mute" }),
      N("separator"),
      N("heading", { label: "Other" }),
      B("checkbox", notif, { label: "Notifications" }),
      B("checkbox", sound, { label: "Play a sound", enableIf: "notifications" }),
      B("checkbox", updates, { label: "Auto update" }),
      N("space", { px: 6 }),
      N("row", { cols: 2 }, [
        on(N("button", { label: "Reset", action: "" }), "click", A("set", { var: "volume", value: "0.7" }), A("set", { var: "mute", value: "false" }), A("set", { var: "ui_scale", value: "1" }), A("toast", { text: "back to defaults" })),
        on(N("button", { label: "Save", action: "" }), "click", A("toast", { text: "saved" }), A("close", { target: "" })),
      ]),
    ]);
    const save = w.kids[0][w.kids[0].length - 1].kids[0][1];
    save.on.click[1].target = w.id;
    return proj({ name: "settings", title: "settings", themeId: "light", root: [w], hotkeys: [hotkey("f2", A("toggle", { var: "settings_open" }))] });
  }

  function notes() {
    const { V, N, B, A, on, proj } = kit();
    const sidebar = V("sidebar", "bool", true), list = V("note_list", "list", "Groceries\nRelease checklist\nBooks\nTrip"), sel = V("note", "int", 0, 0, 20);
    const title = V("note_title", "string", "Groceries"), body = V("note_body", "string", "milk\neggs\ncoffee\nrice\ncat food");
    const count = V("note_count", "int", 4, 0, 999), confirm = V("confirm_open", "bool", false);
    const newNote = () => [A("call", { fn: "new_note" }), A("add", { var: "note_count", value: "1" }), A("set", { var: "note_title", value: "untitled" }), A("set", { var: "note_body", value: "" })];
    const bar = N("menubar", {}, [
      N("menu", { label: "File" }, [
        on(N("menu_item", { label: "New note", shortcut: "Ctrl+N" }), "click", ...newNote()),
        on(N("menu_item", { label: "Save", shortcut: "Ctrl+S" }), "click", A("call", { fn: "save_note" }), A("toast", { text: "saved {note_title}" })),
        N("menu_sep"),
        on(N("menu_item", { label: "Quit", shortcut: "Ctrl+Q" }), "click", A("quit")),
      ]),
      N("menu", { label: "View" }, [B("menu_item", sidebar, { label: "Sidebar", shortcut: "Ctrl+B", check: true })]),
    ]);
    const modal = B("modal", confirm, { label: "Delete this note?", button: "Delete" }, [
      N("wrapped", { label: "you cant get it back after this." }),
      N("row", { cols: 2 }, [
        on(N("button", { label: "Delete it", action: "close" }), "click", A("call", { fn: "delete_note" }), A("sub", { var: "note_count", value: "1" }), A("toast", { text: "deleted {note_title}" })),
        N("button", { label: "Keep it", action: "close" }),
      ]),
    ]);
    const editor = [
      N("heading", { label: "{note_title}" }),
      B("input", title, { label: "Title", cap: 64 }),
      B("text_edit", body, { h: 300, wrap: true }),
      N("row", { cols: 2 }, [on(N("button", { label: "Save", action: "" }), "click", A("call", { fn: "save_note" }), A("toast", { text: "saved {note_title}" })), modal]),
    ];
    const split = N("split", { var: "panes", frac: 0.28, showIf: "sidebar" }, [
      [
        on(B("selectable", sel, { itemsVar: list.id }), "change", A("call", { fn: "open_note" })),
        N("space", { px: 4 }),
        on(N("button", { label: "New note", action: "" }), "click", ...newNote()),
      ],
      editor,
    ]);
    const plain = N("scroll", { var: "main", h: 0, showIf: "!sidebar" }, GM.clone(editor).map((n) => reid(n)));
    return proj({
      name: "notes", title: "Notes", mode: "app", themeId: "paper",
      app: { w: 960, h: 640, titlebar: false, menubar: true, statusbar: true, nopad: true, status: "{note_count} notes" },
      root: [bar, split, plain],
    });
  }

  function reid(n) {
    GM.walk([n], (x) => {
      x.id = GM.uid();
      if (x.p && x.p.var && !x.p.bind) x.p.var = x.p.var + "_b";
    });
    return n;
  }

  function inventory() {
    const { V, N, A, on, win, proj } = kit();
    const picked = V("picked_slot", "int", 1, 0, 15);
    const slot = slotEl();
    const colors = [0xFF4FA3FF, 0xFFE5534B, 0xFF6FDC5F, 0xFFE8C547, 0xFFB57BFF];
    const rows = [];
    let i = 0;
    for (let r = 0; r < 3; r++) {
      const kids = [];
      for (let c = 0; c < 5; c++) {
        i++;
        const full = (r * 5 + c) % 3 !== 2;
        const e = inst(slot, "slot_" + i, { params: { item: colors[(r * 2 + c) % 5], full, count: String(((i * 7) % 16) + 1) } });
        on(e, "click", A("set", { var: "picked_slot", value: String(i) }), A("toast", { text: "slot {picked_slot}" }));
        kids.push(e);
      }
      rows.push(N("row", { cols: 5 }, kids));
    }
    const w = win("Inventory", "inventory", 60, 60, 352, 0, { resize: false }, [
      N("heading", { label: "Backpack" }),
    ].concat(rows, [
      N("separator"),
      N("label", { label: "picked slot {picked_slot}" }),
      N("row", { cols: 2 }, [
        on(N("button", { label: "Use", action: "" }), "click", A("toast", { text: "used slot {picked_slot}" })),
        on(N("button", { label: "Drop", action: "" }), "click", A("toast", { text: "dropped slot {picked_slot}" })),
      ]),
    ]));
    return proj({ name: "inventory", title: "inventory", themeId: "dark", elements: [slot], root: [w] });
  }

  function chat() {
    const { V, N, B, A, on, win, proj, style } = kit();
    const msg = V("message", "string", ""), chans = V("channels", "list", "general\ntrade\nparty"), chan = V("channel", "int", 0, 0, 2);
    const lines = ["sam: anyone up for a run", "mira: give me 5 min", "ko: same", "server: party made", "mira: ok im in", "sam: lets go", "ko: brb snacks", "server: ko left the party"];
    const times = ["12:01", "12:02", "12:02", "12:04", "12:05", "12:06", "12:09", "12:11"];
    const dim = { c: { text: 0xFF8A94A8 } };
    const w = win("Chat", "chat", 60, 220, 400, 0, { resize: false }, [
      on(B("combo", chan, { label: "##channel", itemsVar: chans.id }), "change", A("call", { fn: "switch_channel" })),
      N("scroll", { var: "log", h: 232 }, lines.map((t, i) => (t.startsWith("server:") ? style(N("label", { label: times[i] + "  " + t.slice(8) }), dim) : N("label", { label: times[i] + "  " + t })))),
      B("input", msg, { label: "##message", cap: 120, width: 312 }),
      N("same_line"),
      on(N("button", { label: "Send", action: "" }), "click", A("call", { fn: "send_message" }), A("set", { var: "message", value: "" })),
    ]);
    return proj({ name: "chat", title: "chat", themeId: "midnight", root: [w] });
  }

  function dashboard() {
    const { V, N, B, A, on, proj } = kit();
    const disk = V("disk", "float", 0.62, 0, 1), memv = V("memory", "float", 0.41, 0, 1), net = V("network", "float", 0.18, 0, 1), up = V("refreshes", "int", 0, 0, 9999);
    return proj({
      name: "dashboard", title: "Dashboard", mode: "app", themeId: "midnight",
      app: { w: 1000, h: 660, titlebar: false, menubar: false, statusbar: true, nopad: false, status: "refreshed {refreshes} times" },
      root: [
        N("heading", { label: "Servers" }),
        N("row", { cols: 2 }, [
          N("plot_lines", { label: "CPU %", var: "cpu", values: "22 30 28 41 38 55 49 62 58 47 51 44 39 46 52", min: 0, max: 100, h: 110 }),
          N("plot_bars", { label: "Requests / hour", var: "requests", values: "40 52 61 58 70 88 95 80 66 59", min: 0, max: 0, h: 110 }),
        ]),
        N("row", { cols: 3 }, [N("label", { label: "Disk" }), N("label", { label: "Memory" }), N("label", { label: "Network" })]),
        N("row", { cols: 3 }, [B("progress", disk, { label: "62%" }), B("progress", memv, { label: "41%" }), B("progress", net, { label: "18%" })]),
        N("table", { var: "hosts", cols: "Host\nStatus:110\nUptime:110\nLoad:80", rows: "srv1, up, 41 days, 0.82\nsrv2, up, 3 days, 0.31\nbackup, down, -, -\ngpu, up, 12 days, 2.40", stripes: true, borders: true, h: 0 }),
        on(N("button", { label: "Refresh", action: "", tooltip: "pulls new numbers" }), "click", A("add", { var: "refreshes", value: "1" }), A("toast", { text: "refreshed" })),
      ],
    });
  }

  function toolbar() {
    const { V, N, A, on, win, proj, hotkey, style } = kit();
    const open = V("toolbar_open", "bool", true), rec = V("recording", "bool", false), mic = V("mic", "bool", true);
    const tb = (label, tip, ...acts) => on(N("button", { label, action: "", tooltip: tip }), "click", ...acts);
    const w = style(win("##toolbar", "toolbar", 470, 24, 340, 0, { bind: open.id, notitle: true, resize: false, collapse: false }, [
      N("row", { cols: 5 }, [
        tb("Rec", "start or stop recording", A("toggle", { var: "recording" }), A("toast", { text: "recording {recording}" })),
        tb("Mark", "drop a marker here", A("toast", { text: "marked it" })),
        tb("Shot", "save a screenshot", A("toast", { text: "screenshot saved" })),
        tb("Mic", "mute or unmute the mic", A("toggle", { var: "mic" }), A("toast", { text: "mic {mic}" })),
        tb("Hide", "ctrl+shift+h brings it back", A("close", { target: "" })),
      ]),
      style(N("label", { label: "recording", showIf: "recording" }), { c: { text: 0xFFE5534B } }),
    ]), { n: { radius: 14, pad: 8, gap: 6 } });
    w.kids[0][0].kids[0][4].on.click[0].target = w.id;
    return proj({ name: "toolbar", title: "toolbar", themeId: "dark", root: [w], hotkeys: [hotkey("ctrl+shift+h", A("toggle", { var: "toolbar_open" }))] });
  }

  function login() {
    const { V, N, B, A, on, win, proj, style } = kit();
    const user = V("user", "string", ""), pass = V("password", "string", ""), remember = V("remember", "bool", true), signed = V("signed_in", "bool", false), open = V("login_open", "bool", false);
    const modal = B("modal", open, { label: "Sign in", button: "Sign in", showIf: "!signed_in" }, [
      B("input", user, { label: "User", cap: 64, hint: "name or email" }),
      on(B("input", pass, { label: "Password", cap: 64, password: true, hint: "password" }), "enter", A("call", { fn: "sign_in" }), A("set", { var: "signed_in", value: "true" }), A("set", { var: "login_open", value: "false" }), A("toast", { text: "welcome back {user}" })),
      B("checkbox", remember, { label: "Remember me" }),
      N("space", { px: 6 }),
      N("row", { cols: 2 }, [
        on(N("button", { label: "Sign in", action: "close" }), "click", A("call", { fn: "sign_in" }), A("set", { var: "signed_in", value: "true" }), A("toast", { text: "welcome back {user}" })),
        N("button", { label: "Cancel", action: "close" }),
      ]),
    ]);
    const w = style(win("Account", "account", 90, 90, 300, 0, { resize: false }, [
      N("label", { label: "not signed in", showIf: "!signed_in" }),
      N("label", { label: "hi {user}", showIf: "signed_in" }),
      modal,
      on(N("button", { label: "Sign out", action: "", showIf: "signed_in" }), "click", A("set", { var: "signed_in", value: "false" }), A("toast", { text: "signed out" })),
    ]), { n: { radius: 12 } });
    return proj({ name: "login", title: "login", themeId: "paper", root: [w] });
  }

  GM.LAYOUTS = [
    { id: "mod_side", name: "Mod menu, side tabs", about: "movable menu with a page list on the left, insert toggles it", mode: "overlay", make: modSide },
    { id: "mod_stacked", name: "Mod menu, stacked", about: "collapsing sections in one tall window, ctrl+m hides it", mode: "overlay", make: modStacked },
    { id: "mod_tabbed", name: "Mod menu, tabs", about: "tabs on top, a config page with save and load, ctrl+t", mode: "overlay", make: modTabbed },
    { id: "hud", name: "Game HUD", about: "health and mana bars, pinned labels, a crosshair in the middle", mode: "overlay", make: hud },
    { id: "settings", name: "Settings window", about: "look, sound and other stuff with reset and save, f2", mode: "overlay", make: settings },
    { id: "notes", name: "Notes app", about: "menu bar, sidebar, editor and a status bar", mode: "app", make: notes },
    { id: "inventory", name: "Inventory grid", about: "15 custom slots you can click, shows what you picked", mode: "overlay", make: inventory },
    { id: "chat", name: "Chat panel", about: "channel picker, scrolling log and a send box", mode: "overlay", make: chat },
    { id: "dashboard", name: "Dashboard", about: "plots, usage bars and a host table", mode: "app", make: dashboard },
    { id: "toolbar", name: "Overlay toolbar", about: "a small bar of buttons with tooltips, ctrl+shift+h", mode: "overlay", make: toolbar },
    { id: "login", name: "Login dialog", about: "account window with a sign in modal", mode: "overlay", make: login },
  ];

  let css = false;
  function addCss() {
    if (css || typeof document === "undefined") return;
    css = true;
    const s = document.createElement("style");
    s.textContent = [
      ".gmt-back{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}",
      ".gmt-box{background:var(--panel,#1b1d22);color:var(--text,#e9ebee);border:1px solid var(--line,rgba(255,255,255,.08));border-radius:12px;width:min(760px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,.5)}",
      ".gmt-head{display:flex;align-items:center;gap:8px;padding:12px 12px 8px 16px}",
      ".gmt-head h2{flex:1;margin:0;font-size:16px;font-weight:600}",
      ".gmt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;padding:4px 12px 14px;overflow:auto}",
      ".gmt-card{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-height:72px;text-align:left;padding:10px 12px;border-radius:10px;cursor:pointer;font:inherit;color:inherit;background:var(--bg2,#14161a);border:1px solid var(--line,rgba(255,255,255,.08))}",
      ".gmt-card:hover,.gmt-card:focus-visible{border-color:var(--accent,#6fdc5f);outline:none}",
      ".gmt-card b{font-weight:600}.gmt-card span{font-size:12.5px;opacity:.72;line-height:1.35}",
      ".gmt-mode{font-size:11px;padding:1px 7px;border-radius:9px;border:1px solid var(--line,rgba(255,255,255,.12));opacity:.8}",
    ].join("\n");
    document.head.append(s);
  }

  function open(onPick) {
    addCss();
    const back = document.createElement("div");
    back.className = "gmt-back";
    const box = document.createElement("div");
    box.className = "gmt-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "New from template");
    const head = document.createElement("div");
    head.className = "gmt-head";
    const t = document.createElement("h2");
    t.textContent = "New from template";
    const x = document.createElement("button");
    x.className = "btn ghost";
    x.textContent = "Close";
    head.append(t, x);
    const grid = document.createElement("div");
    grid.className = "gmt-grid";
    const close = () => {
      document.removeEventListener("keydown", key, true);
      back.remove();
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    for (const L of GM.LAYOUTS) {
      const b = document.createElement("button");
      b.className = "gmt-card";
      const n = document.createElement("b");
      n.textContent = L.name;
      const a = document.createElement("span");
      a.textContent = L.about;
      const m = document.createElement("em");
      m.className = "gmt-mode";
      m.textContent = L.mode;
      b.append(n, a, m);
      b.addEventListener("click", () => {
        close();
        onPick(GM.normProject(L.make()));
      });
      grid.append(b);
    }
    x.addEventListener("click", close);
    back.addEventListener("pointerdown", (e) => {
      if (e.target === back) close();
    });
    document.addEventListener("keydown", key, true);
    box.append(head, grid);
    back.append(box);
    document.body.append(back);
    const first = grid.querySelector("button");
    if (first) first.focus();
    return close;
  }

  const GMTemplates = { open, layouts: () => GM.LAYOUTS };
  if (typeof module !== "undefined" && module.exports) module.exports = GMTemplates;
  else root.GMTemplates = GMTemplates;
})(typeof window !== "undefined" ? window : globalThis);
