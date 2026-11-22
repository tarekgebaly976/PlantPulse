// Builds the timeline (scene lengths follow the voice), draws every frame with stage.html and encodes the MP4:
// 1920x1080, 30 fps, H.264 + AAC. Also renders single key frames as PNG for review.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const FPS = 30;
const LEAD = 0.55;   // voice starts this long after a scene begins
const TAIL = 0.75;   // and the scene holds this long after the voice ends
const MIN_BEAT = { view: 2.2, click: 2.4, type: 2.6 };
const url = (p) => "file://" + p;

const GAP = 0.3;      // pause between two spoken parts
const SHORT = { view: 1.6, click: 1.9, type: 2.1 };  // a step without its own sentence

function buildTimeline(def, OUT) {
  const bf = path.join(OUT, "captures", "beats.json");
  const beatsAll = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, "utf8")) : {}; // an animated video films nothing
  const dur = JSON.parse(fs.readFileSync(path.join(OUT, "audio", "durations.json"), "utf8"));
  const logo = path.join(ROOT, "..", "..", "frontend", "public", "icons", "icon.svg");
  const scenes = [], voice = [];
  if (fs.existsSync(path.join(OUT, "audio", "00-intro.wav"))) voice.push({ id: "00-intro", at: 0 }); // intro sound
  // Same opening in every video: heartbeat line, the app icon out of the pulse, name, subtitle, the video's topic.
  const INTRO = 6.0;
  scenes.push({ id: "00-intro", layout: "intro", subtitle: def.lang === "ar" ? "إدارة الصيانة والإنتاج للمصانع" : "Maintenance management for industrial plants",
    credit: process.env.VIDEO_CREDIT ?? "BY ENG. TAREK ZEYAD ALGEBALY", pill: def.intro || def.title.replace(/^PlantPulse\s*[–-]\s*/, ""), t0: 0, t1: INTRO });
  let t = INTRO;
  for (const s0 of def.scenes) {
    const s = { ...s0 };
    delete s.capture;
    const parts = dur[s.id]?.parts ?? [];
    let D;
    if (s.layout === "app") {
      const beats = beatsAll[s.id];
      if (!beats || !beats.length) throw new Error(`no captures for ${s.id}: run capture`);
      const bb = s.captionsAr ? beats.map((b, i) => ({ ...b, caption: s.captionsAr[i] ?? b.caption })) : beats;
      Object.assign(s, layoutBeats(s, bb, t, parts, voice, OUT));
      D = s.end - t;
    } else if ((s.layout === "cards" || s.layout === "modules") && parts.length && parts[0].key !== "all") {
      // each card appears as its sentence starts
      const n = (s.cards || s.groups).length, at = new Array(n).fill(null);
      let x = t + LEAD;
      for (const p of parts) {
        if (p.key !== "lead") at[p.key] = x - 0.15;
        voice.push({ id: p.id, at: x });
        x += p.seconds + GAP;
      }
      for (let k = 0; k < n; k++) if (at[k] === null) at[k] = k ? at[k - 1] : t + 0.5;
      s.itemTimes = at;
      D = x - GAP - t + TAIL;
    } else {
      let x = t + LEAD;
      s.partAt = [];  // when each sentence starts (animated scenes act on it)
      for (const p of parts) { voice.push({ id: p.id, at: x }); s.partAt.push(x); x += p.seconds + GAP; }
      D = Math.max(x - GAP - t + TAIL, 3);
    }
    s.t0 = t; s.t1 = t + D;
    scenes.push(s);
    t += D;
  }
  return { logo: url(logo), scenes, voice, total: t, lang: def.lang || "en" };
}

/** Times inside an app scene. Each step lasts as long as its own sentence (voice starts as the step starts), so the
 *  picture always shows what is being said. With one recording for the whole scene, steps share it by weight. */
function layoutBeats(s, beats, t0, parts, voice, OUT) {
  const cap = path.join(OUT, "captures");
  const vp = beats[0].vp, phone = s.device === "phone";
  const byBeat = new Map(parts.filter((p) => typeof p.key === "number").map((p) => [p.key, p]));
  const whole = parts.find((p) => p.key === "all");
  let T;
  if (whole) {
    const W = beats.map((b) => (b.weight || 1) * MIN_BEAT[b.kind]);
    const sum = W.reduce((a, b) => a + b, 0), D = Math.max(LEAD + whole.seconds + TAIL, 0.4 + beats.reduce((a, b) => a + MIN_BEAT[b.kind], 0));
    voice.push({ id: whole.id, at: t0 + LEAD });
    T = W.map((w) => ((D - 0.3) * w) / sum);
  } else {
    T = beats.map((b, i) => { const p = byBeat.get(i); return p ? Math.max(SHORT[b.kind], 0.35 + p.seconds + GAP) : SHORT[b.kind]; });
  }
  const images = [], cams = [], out = [];
  let t = t0 + 0.15, lastPt = null;
  beats.forEach((b, i) => {
    const Ti = T[i];
    const p = byBeat.get(i);
    if (p && !whole) voice.push({ id: p.id, at: t + 0.3 });
    const ob = { kind: b.kind, caption: b.caption, box: b.box, t };
    // camera: desktop zooms toward the element it talks about; the phone screen is already big enough
    const z = b.zoom ?? (b.box ? (phone ? 1 : b.kind === "view" ? 1.3 : 1.5) : 1);
    const cx = b.box ? b.box.x + b.box.w / 2 : vp.width / 2, cy = b.box ? b.box.y + b.box.h / 2 : vp.height / 2;
    cams.push({ t: i === 0 ? t0 - 1 : t, s: z, cx, cy });
    if (b.kind === "view") {
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.ringIn = b.box ? t + 0.7 : 1e9;
    } else if (b.kind === "click") {
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.click = t + Math.min(1.2, Math.max(0.8, Ti * 0.4));
      ob.ringIn = t + 0.25; ob.ringOut = ob.click + 0.25;
      ob.from = lastPt;
      images.push({ t: ob.click + 0.2, src: url(path.join(cap, b.imgs[1])), fade: 0.3 });
      lastPt = { x: cx, y: cy };
    } else { // type
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.ringIn = t + 0.25; ob.ringOut = t + Ti - 0.45;
      const n = b.imgs.length - 1, tt = Math.min(1.6, Ti * 0.5);
      b.imgs.slice(1).forEach((im, j) => images.push({ t: t + 0.6 + (tt * (j + 1)) / n, src: url(path.join(cap, im)), fade: 0.08 }));
      lastPt = { x: cx, y: cy };
    }
    out.push(ob);
    t += Ti;
  });
  return { vp, images, cams, beats: out, end: t + 0.45 };
}

async function openStage(tl) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(url(path.join(__dirname, "stage.html")));
  await page.evaluate(async (x) => { await window.setup(x); }, tl);
  return { browser, page };
}

function mixVoice(tl, OUT) {
  const dir = path.join(OUT, "audio"), dst = path.join(OUT, "voice-track.wav");
  const args = ["-hide_banner", "-nostdin", "-y"];
  const parts = [];
  tl.voice.forEach((v, i) => {
    args.push("-i", path.join(dir, `${v.id}.wav`));
    parts.push(`[${i}:a]adelay=${Math.round(v.at * 1000)}:all=1[a${i}]`);
  });
  const n = tl.voice.length;
  const filter = `${parts.join(";")};${tl.voice.map((_, i) => `[a${i}]`).join("")}amix=inputs=${n}:normalize=0:dropout_transition=0,apad=whole_dur=${tl.total.toFixed(3)},atrim=0:${tl.total.toFixed(3)}[out]`;
  execFileSync("ffmpeg", [...args, "-filter_complex", filter, "-map", "[out]", "-ar", "48000", "-ac", "2", dst], { stdio: ["ignore", "ignore", "inherit"] });
  return dst;
}

function fmt(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, "0")}`; }

function updateIndex(def, file, seconds) {
  const idx = path.join(ROOT, "videos", "index.md");
  const head = "# PlantPulse videos\n\nRendered files are in `tools/video/out/` (not in git). Rebuild: `node tools/video/bin/video.js <video> all`.\n\n| File | Length | Covers |\n|---|---|---|\n";
  let rows = fs.existsSync(idx) ? fs.readFileSync(idx, "utf8").split("\n").filter((l) => l.startsWith("| `")) : [];
  rows = rows.filter((l) => !l.startsWith(`| \`${file}\``));
  rows.push(`| \`${file}\` | ${fmt(seconds)} | ${def.covers || def.title} |`);
  rows.sort();
  fs.writeFileSync(idx, head + rows.join("\n") + "\n");
}

async function render(def, OUT, opts) {
  const tl = buildTimeline(def, OUT);
  fs.writeFileSync(path.join(OUT, "timeline.json"), JSON.stringify(tl, null, 1));
  console.log(`timeline: ${tl.total.toFixed(1)} s, ${tl.scenes.length} scenes`);
  const { browser, page } = await openStage(tl);
  try {
    if (opts.frames) {
      const dir = path.join(OUT, "keyframes");
      fs.mkdirSync(dir, { recursive: true });
      let times;
      if (opts.frames === "auto") {
        times = (def.keyframes || []).map(([id, f]) => { const s = tl.scenes.find((x) => x.id === id); return { name: id, t: s.t0 + (s.t1 - s.t0) * f }; });
      } else times = opts.frames.split(",").map((x) => ({ name: `t${x}`, t: parseFloat(x) }));
      for (const k of times) {
        await page.evaluate((t) => window.renderAt(t), k.t);
        const f = path.join(dir, `${def.id}-${k.name}.png`);
        await page.screenshot({ path: f });
        console.log("frame", f);
      }
      return;
    }
    const voice = mixVoice(tl, OUT);
    const file = path.join(ROOT, "out", `${def.file || def.id}.mp4`);
    const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-i", voice,
      "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
      "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", "-map_metadata", "-1",
      "-metadata", `title=${def.title}`, file], { stdio: ["pipe", "inherit", "inherit"] });
    const frames = Math.ceil(Math.min(tl.total, parseFloat(process.env.VIDEO_MAX_SECONDS || "1e9")) * FPS); // short test renders
    const t0 = Date.now();
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.renderAt(t), i / FPS);
      const buf = await page.screenshot({ type: "jpeg", quality: 93 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (i % 300 === 0) console.log(`frame ${i}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    ff.stdin.end();
    await new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))));
    updateIndex(def, path.basename(file), tl.total);
    console.log("video:", file);
  } finally {
    await browser.close();
  }
}

module.exports = { render, buildTimeline };
