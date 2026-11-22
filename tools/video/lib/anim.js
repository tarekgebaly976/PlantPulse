// Animated scenes (layout "anim"): flat SVG people, a machine, a phone and charts, moved frame by frame from the
// scene's time, each action starting with its own sentence (s.partAt). Same navy / teal look and colour code as the
// rest of the series (red act now, amber attention, green all clear). Pictures are illustrations, not app screens.
"use strict";
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const C = { navy: "#0B1C33", navy2: "#0F2744", navy3: "#16365C", line: "rgba(148,178,214,.25)", teal: "#14B8A6", teal2: "#5EEAD4",
    text: "#EAF2FB", muted: "#9DB2CC", red: "#EF4444", amber: "#F59E0B", green: "#22C55E", skin: "#E8B48F", skin2: "#C98E68", white: "#F8FAFC" };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (x) => { x = clamp(x, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const lerp = (a, b, p) => a + (b - a) * p;
  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  const show = (e, a) => { e.setAttribute("opacity", clamp(a, 0, 1).toFixed(3)); };
  const move = (e, x, y, sc = 1, rot = 0) => { e.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(3)})`); };
  const T = (s) => ({
    at: (k) => (s.partAt && s.partAt[k] !== undefined ? s.partAt[k] : s.t0 + 0.5 + k * 3),
    p(t, k, d = 0.7, off = 0) { return ease((t - this.at(k) - off) / d); },
    raw(t, k, d = 1, off = 0) { return clamp((t - this.at(k) - off) / d, 0, 1); },
  });

  // ---------- a person: role colours, walk cycle, one arm that can hold a phone up ----------
  const ROLE = {
    technician: { helmet: C.amber, body: "#0E7490", trim: C.amber, label: "Technician" },
    supervisor: { helmet: C.white, body: "#334155", trim: "#FDE047", label: "Supervisor" },
    engineer: { helmet: "#3B82F6", body: "#1E3A8A", trim: C.white, label: "Engineer" },
    manager: { helmet: null, body: "#111827", trim: C.teal, label: "Maintenance manager" },
  };
  function person(parent, role, opts = {}) {
    const r = ROLE[role], g = S("g", {}, parent), body = S("g", {}, g);
    const legL = S("g", {}, body), legR = S("g", {}, body);
    S("rect", { x: -17, y: 0, width: 15, height: 70, rx: 7, fill: "#1F2937" }, legL);
    S("rect", { x: -20, y: 62, width: 22, height: 11, rx: 5, fill: "#0B1220" }, legL);
    S("rect", { x: 2, y: 0, width: 15, height: 70, rx: 7, fill: "#1F2937" }, legR);
    S("rect", { x: -1, y: 62, width: 22, height: 11, rx: 5, fill: "#0B1220" }, legR);
    legL.setAttribute("transform", "translate(0 -72)"); legR.setAttribute("transform", "translate(0 -72)");
    const torso = S("path", { d: "M-30,-150 Q-32,-158 -22,-160 L22,-160 Q32,-158 30,-150 L26,-66 L-26,-66 Z", fill: r.body }, body);
    if (role === "supervisor") { S("rect", { x: -30, y: -122, width: 60, height: 7, fill: r.trim, opacity: 0.9 }, body); S("rect", { x: -30, y: -100, width: 60, height: 7, fill: r.trim, opacity: 0.9 }, body); }
    if (role === "technician") { S("rect", { x: -26, y: -96, width: 52, height: 6, fill: r.trim, opacity: 0.85 }, body); S("rect", { x: -5, y: -158, width: 10, height: 90, fill: "rgba(0,0,0,.15)" }, body); }
    if (role === "manager") { S("path", { d: "M-8,-160 L0,-112 L8,-160 Z", fill: C.white }, body); S("path", { d: "M-4,-156 L0,-118 L4,-156 Z", fill: r.trim }, body); }
    if (role === "engineer") { S("rect", { x: -26, y: -150, width: 52, height: 6, fill: "rgba(255,255,255,.25)" }, body); }
    const armL = S("g", { transform: "translate(-28 -150)" }, body);
    S("rect", { x: -9, y: 0, width: 15, height: 70, rx: 7, fill: r.body }, armL); S("circle", { cx: -1, cy: 72, r: 9, fill: C.skin }, armL);
    const armR = S("g", { transform: "translate(28 -150)" }, body);
    S("rect", { x: -6, y: 0, width: 15, height: 70, rx: 7, fill: r.body }, armR); S("circle", { cx: 1, cy: 72, r: 9, fill: C.skin }, armR);
    const held = S("g", { transform: "translate(1 78)" }, armR);
    if (opts.phone) { S("rect", { x: -11, y: -4, width: 22, height: 36, rx: 4, fill: "#0B1220", stroke: "#475569", "stroke-width": 2 }, held); S("rect", { x: -8, y: 0, width: 16, height: 26, rx: 2, fill: C.teal2, opacity: 0.8 }, held); }
    if (opts.clipboard) { S("rect", { x: -16, y: -6, width: 32, height: 40, rx: 4, fill: "#E2E8F0" }, held); S("rect", { x: -8, y: -10, width: 16, height: 8, rx: 2, fill: "#64748B" }, held); for (let i = 0; i < 3; i++) S("rect", { x: -10, y: 6 + i * 9, width: 20, height: 3, fill: "#94A3B8" }, held); }
    if (opts.tablet) { S("rect", { x: -20, y: -4, width: 40, height: 30, rx: 4, fill: "#0B1220", stroke: "#475569", "stroke-width": 2 }, held); S("polyline", { points: "-14,18 -6,10 2,14 12,2", fill: "none", stroke: C.teal2, "stroke-width": 3 }, held); }
    S("rect", { x: -8, y: -172, width: 16, height: 14, fill: C.skin2 }, body);
    S("circle", { cx: 0, cy: -194, r: 26, fill: C.skin }, body);
    if (r.helmet) { S("path", { d: "M-29,-196 Q-29,-230 0,-231 Q29,-230 29,-196 Z", fill: r.helmet }, body); S("rect", { x: -34, y: -199, width: 68, height: 7, rx: 3, fill: r.helmet }, body); }
    else S("path", { d: "M-26,-198 Q-26,-224 0,-222 Q26,-224 26,-198 Q16,-212 0,-212 Q-16,-212 -26,-198 Z", fill: "#2B2118" }, body);
    S("circle", { cx: -9, cy: -190, r: 3, fill: "#1F2937" }, body); S("circle", { cx: 9, cy: -190, r: 3, fill: "#1F2937" }, body);
    S("path", { d: "M-8,-178 Q0,-172 8,-178", fill: "none", stroke: "#7C4A32", "stroke-width": 2.5, "stroke-linecap": "round" }, body);
    const tag = S("g", {}, g);
    const w = Math.max(150, r.label.length * 15 + 40);
    S("rect", { x: -w / 2, y: 22, width: w, height: 40, rx: 20, fill: "rgba(9,22,40,.9)", stroke: C.teal, "stroke-width": 2 }, tag);
    S("text", { x: 0, y: 49, "text-anchor": "middle", "font-size": 22, "font-weight": 700, fill: C.text }, tag, opts.label || r.label);
    return {
      g, tag,
      /** x, y = feet; walk = distance walked (drives the legs); raise = 0..1 arm up (phone to the machine) */
      set({ x, y, sc = 1, walk = 0, raise = 0, a = 1, bob = 0, flip = false }) {
        move(g, x, y + Math.sin(bob) * 2, sc); body.setAttribute("transform", flip ? "scale(-1 1)" : "");
        const sw = Math.sin(walk / 14) * 22 * Math.min(1, Math.abs(walk) > 0 ? 1 : 0);
        legL.setAttribute("transform", `translate(0 -72) rotate(${sw.toFixed(1)} 0 0)`);
        legR.setAttribute("transform", `translate(0 -72) rotate(${(-sw).toFixed(1)} 0 0)`);
        armL.setAttribute("transform", `translate(-28 -150) rotate(${(-sw * 0.7).toFixed(1)})`);
        armR.setAttribute("transform", `translate(28 -150) rotate(${(sw * 0.7 * (1 - raise) - 120 * raise).toFixed(1)})`);
        show(g, a);
      },
    };
  }

  // ---------- a machine (motor + coupling + pump on a base), QR label, sensor, status lamp, vibration ----------
  function machine(parent, x, y, sc = 1) {
    const g = S("g", { transform: `translate(${x} ${y}) scale(${sc})` }, parent);
    S("rect", { x: -260, y: 60, width: 520, height: 34, rx: 8, fill: "#1E293B" }, g);
    S("rect", { x: -230, y: -80, width: 230, height: 140, rx: 20, fill: "#2563EB" }, g);
    for (let i = 0; i < 6; i++) S("rect", { x: -214 + i * 34, y: -74, width: 8, height: 128, rx: 3, fill: "rgba(255,255,255,.14)" }, g);
    S("rect", { x: -240, y: -50, width: 14, height: 80, rx: 5, fill: "#1D4ED8" }, g);
    S("rect", { x: 0, y: -26, width: 56, height: 32, rx: 6, fill: "#64748B" }, g);
    S("rect", { x: 56, y: -60, width: 170, height: 120, rx: 26, fill: "#0D9488" }, g);
    S("circle", { cx: 141, cy: 0, r: 34, fill: "#0F766E" }, g); S("circle", { cx: 141, cy: 0, r: 12, fill: "#134E4A" }, g);
    S("rect", { x: 200, y: -100, width: 26, height: 60, rx: 6, fill: "#0F766E" }, g);
    const qr = S("g", { transform: "translate(-170 -44)" }, g);
    S("rect", { x: 0, y: 0, width: 64, height: 64, rx: 6, fill: "#fff" }, qr);
    const bits = "1110111100100110111010110111101011011011010111111101101100111010110110111";
    for (let i = 0; i < 49; i++) if (bits[i] === "1") S("rect", { x: 6 + (i % 7) * 7.4, y: 6 + Math.floor(i / 7) * 7.4, width: 7.4, height: 7.4, fill: "#0B1220" }, qr);
    const sensor = S("g", { transform: "translate(-60 -92)" }, g);
    S("rect", { x: -14, y: 0, width: 28, height: 18, rx: 4, fill: "#CBD5E1" }, sensor); S("circle", { cx: 0, cy: -6, r: 9, fill: C.teal2 }, sensor);
    const lamp = S("circle", { cx: -110, cy: -104, r: 14, fill: C.green }, g);
    S("rect", { x: -114, y: -92, width: 8, height: 14, fill: "#475569" }, g);
    const vib = S("g", { opacity: 0 }, g);
    for (const [dx, dy] of [[-262, -10], [242, -10]]) for (let k = 0; k < 3; k++) S("path", { d: `M${dx + (dx < 0 ? -k * 14 : k * 14)},${dy - 26} q${dx < 0 ? -10 : 10},26 0,52`, fill: "none", stroke: C.amber, "stroke-width": 4, "stroke-linecap": "round" }, vib);
    return { g, qr, sensor, lamp, vib, x, y, sc };
  }

  // ---------- a big phone with a screen we draw on ----------
  function bigPhone(parent, x, y, w = 360, h = 700) {
    const g = S("g", {}, parent);
    S("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 48, fill: "#05090F", stroke: "#2A3646", "stroke-width": 3 }, g);
    const scr = S("g", {}, g);
    S("rect", { x: -w / 2 + 14, y: -h / 2 + 14, width: w - 28, height: h - 28, rx: 36, fill: "#F4F6F9" }, scr);
    S("rect", { x: -w / 2 + 14, y: -h / 2 + 14, width: w - 28, height: 92, rx: 36, fill: C.navy }, scr);
    S("rect", { x: -w / 2 + 14, y: -h / 2 + 70, width: w - 28, height: 36, fill: C.navy }, scr);
    S("text", { x: 0, y: -h / 2 + 80, "text-anchor": "middle", "font-size": 22, "font-weight": 800, fill: "#fff" }, scr, "PlantPulse");
    return { g, scr, x, y, w, h };
  }
  function row(parent, x, y, w, label, value, color) {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    S("rect", { x: 0, y: 0, width: w, height: 54, rx: 12, fill: "#fff", stroke: "#E2E8F0" }, g);
    S("text", { x: 16, y: 34, "font-size": 19, fill: "#475569", "font-weight": 600 }, g, label);
    if (value) {
      const vw = value.length * 11 + 26;
      S("rect", { x: w - vw - 12, y: 12, width: vw, height: 30, rx: 15, fill: color || "#E2E8F0", opacity: 0.18 }, g);
      S("text", { x: w - 12 - vw / 2, y: 33, "text-anchor": "middle", "font-size": 17, "font-weight": 800, fill: color || "#334155" }, g, value);
    }
    return g;
  }
  function button(parent, x, y, w, label, fill, fg = "#fff") {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    const r = S("rect", { x: 0, y: 0, width: w, height: 58, rx: 14, fill }, g);
    S("text", { x: w / 2, y: 37, "text-anchor": "middle", "font-size": 21, "font-weight": 800, fill: fg }, g, label);
    return { g, r };
  }
  function badge(parent, x, y, label, color, opts = {}) {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    const w = opts.w || label.length * 13 + 56;
    S("rect", { x: -w / 2, y: -28, width: w, height: 56, rx: 28, fill: color, opacity: opts.soft ? 0.18 : 1, stroke: color, "stroke-width": opts.soft ? 2 : 0 }, g);
    S("text", { x: 0, y: 9, "text-anchor": "middle", "font-size": opts.fs || 24, "font-weight": 800, fill: opts.soft ? color : "#fff" }, g, label);
    return g;
  }
  function panel(parent, x, y, w, h, title) {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    S("rect", { x: 0, y: 0, width: w, height: h, rx: 22, fill: "rgba(15,39,68,.92)", stroke: C.line, "stroke-width": 2 }, g);
    S("rect", { x: 0, y: 0, width: w, height: 8, rx: 4, fill: C.teal }, g);
    if (title) S("text", { x: 28, y: 52, "font-size": 28, "font-weight": 800, fill: C.text }, g, title);
    return g;
  }
  const tick = (parent, x, y, r = 16, color = C.green) => {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    S("circle", { cx: 0, cy: 0, r, fill: color }, g);
    S("path", { d: `M${-r * 0.45},0 L${-r * 0.1},${r * 0.35} L${r * 0.5},${-r * 0.35}`, fill: "none", stroke: "#fff", "stroke-width": r * 0.22, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    return g;
  };
  function bell(parent, x, y, color = C.red) {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    S("path", { d: "M-18,10 Q-18,-20 0,-22 Q18,-20 18,10 L24,16 L-24,16 Z", fill: color }, g);
    S("circle", { cx: 0, cy: 22, r: 6, fill: color }, g);
    return g;
  }
  function lock(parent, x, y, color = C.red) {
    const g = S("g", { transform: `translate(${x} ${y})` }, parent);
    S("path", { d: "M-14,-6 L-14,-18 Q-14,-34 0,-34 Q14,-34 14,-18 L14,-6", fill: "none", stroke: color, "stroke-width": 6 }, g);
    S("rect", { x: -22, y: -8, width: 44, height: 36, rx: 7, fill: color }, g);
    S("circle", { cx: 0, cy: 8, r: 5, fill: "#fff" }, g);
    return g;
  }

  // ---------- scenes ----------
  const A = {};

  // 1. The four roles
  A.cast = {
    build(svg, s) {
      const xs = [330, 750, 1170, 1590], roles = ["technician", "supervisor", "engineer", "manager"];
      const extra = [{ phone: true }, { clipboard: true }, { tablet: true }, {}];
      const cards = s.cards || [];
      s._.people = roles.map((r, i) => person(svg, r, extra[i]));
      s._.cards = cards.map((c, i) => {
        const g = S("g", {}, svg);
        S("rect", { x: xs[i] - 190, y: 640, width: 380, height: 250, rx: 20, fill: "rgba(15,39,68,.92)", stroke: C.line, "stroke-width": 2 }, g);
        S("rect", { x: xs[i] - 190, y: 640, width: 380, height: 7, rx: 3, fill: C.teal }, g);
        c.forEach((line, k) => {
          S("circle", { cx: xs[i] - 160, cy: 690 + k * 62, r: 7, fill: C.teal2 }, g);
          S("text", { x: xs[i] - 140, y: 698 + k * 62, "font-size": 23, "font-weight": 600, fill: C.text }, g, line);
        });
        return g;
      });
      s._.xs = xs;
    },
    render(s, t) {
      const q = T(s);
      s._.people.forEach((p, i) => {
        const a = q.p(t, i + 1, 0.8, -0.2), x = s._.xs[i];
        p.set({ x: x + (1 - a) * 60, y: 520, sc: 1.05, walk: (1 - a) * 60, a, bob: t * 2 + i });
        show(s._.cards[i], q.p(t, i + 1, 0.6, 0.3));
        s._.cards[i].setAttribute("transform", `translate(0 ${((1 - q.p(t, i + 1, 0.6, 0.3)) * 30).toFixed(1)})`);
      });
    },
  };

  // 2. QR: the technician walks up, scans the label, the machine opens on the phone
  A.qr = {
    build(svg, s) {
      s._.m = machine(svg, 560, 560, 1.15);
      s._.tech = person(svg, "technician", { phone: true });
      s._.beam = S("g", { opacity: 0 }, svg);
      for (let k = 0; k < 3; k++) S("line", { x1: 0, y1: 0, x2: 0, y2: 0, stroke: C.teal2, "stroke-width": 3, "stroke-dasharray": "10 8", "data-k": k }, s._.beam);
      s._.frame = S("rect", { x: 0, y: 0, width: 96, height: 96, rx: 10, fill: "none", stroke: C.teal2, "stroke-width": 5, opacity: 0 }, svg);
      const ph = bigPhone(svg, 1500, 520, 380, 760); s._.ph = ph;
      const sc = ph.scr, L = -ph.w / 2 + 34, W = ph.w - 68;
      S("text", { x: L, y: -230, "font-size": 15, "font-weight": 700, fill: "#64748B" }, sc, "ASSET · SCANNED");
      S("text", { x: L, y: -198, "font-size": 26, "font-weight": 800, fill: "#0F172A" }, sc, "MTR-01 · Drive motor");
      S("text", { x: L, y: -170, "font-size": 18, fill: "#64748B" }, sc, "Line 1 › Press section");
      row(sc, L, -150, W, "Status", "In service", "#16A34A");
      row(sc, L, -86, W, "Open work", "1 order", "#D97706");
      row(sc, L, -22, W, "Next PM", "in 5 days", "#0F766E");
      row(sc, L, 42, W, "Last reading", "4.1 mm/s", "#334155");
      s._.btn1 = button(sc, L, 128, W, "Report a problem", "#DC2626");
      s._.btn2 = button(sc, L, 200, W, "Record a reading", C.navy);
      s._.sent = badge(sc, 0, 312, "Sent ✓  works offline", "#16A34A", { fs: 20, w: W });
      s._.tap = S("circle", { cx: 0, cy: 0, r: 26, fill: "rgba(20,184,166,.35)", stroke: C.teal, "stroke-width": 3, opacity: 0 }, sc);
    },
    render(s, t) {
      const q = T(s), m = s._.m;
      const walkP = q.p(t, 0, 2.2, 0.2);
      const x = lerp(1230, 990, walkP);
      const raise = q.p(t, 1, 0.6, 0);
      s._.tech.set({ x, y: 690, sc: 1.1, walk: (1 - walkP) > 0.01 ? t * 120 : 0, raise, flip: true, bob: t * 2 });
      // label pulse when it is introduced, then the scan beam from the phone to the label
      const qx = m.x + (-170 + 32) * m.sc, qy = m.y + (-44 + 32) * m.sc;
      const pulse = q.raw(t, 0, 2.5, 0.4);
      s._.frame.setAttribute("x", qx - 48); s._.frame.setAttribute("y", qy - 48);
      show(s._.frame, pulse > 0 && pulse < 1 ? 0.5 + 0.5 * Math.sin(pulse * 18) : q.p(t, 1, 0.3) * (1 - q.p(t, 1, 0.4, 1.6)));
      const px = x - 70 * 1.1 * raise, py = 690 - 300 * 1.1;
      const beamA = q.p(t, 1, 0.3, 0.3) * (1 - q.p(t, 1, 0.4, 1.5));
      show(s._.beam, beamA);
      [...s._.beam.children].forEach((ln, k) => { ln.setAttribute("x1", px); ln.setAttribute("y1", py); ln.setAttribute("x2", qx - 30 + k * 30); ln.setAttribute("y2", qy + (k - 1) * 30); ln.setAttribute("stroke-dashoffset", (-t * 60).toFixed(1)); });
      // the phone grows in on the right with the machine's page
      const op = q.p(t, 1, 0.7, 1.3);
      move(s._.ph.g, s._.ph.x, s._.ph.y + (1 - op) * 60, 0.7 + 0.3 * op); show(s._.ph.g, op);
      const tapA = q.p(t, 2, 0.3, 0.3), done = q.p(t, 2, 0.5, 1.0);
      s._.tap.setAttribute("cx", 0); s._.tap.setAttribute("cy", 128 + 29);
      show(s._.tap, tapA * (1 - done));
      s._.btn1.r.setAttribute("fill", tapA > 0.5 && done < 0.5 ? "#991B1B" : "#DC2626");
      show(s._.sent, done);
      m.lamp.setAttribute("fill", C.green);
    },
  };

  // 3. Condition monitoring: readings against warning and alarm limits, alerts, automatic work
  const CM = [2.1, 2.3, 2.2, 2.6, 2.4, 2.9, 3.1, 3.4, 3.9, 4.6, 5.4, 6.3, 7.4];
  A.cm = {
    build(svg, s) {
      const P = panel(svg, 110, 150, 1120, 720, "Vibration · MTR-01 drive end (mm/s)");
      const X0 = 90, Y0 = 640, Wd = 980, Hd = 520, max = 8;
      s._.geom = { X0, Y0, Wd, Hd, max, n: CM.length };
      const y = (v) => Y0 - (v / max) * Hd;
      s._.lims = S("g", {}, P);
      S("rect", { x: X0, y: y(max), width: Wd, height: y(7) - y(max), fill: "rgba(239,68,68,.12)" }, s._.lims);
      S("rect", { x: X0, y: y(7), width: Wd, height: y(4.5) - y(7), fill: "rgba(245,158,11,.10)" }, s._.lims);
      S("line", { x1: X0, y1: y(4.5), x2: X0 + Wd, y2: y(4.5), stroke: C.amber, "stroke-width": 4, "stroke-dasharray": "14 10" }, s._.lims);
      S("text", { x: X0 + 14, y: y(4.5) - 12, "font-size": 22, "font-weight": 800, fill: C.amber }, s._.lims, "Warning 4.5");
      S("line", { x1: X0, y1: y(7), x2: X0 + Wd, y2: y(7), stroke: C.red, "stroke-width": 4, "stroke-dasharray": "14 10" }, s._.lims);
      S("text", { x: X0 + 14, y: y(7) - 12, "font-size": 22, "font-weight": 800, fill: C.red }, s._.lims, "Alarm 7.0");
      S("line", { x1: X0, y1: Y0, x2: X0 + Wd, y2: Y0, stroke: C.line, "stroke-width": 2 }, P);
      for (let v = 0; v <= 8; v += 2) S("text", { x: X0 - 16, y: y(v) + 7, "text-anchor": "end", "font-size": 18, fill: C.muted }, P, String(v));
      s._.path = S("polyline", { points: "", fill: "none", stroke: C.teal2, "stroke-width": 4, "stroke-linejoin": "round" }, P);
      s._.dots = CM.map((v, i) => S("circle", { cx: X0 + 30 + (i * (Wd - 60)) / (CM.length - 1), cy: y(v), r: 11, fill: C.teal, stroke: "#0B1C33", "stroke-width": 3, opacity: 0 }, P));
      s._.y = y;
      // techniques
      const techs = ["Vibration", "Temperature", "Oil analysis", "Thermography", "Ultrasound", "Motor current"];
      s._.techs = techs.map((tx, i) => badge(svg, 1290 + (i % 2) * 280 + 130, 250 + Math.floor(i / 2) * 78, tx, C.teal, { soft: true, w: 250, fs: 21 }));
      s._.warn = badge(svg, 1560, 520, "⚠ Warning alert", C.amber, { w: 420 });
      s._.crit = badge(svg, 1560, 600, "Critical alert", C.red, { w: 420 });
      s._.glow = S("rect", { x: 1344, y: 566, width: 432, height: 68, rx: 34, fill: "none", stroke: C.red, "stroke-width": 4, opacity: 0 }, svg);
      // what a critical alert opens
      s._.wo = S("g", {}, svg);
      const c1 = panel(s._.wo, 1350, 680, 420, 90); S("text", { x: 28, y: 56, "font-size": 23, "font-weight": 800, fill: C.text }, c1, "Work order – created");
      const c2 = panel(s._.wo, 1350, 786, 420, 90); S("text", { x: 28, y: 56, "font-size": 23, "font-weight": 800, fill: C.text }, c2, "or work request – triage");
      s._.woTick = tick(s._.wo, 1730, 725, 18);
    },
    render(s, t) {
      const q = T(s), g = s._.geom;
      s._.techs.forEach((b, i) => { const a = q.p(t, 0, 0.45, 0.25 + i * 0.35); show(b, a); });
      show(s._.lims, q.p(t, 1, 0.6, 0.1));
      // points arrive steadily from part 0 to the middle of part 2; the last two cross the limits during part 2
      const start = q.at(0) + 0.4, end = q.at(2) + 2.2;
      const nShow = Math.floor(clamp((t - start) / (end - start), 0, 1) * g.n + 1e-6);
      let pts = [];
      s._.dots.forEach((d, i) => {
        const on = i < nShow; show(d, on ? 1 : 0);
        const v = CM[i]; d.setAttribute("fill", v >= 7 ? C.red : v >= 4.5 ? C.amber : C.teal);
        if (on) pts.push(`${d.getAttribute("cx")},${d.getAttribute("cy")}`);
      });
      s._.path.setAttribute("points", pts.join(" "));
      const firstWarn = CM.findIndex((v) => v >= 4.5), firstCrit = CM.findIndex((v) => v >= 7);
      const wa = nShow > firstWarn ? 1 : 0, ca = nShow > firstCrit ? 1 : 0;
      show(s._.warn, wa * (1 - ca * 0.45)); show(s._.crit, ca); show(s._.glow, ca * (0.3 + 0.7 * Math.abs(Math.sin(t * 4))));
      const wo = q.p(t, 3, 0.6, 0.2); show(s._.wo, wo); show(s._.woTick, q.p(t, 3, 0.4, 1.2));
    },
  };

  // 4. Nelson rules on a control chart: a rising run and a shift, inside the limits
  const NEL = [50.2, 49.1, 50.8, 49.6, 50.4, 49.0, 50.6, 49.4, 49.2, 49.7, 50.1, 50.5, 50.9, 51.3, 51.8, 52.1, 51.4, 51.0, 51.6, 51.2, 51.7, 51.1, 51.5];
  const RULES = [
    "1 point beyond 3σ", "7 in a row on one side", "7 in a row rising or falling", "14 alternating up and down",
    "2 of 3 beyond 2σ (one side)", "4 of 5 beyond 1σ (one side)", "14 in a row within 1σ", "8 in a row beyond 1σ",
  ];
  A.nelson = {
    build(svg, s) {
      const P = panel(svg, 90, 150, 1180, 720, "Control chart · bearing temperature (°C)");
      const X0 = 70, Y0 = 640, Wd = 1060, Hd = 540, CL = 50, sg = 1.1;
      const y = (v) => Y0 - ((v - (CL - 4 * sg)) / (8 * sg)) * Hd;
      s._.bands = S("g", {}, P);
      const band = (a, b, fill) => S("rect", { x: X0, y: y(CL + b * sg), width: Wd, height: y(CL + a * sg) - y(CL + b * sg), fill }, s._.bands);
      band(2, 3, "rgba(245,158,11,.10)"); band(-3, -2, "rgba(245,158,11,.10)"); band(1, 2, "rgba(94,234,212,.05)"); band(-2, -1, "rgba(94,234,212,.05)");
      for (const k of [-3, -2, -1, 1, 2, 3]) {
        S("line", { x1: X0, y1: y(CL + k * sg), x2: X0 + Wd, y2: y(CL + k * sg), stroke: Math.abs(k) === 3 ? C.red : "rgba(148,178,214,.35)", "stroke-width": Math.abs(k) === 3 ? 3 : 2, "stroke-dasharray": "10 8" }, s._.bands);
        S("text", { x: X0 + Wd + 10, y: y(CL + k * sg) + 7, "font-size": 18, fill: Math.abs(k) === 3 ? C.red : C.muted }, s._.bands, `${k > 0 ? "+" : "−"}${Math.abs(k)}σ`);
      }
      S("line", { x1: X0, y1: y(CL), x2: X0 + Wd, y2: y(CL), stroke: C.teal2, "stroke-width": 4 }, s._.bands);
      S("text", { x: X0 + Wd + 10, y: y(CL) + 7, "font-size": 20, "font-weight": 800, fill: C.teal2 }, s._.bands, "CL");
      s._.path = S("polyline", { points: "", fill: "none", stroke: "#E2E8F0", "stroke-width": 3 }, P);
      s._.dots = NEL.map((v, i) => S("circle", { cx: X0 + 25 + (i * (Wd - 50)) / (NEL.length - 1), cy: y(v), r: 10, fill: "#E2E8F0", opacity: 0 }, P));
      // the two patterns
      const box = (i0, i1, color, label) => {
        const g = S("g", { opacity: 0 }, P);
        const xs = s._.dots.slice(i0, i1 + 1).map((d) => +d.getAttribute("cx")), ys = s._.dots.slice(i0, i1 + 1).map((d) => +d.getAttribute("cy"));
        S("rect", { x: Math.min(...xs) - 24, y: Math.min(...ys) - 28, width: Math.max(...xs) - Math.min(...xs) + 48, height: Math.max(...ys) - Math.min(...ys) + 56, rx: 18, fill: "none", stroke: color, "stroke-width": 4 }, g);
        S("text", { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - 40, "text-anchor": "middle", "font-size": 24, "font-weight": 800, fill: color }, g, label);
        return g;
      };
      s._.r3 = box(9, 15, C.amber, "Rule 3 · trend (wear)");
      s._.r2 = box(15, 22, "#FB923C", "Rule 2 · shift");
      // the eight rules
      const L = panel(svg, 1310, 150, 520, 720, "Nelson rules");
      s._.rules = RULES.map((r, i) => {
        const g = S("g", { transform: `translate(24 ${92 + i * 76})` }, L);
        const bg = S("rect", { x: 0, y: 0, width: 472, height: 62, rx: 14, fill: "rgba(255,255,255,.04)", stroke: C.line }, g);
        S("circle", { cx: 32, cy: 31, r: 17, fill: C.teal }, g);
        S("text", { x: 32, y: 38, "text-anchor": "middle", "font-size": 19, "font-weight": 900, fill: "#052A27" }, g, String(i + 1));
        S("text", { x: 62, y: 39, "font-size": 21, "font-weight": 700, fill: C.text }, g, r);
        return { g, bg };
      });
      s._.y = y;
    },
    render(s, t) {
      const q = T(s);
      show(s._.bands, q.p(t, 1, 0.6, 0));
      const start = q.at(0) + 0.3, end = q.at(3) + 1.2;
      const n = Math.floor(clamp((t - start) / (end - start), 0, 1) * NEL.length + 1e-6);
      const pts = [];
      s._.dots.forEach((d, i) => {
        const on = i < n; show(d, on ? 1 : 0);
        const inR3 = i >= 9 && i <= 15 && t >= q.at(2), inR2 = i >= 15 && i <= 22 && t >= q.at(3);
        d.setAttribute("fill", inR2 ? "#FB923C" : inR3 ? C.amber : "#E2E8F0");
        if (on) pts.push(`${d.getAttribute("cx")},${d.getAttribute("cy")}`);
      });
      s._.path.setAttribute("points", pts.join(" "));
      show(s._.r3, q.p(t, 2, 0.5, 0.6)); show(s._.r2, q.p(t, 3, 0.5, 1.3));
      const all = q.p(t, 4, 0.6, 0.2);
      s._.rules.forEach((r, i) => {
        const hot = (i === 2 && t >= q.at(2) + 0.6) || (i === 1 && t >= q.at(3) + 1.3);
        r.bg.setAttribute("fill", hot ? "rgba(245,158,11,.22)" : `rgba(20,184,166,${(0.04 + all * 0.16).toFixed(3)})`);
        r.bg.setAttribute("stroke", hot ? C.amber : all > 0.5 ? C.teal : C.line);
      });
    },
  };

  // 5. From the alert to the closed job: supervisor, technician, LOTO, checklist, review, RCA
  const STAGES = ["Work order", "Assigned", "LOTO / permit", "Done on the phone", "Reviewed & closed", "RCA"];
  A.flow = {
    build(svg, s) {
      const x0 = 180, gap = 312;
      s._.st = STAGES.map((name, i) => {
        const g = S("g", { transform: `translate(${x0 + i * gap} 250)` }, svg);
        const bg = S("rect", { x: -135, y: 0, width: 270, height: 96, rx: 20, fill: "rgba(15,39,68,.92)", stroke: C.line, "stroke-width": 3 }, g);
        S("text", { x: 0, y: 58, "text-anchor": "middle", "font-size": 23, "font-weight": 800, fill: C.text }, g, name);
        if (i < STAGES.length - 1) S("path", { d: "M140,48 L180,48 M170,38 L182,48 L170,58", stroke: C.muted, "stroke-width": 4, fill: "none", "stroke-linecap": "round" }, g);
        return { g, bg, x: x0 + i * gap };
      });
      s._.sup = person(svg, "supervisor", { clipboard: true });
      s._.tech = person(svg, "technician", { phone: true });
      s._.eng = person(svg, "engineer", { tablet: true });
      // details under the stages
      s._.skill = S("g", { opacity: 0 }, svg);
      badge(s._.skill, 492, 400, "HYD ≥ 2  ✓", C.green, { w: 220, fs: 22 }); badge(s._.skill, 492, 466, "Certificate valid  ✓", C.green, { w: 280, fs: 20 });
      s._.lock = lock(svg, 804, 420); s._.lockOk = tick(svg, 842, 448, 16);
      s._.chk = S("g", {}, svg);
      ["Isolate & lock", "Bearing check", "Vibration 2.3 mm/s", "Parts & hours"].forEach((l, i) => {
        const g = S("g", { transform: `translate(996 ${382 + i * 54})` }, s._.chk);
        S("rect", { x: 0, y: 0, width: 240, height: 44, rx: 10, fill: "rgba(255,255,255,.06)", stroke: C.line }, g);
        S("text", { x: 46, y: 29, "font-size": 18, "font-weight": 600, fill: C.text }, g, l);
        s._[`c${i}`] = tick(g, 22, 22, 13);
      });
      s._.closed = badge(svg, 1428, 420, "Closed ✓", C.green, { w: 200 });
      s._.repeat = badge(svg, 1740, 420, "Repeat failure", C.amber, { w: 230, fs: 21 });
      s._.token = S("g", {}, svg);
      S("rect", { x: -54, y: -30, width: 108, height: 60, rx: 12, fill: C.teal, stroke: "#052A27", "stroke-width": 2 }, s._.token);
      S("text", { x: 0, y: 9, "text-anchor": "middle", "font-size": 22, "font-weight": 900, fill: "#052A27" }, s._.token, "WO");
    },
    render(s, t) {
      const q = T(s), st = s._.st;
      const stageOf = (tt) => { let k = 0; [0, 1, 2, 3, 4, 4].forEach((pk, i) => { const off = i === 5 ? 2.2 : i === 4 ? 0 : 0; if (tt >= q.at(pk) + off + 0.2) k = i; }); return k; };
      const k = stageOf(t);
      st.forEach((x, i) => { x.bg.setAttribute("stroke", i === k ? C.teal2 : i < k ? C.teal : C.line); x.bg.setAttribute("fill", i === k ? "rgba(20,184,166,.22)" : "rgba(15,39,68,.92)"); });
      // the work order token glides to the active stage
      const prevX = st[Math.max(0, k - 1)].x, curX = st[k].x;
      const since = Math.max(0, t - (k === 5 ? q.at(4) + 2.4 : q.at(Math.min(k, 4)) + 0.2));
      move(s._.token, lerp(prevX, curX, ease(since / 0.8)), 214, 1);
      // people: supervisor at work order, assigns; technician at execution; engineer at RCA
      s._.sup.set({ x: k <= 1 ? st[0].x : k === 2 ? st[2].x : st[4].x, y: 840, sc: 0.95, a: 1, bob: t * 2 });
      const techIn = q.p(t, 1, 0.6, 0.6);
      s._.tech.set({ x: k >= 3 ? st[3].x : st[1].x, y: 840, sc: 0.95, a: techIn, raise: k === 3 ? 0.6 : 0, bob: t * 2 + 1 });
      s._.eng.set({ x: st[5].x, y: 840, sc: 0.95, a: q.p(t, 4, 0.6, 2.0), bob: t * 2 + 2 });
      show(s._.skill, q.p(t, 1, 0.5, 1.2));
      const lk = q.p(t, 2, 0.4, 0.2); show(s._.lock, lk); show(s._.lockOk, q.p(t, 2, 0.4, 1.6));
      for (let i = 0; i < 4; i++) show(s._[`c${i}`], q.p(t, 3, 0.3, 0.8 + i * 0.7));
      show(s._.chk, q.p(t, 3, 0.4, 0.2));
      show(s._.closed, q.p(t, 4, 0.4, 0.8)); show(s._.repeat, q.p(t, 4, 0.4, 2.2));
    },
  };

  // 6. The week, two approvals, the KPIs
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const JOBS = [[0, 0, 2], [0, 1, 1.5], [1, 0, 3], [1, 2, 2], [2, 1, 2.5], [2, 0, 1], [3, 2, 2], [4, 0, 2], [4, 1, 3], [5, 2, 2], [6, 1, 2]];
  A.plan = {
    build(svg, s) {
      const P = panel(svg, 90, 140, 1040, 520, "Weekly maintenance schedule");
      const X0 = 160, Y0 = 110, cw = 122, rh = 120;
      DAYS.forEach((d, i) => S("text", { x: X0 + i * cw + cw / 2, y: Y0 - 18, "text-anchor": "middle", "font-size": 21, "font-weight": 700, fill: i >= 5 ? C.teal2 : C.muted }, P, d));
      ["Tech A", "Tech B", "Tech C"].forEach((n, r) => {
        S("text", { x: 30, y: Y0 + r * rh + 66, "font-size": 20, "font-weight": 700, fill: C.text }, P, n);
        for (let i = 0; i < 7; i++) S("rect", { x: X0 + i * cw + 4, y: Y0 + r * rh + 8, width: cw - 8, height: rh - 16, rx: 10, fill: "rgba(255,255,255,.03)", stroke: C.line }, P);
      });
      s._.jobs = JOBS.map(([d, r, h], i) => S("rect", { x: X0 + d * cw + 12, y: Y0 + r * rh + 20, width: cw - 24, height: 22 * h, rx: 8, fill: [C.teal, "#3B82F6", C.amber][i % 3], opacity: 0 }, P));
      s._.eng = person(svg, "engineer", { tablet: true }); s._.mgr = person(svg, "manager");
      s._.st1 = badge(svg, 1420, 260, "Engineer ✓", C.green, { w: 260 }); s._.st2 = badge(svg, 1720, 260, "Manager ✓", C.green, { w: 260 });
      s._.kpis = [["PM compliance", "96%", C.green], ["MTBF", "212 h", C.teal2], ["MTTR", "2.4 h", C.teal2], ["Backlog", "38 h", C.amber]].map(([n, v, c], i) => {
        const g = S("g", { transform: `translate(${90 + i * 265} 700)` }, svg);
        S("rect", { x: 0, y: 0, width: 245, height: 170, rx: 20, fill: "rgba(15,39,68,.92)", stroke: C.line, "stroke-width": 2 }, g);
        S("rect", { x: 0, y: 0, width: 245, height: 7, rx: 3, fill: c }, g);
        S("text", { x: 22, y: 56, "font-size": 22, "font-weight": 700, fill: C.muted }, g, n);
        S("text", { x: 22, y: 128, "font-size": 52, "font-weight": 900, fill: c }, g, v);
        return g;
      });
      s._.note = S("text", { x: 1220, y: 890, "font-size": 20, fill: C.muted }, svg, "Illustration with sample numbers");
    },
    render(s, t) {
      const q = T(s);
      s._.jobs.forEach((j, i) => show(j, q.p(t, 0, 0.35, 0.4 + i * 0.22)));
      s._.eng.set({ x: 1420, y: 620, sc: 1, a: q.p(t, 1, 0.5, 0), bob: t * 2 });
      s._.mgr.set({ x: 1720, y: 620, sc: 1, a: q.p(t, 1, 0.5, 1.2), bob: t * 2 + 1 });
      const a1 = q.p(t, 1, 0.4, 0.7), a2 = q.p(t, 1, 0.4, 2.0);
      show(s._.st1, a1); move(s._.st1, 1420, 260, 1 + 0.25 * (1 - a1));
      show(s._.st2, a2); move(s._.st2, 1720, 260, 1 + 0.25 * (1 - a2));
      s._.kpis.forEach((g, i) => { const a = q.p(t, 2, 0.5, 0.3 + i * 0.45); show(g, a); g.setAttribute("transform", `translate(${90 + i * 265} ${700 + (1 - a) * 30})`); });
      show(s._.note, q.p(t, 2, 0.5, 2.2));
    },
  };

  // 7. The loop: from the signal to the fix, and back to the plan
  const LOOP = ["Machine", "QR & readings", "Monitoring + Nelson", "Work order", "The team", "KPIs & next plan"];
  A.loop = {
    build(svg, s) {
      const cx = 960, cy = 520, R = 340;
      S("circle", { cx, cy, r: R, fill: "none", stroke: C.line, "stroke-width": 6 }, svg);
      s._.arc = S("circle", { cx, cy, r: R, fill: "none", stroke: C.teal, "stroke-width": 8, "stroke-dasharray": `0 ${2 * Math.PI * R}`, transform: `rotate(-90 ${cx} ${cy})`, "stroke-linecap": "round" }, svg);
      s._.nodes = LOOP.map((n, i) => {
        const a = (i / LOOP.length) * 2 * Math.PI - Math.PI / 2, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        const g = S("g", { transform: `translate(${x} ${y})` }, svg);
        const w = Math.max(220, n.length * 14 + 50);
        const bg = S("rect", { x: -w / 2, y: -36, width: w, height: 72, rx: 36, fill: "#0F2744", stroke: C.line, "stroke-width": 3 }, g);
        S("text", { x: 0, y: 9, "text-anchor": "middle", "font-size": 23, "font-weight": 800, fill: C.text }, g, n);
        return { g, bg };
      });
      const img = S("image", { href: s._.logo, x: cx - 60, y: cy - 120, width: 120, height: 120 }, svg);
      s._.img = img;
      s._.name = S("text", { x: cx, y: cy + 50, "text-anchor": "middle", "font-size": 50, "font-weight": 900, fill: C.text }, svg, "PlantPulse");
      s._.sub = S("text", { x: cx, y: cy + 92, "text-anchor": "middle", "font-size": 24, "font-weight": 600, fill: C.teal2 }, svg, "From the signal to the fix");
      s._.R = R;
    },
    render(s, t) {
      const q = T(s), dur = Math.max(2, s.t1 - s.t0 - 2.5);
      const p = ease((t - q.at(0)) / dur), L = 2 * Math.PI * s._.R;
      s._.arc.setAttribute("stroke-dasharray", `${(L * p).toFixed(1)} ${L.toFixed(1)}`);
      s._.nodes.forEach((n, i) => { const on = p * LOOP.length > i + 0.05; n.bg.setAttribute("stroke", on ? C.teal2 : C.line); n.bg.setAttribute("fill", on ? "#0E4A4A" : "#0F2744"); });
      const a = q.p(t, 0, 0.8, 0.2); show(s._.img, a); show(s._.name, a); show(s._.sub, q.p(t, 0, 0.8, 1.0));
    },
  };

  // ---------- the layout ----------
  window.buildAnim = function (sc, s, header) {
    header(sc, s);
    const svg = S("svg", { width: 1920, height: 1080, viewBox: "0 0 1920 1080", style: "position:absolute;inset:0" });
    sc.appendChild(svg);
    s._ = { logo: window.TL_LOGO };
    A[s.anim].build(svg, s);
    const ill = document.createElement("div");
    ill.className = "demo"; ill.style.right = "64px"; ill.style.top = "86px"; ill.innerHTML = "<b></b>Illustration";
    sc.appendChild(ill);
    const cap = document.createElement("div"); cap.className = "cap"; sc.appendChild(cap); s._.cap = cap; s._.capIdx = -2;
  };
  window.renderAnim = function (s, t) {
    A[s.anim].render(s, t);
    // caption of the sentence being spoken
    const at = s.partAt || [];
    let k = -1; at.forEach((x, i) => { if (t >= x - 0.2) k = i; });
    const text = (s.captions || [])[k] || "";
    if (k !== s._.capIdx) { s._.cap.textContent = text; s._.capIdx = k; }
    const since = k >= 0 ? t - (at[k] - 0.2) : 0;
    s._.cap.style.opacity = text ? ease(since / 0.35) : 0;
  };
})();
