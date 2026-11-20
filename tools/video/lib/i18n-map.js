// English UI text -> Arabic UI text, built from the app's own language files (frontend/src/lib/locales), so the capture
// steps written with English labels find the same buttons when the app is shown in Arabic.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(lang) {
  const ts = require(path.resolve(__dirname, "../../../frontend/node_modules/typescript"));
  const f = path.resolve(__dirname, "../../../frontend/src/lib/locales", `${lang}.ts`);
  const js = ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports, require: () => ({}) });
  return m.exports[lang];
}

function build(to = "ar") {
  const en = load("en"), ar = load(to), map = new Map();
  const walk = (a, b) => {
    for (const k of Object.keys(a)) {
      if (typeof a[k] === "string" && typeof b?.[k] === "string") { if (!map.has(a[k])) map.set(a[k], b[k]); }
      else if (a[k] && typeof a[k] === "object") walk(a[k], b?.[k]);
    }
  };
  walk(en, ar);
  return map;
}
module.exports = { build };
