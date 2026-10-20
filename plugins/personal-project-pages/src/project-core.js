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
