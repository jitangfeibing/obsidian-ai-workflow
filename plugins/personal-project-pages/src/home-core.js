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
