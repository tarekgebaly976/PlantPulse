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

function buildTimeline(def, OUT) {
  const beatsAll = JSON.parse(fs.readFileSync(path.join(OUT, "captures", "beats.json"), "utf8"));
  const dur = JSON.parse(fs.readFileSync(path.join(OUT, "audio", "durations.json"), "utf8"));
  const logo = path.join(ROOT, "..", "..", "frontend", "public", "icons", "icon.svg");
  let t = 0;
  const scenes = [], voice = [];
  for (const s0 of def.scenes) {
    const s = { ...s0 };
    delete s.capture;
    const voiceLen = dur[s.id]?.seconds ?? 0;
    let D = LEAD + voiceLen + TAIL;
    if (s.layout === "app") {
      const beats = beatsAll[s.id];
      if (!beats || !beats.length) throw new Error(`no captures for ${s.id}: run capture`);
      const minLen = 0.4 + beats.reduce((a, b) => a + MIN_BEAT[b.kind], 0);
      D = Math.max(D, minLen);
      Object.assign(s, layoutBeats(s, beats, t, D, OUT));
    }
    s.t0 = t; s.t1 = t + D;
    voice.push({ id: s.id, at: t + LEAD });
    scenes.push(s);
    t += D;
  }
  return { logo: url(logo), scenes, voice, total: t };
}

/** Times inside an app scene: beats share the scene by weight; per beat the image events, highlight, click and camera. */
function layoutBeats(s, beats, t0, D, OUT) {
  const cap = path.join(OUT, "captures");
  const vp = beats[0].vp, phone = s.device === "phone";
  const W = beats.map((b) => (b.weight || 1) * MIN_BEAT[b.kind]);
  const sum = W.reduce((a, b) => a + b, 0), avail = D - 0.3;
  const images = [], cams = [], out = [];
  let t = t0 + 0.15, lastPt = null;
  beats.forEach((b, i) => {
    const T = (avail * W[i]) / sum;
    const ob = { kind: b.kind, caption: b.caption, box: b.box, t };
    // camera: desktop zooms toward the element it talks about; the phone screen is already big enough
    let z = b.zoom ?? (b.box ? (phone ? 1 : b.kind === "view" ? 1.3 : 1.5) : 1);
    const cx = b.box ? b.box.x + b.box.w / 2 : vp.width / 2, cy = b.box ? b.box.y + b.box.h / 2 : vp.height / 2;
    cams.push({ t: i === 0 ? t0 - 1 : t, s: z, cx, cy });
    if (b.kind === "view") {
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.ringIn = b.box ? t + 0.7 : 1e9;
    } else if (b.kind === "click") {
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.click = t + Math.min(1.3, Math.max(0.8, T * 0.42));
      ob.ringIn = t + 0.25; ob.ringOut = ob.click + 0.25;
      ob.from = lastPt;
      images.push({ t: ob.click + 0.2, src: url(path.join(cap, b.imgs[1])), fade: 0.3 });
      lastPt = { x: cx, y: cy };
    } else { // type
      images.push({ t: i === 0 ? t0 : t, src: url(path.join(cap, b.imgs[0])) });
      ob.ringIn = t + 0.25; ob.ringOut = t + T - 0.45;
      const n = b.imgs.length - 1, tt = Math.min(1.6, T * 0.5);
      b.imgs.slice(1).forEach((im, j) => images.push({ t: t + 0.6 + (tt * (j + 1)) / n, src: url(path.join(cap, im)), fade: 0.08 }));
      lastPt = { x: cx, y: cy };
    }
    out.push(ob);
    t += T;
  });
  return { vp, images, cams, beats: out };
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
