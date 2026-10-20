"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs");
const HomeCore = require("./src/home-core"), Core = require("./src/core");
const buildHomePanel = require("./src/home-panel");
const root = "personal-system-starter", today = "2026-10-14";
class File { constructor(path, fm = {}) { this.path = path; this.fm = fm; this.basename = path.split("/").pop().replace(/\.md$/, ""); this.stat = {mtime: 1}; } }
class Element {
  constructor(tag = "div", opts = {}) { this.tag = tag; this.classes = new Set((opts.cls || "").split(/\s+/).filter(Boolean)); this.attrs = {...opts.attr}; this.children = []; this.events = {}; this.text = opts.text || ""; this.value = ""; }
  createEl(tag, opts) { const el = new Element(tag, opts); this.children.push(el); return el; }
  createDiv(opts) { return this.createEl("div", opts); }
  addClass(cls) { this.classes.add(cls); }
  setAttr(key, value) { this.attrs[key] = value; }
  setText(text) { this.text = text; this.children = []; }
  empty() { this.text = ""; this.children = []; }
  addEventListener(event, fn) { this.events[event] = fn; }
  textContent() { return this.text + this.children.map(c => c.textContent()).join(""); }
  html() { const escape = text => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); return "<" + this.tag + (this.classes.size ? ' class="' + escape([...this.classes].join(" ")) + '"' : "") + Object.entries(this.attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join("") + ">" + escape(this.text) + this.children.map(c=>c.html()).join("") + (this.tag === "img" ? "" : "</"+this.tag+">"); }
}
const find = (el, cls) => el.classes.has(cls) ? el : el.children.map(c => find(c, cls)).find(Boolean);
const files = [
  new File(root + "/项目/真实项目.md", {type: "project", status: "进行中"}),
  new File(root + "/项目/项目测试 2.md", {type: "project", status: "未整理"}),
  new File(root + "/项目/归档.md", {type: "project", archived: true}),
  new File(root + "/91_模板/项目.md", {type: "project"}),
  new File(root + "/下载/Templates/项目.md", {type: "project"}),
  new File(root + "/99_迁移记录/快照.md", {type: "project"}),
  new File(root + "/示例.md", {type: "project", is_example: true}),
  new File("其他库/项目.md", {type: "project"}),
  new File(root + "/收集/已选待转换.md", {type: "capture", 分类: "项目"}),
  new File(root + "/学习/第一章.md", {type: "learning", mastery: "未验收", next_review: today}),
  new File(root + "/学习/未排期.md", {type: "knowledge", next_review: null}),
  new File(root + "/任务/已完成.md", {type: "task", status: "Done", due: "2026-10-01"}),
  new File(root + "/任务/完成日期.md", {type: "task", completed: "2026-10-01", due: "2026-10-01"}),
  new File(root + "/任务/未完成.md", {type: "task", status: "进行中", due: today}),
  new File(root + "/任务/未来.md", {type: "task", due: "2026-10-15"})
];
async function run() {
  const records = HomeCore.collect(files, f => f.fm, root, today);
  assert.deepEqual(records.projects.map(r=>r.file.basename), ["真实项目", "项目测试 2"]);
  assert.equal(records.captures.length, 1); assert.equal(records.projects.length, 2);
  assert.equal(records.reviews.length, 1); assert.equal(records.dueTasks.length, 1);
  assert.equal(HomeCore.captureTitle("\n# 记录题目\n\n原文"), "记录题目");
  const original = "第一行 [[链接]]\n\n```js\n## 原始输入\nconsole.log('原文');\n```";
  const capture = Core.compose("# {{title}}\n\n## 原始输入\n\n模板引导\n\n## 希望讨论或处理的问题\n", {kind: "capture", title: "测试", date: today, captureText: original}, {parseYaml:()=>({}),stringifyYaml:fm=>JSON.stringify(fm)});
  assert(capture.includes(original)); assert(capture.indexOf(original) < capture.indexOf("## 希望讨论"));
  assert(capture.includes("模板引导"));
  let opened = [], created = [], draft = "先写下的草稿", fail = false, interval = null;
  global.window = {setTimeout, clearTimeout, setInterval:fn=>{interval=fn;return 1;}};
  const notices = [];
  const plugin = {
    manifest: {id: "personal-project-pages"}, settings: {root, homeDraft: draft},
    app: {vault: {getAbstractFileByPath:path=>files.find(f=>f.path===path), getMarkdownFiles:()=>files, configDir:".obsidian", adapter:{getResourcePath:p=>"../project-page-helper/plugin/assets/forest-banner.png"}, on:()=>({})}, metadataCache: {getFileCache:f=>({frontmatter:f.fm}), on:()=>({})}, workspace: {getLeaf:()=>({openFile:async f=>opened.push(f)})}},
    children:()=>[], updateHomeDraft:text=>{draft=text;}, flushHomeDraft:async()=>{},
    createCaptureText:async text=>{ if(fail)throw new Error("写入失败");created.push(text);return new File(root+"/01_收集/新记录.md"); }
  };
  const HomePanel = buildHomePanel({MarkdownRenderChild: class {constructor(el){this.containerEl=el;} registerEvent(){} registerInterval(){}}, TFile:File, Notice:class{constructor(text){notices.push(text);}}, setIcon:()=>{}, Core, HomeCore, CreatePageModal:class{open(){}}});
  const el = new Element(), panel = new HomePanel(plugin, el, root+"/00_首页.md"); panel.onload();
  assert(el.textContent().includes("真实项目")); assert(!el.textContent().includes("归档.md"));
  assert.equal(panel.textarea.value, draft); const textarea = panel.textarea;
  panel.refresh(); assert.equal(panel.textarea, textarea); assert.equal(panel.textarea.value,draft);
  panel.tabs.get("learning").events.click(); assert(el.textContent().includes("未验收")); assert(!el.textContent().includes("项目测试 2"));
  panel.tabs.get("review").events.click(); assert(el.textContent().includes("未完成")); assert(el.textContent().includes("第一章"));
  const before = files.length; await panel.open("missing.md"); assert.equal(files.length, before); assert.equal(opened.length,0); assert(notices.at(-1).includes("未找到"));
  await panel.open(files[0].path); assert.equal(opened[0], files[0]);
  fail = true; panel.textarea.value = original; await panel.saveCapture(); assert.equal(panel.textarea.value, original); assert(panel.message.textContent().includes("写入失败")); assert.equal(created.length,0);
  fail = false; await panel.saveCapture(); assert.deepEqual(created,[original]); assert.equal(panel.textarea.value, ""); assert.equal(draft, ""); assert(panel.message.textContent().includes("已存入"));
  panel.tabs.get("project").events.click();
  // Export the actual generated DOM for independent browser layout verification.
  if (process.env.HOME_RENDER_PATH) {
    const live = JSON.parse(fs.readFileSync(__dirname+"/../.home-work/records.json", "utf8"));
    files.splice(0, files.length, ...live.map(r=>new File(r.filename,r.result)));
    plugin.children = parent => files.filter(f=>Core.parentTargets(f.fm.parent).includes(parent.path.replace(/\.md$/, ""))).map(file=>({file,type:file.fm.type}));
    panel.refresh(); panel.message.empty();
    const css=fs.readFileSync(__dirname+"/plugin/styles.css", "utf8");
    fs.writeFileSync(process.env.HOME_RENDER_PATH,'<!doctype html><html><meta charset="utf-8"><title>山林首页渲染检查</title><style>body{margin:0;padding:24px;background:#f5f6f3}main{max-width:1100px;margin:auto}button,textarea{font:inherit}'+css+'</style><body><main>'+el.html()+'</main></body></html>');
  }
  panel.onunload(); if (panel.timer) clearTimeout(panel.timer);
  console.log("PASS: 首页真实类型/归档/模板/示例筛选；到期边界；三组标签；刷新保留输入；导航不创建空文件；随手记原文与写入失败保留。");
}
run().catch(error=>{console.error(error);process.exitCode=1;});
