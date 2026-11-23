// The director (layout "anim", anim: "story"): a cartoon factory scene written as data in the video's definition.
//
//   cast:  { id: { role, x, item: "phone" | "clipboard" | "tablet", flip } }      who is on stage and where
//   cam:   [x, y, zoom]                                                          first shot
//   beats: [{ p: part, at: seconds after that sentence starts, ...one action }]
//     { cam: [x, y, zoom], dur }                 camera moves to a shot
//     { walk: id, to: x, dur }                   walks there (faces the way it goes)
//     { say: id, lines: [...], for, color }      speech bubble (and a talking mouth); until the next say or for seconds
//     { pose: id, raise | wave | work: 0..1 }    holds until the next pose of that person
//     { world: { beacon, lock, running } }       the factory's state from then on
//     { card: {...}, on: "tv" | "big" | "phone" | "pop", until }   app screen on the workshop or control room screen,
//                                                 the technician's phone, or a pop-up panel; items appear one by one
//     { icon: kind, x, y, to: [x, y], dur, until, label }   a prop: paper, box, drop, calendar, gear, tag, fish, truck
//     { clear: "tv" | "big" | "phone" | "pop" }  hides that screen
//   Items of a card: { h }, { row: [label, value, color] }, { li, tick, color }, { bar: [label, start, length, color] },
//     { kpi: [name, value, color] }, { btn: [label, color] }, { badge: [text, color] }, { chart: { pts, warn, alarm, max } };
//     an item may carry { p, at } to appear with a later sentence.
"use strict";
(function () {
  const K = window.ANIMKIT, F = window.FACTORY, A = window.ANIMS;
  const { S, C, clamp, ease, lerp, show, move } = K;
  const SPEED = 330;

  // ---------- app card (title bar + items), drawn at width W ----------
  function card(parent, spec, W) {
    const g = S("g", {}, parent), items = [];
    S("rect", { x: 0, y: 0, width: W, height: 10, fill: "none" }, g);
    const head = S("g", {}, g);
    S("rect", { x: 0, y: 0, width: W, height: 70, rx: 18, fill: C.navy }, head); S("rect", { x: 0, y: 40, width: W, height: 30, fill: C.navy }, head);
    S("text", { x: 26, y: 46, "font-size": 30, "font-weight": 900, fill: "#fff" }, head, spec.title || "PlantPulse");
    if (spec.tag) { const tw = spec.tag.length * 13 + 30; S("rect", { x: W - tw - 18, y: 17, width: tw, height: 36, rx: 18, fill: C.teal }, head); S("text", { x: W - tw / 2 - 18, y: 42, "text-anchor": "middle", "font-size": 19, "font-weight": 900, fill: "#052A27" }, head, spec.tag); }
    let y = 84;
    const body = S("rect", { x: 0, y: 70, width: W, height: 10, fill: "#F4F6F9" }, g);
    body.parentNode.insertBefore(body, head);
    for (const it of spec.items || []) {
      const e = S("g", { transform: `translate(16 ${y})`, opacity: 0 }, g), w = W - 32;
      let h = 58;
      if (it.h) { S("text", { x: 4, y: 30, "font-size": 22, "font-weight": 900, fill: "#334155" }, e, it.h.toUpperCase()); h = 42; }
      else if (it.row) { const [l, v, col] = it.row; S("rect", { x: 0, y: 0, width: w, height: 50, rx: 12, fill: "#fff", stroke: "#E2E8F0" }, e); S("text", { x: 16, y: 33, "font-size": 22, "font-weight": 600, fill: "#475569" }, e, l); if (v) { const vw = String(v).length * 12 + 30; S("rect", { x: w - vw - 10, y: 9, width: vw, height: 32, rx: 16, fill: col || "#334155", opacity: 0.16 }, e); S("text", { x: w - 10 - vw / 2, y: 32, "text-anchor": "middle", "font-size": 20, "font-weight": 800, fill: col || "#334155" }, e, v); } }
      else if (it.li) { S("rect", { x: 0, y: 0, width: w, height: 50, rx: 12, fill: "#fff", stroke: "#E2E8F0" }, e); const c = it.color || (it.tick === false ? "#CBD5E1" : C.green); S("circle", { cx: 26, cy: 25, r: 13, fill: c }, e); if (it.tick !== false) S("path", { d: "M20,25 L24,30 L33,20", fill: "none", stroke: "#fff", "stroke-width": 3.5, "stroke-linecap": "round" }, e); S("text", { x: 50, y: 33, "font-size": 22, "font-weight": 700, fill: "#0F172A" }, e, it.li); }
      else if (it.bar) { const [l, st, ln, col] = it.bar; S("text", { x: 4, y: 32, "font-size": 20, "font-weight": 700, fill: "#334155" }, e, l); const x0 = w * 0.36, bw = w * 0.62; S("rect", { x: x0, y: 10, width: bw, height: 30, rx: 8, fill: "#E2E8F0" }, e); e._bar = S("rect", { x: x0 + bw * st, y: 10, width: Math.max(4, bw * ln), height: 30, rx: 8, fill: col || C.teal }, e); }
      else if (it.kpi) { const [n, v, col] = it.kpi; S("rect", { x: 0, y: 0, width: w, height: 70, rx: 14, fill: "#fff", stroke: "#E2E8F0" }, e); S("rect", { x: 0, y: 0, width: 8, height: 70, rx: 4, fill: col || C.teal }, e); S("text", { x: 22, y: 44, "font-size": 22, "font-weight": 700, fill: "#475569" }, e, n); S("text", { x: w - 18, y: 48, "text-anchor": "end", "font-size": 34, "font-weight": 900, fill: col || C.teal }, e, v); h = 78; }
      else if (it.btn) { const [l, col] = it.btn; S("rect", { x: 0, y: 0, width: w, height: 54, rx: 14, fill: col || C.navy }, e); S("text", { x: w / 2, y: 36, "text-anchor": "middle", "font-size": 23, "font-weight": 900, fill: "#fff" }, e, l); h = 62; }
      else if (it.badge) { const [l, col] = it.badge; S("rect", { x: 0, y: 0, width: w, height: 50, rx: 25, fill: col || C.green }, e); S("text", { x: w / 2, y: 33, "text-anchor": "middle", "font-size": 22, "font-weight": 900, fill: "#fff" }, e, l); }
      else if (it.chart) {
        const ch = it.chart, H = ch.h || 200, mn = ch.min || 0, max = ch.max || Math.max(...ch.pts, ch.alarm || 0) * 1.15, Y = (v) => H - ((v - mn) / (max - mn)) * (H - 20);
        S("rect", { x: 0, y: 0, width: w, height: H + 10, rx: 12, fill: "#fff", stroke: "#E2E8F0" }, e);
        if (ch.cl != null && ch.sig) {  // Nelson zones: within 1σ green, 1–2σ amber, 2–3σ red, centre line solid
          [[3, "#FEE2E2"], [2, "#FEF3C7"], [1, "#DCFCE7"]].forEach(([k, f]) => S("rect", { x: 10, y: Y(ch.cl + k * ch.sig), width: w - 20, height: Y(ch.cl - k * ch.sig) - Y(ch.cl + k * ch.sig), fill: f }, e));
          for (const k of [3, -3]) S("line", { x1: 10, y1: Y(ch.cl + k * ch.sig), x2: w - 10, y2: Y(ch.cl + k * ch.sig), stroke: C.red, "stroke-width": 2, "stroke-dasharray": "8 5" }, e);
        }
        if (ch.cl != null) S("line", { x1: 10, y1: Y(ch.cl), x2: w - 10, y2: Y(ch.cl), stroke: "#475569", "stroke-width": 2.5 }, e);
        if (ch.alarm) S("line", { x1: 10, y1: Y(ch.alarm), x2: w - 10, y2: Y(ch.alarm), stroke: C.red, "stroke-width": 3, "stroke-dasharray": "10 6" }, e);
        if (ch.warn) S("line", { x1: 10, y1: Y(ch.warn), x2: w - 10, y2: Y(ch.warn), stroke: C.amber, "stroke-width": 3, "stroke-dasharray": "10 6" }, e);
        const pts = ch.pts.map((v, i) => `${20 + (i * (w - 40)) / (ch.pts.length - 1)},${Y(v)}`);
        e._line = S("polyline", { points: pts.join(" "), fill: "none", stroke: C.teal, "stroke-width": 4 }, e);
        ch.pts.forEach((v, i) => {
          const cx = 20 + (i * (w - 40)) / (ch.pts.length - 1), hit = ch.hit && ch.hit.includes(i);
          if (hit) S("circle", { cx, cy: Y(v), r: 12, fill: "none", stroke: C.red, "stroke-width": 3 }, e);
          S("circle", { cx, cy: Y(v), r: 6, fill: hit ? C.red : ch.hit ? C.teal : ch.alarm && v >= ch.alarm ? C.red : ch.warn && v >= ch.warn ? C.amber : C.teal }, e);
        });
        h = H + 20;
      }
      items.push({ e, it }); y += h + 8;
    }
    body.setAttribute("height", y - 70 + 10);
    return { g, items, h: y + 10 };
  }

  // ---------- props ----------
  function icon(parent, kind, label) {
    const g = S("g", { opacity: 0 }, parent);
    if (kind === "paper") { S("rect", { x: -40, y: -52, width: 80, height: 100, rx: 6, fill: "#fff", stroke: "#94A3B8", "stroke-width": 3 }, g); for (let i = 0; i < 4; i++) S("rect", { x: -26, y: -30 + i * 16, width: 52, height: 6, fill: i ? "#CBD5E1" : "#334155" }, g); }
    else if (kind === "box") { S("rect", { x: -40, y: -36, width: 80, height: 66, rx: 6, fill: "#B45309" }, g); S("rect", { x: -40, y: -36, width: 80, height: 16, fill: "#92400E" }, g); S("rect", { x: -6, y: -36, width: 12, height: 66, fill: "#FDE68A" }, g); }
    else if (kind === "drop") { S("path", { d: "M0,-46 Q34,-4 30,14 Q26,44 0,44 Q-26,44 -30,14 Q-34,-4 0,-46 Z", fill: "#EAB308", stroke: "#A16207", "stroke-width": 4 }, g); }
    else if (kind === "calendar") { S("rect", { x: -42, y: -40, width: 84, height: 80, rx: 10, fill: "#fff", stroke: "#334155", "stroke-width": 4 }, g); S("rect", { x: -42, y: -40, width: 84, height: 22, rx: 8, fill: C.red }, g); for (let i = 0; i < 9; i++) S("rect", { x: -30 + (i % 3) * 22, y: -10 + Math.floor(i / 3) * 16, width: 14, height: 10, fill: i === 4 ? C.teal : "#CBD5E1" }, g); }
    else if (kind === "gear") { S("circle", { cx: 0, cy: 0, r: 34, fill: "#64748B", stroke: "#334155", "stroke-width": 14, "stroke-dasharray": "12 8" }, g); S("circle", { cx: 0, cy: 0, r: 12, fill: "#1E293B" }, g); }
    else if (kind === "tag") { S("path", { d: "M-44,-24 L24,-24 L44,0 L24,24 L-44,24 Z", fill: C.teal }, g); S("circle", { cx: 22, cy: 0, r: 6, fill: "#fff" }, g); }
    else if (kind === "fish") { S("line", { x1: -60, y1: 0, x2: 50, y2: 0, stroke: "#E2E8F0", "stroke-width": 6 }, g); for (const dx of [-40, -10, 20]) { S("line", { x1: dx, y1: -30, x2: dx + 18, y2: 0, stroke: "#E2E8F0", "stroke-width": 5 }, g); S("line", { x1: dx, y1: 30, x2: dx + 18, y2: 0, stroke: "#E2E8F0", "stroke-width": 5 }, g); } S("path", { d: "M50,-22 L80,0 L50,22 Z", fill: C.amber }, g); }
    else if (kind === "truck") { S("rect", { x: -70, y: -40, width: 90, height: 56, rx: 6, fill: "#2563EB" }, g); S("rect", { x: 20, y: -26, width: 42, height: 42, rx: 6, fill: "#1D4ED8" }, g); for (const dx of [-44, 40]) S("circle", { cx: dx, cy: 20, r: 14, fill: "#111827" }, g); }
    else if (kind === "check") { S("circle", { cx: 0, cy: 0, r: 40, fill: C.green }, g); S("path", { d: "M-18,0 L-5,14 L20,-14", fill: "none", stroke: "#fff", "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }, g); }
    else if (kind === "warn") { S("path", { d: "M0,-44 L44,36 L-44,36 Z", fill: C.amber, stroke: "#92400E", "stroke-width": 4, "stroke-linejoin": "round" }, g); S("rect", { x: -5, y: -14, width: 10, height: 30, rx: 4, fill: "#1F2937" }, g); S("circle", { cx: 0, cy: 26, r: 5, fill: "#1F2937" }, g); }
    if (label) { const w = label.length * 14 + 30; S("rect", { x: -w / 2, y: 54, width: w, height: 36, rx: 18, fill: "rgba(9,22,40,.9)" }, g); S("text", { x: 0, y: 79, "text-anchor": "middle", "font-size": 20, "font-weight": 800, fill: "#fff" }, g, label); }
    return g;
  }

  // ---------- surfaces for cards ----------
  function surface(s, svg, w, on) {
    if (on === "tv" || on === "big") {
      const box = on === "tv" ? w.tv : w.big;
      const n = S("svg", { x: box.x, y: box.y, width: box.w, height: box.h, viewBox: "0 0 1000 562", preserveAspectRatio: "xMidYMid meet" });
      w.g.insertBefore(n, w.people);
      S("rect", { x: 0, y: 0, width: 1000, height: 562, fill: "#0B1C33" }, n);
      return { root: n, holder: S("g", {}, n), W: on === "tv" ? 640 : 900, fit: { w: 1000, h: 562 } };
    }
    if (on === "phone") {
      const ph = K.bigPhone(svg, 1660, 520, 390, 780);
      const W = 430, sc = (ph.w - 44) / W;
      const holder = S("g", { transform: `translate(${-ph.w / 2 + 22} ${-ph.h / 2 + 106}) scale(${sc})` }, ph.scr);
      return { root: ph.g, holder, W, phone: ph };
    }
    const g = S("g", {}, svg); // pop-up panel
    return { root: g, holder: S("g", {}, g), W: 760, pop: true };
  }

  A.story = {
    build(svg, s) {
      const w = (s._.w = F.world(svg));
      s._.cast = {};
      for (const [id, c] of Object.entries(s.cast || {})) s._.cast[id] = { t: F.toon(w.people, c.role, { [c.item || "none"]: true }), c };
      s._.beats = (s.beats || []).map((b, i) => ({ ...b, i }));
      s._.surf = {};
      for (const b of s._.beats) {
        if (b.say) b._b = F.bubble(w.front, b.lines, { fs: b.fs || 30, color: b.color });
        if (b.icon) b._i = icon(b.front === false ? w.people : w.front, b.icon, b.label);
        if (b.card) {
          const on = b.on || "pop", sf = (s._.surf[on] = s._.surf[on] || surface(s, svg, w, on));
          const cg = S("g", { opacity: 0 }, sf.holder);
          b._c = card(cg, b.card, sf.W); b._cg = cg; b._sf = sf;
          if (sf.fit) { const sc = Math.min((sf.fit.w - 40) / sf.W, (sf.fit.h - 30) / b._c.h); cg.setAttribute("transform", `translate(${(sf.fit.w - sf.W * sc) / 2} 15) scale(${sc})`); }
          if (sf.pop) { const sc = Math.min(1, 760 / b._c.h); cg.setAttribute("transform", `translate(${1840 - sf.W * sc} ${(1000 - b._c.h * sc) / 2 + 20}) scale(${sc})`); }
        }
      }
    },
    render(s, t) {
      const w = s._.w, P = s.partAt || [], at = (b) => (P[b.p || 0] ?? s.t0) + (b.at || 0);
      const B = s._.beats.map((b) => ({ ...b, T: at(b) })).sort((a, b) => a.T - b.T || a.i - b.i);
      const end = s.t1;
      const nextT = (pred, from) => { const n = B.find((x) => x.T > from && pred(x)); return n ? n.T : end + 1; };
      // world state
      const st = {};
      for (const b of B) if (b.world && b.T <= t) Object.assign(st, b.world);
      if (st.lock !== undefined) st.lock = st.lock ? 1 : 0;
      F.animateWorld(w, t, st);
      // camera
      const shots = [[s.t0 - 1, ...(s.cam || F.OVER)]];
      for (const b of B) if (b.cam) shots.push([b.T, ...b.cam, b.dur || 1.4]);
      F.shots(w, shots, t);
      // people
      for (const [id, { t: toon, c }] of Object.entries(s._.cast)) {
        let x = c.x, flip = !!c.flip, walking = false;
        const pose = { raise: 0, wave: 0, work: 0 };
        let talk = false, vis = c.hidden ? 0 : 1;
        for (const b of B) {
          if (b.T > t) break;
          if (b.walk === id) {
            const from = x, d = b.dur || Math.abs(b.to - from) / SPEED, p = clamp((t - b.T) / d, 0, 1);
            x = lerp(from, b.to, ease(p)); if (p < 1) walking = true; if (b.to !== from) flip = b.to < from;
          }
          if (b.pose === id) for (const k of ["raise", "wave", "work"]) pose[k] = b[k] || 0;
          if (b.show === id) vis = 1;
          if (b.hide === id) vis = 0;
          if (b.say === id) { const until = b.for ? b.T + b.for : nextT((x2) => x2.say === id || x2.p === (b.p || 0) + 1, b.T) - 0.1; if (t < until) talk = true; }
          if (b.face === id) flip = !!b.left;
        }
        toon.set({ x, y: c.y || 885, t, walk: walking ? 1 : 0, flip, talk, a: vis, ...pose });
        c._x = x;
      }
      // bubbles, props, cards
      for (const b of B) {
        if (b.say) {
          const until = b.for ? b.T + b.for : nextT((x2) => x2.say === b.say || x2.p === (b.p || 0) + 1, b.T) - 0.1;
          const who = s._.cast[b.say], a = ease((t - b.T) / 0.35) * (1 - ease((t - until) / 0.3));
          b._b.set((who ? who.c._x : 0) + (b.dx || 0), (b.y || 560), t >= b.T ? a : 0);
        }
        if (b.icon) {
          const until = b.until !== undefined ? (P[b.until] ?? end + 1) : end + 1;
          const p = b.to ? ease(clamp((t - b.T) / (b.dur || 1.2), 0, 1)) : 0;
          const x = b.to ? lerp(b.x, b.to[0], p) : b.x, y = b.to ? lerp(b.y, b.to[1], p) : b.y;
          const a = ease((t - b.T) / 0.35) * (1 - ease((t - until) / 0.3));
          show(b._i, t >= b.T ? a : 0); b._i.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(b.scale || 1) * (0.7 + 0.3 * Math.min(1, a))})`);
        }
        if (b.card) {
          const on = b.on || "pop";
          const dflt = on === "phone" || on === "pop" ? (P[(b.p || 0) + 1] ?? end + 1) - 0.2 : end + 1;
          const until = Math.min(b.until !== undefined ? (P[b.until] ?? end + 1) - 0.2 : dflt, nextT((x2) => (x2.card && (x2.on || "pop") === on) || x2.clear === on, b.T) - 0.05);
          const vis = t >= b.T && t < until + 0.3;
          const a = vis ? ease((t - b.T) / 0.4) * (1 - ease((t - until) / 0.3)) : 0;
          show(b._cg, a);
          b._c.items.forEach(({ e, it }, k) => {
            const it0 = it.p !== undefined ? (P[it.p] ?? b.T) + (it.at || 0) : b.T + 0.35 + k * (b.stagger ?? 0.3);
            const ia = ease((t - it0) / 0.35);
            show(e, ia);
            if (e._bar) e._bar.setAttribute("transform", `scale(${Math.max(0.001, ia)} 1)`), e._bar.setAttribute("transform-origin", `${e._bar.getAttribute("x")} 0`);
          });
        }
      }
      // whole surfaces: the phone and the pop-up appear when one of their cards is shown
      for (const [on, sf] of Object.entries(s._.surf)) {
        if (on === "tv" || on === "big") continue;
        let a = 0;
        for (const b of B) if (b.card && b._sf === sf) a = Math.max(a, +b._cg.getAttribute("opacity"));
        if (sf.phone) { move(sf.phone.g, sf.phone.x, sf.phone.y + (1 - a) * 60, 0.75 + 0.25 * a); show(sf.phone.g, a); }
        else show(sf.root, a);
      }
    },
  };
})();
