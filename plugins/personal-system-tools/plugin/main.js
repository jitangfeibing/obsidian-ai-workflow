// Personal System Tools 0.2.0. Self-contained bundle; only the Obsidian API is external.
"use strict";
const {Plugin,Modal,Notice,MarkdownRenderChild,TFile,parseYaml,stringifyYaml}=require("obsidian");
const L=(()=>{const module={exports:{}};
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

return module.exports;})();
const UI=(()=>{const module={exports:{}};
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

return module.exports;})();

function fields(container, specs) {
  const result={};
  for(const spec of specs) {
    const row=UI.node(container,"label","ps-form-field");
    UI.node(row,"span","",spec.label);
    let input;
    if(spec.options) {
      input=UI.node(row,"select","");
      for(const [value,label] of spec.options) {
        const option=UI.node(input,"option","",label);option.value=value;
      }
    } else {
      input=UI.node(row,spec.multiline?"textarea":"input","");
      if(!spec.multiline)input.type=spec.type||"text";
    }
    input.value=spec.value||"";
    if(spec.placeholder)input.placeholder=spec.placeholder;
    if(spec.type==="number"){input.min="0";input.step="5";}
    result[spec.key]=input;
  }
  return result;
}
class RecordModal extends Modal {
  constructor(plugin,kind) {super(plugin.app);this.plugin=plugin;this.kind=kind;}
  onOpen() {
    this.contentEl.replaceChildren();this.contentEl.classList.add("ps-form");
    this.setTitle(this.kind==="task"?"新建任务":"新建项目");
    UI.node(this.contentEl,"p","ps-muted","先写清要做的事。计划日期可以之后补，创建时间自动记录。");
    const projects=this.plugin.records().filter(r=>r.fm.type==="project"&&r.fm.archived!==true);
    const specs=[
      {key:"title",label:"名称",placeholder:this.kind==="task"?"例如：修改一次工具调用并说明结果":"例如：RAG 文档问答"},
      {key:"parent",label:"所属项目",options:[["","独立事项"],...projects.map(r=>[r.path,r.name])]},
      {key:"start",label:"计划开始",type:"date"},
      {key:"end",label:"计划结束",type:"date"},
      {key:"due",label:"截止日期",type:"date"},
      {key:"estimated_minutes",label:"预计用时（分钟）",type:"number"},
      {key:"next_action",label:"下一步 / 当前情况",multiline:true}
    ];
    const inputs=fields(this.contentEl,specs);
    const save=UI.button(this.contentEl,"创建并打开",async()=>{
      if(!inputs.title.value.trim())throw new Error("请先填写名称");
      if(inputs.start.value&&inputs.end.value&&inputs.end.value<inputs.start.value)throw new Error("计划结束不能早于开始");
      save.disabled=true;
      try {
        const extra={parent:inputs.parent.value?"[["+inputs.parent.value.replace(/\.md$/,"")+"]]":null,
          start:inputs.start.value||null,end:inputs.end.value||null,due:inputs.due.value||null,
          estimated_minutes:inputs.estimated_minutes.value?Number(inputs.estimated_minutes.value):null};
        const file=await this.plugin.createRecord(this.kind,inputs.title.value.trim(),extra,inputs.next_action.value);
        await this.plugin.open(file.path);this.close();
      } finally {save.disabled=false;}
    },"ps-button ps-primary");
    inputs.title.focus();
  }
  onClose() {this.contentEl.replaceChildren();}
}
class DatesModal extends Modal {
  constructor(plugin,file) {super(plugin.app);this.plugin=plugin;this.file=file;}
  async onOpen() {
    this.contentEl.replaceChildren();this.setTitle("编辑排期 · "+this.file.basename);
    const fm=await this.plugin.readFM(this.file);
    const input=fields(this.contentEl,[
      {key:"start",label:"计划开始",type:"date",value:fm.start},
      {key:"end",label:"计划结束",type:"date",value:fm.end},
      {key:"due",label:"截止日期",type:"date",value:fm.due}
    ]);
    UI.button(this.contentEl,"保存日期",async()=>{
      if(input.start.value&&input.end.value&&input.end.value<input.start.value)throw new Error("计划结束不能早于开始");
      await this.plugin.app.fileManager.processFrontMatter(this.file,f=>{
        f.start=input.start.value||null;f.end=input.end.value||null;f.due=input.due.value||null;
      });this.close();
    },"ps-button ps-primary");
  }
  onClose(){this.contentEl.replaceChildren();}
}
class Widget extends MarkdownRenderChild {
  constructor(plugin,el,type,config,sourcePath) {
    super(el);this.plugin=plugin;this.type=type;this.config=config;this.sourcePath=sourcePath;this.offset=0;
  }
  onload(){this.plugin.widgets.add(this);this.render();}
  onunload(){this.plugin.widgets.delete(this);}
  render() {
    try {
      const rows=this.plugin.records(),week=L.week();
      const actions={
        open:path=>this.plugin.open(path),
        newTask:()=>new RecordModal(this.plugin,"task").open(),
        newProject:()=>new RecordModal(this.plugin,"project").open(),
        daily:()=>this.plugin.daily(),
        review:()=>this.plugin.review(),
        editDates:path=>new DatesModal(this.plugin,this.plugin.app.vault.getAbstractFileByPath(path)).open(),
        shift:(value,reset)=>{this.offset=reset?L.ordinal(L.week().from)-L.ordinal(this.config.from||L.week().from):this.offset+value;this.render();}
      };
      if(this.type==="personal-dashboard")UI.dashboard(this.containerEl,L.period(rows,week.from,week.to),actions,L.dayText());
      if(this.type==="personal-gantt") {
        let parent=this.config.project;
        if(parent==="this")parent=this.sourcePath.replace(/\.md$/,"");
        const from=L.textDay(L.ordinal(this.config.from||week.from)+this.offset);
        UI.gantt(this.containerEl,L.gantt(rows,from,this.config.days||28,{...this.config,parent}),actions,L);
      }
      if(this.type==="personal-review") {
        const host=rows.find(r=>r.path===this.sourcePath)?.fm||{};
        const from=this.config.from||host.review_from||week.from,to=this.config.to||host.review_to||week.to;
        UI.review(this.containerEl,L.period(rows,from,to),actions,from,to);
      }
    } catch(e) {this.containerEl.replaceChildren();UI.node(this.containerEl,"p","ps-error",e.message||String(e));}
  }
}
module.exports=class PersonalSystemTools extends Plugin {
  async onload() {
    this.systemRoot=this.app.vault.getAbstractFileByPath("personal-system-starter/91_模板/任务.md") ? "personal-system-starter" : this.app.vault.getAbstractFileByPath("91_模板/任务.md") ? "" : "personal-system-starter";
    this.widgets=new Set();this.lastStatuses=new Map();this.chain=Promise.resolve();
    const safe=fn=>()=>Promise.resolve().then(fn).catch(e=>new Notice(e.message||String(e),6000));
    this.addCommand({id:"new-task",name:"新建任务",callback:safe(()=>new RecordModal(this,"task").open())});
    this.addCommand({id:"new-project",name:"新建项目",callback:safe(()=>new RecordModal(this,"project").open())});
    this.addCommand({id:"start-timer",name:"开始当前任务计时",callback:safe(()=>this.startTimer(this.activeTask()))});
    this.addCommand({id:"pause-timer",name:"暂停当前任务计时",callback:safe(()=>this.stopTimer(this.activeTask()))});
    this.addCommand({id:"complete-task",name:"完成当前任务",callback:safe(()=>this.complete(this.activeTask()))});
    this.addCommand({id:"daily",name:"打开今日记录",callback:safe(()=>this.daily())});
    this.addCommand({id:"weekly-review",name:"新建或打开本周回顾",callback:safe(()=>this.review())});
    this.addCommand({id:"gantt",name:"打开项目甘特图",callback:safe(()=>this.open("03_目标与项目/项目甘特图.md"))});
    this.addRibbonIcon("list-checks","新建任务",safe(()=>new RecordModal(this,"task").open()));
    for(const type of ["personal-dashboard","personal-gantt","personal-review"]) {
      this.registerMarkdownCodeBlockProcessor(type,(source,el,ctx)=>{
        let config={};
        try {config=parseYaml(source)||{};}catch(e){UI.node(el,"p","ps-error","配置格式错误："+e.message);return;}
        ctx.addChild(new Widget(this,el,type,config,ctx.sourcePath));
      });
    }
    this.app.workspace.onLayoutReady(()=>{
      for(const r of this.records())this.lastStatuses.set(r.path,r.fm.status);
      this.refresh();
    });
    this.registerEvent(this.app.metadataCache.on("changed",(file,_data,cache)=>{
      const fm=cache.frontmatter||{},old=this.lastStatuses.get(file.path);
      this.lastStatuses.set(file.path,fm.status);
      if(old!==undefined&&!L.done(old)&&L.done(fm.status)&&fm.type==="task"&&(!fm.completed_at||fm.active_session_started_at)&&this.inScope(file.path)&&L.eligible({path:file.path,fm})) {
        this.complete(file).catch(e=>new Notice(e.message||String(e),6000));
      }
      this.refresh();
    }));
    this.registerEvent(this.app.vault.on("rename",(file,old)=>{
      this.lastStatuses.delete(old);this.lastStatuses.set(file.path,this.app.metadataCache.getFileCache(file)?.frontmatter?.status);
      this.refresh();
    }));
    this.registerEvent(this.app.vault.on("delete",()=>this.refresh()));
    this.registerInterval(window.setInterval(()=>this.refresh(),60000));
    this.register(()=>window.clearTimeout(this.refreshId));
  }
  records() {
    return this.app.vault.getMarkdownFiles().filter(file=>this.inScope(file.path)).map(file=>({path:file.path,name:file.basename,
      fm:this.app.metadataCache.getFileCache(file)?.frontmatter||{}})).filter(r=>L.eligible(r));
  }
  path(relative) { return this.systemRoot&&!relative.startsWith(this.systemRoot+"/")?this.systemRoot+"/"+relative:relative; }
  inScope(path) { return (!this.systemRoot||path.startsWith(this.systemRoot+"/"))&&!path.split("/").some(p=>p.startsWith(".")); }
  refresh() {
    window.clearTimeout(this.refreshId);
    this.refreshId=window.setTimeout(()=>{for(const widget of this.widgets)widget.render();},100);
  }
  async open(path) {
    const file=this.app.vault.getAbstractFileByPath(this.path(path));
    if(!(file instanceof TFile))throw new Error("未找到 "+path+"。请确认已打开整个仓库。");
    return this.app.workspace.getLeaf(false).openFile(file);
  }
  activeTask() {
    const file=this.app.workspace.getActiveFile();
    const fm=file&&this.app.metadataCache.getFileCache(file)?.frontmatter;
    if(!file||fm?.type!=="task"||!this.inScope(file.path)||!L.eligible({path:file.path,fm}))throw new Error("请先打开一条任务笔记");
    return file;
  }
  async readFM(file) {
    const text=await this.app.vault.read(file);
    const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    return match?(parseYaml(match[1])||{}):{};
  }
  async ensureFolder(path) {
    let part="";
    for(const name of path.split("/")) {
      part=part?part+"/"+name:name;
      if(!this.app.vault.getAbstractFileByPath(part)) {
        try{await this.app.vault.createFolder(part);}
        catch(e){if(!this.app.vault.getAbstractFileByPath(part))throw e;}
      }
    }
  }
  uniquePath(folder,title) {
    const safe=title.replace(/[\\/:*?"<>|]/g," ").trim().slice(0,100)||"新记录";
    let path=folder+"/"+safe+".md",n=2;
    while(this.app.vault.getAbstractFileByPath(path))path=folder+"/"+safe+" ("+(n++)+").md";
    return path;
  }
  expand(source,title,now) {
    const pad=x=>String(x).padStart(2,"0");
    const time=pad(now.getHours())+":"+pad(now.getMinutes());
    return source.replace(/\{\{title\}\}/g,title)
      .replace(/\{\{date(?::[^}]+)?\}\}/g,L.dayText(now))
      .replace(/\{\{time(?::[^}]+)?\}\}/g,time);
  }
  async createRecord(kind,title,extra={},note="") {
    const names={task:"任务",project:"项目",daily:"每日记录",review:"周回顾"};
    const folders={task:"02_行动/任务",project:"03_目标与项目/项目",daily:"07_回顾/每日",review:"07_回顾/每周"};
    const template=this.app.vault.getAbstractFileByPath(this.path("91_模板/"+names[kind]+".md"));
    if(!(template instanceof TFile))throw new Error("缺少模板："+names[kind]);
    const now=new Date(),source=this.expand(await this.app.vault.read(template),title,now);
    const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
    const fm={...(match?parseYaml(match[1]):{}),type:kind,created:L.dayText(now),created_at:now.toISOString(),...extra};
    let body=match?source.slice(match[0].length):source;
    if(kind==="task"&&!extra.status)fm.status="待办";
    if(kind==="task"&&fm.spent_minutes==null)fm.spent_minutes=0;
    if(note.trim())body+="\n\n## 创建时的原始输入\n\n"+note.trim()+"\n";
    const folder=this.path(folders[kind]);
    await this.ensureFolder(folder);
    return this.app.vault.create(this.uniquePath(folder,title),"---\n"+stringifyYaml(fm).trimEnd()+"\n---\n\n"+body);
  }
  serialize(fn) {
    const next=this.chain.then(fn);this.chain=next.catch(()=>{});return next;
  }
  startTimer(file) {
    return this.serialize(async()=>{
      const fm=await this.readFM(file);
      if(fm.active_session_started_at){new Notice("这条任务已经在计时");return;}
      if(L.done(fm.status))throw new Error("任务已完成，需要继续时先改回待办");
      for(const candidate of this.records().filter(r=>r.path!==file.path&&r.fm.type==="task")) {
        const actual=await this.readFM(this.app.vault.getAbstractFileByPath(candidate.path));
        if(actual.active_session_started_at)throw new Error("「"+candidate.name+"」仍在计时，请先暂停它");
      }
      const now=new Date().toISOString();
      await this.app.fileManager.processFrontMatter(file,f=>{
        if(f.active_session_started_at)return;
        f.active_session_id=Date.now()+"-"+Math.random().toString(36).slice(2,8);
        f.active_session_started_at=now;f.actual_started_at=f.actual_started_at||now;f.status="正在进行";
      });new Notice("开始计时："+file.basename);
    });
  }
  stopTimer(file) {return this.serialize(()=>this.stopInternal(file));}
  async stopInternal(file) {
    const fm=await this.readFM(file);
    if(!fm.active_session_started_at)return null;
    const id=fm.active_session_id;
    if(!id)throw new Error("缺少计时记录编号，请补充或清空当前计时字段");
    if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error("计时记录编号无效");
    const folder=this.path("07_回顾/时间记录"),path=folder+"/"+id+".md";
    await this.ensureFolder(folder);
    let log=this.app.vault.getAbstractFileByPath(path),ended,minutes;
    if(log instanceof TFile) {
      const old=await this.readFM(log);ended=old.ended_at;minutes=Number(old.duration_minutes);
    }else{
      ended=new Date().toISOString();minutes=L.sessionMinutes(fm.active_session_started_at,ended);
      const data={type:"time_session",archived:false,is_example:fm.is_example===true,task:"[["+file.path.replace(/\.md$/,"")+"]]",
        started_at:fm.active_session_started_at,ended_at:ended,duration_minutes:minutes};
      log=await this.app.vault.create(path,"---\n"+stringifyYaml(data).trimEnd()+"\n---\n\n# "+file.basename+" · 用时记录\n\n经过时长："+minutes+" 分钟。\n");
    }
    if(!Number.isFinite(minutes)||minutes<0||!ended)throw new Error("计时日志有误");
    await this.app.fileManager.processFrontMatter(file,f=>{
      if(f.active_session_id!==id)throw new Error("任务计时状态已变化，日志已保留");
      f.spent_minutes=Math.round(((Number(f.spent_minutes)||0)+minutes)*10)/10;
      f.last_session_ended_at=ended;f.active_session_started_at=null;f.active_session_id=null;
    });
    new Notice("已记录 "+minutes+" 分钟");
    return minutes;
  }
  complete(file) {
    return this.serialize(async()=>{
      await this.stopInternal(file);
      await this.app.fileManager.processFrontMatter(file,f=>{
        f.status="完成";f.completed_at=f.completed_at||new Date().toISOString();
        f.completed=f.completed_at.slice(0,10);
      });new Notice("任务已完成："+file.basename);
    });
  }
  async daily() {
    const title=L.dayText(),path=this.path("07_回顾/每日/"+title+".md");
    const existing=this.app.vault.getAbstractFileByPath(path);
    const file=existing instanceof TFile?existing:await this.createRecord("daily",title);
    return this.open(file.path);
  }
  async review() {
    const period=L.week(),title=period.from+" 周回顾",path=this.path("07_回顾/每周/"+title+".md");
    const existing=this.app.vault.getAbstractFileByPath(path);
    const file=existing instanceof TFile?existing:await this.createRecord("review",title,{review_from:period.from,review_to:period.to});
    return this.open(file.path);
  }
};
