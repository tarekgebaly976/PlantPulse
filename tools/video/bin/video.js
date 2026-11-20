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
const def = require(path.join(ROOT, "videos", video, "video.js"));
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
    const parts = sceneParts(s, beats).map((p, k) => ({ ...p, id: `${s.id}~${k}` }));
    parts.forEach((p) => { words += p.text.split(/\s+/).length; });
    const shown = s.layout === "app" ? `App (${s.device})${s.step ? " – " + s.step : ""}` : s.layout;
    lines.push(`| ${s.id} | ${shown} | ${parts.map((p) => p.text).join("<br>")} |`);
    return { id: s.id, parts };
  });
  lines.push("", `${words} words, about ${Math.round((words / 150) * 60)} s of voice at a calm pace.`, "",
    `Own recordings: voice/${video}/<scene>.wav (e.g. voice/${video}/${def.scenes[0].id}.wav) replace the voice of that scene.`);
  fs.writeFileSync(path.join(ROOT, "videos", video, "script.md"), lines.join("\n") + "\n");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "narration.json"), JSON.stringify(all, null, 1));
  console.log(`script: videos/${video}/script.md (${words} words)`);
}

async function capture() {
  const { Capture } = require("../lib/capture");
  const pw = process.env.CMMS_DEMO_PASSWORD;
  if (!pw) throw new Error("Set CMMS_DEMO_PASSWORD (your LOCAL demo password)");
  if (process.env.VIDEO_SKIP_RESET !== "1") execFileSync(path.join(ROOT, "scripts", "reset-demo.sh"), { stdio: "inherit" });
  const cap = new Capture(path.join(OUT, "captures"), pw);
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
