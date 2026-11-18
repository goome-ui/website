(function () {
  var root = document.documentElement;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var top = $(".top");
  var menuBtn = $(".menu-btn");
  var sideBtn = $(".side-btn");
  var sidebar = $("#sidebar");
  function small() { return !matchMedia("(min-width: 900px)").matches; }
  function setMenu(on) {
    top.classList.toggle("open", on);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", on);
    root.classList.toggle("lock", on && small());
  }
  function setSide(on) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", on);
    root.classList.toggle("lock", on && small());
    if (sideBtn) {
      sideBtn.setAttribute("aria-expanded", on);
      sideBtn.textContent = on ? "Close pages" : "Pages";
    }
  }
  if (menuBtn) menuBtn.addEventListener("click", function () {
    setSide(false);
    setMenu(!top.classList.contains("open"));
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    setMenu(false);
    setSide(false);
  });
  $$(".links a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("click", function (e) {
    if (top.classList.contains("open") && !top.contains(e.target)) setMenu(false);
  });
  addEventListener("resize", function () {
    if (!small()) { setMenu(false); setSide(false); }
  });

  function flash(btn) {
    var was = btn.textContent;
    btn.textContent = "Copied";
    btn.classList.add("done");
    setTimeout(function () { btn.textContent = was; btn.classList.remove("done"); }, 1400);
  }
  function copyText(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash(btn); }, function () {});
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash(btn); } catch (e) {}
    ta.remove();
  }
  $$(".copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      if (text == null) text = $("pre", btn.parentNode).innerText.replace(/\n$/, "");
      copyText(text, btn);
    });
  });

  var demo = $("[data-demo]");
  if (demo) {
    var stage = $(".demo-stage", demo);
    var full = $("[data-full]", demo);
    var tabs = $$("[role=tab]", demo);
    var current = tabs[0];
    var loaded = false;
    function show() {
      stage.innerHTML = "";
      var f = document.createElement("iframe");
      f.src = current.dataset.src;
      f.title = current.textContent;
      f.setAttribute("allow", "fullscreen");
      stage.appendChild(f);
      loaded = true;
    }
    $(".demo-load", demo).addEventListener("click", show);
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (o) { o.setAttribute("aria-selected", o === t); });
        current = t;
        full.href = t.dataset.src;
        if (loaded) show();
      });
    });
  }

  if (sideBtn) {
    sideBtn.addEventListener("click", function () { setMenu(false); setSide(!sidebar.classList.contains("open")); });
    $$("a", sidebar).forEach(function (a) { a.addEventListener("click", function () { setSide(false); }); });
  }
  var here = $(".sidebar a.here");
  if (here && matchMedia("(min-width: 900px)").matches) here.scrollIntoView({ block: "center" });

  var saved = null;
  try { saved = localStorage.getItem("goome-lang"); } catch (e) {}
  function pick(lang) {
    $$(".tabs").forEach(function (box) {
      if (!$('button[data-lang="' + lang + '"]', box)) return;
      $$(".tab-row button", box).forEach(function (b) { b.classList.toggle("on", b.dataset.lang === lang); });
      $$(".code", box).forEach(function (c) { c.hidden = c.dataset.lang !== lang; });
    });
  }
  $$(".tabs .tab-row button").forEach(function (b) {
    b.addEventListener("click", function () {
      pick(b.dataset.lang);
      try { localStorage.setItem("goome-lang", b.dataset.lang); } catch (e) {}
    });
  });
  if (saved) pick(saved);

  var tocLinks = $$(".toc a");
  if (tocLinks.length && "IntersectionObserver" in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          tocLinks.forEach(function (a) { a.classList.remove("on"); });
          map[e.target.id].classList.add("on");
        }
      });
    }, { rootMargin: "-80px 0px -70% 0px" });
    Object.keys(map).forEach(function (id) { var h = document.getElementById(id); if (h) obs.observe(h); });
  }

  var search = $("#search");
  if (search) {
    var input = $("#search-input");
    var hits = $("#search-hits");
    var base = search.dataset.base;
    var index = null;
    var loading = null;
    var picked = -1;
    function load() {
      if (!loading) loading = fetch(search.dataset.index).then(function (r) { return r.json(); }).then(function (j) { index = j; });
      return loading;
    }
    function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
    function mark(text, words) {
      var out = esc(text);
      words.forEach(function (w) { out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
      return out;
    }
    function run() {
      var q = input.value.trim().toLowerCase();
      picked = -1;
      if (!q) { hits.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
      var words = q.split(/\s+/);
      var res = [];
      index.forEach(function (page) {
        page.s.forEach(function (sec) {
          var title = page.t.toLowerCase();
          var head = sec.h.toLowerCase();
          var text = sec.x.toLowerCase();
          var score = 0;
          for (var i = 0; i < words.length; i++) {
            var w = words[i];
            var s = (head.indexOf(w) >= 0 ? 6 : 0) + (title.indexOf(w) >= 0 ? 3 : 0) + (text.indexOf(w) >= 0 ? 1 : 0);
            if (!s) { score = 0; break; }
            score += s;
          }
          if (score) res.push({ score: score, page: page, sec: sec });
        });
      });
      res.sort(function (a, b) { return b.score - a.score; });
      res = res.slice(0, 12);
      if (!res.length) hits.innerHTML = "<p>Nothing for that.</p>";
      else hits.innerHTML = res.map(function (r) {
        var url = base + r.page.u + (r.sec.a ? "#" + r.sec.a : "");
        var i = r.sec.x.toLowerCase().indexOf(words[0]);
        var snip = r.sec.x.slice(Math.max(0, i - 30), Math.max(0, i - 30) + 120);
        return '<a href="' + url + '" role="option"><b>' + mark(r.page.t + (r.sec.h ? " / " + r.sec.h : ""), words) + "</b><small>" + mark(snip, words) + "</small></a>";
      }).join("");
      hits.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    input.addEventListener("focus", load);
    input.addEventListener("input", function () { load().then(run); });
    input.addEventListener("keydown", function (e) {
      var items = $$("a", hits);
      if (e.key === "Escape") { hits.hidden = true; input.blur(); }
      if (!items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        picked = (picked + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle("on", i === picked); });
        items[picked].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter") { e.preventDefault(); (items[picked] || items[0]).click(); }
    });
    hits.addEventListener("click", function (e) { if (e.target.closest("a")) setSide(false); });
    document.addEventListener("click", function (e) { if (!search.contains(e.target)) hits.hidden = true; });
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        if (sidebar && !matchMedia("(min-width: 900px)").matches) setSide(true);
        input.focus();
      }
    });
  }
})();
