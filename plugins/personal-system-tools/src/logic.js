"use strict";
const DAY = 86400000;
function dayText(date = new Date()) {
  const pad = x => String(x).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth()+1) + "-" + pad(date.getDate());
}
function ordinal(value) {
  if (!value) return null;
  const text = (typeof value.toISOString === "function" ? value.toISOString() : String(value)).slice(0,10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const stamp = Date.UTC(+m[1], +m[2]-1, +m[3]);
  return new Date(stamp).toISOString().slice(0,10) === text ? stamp/DAY : null;
}
function textDay(value) { return new Date(value*DAY).toISOString().slice(0,10); }
function done(status) { return ["完成","已完成","Done","done"].includes(status); }
function eligible(record, examples = false) {
  return !record.path.split("/").some(p=>p==="91_模板"||p==="99_迁移记录"||p.toLowerCase()==="templates"||p.startsWith(".")) &&
    (examples || record.fm.is_example !== true);
}
function active(record) { return record.fm.archived !== true && !done(record.fm.status); }
function rangeOf(fm) {
  const start = ordinal(fm.start || fm.due);
  const end = ordinal(fm.end || fm.due || fm.start);
  if (start === null || end === null) return {status:"unscheduled"};
  if (end < start) return {status:"invalid"};
  return {status:"scheduled", start, end};
}
function gantt(records, from, days = 28, config = {}) {
  days = Math.max(7, Math.min(90, Number(days)||28));
  const first = ordinal(from);
  if (first === null) throw new Error("无效的时间窗口");
  const last = first + days - 1;
  const rows=[],unscheduled=[],invalid=[],outside=[];
  const filtered = records.filter(r => eligible(r,config.include_examples) &&
    r.fm.archived !== true && (config.include_done || !done(r.fm.status)) &&
    (config.scope === "projects" ? r.fm.type === "project" : r.fm.type === "task") &&
    (!config.parent || String(r.fm.parent||"").replace(/^\[\[|\]\]$/g,"").replace(/\.md$/,"") === config.parent.replace(/\.md$/,"")));
  for (const record of filtered) {
    const range = rangeOf(record.fm);
    if (range.status === "unscheduled") {unscheduled.push(record);continue;}
    if (range.status === "invalid") {invalid.push(record);continue;}
    if (range.end < first || range.start > last) {outside.push(record);continue;}
    const left = Math.max(first,range.start), right = Math.min(last,range.end);
    rows.push({...record, start:range.start,end:range.end,left:(left-first)/days*100,width:(right-left+1)/days*100});
  }
  rows.sort((a,b)=>a.start-b.start || a.name.localeCompare(b.name,"zh-CN"));
  return {first,last,days,rows,unscheduled,invalid,outside};
}
function sessionMinutes(start, end) {
  const a=Date.parse(start),b=Date.parse(end);
  if (!Number.isFinite(a)||!Number.isFinite(b)||b<a) throw new Error("计时日期无效或设备时间发生回退");
  return Math.round((b-a)/6000)/10;
}
function period(records, from, to, now = new Date()) {
  const firstDay=ordinal(from),lastDay=ordinal(to);
  const first = firstDay===null?NaN:Date.parse(textDay(firstDay)+"T00:00:00");
  const last = lastDay===null?NaN:Date.parse(textDay(lastDay)+"T00:00:00");
  if (!Number.isFinite(first)||!Number.isFinite(last)||last<=first) throw new Error("回顾日期范围无效");
  const all = records.filter(r=>eligible(r));
  const tasks=all.filter(r=>r.fm.type==="task");
  const completed=tasks.filter(r=>done(r.fm.status) && Date.parse(r.fm.completed_at)>=first && Date.parse(r.fm.completed_at)<last);
  const today=ordinal(dayText(now));
  const overdue=tasks.filter(r=>active(r) && ordinal(r.fm.due)!==null && ordinal(r.fm.due)<today);
  const paused=tasks.filter(r=>active(r)&&r.fm.status==="暂停");
  const unconfirmedDone=tasks.filter(r=>done(r.fm.status)&&!r.fm.completed_at);
  let minutes=0;
  const sessions=all.filter(r=>r.fm.type==="time_session");
  for(const s of sessions) {
    const a=Date.parse(s.fm.started_at),b=Date.parse(s.fm.ended_at);
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)continue;
    const overlap=Math.max(0,Math.min(b,last)-Math.max(a,first));
    const total = Number(s.fm.duration_minutes);
    if(Number.isFinite(total)&&total>=0)minutes += total*overlap/(b-a);
  }
  const learning=all.filter(r=>r.fm.type==="learning");
  const unverified=learning.filter(r=>!r.fm.mastery||r.fm.mastery==="未验收");
  const newLearning=learning.filter(r=> {
    const createdDay=ordinal(r.fm.created);
    const date=Date.parse(r.fm.created_at || (createdDay!==null ? textDay(createdDay)+"T00:00:00" : ""));
    return date>=first&&date<last;
  });
  return {completed,overdue,paused,unconfirmedDone,minutes:Math.round(minutes*10)/10,unverified,newLearning,
          activeTasks:tasks.filter(active),activeProjects:all.filter(r=>r.fm.type==="project"&&active(r))};
}
function week(now = new Date()) {
  const monday = new Date(now.getFullYear(),now.getMonth(),now.getDate());
  monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  const end=new Date(monday);end.setDate(end.getDate()+7);
  return {from:dayText(monday),to:dayText(end)};
}
const api={DAY,dayText,ordinal,textDay,done,eligible,active,rangeOf,gantt,sessionMinutes,period,week};
if(typeof module!=="undefined")module.exports=api;
if(typeof window!=="undefined")window.PersonalLogic=api;
