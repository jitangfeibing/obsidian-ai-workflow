"use strict";
const fs = require("node:fs"), path = require("node:path");
const base = __dirname;
const wrap = (name, file) => "const " + name + " = (() => {\nconst module = {exports:{}};\n" + fs.readFileSync(path.join(base, "src", file), "utf8") + "\nreturn module.exports;\n})();\n";
let main = fs.readFileSync(path.join(base, "src/main.js"), "utf8");
main = main.replace('const Core = require("./core");', wrap("Core", "core.js"))
  .replace('const HomeCore = require("./home-core");', wrap("HomeCore", "home-core.js"))
  .replace('const buildHomePanel = require("./home-panel");', wrap("buildHomePanel", "home-panel.js"))
  .replace('const buildProjectCore = require("./project-core");', wrap("buildProjectCore", "project-core.js"))
  .replace('const buildProjectViews = require("./project-views");', wrap("buildProjectViews", "project-views.js"))
  .replace('const buildStudyCore = require("./study-core");', wrap("buildStudyCore", "study-core.js"))
  .replace('const buildStudyViews = require("./study-views");', wrap("buildStudyViews", "study-views.js"));
fs.writeFileSync(path.join(base, "plugin/main.js"), main);
console.log("Built standalone plugin/main.js");
