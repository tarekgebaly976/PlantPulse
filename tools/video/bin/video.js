#!/usr/bin/env node
// PlantPulse video tool.
//   node tools/video/bin/video.js <video> script     write the script (narration per scene) for review
//   node tools/video/bin/video.js <video> capture    film the app (local demo) -> out/<video>/captures
//   node tools/video/bin/video.js <video> audio      voice per scene: voice/<video>/<scene>.wav if present, else TTS
//   node tools/video/bin/video.js <video> frames [t1,t2,...|auto]   key frames as PNG -> out/<video>/keyframes
//   node tools/video/bin/video.js <video> render     the MP4 -> out/<video>.mp4 and videos/index.md
//   node tools/video/bin/video.js <video> all        capture + audio + render
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const [video, cmd = "all", arg] = process.argv.slice(2);
if (!video) { console.error("usage: video.js <video> [script|capture|audio|frames|render|all]"); process.exit(2); }
// "<video>-ar" = the Arabic version: same filming steps, app shown in Arabic, Arabic screen text (videos/<video>/ar.js),
// voice from voice/<video>-ar/ (your recordings) or the Arabic TTS voice.
const LANG = /-ar$/.test(video) ? "ar" : "en";
const BASE_ID = video.replace(/-ar$/, "");
const def = LANG === "ar" ? arabic(require(path.join(ROOT, "videos", BASE_ID, "video.js"))) : require(path.join(ROOT, "videos", video, "video.js"));

function arabic(en) {
  const ar = require(path.join(ROOT, "videos", BASE_ID, "ar.js"));
  const def = { ...en, lang: "ar", file: `${en.file || en.id}-ar`, intro: ar.ui.intro, arSay: ar.say };
  def.scenes = en.scenes.map((s0) => {
    const s = { ...s0 }, u = ar.ui.scenes[s.id] || {};
    for (const k of ["title", "subtitle", "chapter", "step"]) if (u[k] !== undefined) s[k] = u[k];
    if (u.cards) s.cards = s.cards.map((c, i) => ({ ...c, ...u.cards[i] }));
    if (u.groups) s.groups = s.groups.map((g, i) => ({ ...g, ...u.groups[i] }));
    if (u.captions) s.captionsAr = u.captions;
    if (u.legend) s.legendAr = u.legend;
    return s;
  });
  return def;
}
const OUT = path.join(ROOT, "out", video);

/** The voice of each scene as parts, so every part is timed with what it describes:
 *  title: one part; cards / modules: an optional lead, then one part per card (item.say);
 *  app: one part per filmed step (the step's `say`, from captures/beats.json), the scene's `lead` first if any. */
function sceneParts(s, beats) {
  if (s.layout === "cards" || s.layout === "modules") {
    const items = s.cards || s.groups;
    const parts = s.lead ? [{ key: "lead", text: s.lead }] : [];
    items.forEach((c, k) => { if (c.say) parts.push({ key: k, text: c.say }); });
    return parts.length ? parts : [{ key: "all", text: s.narration }];
  }
  if (s.layout === "app") {
    const b = beats?.[s.id];
    if (!b) return [{ key: "all", text: s.narration || "(written with the capture)" }];
    if (s.says && s.says.length !== b.length) throw new Error(`${s.id}: ${s.says.length} sentences for ${b.length} filmed steps`);
    const say = (k) => (s.says ? s.says[k] : b[k].say);
    const parts = b.map((x, k) => (say(k) ? { key: k, text: k === 0 && s.lead ? `${s.lead} ${say(k)}` : say(k) } : null)).filter(Boolean);
    return parts.length ? parts : [{ key: "all", text: s.narration }];
  }
  return [{ key: "all", text: s.narration }];
}

function writeScript() {
  const bf = path.join(OUT, "captures", "beats.json");
  const beats = fs.existsSync(bf) ? JSON.parse(fs.readFileSync(bf, "utf8")) : null;
  const lines = [`# ${def.title}`, "", "| Scene | Shown | Narration (one line per step) |", "|---|---|---|"];
  let words = 0;
  const all = def.scenes.map((s) => {
    let parts = sceneParts(s, beats).map((p, k) => ({ ...p, id: `${s.id}~${k}` }));
    if (def.lang === "ar") {
      const a = def.arSay[s.id];
      if (!a || a.length !== parts.length) throw new Error(`${s.id}: ${a ? a.length : 0} Arabic lines for ${parts.length} parts`);
      parts = parts.map((p, k) => ({ ...p, text: a[k] }));
    }
    parts.forEach((p) => { words += p.text.split(/\s+/).length; });
    const shown = s.layout === "app" ? `App (${s.device})${s.step ? " – " + s.step : ""}` : s.layout;
    lines.push(`| ${s.id} | ${shown} | ${parts.map((p) => p.text).join("<br>")} |`);
    return { id: s.id, parts };
  });
  lines.push("", `${words} words, about ${Math.round((words / 150) * 60)} s of voice at a calm pace.`, "",
    `Own recordings: voice/${video}/<scene>.wav (e.g. voice/${video}/${def.scenes[0].id}.wav) replace the voice of that scene.`);
  fs.writeFileSync(path.join(ROOT, "videos", BASE_ID, LANG === "ar" ? "script.ar.md" : "script.md"), lines.join("\n") + "\n");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "narration.json"), JSON.stringify(all, null, 1));
  console.log(`script: videos/${video}/script.md (${words} words)`);
}

async function capture() {
  const { Capture } = require("../lib/capture");
  const pw = process.env.CMMS_DEMO_PASSWORD;
  if (!pw) throw new Error("Set CMMS_DEMO_PASSWORD (your LOCAL demo password)");
  if (process.env.VIDEO_SKIP_RESET !== "1") execFileSync(path.join(ROOT, "scripts", "reset-demo.sh"), { stdio: "inherit" });
  const cap = new Capture(path.join(OUT, "captures"), pw, LANG);
  await cap.start();
  try {
    for (const s of def.scenes) {
      if (!s.capture) continue;
      console.log("capture", s.id);
      cap.scene(s.id);
      await s.capture(cap);
      // close this scene's browsers, except one handed on to the next scene (cap.keep)
      for (const x of cap.sessions.splice(0)) { if (x === cap.keep) cap.sessions.push(x); else await x.ctx.close(); }
    }
  } finally {
    await cap.stop();
  }
}

function audio() {
  writeScript();
  const py = fs.existsSync(path.join(ROOT, ".venv", "bin", "python")) ? path.join(ROOT, ".venv", "bin", "python") : "python3";
  execFileSync(py, [path.join(ROOT, "lib", "audio.py"), video], { stdio: "inherit" });
}

async function main() {
  if (cmd === "script") return writeScript();
  if (cmd === "capture") return capture();
  if (cmd === "audio") return audio();
  const { render } = require("../lib/render");
  if (cmd === "frames") return render(def, OUT, { frames: arg || "auto" });
  if (cmd === "render") return render(def, OUT, {});
  if (cmd === "all") { await capture(); audio(); return render(def, OUT, {}); }
  throw new Error("unknown command " + cmd);
}

main().catch((e) => { console.error(e); process.exit(1); });
