(function () {
  const A = window.GMApp;
  const { h, $, icon, S, note, snap, changed } = A;
  const P = () => S.project;
  const LANGS = { c: "C", cs: "C#", py: "Python", java: "Java", gd: "GDScript", rust: "Rust", node: "Node", go: "Go", zig: "Zig", lua: "Lua" };
  const EXT = { c: ".c", cs: ".cs", py: ".py", java: ".java", gd: ".gd", rust: ".rs", node: ".js", go: ".go", zig: ".zig", lua: ".lua" };

  const KW = {
    c: "if else for while return static const int double float char void unsigned uint32_t typedef struct sizeof break continue NULL",
    cs: "if else for foreach while return static const int double float bool uint string var new using try catch null true false class sealed public void out ref in is",
    py: "if elif else for while return def class import from with as try except pass None True False not and or in is global lambda",
    java: "if else for while return static final int double float boolean String var new import try catch null true false class public void break continue this",
    gd: "if elif else for while return func var const class extends pass null true false not and or in is self",
    rust: "fn let mut const static if else for while loop match return use mod struct enum impl pub as in ref self Self true false break continue unsafe move",
    node: "const let var function if else for while return new try catch null undefined true false class break continue of in typeof this async await",
    go: "package import func var const type struct if else for range return switch case default break continue nil true false go defer map chan interface",
    zig: "const var fn pub if else for while return try catch switch break continue defer errdefer struct enum union null undefined true false and or orelse comptime inline",
    lua: "local function if then else elseif end for while do repeat until return break nil true false not and or in",
  };
  function hl(code, lang) {
    const kw = new Set(KW[lang].split(" "));
    const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(#\s*(?:define|include)\b[^\n]*)|(\b0x[0-9A-Fa-f]+u?\b|\b\d+(?:\.\d+)?f?\b)|([A-Za-z_]\w*)(\s*\()?/g;
    let out = "", last = 0, m;
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      if (m[1]) out += '<span class="s">' + esc(m[1]) + "</span>";
      else if (m[2]) out += '<span class="c">' + esc(m[2]) + "</span>";
      else if (m[3]) out += '<span class="n">' + m[3] + "</span>";
      else if (m[4]) {
        if (kw.has(m[4])) out += '<span class="k">' + m[4] + "</span>" + (m[5] || "");
        else if (m[5]) out += '<span class="f">' + m[4] + "</span>" + m[5];
        else out += m[4];
      }
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  let codeTimer = 0, lastGen = null;
  function gen(lang) {
    if (!window.GMCode || !GMCode.generate) return { code: "codegen didnt load", warnings: [], files: [] };
    try {
      return GMCode.generate(P(), lang);
    } catch (e) {
      console.error(e);
      return { code: "the code generator tripped over this layout: " + e.message, warnings: [], files: [] };
    }
  }
  function scheduleCode() {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(refreshCode, 160);
  }
  function refreshCode() {
    lastGen = gen(S.lang);
    const ids = new Set(lastGen.warnings.map((w) => w.id).filter(Boolean));
    const had = S.warnIds ? [...S.warnIds].join() : "";
    S.warnings = lastGen.warnings;
    S.warnIds = ids;
    renderDock();
    if (had !== [...ids].join()) {
      document.querySelectorAll("#stageWrap .has-warn").forEach((e) => e.classList.remove("has-warn"));
      ids.forEach((id) => {
        const el = document.querySelector('#stageWrap [data-nid="' + id + '"]');
        if (el) el.classList.add("has-warn");
      });
    }
  }

  function renderDock() {
    const d = $("#dock");
    d.textContent = "";
    d.classList.toggle("shut", !S.dock);
    const g = lastGen || gen(S.lang);
    const head = h("div", { class: "dock-head" },
      h("span", { class: "sheet-head", style: { display: "none" } }),
      h("div", { class: "seg" }, Object.entries(LANGS).map(([k, v]) => h("button", { class: S.lang === k ? "on" : "", text: v, onclick: () => {
        S.lang = k;
        try {
          localStorage.setItem("gm-uibuilder-lang", k);
        } catch (e) {}
        S.dock = true;
        refreshCode();
      } }))),
      h("button", { class: "btn pri", onclick: copyCode }, icon("copy"), "Copy"),
      h("button", { class: "btn", title: "download the file", onclick: () => saveCode(g) }, icon("dl"), h("span", { class: "wide", text: "Save" })),
      g.warnings.length ? h("span", { class: "warn", text: g.warnings.length + (g.warnings.length === 1 ? " warning" : " warnings") }) : h("span", { class: "muted", style: { fontSize: "12px" }, text: "no warnings" }),
      h("span", { class: "grow" }),
      h("button", { class: "btn sm ghost hide-btn", title: S.dock ? "hide the code" : "show the code", onclick: () => ((S.dock = !S.dock), renderDock()) }, icon(S.dock ? "down" : "up"), h("span", { class: "wide", text: S.dock ? "Hide" : "Code" })),
      h("button", { class: "btn sm ghost close-m", onclick: () => A.mpanel(null), style: { display: A.isMobile() ? "" : "none" } }, icon("x")));
    d.appendChild(head);
    const body = h("div", { class: "dock-body" });
    const hint = GMCode && GMCode.hint ? GMCode.hint(P(), S.lang) : "";
    if (hint) body.appendChild(h("div", { class: "dock-hint", text: hint }));
    if (g.files && g.files.length) body.appendChild(h("div", { class: "dock-hint", text: "needs these files next to it: " + g.files.join(", ") }));
    if (g.warnings.length) {
      const wb = h("div", { class: "dock-warn" });
      for (const w of g.warnings) {
        const row = h("div", { class: "warn", text: w.msg });
        if (w.id) row.addEventListener("click", () => {
          const idx = GM.index(P());
          if (idx.has(w.id)) {
            S.sel = [w.id];
            A.markSel();
            A.openTab("props");
          }
        });
        wb.appendChild(row);
      }
      body.appendChild(wb);
    }
    const pre = h("pre", { class: "code" });
    pre.innerHTML = hl(g.code, S.lang);
    body.appendChild(pre);
    d.appendChild(body);
  }
  function fileName(lang) {
    if (lang === "cs") return "Program.cs";
    const g = lastGen || gen(lang);
    if (g.file) return g.file;
    return A.slug(P().name).replace(/-/g, "_") + EXT[lang];
  }
  function copyCode() {
    const g = lastGen || gen(S.lang);
    const done = () => note("copied the " + LANGS[S.lang] + " code");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(g.code).then(done, () => fallbackCopy(g.code, done));
    else fallbackCopy(g.code, done);
  }
  function fallbackCopy(text, done) {
    const ta = h("textarea", { style: { position: "fixed", left: "-9999px" } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      done();
    } catch (e) {
      note("couldnt copy, select the code by hand");
    }
    ta.remove();
  }
  function saveCode(g) {
    const blob = new Blob([g.code], { type: "text/plain" });
    const a = h("a", { href: URL.createObjectURL(blob), download: fileName(S.lang) });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  }

  function pickFile(cb) {
    const inp = $("#fileIn");
    inp.value = "";
    inp.onchange = () => {
      const f = inp.files[0];
      if (f) readJson(f, cb);
    };
    inp.click();
  }
  function readJson(f, cb) {
    if (f.size > 20 * 1024 * 1024) return note("that file is too big");
    const rd = new FileReader();
    rd.onload = () => {
      let obj;
      try {
        obj = JSON.parse(rd.result);
      } catch (e) {
        return note("thats not a json file i can read");
      }
      cb(obj, f.name);
    };
    rd.readAsText(f);
  }
  function importAny(obj, name) {
    const fmt = obj && obj.format;
    if (fmt === "goome-project" || (obj && Array.isArray(obj.root))) {
      snap();
      S.project = GM.normProject(obj);
      A.adoptSettings(S.project);
      A.resetVals();
      S.sel = [];
      S.pv = {};
      S.editing = null;
      A.settle();
      changed();
      A.renderPalette();
      A.renderTop();
      return note("opened " + (S.project.name || name));
    }
    if (fmt === "goome-theme" || (obj && obj.theme && obj.theme.accent != null) || (obj && obj.accent != null && obj.panel != null)) return A.importTheme(obj);
    if (fmt === "goome-element" || (obj && obj.element && obj.element.parts)) {
      snap();
      const def = window.GMEl && GMEl.importFile ? GMEl.importFile(obj, P()) : null;
      if (!def) {
        const d = GM.normElement(obj.element || obj);
        d.id = GM.uid("e");
        P().elements.push(d);
      }
      changed();
      A.renderPalette();
      return note("got the element " + ((def && def.name) || ""));
    }
    note("i dont know what that file is");
  }
  function openFileMenu(btn) {
    A.syncSettings();
    document.querySelectorAll(".menu-pop").forEach((m) => m.remove());
    const r = btn.getBoundingClientRect();
    const item = (ic, text, fn) => h("button", { onclick: () => (m.remove(), fn()) }, icon(ic), text);
    const m = h("div", { class: "menu-pop" },
      item("ul", "Open a file", () => pickFile(importAny)),
      item("dl", "Save project (.goome.json)", () => A.download(A.slug(P().name) + ".goome.json", P())),
      h("hr"),
      item("layers", "New from template", () => {
        if (!window.GMTemplates) return note("templates didnt load");
        GMTemplates.open((proj) => {
          snap();
          S.project = GM.normProject(proj);
          A.syncSettings();
          A.resetVals();
          S.sel = [];
          S.pv = {};
          S.editing = null;
          changed();
          A.renderPalette();
          A.renderTop();
          note("started from " + (S.project.name || "a template"));
        });
      }),
      item("plus", "New project", () => A.confirm2("Start over? the current one goes away", () => {
        snap();
        S.project = A.freshProject();
        A.resetVals();
        S.sel = [];
        S.pv = {};
        S.editing = null;
        changed();
        A.renderPalette();
        A.renderTop();
      })),
      item("box", "Empty project", () => {
        snap();
        const p = A.freshProject();
        p.root = [];
        A.resetVals();
        S.project = p;
        S.sel = [];
        S.pv = {};
        S.editing = null;
        changed();
        A.renderPalette();
        A.renderTop();
      }),
      h("hr"),
      h("div", { class: "muted", style: { fontSize: "12px", padding: "6px 10px" }, text: "you can also drop a .goome.json, .goome-theme.json or .goome-element.json anywhere on the page" }));
    document.body.appendChild(m);
    m.style.top = r.bottom + 6 + "px";
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + "px";
    setTimeout(() => document.addEventListener("pointerdown", function off(e) {
      if (!m.contains(e.target)) m.remove(), document.removeEventListener("pointerdown", off);
    }), 0);
  }

  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes("Files")) return;
    dragDepth++;
    $("#dropzone").classList.add("on");
  });
  window.addEventListener("dragleave", () => {
    if (--dragDepth <= 0) dragDepth = 0, $("#dropzone").classList.remove("on");
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    $("#dropzone").classList.remove("on");
    for (const f of e.dataTransfer.files) {
      if (/\.json$/i.test(f.name) || f.type === "application/json") readJson(f, importAny);
      else note("drop a .json file, " + f.name + " isnt one");
    }
  });

  function typing(e) {
    const t = e.target;
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey) {
      if (typing(e) && !e.target.closest("#stageWrap")) return;
      e.preventDefault();
      return A.undo();
    }
    if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
      if (typing(e) && !e.target.closest("#stageWrap")) return;
      e.preventDefault();
      return A.redo();
    }
    if (typing(e)) return;
    if (mod && k === "c") return A.copySel();
    if (mod && k === "v") return e.preventDefault(), A.paste();
    if (mod && k === "x") return A.copySel(), A.removeSel();
    if (mod && k === "d") return e.preventDefault(), A.duplicate();
    if (mod && k === "a" && !S.editing) {
      e.preventDefault();
      const info = A.primary();
      S.sel = (info ? info.list : P().root).map((n) => n.id);
      A.markSel();
      return A.renderSide();
    }
    if ((k === "delete" || k === "backspace") && S.sel.length) return e.preventDefault(), A.removeSel();
    if (k === "escape") {
      A.closePops();
      if (S.sel.length) (S.sel = []), A.markSel(), A.renderSide();
      return;
    }
    if (k.startsWith("arrow") && S.sel.length) {
      const step = e.shiftKey ? 10 : P().grid.snap ? P().grid.size : 1;
      const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0, dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
      const infos = S.sel.map((id) => A.findNode(id)).filter((i) => i && (i.n.abs || i.n.type === "window" || (i.n.type === "el" && !i.parent)));
      if (!infos.length) return;
      e.preventDefault();
      snap();
      for (const i of infos) {
        const p = i.n.abs || i.n.p;
        p.x = Math.max(0, p.x + dx);
        p.y = Math.max(0, p.y + dy);
      }
      changed();
    }
  });

  function renderAll() {
    A.renderTop();
    A.renderPalette();
    A.renderStage();
    A.renderSide();
    refreshCode();
    updateUndoPublic();
  }
  function updateUndoPublic() {
    $("#undoBtn").disabled = !S.undo.length;
    $("#redoBtn").disabled = !S.redo.length;
  }

  function boot() {
    try {
      const raw = localStorage.getItem("gm-uibuilder-project-v2");
      S.project = raw ? GM.normProject(JSON.parse(raw)) : GM.starterProject();
    } catch (e) {
      S.project = GM.starterProject();
    }
    A.settle();
    A.syncSettings();
    $("#undoBtn").appendChild(icon("undo"));
    $("#redoBtn").appendChild(icon("redo"));
    $("#gridBtn").appendChild(icon("grid"));
    $("#fileBtn").append(icon("file"), h("span", { class: "wide", text: "Project" }));
    $("#undoBtn").onclick = A.undo;
    $("#redoBtn").onclick = A.redo;
    $("#gridBtn").onclick = () => {
      snap();
      P().grid.snap = !P().grid.snap;
      P().grid.show = P().grid.snap;
      changed();
      A.renderTop();
      note(P().grid.snap ? "snapping to a " + P().grid.size + " px grid" : "grid snap off");
    };
    $("#fileBtn").onclick = (e) => openFileMenu(e.currentTarget);
    $("#gearBtn").appendChild(icon("gear"));
    $("#gearBtn").onclick = () => A.openSettings();
    $("#stageWrap").addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".g-disabled")) e.stopPropagation(), e.preventDefault();
    }, true);
    document.querySelectorAll("#modeSeg button").forEach((b) => (b.onclick = () => A.setMode(b.dataset.mode)));
    document.querySelectorAll("#sideTabs button").forEach((b) => (b.onclick = () => ((S.tab = b.dataset.tab), A.renderSide())));
    document.querySelectorAll("#mnav button").forEach((b) => {
      const ic = { pal: "plus", props: "edit", layers: "layers", vars: "vars", theme: "brush", elements: "box", code: "code" }[b.dataset.m];
      b.prepend(icon(ic));
      b.onclick = () => A.mpanel(S.mpanel === b.dataset.m ? null : b.dataset.m);
    });
    $("[data-close=side]").appendChild(icon("x"));
    $("[data-close=side]").onclick = () => A.mpanel(null);
    $("#stageWrap").addEventListener("pointerdown", A.stageDown, true);
    $("#stageWrap").addEventListener("scroll", () => {
      const b = document.querySelector(".sel-bar");
      if (b) A.markSel();
    }, { passive: true });
    renderAll();
  }

  Object.assign(A, { renderAll, renderDock, scheduleCode, refreshCode, pickFile, importAny, updateUndoPublic });
  boot();
})();
