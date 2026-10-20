"use strict";
function node(parent,tag,cls,text) {
  const el=parent.ownerDocument.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  parent.appendChild(el);return el;
}
function button(parent,label,fn,cls="ps-button") {
  const b=node(parent,"button",cls,label);b.type="button";
  b.addEventListener("click",()=>Promise.resolve().then(fn).catch(e=>{
    node(parent,"p","ps-error",e.message||String(e));
  }));return b;
}
function stat(parent,value,label,color) {
  const item=node(parent,"div","ps-stat "+(color||""));
  node(item,"strong","",value);node(item,"span","",label);
}
function list(parent,title,records,actions,empty) {
  const box=node(parent,"section","ps-list");
  node(box,"h4","",title);
  if(!records.length){node(box,"p","ps-muted",empty||"暂无记录");return;}
  for(const r of records.slice(0,8)) {
    const row=node(box,"div","ps-list-row");
    button(row,r.name,()=>actions.open(r.path),"ps-link");
    node(row,"span","ps-badge",r.fm.status||r.fm.mastery||"");
  }
  if(records.length>8)node(box,"p","ps-muted","共 "+records.length+" 项，列表显示前 8 项");
}
function dashboard(root,summary,actions,date) {
  root.replaceChildren();root.classList.add("ps-shell");
  const hero=node(root,"div","ps-hero");
  node(hero,"span","ps-eyebrow","个人系统 · "+date);
  node(hero,"h2","","今天，从一个可推进的行动开始");
  node(hero,"p","","留下真实输入，连接学习、项目和求职；回顾时据此调整下一步。");
  const commands=node(hero,"div","ps-actions");
  button(commands,"＋ 新建任务",actions.newTask,"ps-button ps-primary");
  button(commands,"新建项目",actions.newProject);
  button(commands,"今日记录",actions.daily);
  button(commands,"开始周回顾",actions.review);
  const stats=node(root,"div","ps-stats");
  stat(stats,summary.activeTasks.length,"当前待推进","teal");
  stat(stats,summary.overdue.length,"当前延期","amber");
  stat(stats,summary.completed.length,"本周完成","blue");
  stat(stats,summary.minutes+" 分钟","本周已记录用时","violet");
  const nav=node(root,"div","ps-nav");
  for(const [title,desc,path] of [
    ["收集","先记下问题与想法","01_收集/收集箱.md"],
    ["执行","待办、日程与计时","02_行动/事务执行.md"],
    ["项目","子项、进展与甘特图","03_目标与项目/目标与项目.md"],
    ["学习","回答、实践与验收","04_学习/学习中心.md"],
    ["求职","岗位、面试和复盘","05_求职/求职中心.md"],
    ["回顾","事实、原因与调整","07_回顾/回顾中心.md"]
  ]) {
    const card=button(nav,"",()=>actions.open(path),"ps-nav-card");
    node(card,"strong","",title);node(card,"span","",desc);
  }
}
function gantt(root,model,actions,logic) {
  root.replaceChildren();root.classList.add("ps-shell");
  const top=node(root,"div","ps-section-head");
  node(top,"h3","","项目排期");
  const controls=node(top,"div","ps-actions");
  button(controls,"← 前一周",()=>actions.shift(-7));
  button(controls,"本周",()=>actions.shift(0,true));
  button(controls,"后一周 →",()=>actions.shift(7));
  node(root,"p","ps-muted",logic.textDay(model.first)+" — "+logic.textDay(model.last)+" · 日期为计划安排，条形包含结束当天");
  const scroll=node(root,"div","ps-gantt-scroll");
  const grid=node(scroll,"div","ps-gantt-grid");
  grid.style.minWidth=(240+model.days*28)+"px";
  const head=node(grid,"div","ps-gantt-row ps-gantt-head");
  node(head,"div","ps-gantt-label","任务 / 项目");
  const axis=node(head,"div","ps-gantt-axis");
  axis.style.gridTemplateColumns="repeat("+model.days+", minmax(24px,1fr))";
  for(let i=0;i<model.days;i++)node(axis,"span","",logic.textDay(model.first+i).slice(5));
  const today=logic.ordinal(logic.dayText());
  for(const r of model.rows) {
    const row=node(grid,"div","ps-gantt-row");
    const label=node(row,"div","ps-gantt-label");
    button(label,r.name,()=>actions.open(r.path),"ps-link");
    node(label,"small","ps-muted",r.fm.status||"未开始");
    const track=node(row,"div","ps-gantt-track");
    track.style.setProperty("--days",String(model.days));
    if(today>=model.first&&today<=model.last) {
      const marker=node(track,"span","ps-today");
      marker.style.left=((today-model.first+0.5)/model.days*100)+"%";
    }
    const bar=button(track,"",()=>actions.open(r.path),"ps-gantt-bar "+(logic.done(r.fm.status)?"is-done":r.fm.status==="暂停"?"is-paused":""));
    bar.style.left=r.left+"%";bar.style.width=r.width+"%";
    bar.title=logic.textDay(r.start)+" — "+logic.textDay(r.end);
    node(bar,"span","",logic.textDay(r.start).slice(5)+" → "+logic.textDay(r.end).slice(5));
    button(label,"编辑日期",()=>actions.editDates(r.path),"ps-small-button");
  }
  if(!model.rows.length)node(grid,"p","ps-empty","这个时间窗口暂无已排期的事项。填入任务的计划开始、计划结束或截止日期即可显示。");
  const extra=node(root,"div","ps-small-grid");
  list(extra,"未排期 · "+model.unscheduled.length,model.unscheduled,actions,"已显示的事项均有排期");
  list(extra,"窗口外 · "+model.outside.length,model.outside,actions,"没有窗口外的排期");
  if(model.invalid.length)list(root,"日期待修正",model.invalid,actions);
}
function review(root,summary,actions,from,to) {
  root.replaceChildren();root.classList.add("ps-shell");
  node(root,"h3","","先看事实，再做调整");
  node(root,"p","ps-muted",from+" — "+to+"（结束日不含） · 统计依据任务完成时间和实际计时日志");
  const stats=node(root,"div","ps-stats");
  stat(stats,summary.completed.length,"期间完成","teal");
  stat(stats,summary.minutes+" 分钟","期间记录用时","blue");
  stat(stats,summary.newLearning.length,"期间新建学习记录","violet");
  stat(stats,summary.unverified.length,"当前待验收","amber");
  const lists=node(root,"div","ps-small-grid");
  list(lists,"完成与成果",summary.completed,actions,"期间尚无带完成时间的任务");
  list(lists,"当前延期",summary.overdue,actions,"暂无延期");
  list(lists,"当前暂停",summary.paused,actions,"暂无暂停");
  list(lists,"待学习验收",summary.unverified,actions,"暂无待验收笔记");
  if(summary.unconfirmedDone.length)node(root,"p","ps-muted",summary.unconfirmedDone.length+" 个旧完成任务缺少完成日期，未计入期间完成数。");
}
const api={node,button,dashboard,gantt,review};
if(typeof module!=="undefined")module.exports=api;
if(typeof window!=="undefined")window.PersonalUI=api;
