const test=require("node:test"),assert=require("node:assert/strict"),Module=require("node:module"),fs=require("node:fs");
const {execFileSync}=require("node:child_process");
const path=require("node:path");
const P=path.resolve(__dirname,"../plugins/personal-system-tools")+"/";
function parseYaml(text) {return JSON.parse(execFileSync("python",["-c","import sys,yaml,json;print(json.dumps(yaml.safe_load(sys.stdin.read()), default=str))"],{input:text,encoding:"utf8"}));}
function stringifyYaml(obj){return execFileSync("python",["-c","import sys,yaml,json;print(yaml.safe_dump(json.load(sys.stdin),allow_unicode=True,sort_keys=False),end='')"],{input:JSON.stringify(obj),encoding:"utf8"});}
class TFile {constructor(path){this.path=path;this.basename=path.split("/").pop().replace(/\.md$/,"");}}
class Plugin {constructor(app){this.app=app;}addCommand(){}addRibbonIcon(){}registerMarkdownCodeBlockProcessor(){}registerEvent(){}registerInterval(){}register(){}}
class Modal{}class MarkdownRenderChild{}class Notice {constructor(text){Notice.messages.push(text);}}
Notice.messages=[];
const oldLoad=Module._load;
Module._load=function(name,...rest) {return name==="obsidian"?{Plugin,Modal,Notice,MarkdownRenderChild,TFile,parseYaml,stringifyYaml}:oldLoad.call(this,name,...rest);};
const Main=require(P+"plugin/main");
Module._load=oldLoad;
function header(fm,body="# 正文\n\n保留原始回答。\n"){return "---\n"+stringifyYaml(fm)+"---\n\n"+body;}
function unpack(text){const m=/^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);return m?parseYaml(m[1]):{};}
function mockApp() {
 const store=new Map(),files=new Map(),folders=new Set(),events={};
 const put=(path,text)=>{const file=new TFile(path);files.set(path,file);store.set(path,text);return file;};
 const app={
  vault:{getMarkdownFiles:()=>[...files.values()],getAbstractFileByPath:p=>files.get(p)||(folders.has(p)?{}:null),
   read:async f=>store.get(f.path),createFolder:async p=>{folders.add(p);},on:(name,fn)=>{events[name]=fn;return {};},
   create:async(p,text)=>{if(store.has(p))throw new Error("重复文件");return put(p,text);}},
  metadataCache:{getFileCache:f=>({frontmatter:unpack(store.get(f.path))}),on:(name,fn)=>{events[name]=fn;return {};}},
  workspace:{onLayoutReady:fn=>fn(),getLeaf:()=>({openFile:async()=>{}})},
  fileManager:{processFrontMatter:async(f,fn)=>{
   if(app.failUpdate){app.failUpdate=false;throw new Error("模拟写入失败");}
   const text=store.get(f.path),fm=unpack(text),body=text.replace(/^---\n[\s\S]*?\n---\n\n?/,"");
   fn(fm);store.set(f.path,header(fm,body));
   events.changed?.(f,store.get(f.path),{frontmatter:fm});
  }}
 };
 for(const name of ["任务","项目","每日记录","周回顾"])put("91_模板/"+name+".md",fs.readFileSync(path.resolve(__dirname,"../vault-template/personal-system-starter/91_模板")+"/"+name+".md","utf8"));
 return {app,store,files,put};
}
const RealDate=Date;
let clock;
function installClock(t) {
 clock=RealDate.parse("2026-10-12T10:00:00Z");
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 global.window={setInterval:()=>0,setTimeout:()=>0,clearTimeout:()=>{}};
 t.after(()=>{global.Date=RealDate;delete global.window;});
}
test("新建任务来自真实模板，自动创建时间，正文和可选日期保留",async t=>{
 installClock(t);const m=mockApp(),plugin=new Main(m.app);await plugin.onload();
 const file=await plugin.createRecord("task","ReAct 练习",{start:"2026-10-12",end:"2026-10-13"},"先换一个工具");
 const fm=unpack(m.store.get(file.path));
 assert.equal(fm.created_at,"2026-10-12T10:00:00.000Z");
 assert.equal(fm.status,"待办");assert.equal(fm.start,"2026-10-12");assert.equal(fm.spent_minutes,0);
 assert.match(m.store.get(file.path),/先换一个工具/);assert.doesNotMatch(m.store.get(file.path),/\{\{date/);
});
test("完整空白库在内层目录创建任务和回顾，模板与库外事项不参与统计",async t=>{
 installClock(t);const m=mockApp();
 for(const [p,content] of [...m.store]) {m.store.delete(p);m.files.delete(p);m.put("personal-system-starter/"+p,content);}
 m.put("outside/外部任务.md",header({type:"task",status:"待办"}));
 const plugin=new Main(m.app);await plugin.onload();
 assert.equal(plugin.systemRoot,"personal-system-starter");assert.equal(plugin.records().length,0);
 const f=await plugin.createRecord("task","实际任务");assert.match(f.path,/^personal-system-starter\/02_行动\/任务\//);
 assert.equal(plugin.records().length,1);
 await plugin.daily();await plugin.review();
 assert.ok([...m.files.keys()].some(p=>p.startsWith("personal-system-starter/07_回顾/每日/")));
 assert.ok([...m.files.keys()].some(p=>p.startsWith("personal-system-starter/07_回顾/每周/")));
 assert.equal(plugin.records().filter(r=>r.fm.type==="task").length,1);
});
test("多段工作累计且完成自动停止，重复完成不重复记时",async t=>{
 installClock(t);const m=mockApp();const task=m.put("02_行动/任务/A.md",header({type:"task",status:"待办",spent_minutes:0}));
 const plugin=new Main(m.app);await plugin.onload();
 await plugin.startTimer(task);clock+=15*60000;await plugin.stopTimer(task);
 clock+=45*60000;await plugin.startTimer(task);clock+=10*60000;await plugin.complete(task);await plugin.chain;
 let fm=unpack(m.store.get(task.path));
 assert.equal(fm.spent_minutes,25);assert.equal(fm.active_session_started_at,null);
 assert.equal(fm.completed_at,"2026-10-12T11:10:00.000Z");assert.equal(fm.status,"完成");
 await plugin.complete(task);
 fm=unpack(m.store.get(task.path));assert.equal(fm.spent_minutes,25);
 assert.equal([...m.files.keys()].filter(p=>p.startsWith("07_回顾/时间记录/")).length,2);
 assert.match(m.store.get(task.path),/保留原始回答/);
});
test("停止后日志已保存但任务写入失败，重试复用日志并且只累计一次",async t=>{
 installClock(t);const m=mockApp();const task=m.put("02_行动/任务/A.md",header({type:"task",status:"待办",spent_minutes:7}));
 const plugin=new Main(m.app);await plugin.onload();
 await plugin.startTimer(task);clock+=12*60000;m.app.failUpdate=true;
 await assert.rejects(plugin.stopTimer(task),/模拟写入失败/);
 clock+=8*60000;await plugin.stopTimer(task);
 assert.equal(unpack(m.store.get(task.path)).spent_minutes,19);
 assert.equal([...m.files.keys()].filter(p=>p.startsWith("07_回顾/时间记录/")).length,1);
});
test("两个任务同时开始只允许一个工作段",async t=>{
 installClock(t);const m=mockApp();
 const a=m.put("02_行动/任务/A.md",header({type:"task",status:"待办"})),b=m.put("02_行动/任务/B.md",header({type:"task",status:"待办"}));
 const plugin=new Main(m.app);await plugin.onload();
 const result=await Promise.allSettled([plugin.startTimer(a),plugin.startTimer(b)]);
 assert.equal(result.filter(r=>r.status==="fulfilled").length,1);
 assert.equal(result.filter(r=>r.status==="rejected").length,1);
});
test("手动改为完成会补完成时间并结束计时，加载旧完成记录不补造时间",async t=>{
 installClock(t);const m=mockApp();
 const old=m.put("02_行动/任务/旧.md",header({type:"task",status:"完成"}));
 const task=m.put("02_行动/任务/A.md",header({type:"task",status:"待办"}));
 const plugin=new Main(m.app);await plugin.onload();
 assert.equal(unpack(m.store.get(old.path)).completed_at,undefined);
 await plugin.startTimer(task);clock+=5*60000;
 await m.app.fileManager.processFrontMatter(task,f=>{f.status="完成";});await plugin.chain;
 const fm=unpack(m.store.get(task.path));assert.equal(fm.spent_minutes,5);assert.ok(fm.completed_at);
});
