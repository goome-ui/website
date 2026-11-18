(function (root) {
  const GM = root.GM || (typeof require !== "undefined" ? require("./model.js") : null);

  const cache = new Map();
  const typeKey = new WeakMap();

  function tkey(def, types) {
    const k = Object.keys(types).sort().map((n) => n + ":" + types[n]).join(",");
    typeKey.set(def, k);
    return k;
  }

  function ctxFor(def, rt, theme) {
    const types = GM.elementIdents(def);
    return { def, rt, types, key: tkey(def, types), env: { v: rt.v, th: theme || GM.DARK } };
  }

  function compiled(ctx, src, want) {
    if (src === "" || src == null) return null;
    const k = ctx.key + "|" + want + "|" + (typeof src) + ":" + src;
    let r = cache.get(k);
    if (r === undefined) {
      const c = GM.expr.check(src, ctx.types, want);
      r = c.ok ? c.ast : null;
      if (cache.size > 6000) cache.clear();
      cache.set(k, r);
    }
    return r;
  }

  function fieldVal(ctx, src, want) {
    const a = compiled(ctx, src, want);
    if (!a) return want === "b" ? false : 0;
    let v;
    try {
      v = GM.expr.eval(a, ctx.env);
    } catch (e) {
      v = 0;
    }
    if (want === "b") return !!v;
    v = +v;
    return Number.isFinite(v) ? v : 0;
  }
  const num = (ctx, src) => fieldVal(ctx, src, "n");
  const col = (ctx, src) => fieldVal(ctx, src, "c") >>> 0;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const inR = (r, x, y) => r && x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

  function syncParams(def, inst, rt) {
    const p = (inst && inst.p) || {};
    const given = p.params || {};
    for (const pr of def.params) {
      const d = given[pr.name] !== undefined && given[pr.name] !== "" ? given[pr.name] : pr.def;
      rt.v[pr.name] = pr.type === "color" ? parseColor(d) : pr.type === "bool" ? !!d : pr.type === "text" ? String(d == null ? "" : d) : +d || 0;
    }
    if (!def.resizable.on) {
      rt.v.w = +p.w || +def.w || 1;
      rt.v.h = +p.h || +def.h || 1;
    }
  }

  function parseColor(d) {
    if (typeof d === "number") return d >>> 0;
    const s = String(d || "").trim();
    let m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(s))) return (0xFF000000 | parseInt(m[1], 16)) >>> 0;
    if ((m = /^#([0-9a-f]{8})$/i.exec(s))) return ((parseInt(m[1].slice(6), 16) << 24) | parseInt(m[1].slice(0, 6), 16)) >>> 0;
    if ((m = /^0x([0-9a-f]{1,8})$/i.exec(s))) return parseInt(m[1], 16) >>> 0;
    return 0;
  }

  const gvar = (g) => GM.partVar(g);

  function findPart(parts, id) {
    let out = null;
    GM.walkParts(parts, (pt) => {
      if (pt.id === id) out = pt;
    });
    return out;
  }

  function offsets(ctx, g) {
    if (!g.drag || !g.drag.on) return [0, 0];
    const v = ctx.rt.v;
    return [+v[gvar(g) + "_dx"] || 0, +v[gvar(g) + "_dy"] || 0];
  }

  function placed(ctx, parts, ox, oy, out, parent) {
    for (const pt of parts) {
      out.push({ pt, ox, oy, parent });
      if (pt.kind === "group") {
        const [dx, dy] = offsets(ctx, pt);
        placed(ctx, pt.kids || [], ox + num(ctx, pt.f.x) + dx, oy + num(ctx, pt.f.y) + dy, out, pt);
      }
    }
    return out;
  }

  function polyPoints(ctx, s) {
    const out = [];
    for (const pair of String(s || "").trim().split(/\s+/)) {
      if (!pair) continue;
      const xy = pair.split(",");
      if (xy.length !== 2) continue;
      out.push(num(ctx, xy[0]), num(ctx, xy[1]));
    }
    return out;
  }

  function textOf(ctx, s) {
    const m = /^\{([a-z_]\w*)\}$/i.exec(String(s == null ? "" : s));
    if (m) {
      const pr = ctx.def.params.find((p) => p.name === m[1] && p.type === "text");
      if (pr) return String(ctx.rt.v[m[1]]);
    }
    return String(s == null ? "" : s);
  }

  function partBox(ctx, pt) {
    const f = pt.f;
    switch (pt.kind) {
      case "rect": case "rrect": case "frame": case "grad": case "shadow": case "bitmap": case "hit": case "group":
        return { x: num(ctx, f.x), y: num(ctx, f.y), w: num(ctx, f.w), h: num(ctx, f.h) };
      case "circle": {
        const r = num(ctx, f.r);
        return { x: num(ctx, f.cx) - r, y: num(ctx, f.cy) - r, w: 2 * r, h: 2 * r };
      }
      case "ring": case "arc": {
        const r = num(ctx, f.r) + num(ctx, f.width) / 2;
        return { x: num(ctx, f.cx) - r, y: num(ctx, f.cy) - r, w: 2 * r, h: 2 * r };
      }
      case "line": {
        const x0 = num(ctx, f.x0), y0 = num(ctx, f.y0), x1 = num(ctx, f.x1), y1 = num(ctx, f.y1), p = num(ctx, f.width) / 2;
        return { x: Math.min(x0, x1) - p, y: Math.min(y0, y1) - p, w: Math.abs(x1 - x0) + 2 * p, h: Math.abs(y1 - y0) + 2 * p };
      }
      case "poly": {
        const p = polyPoints(ctx, f.points);
        if (p.length < 2) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < p.length; i += 2) x0 = Math.min(x0, p[i]), x1 = Math.max(x1, p[i]), y0 = Math.min(y0, p[i + 1]), y1 = Math.max(y1, p[i + 1]);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      }
      case "text": {
        const sz = num(ctx, f.size) || 15;
        return { x: num(ctx, f.x), y: num(ctx, f.y), w: Math.round(textOf(ctx, f.text).length * sz * 0.55), h: Math.round(sz * 1.25) };
      }
    }
    return null;
  }

  function placedParts(def, rt, theme) {
    const ctx = ctxFor(def, rt, theme);
    return placed(ctx, def.parts, 0, 0, []).map((p) => {
      const b = partBox(ctx, p.pt);
      if (p.pt.kind === "group") {
        const [dx, dy] = offsets(ctx, p.pt);
        if (b) b.x += dx, b.y += dy;
      }
      return { pt: p.pt, parent: p.parent, box: b ? { x: b.x + p.ox, y: b.y + p.oy, w: b.w, h: b.h } : null };
    });
  }

  function groupInfo(ctx) {
    const out = [];
    for (const p of placed(ctx, ctx.def.parts, 0, 0, [])) {
      const g = p.pt;
      if (g.kind !== "group" || !g.drag || !g.drag.on) continue;
      const gx = num(ctx, g.f.x), gy = num(ctx, g.f.y), gw = num(ctx, g.f.w), gh = num(ctx, g.f.h);
      const [dx, dy] = offsets(ctx, g);
      const box = { x: p.ox + gx + dx, y: p.oy + gy + dy, w: gw, h: gh };
      let handle = box;
      if (g.drag.handle) {
        const inner = placed(ctx, g.kids || [], box.x, box.y, []).find((q) => q.pt.id === g.drag.handle);
        if (inner) {
          const b = partBox(ctx, inner.pt);
          if (b) {
            if (inner.pt.kind === "group") {
              const [hx, hy] = offsets(ctx, inner.pt);
              b.x += hx, b.y += hy;
            }
            handle = { x: b.x + inner.ox, y: b.y + inner.oy, w: b.w, h: b.h };
          }
        }
      }
      out.push({ g, gx, gy, gw, gh, box, handle });
    }
    return out;
  }

  function bounds(ctx, gi) {
    const d = gi.g.drag, v = ctx.rt.v;
    if (d.bounds === "element") return { x0: -gi.gx, x1: v.w - gi.gw - gi.gx, y0: -gi.gy, y1: v.h - gi.gh - gi.gy };
    if (d.bounds === "rect") {
      const R = d.rect || {};
      const rx = num(ctx, R.x), ry = num(ctx, R.y), rw = num(ctx, R.w), rh = num(ctx, R.h);
      return { x0: rx - gi.gx, x1: rx + rw - gi.gw - gi.gx, y0: ry - gi.gy, y1: ry + rh - gi.gh - gi.gy };
    }
    return { x0: -Infinity, x1: Infinity, y0: -Infinity, y1: Infinity };
  }

  function resizeRect(rt) {
    return { x: rt.v.w - 14, y: rt.v.h - 14, w: 14, h: 14 };
  }

  function hitRects(def, rt, theme) {
    const ctx = ctxFor(def, rt, theme);
    const out = [];
    if (def.hit === "parts") {
      for (const p of placed(ctx, def.parts, 0, 0, [])) {
        if (!(p.pt.kind === "hit" || (p.pt.hit && p.pt.kind !== "group" && p.pt.kind !== "widget"))) continue;
        const b = partBox(ctx, p.pt);
        if (b) out.push({ x: b.x + p.ox, y: b.y + p.oy, w: b.w, h: b.h });
      }
    } else out.push({ x: 0, y: 0, w: rt.v.w, h: rt.v.h });
    for (const gi of groupInfo(ctx)) out.push(gi.box);
    if (def.resizable.on) out.push(resizeRect(rt));
    return out;
  }

  function valueRange(ctx, gi) {
    const b = bounds(ctx, gi);
    return ctx.def.value.axis === "y" ? [b.y0, b.y1] : [b.x0, b.x1];
  }

  function initState(def, inst) {
    const p = (inst && inst.p) || {};
    const init = p.init || {};
    const rt = { v: {}, x: +p.x || 0, y: +p.y || 0, drag: null, resizing: false, press: { x: 0, y: 0 }, start: { x: 0, y: 0 }, didDrag: false, log: [] };
    const v = rt.v;
    v.w = +p.w || +def.w || 1;
    v.h = +p.h || +def.h || 1;
    syncParams(def, inst, rt);
    for (const s of def.state) {
      const d = init[s.name] !== undefined ? init[s.name] : s.def;
      v[s.name] = s.type === "bool" ? !!d : +d || 0;
    }
    v.hovered = false, v.pressed = false, v.dragging = false, v.value = 0;
    for (const g of GM.dragGroups(def)) v[gvar(g) + "_dx"] = 0, v[gvar(g) + "_dy"] = 0;
    const val = def.value;
    const hasState = (n) => def.state.some((s) => s.name === n);
    if (val.src === "state" && hasState(val.state)) v.value = +v[val.state] || 0;
    if (val.src === "drag") {
      const start = val.state && hasState(val.state) ? +v[val.state] || 0 : init.value !== undefined ? +init.value || 0 : +val.min || 0;
      v.value = start;
      const ctx = ctxFor(def, rt, GM.DARK);
      const gi = groupInfo(ctx).find((q) => q.g.id === val.part);
      if (gi) {
        const [lo, hi] = valueRange(ctx, gi);
        const mn = +val.min || 0, mx = +val.max || 0;
        const t = mx !== mn ? (start - mn) / (mx - mn) : 0;
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          const off = lo + t * (hi - lo);
          v[gvar(gi.g) + (val.axis === "y" ? "_dy" : "_dx")] = off;
        }
      }
    }
    return rt;
  }

  function act(ctx, e) {
    const v = ctx.rt.v;
    if (e.act === "print") {
      ctx.rt.log.push(String(e.text || ""));
      return;
    }
    const ts = ctx.def.state.find((s) => s.name === e.target);
    if (!ts) return;
    const b = ts.type === "bool";
    if (e.act === "toggle") v[ts.name] = b ? !v[ts.name] : v[ts.name] ? 0 : 1;
    else if (e.act === "set") v[ts.name] = b ? fieldVal(ctx, e.expr, "b") : fieldVal(ctx, e.expr, "n");
    else if (e.act === "add") v[ts.name] = b ? !!v[ts.name] : (+v[ts.name] || 0) + fieldVal(ctx, e.expr, "n");
  }

  function step(def, rt, inp, theme) {
    const ctx = ctxFor(def, rt, theme);
    const v = rt.v;
    const fired = [];
    const fire = (on) => {
      fired.push(on);
      for (const e of def.events) if (e.on === on) act(ctx, e);
    };
    const hits = hitRects(def, rt, theme);
    const inside = hits.some((r) => inR(r, inp.x, inp.y));
    const was = !!v.hovered;
    v.hovered = inside || !!rt.drag || rt.resizing;
    if (v.hovered && !was) fire("enter");
    if (!v.hovered && was) fire("leave");
    let grabStart = false;
    if (inp.pressed && v.hovered && !v.pressed) {
      v.pressed = true;
      rt.didDrag = false;
      if (def.resizable.on && inR(resizeRect(rt), inp.x, inp.y)) {
        rt.resizing = true, rt.didDrag = true, grabStart = true;
        rt.press = { x: inp.x, y: inp.y };
        rt.start = { x: v.w, y: v.h };
      } else {
        let pick = null;
        for (const gi of groupInfo(ctx)) if (inR(gi.handle, inp.x, inp.y)) pick = gi;
        if (pick) {
          const k = gvar(pick.g);
          rt.drag = pick.g.id;
          rt.press = { x: inp.x, y: inp.y };
          rt.start = { x: +v[k + "_dx"] || 0, y: +v[k + "_dy"] || 0 };
          v.dragging = true, rt.didDrag = true, grabStart = true;
        }
      }
      fire("press");
    }
    if (v.pressed && inp.down) {
      if (rt.drag) {
        const gi = groupInfo(ctx).find((q) => q.g.id === rt.drag);
        if (gi) {
          const ax = gi.g.drag.axis, k = gvar(gi.g), b = bounds(ctx, gi);
          let nx = +v[k + "_dx"] || 0, ny = +v[k + "_dy"] || 0;
          const sn = +gi.g.drag.snap || 0;
          if (ax !== "y") {
            nx = rt.start.x + (inp.x - rt.press.x);
            if (sn > 0) nx = Math.floor(nx / sn + 0.5) * sn;
            nx = clamp(nx, b.x0, b.x1);
          }
          if (ax !== "x") {
            ny = rt.start.y + (inp.y - rt.press.y);
            if (sn > 0) ny = Math.floor(ny / sn + 0.5) * sn;
            ny = clamp(ny, b.y0, b.y1);
          }
          v[k + "_dx"] = nx, v[k + "_dy"] = ny;
          const val = def.value;
          if (val.src === "drag" && val.part === gi.g.id) {
            const [lo, hi] = val.axis === "y" ? [b.y0, b.y1] : [b.x0, b.x1];
            const off = val.axis === "y" ? ny : nx;
            const t = hi !== lo && Number.isFinite(hi - lo) ? (off - lo) / (hi - lo) : 0;
            v.value = (+val.min || 0) + t * ((+val.max || 0) - (+val.min || 0));
            if (val.state && def.state.some((s) => s.name === val.state)) v[val.state] = v.value;
          }
        }
        fire("drag");
      }
      if (rt.resizing) {
        const r = def.resizable;
        v.w = clamp(rt.start.x + (inp.x - rt.press.x), +r.minW || 1, +r.maxW || 1e6);
        v.h = clamp(rt.start.y + (inp.y - rt.press.y), +r.minH || 1, +r.maxH || 1e6);
      }
    }
    let grabEnd = false;
    if (inp.released && v.pressed) {
      if (v.hovered && !rt.didDrag) fire("click");
      fire("release");
      grabEnd = !!(rt.drag || rt.resizing);
      v.pressed = false, v.dragging = false, rt.drag = null, rt.resizing = false;
      v.hovered = hitRects(def, rt, theme).some((r) => inR(r, inp.x, inp.y));
    }
    const val = def.value;
    if (val.src === "state" && def.state.some((s) => s.name === val.state)) v.value = +v[val.state] || 0;
    return { fired, grabStart, grabEnd, hits };
  }

  const imgs = new Map();
  function getImg(src, again) {
    if (!src || typeof Image === "undefined") return null;
    let r = imgs.get(src);
    if (!r) {
      r = { img: new Image(), ok: false, wait: new Set() };
      r.img.onload = () => {
        r.ok = true;
        for (const f of r.wait) f();
        r.wait.clear();
      };
      r.img.src = src;
      imgs.set(src, r);
    }
    if (!r.ok && again) r.wait.add(again);
    return r.ok ? r.img : null;
  }

  function rrPath(c2, x, y, w, h, tl, tr, br, bl) {
    const m = Math.max(0, Math.min(w, h) / 2);
    tl = clamp(tl, 0, m), tr = clamp(tr, 0, m), br = clamp(br, 0, m), bl = clamp(bl, 0, m);
    c2.beginPath();
    c2.moveTo(x + tl, y);
    c2.lineTo(x + w - tr, y);
    if (tr) c2.arcTo(x + w, y, x + w, y + tr, tr);
    c2.lineTo(x + w, y + h - br);
    if (br) c2.arcTo(x + w, y + h, x + w - br, y + h, br);
    c2.lineTo(x + bl, y + h);
    if (bl) c2.arcTo(x, y + h, x, y + h - bl, bl);
    c2.lineTo(x, y + tl);
    if (tl) c2.arcTo(x, y, x + tl, y, tl);
    c2.closePath();
  }

  function drawPart(c2, ctx, pt, k, again) {
    const f = pt.f;
    if (pt.show !== "" && pt.show != null && !fieldVal(ctx, pt.show, "b")) return;
    const N = (n) => num(ctx, f[n]);
    switch (pt.kind) {
      case "rect":
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fillRect(N("x"), N("y"), N("w"), N("h"));
        break;
      case "rrect":
        rrPath(c2, N("x"), N("y"), N("w"), N("h"), N("tl"), N("tr"), N("br"), N("bl"));
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fill();
        break;
      case "frame": {
        const x = N("x"), y = N("y"), w = N("w"), h = N("h"), lw = Math.max(0, N("width"));
        c2.beginPath();
        c2.rect(x, y, w, h);
        c2.rect(x + lw, y + lw, Math.max(0, w - 2 * lw), Math.max(0, h - 2 * lw));
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fill("evenodd");
        break;
      }
      case "line":
        c2.beginPath();
        c2.moveTo(N("x0"), N("y0"));
        c2.lineTo(N("x1"), N("y1"));
        c2.lineWidth = Math.max(0.01, N("width"));
        c2.lineCap = "round";
        c2.strokeStyle = GM.argbCss(col(ctx, f.color));
        c2.stroke();
        break;
      case "circle":
        c2.beginPath();
        c2.arc(N("cx"), N("cy"), Math.max(0, N("r")), 0, Math.PI * 2);
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fill();
        break;
      case "ring":
        c2.beginPath();
        c2.arc(N("cx"), N("cy"), Math.max(0, N("r")), 0, Math.PI * 2);
        c2.lineWidth = Math.max(0.01, N("width"));
        c2.strokeStyle = GM.argbCss(col(ctx, f.color));
        c2.stroke();
        break;
      case "arc":
        c2.beginPath();
        c2.arc(N("cx"), N("cy"), Math.max(0, N("r")), N("a0"), N("a1"), false);
        c2.lineWidth = Math.max(0.01, N("width"));
        c2.lineCap = "round";
        c2.strokeStyle = GM.argbCss(col(ctx, f.color));
        c2.stroke();
        break;
      case "poly": {
        const p = polyPoints(ctx, f.points);
        if (p.length < 6) break;
        c2.beginPath();
        c2.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) c2.lineTo(p[i], p[i + 1]);
        c2.closePath();
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fill("nonzero");
        break;
      }
      case "grad": {
        const x = N("x"), y = N("y"), w = N("w"), h = N("h"), r = N("radius");
        const side = typeof f.sideways === "boolean" ? f.sideways : !!fieldVal(ctx, f.sideways, "b");
        const g = side ? c2.createLinearGradient(x, 0, x + w, 0) : c2.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, GM.argbCss(col(ctx, f.from)));
        g.addColorStop(1, GM.argbCss(col(ctx, f.to)));
        rrPath(c2, x, y, w, h, r, r, r, r);
        c2.fillStyle = g;
        c2.fill();
        break;
      }
      case "shadow": {
        const x = N("x"), y = N("y"), w = N("w"), h = N("h"), r = N("radius"), blur = Math.max(0, N("blur"));
        const off = 10000;
        c2.save();
        c2.shadowColor = GM.argbCss(col(ctx, f.color));
        c2.shadowBlur = blur * k;
        c2.shadowOffsetX = off * k;
        rrPath(c2, x - off, y, w, h, r, r, r, r);
        c2.fillStyle = "#000";
        c2.fill();
        c2.restore();
        break;
      }
      case "text": {
        const sz = N("size") || 15;
        c2.font = sz + "px system-ui, 'Segoe UI', Cantarell, 'Noto Sans', sans-serif";
        c2.textBaseline = "top";
        c2.fillStyle = GM.argbCss(col(ctx, f.color));
        c2.fillText(textOf(ctx, f.text), N("x"), N("y"));
        break;
      }
      case "bitmap": {
        const x = N("x"), y = N("y"), w = N("w"), h = N("h"), r = N("radius");
        const im = getImg(f.img, again);
        c2.save();
        rrPath(c2, x, y, w, h, r, r, r, r);
        c2.clip();
        if (im) {
          c2.globalAlpha = (((col(ctx, f.tint) >>> 24) & 255) / 255) || 0;
          c2.drawImage(im, x, y, w, h);
        } else {
          c2.fillStyle = GM.argbCss(GM.fade(ctx.env.th.text_dim, 0.25));
          c2.fillRect(x, y, w, h);
        }
        c2.restore();
        break;
      }
      case "group": {
        const [dx, dy] = offsets(ctx, pt);
        c2.save();
        c2.translate(N("x") + dx, N("y") + dy);
        const clip = typeof f.clip === "boolean" ? f.clip : !!fieldVal(ctx, f.clip, "b");
        if (clip) {
          c2.beginPath();
          c2.rect(0, 0, N("w"), N("h"));
          c2.clip();
        }
        for (const q of pt.kids || []) drawPart(c2, ctx, q, k, again);
        c2.restore();
        break;
      }
    }
  }

  function draw(c2, def, rt, theme, k, again) {
    const ctx = ctxFor(def, rt, theme);
    for (const pt of def.parts) drawPart(c2, ctx, pt, k || 1, again);
  }

  function mount(host, def, inst, rt, opts) {
    opts = opts || {};
    const cv = document.createElement("canvas");
    cv.className = "gme-cv";
    cv.style.touchAction = "none";
    host.appendChild(cv);
    const zoom = () => (typeof opts.zoom === "function" ? opts.zoom() : opts.zoom || 1);
    const theme = () => (opts.theme ? opts.theme() : GM.DARK) || GM.DARK;
    let dead = false, down = false, changed = false, queued = false;
    const later = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        redraw();
      });
    };
    function redraw() {
      if (dead) return;
      syncParams(def, inst, rt);
      const dpr = window.devicePixelRatio || 1, z = zoom();
      const w = Math.max(1, rt.v.w), h = Math.max(1, rt.v.h);
      const pw = Math.max(1, Math.round(w * z * dpr)), ph = Math.max(1, Math.round(h * z * dpr));
      if (cv.width !== pw) cv.width = pw;
      if (cv.height !== ph) cv.height = ph;
      cv.style.width = w * z + "px";
      cv.style.height = h * z + "px";
      const c2 = cv.getContext("2d");
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, pw, ph);
      const k = dpr * z;
      c2.setTransform(k, 0, 0, k, 0, 0);
      draw(c2, def, rt, theme(), k, later);
      if (opts.overlay) {
        c2.setTransform(k, 0, 0, k, 0, 0);
        opts.overlay(c2, k);
      }
    }
    const loc = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * rt.v.w) / (r.width || 1), y: ((e.clientY - r.top) * rt.v.h) / (r.height || 1) };
    };
    const snap = () => JSON.stringify(rt.v);
    function run(inp) {
      const before = snap();
      const res = step(def, rt, inp, theme());
      if (rt.log.length) {
        for (const l of rt.log) {
          if (opts.onPrint) opts.onPrint(l);
          else console.log(l);
        }
        rt.log = [];
      }
      if (snap() !== before) {
        changed = true;
        if (opts.onChange) opts.onChange(rt);
      }
      cv.style.cursor = rt.drag || rt.resizing ? "grabbing" : rt.v.hovered ? "pointer" : "";
      redraw();
      return res;
    }
    cv.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const p = loc(e);
      run({ x: p.x, y: p.y, down: true, pressed: true, released: false });
      if (rt.v.pressed) {
        down = true;
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (er) {}
        if (rt.drag || rt.resizing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const p = loc(e);
      run({ x: p.x, y: p.y, down, pressed: false, released: false });
    });
    const up = (e) => {
      if (!down) return;
      down = false;
      const p = loc(e);
      run({ x: p.x, y: p.y, down: false, pressed: false, released: true });
      if (changed) {
        changed = false;
        if (opts.onCommit) opts.onCommit(rt);
      }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", () => {
      if (!down && rt.v.hovered) run({ x: -1e6, y: -1e6, down: false, pressed: false, released: false });
    });
    redraw();
    return { el: cv, redraw, destroy() {
      dead = true;
      cv.remove();
    } };
  }

  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    if (a)
      for (const k in a) {
        const v = a[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "style") el.style.cssText = v;
        else if (k in el && k !== "list") el[k] = v;
        else el.setAttribute(k, v === true ? "" : v);
      }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  const ICON = {
    up: "M6 14l6-6 6 6", down: "M6 10l6 6 6-6", copy: "M8 8h11v11H8zM5 16V5h11", trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
    back: "M15 5l-7 7 7 7", in: "M5 12h10M11 7l5 5-5 5M19 5v14", out: "M19 12H9M13 7l-5 5 5 5M5 5v14", plus: "M12 5v14M5 12h14",
  };
  const ico = (n) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ico");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICON[n]);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.append(p);
    return s;
  };
  const ibtn = (name, title, fn, cls) => h("button", { class: "btn sm ghost " + (cls || ""), title, "aria-label": title, onclick: fn }, ico(name));

  function download(name, obj) {
    const b = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(b), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function uniqueName(project, base, skip) {
    const used = new Set(project.elements.filter((e) => e !== skip).map((e) => e.name));
    let n = GM.ident(base, "thing");
    if (!used.has(n)) return n;
    const stem = n.replace(/_?\d+$/, "") || "thing";
    for (let i = 2; ; i++) if (!used.has(stem + i)) return stem + i;
  }

  function reId(def) {
    const map = {};
    GM.walkParts(def.parts, (pt) => {
      const n = GM.uid("p");
      map[pt.id] = n;
      pt.id = n;
    });
    GM.walkParts(def.parts, (pt) => {
      if (pt.drag && pt.drag.handle && map[pt.drag.handle]) pt.drag.handle = map[pt.drag.handle];
    });
    if (def.value.part && map[def.value.part]) def.value.part = map[def.value.part];
    def.id = GM.uid("e");
    return def;
  }

  function importFile(obj, project) {
    if (!obj || typeof obj !== "object") return null;
    let raw = null;
    if (obj.format === "goome-element" && obj.element) raw = obj.element;
    else if (obj.element && Array.isArray(obj.element.parts)) raw = obj.element;
    else if (Array.isArray(obj.parts) && obj.format !== "goome-project" && obj.format !== "goome-theme") raw = obj;
    if (!raw) return null;
    const def = GM.normElement(raw);
    if (project.elements.some((e) => e.id === def.id)) reId(def);
    def.name = uniqueName(project, def.name);
    project.elements.push(def);
    return def;
  }

  function exportObj(def) {
    return { format: "goome-element", version: 1, element: GM.clone(def) };
  }

  function thumb(def, theme, maxW, maxH) {
    const cv = h("canvas", { class: "gme-thumb" });
    const rt = initState(def, null);
    const z = Math.min(maxW / Math.max(1, rt.v.w), maxH / Math.max(1, rt.v.h), 1);
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    cv.width = Math.max(1, Math.round(rt.v.w * z * dpr));
    cv.height = Math.max(1, Math.round(rt.v.h * z * dpr));
    cv.style.width = rt.v.w * z + "px";
    cv.style.height = rt.v.h * z + "px";
    const c2 = cv.getContext("2d");
    const paint = () => {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, cv.width, cv.height);
      c2.setTransform(z * dpr, 0, 0, z * dpr, 0, 0);
      draw(c2, def, rt, theme, z * dpr, paint);
    };
    paint();
    return cv;
  }

  const libSel = { id: null, del: null };

  function readJsonFile(file, done) {
    const r = new FileReader();
    r.onload = () => {
      let obj = null;
      try {
        obj = JSON.parse(String(r.result));
      } catch (e) {}
      done(obj);
    };
    r.readAsText(file);
  }

  function uses(project, def) {
    let n = 0;
    GM.walk(project.root, (x) => {
      if (x.type === "el" && x.p.el === def.id) n++;
    });
    return n;
  }

  function library(container, project, hooks) {
    hooks = hooks || {};
    container.innerHTML = "";
    const wrap = h("div", { class: "gme gme-lib" });
    container.append(wrap);
    const msg = h("div", { class: "muted gme-msg" });
    const fileIn = h("input", { type: "file", accept: ".json,application/json", class: "gme-hide" });
    fileIn.addEventListener("change", () => {
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      readJsonFile(f, (obj) => {
        const def = importFile(obj, project);
        fileIn.value = "";
        if (!def) {
          msg.textContent = "that file isnt a goome element";
          msg.className = "err gme-msg";
          return;
        }
        libSel.id = def.id;
        commit();
      });
    });
    const commit = () => {
      if (hooks.commit) hooks.commit();
      library(container, project, hooks);
    };
    wrap.append(
      h("div", { class: "gme-tools" },
        h("button", { class: "btn pri", onclick: () => {
          const d = GM.newElement(uniqueName(project, "thing"));
          const bg = GM.newPart("rrect");
          bg.name = "bg";
          Object.assign(bg.f, { w: "w", h: "h", color: "hovered ? th.hover : th.input_bg" });
          d.parts.push(bg);
          project.elements.push(d);
          libSel.id = d.id;
          if (hooks.commit) hooks.commit();
          if (hooks.edit) hooks.edit(d);
          else library(container, project, hooks);
        } }, "New element"),
        h("button", { class: "btn", onclick: () => fileIn.click() }, "Import"),
        fileIn),
      msg);
    const theme = project.theme || GM.DARK;
    if (GM.TEMPLATES) {
      const row = h("div", { class: "gme-temps" });
      for (const t of GM.TEMPLATES())
        row.append(h("button", { class: "gme-temp", title: t.about || t.name, onclick: () => {
          const d = reId(GM.normElement(GM.clone(t)));
          d.name = uniqueName(project, t.name);
          project.elements.push(d);
          libSel.id = d.id;
          libSel.del = null;
          if (hooks.commit) hooks.commit();
          if (hooks.edit) hooks.edit(d);
          else library(container, project, hooks);
        } }, h("span", { class: "gme-thumbbox" }, thumb(t, theme, 72, 40)), h("span", { class: "gme-tname" }, t.name.replace(/_/g, " "))));
      wrap.append(h("div", { class: "sec" }, "Start from a template"), row);
    }
    if (!project.elements.length) {
      wrap.append(h("p", { class: "muted" }, "no custom elements yet. make one, pick a template, or drop a .goome-element.json file here."));
      return;
    }
    wrap.append(h("div", { class: "sec" }, "Your elements"));
    for (const def of project.elements) {
      const on = libSel.id === def.id;
      const row = h("div", { class: "li gme-librow" + (on ? " on" : ""), onclick: () => {
        if (libSel.id === def.id) return;
        libSel.id = def.id;
        libSel.del = null;
        library(container, project, hooks);
      } },
        h("div", { class: "gme-thumbbox" }, thumb(def, theme, 72, 40)),
        h("div", { class: "gme-libname" }, h("b", null, def.name), h("span", { class: "muted" }, " " + def.w + "x" + def.h + ", " + def.parts.length + " parts")));
      wrap.append(row);
      if (!on) continue;
      const n = uses(project, def);
      const name = h("input", { class: "in", value: def.name, "aria-label": "Name" });
      name.addEventListener("change", () => {
        def.name = uniqueName(project, name.value, def);
        commit();
      });
      const delLabel = libSel.del === def.id ? (n ? "used " + n + " times, tap again" : "tap again to delete") : "Delete";
      wrap.append(h("div", { class: "gme-libedit" },
        h("label", { class: "fld" }, h("span", null, "Name"), name),
        h("div", { class: "gme-tools" },
          h("button", { class: "btn pri", onclick: () => hooks.edit && hooks.edit(def) }, "Edit"),
          h("button", { class: "btn", onclick: () => hooks.add && hooks.add(def) }, "Add to layout"),
          h("button", { class: "btn", onclick: () => {
            const d = reId(GM.normElement(GM.clone(def)));
            d.name = uniqueName(project, def.name);
            project.elements.splice(project.elements.indexOf(def) + 1, 0, d);
            libSel.id = d.id;
            commit();
          } }, "Duplicate"),
          h("button", { class: "btn", onclick: () => download(def.name + ".goome-element.json", exportObj(def)) }, "Export"),
          h("button", { class: "btn ghost gme-danger", onclick: () => {
            if (libSel.del !== def.id) {
              libSel.del = def.id;
              library(container, project, hooks);
              return;
            }
            project.elements.splice(project.elements.indexOf(def), 1);
            libSel.id = null, libSel.del = null;
            commit();
          } }, delLabel))));
    }
  }

  const edState = new WeakMap();
  const KINDS = Object.keys(GM.PART_KINDS);
  const WIDGET_TYPES = Object.keys(GM.TYPES).filter((t) => !GM.isContainer(t) && !["el", "menu_item", "menu_sep", "toast", "window"].includes(t));

  function locate(list, id, parent) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, i, parent: parent || null };
      if (list[i].kids) {
        const r = locate(list[i].kids, id, list[i]);
        if (r) return r;
      }
    }
    return null;
  }

  function numOr(s) {
    const t = String(s).trim();
    return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : t;
  }

  function editor(container, project, def, hooks) {
    hooks = hooks || {};
    let st = edState.get(def);
    if (!st) {
      st = { sel: def.parts.length ? def.parts[0].id : null, tab: "parts" };
      edState.set(def, st);
    }
    container.innerHTML = "";
    const root = h("div", { class: "gme gme-ed" });
    container.append(root);
    const theme = () => project.theme || GM.DARK;
    const fakeInst = { p: { params: {}, init: {}, w: 0, h: 0, x: 0, y: 0 } };
    const tok = {};
    container._gmeTok = tok;
    const rt = initState(def, fakeInst);
    const reset = () => {
      const n = initState(def, fakeInst);
      for (const k of Object.keys(rt)) delete rt[k];
      Object.assign(rt, n);
    };
    let stage = null;
    const readout = h("div", { class: "gme-readout" });
    const printed = h("div", { class: "gme-readout muted" });

    const showReadout = () => {
      const bits = [];
      for (const s of def.state) bits.push(s.name + " " + (s.type === "bool" ? (rt.v[s.name] ? "yes" : "no") : fmt(rt.v[s.name])));
      if (def.value.src !== "none") bits.push("value " + fmt(rt.v.value));
      if (def.resizable.on) bits.push(Math.round(rt.v.w) + "x" + Math.round(rt.v.h));
      readout.textContent = bits.length ? bits.join("   ") : "no state yet";
    };
    const fmt = (x) => (Number.isInteger(+x) ? String(+x) : (+x).toFixed(2));

    const changed = () => {
      if (stage) stage.redraw();
      showReadout();
      if (hooks.changed) hooks.changed();
    };
    const commit = (rebuild) => {
      reset();
      if (hooks.commit) hooks.commit();
      if (container._gmeTok !== tok) return;
      if (rebuild !== false) build();
      else changed();
    };

    const zoomOf = (box) => {
      const room = Math.max(120, (box.clientWidth || 320) - 24);
      return Math.max(0.25, Math.min(2, room / Math.max(1, rt.v.w)));
    };

    function overlay(c2, k) {
      c2.lineWidth = 1 / k * 1.5;
      c2.setLineDash([4 / k, 3 / k]);
      c2.strokeStyle = "rgba(150,156,166,0.8)";
      for (const r of hitRects(def, rt, theme())) c2.strokeRect(r.x, r.y, r.w, r.h);
      const sel = placedParts(def, rt, theme()).find((p) => p.pt.id === st.sel);
      if (sel && sel.box) {
        c2.setLineDash([]);
        c2.strokeStyle = "#6fdc5f";
        c2.lineWidth = 2 / k;
        c2.strokeRect(sel.box.x, sel.box.y, sel.box.w, sel.box.h);
      }
      c2.setLineDash([]);
    }

    function build() {
      root.innerHTML = "";
      const name = h("input", { class: "in gme-name", value: def.name, "aria-label": "Element name" });
      name.addEventListener("change", () => {
        def.name = uniqueName(project, name.value, def);
        commit();
      });
      root.append(h("div", { class: "gme-head" },
        h("button", { class: "btn ghost", onclick: () => hooks.back && hooks.back(), "aria-label": "Back" }, ico("back"), " Library"),
        name,
        h("button", { class: "btn", onclick: () => hooks.add && hooks.add(def) }, "Add"),
        h("button", { class: "btn", onclick: () => download(def.name + ".goome-element.json", exportObj(def)) }, "Export")));

      const box = h("div", { class: "gme-stage" });
      root.append(box);
      const hostEl = h("div", { class: "gme-stagein" });
      box.append(hostEl);
      stage = mount(hostEl, def, fakeInst, rt, {
        theme, zoom: () => zoomOf(box), overlay,
        onChange: () => showReadout(),
        onPrint: (t) => {
          printed.textContent = "printed: " + t;
        },
      });
      hostEl.addEventListener("pointerdown", (e) => {
        const r = stage.el.getBoundingClientRect();
        const x = ((e.clientX - r.left) * rt.v.w) / (r.width || 1), y = ((e.clientY - r.top) * rt.v.h) / (r.height || 1);
        const hit = placedParts(def, rt, theme()).filter((p) => p.box && inR(p.box, x, y) && p.pt.kind !== "widget");
        if (!hit.length) return;
        const top = hit[hit.length - 1].pt;
        if (top.id === st.sel) return;
        st.sel = top.id;
        renderPanel();
        stage.redraw();
      }, true);
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(() => stage && stage.redraw());
        ro.observe(box);
      }
      showReadout();
      root.append(h("div", { class: "gme-under" }, readout, h("button", { class: "btn sm ghost", onclick: () => {
        reset();
        build();
      } }, "Reset"), printed));
      const flow = [];
      GM.walkParts(def.parts, (pt) => {
        if (pt.kind === "widget" && pt.w) flow.push(pt.w);
      });
      if (flow.length && hooks.renderFlow) {
        const f = hooks.renderFlow(flow);
        if (f) root.append(h("div", { class: "gme-flow" }, h("div", { class: "sec" }, "Widget parts, inside a window"), f));
      }
      const tabs = h("div", { class: "gme-tabs" });
      for (const [k, label] of [["parts", "Parts"], ["element", "Element"], ["data", "Params + state"], ["events", "Events"]])
        tabs.append(h("button", { class: "chip" + (st.tab === k ? " on" : ""), onclick: () => {
          st.tab = k;
          build();
        } }, label));
      root.append(tabs);
      panel = h("div", { class: "gme-panel" });
      root.append(panel);
      renderPanel();
    }
    let panel = null;

    function exprField(label, obj, key, want, opt) {
      opt = opt || {};
      const err = h("div", { class: "err" });
      const inp = h("input", { class: "in", value: obj[key] == null ? "" : String(typeof obj[key] === "number" && GM.COLOR_FIELDS.has(key) ? GM.hex8(obj[key]) : obj[key]), spellcheck: false, autocapitalize: "off" });
      const check = () => {
        const v = obj[key];
        if (v === "" && opt.empty) {
          err.textContent = "";
          return;
        }
        if (want === "pts") {
          const bad = String(v).trim().split(/\s+/).map((p) => p.split(",")).find((xy) => xy.length !== 2 || xy.some((c) => !GM.expr.check(numOr(c), GM.elementIdents(def), "n").ok));
          err.textContent = bad ? "points look like 0,30 30,0 60,30 (no spaces inside a point)" : "";
          return;
        }
        const r = GM.expr.check(typeof v === "string" ? numOr(v) : v, GM.elementIdents(def), want);
        err.textContent = r.ok ? "" : r.err;
      };
      inp.addEventListener("input", () => {
        obj[key] = want === "pts" || opt.text ? inp.value : numOr(inp.value);
        check();
        changed();
      });
      inp.addEventListener("change", () => commit(false));
      check();
      return h("label", { class: "fld" }, h("span", null, label), inp, err);
    }
    function textField(label, obj, key, after) {
      const inp = h("input", { class: "in", value: obj[key] == null ? "" : String(obj[key]) });
      inp.addEventListener("input", () => {
        obj[key] = inp.value;
        changed();
      });
      inp.addEventListener("change", () => {
        if (after) after();
        commit(false);
      });
      return h("label", { class: "fld" }, h("span", null, label), inp);
    }
    function numField(label, obj, key, rebuild) {
      const inp = h("input", { class: "in", type: "number", value: String(obj[key]), step: "any" });
      inp.addEventListener("input", () => {
        const n = parseFloat(inp.value);
        if (Number.isFinite(n)) obj[key] = n;
        if (rebuild === "rt") reset(), stage.redraw(), showReadout();
        changed();
      });
      inp.addEventListener("change", () => commit(rebuild === "rt" ? false : rebuild));
      return h("label", { class: "fld" }, h("span", null, label), inp);
    }
    function selField(label, obj, key, opts, rebuild) {
      const s = h("select", { class: "in" });
      for (const [v, t] of opts) s.append(h("option", { value: v, selected: String(obj[key]) === String(v) }, t));
      s.addEventListener("change", () => {
        obj[key] = s.value;
        commit(rebuild);
      });
      return h("label", { class: "fld" }, h("span", null, label), s);
    }
    function boolChip(label, obj, key, rebuild) {
      return h("button", { class: "chip" + (obj[key] ? " on" : ""), "aria-pressed": String(!!obj[key]), onclick: () => {
        obj[key] = !obj[key];
        commit(rebuild);
      } }, label);
    }

    function renderPanel() {
      panel.innerHTML = "";
      if (st.tab === "parts") partsPanel();
      else if (st.tab === "element") elementPanel();
      else if (st.tab === "data") dataPanel();
      else eventsPanel();
    }

    function partsPanel() {
      const kind = h("select", { class: "in", "aria-label": "Part kind" });
      for (const k of KINDS) kind.append(h("option", { value: k }, GM.PART_KINDS[k].name));
      panel.append(h("div", { class: "gme-tools" }, kind, h("button", { class: "btn pri", onclick: () => {
        const pt = GM.newPart(kind.value);
        pt.name = GM.ident(kind.value);
        const used = new Set();
        GM.walkParts(def.parts, (q) => used.add(q.name));
        if (used.has(pt.name)) for (let i = 2; ; i++) if (!used.has(pt.name + i)) {
          pt.name += i;
          break;
        }
        const loc = st.sel ? locate(def.parts, st.sel) : null;
        if (loc && loc.list[loc.i].kind === "group") loc.list[loc.i].kids.push(pt);
        else if (loc) loc.list.splice(loc.i + 1, 0, pt);
        else def.parts.push(pt);
        st.sel = pt.id;
        commit();
      } }, ico("plus"), " Add part")));
      const tree = h("div", { class: "gme-tree" });
      panel.append(tree);
      const rowsOf = (list, depth) => {
        for (const pt of list) {
          const on = pt.id === st.sel;
          tree.append(h("div", { class: "li gme-trow" + (on ? " on" : ""), style: "padding-left:" + (10 + depth * 18) + "px", onclick: () => {
            st.sel = pt.id;
            renderPanel();
            stage.redraw();
          } }, h("span", null, pt.name || pt.kind), h("span", { class: "muted" }, " " + GM.PART_KINDS[pt.kind].name.toLowerCase() + (pt.drag && pt.drag.on ? ", drag " + pt.drag.axis : "") + (pt.show ? ", if " + pt.show : ""))));
          if (pt.kids) rowsOf(pt.kids, depth + 1);
        }
      };
      rowsOf(def.parts, 0);
      if (!def.parts.length) tree.append(h("p", { class: "muted" }, "nothing here yet, add a part"));
      const loc = st.sel ? locate(def.parts, st.sel) : null;
      if (!loc) return;
      const pt = loc.list[loc.i];
      panel.append(h("div", { class: "gme-tools" },
        ibtn("up", "Move up", () => {
          if (loc.i > 0) [loc.list[loc.i - 1], loc.list[loc.i]] = [loc.list[loc.i], loc.list[loc.i - 1]], commit();
        }),
        ibtn("down", "Move down", () => {
          if (loc.i < loc.list.length - 1) [loc.list[loc.i + 1], loc.list[loc.i]] = [loc.list[loc.i], loc.list[loc.i + 1]], commit();
        }),
        ibtn("in", "Into the group above", () => {
          for (let j = loc.i - 1; j >= 0; j--) if (loc.list[j].kind === "group" && loc.list[j] !== pt) {
            loc.list.splice(loc.i, 1);
            loc.list[j].kids.push(pt);
            commit();
            return;
          }
        }),
        ibtn("out", "Out of the group", () => {
          if (!loc.parent) return;
          const up = locate(def.parts, loc.parent.id);
          loc.list.splice(loc.i, 1);
          up.list.splice(up.i + 1, 0, pt);
          commit();
        }),
        ibtn("copy", "Duplicate", () => {
          const c = GM.clone(pt);
          GM.walkParts([c], (q) => (q.id = GM.uid("p")));
          c.name = (pt.name || pt.kind) + "_copy";
          loc.list.splice(loc.i + 1, 0, c);
          st.sel = c.id;
          commit();
        }),
        ibtn("trash", "Delete", () => {
          loc.list.splice(loc.i, 1);
          st.sel = loc.list[Math.min(loc.i, loc.list.length - 1)] ? loc.list[Math.min(loc.i, loc.list.length - 1)].id : loc.parent ? loc.parent.id : null;
          commit();
        }, "gme-danger")));
      partForm(pt);
    }

    function partForm(pt) {
      const f = pt.f;
      const form = h("div", { class: "gme-form" });
      panel.append(form);
      form.append(textField("Name", pt, "name", () => (pt.name = GM.ident(pt.name, "part"))));
      if (pt.kind === "widget") return widgetForm(pt, form);
      form.append(exprField("Show when (empty = always)", pt, "show", "b", { empty: true }));
      const grid = h("div", { class: "gme-grid" });
      form.append(grid);
      for (const key of Object.keys(f)) {
        if (key === "img" || key === "file") continue;
        if (key === "clip" || key === "sideways") {
          grid.append(h("div", { class: "fld" }, h("span", null, key === "clip" ? "Clip" : "Sideways"), boolChip(f[key] ? "on" : "off", f, key, false)));
          continue;
        }
        if (key === "text") {
          grid.append(textField("Text, or {param}", f, key));
          continue;
        }
        if (key === "points") {
          form.append(exprField("Points x,y x,y ...", f, key, "pts"));
          continue;
        }
        grid.append(exprField(key, f, key, GM.COLOR_FIELDS.has(key) ? "c" : "n"));
      }
      if ("hit" in pt) form.append(h("div", { class: "gme-tools" }, boolChip(pt.hit ? "Hit area: yes" : "Hit area: no", pt, "hit", true), h("span", { class: "muted" }, def.hit === "parts" ? "" : "only counts when the hit mode is parts")));
      if (pt.kind === "bitmap") {
        const fi = h("input", { type: "file", accept: "image/*", class: "gme-hide" });
        fi.addEventListener("change", () => {
          const file = fi.files && fi.files[0];
          if (!file) return;
          const r = new FileReader();
          r.onload = () => {
            f.img = String(r.result);
            f.file = file.name;
            commit();
          };
          r.readAsDataURL(file);
        });
        form.append(h("div", { class: "gme-tools" }, h("button", { class: "btn", onclick: () => fi.click() }, f.img ? "Change image" : "Load image"), fi, h("span", { class: "muted" }, f.img ? f.file : "no image, it draws a grey box")));
        form.append(textField("File name the code loads", f, "file"));
      }
      if (pt.kind === "group") dragForm(pt, form);
    }

    function dragForm(pt, form) {
      const d = pt.drag;
      form.append(h("div", { class: "sec" }, "Dragging"));
      form.append(h("div", { class: "gme-tools" }, boolChip(d.on ? "Draggable: yes" : "Draggable: no", d, "on")));
      if (!d.on) return;
      const axis = h("div", { class: "gme-tools" });
      for (const [v, t] of [["free", "Free"], ["x", "X only"], ["y", "Y only"]])
        axis.append(h("button", { class: "chip" + (d.axis === v ? " on" : ""), onclick: () => {
          d.axis = v;
          commit();
        } }, t));
      form.append(h("div", { class: "fld" }, h("span", null, "Axis"), axis));
      const g2 = h("div", { class: "gme-grid" });
      form.append(g2);
      g2.append(numField("Snap to (px, 0 = off)", d, "snap", false));
      g2.append(selField("Keep inside", d, "bounds", [["element", "the element"], ["rect", "a rect"], ["none", "nothing"]]));
      if (d.bounds === "rect") for (const k of ["x", "y", "w", "h"]) g2.append(numField("Rect " + k, d.rect, k, false));
      const handles = [["", "the whole group"]];
      GM.walkParts(pt.kids || [], (q) => handles.push([q.id, q.name || q.kind]));
      g2.append(selField("Drag handle", d, "handle", handles, false));
      form.append(h("p", { class: "muted" }, "the offset lives in " + GM.partVar(pt) + "_dx and " + GM.partVar(pt) + "_dy, use them in other parts"));
    }

    function widgetForm(pt, form) {
      const sel = h("select", { class: "in" });
      for (const t of WIDGET_TYPES) sel.append(h("option", { value: t, selected: pt.w && pt.w.type === t }, GM.TYPES[t].name));
      sel.addEventListener("change", () => {
        pt.w = GM.newNode(sel.value, null);
        commit();
      });
      form.append(h("label", { class: "fld" }, h("span", null, "Widget"), sel));
      form.append(h("p", { class: "muted" }, "widget parts only run when the element sits in a window or the app, not on the open canvas"));
      const box = h("div");
      form.append(box);
      if (!pt.w) return;
      if (hooks.widgetProps) hooks.widgetProps(pt.w, box);
      else {
        if ("label" in pt.w.p) box.append(textField("Label", pt.w.p, "label"));
        if ("var" in pt.w.p) box.append(textField("Variable", pt.w.p, "var", () => (pt.w.p.var = GM.ident(pt.w.p.var))));
      }
    }

    function elementPanel() {
      const g = h("div", { class: "gme-grid" });
      panel.append(g);
      g.append(numField("Width", def, "w", "rt"), numField("Height", def, "h", "rt"));
      const r = def.resizable;
      panel.append(h("div", { class: "gme-tools" }, boolChip(r.on ? "Resizable: yes" : "Resizable: no", r, "on")));
      if (r.on) {
        const g2 = h("div", { class: "gme-grid" });
        g2.append(numField("Min width", r, "minW", false), numField("Min height", r, "minH", false), numField("Max width", r, "maxW", false), numField("Max height", r, "maxH", false));
        panel.append(g2, h("p", { class: "muted" }, "drag the bottom right corner to resize"));
      }
      panel.append(selField("Hit areas", def, "hit", [["box", "the whole element"], ["parts", "parts marked as hit + hit parts"]]));
      panel.append(h("p", { class: "muted" }, "goome only gives you clicks inside hit rects, everything else goes to whatever is under the overlay"));
      panel.append(h("div", { class: "sec" }, "Value"));
      const v = def.value;
      panel.append(selField("Value comes from", v, "src", [["none", "nothing"], ["state", "a state var"], ["drag", "a drag group"]]));
      const nums = [["", "none"]].concat(def.state.filter((s) => s.type === "num").map((s) => [s.name, s.name]));
      if (v.src === "state") panel.append(selField("State var", v, "state", nums));
      if (v.src === "drag") {
        const groups = [["", "pick a group"]].concat(GM.dragGroups(def).map((q) => [q.id, q.name]));
        const g3 = h("div", { class: "gme-grid" });
        g3.append(selField("Group", v, "part", groups), selField("Axis", v, "axis", [["x", "x"], ["y", "y"]]), numField("Min", v, "min"), numField("Max", v, "max"), selField("Also write to", v, "state", nums));
        panel.append(g3);
        if (!GM.dragGroups(def).length) panel.append(h("p", { class: "err" }, "no draggable group yet, make a group and turn on dragging"));
      }
    }

    function listRows(title, list, mk, blank) {
      panel.append(h("div", { class: "sec" }, title));
      list.forEach((item, i) => {
        const row = h("div", { class: "gme-row" });
        mk(item, row);
        row.append(ibtn("trash", "Remove", () => {
          list.splice(i, 1);
          commit();
        }, "gme-danger"));
        panel.append(row);
      });
      panel.append(h("button", { class: "btn", onclick: () => {
        list.push(blank());
        commit();
      } }, ico("plus"), " Add"));
    }

    function defInput(item, types) {
      if (item.type === "bool") return boolChip(item.def ? "yes" : "no", item, "def");
      const inp = h("input", { class: "in", value: item.type === "color" ? GM.hex8(parseColor(item.def)) : String(item.def == null ? "" : item.def), "aria-label": "Default" });
      inp.addEventListener("input", () => {
        item.def = item.type === "color" ? parseColor(inp.value) : item.type === "text" ? inp.value : parseFloat(inp.value) || 0;
        reset();
        stage.redraw();
        showReadout();
      });
      inp.addEventListener("change", () => commit(false));
      return inp;
    }

    function nameInput(item, all) {
      const inp = h("input", { class: "in", value: item.name, "aria-label": "Name" });
      inp.addEventListener("change", () => {
        let n = GM.ident(inp.value);
        const used = new Set(all.filter((x) => x !== item).map((x) => x.name));
        if (used.has(n)) n += "_2";
        item.name = n;
        commit();
      });
      return inp;
    }

    function dataPanel() {
      const all = () => def.params.concat(def.state);
      const fresh = (base) => {
        const used = new Set(all().map((x) => x.name));
        for (let i = 1; ; i++) if (!used.has(base + i)) return base + i;
      };
      listRows("Params (show up as properties)", def.params, (p, row) => {
        const t = h("select", { class: "in", "aria-label": "Type" });
        for (const k of ["num", "color", "bool", "text"]) t.append(h("option", { value: k, selected: p.type === k }, k));
        t.addEventListener("change", () => {
          p.type = t.value;
          p.def = p.type === "color" ? 0xFF6FDC5F : p.type === "bool" ? false : p.type === "text" ? "hi" : 0;
          commit();
        });
        row.append(nameInput(p, all()), t, defInput(p));
      }, () => ({ name: fresh("param"), type: "num", def: 0 }));
      listRows("State vars", def.state, (s, row) => {
        const t = h("select", { class: "in", "aria-label": "Type" });
        for (const k of ["num", "bool"]) t.append(h("option", { value: k, selected: s.type === k }, k));
        t.addEventListener("change", () => {
          s.type = t.value;
          s.def = s.type === "bool" ? false : 0;
          commit();
        });
        row.append(nameInput(s, all()), t, defInput(s));
      }, () => ({ name: fresh("state"), type: "bool", def: false }));
      panel.append(h("p", { class: "muted" }, "always there: w, h, hovered, pressed, dragging, value, th.accent and every other theme field"));
    }

    function eventsPanel() {
      const states = def.state.map((s) => [s.name, s.name]);
      panel.append(h("div", { class: "sec" }, "When something happens"));
      def.events.forEach((e, i) => {
        const card = h("div", { class: "gme-event" });
        const top = h("div", { class: "gme-row" });
        const on = h("select", { class: "in", "aria-label": "When" });
        for (const k of ["click", "press", "release", "enter", "leave", "drag"]) on.append(h("option", { value: k, selected: e.on === k }, k === "enter" ? "hover starts" : k === "leave" ? "hover ends" : k === "drag" ? "while dragging" : k));
        on.addEventListener("change", () => {
          e.on = on.value;
          commit(false);
        });
        const a = h("select", { class: "in", "aria-label": "Do" });
        for (const [k, t] of [["toggle", "toggle"], ["set", "set"], ["add", "add to"], ["print", "print"]]) a.append(h("option", { value: k, selected: e.act === k }, t));
        a.addEventListener("change", () => {
          e.act = a.value;
          commit();
        });
        top.append(on, a);
        if (e.act !== "print") {
          const t = h("select", { class: "in", "aria-label": "State" });
          t.append(h("option", { value: "" }, "pick a state"));
          for (const [v, l] of states) t.append(h("option", { value: v, selected: e.target === v }, l));
          t.addEventListener("change", () => {
            e.target = t.value;
            commit();
          });
          top.append(t);
        }
        top.append(ibtn("trash", "Remove", () => {
          def.events.splice(i, 1);
          commit();
        }, "gme-danger"));
        card.append(top);
        const ts = def.state.find((s) => s.name === e.target);
        if (e.act === "set" || e.act === "add") card.append(exprField(e.act === "set" ? "To" : "Amount", e, "expr", ts && ts.type === "bool" && e.act === "set" ? "b" : "n"));
        if (e.act === "print") card.append(textField("Text", e, "text"));
        if (e.act !== "print" && !ts) card.append(h("div", { class: "err" }, states.length ? "pick a state var" : "make a state var first (Params + state)"));
        panel.append(card);
      });
      panel.append(h("button", { class: "btn", onclick: () => {
        def.events.push({ on: "click", act: def.state.length ? "toggle" : "print", target: def.state.length ? def.state[0].name : "", expr: "", text: def.name + " clicked" });
        commit();
      } }, ico("plus"), " Add"));
    }

    build();
  }

  const GMEl = {
    initState, mount, library, editor, importFile, draw, thumb, exportObj,
    _rt: { initState, step, hitRects, bounds: (def, rt, gid, theme) => {
      const ctx = ctxFor(def, rt, theme);
      const gi = groupInfo(ctx).find((q) => q.g.id === gid);
      return gi ? bounds(ctx, gi) : null;
    }, placedParts, syncParams, fieldVal: (def, rt, src, want, theme) => fieldVal(ctxFor(def, rt, theme), src, want), parseColor },
  };

  if (typeof module !== "undefined" && module.exports) module.exports = GMEl;
  else root.GMEl = GMEl;
})(typeof window !== "undefined" ? window : globalThis);
