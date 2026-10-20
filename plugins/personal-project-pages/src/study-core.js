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
