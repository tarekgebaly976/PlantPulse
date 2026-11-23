// Cartoon factory scenes (layout "anim", names f_*): one wide factory – production hall with a paper machine and the
// drive motor, the maintenance workshop, the control room – with cartoon people who walk, blink, talk and wave, a
// camera that travels and zooms, and the app's charts on the factory's own screens (the scenes of lib/anim.js drawn
// inside a screen). Everything moves all the time: rolls, paper web, steam, lamps, a forklift.
"use strict";
(function () {
  const K = window.ANIMKIT, A = window.ANIMS;
  const { S, C, clamp, ease, lerp, show, move, T } = K;
  const WALL = "#17314F", WALL2 = "#1B3A5E", FLOOR = "#1D2C42";

  // ---------- cartoon person: big head, blinking eyes, talking mouth, waving, walking, working ----------
  const LOOK = {
    technician: { hat: "#F59E0B", body: "#0E7490", trim: "#FCD34D", label: "Technician" },
    supervisor: { hat: "#F8FAFC", body: "#475569", trim: "#FDE047", label: "Supervisor" },
    engineer: { hat: "#3B82F6", body: "#1E40AF", trim: "#BFDBFE", label: "Engineer" },
    manager: { hat: null, body: "#1F2937", trim: "#14B8A6", label: "Manager" },
    operator: { hat: "#22C55E", body: "#4B5563", trim: "#86EFAC", label: "Operator" },
    planner: { hat: null, body: "#7C3AED", trim: "#DDD6FE", label: "Planner" },
    storekeeper: { hat: "#A855F7", body: "#92400E", trim: "#FDE68A", label: "Storekeeper" },
  };
  let BLINK = 0;
  function toon(parent, role, opts = {}) {
    const L = LOOK[role], g = S("g", {}, parent), phase = (BLINK += 1.37);
    S("ellipse", { cx: 0, cy: 2, rx: 46, ry: 10, fill: "rgba(0,0,0,.35)" }, g);
    const body = S("g", {}, g);
    const leg = (dx) => { const lg = S("g", {}, body); S("rect", { x: dx - 10, y: 0, width: 20, height: 58, rx: 9, fill: "#243044" }, lg); S("ellipse", { cx: dx + 4, cy: 58, rx: 17, ry: 9, fill: "#111827" }, lg); return lg; };
    const legL = leg(-14), legR = leg(14);
    S("path", { d: "M-38,-58 Q-44,-132 0,-134 Q44,-132 38,-58 Q0,-48 -38,-58 Z", fill: L.body }, body);
    if (role === "technician") { S("rect", { x: -36, y: -86, width: 72, height: 8, rx: 4, fill: L.trim }, body); S("rect", { x: -4, y: -132, width: 8, height: 76, fill: "rgba(0,0,0,.18)" }, body); }
    if (role === "supervisor") { S("rect", { x: -40, y: -112, width: 80, height: 9, fill: L.trim }, body); S("rect", { x: -40, y: -90, width: 80, height: 9, fill: L.trim }, body); }
    if (role === "engineer") { S("rect", { x: 10, y: -118, width: 18, height: 22, rx: 3, fill: L.trim }, body); S("rect", { x: 14, y: -124, width: 4, height: 12, fill: "#64748B" }, body); }
    if (role === "manager") { S("path", { d: "M-11,-133 L0,-92 L11,-133 Z", fill: "#F8FAFC" }, body); S("path", { d: "M-5,-130 L0,-98 L5,-130 Z", fill: L.trim }, body); }
    const arm = (side) => {
      const a = S("g", {}, body);
      S("rect", { x: -9, y: -4, width: 18, height: 58, rx: 9, fill: L.body }, a);
      S("circle", { cx: 0, cy: 58, r: 11, fill: C.skin }, a);
      const held = S("g", { transform: "translate(0 64)" }, a);
      return { a, held, side };
    };
    const armL = arm(-1), armR = arm(1);
    if (opts.phone) { S("rect", { x: -12, y: -6, width: 24, height: 40, rx: 5, fill: "#0B1220", stroke: "#64748B", "stroke-width": 2 }, armR.held); S("rect", { x: -8, y: -1, width: 16, height: 28, rx: 2, fill: C.teal2 }, armR.held); }
    if (opts.clipboard) { S("rect", { x: -18, y: -8, width: 36, height: 46, rx: 4, fill: "#E2E8F0", stroke: "#94A3B8" }, armR.held); for (let i = 0; i < 3; i++) S("rect", { x: -11, y: 4 + i * 10, width: 22, height: 4, fill: "#94A3B8" }, armR.held); }
    if (opts.tablet) { S("rect", { x: -24, y: -6, width: 48, height: 34, rx: 5, fill: "#0B1220", stroke: "#64748B", "stroke-width": 2 }, armR.held); S("polyline", { points: "-16,20 -6,10 4,15 16,0", fill: "none", stroke: C.teal2, "stroke-width": 3 }, armR.held); }
    const wrench = S("g", { opacity: 0 }, armR.held);
    S("rect", { x: -4, y: -6, width: 8, height: 44, rx: 3, fill: "#CBD5E1" }, wrench); S("path", { d: "M-12,38 L-4,30 L4,30 L12,38 L6,50 L-6,50 Z", fill: "#CBD5E1" }, wrench);
    const head = S("g", {}, body);
    S("rect", { x: -10, y: -146, width: 20, height: 16, fill: C.skin2 }, head);
    S("circle", { cx: 0, cy: -192, r: 46, fill: C.skin }, head);
    S("circle", { cx: -44, cy: -188, r: 9, fill: C.skin2 }, head); S("circle", { cx: 44, cy: -188, r: 9, fill: C.skin2 }, head);
    const eyes = S("g", {}, head);
    for (const dx of [-16, 16]) { S("ellipse", { cx: dx, cy: -196, rx: 9, ry: 11, fill: "#fff" }, eyes); S("circle", { cx: dx + 2, cy: -194, r: 5.5, fill: "#1F2937" }, eyes); S("circle", { cx: dx + 4, cy: -197, r: 2, fill: "#fff" }, eyes); }
    S("ellipse", { cx: -26, cy: -176, rx: 7, ry: 4, fill: "#F28C8C", opacity: 0.55 }, head); S("ellipse", { cx: 26, cy: -176, rx: 7, ry: 4, fill: "#F28C8C", opacity: 0.55 }, head);
    const mouth = S("ellipse", { cx: 0, cy: -168, rx: 9, ry: 2, fill: "#7C2D12" }, head);
    if (L.hat) { S("path", { d: "M-50,-200 Q-50,-252 0,-254 Q50,-252 50,-200 Z", fill: L.hat }, head); S("rect", { x: -58, y: -206, width: 116, height: 12, rx: 6, fill: L.hat }, head); S("rect", { x: -6, y: -252, width: 12, height: 46, rx: 5, fill: "rgba(255,255,255,.25)" }, head); }
    else { S("path", { d: "M-46,-196 Q-50,-244 0,-244 Q50,-244 46,-196 Q36,-226 0,-224 Q-30,-226 -46,-196 Z", fill: "#3B2A1E" }, head); }
    const tag = S("g", {}, g);
    const w = L.label.length * 15 + 44;
    S("rect", { x: -w / 2, y: 18, width: w, height: 38, rx: 19, fill: "rgba(9,22,40,.92)", stroke: C.teal, "stroke-width": 2 }, tag);
    S("text", { x: 0, y: 44, "text-anchor": "middle", "font-size": 21, "font-weight": 800, fill: C.text }, tag, L.label);
    return {
      g, tag,
      /** t: scene time (blink, talk, idle); walk: walking (legs, bob); raise: right arm up; wave: left arm waves; work: wrench */
      set({ x, y, t = 0, sc = 1, walk = 0, raise = 0, wave = 0, talk = false, work = 0, flip = false, a = 1, noTag = false }) {
        const step = walk ? Math.sin(t * 9) : 0;
        move(g, x, y - Math.abs(step) * 6 * (walk ? 1 : 0) + (walk ? 0 : Math.sin(t * 2 + phase) * 1.5), sc);
        body.setAttribute("transform", flip ? "scale(-1 1)" : "");
        legL.setAttribute("transform", `rotate(${(step * 24).toFixed(1)} 0 0)`); legR.setAttribute("transform", `rotate(${(-step * 24).toFixed(1)} 0 0)`);
        const sw = step * 26;
        const wv = wave ? -150 + Math.sin(t * 10) * 22 : sw;
        armL.a.setAttribute("transform", `translate(-44 -126) rotate(${(wave ? -wv * -1 : sw).toFixed(1)})`);
        if (wave) armL.a.setAttribute("transform", `translate(-44 -126) rotate(${(150 + Math.sin(t * 10) * 22) * wave})`);
        const wk = work ? -70 + Math.sin(t * 12) * 28 : 0;
        armR.a.setAttribute("transform", `translate(44 -126) rotate(${(-sw * (1 - raise) - 115 * raise + wk * work).toFixed(1)})`);
        show(wrench, work);
        const blink = ((t + phase) % 3.6) < 0.13;
        eyes.setAttribute("transform", blink ? "translate(0 -196) scale(1 0.12) translate(0 196)" : "");
        mouth.setAttribute("ry", (talk ? 3 + 6 * Math.abs(Math.sin(t * 13)) : 2.2).toFixed(1));
        show(g, a); show(tag, noTag ? 0 : 1);
      },
    };
  }

  // ---------- speech bubble (text lines, pops in, tail to the speaker) ----------
  function bubble(parent, lines, opts = {}) {
    const g = S("g", { opacity: 0 }, parent), fs = opts.fs || 30, w = opts.w || Math.max(...lines.map((l) => l.length)) * fs * 0.56 + 60, h = lines.length * fs * 1.35 + 34;
    const inner = S("g", {}, g);
    S("rect", { x: -w / 2, y: -h - 22, width: w, height: h, rx: 26, fill: "#fff", stroke: opts.color || C.teal, "stroke-width": 4 }, inner);
    S("path", { d: `M-18,-24 L0,0 L18,-24 Z`, fill: "#fff", stroke: opts.color || C.teal, "stroke-width": 4, "stroke-linejoin": "round" }, inner);
    S("rect", { x: -20, y: -30, width: 40, height: 10, fill: "#fff" }, inner);
    lines.forEach((l, i) => S("text", { x: -w / 2 + 30, y: -h - 22 + 24 + fs + i * fs * 1.35, "font-size": fs, "font-weight": 800, fill: "#0F172A" }, inner, l));
    return {
      g,
      set(x, y, a) { show(g, a); g.setAttribute("transform", `translate(${x} ${y})`); inner.setAttribute("transform", `scale(${(0.6 + 0.4 * ease(a)).toFixed(3)})`); },
    };
  }

  // ---------- the factory ----------
  function world(parent) {
    const svg = parent.ownerSVGElement || parent;
    const defs = S("defs", {}, svg);
    const sky = S("linearGradient", { id: "fsky" + Math.random().toString(36).slice(2), x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    S("stop", { offset: "0", "stop-color": "#7DD3FC" }, sky); S("stop", { offset: "1", "stop-color": "#E0F2FE" }, sky);
    const glow = S("radialGradient", { id: "fglow" + Math.random().toString(36).slice(2) }, defs);
    S("stop", { offset: "0", "stop-color": "#FEF9C3", "stop-opacity": 0.55 }, glow); S("stop", { offset: "1", "stop-color": "#FEF9C3", "stop-opacity": 0 }, glow);
    const g = S("g", {}, parent), w = { g };
    // wall, windows, columns, pipes, signs
    S("rect", { x: -2000, y: -1500, width: 8000, height: 2380, fill: WALL }, g);
    for (let i = 0; i < 6; i++) S("rect", { x: i * 650 + 60, y: 90, width: 540, height: 230, rx: 10, fill: `url(#${sky.id})`, stroke: "#334155", "stroke-width": 10 }, g);
    for (let i = 0; i < 6; i++) for (const dx of [180, 360]) S("rect", { x: i * 650 + 60 + dx, y: 90, width: 8, height: 230, fill: "#334155" }, g);
    w.clouds = S("g", {}, g);
    for (let i = 0; i < 8; i++) { const c = S("g", {}, w.clouds); S("ellipse", { cx: 0, cy: 0, rx: 60, ry: 22, fill: "#fff", opacity: 0.85 }, c); S("ellipse", { cx: 30, cy: -12, rx: 36, ry: 20, fill: "#fff", opacity: 0.85 }, c); c.dataset.x = i * 520; c.dataset.y = 140 + (i % 3) * 50; }
    w.cloudMask = S("g", {}, g);
    for (let i = -1; i <= 6; i++) S("rect", { x: i * 650 + 600, y: 80, width: 110, height: 250, fill: WALL }, g); // wall between windows hides clouds
    S("rect", { x: -2000, y: 0, width: 8000, height: 84, fill: WALL }, g); S("rect", { x: -2000, y: 326, width: 8000, height: 30, fill: WALL }, g);
    for (let i = 0; i <= 6; i++) S("rect", { x: i * 650 - 22, y: 0, width: 44, height: 880, fill: WALL2 }, g);
    S("rect", { x: -2000, y: 40, width: 8000, height: 26, fill: "#0F2238" }, g);
    S("rect", { x: -2000, y: 392, width: 8000, height: 24, rx: 12, fill: "#4B6B8B" }, g);
    S("rect", { x: -2000, y: 430, width: 8000, height: 14, rx: 7, fill: "#B45309" }, g);
    for (let i = 0; i < 14; i++) S("circle", { cx: i * 300 + 120, cy: 404, r: 16, fill: "#64748B", stroke: "#334155", "stroke-width": 4 }, g);
    const sign = (x, txt) => { const s = S("g", { transform: `translate(${x} 470)` }, g); S("rect", { x: -190, y: -32, width: 380, height: 64, rx: 12, fill: C.teal }, s); S("text", { x: 0, y: 13, "text-anchor": "middle", "font-size": 32, "font-weight": 900, fill: "#052A27" }, s, txt); };
    sign(540, "Production hall"); sign(1625, "Maintenance workshop"); sign(3300, "Control room"); sign(-700, "Stores & lubricants");
    for (const i of [-2, -1]) S("rect", { x: i * 650 + 60, y: 90, width: 540, height: 230, rx: 10, fill: `url(#${sky.id})`, stroke: "#334155", "stroke-width": 10 }, g);
    // stores: shelves with spare parts, oil drums, a grease gun
    for (const sx of [-1250, -900]) {
      for (let r = 0; r < 4; r++) S("rect", { x: sx, y: 560 + r * 80, width: 300, height: 10, fill: "#64748B" }, g);
      S("rect", { x: sx, y: 540, width: 10, height: 340, fill: "#475569" }, g); S("rect", { x: sx + 290, y: 540, width: 10, height: 340, fill: "#475569" }, g);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) S("rect", { x: sx + 18 + k * 68, y: 590 + r * 80 - 2, width: 52, height: -0.0001 + 48, rx: 6, fill: ["#B45309", "#2563EB", "#0D9488", "#9333EA"][(r + k) % 4], transform: `translate(0 ${-48})` }, g);
    }
    for (const [dx, col] of [[-520, "#1D4ED8"], [-420, "#B91C1C"], [-320, "#15803D"]]) { S("rect", { x: dx, y: 760, width: 84, height: 120, rx: 10, fill: col }, g); S("rect", { x: dx, y: 790, width: 84, height: 8, fill: "rgba(255,255,255,.3)" }, g); S("rect", { x: dx, y: 840, width: 84, height: 8, fill: "rgba(255,255,255,.3)" }, g); }
    S("rect", { x: -200, y: 800, width: 140, height: 80, rx: 8, fill: "#475569" }, g); S("text", { x: -130, y: 850, "text-anchor": "middle", "font-size": 18, "font-weight": 900, fill: "#F8FAFC" }, g, "COUNTER");
    // lamps
    w.lamps = [];
    for (let i = 0; i < 9; i++) {
      const lg = S("g", {}, g); lg.dataset.x = i * 460 + 150;
      S("line", { x1: 0, y1: -80, x2: 0, y2: 120, stroke: "#94A3B8", "stroke-width": 4 }, lg);
      S("ellipse", { cx: 0, cy: 260, rx: 150, ry: 260, fill: `url(#${glow.id})` }, lg);
      S("path", { d: "M-36,150 L-14,118 L14,118 L36,150 Z", fill: "#CBD5E1" }, lg); S("ellipse", { cx: 0, cy: 150, rx: 36, ry: 7, fill: "#FEF9C3" }, lg);
      w.lamps.push(lg);
    }
    // floor
    S("rect", { x: -2000, y: 880, width: 8000, height: 1400, fill: FLOOR }, g);
    for (let i = -3; i < 30; i++) S("line", { x1: i * 160, y1: 880, x2: i * 160 - 140, y2: 1200, stroke: "rgba(148,178,214,.08)", "stroke-width": 3 }, g);
    S("line", { x1: -2000, y1: 1010, x2: 6000, y2: 1010, stroke: "#FACC15", "stroke-width": 8, "stroke-dasharray": "60 40", opacity: 0.85 }, g);
    // forklift (drives behind the people)
    w.fork = S("g", {}, g);
    S("rect", { x: -70, y: -90, width: 120, height: 66, rx: 12, fill: "#F97316" }, w.fork); S("rect", { x: -40, y: -150, width: 70, height: 62, rx: 8, fill: "none", stroke: "#334155", "stroke-width": 8 }, w.fork);
    S("rect", { x: 50, y: -170, width: 10, height: 150, fill: "#334155" }, w.fork); S("rect", { x: 56, y: -36, width: 70, height: 8, fill: "#334155" }, w.fork);
    S("rect", { x: 66, y: -96, width: 60, height: 58, rx: 4, fill: "#A16207" }, w.fork);
    w.wheels = [-40, 26].map((dx) => { const wh = S("g", { transform: `translate(${dx} -18)` }, w.fork); S("circle", { cx: 0, cy: 0, r: 20, fill: "#111827" }, wh); S("rect", { x: -3, y: -14, width: 6, height: 28, fill: "#64748B" }, wh); return wh; });
    // production hall: the paper machine
    const pm = S("g", {}, g);
    S("rect", { x: 100, y: 600, width: 700, height: 280, rx: 18, fill: "#334155" }, pm);
    S("rect", { x: 100, y: 600, width: 700, height: 26, rx: 10, fill: "#475569" }, pm);
    w.felt = S("path", { d: "M160,700 L740,700 L740,820 L160,820 Z", fill: "none", stroke: "#94A3B8", "stroke-width": 10, "stroke-dasharray": "30 18" }, pm);
    w.web = S("path", { d: "M800,690 Q860,690 880,720 L880,760", fill: "none", stroke: "#F8FAFC", "stroke-width": 14, "stroke-dasharray": "40 14" }, pm);
    w.rolls = [[220, 700, 56], [400, 700, 64], [580, 700, 56], [740, 760, 48], [300, 820, 40], [520, 820, 40]].map(([x, y, r]) => {
      const rg = S("g", { transform: `translate(${x} ${y})` }, pm);
      S("circle", { cx: 0, cy: 0, r, fill: "#64748B", stroke: "#1E293B", "stroke-width": 6 }, rg);
      const sp = S("g", {}, rg); for (let k = 0; k < 3; k++) S("rect", { x: -4, y: -r + 8, width: 8, height: 2 * r - 16, rx: 4, fill: "#CBD5E1", transform: `rotate(${k * 60})` }, sp);
      S("circle", { cx: 0, cy: 0, r: 10, fill: "#1E293B" }, rg);
      return sp;
    });
    w.steam = [0, 1, 2, 3, 4].map((i) => S("circle", { cx: 200 + i * 130, cy: 580, r: 26, fill: "#E2E8F0", opacity: 0 }, pm));
    S("rect", { x: 690, y: 520, width: 14, height: 80, fill: "#475569" }, pm);
    w.beaconGlow = S("circle", { cx: 697, cy: 506, r: 46, fill: C.green, opacity: 0.25 }, pm);
    w.beacon = S("circle", { cx: 697, cy: 506, r: 22, fill: C.green }, pm);
    // the drive motor and pump with the QR label and the sensor (machine() of lib/anim.js)
    w.m = K.machine(g, 1040, 806, 0.8);
    w.iso = S("g", { transform: "translate(1300 640)" }, g);
    S("rect", { x: -38, y: -50, width: 76, height: 100, rx: 10, fill: "#94A3B8", stroke: "#475569", "stroke-width": 4 }, w.iso);
    S("rect", { x: -8, y: -30, width: 16, height: 46, rx: 4, fill: "#DC2626" }, w.iso);
    S("text", { x: 0, y: 40, "text-anchor": "middle", "font-size": 14, "font-weight": 900, fill: "#1E293B" }, w.iso, "ISOLATOR");
    S("line", { x1: 1300, y1: 690, x2: 1300, y2: 880, stroke: "#475569", "stroke-width": 8 }, g);
    w.lock = K.lock(g, 1300, 708, C.red); w.lockTag = S("g", {}, g);
    S("rect", { x: 1276, y: 730, width: 48, height: 56, rx: 6, fill: "#FACC15" }, w.lockTag); S("text", { x: 1300, y: 764, "text-anchor": "middle", "font-size": 13, "font-weight": 900, fill: "#7F1D1D" }, w.lockTag, "LOTO");
    // workshop: tool wall, bench, desk, wall screen
    S("rect", { x: 1460, y: 540, width: 330, height: 230, rx: 10, fill: "#A16207", opacity: 0.85 }, g);
    for (let i = 0; i < 5; i++) { const x = 1500 + i * 62; S("rect", { x, y: 570, width: 12, height: 110, rx: 5, fill: "#CBD5E1" }, g); S("circle", { cx: x + 6, cy: 570, r: 16, fill: "none", stroke: "#CBD5E1", "stroke-width": 8 }, g); }
    S("rect", { x: 1440, y: 800, width: 380, height: 26, rx: 6, fill: "#78350F" }, g); S("rect", { x: 1460, y: 826, width: 18, height: 54, fill: "#451A03" }, g); S("rect", { x: 1780, y: 826, width: 18, height: 54, fill: "#451A03" }, g);
    S("rect", { x: 2040, y: 800, width: 400, height: 22, rx: 6, fill: "#334155" }, g); S("rect", { x: 2060, y: 822, width: 16, height: 58, fill: "#1E293B" }, g); S("rect", { x: 2400, y: 822, width: 16, height: 58, fill: "#1E293B" }, g);
    w.paper = S("g", { opacity: 0 }, g);
    S("rect", { x: -40, y: -52, width: 80, height: 100, rx: 6, fill: "#fff", stroke: "#94A3B8", "stroke-width": 3 }, w.paper);
    S("text", { x: 0, y: -24, "text-anchor": "middle", "font-size": 15, "font-weight": 900, fill: "#0F172A" }, w.paper, "WORK");
    S("text", { x: 0, y: -6, "text-anchor": "middle", "font-size": 15, "font-weight": 900, fill: "#0F172A" }, w.paper, "ORDER");
    for (let i = 0; i < 3; i++) S("rect", { x: -26, y: 8 + i * 10, width: 52, height: 4, fill: "#CBD5E1" }, w.paper);
    w.stamp = S("g", { opacity: 0 }, w.paper); S("rect", { x: -34, y: 6, width: 68, height: 30, rx: 6, fill: "none", stroke: C.green, "stroke-width": 4, transform: "rotate(-12)" }, w.stamp);
    S("text", { x: 0, y: 28, "text-anchor": "middle", "font-size": 13, "font-weight": 900, fill: C.green, transform: "rotate(-12)" }, w.stamp, "APPROVED");
    const tvF = S("rect", { x: 1850, y: 430, width: 650, height: 366, rx: 14, fill: "#0B1220", stroke: "#334155", "stroke-width": 10 }, g);
    w.tv = { x: 1858, y: 438, w: 634, h: 350, frame: tvF };
    // control room: glass, consoles, the big screen
    for (let i = 0; i < 5; i++) S("rect", { x: 2560 + i * 270, y: 500, width: 250, height: 380, fill: "rgba(125,211,252,.08)", stroke: "rgba(148,178,214,.3)", "stroke-width": 4 }, g);
    S("rect", { x: 2700, y: 140, width: 1120, height: 640, rx: 18, fill: "#0B1220", stroke: "#334155", "stroke-width": 14 }, g);
    w.big = { x: 2712, y: 152, w: 1096, h: 616 };
    for (const x of [2780, 3500]) { S("rect", { x, y: 810, width: 300, height: 70, rx: 10, fill: "#334155" }, g); S("rect", { x: x + 30, y: 760, width: 90, height: 56, rx: 6, fill: "#0B1220", stroke: "#475569", "stroke-width": 4 }, g); S("rect", { x: x + 38, y: 768, width: 74, height: 40, fill: C.teal, opacity: 0.6 }, g); }
    w.people = S("g", {}, g); w.front = S("g", {}, g);
    return w;
  }
  function animateWorld(w, t, st = {}) {
    const run = st.running !== false ? 1 : 0.15;
    w.rolls.forEach((r, i) => r.setAttribute("transform", `rotate(${((t * 140 * run) * (i % 2 ? -1 : 1)) % 360})`));
    w.felt.setAttribute("stroke-dashoffset", (-t * 120 * run).toFixed(1)); w.web.setAttribute("stroke-dashoffset", (-t * 160 * run).toFixed(1));
    w.steam.forEach((c, i) => { const p = ((t * 0.35 + i * 0.21) % 1); c.setAttribute("cy", (580 - p * 200).toFixed(1)); c.setAttribute("r", (20 + p * 30).toFixed(1)); show(c, (1 - p) * 0.5 * run); });
    w.lamps.forEach((l, i) => { const x = +l.dataset.x; l.setAttribute("transform", `translate(${x} 0) rotate(${(Math.sin(t * 1.3 + i) * 2.2).toFixed(2)})`); });
    [...w.clouds.children].forEach((c) => { const x = ((+c.dataset.x + t * 25) % 4200) - 200; c.setAttribute("transform", `translate(${x.toFixed(1)} ${c.dataset.y})`); });
    const fx = ((t * 160 + (st.forkOffset || 0)) % 5200) - 700;
    w.fork.setAttribute("transform", `translate(${fx.toFixed(1)} 940)`);
    w.wheels.forEach((wh, i) => wh.setAttribute("transform", `translate(${[-40, 26][i]} -18) rotate(${(t * 400) % 360})`));
    const col = st.beacon === "red" ? C.red : st.beacon === "amber" ? C.amber : C.green, pulse = st.beacon && st.beacon !== "green" ? 0.5 + 0.5 * Math.abs(Math.sin(t * 6)) : 0.6;
    w.beacon.setAttribute("fill", col); w.beaconGlow.setAttribute("fill", col); show(w.beaconGlow, 0.15 + 0.35 * pulse);
    w.m.lamp.setAttribute("fill", col);
    show(w.m.vib, st.beacon === "red" ? 0.5 + 0.5 * Math.abs(Math.sin(t * 9)) : 0);
    show(w.lock, st.lock || 0); show(w.lockTag, st.lock || 0);
  }
  /** a scene of lib/anim.js drawn inside one of the factory's screens */
  function screen(w, box, name, s, hide = []) {
    const n = S("svg", { x: box.x, y: box.y, width: box.w, height: box.h, viewBox: "0 0 1920 1080", preserveAspectRatio: "xMidYMid meet" });
    w.g.insertBefore(n, w.people); // behind the people and their speech bubbles
    S("rect", { x: 0, y: 0, width: 1920, height: 1080, fill: "#0B1C33" }, n);
    const sub = { _: { logo: s._.logo }, partAt: s.partAt, t0: s.t0, t1: s.t1 };
    A[name].build(n, sub);
    for (const k of hide) if (sub._[k]) (sub._[k].g || sub._[k]).setAttribute("display", "none");
    return { n, sub, render: (t) => A[name].render(sub, t) };
  }
  /** simpler camera: a list of shots, each [startTime, x, y, zoom]; moves over `dur` seconds into each shot */
  function shots(w, list, t, dur = 1.4) {
    let cur = list[0];
    let prev = list[0];
    for (let i = 0; i < list.length; i++) if (t >= list[i][0]) { prev = i ? list[i - 1] : list[i]; cur = list[i]; }
    const p = ease((t - cur[0]) / (cur[4] || dur));
    const x = lerp(prev[1], cur[1], p), y = lerp(prev[2], cur[2], p), z = Math.exp(lerp(Math.log(prev[3]), Math.log(cur[3]), p));
    w.g.setAttribute("transform", `translate(${(960 - x * z).toFixed(1)} ${(540 - y * z).toFixed(1)}) scale(${z.toFixed(4)})`);
  }

  // ---------- scenes ----------
  const OVER = [1980, 600, 0.5];

  // 1. Meet the team in the factory
  A.f_cast = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.p = [toon(w.people, "technician", { phone: true }), toon(w.people, "supervisor", { clipboard: true }), toon(w.people, "engineer", { tablet: true }), toon(w.people, "manager")];
      s._.pos = [[1420, 880], [1980, 880], [2960, 880], [3600, 880]];
      s._.b = (s.cards || []).map((c) => bubble(w.front, c, { fs: 30 }));
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      animateWorld(w, t, {});
      const foc = (k) => { const [x] = s._.pos[k]; return [q.at(k + 1) - 0.2, x, 640, 1.25]; };
      shots(w, [[s.t0 - 1, ...OVER], foc(0), foc(1), foc(2), foc(3)], t);
      s._.p.forEach((p, i) => {
        const on = t >= q.at(i + 1) - 0.2 && (i === 3 || t < q.at(i + 2) - 0.2);
        const [x, y] = s._.pos[i];
        p.set({ x, y, t, wave: on ? ease((t - q.at(i + 1)) / 0.4) : t < q.at(1) ? 1 : 0, talk: on });
        s._.b[i].set(x + 20, y - 300, on ? q.p(t, i + 1, 0.4, 0.4) : 0);
      });
    },
  };

  // 2. QR: the technician walks to the motor, scans, the machine opens on the phone
  A.f_qr = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.tech = toon(w.people, "technician", { phone: true });
      s._.beam = S("g", { opacity: 0 }, w.front);
      for (let k = 0; k < 3; k++) S("line", { stroke: C.teal2, "stroke-width": 4, "stroke-dasharray": "12 8" }, s._.beam);
      const m = w.m, qx = m.x + (-170 + 32) * m.sc, qy = m.y + (-44 + 32) * m.sc;
      s._.q = [qx, qy];
      s._.frame = S("rect", { x: qx - 40, y: qy - 40, width: 80, height: 80, rx: 10, fill: "none", stroke: C.teal2, "stroke-width": 6, opacity: 0 }, w.front);
      // the phone, over the picture
      const ph = K.bigPhone(svg, 1660, 520, 380, 760); s._.ph = ph;
      const sc = ph.scr, L = -ph.w / 2 + 34, W = ph.w - 68;
      S("text", { x: L, y: -230, "font-size": 15, "font-weight": 700, fill: "#64748B" }, sc, "ASSET · SCANNED");
      S("text", { x: L, y: -198, "font-size": 26, "font-weight": 800, fill: "#0F172A" }, sc, "MTR-01 · Drive motor");
      S("text", { x: L, y: -170, "font-size": 18, fill: "#64748B" }, sc, "Line 1 › Press section");
      K.row(sc, L, -150, W, "Status", "In service", "#16A34A"); K.row(sc, L, -86, W, "Open work", "1 order", "#D97706");
      K.row(sc, L, -22, W, "Next PM", "in 5 days", "#0F766E"); K.row(sc, L, 42, W, "Last reading", "4.1 mm/s", "#334155");
      s._.btn1 = K.button(sc, L, 128, W, "Report a problem", "#DC2626"); K.button(sc, L, 200, W, "Record a reading", C.navy);
      s._.sent = K.badge(sc, 0, 312, "Sent ✓  works offline", "#16A34A", { fs: 20, w: W });
      s._.tap = S("circle", { cx: 0, cy: 157, r: 26, fill: "rgba(20,184,166,.35)", stroke: C.teal, "stroke-width": 3, opacity: 0 }, sc);
      s._.wifi = S("g", { opacity: 0 }, svg);
      K.badge(s._.wifi, 1660, 940, "No network – saved, sent later", C.amber, { w: 470, fs: 21 });
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      animateWorld(w, t, {});
      const walkEnd = q.at(0) + 2.6, wp = clamp((t - (q.at(0) + 0.3)) / (walkEnd - q.at(0) - 0.3), 0, 1);
      const x = lerp(1720, 1100, ease(wp)), walking = wp > 0 && wp < 1;
      const raise = q.p(t, 1, 0.5);
      s._.tech.set({ x, y: 890, t, walk: walking ? 1 : 0, flip: true, raise, talk: false });
      shots(w, [[s.t0 - 1, 1300, 650, 1.0], [q.at(1) - 0.3, 980, 720, 1.7], [q.at(1) + 1.2, 900, 640, 1.15, 1.0]], t);
      const [qx, qy] = s._.q;
      show(s._.frame, (q.raw(t, 0, 2, 0.5) > 0 ? 0.6 + 0.4 * Math.sin(t * 8) : 0) * (1 - q.p(t, 1, 0.3, 1.4)));
      const px = x - 70 * raise, py = 890 - 260;
      const ba = q.p(t, 1, 0.3, 0.3) * (1 - q.p(t, 1, 0.3, 1.4));
      show(s._.beam, ba);
      [...s._.beam.children].forEach((ln, k) => { ln.setAttribute("x1", px); ln.setAttribute("y1", py); ln.setAttribute("x2", qx - 26 + k * 26); ln.setAttribute("y2", qy + (k - 1) * 26); ln.setAttribute("stroke-dashoffset", (-t * 70).toFixed(1)); });
      const op = q.p(t, 1, 0.6, 1.3);
      move(s._.ph.g, s._.ph.x, s._.ph.y + (1 - op) * 80, 0.7 + 0.3 * op); show(s._.ph.g, op);
      const tapA = q.p(t, 2, 0.3, 0.4), done = q.p(t, 2, 0.5, 1.1);
      show(s._.tap, tapA * (1 - done)); s._.btn1.r.setAttribute("fill", tapA > 0.5 && done < 0.5 ? "#991B1B" : "#DC2626");
      show(s._.sent, done); show(s._.wifi, q.p(t, 2, 0.5, 2.0));
    },
  };

  // 3. Condition monitoring: the sensor sends readings to the workshop screen; limits, alerts, automatic work
  A.f_cm = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.sc = screen(w, w.tv, "cm", s);
      s._.sup = toon(w.people, "supervisor", { clipboard: true });
      s._.sig = [0, 1, 2, 3, 4, 5].map(() => S("circle", { r: 10, fill: C.teal2, opacity: 0 }, w.front));
      s._.b = bubble(w.front, ["Critical alert!", "Work order is open"], { fs: 28, color: C.red });
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      const crit = t >= q.at(2) + 2.0, warn = t >= q.at(2) + 0.9;
      animateWorld(w, t, { beacon: crit ? "red" : warn ? "amber" : "green" });
      s._.sc.render(t);
      shots(w, [[s.t0 - 1, 1150, 660, 1.2], [q.at(0) + 2.2, 1800, 660, 0.95, 1.6], [q.at(1) - 0.2, 2175, 613, 2.4], [q.at(2) + 1.6, 2260, 620, 1.4]], t);
      // readings travel from the sensor along the pipe to the workshop screen
      const sx = w.m.x - 60 * w.m.sc, sy = w.m.y - 92 * w.m.sc, ex = 1860, ey = 600;
      s._.sig.forEach((c, i) => {
        const p = ((t * 0.5 + i / 6) % 1), x = lerp(sx, ex, p), y = lerp(sy, 404, Math.min(1, p * 4)) + (p > 0.85 ? (ey - 404) * ((p - 0.85) / 0.15) : 0);
        c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); show(c, Math.sin(p * Math.PI) * (t > q.at(0) + 0.4 ? 1 : 0));
      });
      const talk = crit && t < q.at(3) + 3;
      s._.sup.set({ x: 2580, y: 885, t, flip: true, raise: crit ? 0.5 : 0, talk });
      s._.b.set(2560, 600, crit ? ease((t - (q.at(2) + 2.0)) / 0.4) * (1 - q.p(t, 3, 0.4, 3)) : 0);
    },
  };

  // 4. Nelson rules: the engineer at the control room screen
  A.f_nelson = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.sc = screen(w, w.big, "nelson", s);
      s._.eng = toon(w.people, "engineer", { tablet: true });
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      animateWorld(w, t, {});
      s._.sc.render(t);
      shots(w, [[s.t0 - 1, 2800, 620, 0.9], [q.at(0) + 0.3, 3200, 520, 1.3, 1.8]], t);
      const pointing = t >= q.at(2) && t < q.at(4);
      s._.eng.set({ x: 2640, y: 885, t, raise: pointing ? 0.85 : 0, talk: true, wave: t < q.at(0) + 1.2 ? 1 : 0 });
    },
  };

  // 5. From the alert to the closed job, acted out in the workshop and at the machine
  A.f_flow = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.sup = toon(w.people, "supervisor", { clipboard: true });
      s._.tech = toon(w.people, "technician", { phone: true });
      s._.eng = toon(w.people, "engineer", { tablet: true });
      s._.bSkill = bubble(w.front, ["HYD ≥ 2  ✓", "Certificate valid  ✓"], { fs: 28, color: C.green });
      s._.bLoto = bubble(w.front, ["LOTO signed off ✓"], { fs: 28, color: C.amber });
      s._.bCheck = bubble(w.front, ["✓ Isolate & lock", "✓ Bearing check", "✓ Vibration 2.3 mm/s", "✓ Parts & hours"], { fs: 26, w: 360 });
      s._.bClose = bubble(w.front, ["Closed ✓"], { fs: 30, color: C.green });
      s._.bRca = bubble(w.front, ["Repeat failure?", "Root cause analysis"], { fs: 26, color: C.amber });
      s._.spark = [0, 1, 2, 3, 4, 5, 6].map(() => S("circle", { r: 5, fill: "#FDE047", opacity: 0 }, w.front));
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      const fixed = t >= q.at(3) + 3.2;
      animateWorld(w, t, { beacon: fixed ? "green" : "red", running: fixed || t < q.at(2) + 1.5, lock: t >= q.at(2) + 1.4 && t < q.at(3) + 3.0 ? q.p(t, 2, 0.3, 1.4) : 0 });
      shots(w, [[s.t0 - 1, 2100, 640, 1.25], [q.at(2) + 0.2, 1500, 640, 1.0, 2.2], [q.at(2) + 2.6, 1200, 650, 1.35], [q.at(4) + 1.4, 1450, 640, 1.05]], t);
      // the work order paper: on the desk, stamped, handed to the technician
      const pa = q.p(t, 0, 0.4, 0.2), stamp = q.p(t, 0, 0.3, 1.4);
      const hand = q.p(t, 1, 0.8, 1.6);
      show(w.paper, pa * (1 - q.p(t, 2, 0.3, 0.2)));
      w.paper.setAttribute("transform", `translate(${lerp(2230, 2040, hand).toFixed(1)} ${lerp(760, 760, hand).toFixed(1)}) scale(${(1 + 0.6 * (1 - pa)).toFixed(2)})`);
      show(w.stamp, stamp);
      // people
      const walkTech = clamp((t - (q.at(1) + 0.1)) / 1.6, 0, 1), toMachine = clamp((t - (q.at(2) + 0.1)) / 2.4, 0, 1);
      const tx = toMachine > 0 ? lerp(1960, 1180, ease(toMachine)) : lerp(1550, 1960, ease(walkTech));
      const sx = toMachine > 0 ? lerp(2300, 1480, ease(toMachine)) : 2300;
      const working = t >= q.at(3) + 0.2 && t < q.at(3) + 3.0;
      s._.tech.set({ x: tx, y: 890, t, walk: (walkTech > 0 && walkTech < 1) || (toMachine > 0 && toMachine < 1) ? 1 : 0, flip: toMachine > 0 || walkTech < 1 ? toMachine > 0 : false, work: working ? 1 : 0, a: q.p(t, 1, 0.3, 0) });
      s._.sup.set({ x: sx, y: 890, t, walk: toMachine > 0 && toMachine < 1 ? 1 : 0, flip: true, talk: t < q.at(1) + 1 || (t >= q.at(4) && t < q.at(4) + 2), raise: stamp > 0 && stamp < 1 ? 0.6 : 0 });
      const engIn = clamp((t - (q.at(4) + 1.6)) / 1.5, 0, 1);
      s._.eng.set({ x: lerp(1950, 1700, ease(engIn)), y: 890, t, walk: engIn > 0 && engIn < 1 ? 1 : 0, flip: true, a: engIn > 0 ? 1 : 0, talk: engIn >= 1 });
      s._.bSkill.set(tx, 600, q.p(t, 1, 0.4, 1.4) * (1 - q.p(t, 2, 0.3, 0)));
      s._.bLoto.set(sx, 600, q.p(t, 2, 0.4, 2.4) * (1 - q.p(t, 3, 0.3, 0)));
      s._.bCheck.set(tx + 40, 600, q.p(t, 3, 0.4, 0.4) * (1 - q.p(t, 4, 0.3, 0)));
      s._.bClose.set(sx, 600, q.p(t, 4, 0.4, 0.4) * (1 - q.p(t, 4, 0.3, 2.4)));
      s._.bRca.set(1700, 600, q.p(t, 4, 0.4, 2.8));
      s._.spark.forEach((c, i) => { const p = ((t * 2.2 + i / 7) % 1); c.setAttribute("cx", (1060 - p * 80 * Math.cos(i)).toFixed(1)); c.setAttribute("cy", (760 - p * 90 * Math.abs(Math.sin(i + 1))).toFixed(1)); show(c, working ? 1 - p : 0); });
    },
  };

  // 6. The week on the control room screen, two approvals, the KPIs
  A.f_plan = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.sc = screen(w, w.big, "plan", s, ["eng", "mgr", "st1", "st2", "note"]);
      s._.eng = toon(w.people, "engineer", { tablet: true }); s._.mgr = toon(w.people, "manager");
      s._.b1 = bubble(w.front, ["Approved ✓"], { fs: 30, color: C.green }); s._.b2 = bubble(w.front, ["Final approval ✓"], { fs: 30, color: C.green });
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      animateWorld(w, t, {});
      s._.sc.render(t);
      shots(w, [[s.t0 - 1, 3270, 540, 1.1], [q.at(1) - 0.2, 3270, 600, 1.0], [q.at(2) + 0.1, 3270, 520, 1.12]], t);
      s._.eng.set({ x: 2620, y: 885, t, talk: t >= q.at(1) && t < q.at(1) + 1.3, raise: q.p(t, 1, 0.3, 0.4) * (1 - q.p(t, 1, 0.3, 1.3)) });
      s._.mgr.set({ x: 3920, y: 885, t, flip: true, talk: t >= q.at(1) + 1.3, raise: q.p(t, 1, 0.3, 1.6) * (1 - q.p(t, 2, 0.3, 0)) });
      s._.b1.set(2620, 590, q.p(t, 1, 0.4, 0.7) * (1 - q.p(t, 2, 0.3, 0.2)));
      s._.b2.set(3920, 590, q.p(t, 1, 0.4, 2.0) * (1 - q.p(t, 2, 0.3, 0.2)));
    },
  };

  // 7. The whole factory running, everyone waving, the name
  A.f_loop = {
    build(svg, s) {
      const w = (s._.w = world(svg));
      s._.p = [toon(w.people, "technician", { phone: true }), toon(w.people, "supervisor", { clipboard: true }), toon(w.people, "engineer", { tablet: true }), toon(w.people, "manager")];
      s._.pos = [1420, 1980, 2960, 3600];
      const band = (s._.band = S("g", { opacity: 0 }, svg));
      S("rect", { x: 0, y: 330, width: 1920, height: 300, fill: "rgba(8,22,41,.82)" }, band);
      S("image", { href: s._.logo, x: 700, y: 380, width: 200, height: 200 }, band);
      S("text", { x: 940, y: 480, "font-size": 92, "font-weight": 900, fill: C.text }, band, "PlantPulse");
      S("text", { x: 944, y: 548, "font-size": 34, "font-weight": 700, fill: C.teal2 }, band, "From the signal to the fix");
    },
    render(s, t) {
      const q = T(s), w = s._.w;
      animateWorld(w, t, {});
      shots(w, [[s.t0 - 1, 1600, 640, 1.0], [q.at(0) + 0.2, ...OVER, 3.0]], t);
      s._.p.forEach((p, i) => p.set({ x: s._.pos[i], y: 880, t, wave: 1 }));
      show(s._.band, q.p(t, 0, 0.8, 2.6));
    },
  };
  window.FACTORY = { world, toon, bubble, animateWorld, shots, screen, OVER };
})();
