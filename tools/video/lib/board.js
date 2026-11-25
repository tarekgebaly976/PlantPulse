// Whiteboard animation (layout "anim", anim: "board"): line drawings and handwriting appear on a white board, drawn
// by a hand holding a marker, each item starting with its own sentence (s.partAt), as in lib/story.js.
//
//   cam:   [x, y, zoom]                    first view (board coordinates of the screen centre); the board is 1920x1080
//   items: [{ p: part, at: seconds after that sentence starts, dur, ...one of }]
//     { icon: name, x, y, s, hl }          a line drawing (ICON below), s = scale, hl = soft colour patch behind it
//     { text, x, y, size, color, anchor, weight }    handwriting, revealed left to right
//     { arrow: [x1, y1, x2, y2], bend, color }       an arrow (bend > 0 curves it)
//     { line: [x1, y1, x2, y2], color, w }  { circle: [cx, cy, rx, ry], color }  { box: [x, y, w, h], color }
//     { underline: [x1, x2, y], color }
//     { cam: [x, y, zoom], dur }            the view moves
//     { wipe: true, dur }                   everything drawn before fades away (a clean board)
"use strict";

(function () {
  const { S, ease, lerp } = window.ANIMKIT;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const A = window.ANIMS;
  const COL = { ink: "#1E293B", teal: "#0F9F8F", red: "#DC2626", amber: "#D97706", green: "#16A34A", blue: "#2563EB", grey: "#94A3B8", purple: "#7C3AED" };
  const INK = "#161616";
  const col = (c) => (c === "red" || c === "green" ? COL[c] : INK);

  // ---------- line drawings, in a 200x200 box around 0,0 ----------
  const c = (x, y, r) => `M ${x - r},${y} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`;
  const r = (x, y, w, h) => `M ${x},${y} h ${w} v ${h} h ${-w} Z`;
  const rr = (x, y, w, h, k) => `M ${x + k},${y} h ${w - 2 * k} q ${k},0 ${k},${k} v ${h - 2 * k} q 0,${k} ${-k},${k} h ${-(w - 2 * k)} q ${-k},0 ${-k},${-k} v ${-(h - 2 * k)} q 0,${-k} ${k},${-k} Z`;
  function gear(R, r0, n) {
    let d = "";
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, w = Math.PI / n;
      const pts = [[r0, a - w * 0.55], [R, a - w * 0.35], [R, a + w * 0.35], [r0, a + w * 0.55]];
      pts.forEach(([rad, an], k) => { d += `${i === 0 && k === 0 ? "M" : "L"} ${(rad * Math.cos(an)).toFixed(1)},${(rad * Math.sin(an)).toFixed(1)} `; });
    }
    return d + "Z " + c(0, 0, r0 * 0.38);
  }
  const body = "M -44,92 L -44,6 Q -44,-30 -12,-30 L 12,-30 Q 44,-30 44,6 L 44,92";
  const ICON = {
    person: [c(0, -60, 24), "M -30,-68 Q 0,-110 30,-68", "M -38,-68 L 38,-68", body, "M -14,-30 L 0,-12 L 14,-30"],
    manager: [c(0, -60, 25), "M -25,-64 Q -22,-92 2,-90 Q 24,-90 25,-64", body, "M -12,-30 L 0,-16 L 12,-30", "M 0,-16 L -8,-4 L 0,36 L 8,-4 Z"],
    team: [c(-62, -34, 18), c(0, -50, 21), c(62, -34, 18), "M -92,50 Q -92,-8 -62,-8 Q -32,-8 -32,50", "M -34,60 Q -34,-22 0,-22 Q 34,-22 34,60", "M 32,50 Q 32,-8 62,-8 Q 92,-8 92,50"],
    factory: ["M -100,82 L 100,82", "M -90,82 L -90,-8 L -52,-38 L -52,-8 L -14,-38 L -14,-8 L 24,-38 L 24,82", "M 40,82 L 40,-78 L 66,-78 L 66,82", r(-74, 18, 22, 22), r(-38, 18, 22, 22), r(-2, 18, 22, 22), "M 53,-88 q -12,-14 4,-24 q 16,-10 2,-24"],
    gear: [gear(80, 58, 10)],
    wrench: ["M -78,62 L -62,78 L 8,8 Q 40,22 62,-2 Q 82,-26 70,-56 L 48,-34 L 30,-38 L 26,-56 L 48,-78 Q 18,-90 -6,-70 Q -28,-48 -14,-14 Z"],
    phone: [rr(-46, -86, 92, 172, 14), "M -14,-72 L 14,-72", c(0, 70, 6), "M -30,-46 L 30,-46 M -30,-26 L 20,-26 M -30,-6 L 26,-6"],
    laptop: [r(-80, -66, 160, 104), "M -104,48 L 104,48 L 90,68 L -90,68 Z", "M -58,-40 L 20,-40 M -58,-18 L 50,-18 M -58,4 L 0,4"],
    clipboard: [r(-62, -70, 124, 160), r(-28, -84, 56, 26), "M -40,-30 L 40,-30 M -40,0 L 40,0 M -40,30 L 40,30 M -40,60 L 10,60"],
    calendar: [r(-76, -62, 152, 140), "M -76,-28 L 76,-28", "M -40,-76 L -40,-48 M 40,-76 L 40,-48", "M -76,6 L 76,6 M -76,40 L 76,40 M -25,-28 L -25,78 M 25,-28 L 25,78"],
    chart: ["M -84,-84 L -84,72 L 92,72", "M -70,40 L -30,8 L 8,24 L 48,-30 L 86,-62", "M 70,-66 L 86,-62 L 82,-46"],
    bulb: ["M -30,14 Q -58,-12 -48,-46 Q -34,-88 0,-88 Q 34,-88 48,-46 Q 58,-12 30,14 L 26,40 L -26,40 Z", "M -20,54 L 20,54 M -14,66 L 14,66", "M -84,-46 L -64,-46 M 84,-46 L 64,-46 M -62,-96 L -48,-82 M 62,-96 L 48,-82 M 0,-118 L 0,-100"],
    papers: [r(-56, -58, 112, 144), "M -66,-68 L -66,76 M -66,-68 L 46,-68", "M -76,-78 L -76,66 M -76,-78 L 36,-78", "M -40,-30 L 40,-30 M -40,-6 L 40,-6 M -40,18 L 40,18 M -40,42 L 10,42"],
    sheet: [r(-80, -64, 160, 128), "M -80,-32 L 80,-32 M -80,0 L 80,0 M -80,32 L 80,32 M -40,-64 L -40,64 M 0,-64 L 0,64 M 40,-64 L 40,64"],
    nosignal: ["M -60,60 L -60,30 M -26,60 L -26,6 M 8,60 L 8,-18 M 42,60 L 42,-44", "M -78,-70 L 74,74"],
    pulse: ["M -100,0 L -40,0 L -22,-48 L -2,52 L 18,-78 L 36,0 L 100,0"],
    check: ["M -44,0 L -12,32 L 48,-38"],
    cross: ["M -38,-38 L 38,38 M 38,-38 L -38,38"],
    clock: [c(0, 0, 80), "M 0,0 L 0,-52 M 0,0 L 36,18"],
    search: [c(-18, -18, 52), "M 20,20 L 78,78"],
    play: ["M -46,-74 L 64,0 L -46,74 Z"],
    shield: ["M 0,-84 L 64,-58 L 64,0 Q 64,54 0,86 Q -64,54 -64,0 L -64,-58 Z", "M -26,0 L -6,22 L 30,-24"],
    lock: [r(-52, -10, 104, 84), "M -32,-10 L -32,-42 Q -32,-76 0,-76 Q 32,-76 32,-42 L 32,-10", c(0, 26, 10), "M 0,36 L 0,52"],
    trophy: ["M -48,-76 L 48,-76 L 42,-10 Q 30,24 0,24 Q -30,24 -42,-10 Z", "M -48,-60 Q -84,-60 -78,-30 Q -72,-6 -44,-14 M 48,-60 Q 84,-60 78,-30 Q 72,-6 44,-14", "M 0,24 L 0,56 M -36,74 L 36,74 L 28,56 L -28,56 Z"],
    rocket: ["M 0,-92 Q 40,-50 36,18 L -36,18 Q -40,-50 0,-92 Z", c(0, -34, 14), "M -36,18 L -58,52 L -30,40 M 36,18 L 58,52 L 30,40", "M -14,30 Q 0,90 14,30"],
    flag: ["M -40,86 L -40,-84", "M -40,-84 L 56,-58 L -40,-30"],
    question: ["M -32,-44 Q -32,-86 2,-86 Q 38,-86 38,-48 Q 38,-18 2,-2 L 2,24", c(2, 56, 7)],
    cloud: ["M -62,42 Q -100,42 -94,6 Q -88,-26 -56,-20 Q -46,-62 0,-60 Q 46,-62 52,-20 Q 92,-26 92,10 Q 92,42 60,42 Z"],
    qr: [r(-70, -70, 140, 140), r(-56, -56, 40, 40), r(16, -56, 40, 40), r(-56, 16, 40, 40), "M 20,20 L 30,20 M 44,20 L 56,20 M 20,36 L 20,56 M 36,34 L 56,54"],
    drop: ["M 0,-84 Q 52,-12 52,24 Q 52,72 0,72 Q -52,72 -52,24 Q -52,-12 0,-84 Z"],
    globe: [c(0, 0, 80), "M -80,0 L 80,0", "M 0,-80 Q -46,0 0,80 Q 46,0 0,-80", "M -68,-40 Q 0,-26 68,-40 M -68,40 Q 0,26 68,40"],
    heart: ["M 0,70 Q -90,10 -80,-36 Q -70,-80 -26,-74 Q -6,-70 0,-46 Q 6,-70 26,-74 Q 70,-80 80,-36 Q 90,10 0,70 Z"],
    loop: ["M -60,-30 A 70,70 0 1,1 -40,50", "M -52,64 L -40,50 L -58,40"],
    star: ["M 0,-82 L 22,-26 L 82,-24 L 34,12 L 52,72 L 0,38 L -52,72 L -34,12 L -82,-24 L -22,-26 Z"],
    plant: [r(-30, 20, 60, 60), "M 0,20 L 0,-40", "M 0,-10 Q -50,-20 -50,-70 Q 0,-60 0,-10", "M 0,-30 Q 50,-40 50,-90 Q 0,-80 0,-30"],
  };

  // ---------- the hand with a marker (tip at 0,0) ----------
  function hand(parent, uid) {
    // just the marker (no hand): dark green body, black tip and grip, grey end cap; the tip is at 0,0
    const g = S("g", { opacity: 0 }, parent);
    const box = S("g", { transform: "rotate(-16)" }, g);
    box.innerHTML = MARKER_SVG.replace(/id="(\w+)"/g, `id="$1${uid}"`).replace(/url\(#(\w+)\)/g, `url(#$1${uid})`);
    return g;
  }
  const MARKER_SVG = `<defs>
    <linearGradient id="mb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E7F73"/><stop offset="0.3" stop-color="#3A4A40"/><stop offset="0.75" stop-color="#26322B"/><stop offset="1" stop-color="#151C18"/></linearGradient>
    <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A4F4C"/><stop offset="0.4" stop-color="#1E2220"/><stop offset="1" stop-color="#0C0E0D"/></linearGradient>
    <linearGradient id="mc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5E7E6"/><stop offset="0.45" stop-color="#9DA3A0"/><stop offset="1" stop-color="#4E5350"/></linearGradient>
    <filter id="ms" x="-10%" y="-60%" width="120%" height="260%"><feDropShadow dx="10" dy="16" stdDeviation="9" flood-color="#000" flood-opacity="0.22"/></filter>
  </defs>
  <g filter="url(#ms)">
    <path d="M 0,0 L 30,-9 L 30,9 Z" fill="#0A0A0A"/>
    <path d="M 28,-13 L 74,-22 L 74,22 L 28,13 Z" fill="url(#mg)"/>
    <rect x="72" y="-26" width="430" height="52" rx="18" fill="url(#mb)"/>
    <rect x="84" y="-19" width="400" height="7" rx="3.5" fill="#fff" opacity="0.18"/>
    <rect x="498" y="-27" width="46" height="54" rx="12" fill="url(#mc)"/>
    <ellipse cx="544" cy="0" rx="6" ry="24" fill="#7C827F"/>
  </g>`;

  // ---------- build ----------
  function strokes(parent, list, color, w) {
    return list.map((d) => S("path", { d, fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent));
  }
  function arrowD([x1, y1, x2, y2], bend = 0) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / L) * bend, cy = my + (dx / L) * bend;
    const a = Math.atan2(y2 - cy, x2 - cx), h = 26;
    const p = (an) => `${(x2 - h * Math.cos(a + an)).toFixed(1)},${(y2 - h * Math.sin(a + an)).toFixed(1)}`;
    return [`M ${x1},${y1} Q ${cx.toFixed(1)},${cy.toFixed(1)} ${x2},${y2}`, `M ${p(0.45)} L ${x2},${y2} L ${p(-0.45)}`];
  }
  function ellipseD([cx, cy, rx, ry]) {
    // a hand-drawn loop: a little more than one turn, slightly tilted
    let d = "";
    for (let i = 0; i <= 56; i++) {
      const a = -Math.PI * 0.6 + (i / 56) * Math.PI * 2.12, k = 1 + 0.04 * Math.sin(i * 0.5);
      d += `${i ? "L" : "M"} ${(cx + rx * k * Math.cos(a)).toFixed(1)},${(cy + ry * k * Math.sin(a) + i * 0.12).toFixed(1)} `;
    }
    return [d];
  }

  A.board = {
    build(svg, s) {
      const defs = S("defs", {}, svg);
      const uid = String(s.id).replace(/[^a-z0-9]/gi, "");
      const grad = S("radialGradient", { id: `wbv${uid}`, cx: "50%", cy: "45%", r: "75%" }, defs);
      S("stop", { offset: "60%", "stop-color": "#FFFFFF" }, grad);
      S("stop", { offset: "100%", "stop-color": "#ECEDEA" }, grad);
      S("rect", { x: 0, y: 0, width: 1920, height: 1080, fill: `url(#wbv${uid})` }, svg);
      const wob = S("filter", { id: `wbw${uid}`, x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
      S("feTurbulence", { type: "fractalNoise", baseFrequency: 0.022, numOctaves: 2, seed: 3 }, wob);
      S("feDisplacementMap", { in: "SourceGraphic", scale: 4 }, wob);
      const cam = S("g", {}, svg), board = S("g", { filter: `url(#wbw${uid})` }, cam);
      s._.cam = cam; s._.items = [];
      (s.items || []).forEach((it, i) => {
        const o = { it, el: null, paths: [], fills: [] };
        if (it.icon) {
          o.el = S("g", { transform: `translate(${it.x},${it.y}) scale(${it.s || 1})` }, board);
          if (false) o.fills.push(S("ellipse", { cx: 0, cy: 0, rx: 108, ry: 100, fill: col(it.hl), opacity: 0 }, o.el));
          o.paths = strokes(o.el, ICON[it.icon] || ICON.question, col(it.color), 5.5 / (it.s || 1));
        } else if (it.text !== undefined) {
          const size = Math.round((it.size || 56) * 0.8);  // capitals run wide
          o.el = S("g", {}, board);
          const clip = S("clipPath", { id: `wbt${uid}${i}` }, defs);
          o.clip = S("rect", { x: 0, y: it.y - size * 1.15, width: 0, height: size * 1.6 }, clip);
          o.txt = S("text", { x: it.x, y: it.y, "font-size": size, "font-family": "PPHand, PPInter, sans-serif", "font-weight": 400, "letter-spacing": 1, fill: col(it.color), "text-anchor": it.anchor || "start", "clip-path": `url(#wbt${uid}${i})` }, o.el, it.text.toUpperCase());
        } else if (it.arrow || it.line || it.circle || it.box || it.underline) {
          o.el = S("g", {}, board);
          const ds = it.arrow ? arrowD(it.arrow, it.bend) : it.line ? [`M ${it.line[0]},${it.line[1]} L ${it.line[2]},${it.line[3]}`]
            : it.circle ? ellipseD(it.circle) : it.box ? [r(...it.box)] : [`M ${it.underline[0]},${it.underline[2]} Q ${(it.underline[0] + it.underline[1]) / 2},${it.underline[2] + 8} ${it.underline[1]},${it.underline[2] - 4}`];
          o.paths = strokes(o.el, ds, col(it.color), it.w ? it.w * 0.75 : 5.5);
        }
        if (o.paths.length) {
          o.lens = o.paths.map((p) => p.getTotalLength() || 1);
          o.total = o.lens.reduce((a, b) => a + b, 0);
          o.paths.forEach((p, k) => p.setAttribute("stroke-dasharray", `${o.lens[k] + 1} ${o.lens[k] + 1}`));
        }
        s._.items.push(o);
      });
      s._.hand = hand(svg, uid);
    },
    render(s, t) {
      const at = (k) => (s.partAt && s.partAt[k] !== undefined ? s.partAt[k] : s.t0 + 0.5 + k * 3);
      // camera
      let cam = s.cam || [960, 540, 1], from = cam, camT0 = -1, camDur = 1;
      const wipes = [];
      s._.items.forEach((o) => {
        const it = o.it, t0 = at(it.p || 0) + (it.at || 0);
        o.t0 = t0;
        if (it.cam && t >= t0) { from = cam; cam = it.cam; camT0 = t0; camDur = it.dur || 1.4; }
        if (it.wipe) wipes.push([t0, it.dur || 0.6]);
      });
      let view = cam;
      if (camT0 >= 0) { const k = ease(clamp((t - camT0) / camDur)); view = [0, 1, 2].map((i) => lerp(from[i], cam[i], k)); }
      s._.cam.setAttribute("transform", `translate(960,540) scale(${view[2]}) translate(${-view[0]},${-view[1]})`);
      const toScreen = (x, y) => [960 + (x - view[0]) * view[2], 540 + (y - view[1]) * view[2]];
      // items
      let tip = null, nextStart = null, lastEnd = null;
      s._.items.forEach((o) => {
        const it = o.it;
        if (it.cam || it.wipe) return;
        let len = 0;
        if (it.text !== undefined) len = Math.max(0.6, it.text.length * 0.055);
        else if (it.icon) len = 1.3;
        else len = 0.7;
        const dur = it.dur || len, k = clamp((t - o.t0) / dur);
        // wiped?
        let op = 1;
        wipes.forEach(([w0, wd]) => { if (o.t0 < w0 && !it.keep) op = Math.min(op, 1 - clamp((t - w0) / wd)); });
        o.el.setAttribute("opacity", t < o.t0 ? 0 : op);
        if (t < o.t0) { if (nextStart === null || o.t0 < nextStart.t) nextStart = { t: o.t0, o }; return; }
        if (it.text !== undefined) {
          const w = o.txt.getComputedTextLength(), size = it.size || 56;
          const left = it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x;
          o.clip.setAttribute("x", left - 6); o.clip.setAttribute("width", w * k + 12);
          o.sx = left; o.ex = left + w; o.y = it.y - size * 0.25;
          if (k < 1) tip = toScreen(left + w * k, it.y - size * 0.25 + Math.sin(t * 28) * size * 0.12);
          else lastEnd = { t: o.t0 + dur, p: toScreen(o.ex, o.y) };
        } else if (o.paths.length) {
          let drawn = o.total * k, tp = null;
          o.paths.forEach((p, i) => {
            const L = o.lens[i], d = clamp(drawn / L);
            p.setAttribute("stroke-dashoffset", (L + 1) * (1 - d));
            if (d > 0 && d < 1 && !tp) tp = p.getPointAtLength(L * d);
            drawn -= L;
          });
          o.fills.forEach((f) => f.setAttribute("opacity", 0.22 * ease(clamp((t - o.t0 - dur) / 0.4))));
          const pt = (x, y) => {
            const sc = it.icon ? it.s || 1 : 1;
            return it.icon ? toScreen(it.x + x * sc, it.y + y * sc) : toScreen(x, y);
          };
          if (k < 1 && tp) tip = pt(tp.x, tp.y);
          if (k >= 1) { const q = o.paths[o.paths.length - 1].getPointAtLength(o.lens[o.lens.length - 1]); lastEnd = { t: o.t0 + dur, p: pt(q.x, q.y) }; }
        }
      });
      // the hand: on the tip while drawing, gliding to the next item, resting off the board otherwise
      const REST = [1700, 1500];
      let pos = REST, vis = 1;
      if (tip) pos = tip;
      else if (nextStart && nextStart.t - t < 0.7 && lastEnd && t - lastEnd.t < 1.2) {
        const o = nextStart.o, it = o.it;
        let target;
        if (it.text !== undefined) {
          const size = it.size || 56, w = o.txt.getComputedTextLength();
          target = toScreen(it.anchor === "middle" ? it.x - w / 2 : it.anchor === "end" ? it.x - w : it.x, it.y - size * 0.25);
        } else if (o.paths.length) {
          const q = o.paths[0].getPointAtLength(0), sc = it.icon ? it.s || 1 : 1;
          target = it.icon ? toScreen(it.x + q.x * sc, it.y + q.y * sc) : toScreen(q.x, q.y);
        } else target = REST;
        const k = ease(clamp(1 - (nextStart.t - t) / 0.7));
        pos = [lerp(lastEnd.p[0], target[0], k), lerp(lastEnd.p[1], target[1], k)];
      } else if (lastEnd) {
        const k = ease(clamp((t - lastEnd.t) / 0.6));
        pos = [lerp(lastEnd.p[0], REST[0], k), lerp(lastEnd.p[1], REST[1], k)];
      }
      if (!tip && !lastEnd && !nextStart) vis = 0;
      s._.hand.setAttribute("opacity", vis);
      s._.hand.setAttribute("transform", `translate(${pos[0].toFixed(1)},${pos[1].toFixed(1)})`);
    },
  };
  window.BOARD_ICONS = Object.keys(ICON);
})();
