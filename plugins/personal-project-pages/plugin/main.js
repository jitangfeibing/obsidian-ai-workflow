"use strict";
const { Plugin, Modal, Setting, Notice, PluginSettingTab, MarkdownRenderChild, TFile, parseYaml, stringifyYaml, setIcon } = require("obsidian");
const Core = (() => {
const module = {exports:{}};
"use strict";
const FENCE = String.fromCharCode(96).repeat(3);
const KINDS = Object.freeze({
  project: { label: "项目", type: "project", status: "未开始", folder: "03_目标与项目/项目", template: "91_模板/项目.md" },
  task: { label: "任务", type: "task", status: "未整理", folder: "02_行动/任务", template: "91_模板/任务.md" },
  doc: { label: "项目文档", type: "project_doc", status: "草稿", folder: "03_目标与项目/项目文档", template: "91_模板/项目文档.md" },
  knowledge: { label: "知识", type: "knowledge", status: "草稿", folder: "04_学习/资料", template: "91_模板/知识.md" },
  life: { label: "生活", type: "life", status: "记录中", folder: "08_生活", template: "91_模板/生活.md" },
  capture: { label: "未分类", type: "capture", status: "未整理", folder: "01_收集", template: "91_模板/随手收集.md" }
});
const CATEGORIES = Object.freeze({ "任务": "task", "项目": "project", "知识": "knowledge", "生活": "life", "未分类": "capture" });
function validateRoot(value) {
  const root = String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!root || root.startsWith("/") || /[:\x00-\x1f]/.test(root)) throw new Error("请输入库内的相对目录。");
  if (root.split("/").some(p => !p || p === "." || p === ".." || p.startsWith("."))) throw new Error("根目录不能包含空目录、隐藏目录或上级路径。");
  return root;
}
function safeName(value) {
  const title = String(value || "").trim();
  if (!title || /[\r\n]/.test(title)) throw new Error("请填写单行标题。");
  let name = title.replace(/[<>:"/\\|?*#\[\]^\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 120).replace(/[. ]+$/g, "");
  if (!name || /^\.+$/.test(name)) throw new Error("标题不能作为文件名，请换一个标题。");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = "_" + name;
  return { title, name };
}
function localDate(now = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(p => [p.type, p.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function isTemplate(path) { return path.split("/").some(p => p === "91_模板" || p.toLowerCase() === "templates"); }
function effectiveType(fm = {}) {
  if (fm.type === "capture") return ({任务:"task",项目:"project",知识:"knowledge",生活:"life"})[fm.分类] || "capture";
  return fm.type || "";
}
function parentLink(path) {
  if (!path) return null;
  if (/[#\[\]|\r\n]/.test(path)) throw new Error("父页面文件名含链接特殊字符，请先调整文件名。");
  return "[[" + path.replace(/\.md$/i, "") + "]]";
}
function parentTargets(value) {
  return (Array.isArray(value) ? value : [value]).filter(v => typeof v === "string" && v.trim()).map(v => {
    const match = v.trim().match(/^\[\[([^\]]+)\]\]$/);
    return (match ? match[1] : v.trim()).split("|")[0].split("#")[0].trim();
  }).filter(Boolean);
}
function panel(mode = "project") { return FENCE + "personal-project\n" + mode + "\n" + FENCE; }
function fallbackTemplate(kind) {
  if (kind === "knowledge") return "# {{title}}\n\n## 资料与来源\n\n## 笔记\n\n## 问题与下一步\n";
  if (kind === "life") return "# {{title}}\n\n## 记录\n\n## 感受与观察\n\n## 后续行动\n";
  if (kind === "capture") return "# {{title}}\n\n## 原始输入\n\n## 希望讨论或处理的问题\n";
  if (kind === "task") return "# {{title}}\n\n## 下一步行动\n\n## 完成标准\n\n## 过程记录\n";
  if (kind === "doc") return "# {{title}}\n\n## 目的与范围\n\n## 内容\n\n## 结论与下一步\n\n## 子文档\n\n" + panel("document") + "\n";
  return "# {{title}}\n\n## 目标与当前情况\n\n## 子项\n\n" + panel() + "\n\n## 过程记录\n\n## 成果与下一步\n";
}
function compose(source, options, codec) {
  const spec = KINDS[options.kind];
  if (!spec) throw new Error("不支持的页面类型。");
  const rendered = String(source || fallbackTemplate(options.kind))
    .replace(/\{\{title\}\}/g, () => options.title)
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, () => options.date);
  const match = rendered.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let fm = {}, body = rendered;
  if (match) {
    fm = codec.parseYaml(match[1]) || {};
    if (typeof fm !== "object" || Array.isArray(fm)) throw new Error("模板的笔记属性必须是对象。");
    fm = { ...fm }; body = rendered.slice(match[0].length);
  }
  fm.type = spec.type; fm.archived = false; fm.created = options.date;
  fm.status = fm.status || spec.status; fm.parent = parentLink(options.parentPath);
  if (options.kind === "capture") fm.分类 = "未分类";
  if ("分类" in fm) fm.分类 = spec.label;
  if (options.kind === "task") {
    fm.due = null; fm.completed = null;
    if (!("priority" in fm)) fm.priority = false;
  }
  if (options.kind === "project") { fm.start = null; fm.end = null; }
  if ((options.kind === "project" || options.kind === "doc") && !("related" in fm)) fm.related = [];
  if ((options.kind === "project" || options.kind === "doc") && !body.includes(FENCE + "personal-project")) {
    body = body.trimEnd() + "\n\n## " + (options.kind === "doc" ? "子文档" : "子项") + "\n\n" + panel(options.kind === "doc" ? "document" : "project") + "\n";
  }
  if (options.kind === "capture" && typeof options.captureText === "string" && options.captureText.trim()) {
    const section = headings(body).find(h => h.level === 2 && h.text === "原始输入");
    if (section) {
      const next = headings(body).find(h => h.start > section.start && h.level <= section.level);
      const end = next ? next.start : body.length;
      body = body.slice(0, end).trimEnd() + "\n\n" + options.captureText + "\n\n" + body.slice(end);
    } else body = body.trimEnd() + "\n\n## 原始输入\n\n" + options.captureText + "\n";
  }
  return "---\n" + codec.stringifyYaml(fm).trimEnd() + "\n---\n\n" + body.trim() + "\n";
}
async function ensureFolder(vault, path) {
  let current = "";
  for (const part of path.split("/")) {
    current = current ? current + "/" + part : part;
    let found = vault.getAbstractFileByPath(current);
    if (found && !Array.isArray(found.children)) throw new Error("目录位置已有同名文件：" + current);
    if (!found) {
      try { await vault.createFolder(current); }
      catch (error) {
        found = vault.getAbstractFileByPath(current);
        if (!found || !Array.isArray(found.children)) throw error;
      }
    }
  }
}
async function createPage(options, io) {
  const root = validateRoot(options.root), spec = KINDS[options.kind];
  if (!spec) throw new Error("不支持的页面类型。");
  const named = safeName(options.title);
  if (["task", "doc"].includes(options.kind) && !options.parentPath) throw new Error("请先选择父项目。");
  if (options.parentPath) {
    const parent = io.vault.getAbstractFileByPath(options.parentPath);
    if (!parent || parent.extension !== "md" || !io.isParent(parent)) throw new Error("父页面已变化，请重新打开创建窗口。");
  }
  const template = io.vault.getAbstractFileByPath(root + "/" + spec.template);
  if (template && template.extension !== "md") throw new Error("模板路径被非 Markdown 文件占用。");
  const source = template ? await io.vault.read(template) : fallbackTemplate(options.kind);
  const content = compose(source, { ...options, title: named.title, date: options.date || localDate() }, io.codec);
  if (options.parentPath && !io.isParent(io.vault.getAbstractFileByPath(options.parentPath))) throw new Error("父页面已变化，请重新打开创建窗口。");
  const folder = root + "/" + spec.folder;
  await ensureFolder(io.vault, folder);
  for (let n = 1; n <= 100; n++) {
    if (options.parentPath && !io.isParent(io.vault.getAbstractFileByPath(options.parentPath))) throw new Error("父页面已变化，请重新打开创建窗口。");
    const path = folder + "/" + named.name + (n === 1 ? "" : " " + n) + ".md";
    if (io.vault.getAbstractFileByPath(path)) continue;
    try { return await io.vault.create(path, content); }
    catch (error) { if (!io.vault.getAbstractFileByPath(path)) throw error; }
  }
  throw new Error("同名页面过多，请换一个标题。");
}
function splitNote(source, codec) {
  const text = String(source);
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (/^\uFEFF?---\r?\n/.test(text) && !match) throw new Error("笔记属性没有结束标记，未作修改。");
  const fm = match ? (codec.parseYaml(match[1]) || {}) : {};
  if (!fm || typeof fm !== "object" || Array.isArray(fm)) throw new Error("笔记属性必须是对象，未作修改。");
  return { fm: { ...fm }, body: match ? text.slice(match[0].length) : text };
}
function classificationKind(fm = {}) {
  if (fm.archived === true || fm.is_example === true) return null;
  if (typeof fm.分类 !== "string" || !Object.prototype.hasOwnProperty.call(CATEGORIES, fm.分类)) return null;
  const kind = CATEGORIES[fm.分类];
  if (!kind) return null;
  if (fm.type === "capture") return kind === "capture" ? null : kind;
  if (typeof fm.capture_origin === "string" && fm.capture_origin && fm.type !== KINDS[kind].type) {
    if (fm.active_session_id) return null;
    return kind;
  }
  return null;
}
// Recognize headings outside fenced code, so user code never becomes a template section.
function headings(body) {
  const result = []; let fence = null, offset = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const bare = line.replace(/\r?\n$/, "");
    const mark = bare.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (mark && mark[1][0] === fence.char && mark[1].length >= fence.length && !mark[2].trim()) fence = null;
    } else if (mark) { fence = { char: mark[1][0], length: mark[1].length }; }
    else {
      const h = bare.match(/^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
      if (h) result.push({ level: h[1].length, text: h[2].trim(), start: offset, end: offset + line.length });
    }
    offset += line.length;
  }
  return result;
}
function mergeBody(original, template, title, kind) {
  let body = original;
  const existing = headings(body), names = new Set(existing.map(h => h.text));
  if (!existing.some(h => h.level === 1)) body = "# " + title + "\n\n" + body;
  const hs = headings(template);
  const sections = hs.filter(h => h.level === 2);
  for (const h of sections) {
    if (names.has(h.text)) continue;
    const next = hs.find(n => n.start > h.start && n.level <= h.level);
    const text = template.slice(h.start, next ? next.start : template.length);
    body += (body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n") + text;
    names.add(h.text);
  }
  if (kind === "project" && !body.includes(FENCE + "personal-project")) {
    const title = names.has("子项") ? "子项操作" : "子项";
    body += "\n\n## " + title + "\n\n" + panel("project") + "\n";
  }
  return body;
}
function composeConversion(source, templateSource, options, codec) {
  const spec = KINDS[options.kind];
  if (!spec || options.kind === "doc") throw new Error("不支持的分类。");
  const old = splitNote(source, codec);
  const template = splitNote(String(templateSource || fallbackTemplate(options.kind))
    .replace(/\{\{title\}\}/g, () => options.title)
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, () => options.date), codec);
  const fm = { ...template.fm, ...old.fm };
  for (const key of Object.keys(template.fm)) {
    if (fm[key] == null || fm[key] === "") fm[key] = template.fm[key];
  }
  fm.type = spec.type;
  fm.分类 = spec.label;
  fm.archived = old.fm.archived == null ? false : old.fm.archived;
  if (!fm.created || /^\{\{date:/.test(String(fm.created))) fm.created = options.date;
  if (!fm.status) fm.status = spec.status;
  if (!fm.capture_origin) fm.capture_origin = options.originPath;
  if (options.kind === "task") {
    if (!("due" in fm)) fm.due = null;
    if (!("completed" in fm)) fm.completed = null;
    if (!("priority" in fm)) fm.priority = false;
  }
  if (options.kind === "project") {
    if (!("start" in fm)) fm.start = null;
    if (!("end" in fm)) fm.end = null;
    if (!("related" in fm)) fm.related = [];
  }
  if (options.kind !== "capture" && !("parent" in fm)) fm.parent = null;
  const body = mergeBody(old.body, template.body, options.title, options.kind);
  return "---\n" + codec.stringifyYaml(fm).trimEnd() + "\n---\n" + body;
}
function occupied(vault, path, file) {
  const found = vault.getAbstractFileByPath(path);
  if (found && found !== file) return true;
  const lower = path.toLowerCase();
  return vault.getMarkdownFiles().some(f => f !== file && f.path.toLowerCase() === lower);
}
async function convertCapture(options, io) {
  const root = validateRoot(options.root), file = options.file;
  const active = () => !io.shouldContinue || io.shouldContinue();
  if (!active() || !file || file.extension !== "md" || isTemplate(file.path) || file.path.split("/").some(p => p.startsWith(".") || /^99_迁移/.test(p))) return { changed: false, file };
  if (io.vault.getAbstractFileByPath(file.path) !== file) return { changed: false, file };
  const initial = await io.vault.read(file), parsed = splitNote(initial, io.codec);
  const kind = classificationKind(parsed.fm);
  if (!kind || !active()) return { changed: false, file };
  const spec = KINDS[kind], originPath = file.path, title = file.basename;
  const date = options.date || localDate(file.stat?.ctime ? new Date(file.stat.ctime) : new Date());
  const template = io.vault.getAbstractFileByPath(root + "/" + spec.template);
  if (template && template.extension !== "md") throw new Error("模板路径被其他文件占用。");
  const templateSource = template ? await io.vault.read(template) : fallbackTemplate(kind);
  const composeOptions = { kind, title, date, originPath };
  // Validate both YAML documents before making a folder or moving the file.
  composeConversion(initial, templateSource, composeOptions, io.codec);
  const folder = root + "/" + spec.folder;
  await ensureFolder(io.vault, folder);
  if (!active() || io.vault.getAbstractFileByPath(file.path) !== file) return { changed: false, file };
  if (classificationKind(splitNote(await io.vault.read(file), io.codec).fm) !== kind) return { changed: false, file, stale: true };
  if (!file.path.startsWith(folder + "/")) {
    const name = safeName(title).name; let moved = false;
    for (let n = 1; n <= 100; n++) {
      const path = folder + "/" + name + (n === 1 ? "" : " " + n) + ".md";
      if (occupied(io.vault, path, file)) continue;
      if (!active()) return { changed: false, file };
      try { await io.rename(file, path); moved = true; break; }
      catch (error) { if (!occupied(io.vault, path, file)) throw error; }
    }
    if (!moved) throw new Error("同名文件过多，请调整标题后重试。");
  }
  const processedPath = file.path;
  let changed = false;
  // The rename can rewrite links. Always transform the latest text atomically.
  await io.vault.process(file, current => {
    if (!active() || classificationKind(splitNote(current, io.codec).fm) !== kind) return current;
    changed = true;
    return composeConversion(current, templateSource, composeOptions, io.codec);
  });
  if (!changed && active() && file.path === processedPath && file.path !== originPath && !occupied(io.vault, originPath, file)) {
    // Restore the location if the selection changed while the move was in progress.
    await io.rename(file, originPath);
  }
  return { changed, file, kind, stale: !changed };
}
module.exports = { KINDS, CATEGORIES, validateRoot, safeName, localDate, isTemplate, effectiveType, parentLink, parentTargets, panel, compose, createPage, splitNote, classificationKind, composeConversion, convertCapture };

return module.exports;
})();

const HomeCore = (() => {
const module = {exports:{}};
"use strict";
const DONE = new Set(["done", "completed", "已完成", "完成", "已取消", "cancelled", "canceled"]);
function day(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const match = typeof value === "string" && value.match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  if (!match) return "";
  const date = new Date(match[1] + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : "";
}
function visible(file, fm, root) {
  return file.path.startsWith(root + "/") && fm.archived !== true && fm.is_example !== true &&
    !file.path.split("/").some(p => p.startsWith(".") || p === "91_模板" || p.toLowerCase() === "templates" || /^99_迁移/.test(p));
}
function statusRank(value) {
  const s = String(value || "").toLowerCase();
  return /进行中|in progress|doing|active/.test(s) ? 0 : DONE.has(s) ? 2 : 1;
}
function isDone(fm) { return DONE.has(String(fm.status || "").toLowerCase()) || Boolean(fm.completed); }
function collect(files, getMeta, root, today) {
  const records = files.map(file => ({file, fm: getMeta(file) || {}})).filter(r => visible(r.file, r.fm, root));
  const recent = (a, b) => (b.file.stat?.mtime || 0) - (a.file.stat?.mtime || 0) || a.file.path.localeCompare(b.file.path, "zh-CN");
  const projects = records.filter(r => r.fm.type === "project").sort((a, b) => statusRank(a.fm.status) - statusRank(b.fm.status) || recent(a, b));
  const learning = records.filter(r => ["learning", "knowledge", "resource"].includes(r.fm.type)).sort(recent);
  const captures = records.filter(r => r.fm.type === "capture");
  const tasks = records.filter(r => r.fm.type === "task" && !isDone(r.fm));
  const dueTasks = tasks.filter(r => day(r.fm.due) && day(r.fm.due) <= today).sort((a, b) => day(a.fm.due).localeCompare(day(b.fm.due)) || recent(a, b));
  const reviews = learning.filter(r => day(r.fm.next_review) && day(r.fm.next_review) <= today).sort((a, b) => day(a.fm.next_review).localeCompare(day(b.fm.next_review)) || recent(a, b));
  return {projects, learning, captures, tasks, dueTasks, reviews};
}
function captureTitle(text) {
  return String(text).split(/\r?\n/).map(s => s.trim()).find(Boolean)?.replace(/^#{1,6}\s+/, "").slice(0, 60) || "随手记录";
}
module.exports = {day, visible, statusRank, isDone, collect, captureTitle};

return module.exports;
})();

const buildHomePanel = (() => {
const module = {exports:{}};
"use strict";
module.exports = function buildHomePanel({MarkdownRenderChild, TFile, Notice, setIcon, Core, HomeCore, CreatePageModal}) {
  return class HomePanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath) {
      super(el); this.plugin = plugin; this.sourcePath = sourcePath; this.tab = "project"; this.alive = false; this.busy = false;
    }
    onload() {
      this.alive = true;
      for (const event of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(event, () => this.queue()));
      for (const event of ["delete", "rename"]) this.registerEvent(this.plugin.app.vault.on(event, () => this.queue()));
      this.build(); this.refresh();
      this.registerInterval(window.setInterval(() => this.refresh(), 60000));
    }
    onunload() {
      this.alive = false; window.clearTimeout(this.timer);
      void this.plugin.flushHomeDraft().catch(() => new Notice("随手记草稿未能保存，请重新打开首页核对。"));
    }
    queue() {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150);
    }
    icon(el, name) { const span = el.createEl("span", {cls: "hp-icon", attr: {"aria-hidden": "true"}}); setIcon(span, name); }
    button(parent, text, cls, action, icon) {
      const button = parent.createEl("button", {cls, attr: {type: "button"}});
      if (icon) this.icon(button, icon);
      button.createEl("span", {text});
      button.addEventListener("click", action);
      return button;
    }
    path(relative) { return this.plugin.settings.root + "/" + relative; }
    async open(path, event) {
      event?.preventDefault(); event?.stopPropagation();
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) { new Notice("未找到页面，请在文件列表中确认位置：" + path); return; }
      try { await this.plugin.app.workspace.getLeaf(Boolean(event?.ctrlKey || event?.metaKey)).openFile(file); }
      catch (error) { new Notice("打开失败：" + (error.message || String(error))); }
    }
    link(parent, file, label, cls = "hp-link") {
      const link = parent.createEl("a", {text: label || file.basename, cls, attr: {href: file.path, "data-href": file.path}});
      link.addEventListener("click", event => { void this.open(file.path, event); });
      return link;
    }
    build() {
      const el = this.containerEl; el.empty(); el.addClass("pph-home");
      const cover = el.createDiv({cls: "hp-cover"});
      const asset = (this.plugin.app.vault.configDir || ".obsidian") + "/plugins/" + this.plugin.manifest.id + "/assets/forest-banner.png";
      cover.createEl("img", {attr: {src: this.plugin.app.vault.adapter.getResourcePath(asset), alt: "晨雾里的山林与湖泊", draggable: "false"}});
      const badge = cover.createDiv({cls: "hp-date"}); this.dateBadge = badge;
      this.dateMonth = badge.createDiv({cls: "hp-date-month"});
      this.dateDay = badge.createDiv({cls: "hp-date-day"});
      this.dateWeek = badge.createDiv({cls: "hp-date-week"});
      const content = el.createDiv({cls: "hp-content"});
      const heading = content.createDiv({cls: "hp-heading"});
      const title = heading.createDiv(); title.createEl("h1", {text: "Carl 的个人空间"});
      title.createEl("p", {text: "写下想法，推进项目，留下积累。"});
      const actions = heading.createDiv({cls: "hp-actions"});
      for (const [label, kind, icon] of [["新建收集", "capture", "plus"], ["新建项目", "project", "folder-plus"], ["项目文档", "doc", "file-plus"]]) {
        this.button(actions, label, "hp-action", () => new CreatePageModal(this.plugin, kind, null, false).open(), icon);
      }
      const nav = content.createEl("nav", {cls: "hp-navigation", attr: {"aria-label": "个人系统模块"}});
      const groups = [
        ["记录", [["收集箱", "01_收集/收集箱.md", "inbox"], ["生活记录", "08_生活/生活记录.md", "notebook-pen"]]],
        ["行动", [["项目", "03_目标与项目/目标与项目.md", "folder"], ["任务", "02_行动/事务执行.md", "square-check"]]],
        ["学习", [["章节学习", "04_学习/学习中心.md", "book-open"], ["知识库", "04_学习/知识库.md", "library"]]],
        ["回顾", [["回顾中心", "07_回顾/回顾中心.md", "calendar-days"], ["归档中心", "07_回顾/归档中心.md", "archive"]]]
      ];
      for (const [label, entries] of groups) {
        const section = nav.createEl("section"); section.createEl("h2", {text: label});
        for (const [text, relative, icon] of entries) this.button(section, text, "hp-nav-button", event => { void this.open(this.path(relative), event); }, icon);
      }
      const board = content.createDiv({cls: "hp-board"}); const main = board.createEl("section", {cls: "hp-overview"});
      const sectionHeading = main.createDiv({cls: "hp-section-heading"});
      this.listHeading = sectionHeading.createEl("h2");
      const tabs = sectionHeading.createDiv({cls: "hp-tabs", attr: {"aria-label": "首页速览"}}); this.tabs = new Map();
      for (const [key, label] of [["project", "项目"], ["learning", "学习"], ["review", "回顾"]]) {
        const button = this.button(tabs, label, "hp-tab", () => { this.tab = key; this.refreshList(); });
        this.tabs.set(key, button);
      }
      this.list = main.createDiv({cls: "hp-list"});
      this.more = main.createDiv({cls: "hp-more"});
      const aside = board.createEl("aside", {cls: "hp-aside"});
      const quiet = aside.createDiv({cls: "hp-mini-panel hp-today"});
      quiet.createEl("h2", {text: "今天，留一点空间"});
      quiet.createEl("p", {text: "先记下，再慢慢理清。", cls: "hp-quiet"});
      this.todayStats = quiet.createDiv({cls: "hp-today-stats"});
      const capture = aside.createDiv({cls: "hp-mini-panel"}); capture.createEl("h2", {text: "随手记"});
      this.textarea = capture.createEl("textarea", {cls: "hp-note", attr: {placeholder: "一个想法、一件小事，或者一个还没想明白的问题……", "aria-label": "随手记内容", rows: "4"}});
      this.textarea.value = typeof this.plugin.settings.homeDraft === "string" ? this.plugin.settings.homeDraft : "";
      const footer = capture.createDiv({cls: "hp-note-footer"}); this.counter = footer.createEl("span");
      this.saveButton = this.button(footer, "存入收集箱", "hp-save", () => { void this.saveCapture(); }, "arrow-right");
      this.message = capture.createDiv({cls: "hp-message", attr: {"aria-live": "polite"}});
      this.textarea.addEventListener("input", () => { this.plugin.updateHomeDraft(this.textarea.value); this.updateCounter(); });
      this.textarea.addEventListener("blur", () => { void this.plugin.flushHomeDraft().catch(() => new Notice("草稿未能保存，请保留输入内容后重试。")); });
      this.updateCounter();
      const bottom = content.createEl("nav", {cls: "hp-bottom", attr: {"aria-label": "更多模块"}});
      for (const [label, relative, icon] of [["求职", "05_求职/求职中心.md", "briefcase-business"], ["刷题", "06_刷题/刷题中心.md", "code"], ["生活", "08_生活/生活记录.md", "leaf"], ["AI 协作", "92_AI协作/AI 协作约定.md", "sparkles"], ["使用说明", "92_AI协作/首页工作台使用.md", "circle-help"]]) {
        this.button(bottom, label, "hp-bottom-link", event => { void this.open(this.path(relative), event); }, icon);
      }
    }
    refresh() {
      const now = new Date(), today = Core.localDate(now);
      const parts = today.split("-");
      this.dateMonth.setText(parts[0] + " / " + parts[1]); this.dateDay.setText(parts[2]);
      const week = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", weekday: "long"}).format(now);
      this.dateWeek.setText(week); this.dateBadge.setAttr("aria-label", today + "，" + week);
      this.records = HomeCore.collect(this.plugin.app.vault.getMarkdownFiles(), file => this.plugin.app.metadataCache.getFileCache(file)?.frontmatter, this.plugin.settings.root, today);
      this.todayStats.empty();
      const {captures, dueTasks, reviews} = this.records;
      for (const [count, label, path] of [[captures.length, "待整理", "01_收集/收集箱.md"], [dueTasks.length, "任务到期", "02_行动/事务执行.md"], [reviews.length, "待复习", "07_回顾/回顾中心.md"]]) {
        const button = this.button(this.todayStats, label, "hp-stat", event => { void this.open(this.path(path), event); });
        button.createEl("strong", {text: String(count)});
      }
      this.refreshList();
    }
    refreshList() {
      if (!this.records) return;
      this.list.empty(); this.more.empty();
      for (const [key, button] of this.tabs) button.setAttr("aria-pressed", String(key === this.tab));
      if (this.tab === "project") {
        const all = this.records.projects; this.listHeading.setText("项目速览 · " + all.length);
        for (const {file, fm} of all.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-project"});
          const heading = row.createDiv({cls: "hp-project-title"}); this.link(heading, file);
          if (fm.status) heading.createEl("span", {text: String(fm.status), cls: "hp-status"});
          const children = this.plugin.children(file).filter(c => HomeCore.visible(c.file, this.plugin.app.metadataCache.getFileCache(c.file)?.frontmatter || {}, this.plugin.settings.root));
          const docs = children.filter(c => c.type === "project_doc");
          const summary = typeof fm.next_action === "string" && fm.next_action.trim() ? fm.next_action : (docs.length ? docs.length + " 篇项目文档" : "打开项目，查看目标与下一步。");
          row.createEl("p", {text: summary, cls: "hp-quiet"});
          if (docs.length) { const links = row.createDiv({cls: "hp-docs"}); for (const doc of docs.slice(0, 2)) this.link(links, doc.file, doc.file.basename, "hp-doc"); }
        }
        if (!all.length) this.empty("还没有未归档项目。点上方“新建项目”，写下想推进的目标。");
        this.moduleLink("查看全部项目 →", "03_目标与项目/目标与项目.md");
      } else if (this.tab === "learning") {
        const all = this.records.learning; this.listHeading.setText("学习与积累 · " + all.length);
        for (const {file, fm} of all.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-resource"}); this.link(row, file);
          const tags = [fm.topic, fm.mastery, fm.status].filter(v => typeof v === "string" && v.trim());
          const due = HomeCore.day(fm.next_review); if (due) tags.push("复习 " + due);
          if (tags.length) row.createEl("p", {text: tags.join(" · "), cls: "hp-quiet"});
        }
        if (!all.length) this.empty("学习笔记和知识记录会显示在这里。");
        this.moduleLink("打开学习中心 →", "04_学习/学习中心.md");
      } else {
        this.listHeading.setText("需要回看");
        const due = [...this.records.dueTasks.map(r => ({...r, label: "任务到期 · " + HomeCore.day(r.fm.due)})), ...this.records.reviews.map(r => ({...r, label: "安排复习 · " + HomeCore.day(r.fm.next_review)}))];
        for (const {file, label} of due.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-resource"}); this.link(row, file); row.createEl("p", {text: label, cls: "hp-quiet"});
        }
        if (!due.length) this.empty("当前没有到期任务或到期复习。可以到回顾中心整理这周的收获。");
        this.moduleLink("打开回顾中心 →", "07_回顾/回顾中心.md");
      }
    }
    moduleLink(label, relative) { this.button(this.more, label, "hp-more-link", event => { void this.open(this.path(relative), event); }); }
    empty(message) { this.list.createEl("p", {text: message, cls: "hp-empty"}); }
    updateCounter() { this.counter.setText(Array.from(this.textarea.value).length + " 字"); this.saveButton.disabled = this.busy || !this.textarea.value.trim(); }
    async saveCapture() {
      if (this.busy || !this.textarea.value.trim()) return;
      const text = this.textarea.value; this.busy = true; this.textarea.disabled = true; this.updateCounter(); this.message.setText("正在存入……");
      try {
        const file = await this.plugin.createCaptureText(text);
        this.textarea.value = ""; this.plugin.updateHomeDraft("");
        this.message.empty(); this.message.createEl("span", {text: "已存入："}); this.link(this.message, file);
        void this.plugin.flushHomeDraft().catch(() => new Notice("笔记已创建；草稿清除未能保存，重开首页时请核对，避免重复提交。"));
        this.queue();
      } catch (error) { this.message.setText("未能存入，内容仍在：" + (error.message || String(error))); }
      finally { this.busy = false; this.textarea.disabled = false; this.updateCounter(); }
    }
  };
};

return module.exports;
})();

const buildProjectCore = (() => {
const module = {exports:{}};
"use strict";
module.exports = function projectCore(Core) {
  const CLOSED = new Set(["完成", "已完成", "done", "completed"]);
  const CANCELLED = new Set(["已取消", "取消", "cancelled", "canceled"]);
  const label = value => String(value || "").trim().toLowerCase();
  const done = fm => CLOSED.has(label(fm.status)) || Boolean(fm.completed || fm.completed_at);
  const cancelled = fm => CANCELLED.has(label(fm.status));
  const active = fm => ["进行中", "正在进行", "in progress", "active", "doing"].includes(label(fm.status));
  const pending = fm => !label(fm.status) || ["未整理", "未开始", "待办", "not started", "todo", "草稿"].includes(label(fm.status));
  function day(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
  }
  function inScope(file, fm, root) {
    return file.path.startsWith(root + "/") && fm.is_example !== true && !Core.isTemplate(file.path) &&
      !file.path.split("/").some(p => p.startsWith(".") || /^99_迁移/.test(p));
  }
  function makeIndex(files, meta, resolve, root) {
    const records = files.map(file => ({file, fm: meta(file) || {}})).filter(r => inScope(r.file, r.fm, root) && ["project", "project_doc", "task"].includes(r.fm.type));
    const byPath = new Map(records.map(r => [r.file.path, r])), children = new Map(), parents = new Map(), unlinked = [];
    for (const record of records) {
      const targets = Core.parentTargets(record.fm.parent), linked = [], missing = [];
      for (const target of targets) {
        const file = resolve(target, record.file.path), parent = file && byPath.get(file.path);
        if (parent && ["project", "project_doc"].includes(parent.fm.type) && parent.file.path !== record.file.path) linked.push(parent);
        else missing.push(target);
      }
      const unique = [...new Map(linked.map(r => [r.file.path, r])).values()];
      parents.set(record.file.path, unique);
      for (const parent of unique) {
        if (!children.has(parent.file.path)) children.set(parent.file.path, []);
        children.get(parent.file.path).push(record);
      }
      record.parentIssues = missing;
      if (record.fm.archived !== true && (missing.length || (!unique.length && ["task", "project_doc"].includes(record.fm.type)))) unlinked.push(record);
    }
    const sort = (a, b) => Number(active(b.fm)) - Number(active(a.fm)) || (b.file.stat?.mtime || 0) - (a.file.stat?.mtime || 0) || a.file.path.localeCompare(b.file.path, "zh-CN");
    records.sort(sort); for (const items of children.values()) items.sort(sort);
    return {records, byPath, children, parents, unlinked: unlinked.sort(sort)};
  }
  function taskStats(items) {
    const tasks = items.filter(r => r.fm.type === "task" && !cancelled(r.fm));
    return {total: tasks.length, done: tasks.filter(r => done(r.fm)).length, open: tasks.filter(r => !done(r.fm) && r.fm.archived !== true).length};
  }
  function descendants(index, file) {
    const found = [], seen = new Set([file.path]), queue = [file.path];
    while (queue.length) {
      for (const record of index.children.get(queue.shift()) || []) {
        if (seen.has(record.file.path)) continue;
        seen.add(record.file.path); found.push(record); queue.push(record.file.path);
      }
    }
    return found;
  }
  function trail(index, file) {
    const chain = [], seen = new Set([file.path]); let current = file.path, cycle = false;
    for (let depth = 0; depth < 24; depth++) {
      const parent = index.parents.get(current)?.[0]; if (!parent) return {chain: chain.reverse(), cycle};
      if (seen.has(parent.file.path)) { cycle = true; break; }
      seen.add(parent.file.path); chain.push(parent); current = parent.file.path;
      if (depth === 23) cycle = true;
    }
    return {chain: chain.reverse(), cycle};
  }
  function expected(fm) {
    return Object.fromEntries(["type", "status", "archived", "parent", "next_action", "blocker", "completed", "completed_at"].map(key => [key, fm[key] ?? null]));
  }
  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function zonedNow(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().replace("Z", "+08:00"); }
  async function checkParent(file, parentPath, options, io) {
    if (!parentPath) return;
    const queue = [{path: parentPath, trail: []}], seen = new Set(); let count = 0;
    while (queue.length) {
      const {path, trail} = queue.shift(); if (path === file.path) throw new Error("不能把页面关联到自己或自己的子页面。");
      if (trail.includes(path)) throw new Error("所选父级链路已有循环，请先修复关联。");
      if (seen.has(path)) continue; seen.add(path);
      if (++count > 200) throw new Error("父级链路过长，请先检查关联关系。");
      const parent = io.vault.getAbstractFileByPath(path);
      if (!parent || parent.extension !== "md") throw new Error("父页面已变化，请重新选择。");
      const fm = Core.splitNote(await io.vault.read(parent), io.codec).fm;
      if (!inScope(parent, fm, options.root) || !["project", "project_doc"].includes(fm.type) || (path === parentPath && fm.archived === true)) throw new Error("请选择个人系统中尚未归档的项目或项目文档。");
      for (const target of Core.parentTargets(fm.parent)) {
        const next = io.resolve(target, parent.path); if (next) queue.push({path: next.path, trail: [...trail, path]});
      }
    }
  }
  async function updateRecord(options, io) {
    const file = options.file, change = options.change, kind = change?.kind;
    if (!file || file.extension !== "md" || io.vault.getAbstractFileByPath(file.path) !== file) throw new Error("页面已变化，请重新打开。");
    if (!["status", "summary", "parent", "archive"].includes(kind)) throw new Error("不支持的修改。");
    if (kind === "parent") await checkParent(file, change.parentPath, options, io);
    return io.vault.process(file, current => {
      const parsed = Core.splitNote(current, io.codec), fm = parsed.fm;
      if (!inScope(file, fm, options.root) || !["project", "project_doc", "task"].includes(fm.type)) throw new Error("只修改个人系统里的实际项目、文档或任务。");
      if (options.expected && JSON.stringify(expected(fm)) !== JSON.stringify(options.expected)) throw new Error("属性已经变化，请重新打开窗口后再保存。");
      if (fm.active_session_id || fm.active_session_started_at) throw new Error("当前页面正在计时，请先通过计时工具暂停或结束工作段。");
      if (fm.archived === true && kind !== "archive") throw new Error("请先恢复此页，再修改其状态或关联。");
      const next = {...fm};
      if (kind === "archive") {
        if (typeof change.value !== "boolean") throw new Error("归档值必须是勾选状态。");
        next.archived = change.value;
      }
      if (kind === "summary") {
        for (const key of ["next_action", "blocker"]) {
          if (typeof change[key] !== "string" || change[key].length > 2000) throw new Error("下一步或卡点请控制在 2000 字以内。");
          next[key] = change[key].trim() || null;
        }
      }
      if (kind === "parent") {
        if (fm.type === "project_doc" && !change.parentPath) throw new Error("项目文档需要选择所属项目或父文档。");
        if (change.parentPath && io.vault.getAbstractFileByPath(change.parentPath)?.extension !== "md") throw new Error("父页面已变化，请重新选择。");
        next.parent = Core.parentLink(change.parentPath);
      }
      if (kind === "status") {
        if (typeof change.status !== "string" || !change.status.trim() || change.status.length > 80) throw new Error("请选择有效状态。");
        next.status = change.status;
        if (fm.type === "task") {
          const wasDone = done(fm), willDone = CLOSED.has(label(next.status));
          if (willDone && change.finishedNow === true) {
            const now = options.now || new Date(); next.completed = Core.localDate(now); next.completed_at = zonedNow(now);
          } else if (willDone && change.completedDate !== undefined) {
            if (change.completedDate && !validDay(change.completedDate)) throw new Error("完成日期格式不正确。");
            next.completed = change.completedDate || null;
            // An edited calendar date does not imply an exact completion time.
            if (change.completedDate !== day(fm.completed)) next.completed_at = null;
          } else if (wasDone && !willDone) { next.completed = null; next.completed_at = null; }
        }
      }
      return "---\n" + io.codec.stringifyYaml(next).trimEnd() + "\n---\n" + parsed.body;
    });
  }
  return {done, cancelled, active, pending, day, inScope, makeIndex, taskStats, descendants, trail, expected, validDay, updateRecord};
};

return module.exports;
})();

const ProjectCore = buildProjectCore(Core);
const buildProjectViews = (() => {
const module = {exports:{}};
"use strict";
module.exports = function projectViews({Modal, Setting, Notice, MarkdownRenderChild, TFile, setIcon, Core, ProjectCore, parseYaml, stringifyYaml, CreatePageModal}) {
  const codec = {parseYaml, stringifyYaml};
  function button(parent, text, fn, cls = "pw-button", icon) {
    const el = parent.createEl("button", {cls, attr: {type: "button"}});
    if (icon) { const i = el.createEl("span", {cls: "pw-icon", attr: {"aria-hidden": "true"}}); setIcon(i, icon); }
    el.createEl("span", {text}); el.addEventListener("click", fn); return el;
  }
  async function open(plugin, path, event, heading) {
    event?.preventDefault(); event?.stopPropagation();
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice("未找到页面，请检查文件列表：" + path); return; }
    try {
      if (heading) await plugin.app.workspace.openLinkText(file.path + "#" + heading, file.path, Boolean(event?.ctrlKey || event?.metaKey));
      else await plugin.app.workspace.getLeaf(Boolean(event?.ctrlKey || event?.metaKey)).openFile(file);
    } catch (error) { new Notice("打开失败：" + (error.message || String(error))); }
  }
  function link(plugin, parent, file, text, cls = "pw-link") {
    const el = parent.createEl("a", {text: text || file.basename, cls, attr: {href: file.path, "data-href": file.path}});
    el.addEventListener("click", event => { void open(plugin, file.path, event); }); return el;
  }
  function options(select, entries, value) { for (const [key, label] of entries) select.createEl("option", {text: label, attr: {value: key}}); select.value = value; }
  class RecordModal extends Modal {
    constructor(plugin, file, fm, mode) { super(plugin.app); this.plugin = plugin; this.file = file; this.fm = fm; this.mode = mode; this.busy = false; this.expected = ProjectCore.expected(fm); }
    onOpen() {
      this.contentEl.addClass("pw-modal");
      const titles = {summary: "下一步与卡点", status: "修改状态", parent: "调整所属页面", archive: this.fm.archived === true ? "恢复页面" : "归档页面"};
      this.contentEl.createEl("h2", {text: titles[this.mode]}); this.contentEl.createEl("p", {text: this.file.basename, cls: "pw-muted"});
      if (this.mode === "summary") {
        for (const [key, label, placeholder] of [["next_action", "下一步", "下一次打开这个项目时，先做哪件事？"], ["blocker", "当前卡点", "有明确卡点时再填写，可留空。"]]) {
          this.contentEl.createEl("label", {text: label}); this[key] = this.contentEl.createEl("textarea", {attr: {rows: "3", placeholder, "aria-label": label}});
          this[key].value = typeof this.fm[key] === "string" ? this.fm[key] : "";
        }
        this.contentEl.createEl("p", {text: "下一步会同步显示在首页与项目卡片；详细过程和证据继续写在正文。", cls: "pw-muted"});
      }
      if (this.mode === "status") {
        const states = this.fm.type === "task" ? ["未整理", "待办", "日程", "进行中", "正在进行", "等待", "暂停", "将来也许", "完成", "已取消"] : this.fm.type === "project" ? ["未开始", "进行中", "暂停", "完成", "已取消"] : ["草稿", "进行中", "待确认", "已定稿"];
        if (this.fm.status && !states.includes(String(this.fm.status))) states.unshift(String(this.fm.status));
        this.contentEl.createEl("label", {text: "状态"}); this.status = this.contentEl.createEl("select", {attr: {"aria-label": "状态"}}); options(this.status, states.map(s => [s, s]), String(this.fm.status || states[0]));
        if (this.fm.type === "task") {
          this.completion = this.contentEl.createDiv({cls: "pw-completion"}); this.completion.createEl("label", {text: "完成日期（不知道可留空）"});
          this.completedDate = this.completion.createEl("input", {attr: {type: "date", "aria-label": "完成日期"}}); this.completedDate.value = ProjectCore.day(this.fm.completed);
          const row = this.completion.createEl("label", {cls: "pw-check"}); this.finishedNow = row.createEl("input", {attr: {type: "checkbox"}}); row.createEl("span", {text: "记为刚刚完成，填写当前日期和时间"});
          const refresh = () => { this.completion.hidden = !ProjectCore.done({status: this.status.value}); if (this.completion.hidden) this.finishedNow.checked = false; };
          this.status.addEventListener("change", refresh); refresh();
          this.contentEl.createEl("p", {text: "历史完成记录不补造时间。改回未完成状态时，会清空当前完成日期与时间，过程正文保留。计时中的任务需先通过原计时工具暂停或结束。", cls: "pw-muted"});
        }
      }
      if (this.mode === "parent") {
        const index = this.plugin.projectIndex(), blocked = new Set([this.file.path, ...ProjectCore.descendants(index, this.file).map(r => r.file.path)]);
        const parents = index.records.filter(r => ["project", "project_doc"].includes(r.fm.type) && r.fm.archived !== true && !blocked.has(r.file.path));
        this.contentEl.createEl("label", {text: "所属项目或父文档"}); this.parentSelect = this.contentEl.createEl("select", {attr: {"aria-label": "所属项目或父文档"}});
        const current = index.parents.get(this.file.path)?.[0]?.file.path || "";
        options(this.parentSelect, [["", this.fm.type === "project_doc" ? "请选择所属页面" : "独立记录 / 暂不关联"], ...parents.map(r => [r.file.path, (r.fm.type === "project" ? "项目 · " : "文档 · ") + r.file.basename])], current);
        this.contentEl.createEl("p", {text: "保存后更新当前笔记的 parent；正文和文件位置保留。多父级记录会替换为本次选定的一个父级。", cls: "pw-muted"});
      }
      if (this.mode === "archive") this.contentEl.createEl("p", {text: this.fm.archived === true ? "恢复后按原类型与原状态重新显示。" : "归档只收起当前页面，子项保持各自状态。不会将记录标为完成；可以从项目中心的已归档筛选或归档中心恢复。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const controls = this.contentEl.createDiv({cls: "pw-actions"});
      this.save = button(controls, this.mode === "archive" ? (this.fm.archived === true ? "恢复本页" : "归档本页") : "保存", () => { void this.submit(); }, "pw-button pw-primary");
      button(controls, "取消", () => this.close());
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      let change;
      if (this.mode === "summary") change = {kind: "summary", next_action: this.next_action.value, blocker: this.blocker.value};
      if (this.mode === "status") {
        change = {kind: "status", status: this.status.value};
        if (this.fm.type === "task" && ProjectCore.done({status: change.status})) { change.completedDate = this.completedDate.value; change.finishedNow = this.finishedNow.checked; }
      }
      if (this.mode === "parent") change = {kind: "parent", parentPath: this.parentSelect.value};
      if (this.mode === "archive") change = {kind: "archive", value: this.fm.archived !== true};
      try { await this.plugin.updateProjectRecord(this.file, change, this.expected); this.close(); new Notice("已保存：" + this.file.basename); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
    }
    onClose() { this.contentEl.empty(); }
  }
  async function editRecord(plugin, file, mode) {
    try {
      const fm = Core.splitNote(await plugin.app.vault.read(file), codec).fm;
      new RecordModal(plugin, file, fm, mode).open();
    } catch (error) { new Notice("无法读取页面：" + (error.message || String(error))); }
  }
  class WorkspacePanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath, mode) { super(el); this.plugin = plugin; this.source = plugin.app.vault.getAbstractFileByPath(sourcePath); this.mode = mode; this.tab = mode === "workspace" ? "projects" : "overview"; this.filter = "all"; this.query = ""; }
    onload() {
      this.alive = true;
      for (const name of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(name, () => this.queue()));
      for (const name of ["rename", "delete"]) this.registerEvent(this.plugin.app.vault.on(name, () => this.queue()));
      this.build(); this.refresh();
    }
    onunload() { this.alive = false; window.clearTimeout(this.timer); }
    queue() { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150); }
    module(relative, event) { return open(this.plugin, this.plugin.settings.root + "/" + relative, event); }
    action(el, label, kind, file, locked, icon) { return button(el, label, () => new CreatePageModal(this.plugin, kind, file, locked).open(), "pw-button", icon); }
    build() {
      const el = this.containerEl; el.empty(); el.addClass("pph-workspace"); if (this.mode === "workspace") el.addClass("pw-center");
      this.crumbs = el.createEl("nav", {cls: "pw-breadcrumb", attr: {"aria-label": "所在位置"}});
      const header = el.createDiv({cls: "pw-header"}); const title = header.createDiv(); this.kicker = title.createDiv({cls: "pw-kicker"}); this.heading = title.createEl("h2"); this.subtitle = title.createEl("p", {cls: "pw-muted"});
      this.headActions = header.createDiv({cls: "pw-actions"});
      this.stats = el.createDiv({cls: "pw-stats"}); this.toolbar = el.createDiv({cls: "pw-toolbar"}); this.tabEl = this.toolbar.createDiv({cls: "pw-tabs"});
      if (this.mode === "workspace") {
        const filters = this.toolbar.createDiv({cls: "pw-filters"});
        this.search = filters.createEl("input", {attr: {type: "search", placeholder: "搜索项目或文档", "aria-label": "搜索项目或文档"}});
        this.search.addEventListener("input", () => { this.query = this.search.value; this.renderList(); });
        this.statusFilter = filters.createEl("select", {attr: {"aria-label": "筛选状态"}}); options(this.statusFilter, [["all", "全部状态"], ["active", "进行中"], ["pending", "待启动 / 草稿"], ["done", "已完成"], ["archived", "已归档"]], this.filter);
        this.statusFilter.addEventListener("change", () => { this.filter = this.statusFilter.value; this.renderList(); });
      }
      this.content = el.createDiv({cls: "pw-content"}); this.footer = el.createDiv({cls: "pw-footer"});
    }
    refresh() {
      this.index = this.plugin.projectIndex();
      this.crumbs.empty(); this.headActions.empty(); this.stats.empty(); this.footer.empty();
      button(this.crumbs, "首页", event => { void this.module("00_首页.md", event); }, "pw-text-button");
      if (this.mode === "workspace") {
        this.crumbs.createEl("span", {text: "/ 项目中心"}); this.kicker.setText("PROJECT WORKSPACE"); this.heading.setText("目标与项目"); this.subtitle.setText("明确下一步，把过程和成果留在同一个项目里。");
        this.action(this.headActions, "新建项目", "project", null, false, "folder-plus"); this.action(this.headActions, "项目文档", "doc", null, false, "file-plus"); this.action(this.headActions, "新建收集", "capture", null, false, "inbox");
        const live = this.index.records.filter(r => r.fm.archived !== true);
        this.stat(this.stats, "推进中的项目", live.filter(r => r.fm.type === "project" && ProjectCore.active(r.fm)).length);
        this.stat(this.stats, "未完成任务", live.filter(r => r.fm.type === "task" && !ProjectCore.done(r.fm) && !ProjectCore.cancelled(r.fm)).length);
        this.stat(this.stats, "项目文档", live.filter(r => r.fm.type === "project_doc").length);
        button(this.footer, "归档中心", event => { void this.module("07_回顾/归档中心.md", event); }, "pw-text-button", "archive");
        button(this.footer, "项目使用说明", event => { void this.module("92_AI协作/项目页面助手使用.md", event); }, "pw-text-button", "circle-help");
        const seenGoals = new Set();
        for (const entry of (this.source instanceof TFile ? this.plugin.app.metadataCache.getFileCache(this.source)?.links : null) || []) {
          const goal = this.plugin.app.metadataCache.getFirstLinkpathDest(entry.link, this.source.path);
          if (goal && this.plugin.app.metadataCache.getFileCache(goal)?.frontmatter?.type === "goal" && !seenGoals.has(goal.path)) { seenGoals.add(goal.path); link(this.plugin, this.footer, goal, goal.basename); }
        }
      } else {
        button(this.crumbs, "项目中心", event => { void this.module("03_目标与项目/目标与项目.md", event); }, "pw-text-button");
        this.current = this.source instanceof TFile && this.index.byPath.get(this.source.path);
        if (!this.current) { this.heading.setText("项目工作区"); this.subtitle.setText("此处只展示个人系统中的实际项目和项目文档。"); this.content.empty(); return; }
        const {file, fm} = this.current, trail = ProjectCore.trail(this.index, file);
        for (const parent of trail.chain) { this.crumbs.createEl("span", {text: "/"}); link(this.plugin, this.crumbs, parent.file, parent.file.basename); }
        this.kicker.setText((fm.type === "project_doc" ? "项目文档" : "项目") + " · " + String(fm.status || "未设置状态") + (fm.archived === true ? " · 已归档" : "")); this.heading.setText(file.basename);
        this.subtitle.setText(trail.cycle ? "父级链路存在循环或层级过深，请通过“所属页面”检查。" : "目标、下一步与关联记录，集中查看。");
        if (fm.archived !== true) {
          if (fm.type === "project_doc") this.action(this.headActions, "子文档", "doc", file, true, "file-plus");
          else { this.action(this.headActions, "子任务", "task", file, true, "plus"); this.action(this.headActions, "项目文档", "doc", file, true, "file-plus"); this.action(this.headActions, "子项目", "project", file, true, "folder-plus"); }
          if (fm.type === "project") button(this.headActions, "下一步", () => { void editRecord(this.plugin, file, "summary"); }, "pw-button pw-primary", "arrow-right");
        }
        this.related = ProjectCore.descendants(this.index, file); const stats = ProjectCore.taskStats(this.related);
        this.stat(this.stats, "未归档待办", stats.open); this.stat(this.stats, "关联文档", this.related.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true).length); this.stat(this.stats, "任务完成（含归档）", stats.done + " / " + stats.total);
        if (fm.archived !== true) {
          button(this.footer, "修改状态", () => { void editRecord(this.plugin, file, "status"); }, "pw-text-button");
          button(this.footer, "所属页面", () => { void editRecord(this.plugin, file, "parent"); }, "pw-text-button");
        }
        button(this.footer, fm.archived === true ? "恢复本页" : "归档本页", () => { void editRecord(this.plugin, file, "archive"); }, "pw-text-button", "archive");
      }
      this.renderTabs(); this.renderList();
    }
    stat(parent, label, value) { const item = parent.createDiv({cls: "pw-stat"}); item.createEl("span", {text: label}); item.createEl("strong", {text: String(value)}); }
    renderTabs() {
      this.tabEl.empty(); const detail = this.mode !== "workspace", related = this.related || [];
      const entries = detail ? [["overview", "概览"], ["tasks", "任务 " + related.filter(r => r.fm.type === "task" && r.fm.archived !== true).length], ["docs", "文档 " + related.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true).length], ["projects", "子项目"], ["archived", "已归档 " + related.filter(r => r.fm.archived === true).length]] : [["projects", "项目"], ["docs", "项目文档"], ["unlinked", "可关联 " + this.index.unlinked.length]];
      for (const [key, text] of entries) { const el = button(this.tabEl, text, () => { this.tab = key; this.renderTabs(); this.renderList(); }, "pw-tab"); el.setAttr("aria-pressed", String(this.tab === key)); }
    }
    renderList() {
      this.content.empty(); if (!this.index) return;
      if (this.mode !== "workspace" && !this.current) return;
      if (this.mode !== "workspace" && this.tab === "overview") { this.overview(); return; }
      let items;
      if (this.mode === "workspace") {
        items = this.tab === "unlinked" ? this.index.unlinked : this.index.records.filter(r => r.fm.type === (this.tab === "docs" ? "project_doc" : "project"));
        items = items.filter(r => this.filter === "archived" ? r.fm.archived === true : r.fm.archived !== true);
        if (this.filter === "active") items = items.filter(r => ProjectCore.active(r.fm));
        if (this.filter === "pending") items = items.filter(r => ProjectCore.pending(r.fm));
        if (this.filter === "done") items = items.filter(r => ProjectCore.done(r.fm));
        const q = this.query.trim().toLocaleLowerCase(); if (q) items = items.filter(r => (r.file.basename + " " + String(r.fm.next_action || "")).toLocaleLowerCase().includes(q));
        this.content.createEl("p", {text: this.tab === "unlinked" ? "独立任务可以保持现状；需要归入项目时，选择“关联”。无效父链接也会列在这里供检查。" : "显示 " + items.length + " 条 · 状态沿用原笔记", cls: "pw-caption"});
      } else items = this.related.filter(r => this.tab === "archived" ? r.fm.archived === true : r.fm.archived !== true && r.fm.type === ({tasks: "task", docs: "project_doc", projects: "project"})[this.tab]);
      if (!items.length) { this.content.createEl("p", {text: this.tab === "unlinked" ? "当前没有需要补关联的任务或文档。" : this.tab === "tasks" ? "当前没有未归档任务。已有完成记录可在“已归档”查看；需要新行动时用上方“子任务”创建。" : "当前没有符合筛选的记录。", cls: "pw-empty"}); return; }
      const cards = this.content.createDiv({cls: this.mode === "workspace" && this.tab === "projects" ? "pw-card-grid" : "pw-record-list"});
      for (const record of items) this.card(cards, record);
    }
    card(parent, record) {
      const {file, fm} = record, card = parent.createEl("article", {cls: "pw-card"});
      const heading = card.createDiv({cls: "pw-card-heading"}); link(this.plugin, heading, file); heading.createEl("span", {text: String(fm.status || "未设置状态"), cls: "pw-badge"});
      const parents = this.index.parents.get(file.path) || [], meta = card.createDiv({cls: "pw-card-meta"}); meta.createEl("span", {text: ({project: "项目", project_doc: "项目文档", task: "任务"})[fm.type] + (fm.archived === true ? " · 已归档" : "")});
      for (const p of parents) link(this.plugin, meta, p.file, "所属：" + p.file.basename);
      if (record.parentIssues?.length) meta.createEl("span", {text: "父链接待检查"});
      if (fm.type === "project") {
        const all = ProjectCore.descendants(this.index, file), stats = ProjectCore.taskStats(all), docs = all.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true);
        card.createEl("p", {text: typeof fm.next_action === "string" && fm.next_action ? fm.next_action : "打开项目，查看目标与下一步。", cls: "pw-card-summary"});
        const info = card.createDiv({cls: "pw-card-info"}); info.createEl("span", {text: stats.total ? "关联任务 " + stats.done + "/" + stats.total + "（含归档）" : "暂无关联任务"}); info.createEl("span", {text: "文档 " + docs.length});
        if (stats.total) { const bar = card.createEl("progress", {attr: {max: String(stats.total), value: String(stats.done), "aria-label": "关联任务完成数量，含归档"}}); bar.setAttr("title", "按关联任务状态计算，不代表整个项目验收。"); }
        if (docs.length) { const links = card.createDiv({cls: "pw-doc-chips"}); for (const doc of docs.slice(0, 2)) link(this.plugin, links, doc.file, doc.file.basename, "pw-doc-chip"); }
      } else if (fm.type === "task") {
        const details = [fm.priority === true ? "优先" : "", fm.due ? "截止 " + String(fm.due).slice(0, 10) : "", ProjectCore.done(fm) ? (fm.completed || fm.completed_at ? "完成 " + String(fm.completed || fm.completed_at).slice(0, 10) : "完成日期未记录") : ""].filter(Boolean);
        if (details.length) card.createEl("p", {text: details.join(" · "), cls: "pw-caption"});
      }
      const actions = card.createDiv({cls: "pw-row-actions"});
      if (fm.archived !== true) {
        button(actions, "状态", () => { void editRecord(this.plugin, file, "status"); }, "pw-text-button");
        button(actions, "关联", () => { void editRecord(this.plugin, file, "parent"); }, "pw-text-button");
      }
      button(actions, fm.archived === true ? "恢复" : "归档", () => { void editRecord(this.plugin, file, "archive"); }, "pw-text-button");
    }
    overview() {
      const {file, fm} = this.current; const grid = this.content.createDiv({cls: "pw-overview-grid"});
      const next = grid.createDiv({cls: "pw-note-card pw-next"}); next.createEl("h3", {text: "下一步"});
      next.createEl("p", {text: typeof fm.next_action === "string" && fm.next_action ? fm.next_action : (fm.type === "project_doc" ? "在正文写清目的、内容与结论；需要更细的记录时创建子文档。" : "填写一个下次能直接开始的行动，首页和项目卡片会一起显示。")});
      if (fm.type === "project" && fm.archived !== true) button(next, fm.next_action ? "调整下一步" : "填写下一步", () => { void editRecord(this.plugin, file, "summary"); }, "pw-text-button");
      const blocker = grid.createDiv({cls: "pw-note-card"}); blocker.createEl("h3", {text: "当前卡点"}); blocker.createEl("p", {text: typeof fm.blocker === "string" && fm.blocker ? fm.blocker : "尚未填写卡点摘要。具体问题和处理证据保留在正文与项目文档里。"});
      const nav = this.content.createDiv({cls: "pw-body-nav"}); nav.createEl("h3", {text: "正文与验收"});
      const headings = (this.plugin.app.metadataCache.getFileCache(file)?.headings || []).filter(h => h.level <= 2 && !["子项", "子文档", "项目子项"].includes(h.heading)).slice(0, 9);
      for (const h of headings) button(nav, h.heading, event => { void open(this.plugin, file.path, event, h.heading); }, "pw-anchor");
      if (!headings.length) nav.createEl("p", {text: "继续在下方正文记录目标、完成标准、过程与实际成果。", cls: "pw-muted"});
      this.content.createEl("p", {text: "关联项包含下层项目和文档。任务完成数按任务记录计算，项目是否验收通过仍以实际成果与标准为准。", cls: "pw-caption"});
      if (this.current.parentIssues?.length) this.content.createEl("p", {text: "此页有无法解析的父链接，可通过下方“所属页面”调整。", cls: "pw-caption"});
    }
  }
  return {WorkspacePanel, RecordModal, editRecord};
};

return module.exports;
})();

const buildStudyCore = (() => {
const module = {exports:{}};
"use strict";
module.exports = function studyCore(Core) {
  const TYPES = new Set(["learning", "knowledge", "resource"]);
  const HINTS = ["未说明", "无提示", "轻提示", "步骤提示", "AI 完整示例"];
  function day(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) value = value.toISOString().slice(0, 10);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const d = new Date(value + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : "";
  }
  function inScope(file, fm, root) {
    return file.path.startsWith(root + "/04_学习/") && TYPES.has(fm.type) && fm.is_example !== true &&
      !Core.isTemplate(file.path) && !file.path.split("/").some(p => p.startsWith(".") || /^99_迁移/.test(p));
  }
  function hasValue(value) { return value != null && value !== ""; }
  function group(fm, today) {
    if (!hasValue(fm.next_review)) return "unscheduled";
    const date = day(fm.next_review); return !date ? "invalid" : date <= today ? "due" : "planned";
  }
  function sources(fm) {
    const values = [fm.source_url, ...(Array.isArray(fm.source_urls) ? fm.source_urls : [fm.source_urls])];
    return [...new Set(values.filter(v => typeof v === "string" && /^https?:\/\//i.test(v)))];
  }
  function collect(files, meta, root, today) {
    return files.map(file => ({file, fm: meta(file) || {}})).filter(r => inScope(r.file, r.fm, root))
      .map(r => ({...r, reviewGroup: group(r.fm, today), sources: sources(r.fm)}))
      .sort((a, b) => (a.reviewGroup === "due" && b.reviewGroup === "due" ? day(a.fm.next_review).localeCompare(day(b.fm.next_review)) : 0) ||
        (b.file.stat?.mtime || 0) - (a.file.stat?.mtime || 0) || a.file.path.localeCompare(b.file.path, "zh-CN"));
  }
  function pending(fm) { return fm.type === "learning" && (!fm.mastery || fm.mastery === "未验收"); }
  function select(records, {tab = "all", query = "", topic = ""} = {}) {
    const q = query.trim().toLocaleLowerCase();
    return records.filter(r => (tab === "archived" ? r.fm.archived === true : r.fm.archived !== true))
      .filter(r => !topic || String(r.fm.topic || "") === topic)
      .filter(r => !q || [r.file.basename, r.fm.topic, ...r.sources].join(" ").toLocaleLowerCase().includes(q))
      .filter(r => tab === "all" || tab === "archived" || (tab === "chapters" ? r.fm.type === "learning" : tab === "pending" ? pending(r.fm) : r.reviewGroup === tab));
  }
  async function create(options, io) {
    const root = Core.validateRoot(options.root), kind = options.kind;
    if (!["learning", "knowledge"].includes(kind)) throw new Error("请选择章节或知识笔记。");
    const named = Core.safeName(options.title), topic = String(options.topic || "").trim();
    if (kind === "learning" && !topic) throw new Error("请填写学习主题，如 Agent 或 FastAPI。");
    if (topic && (Core.safeName(topic).name !== topic || ["91_模板", "templates"].includes(topic.toLowerCase()) || topic.startsWith(".") || /^99_迁移/.test(topic))) throw new Error("主题请使用单个目录名，不含斜杠或文件名特殊字符。");
    const url = String(options.source || "").trim();
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error("来源请填写完整的 http 或 https 链接，或留空。");
    const templatePath = root + "/91_模板/" + (kind === "learning" ? "章节学习" : "知识") + ".md";
    const template = io.vault.getAbstractFileByPath(templatePath);
    if (template && template.extension !== "md") throw new Error("模板路径被其他文件占用。");
    const fallback = kind === "knowledge" ? "# {{title}}\n\n## 资料与来源\n\n## 笔记\n\n## 问题与下一步\n" : "# {{title}}\n\n## 资料范围\n\n## 原始回答与实践\n\n## 验收记录\n\n## 复习问题\n\n## 笔记\n\n## 待解决问题与下一步\n";
    const source = template ? await io.vault.read(template) : fallback;
    const date = Core.localDate(options.now || new Date());
    const parsed = Core.splitNote(source.replace(/\{\{title\}\}/g, () => named.title).replace(/\{\{date:YYYY-MM-DD\}\}/g, () => date), io.codec);
    const fm = {...parsed.fm, type: kind, archived: false, created: date, topic: topic || null};
    fm.status = fm.status || (kind === "learning" ? "学习中" : "草稿");
    fm.last_review = null; fm.next_review = null;
    if (kind === "learning") fm.mastery = "未验收";
    if (url) fm.source_urls = [...new Set([...(Array.isArray(fm.source_urls) ? fm.source_urls : []), url])];
    const body = parsed.body.includes("```personal-study") ? parsed.body : "\n```personal-study\nnote\n```\n\n" + parsed.body.replace(/^\n+/, "");
    const content = "---\n" + io.codec.stringifyYaml(fm).trimEnd() + "\n---\n" + body;
    const folder = root + "/04_学习/" + (kind === "learning" ? topic : "资料"), path = folder + "/" + named.name + ".md";
    const duplicate = () => io.vault.getMarkdownFiles().find(f => f.path.toLowerCase() === path.toLowerCase());
    const existing = duplicate();
    if (existing) throw new Error("已有同名笔记，请打开它继续：" + existing.path);
    let current = "";
    for (const part of folder.split("/")) {
      current = current ? current + "/" + part : part;
      const found = io.vault.getAbstractFileByPath(current);
      if (found && !Array.isArray(found.children)) throw new Error("目录位置已有文件：" + current);
      if (!found) { try { await io.vault.createFolder(current); } catch (error) { if (!Array.isArray(io.vault.getAbstractFileByPath(current)?.children)) throw error; } }
    }
    if (duplicate()) throw new Error("同名笔记刚刚已创建，请从列表打开。");
    return io.vault.create(path, content);
  }
  async function update(options, io) {
    const {file, change} = options, kind = change?.kind, today = Core.localDate(options.now || new Date());
    if (!file || file.extension !== "md" || io.vault.getAbstractFileByPath(file.path) !== file) throw new Error("笔记已变化，请重新打开。");
    if (!["schedule", "review", "archive"].includes(kind)) throw new Error("不支持的操作。");
    return io.vault.process(file, current => {
      if (typeof options.expectedSource !== "string" || current !== options.expectedSource) throw new Error("笔记已有新修改，请重新打开窗口再保存。输入仍保留在本窗口。");
      const parsed = Core.splitNote(current, io.codec), fm = parsed.fm, next = {...fm}; let body = parsed.body;
      if (!inScope(file, fm, options.root)) throw new Error("只修改学习目录里的实际知识、资料或章节。");
      if (fm.active_session_id || fm.active_session_started_at) throw new Error("请先通过计时工具暂停或结束当前工作段。");
      if (fm.archived === true && kind !== "archive") throw new Error("请先恢复笔记，再安排或记录复习。");
      if (kind === "archive") {
        if (typeof change.value !== "boolean") throw new Error("归档值必须是布尔值。");
        next.archived = change.value;
      } else {
        if (typeof change.next !== "string" || (change.next && !day(change.next))) throw new Error("下次复习日期无效，请选择真实日期或留空。");
        next.next_review = change.next || null;
        if (kind === "review") {
          if (!day(change.date) || change.date > today) throw new Error("实际复习日期必须为今天或过去的有效日期。");
          for (const key of ["question", "answer"]) if (typeof change[key] !== "string" || !change[key].trim()) throw new Error("请留下复习问题和实际回答、代码或运行结果。");
          if (!HINTS.includes(change.hint)) throw new Error("请选择提示程度。");
          if (typeof change.feedback !== "string" || [change.question, change.answer, change.feedback].some(v => v.length > 50000)) throw new Error("单项记录请控制在 50000 字以内。");
          if (hasValue(fm.last_review) && !day(fm.last_review)) throw new Error("原 last_review 日期无效，请先核对属性，避免覆盖历史记录。");
          next.last_review = day(fm.last_review) > change.date ? fm.last_review : change.date;
          body += (body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n") +
            "## 复习记录 · " + change.date + "\n\n记录来源：用户填写。提示程度：" + change.hint + "。\n\n" +
            "### 问题或实践\n\n" + change.question + "\n\n### 原始回答、代码或结果\n\n" + change.answer + "\n" +
            (change.feedback.trim() ? "\n### 反馈与待解决问题\n\n" + change.feedback + "\n" : "");
        }
      }
      // Scheduling and evidence capture never imply mastery or task completion.
      return "---\n" + io.codec.stringifyYaml(next).trimEnd() + "\n---\n" + body;
    });
  }
  return {TYPES, HINTS, day, group, inScope, pending, sources, collect, select, create, update};
};

return module.exports;
})();

const StudyCore = buildStudyCore(Core);
const buildStudyViews = (() => {
const module = {exports:{}};
"use strict";
module.exports = function studyViews({Modal, Notice, MarkdownRenderChild, TFile, Core, StudyCore, parseYaml, stringifyYaml}) {
  const codec = {parseYaml, stringifyYaml};
  function button(el, text, action, primary = false) {
    const b = el.createEl("button", {text, cls: "pw-button" + (primary ? " pw-primary" : "")});
    b.addEventListener("click", action); return b;
  }
  function field(el, label, tag = "input", value = "", placeholder = "") {
    const wrap = el.createEl("label", {cls: "ps-field"}); wrap.createEl("span", {text: label});
    const input = wrap.createEl(tag, {attr: {"aria-label": label, placeholder}}); input.value = value; return input;
  }
  function choices(el, items, value) {
    for (const [key, text] of items) el.createEl("option", {text, attr: {value: key}});
    el.value = value;
  }
  function open(plugin, file, event) {
    const path = typeof file === "string" ? file : file.path;
    if (!plugin.app.vault.getAbstractFileByPath(path)) { new Notice("文件不存在，请检查当前位置。"); return; }
    void plugin.app.workspace.openLinkText(path, "", Boolean(event?.ctrlKey || event?.metaKey));
  }
  class CreateStudyModal extends Modal {
    constructor(plugin, kind = "learning") { super(plugin.app); this.plugin = plugin; this.kind = kind; }
    onOpen() {
      this.containerEl.addClass("ps-modal"); this.containerEl.addClass("pw-modal"); this.contentEl.createEl("h2", {text: this.kind === "learning" ? "新建学习章节" : "新建知识笔记"});
      this.title = field(this.contentEl, "标题", "input", "", this.kind === "learning" ? "例如：第二章 Agent 工具调用" : "例如：MCP 与工具调用的关系");
      this.topic = field(this.contentEl, this.kind === "learning" ? "学习主题" : "主题（可选）", "input", "", "例如：Agent 或 FastAPI");
      this.source = field(this.contentEl, "资料链接（可选）", "input", "", "https://…");
      this.contentEl.createEl("p", {cls: "pw-muted", text: this.kind === "learning" ? "保存到学习目录下的主题文件夹，沿用章节学习模板。章号由你填写，创建后从未验收开始。" : "保存到学习目录下的「资料」，沿用当前知识模板。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const actions = this.contentEl.createDiv({cls: "pw-actions"});
      this.save = button(actions, "创建并打开", () => { void this.submit(); }, true); button(actions, "取消", () => this.close());
      this.title.focus();
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      let file;
      try { file = await this.plugin.createStudy({kind: this.kind, title: this.title.value, topic: this.topic.value, source: this.source.value}); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
      if (file) { this.close(); open(this.plugin, file); new Notice("已创建：" + file.basename); }
    }
    onClose() { this.contentEl.empty(); }
  }
  class ReviewModal extends Modal {
    constructor(plugin, file, source, kind) { super(plugin.app); this.plugin = plugin; this.file = file; this.source = source; this.kind = kind; this.fm = Core.splitNote(source, codec).fm; }
    onOpen() {
      this.containerEl.addClass("ps-modal"); this.containerEl.addClass("pw-modal"); this.contentEl.createEl("h2", {text: this.kind === "schedule" ? "安排复习" : this.kind === "review" ? "记录本次复习" : this.fm.archived === true ? "恢复笔记" : "归档笔记"});
      this.contentEl.createEl("p", {text: this.file.basename, cls: "pw-muted"});
      if (this.kind === "review") {
        this.date = field(this.contentEl, "实际复习日期", "input", Core.localDate()); this.date.type = "date"; this.date.max = Core.localDate();
        this.question = field(this.contentEl, "问题或实践", "textarea", "", "这次尝试解释或验证什么？");
        this.answer = field(this.contentEl, "实际回答、代码或结果", "textarea", "", "保留实际输出；没有运行代码时，不填写已经运行。");
        this.hint = field(this.contentEl, "提示程度", "select"); choices(this.hint, StudyCore.HINTS.map(s => [s, s]), "未说明");
        this.feedback = field(this.contentEl, "反馈与待解决问题（可选）", "textarea");
      }
      if (this.kind !== "archive") {
        this.next = field(this.contentEl, "下次复习日期（可选）", "input", this.kind === "schedule" ? StudyCore.day(this.fm.next_review) : ""); this.next.type = "date";
        this.contentEl.createEl("p", {text: this.kind === "schedule" ? "这里只调整计划。留空可取消安排；上次实际复习日和掌握程度保持。" : "保存后将原文追加到本笔记，并更新实际复习日。下次日期留空会清除旧安排；掌握程度保持，待依据证据验收。", cls: "pw-muted"});
        if (this.fm.next_review && !StudyCore.day(this.fm.next_review)) this.contentEl.createEl("p", {text: "原复习日期格式无效，请重新选择。", cls: "pph-error"});
      } else this.contentEl.createEl("p", {text: this.fm.archived === true ? "按原类型与原状态恢复显示，原文与复习记录保留。" : "归档后从当前列表收起，可在「已归档」中恢复。学习状态和掌握程度保持。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const actions = this.contentEl.createDiv({cls: "pw-actions"}); this.save = button(actions, "保存", () => { void this.submit(); }, true); button(actions, "取消", () => this.close());
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      const change = this.kind === "archive" ? {kind: "archive", value: this.fm.archived !== true} : {kind: this.kind, next: this.next.value};
      if (this.kind === "review") Object.assign(change, {date: this.date.value, question: this.question.value, answer: this.answer.value, hint: this.hint.value, feedback: this.feedback.value});
      try { await this.plugin.updateStudy(this.file, change, this.source); this.close(); new Notice("已保存：" + this.file.basename); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
    }
    onClose() { this.contentEl.empty(); }
  }
  async function edit(plugin, file, kind) {
    try { new ReviewModal(plugin, file, await plugin.app.vault.read(file), kind).open(); }
    catch (error) { new Notice("无法打开笔记：" + (error.message || String(error))); }
  }
  class StudyPanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath, mode) {
      super(el); this.plugin = plugin; this.file = plugin.app.vault.getAbstractFileByPath(sourcePath); this.mode = mode;
      this.tab = mode === "center" ? "chapters" : "all"; this.query = ""; this.topic = ""; this.limit = 40;
    }
    onload() {
      this.alive = true;
      for (const name of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(name, () => this.queue()));
      for (const name of ["rename", "delete"]) this.registerEvent(this.plugin.app.vault.on(name, () => this.queue()));
      this.registerInterval(window.setInterval(() => { if (this.alive) this.refresh(); }, 60000));
      this.build(); this.refresh();
    }
    onunload() { this.alive = false; window.clearTimeout(this.timer); }
    queue() { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150); }
    build() {
      this.containerEl.empty(); this.containerEl.addClass("pph-workspace"); this.containerEl.addClass("ps-workspace");
      const header = this.containerEl.createDiv({cls: "pw-header"}); const title = header.createDiv();
      title.createDiv({text: "学习 · 实践 · 复习", cls: "pw-kicker"}); this.heading = title.createEl("h2"); this.sub = title.createEl("p", {cls: "pw-muted"}); this.actions = header.createDiv({cls: "pw-actions"});
      this.stats = this.containerEl.createDiv({cls: "pw-stats"}); this.stats.hidden = this.mode === "note";
      if (this.mode !== "note") {
        button(this.actions, "新建章节", () => new CreateStudyModal(this.plugin, "learning").open(), true);
        button(this.actions, "新建知识", () => new CreateStudyModal(this.plugin, "knowledge").open());
        const toolbar = this.containerEl.createDiv({cls: "ps-toolbar"}); this.tabs = toolbar.createDiv({cls: "pw-tabs"});
        const filters = toolbar.createDiv({cls: "pw-filters"}); this.search = filters.createEl("input", {attr: {type: "search", "aria-label": "搜索标题、主题、来源", placeholder: "搜索标题、主题、来源"}});
        this.search.addEventListener("input", () => { this.query = this.search.value; this.limit = 40; this.renderItems(); });
        this.topics = filters.createEl("select", {attr: {"aria-label": "主题筛选"}}); this.topics.addEventListener("change", () => { this.topic = this.topics.value; this.limit = 40; this.renderItems(); });
      }
      this.body = this.containerEl.createDiv({cls: "ps-body"});
    }
    refresh() {
      if (!this.alive) return;
      this.today = Core.localDate(); this.records = this.plugin.studyRecords(this.today);
      this.stats.empty();
      if (this.mode === "note") { this.renderNote(); return; }
      this.heading.setText(this.mode === "center" ? "学习中心" : "知识库");
      this.sub.setText("先留下理解与实践，再根据证据验收。复习按已填写的日期显示。");
      const live = this.records.filter(r => r.fm.archived !== true);
      for (const [value, name] of [[live.filter(r => r.fm.type === "learning").length, "学习章节"], [live.filter(r => StudyCore.pending(r.fm)).length, "待验收"], [live.filter(r => r.reviewGroup === "due").length, "到期复习"], [live.filter(r => r.reviewGroup === "unscheduled").length, "未安排复习"]]) {
        const stat = this.stats.createDiv({cls: "pw-stat"}); stat.createEl("strong", {text: String(value)}); stat.createEl("span", {text: name});
      }
      const values = [...new Set(this.records.map(r => String(r.fm.topic || "")).filter(Boolean))].sort((a,b) => a.localeCompare(b,"zh-CN"));
      if (JSON.stringify(values) !== this.topicKey) {
        this.topicKey = JSON.stringify(values); this.topics.empty(); choices(this.topics, [["", "全部主题"], ...values.map(s => [s, s])], values.includes(this.topic) ? this.topic : ""); this.topic = this.topics.value;
      }
      this.renderItems();
    }
    renderItems() {
      this.tabs.empty(); this.body.empty();
      for (const [key, label] of [["all", "全部"], ["chapters", "章节"], ["pending", "待验收"], ["due", "到期复习"], ["planned", "已安排"], ["unscheduled", "未安排"], ["invalid", "日期异常"], ["archived", "已归档"]]) {
        const b = button(this.tabs, label, () => { this.tab = key; this.limit = 40; this.renderItems(); }); b.setAttr("aria-pressed", String(this.tab === key)); if (this.tab === key) b.addClass("is-active");
      }
      const items = StudyCore.select(this.records, {tab: this.tab, query: this.query, topic: this.topic});
      this.body.createEl("p", {text: "当前筛选 · " + items.length + " 条", cls: "pw-muted"});
      if (!items.length) this.body.createDiv({cls: "pw-empty", text: this.tab === "due" ? "目前没有到期复习。可在笔记卡片中安排日期，未安排的内容保留在「未安排」。" : this.tab === "pending" ? "当前没有符合筛选的待验收章节。掌握结论仍需查看实际回答与实践。" : "当前没有符合筛选的记录，可以切换分类或清空搜索。"});
      const grid = this.body.createDiv({cls: "pw-grid ps-grid"});
      for (const r of items.slice(0, this.limit)) {
        const card = grid.createEl("article", {cls: "pw-card ps-card"}); const top = card.createDiv({cls: "ps-card-top"});
        top.createEl("span", {text: ({learning:"章节", knowledge:"知识", resource:"资料"})[r.fm.type], cls: "pw-badge"});
        top.createEl("span", {text: String(r.fm.topic || "未填主题"), cls: "pw-muted"});
        const link = card.createEl("a", {text: r.file.basename, cls: "ps-title internal-link", attr: {href: r.file.path, "data-href": r.file.path}});
        link.addEventListener("click", e => {e.preventDefault(); open(this.plugin, r.file, e);});
        card.createEl("p", {text: "掌握：" + String(r.fm.mastery || "未记录") + " · 状态：" + String(r.fm.status || "未记录"), cls: "pw-muted"});
        card.createEl("p", {text: "复习：" + (r.reviewGroup === "invalid" ? "日期异常，请核对属性" : StudyCore.day(r.fm.next_review) || "尚未安排") + " · 上次：" + (StudyCore.day(r.fm.last_review) || "未记录"), cls: "ps-review-date"});
        if (r.sources.length) { const a = card.createEl("a", {text: "查看来源 ↗", attr: {href: r.sources[0], target:"_blank", rel:"noopener noreferrer"}, cls: "ps-source"}); a.setAttr("aria-label", "查看来源：" + r.file.basename); }
        const actions = card.createDiv({cls: "pw-actions"});
        if (r.fm.archived !== true) { button(actions, "安排复习", () => {void edit(this.plugin,r.file,"schedule");}); button(actions, "记录复习", () => {void edit(this.plugin,r.file,"review");}); }
        button(actions, r.fm.archived === true ? "恢复" : "归档", () => {void edit(this.plugin,r.file,"archive");});
      }
      if (items.length > this.limit) button(this.body, "再显示 40 条", () => {this.limit += 40;this.renderItems();});
    }
    renderNote() {
      this.actions.empty(); this.body.empty(); const file = this.file;
      if (!(file instanceof TFile) || this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) { this.heading.setText("笔记已变化"); return; }
      const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (!StudyCore.inScope(file, fm, this.plugin.settings.root)) { this.heading.setText("学习笔记入口"); this.sub.setText("此入口在实际章节、知识与资料笔记中显示。"); return; }
      this.heading.setText(file.basename); this.sub.setText(String(fm.topic || "未填主题") + " · 掌握程度：" + String(fm.mastery || "未记录") + (fm.archived === true ? " · 已归档" : ""));
      button(this.actions, "学习中心", () => open(this.plugin, this.plugin.settings.root + "/04_学习/学习中心.md"));
      if (fm.archived !== true) { button(this.actions, "安排复习", () => {void edit(this.plugin,file,"schedule");}); button(this.actions,"记录复习",()=>{void edit(this.plugin,file,"review");},true); }
      button(this.actions, fm.archived === true ? "恢复" : "归档",()=>{void edit(this.plugin,file,"archive");});
      this.body.createEl("p", {text: "上次实际复习：" + (StudyCore.day(fm.last_review) || "未记录") + "　下次计划：" + (StudyCore.day(fm.next_review) || (fm.next_review ? "日期异常" : "未安排")), cls: "ps-review-date"});
      const nav = this.body.createDiv({cls:"pw-actions"});
      const hs = this.plugin.app.metadataCache.getFileCache(file)?.headings || [];
      for (const h of hs.filter(h => /资料|来源|原始|实践|验收|Recall|复习|Notes|笔记|Summary|总结|下一步/i.test(h.heading)).slice(0,10)) button(nav,h.heading.replace(/\*/g,""),()=>{void this.plugin.app.workspace.openLinkText(file.path + "#" + h.heading,file.path,false);});
      this.body.createEl("p", {text:"正文保留来源、原始回答、代码与验收依据；安排日期和记录复习均不会自动提升掌握程度。", cls:"pw-muted"});
    }
  }
  return {StudyPanel, CreateStudyModal, ReviewModal};
};

return module.exports;
})();

class CreatePageModal extends Modal {
  constructor(plugin, kind, parent, locked) {
    super(plugin.app); this.plugin = plugin; this.kind = kind;
    this.parentPath = parent ? parent.path : ""; this.locked = locked; this.title = ""; this.busy = false;
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: "新建" + Core.KINDS[this.kind].label });
    new Setting(this.contentEl).setName("标题").addText(text => {
      this.titleInput = text.inputEl;
      text.setPlaceholder("填写页面标题").onChange(value => { this.title = value; });
      text.inputEl.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void this.submit(); } });
    });
    if (["capture", "project", "task", "doc"].includes(this.kind)) new Setting(this.contentEl).setName(this.locked ? "所属页面（自动关联）" : this.kind === "capture" ? "关联项目（可选）" : "父项目").addDropdown(drop => {
      drop.addOption("", this.kind === "project" ? "独立项目" : this.kind === "capture" ? "暂不关联" : "请选择父项目");
      const parents = this.plugin.parentFiles();
      if (this.parentPath && !parents.some(f => f.path === this.parentPath)) {
        const file = this.app.vault.getAbstractFileByPath(this.parentPath);
        if (file instanceof TFile) drop.addOption(file.path, file.basename);
      }
      for (const file of parents) drop.addOption(file.path, file.basename + " · " + (file.parent?.path || "库根目录"));
      drop.setValue(this.parentPath).onChange(value => { this.parentPath = value; });
      drop.setDisabled(Boolean(this.locked));
    });
    this.errorEl = this.contentEl.createDiv({ cls: "pph-error" });
    new Setting(this.contentEl)
      .addButton(button => { this.submitButton = button; button.setButtonText("创建并打开").setCta().onClick(() => { void this.submit(); }); })
      .addButton(button => button.setButtonText("取消").onClick(() => this.close()));
    window.setTimeout(() => this.titleInput && this.titleInput.focus(), 30);
  }
  async submit() {
    if (this.busy) return;
    this.busy = true; this.errorEl.setText(""); this.submitButton.setDisabled(true);
    let file = null;
    try { file = await this.plugin.create(this.kind, this.title, this.parentPath); }
    catch (error) { this.errorEl.setText(error.message || String(error)); }
    finally { this.busy = false; this.submitButton.setDisabled(false); }
    if (file) {
      this.close();
      try { await this.app.workspace.getLeaf(true).openFile(file); new Notice("已创建：" + file.basename); }
      catch { new Notice("页面已创建；请从文件列表打开：" + file.path); }
    }
  }
  onClose() { this.contentEl.empty(); }
}
const HomePanel = buildHomePanel({MarkdownRenderChild, TFile, Notice, setIcon, Core, HomeCore, CreatePageModal});
const ProjectViews = buildProjectViews({Modal, Setting, Notice, MarkdownRenderChild, TFile, setIcon, Core, ProjectCore, parseYaml, stringifyYaml, CreatePageModal});
const StudyViews = buildStudyViews({Modal, Notice, MarkdownRenderChild, TFile, Core, StudyCore, parseYaml, stringifyYaml});
class CapturePanel extends MarkdownRenderChild {
  constructor(plugin, el) { super(el); this.plugin=plugin; }
  onload() {
    const refresh=()=>this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed",refresh));
    this.registerEvent(this.plugin.app.vault.on("rename",refresh));
    this.registerEvent(this.plugin.app.vault.on("delete",refresh));
    this.render();
  }
  render() {
    const el=this.containerEl;el.empty();el.addClass("pph-panel");
    const controls=el.createDiv({cls:"pph-controls"});
    controls.createEl("button",{text:"新建收集"}).addEventListener("click",()=>new CreatePageModal(this.plugin,"capture",null,false).open());
    controls.createEl("button",{text:"处理已分类记录"}).addEventListener("click",()=>{
      const count=this.plugin.scanCaptures(true);new Notice(count?"已安排处理 "+count+" 条收集记录。":"没有等待转换的记录。");
    });
    el.createEl("p",{text:"选择去向后补模板并移动同一篇笔记；转换成功后才退出收集箱。",cls:"pph-muted"});
    for(const file of this.plugin.app.vault.getMarkdownFiles()) {
      const fm=this.plugin.app.metadataCache.getFileCache(file)?.frontmatter||{};
      if(!file.path.startsWith(this.plugin.settings.root+"/")||Core.isTemplate(file.path)||fm.type!=="capture"||fm.archived===true||fm.is_example===true||file.path.split("/").some(p=>p.startsWith(".")||/^99_迁移/.test(p)))continue;
      const row=el.createDiv({cls:"pph-controls"});
      const link=row.createEl("a",{text:file.basename,cls:"internal-link"});
      link.addEventListener("click",()=>void this.plugin.app.workspace.getLeaf(true).openFile(file));
      const select=row.createEl("select",{attr:{"aria-label":"分类："+file.basename}});
      for(const label of Object.keys(Core.CATEGORIES))select.createEl("option",{text:label,attr:{value:label}});
      select.value=Object.prototype.hasOwnProperty.call(Core.CATEGORIES,fm.分类)?fm.分类:"未分类";
      select.addEventListener("change",async()=>{
        const category=select.value;select.disabled=true;
        try {
          if(!Object.prototype.hasOwnProperty.call(Core.CATEGORIES,category)||this.plugin.app.vault.getAbstractFileByPath(file.path)!==file)throw new Error("记录已变化，请重新打开收集箱。");
          await this.plugin.app.fileManager.processFrontMatter(file,current=>{
            if(current.type!=="capture"||current.archived===true||current.is_example===true)throw new Error("记录已转换或归档，请刷新。");
            current.分类=category;
          });
          this.plugin.queueCapture(file);
        } catch(error) { new Notice(error.message||String(error));this.render(); }
        finally { select.disabled=false; }
      });
    }
  }
}
class ProjectPanel extends MarkdownRenderChild {
  constructor(plugin, el, sourcePath, mode) {
    super(el); this.plugin = plugin; this.sourceFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
    this.mode = mode; this.alive = false; this.timer = null;
  }
  onload() {
    this.alive = true;
    const refresh = () => this.queue();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.plugin.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.plugin.app.vault.on("delete", refresh));
    this.registerEvent(this.plugin.app.vault.on("rename", refresh));
    this.render();
  }
  queue() {
    if (!this.alive) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { if (this.alive) this.render(); }, 120);
  }
  onunload() { this.alive = false; window.clearTimeout(this.timer); }
  addButton(parentEl, label, kind, file, locked) {
    const button = parentEl.createEl("button", { text: label });
    button.addEventListener("click", () => new CreatePageModal(this.plugin, kind, file, locked).open());
  }
  render() {
    const el = this.containerEl; el.empty(); el.addClass("pph-panel");
    const controls = el.createDiv({ cls: "pph-controls" });
    if (this.mode === "dashboard") {
      this.addButton(controls, "新建项目", "project", null, false);
      this.addButton(controls, "新建项目文档", "doc", null, false);
      return;
    }
    const file = this.sourceFile;
    if (!(file instanceof TFile) || this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) {
      el.createEl("p", { text: "所属页面已变化，重新打开此页即可刷新。", cls: "pph-muted" }); return;
    }
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (Core.isTemplate(file.path) || !["project", "project_doc"].includes(Core.effectiveType(fm))) {
      el.createEl("p", { text: "创建子项的入口会在实际项目或项目文档中显示。", cls: "pph-muted" }); return;
    }
    if (fm.archived === true) {
      el.createEl("p", { text: "本页已归档。取消笔记属性里的归档勾选后，可以继续新建子项。", cls: "pph-muted" });
    } else if (this.mode === "document" || fm.type === "project_doc") {
      this.addButton(controls, "新建子文档", "doc", file, true);
    } else {
      this.addButton(controls, "新建子任务", "task", file, true);
      this.addButton(controls, "新建子项目", "project", file, true);
      this.addButton(controls, "新建项目文档", "doc", file, true);
    }
    const children = this.plugin.children(file);
    if (!children.length) {
      el.createEl("p", { text: fm.archived === true ? "没有未归档的子项。已归档子项可在归档中心查看。" : "还没有子项。通过上方按钮创建，或在已有笔记的 parent 中链接本页。", cls: "pph-muted" }); return;
    }
    const groups = [["task","任务"],["project","子项目"],["project_doc","项目文档"],["other","其他关联页面"]];
    for (const [type, label] of groups) {
      const items = children.filter(item => (["task","project","project_doc"].includes(item.type) ? item.type : "other") === type);
      if (!items.length) continue;
      el.createEl("h4", { text: label + " · " + items.length });
      const list = el.createEl("ul");
      for (const item of items) {
        const row = list.createEl("li");
        const link = row.createEl("a", { text: item.file.basename, cls: "internal-link" });
        link.setAttr("href", item.file.path); link.setAttr("data-href", item.file.path);
        link.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          void this.plugin.app.workspace.openLinkText(item.file.path, file.path, event.ctrlKey || event.metaKey);
        });
        if (item.status) row.createEl("span", { text: String(item.status), cls: "pph-status" });
      }
    }
  }
}
class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    let draft = this.plugin.settings.root;
    new Setting(this.containerEl).setName("个人系统目录").setDesc("填写库内相对路径。当前库使用 personal-system-starter。")
      .addText(text => text.setValue(draft).onChange(value => { draft = value; }))
      .addButton(button => button.setButtonText("保存").onClick(async () => {
        try { this.plugin.settings.root = Core.validateRoot(draft); await this.plugin.saveSettings(); new Notice("目录已保存。"); }
        catch (error) { new Notice(error.message || String(error)); }
      }));
    new Setting(this.containerEl).setName("自动转换收集记录")
      .setDesc("选择任务、项目、知识或生活后，保留正文、补齐对应模板并移动原文件。启动时也处理已选分类的收集记录。")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.autoClassify).onChange(async value => {
        this.plugin.settings.autoClassify = value;
        await this.plugin.saveSettings();
        if (value) this.plugin.scanCaptures();
      }));
  }
}
module.exports = class ProjectPageHelper extends Plugin {
  async onload() {
    const data = await this.loadData();
    this.settings = { ...(data || {}), root: "personal-system-starter", autoClassify: data?.autoClassify !== false };
    this.alive = true; this.classificationTimers = new Map(); this.classificationChain = Promise.resolve();
    this.settingsChain = Promise.resolve(); this.homeDraftTimer = null;
    this.recordChain = Promise.resolve();
    if (data && typeof data.root === "string") {
      try { this.settings.root = Core.validateRoot(data.root); } catch {}
    }
    this.addSettingTab(new SettingsTab(this.app, this));
    this.addCommand({id: "new-learning-chapter", name: "新建学习章节", callback: () => new StudyViews.CreateStudyModal(this, "learning").open()});
    this.addCommand({id: "new-knowledge-note", name: "新建知识笔记", callback: () => new StudyViews.CreateStudyModal(this, "knowledge").open()});
    this.addCommand({ id: "new-project", name: "新建项目", callback: () => new CreatePageModal(this, "project", null, false).open() });
    this.addCommand({ id: "new-capture", name: "新建收集", callback: () => new CreatePageModal(this, "capture", null, false).open() });
    this.addCommand({ id: "convert-classified-captures", name: "处理已分类收集记录", callback: () => {
      const count = this.scanCaptures(true);
      new Notice(count ? "已安排处理 " + count + " 条收集记录。" : "没有等待转换的已分类收集记录。");
    }});
    for (const [kind, name] of [["task","新建子任务"],["project","新建子项目"],["doc","新建项目文档"]]) {
      this.addCommand({ id: "new-child-" + kind, name, checkCallback: checking => {
        const file = this.app.workspace.getActiveFile();
        const allowed = this.isParent(file);
        if (!checking && allowed) new CreatePageModal(this, kind, file, true).open();
        return allowed;
      }});
    }
    this.registerMarkdownCodeBlockProcessor("personal-project", (source, el, ctx) => {
      const mode = ["dashboard", "workspace", "document"].includes(source.trim()) ? source.trim() : "project";
      ctx.addChild(mode === "dashboard" ? new ProjectPanel(this, el, ctx.sourcePath, mode) : new ProjectViews.WorkspacePanel(this, el, ctx.sourcePath, mode));
    });
    this.registerMarkdownCodeBlockProcessor("personal-capture", (_source, el, ctx) => {
      ctx.addChild(new CapturePanel(this,el));
    });
    this.registerMarkdownCodeBlockProcessor("personal-home", (_source, el, ctx) => {
      ctx.addChild(new HomePanel(this, el, ctx.sourcePath));
    });
    this.registerMarkdownCodeBlockProcessor("personal-study", (source, el, ctx) => {
      const mode = ["center", "knowledge"].includes(source.trim()) ? source.trim() : "note";
      ctx.addChild(new StudyViews.StudyPanel(this, el, ctx.sourcePath, mode));
    });
    this.registerEvent(this.app.metadataCache.on("changed", (file, _text, cache) => {
      if (Core.classificationKind(cache?.frontmatter || this.app.metadataCache.getFileCache(file)?.frontmatter || {})) this.queueCapture(file);
    }));
    this.app.workspace.onLayoutReady(() => { if (this.alive) this.scanCaptures(); });
  }
  onunload() {
    this.alive = false;
    for (const timer of this.classificationTimers.values()) window.clearTimeout(timer);
    this.classificationTimers.clear();
    void this.flushHomeDraft().catch(() => new Notice("首页草稿未能保存，请核对后重试。"));
  }
  saveSettings() {
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    const pending = this.settingsChain.catch(() => {}).then(() => this.saveData(snapshot));
    this.settingsChain = pending; return pending;
  }
  updateHomeDraft(text) {
    this.settings.homeDraft = text; window.clearTimeout(this.homeDraftTimer);
    this.homeDraftTimer = window.setTimeout(() => {
      this.homeDraftTimer = null;
      void this.saveSettings().catch(() => new Notice("随手记草稿未能保存，请保留输入内容后重试。"));
    }, 500);
  }
  flushHomeDraft() {
    if (!this.homeDraftTimer) return this.settingsChain;
    window.clearTimeout(this.homeDraftTimer); this.homeDraftTimer = null; return this.saveSettings();
  }
  async createCaptureText(text) {
    if (!String(text).trim()) throw new Error("请先输入内容。");
    return Core.createPage({root: this.settings.root, kind: "capture", title: HomeCore.captureTitle(text), captureText: text}, {
      vault: this.app.vault, codec: {parseYaml, stringifyYaml}, isParent: file => this.isParent(file)
    });
  }
  scanCaptures(manual = false) {
    if (!this.alive || (!manual && !this.settings.autoClassify)) return 0;
    let count = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (Core.isTemplate(file.path) || file.path.split("/").some(p => p.startsWith(".") || /^99_迁移/.test(p))) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (Core.classificationKind(fm)) { this.queueCapture(file, manual); count++; }
    }
    return count;
  }
  queueCapture(file, manual = false) {
    if (!this.alive || (!manual && !this.settings.autoClassify) || !(file instanceof TFile) || Core.isTemplate(file.path)) return;
    window.clearTimeout(this.classificationTimers.get(file));
    const timer = window.setTimeout(() => {
      this.classificationTimers.delete(file);
      this.classificationChain = this.classificationChain.then(async () => {
        if (!this.alive || (!manual && !this.settings.autoClassify)) return;
        try {
          const result = await Core.convertCapture({ root: this.settings.root, file }, {
            vault: this.app.vault, codec: { parseYaml, stringifyYaml },
            rename: (source, destination) => this.app.fileManager.renameFile(source, destination),
            shouldContinue: () => this.alive && (manual || this.settings.autoClassify)
          });
          if (result.changed) new Notice("已转为" + Core.KINDS[result.kind].label + "：" + file.path, 6000);
          if (result.stale && this.alive) this.queueCapture(file, manual);
        } catch (error) {
          if (this.alive) new Notice("分类未完成，原笔记仍在「" + file.path + "」：" + (error.message || String(error)), 9000);
        }
      }).catch(error => { if (this.alive) new Notice("分类处理失败：" + (error.message || String(error))); });
    }, 350);
    this.classificationTimers.set(file, timer);
  }
  isParent(file) {
    if (!(file instanceof TFile) || Core.isTemplate(file.path)) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return ProjectCore.inScope(file, fm, this.settings.root) && fm.archived !== true && ["project","project_doc"].includes(fm.type);
  }
  parentFiles() {
    return this.app.vault.getMarkdownFiles().filter(file => this.isParent(file) &&
      Core.effectiveType(this.app.metadataCache.getFileCache(file)?.frontmatter || {}) === "project")
      .sort((a,b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  children(parent) {
    return this.app.vault.getMarkdownFiles().filter(file => file.path !== parent.path && !Core.isTemplate(file.path)).map(file => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      return { file, fm };
    }).filter(({file,fm}) => fm.archived !== true && Core.parentTargets(fm.parent).some(target => {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(target, file.path);
      return resolved && resolved.path === parent.path;
    })).map(({file,fm}) => ({ file, type: Core.effectiveType(fm), status: fm.status || "" }))
      .sort((a,b) => a.file.path.localeCompare(b.file.path, "zh-CN"));
  }
  projectIndex() {
    return ProjectCore.makeIndex(this.app.vault.getMarkdownFiles(), file => this.app.metadataCache.getFileCache(file)?.frontmatter,
      (target, source) => this.app.metadataCache.getFirstLinkpathDest(target, source), this.settings.root);
  }
  studyRecords(today) {
    return StudyCore.collect(this.app.vault.getMarkdownFiles(), file => this.app.metadataCache.getFileCache(file)?.frontmatter, this.settings.root, today);
  }
  createStudy(options) {
    const operation = this.recordChain.catch(() => {}).then(() => StudyCore.create({...options, root: this.settings.root}, {vault: this.app.vault, codec: {parseYaml, stringifyYaml}}));
    this.recordChain = operation; return operation;
  }
  updateStudy(file, change, expectedSource) {
    const operation = this.recordChain.catch(() => {}).then(() => StudyCore.update({root: this.settings.root, file, change, expectedSource}, {vault: this.app.vault, codec: {parseYaml, stringifyYaml}}));
    this.recordChain = operation; return operation;
  }
  updateProjectRecord(file, change, expected) {
    const operation = this.recordChain.catch(() => {}).then(() => ProjectCore.updateRecord({root: this.settings.root, file, change, expected}, {
      vault: this.app.vault, codec: {parseYaml, stringifyYaml}, resolve: (target, source) => this.app.metadataCache.getFirstLinkpathDest(target, source)
    }));
    this.recordChain = operation; return operation;
  }
  async create(kind, title, parentPath) {
    return Core.createPage({ root: this.settings.root, kind, title, parentPath }, {
      vault: this.app.vault, codec: { parseYaml, stringifyYaml }, isParent: file => this.isParent(file)
    });
  }
};
