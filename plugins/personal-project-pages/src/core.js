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
