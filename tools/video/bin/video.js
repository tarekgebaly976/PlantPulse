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

function writeScript() {
  const lines = [`# ${def.title}`, "", "| Scene | Shown | Narration |", "|---|---|---|"];
  let words = 0;
  for (const s of def.scenes) {
    words += s.narration.split(/\s+/).length;
    const shown = s.layout === "app" ? `App (${s.device})${s.step ? " – " + s.step : ""}` : s.layout;
    lines.push(`| ${s.id} | ${shown} | ${s.narration} |`);
  }
  lines.push("", `${words} words, about ${Math.round((words / 150) * 60)} s of voice at a calm pace.`, "",
    `Own recordings: voice/${video}/<scene>.wav (e.g. voice/${video}/${def.scenes[0].id}.wav) replace the TTS voice for that scene.`);
  fs.writeFileSync(path.join(ROOT, "videos", video, "script.md"), lines.join("\n") + "\n");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "narration.json"), JSON.stringify(def.scenes.map((s) => ({ id: s.id, text: s.narration })), null, 1));
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
      for (const x of cap.sessions.splice(0)) await x.ctx.close();
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
  if (cmd === "all") { writeScript(); await capture(); audio(); return render(def, OUT, {}); }
  throw new Error("unknown command " + cmd);
}

main().catch((e) => { console.error(e); process.exit(1); });
