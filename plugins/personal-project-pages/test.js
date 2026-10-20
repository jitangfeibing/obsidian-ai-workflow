"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const Core = require("./src/core");
const py = (code, input) => {
  const r = spawnSync("python", ["-c",code], {input,encoding:"utf8"});
  if(r.status!==0) throw new Error(r.stderr);
  return r.stdout;
};
const codec = {
  parseYaml: text => JSON.parse(py("import sys,yaml,json;print(json.dumps(yaml.safe_load(sys.stdin.read()),ensure_ascii=False,default=str))",text)),
  stringifyYaml: value => py("import sys,yaml,json;print(yaml.safe_dump(json.loads(sys.stdin.read()),allow_unicode=True,sort_keys=False),end='')",JSON.stringify(value))
};
class File {
  constructor(path,content="") { this.path=path; this.extension="md"; this.basename=path.split("/").pop().replace(/\.md$/,""); this.parent={path:path.split("/").slice(0,-1).join("/")}; this.content=content; this.stat={ctime:Date.parse("2026-10-12T12:00:00+08:00")}; }
}
class FakeVault {
  constructor() { this.files=new Map(); this.writes=0; this.beforeCreate=null; this.afterFolder=null; this.beforeRename=null; this.beforeProcess=null; this.moves=0; }
  getAbstractFileByPath(path) { return this.files.get(path)||null; }
  getMarkdownFiles() { return [...this.files.values()].filter(x=>x instanceof File); }
  async read(file) { return file.content; }
  async createFolder(path) { assert(!this.files.has(path)); this.files.set(path,{path,children:[]}); if(this.afterFolder)this.afterFolder(path); }
  async create(path,content) {
    if(this.beforeCreate) { const f=this.beforeCreate; this.beforeCreate=null; f(path); }
    if(this.files.has(path)) throw new Error("file exists");
    const file=new File(path,content);this.files.set(path,file);this.writes++;return file;
  }
  async rename(file,path) {
    if(this.beforeRename) { const hook=this.beforeRename;this.beforeRename=null;hook(file,path); }
    if(this.files.has(path))throw new Error("file exists");
    this.files.delete(file.path);file.path=path;file.basename=path.split("/").pop().replace(/\.md$/,"");file.parent={path:path.split("/").slice(0,-1).join("/")};this.files.set(path,file);this.moves++;
  }
  async process(file,callback) {
    if(this.beforeProcess) { const hook=this.beforeProcess;this.beforeProcess=null;hook(file); }
    const result=callback(file.content);if(result!==file.content){file.content=result;this.writes++;}return result;
  }
}
const header = content => codec.parseYaml(content.match(/^---\n([\s\S]*?)\n---/)[1]);
async function run() {
  const vault=new FakeVault(), root="personal-system-starter";
  const parent=new File(root+"/03_目标与项目/项目/主项目.md");
  vault.files.set(parent.path,parent);
  const io={vault,codec,isParent:file=>file===parent};
  vault.files.set(root+"/91_模板/项目文档.md",new File(root+"/91_模板/项目文档.md",
    "---\ntype: project_doc\nstatus: 草稿\ncreated: '{{date:YYYY-MM-DD}}'\ncustom: 保留字段\n---\n# {{title}}\n\n正文占位\n"));
  const doc=await Core.createPage({root,kind:"doc",title:"设计方案",parentPath:parent.path,date:"2026-10-14"},io);
  assert.equal(header(doc.content).parent,"[["+parent.path.replace(/\.md$/,"")+"]]");
  assert.equal(header(doc.content).custom,"保留字段");assert.equal(header(doc.content).created,"2026-10-14");
  assert.equal(header(doc.content).type,"project_doc");assert(doc.content.includes("# 设计方案"));
  assert.equal((doc.content.match(/personal-project/g)||[]).length,1);
  const original=doc.content;
  const duplicate=await Core.createPage({root,kind:"doc",title:"设计方案",parentPath:parent.path,date:"2026-10-14"},io);
  assert(duplicate.path.endsWith("设计方案 2.md"));assert.equal(doc.content,original);
  vault.beforeCreate=path=>vault.files.set(path,new File(path,"由另一窗口创建"));
  const raced=await Core.createPage({root,kind:"task",title:"并发任务",parentPath:parent.path,date:"2026-10-14"},io);
  assert(raced.path.endsWith("并发任务 2.md"));assert.equal(header(raced.content).completed,null);
  assert.equal(header(raced.content).due,null);assert.equal(header(raced.content).priority,false);
  const writesBefore=vault.writes;
  await assert.rejects(()=>Core.createPage({root:"../escape",kind:"doc",title:"外部",parentPath:parent.path},io));
  await assert.rejects(()=>Core.createPage({root,kind:"doc",title:"未关联"},io));
  await assert.rejects(()=>Core.createPage({root,kind:"project",title:" \n "},io));
  await assert.rejects(()=>Core.createPage({root,kind:"doc",title:"父页不存在",parentPath:"missing.md"},io));
  assert.equal(vault.writes,writesBefore);
  const child=await Core.createPage({root,kind:"project",title:"子项目",parentPath:parent.path,date:"2026-10-14"},io);
  assert.equal(header(child.content).type,"project");assert.equal(header(child.content).parent,header(doc.content).parent);
  const top=await Core.createPage({root,kind:"project",title:"独立项目",date:"2026-10-14"},io);
  assert.equal(header(top.content).parent,null);
  assert.equal(Core.safeName("CON").name,"_CON");assert.equal(Core.safeName("界面/设计#1").name,"界面_设计_1");
  assert.equal(Core.localDate(new Date("2026-10-13T16:00:00Z")),"2026-10-14");
  assert.deepEqual(Core.parentTargets(["[[目标/主项目|别名]]","[[另一个#段落]]"]),["目标/主项目","另一个"]);
  const isolated=new FakeVault();isolated.files.set(parent.path,parent);
  isolated.afterFolder=()=>isolated.files.delete(parent.path);
  await assert.rejects(()=>Core.createPage({root,kind:"doc",title:"不会成为孤立页",parentPath:parent.path}, {vault:isolated,codec,isParent:f=>f===parent}));
  assert.equal(isolated.writes,0);
  await conversionTests(root);
  const source=fs.readFileSync(__dirname+"/plugin/main.js","utf8"), captured={commands:[],blocks:[],events:{},timers:new Map(),notices:[],ready:null};let timerId=0;
  class Plugin { async loadData(){return null;} addCommand(c){captured.commands.push(c);} addSettingTab(){} registerEvent(){} registerMarkdownCodeBlockProcessor(name,fn){captured.blocks.push({name,fn});} }
  const mod={exports:{}};
  vm.runInNewContext(source,{module:mod,require:name=>{
    assert.equal(name,"obsidian");
    return {Plugin,Modal:class{},Setting:class{},Notice:class{constructor(message){captured.notices.push(message);}},PluginSettingTab:class{constructor(){}},MarkdownRenderChild:class{},TFile:File,...codec};
  },window:{setTimeout:fn=>{captured.timers.set(++timerId,fn);return timerId;},clearTimeout:id=>captured.timers.delete(id)},console});
  const plugin=new mod.exports();
  const childFm=new Map([[parent.path,{type:"project"}],[doc.path,header(doc.content)],[child.path,header(child.content)],[top.path,{type:"project"}]]);
  const archived=new File(root+"/03_目标与项目/项目文档/已归档.md");vault.files.set(archived.path,archived);childFm.set(archived.path,{type:"project_doc",parent:header(doc.content).parent,archived:true});
  plugin.app={vault,fileManager:{renameFile:(file,path)=>vault.rename(file,path)},metadataCache:{on:(name,fn)=>{captured.events[name]=fn;return {};},getFileCache:file=>({frontmatter:file.content.startsWith("---")?header(file.content):childFm.get(file.path)||{}}),getFirstLinkpathDest:path=>vault.getAbstractFileByPath(path+".md")},workspace:{getActiveFile:()=>parent,onLayoutReady:fn=>{captured.ready=fn;}}};
  await plugin.onload();
  assert.equal(captured.commands.length,8);assert.equal(captured.blocks[0].name,"personal-project");assert.equal(captured.blocks[1].name,"personal-capture");
  assert(captured.commands.some(c=>c.id==="new-learning-chapter"));assert(captured.blocks.some(b=>b.name==="personal-study"));
  assert(plugin.children(parent).some(x=>x.file.path===doc.path));
  assert(plugin.children(parent).some(x=>x.file.path===child.path));
  assert(!plugin.children(parent).some(x=>x.file.path===archived.path||x.file.path===top.path));
  assert(captured.commands.find(c=>c.id==="new-child-doc").checkCallback(true));
  const parentMeta=childFm.get(parent.path);
  childFm.set(parent.path,{type:"project",archived:true});
  assert.equal(plugin.isParent(parent),false);assert(!plugin.parentFiles().includes(parent));
  const archiveWrites=vault.writes;
  await assert.rejects(()=>plugin.create("doc","已归档父项目不能创建",parent.path));assert.equal(vault.writes,archiveWrites);
  childFm.set(parent.path,parentMeta);assert(plugin.isParent(parent));assert(plugin.parentFiles().includes(parent));
  const packedTemplate=new File("下载/Templates/项目.md","---\ntype: project\nparent: '"+header(doc.content).parent+"'\n---\n模板\n");vault.files.set(packedTemplate.path,packedTemplate);
  assert.equal(plugin.isParent(packedTemplate),false);assert(!plugin.parentFiles().includes(packedTemplate));assert(!plugin.children(parent).some(x=>x.file===packedTemplate));
  assert.equal(vault.writes,writesBefore+2);
  const captureText="这是首页里的原始输入 [[链接]]\n\n```js\nconsole.log('保留代码');\n```";
  const capturedPage=await plugin.createCaptureText(captureText);
  assert.equal(header(capturedPage.content).type,"capture");assert.equal(header(capturedPage.content).分类,"未分类");assert(capturedPage.content.includes(captureText));
  assert(capturedPage.path.startsWith(root+"/01_收集/"));
  assert(captured.blocks.some(b=>b.name==="personal-home"));
  let savedSettings;plugin.settings.customField={value:"保留"};plugin.saveData=async data=>{savedSettings=data;};
  plugin.updateHomeDraft("持续输入的草稿");await plugin.flushHomeDraft();
  assert.equal(savedSettings.homeDraft,"持续输入的草稿");assert.equal(savedSettings.customField.value,"保留");assert.equal(captured.timers.size,0);
  const pending=new File("启动待转换.md","---\ntype: capture\n分类: 知识\n---\n原文保留\n");vault.files.set(pending.path,pending);
  captured.ready();assert.equal(vault.getAbstractFileByPath("启动待转换.md"),pending);
  const timers=[...captured.timers.values()];captured.timers.clear();for(const fn of timers)fn();await plugin.classificationChain;
  assert.equal(header(pending.content).type,"knowledge");assert(pending.path.startsWith(root+"/04_学习/资料/"));assert(pending.content.includes("原文保留"));
  const writesAfter=vault.writes,movesAfter=vault.moves;
  captured.events.changed(pending,pending.content,{frontmatter:header(pending.content)});
  assert.equal(captured.timers.size,0);assert.equal(vault.writes,writesAfter);assert.equal(vault.moves,movesAfter);
  plugin.settings.autoClassify=false;
  const paused=new File("暂缓分类.md","---\ntype: capture\n分类: 项目\n---\n未修改\n");vault.files.set(paused.path,paused);
  captured.events.changed(paused,paused.content,{frontmatter:header(paused.content)});assert.equal(captured.timers.size,0);
  assert.equal(plugin.scanCaptures(true),1);assert.equal(captured.timers.size,1);
  plugin.onunload();assert.equal(captured.timers.size,0);assert.equal(paused.path,"暂缓分类.md");
  console.log("PASS: 项目创建与父链接；四类转换与原文/属性保留；路径移动与同名保护；并发编辑、分类取消与重新分类；失败恢复与重复触发；模板/归档排除；启动补处理与自动开关。");
}
async function conversionTests(root) {
  const mappings=[["任务","task","02_行动/任务"],["项目","project","03_目标与项目/项目"],["知识","knowledge","04_学习/资料"],["生活","life","08_生活"]];
  for(const [category,type,folder] of mappings) {
    const v=new FakeVault(),path="收集-"+category+".md";
    const raw="\n# 我的原始标题\n\n## 原始输入\n\n原话、代码与链接 [[保留链接]]\n\n```python\n## 子项\nprint('原文')\n```\n";
    const f=new File(path,"---\ntype: capture\n分类: "+category+"\ncreated: 2026-10-11\nstatus: 正在讨论\nparent: '[[原父项目]]'\ndue: 2026-10-22\ncompleted: 2026-10-01\npriority: true\nsource_url: https://example.test/source\ncustom: {nested: [1, 2]}\n---\n"+raw);v.files.set(path,f);
    const templatePath=root+"/"+Core.KINDS[type].template;
    v.files.set(templatePath,new File(templatePath,"---\ntype: "+type+"\nstatus: 草稿\nextra_default: 模板扩展\n---\n"+Core.compose("",{kind:type,title:"{{title}}",date:"2026-10-14"},codec).replace(/^---\n[\s\S]*?\n---\n/,"")));
    const io={vault:v,codec,rename:(file,dest)=>v.rename(file,dest)};
    const result=await Core.convertCapture({root,file:f},io),fm=header(f.content);
    assert(result.changed);assert.equal(f.path,root+"/"+folder+"/收集-"+category+".md");assert.equal(v.getAbstractFileByPath(path),null);
    assert(f.content.includes(raw));assert.equal(fm.type,type);assert.equal(fm.created,"2026-10-11");assert.equal(fm.status,"正在讨论");
    assert.equal(fm.parent,"[[原父项目]]");assert.equal(fm.due,"2026-10-22");assert.equal(fm.completed,"2026-10-01");assert.equal(fm.priority,true);
    assert.deepEqual(fm.custom,{nested:[1,2]});assert.equal(fm.extra_default,"模板扩展");assert.equal(fm.capture_origin,path);
    if(type==="project")assert.equal((f.content.match(/personal-project/g)||[]).length,1);
    const text=f.content,writes=v.writes,moves=v.moves;
    assert.equal((await Core.convertCapture({root,file:f},io)).changed,false);assert.equal(f.content,text);assert.equal(v.writes,writes);assert.equal(v.moves,moves);
  }
  const v=new FakeVault(), f=new File("Daily.md","---\ntype: capture\n分类: 知识\ncreated:\nstatus:\n---\n正文\n");v.files.set(f.path,f);
  const conflict=new File(root+"/04_学习/资料/daily.md","已有笔记禁止覆盖");v.files.set(conflict.path,conflict);
  v.beforeRename=(file,path)=>{v.files.set(path,new File(path,"并发创建的同名笔记"));};
  v.beforeProcess=file=>{file.content+="\n转换期间的新输入\n";};
  const io={vault:v,codec,rename:(file,path)=>v.rename(file,path)};
  await Core.convertCapture({root,file:f},io);
  assert(f.path.endsWith("Daily 3.md"));assert.equal(conflict.content,"已有笔记禁止覆盖");assert(f.content.includes("转换期间的新输入"));assert.equal(header(f.content).created,"2026-10-12");
  // Reclassification moves the same object; no copied record and no original body loss.
  f.content=f.content.replace("分类: 知识","分类: 生活");await Core.convertCapture({root,file:f},io);
  assert(f.path.startsWith(root+"/08_生活/"));assert.equal(header(f.content).type,"life");assert.equal(header(f.content).capture_origin,"Daily.md");
  f.content=f.content.replace("分类: 生活","分类: 未分类");await Core.convertCapture({root,file:f},io);
  assert(f.path.startsWith(root+"/01_收集/"));assert.equal(header(f.content).type,"capture");assert(f.content.includes("正文"));
  const changing=new File("快速切换.md","---\ntype: capture\n分类: 项目\n---\n不要丢失\n");v.files.set(changing.path,changing);
  v.beforeProcess=file=>{file.content=file.content.replace("分类: 项目","分类: 知识");};
  assert.equal((await Core.convertCapture({root,file:changing},io)).stale,true);assert.equal(header(changing.content).type,"capture");assert.equal(changing.path,"快速切换.md");
  await Core.convertCapture({root,file:changing},io);assert.equal(header(changing.content).type,"knowledge");assert(changing.path.includes("/04_学习/资料/"));
  const cancelled=new File("取消分类.md","---\ntype: capture\n分类: 项目\n---\n继续收集\n");v.files.set(cancelled.path,cancelled);
  v.beforeProcess=file=>{file.content=file.content.replace("分类: 项目","分类: 未分类");};
  assert.equal((await Core.convertCapture({root,file:cancelled},io)).changed,false);assert.equal(cancelled.path,"取消分类.md");assert.equal(header(cancelled.content).type,"capture");
  const broken=new File("属性错误.md","---\n- 属性列表\n---\n不能改变\n");v.files.set(broken.path,broken);const brokenText=broken.content;
  await assert.rejects(()=>Core.convertCapture({root,file:broken},io));assert.equal(broken.content,brokenText);assert.equal(broken.path,"属性错误.md");
  const noMove=new File("移动失败.md","---\ntype: capture\n分类: 项目\n---\n保持内容\n");v.files.set(noMove.path,noMove);const noMoveText=noMove.content;
  await assert.rejects(()=>Core.convertCapture({root,file:noMove},{...io,rename:async()=>{throw new Error("磁盘不可写");}}));assert.equal(noMove.path,"移动失败.md");assert.equal(noMove.content,noMoveText);
  const failedProcess=new File("写入失败.md","---\ntype: capture\n分类: 项目\n---\n原文仍在\n");v.files.set(failedProcess.path,failedProcess);const failedText=failedProcess.content;
  const savedProcess=v.process;v.process=async()=>{throw new Error("模拟原子写入失败");};await assert.rejects(()=>Core.convertCapture({root,file:failedProcess},io));assert.equal(failedProcess.content,failedText);
  v.process=savedProcess;await Core.convertCapture({root,file:failedProcess},io);assert.equal(header(failedProcess.content).type,"project");assert(failedProcess.content.includes("原文仍在"));
  for(const [name,fm] of [["未分类",{type:"capture",分类:"未分类"}],["归档",{type:"capture",分类:"项目",archived:true}],["手工项目",{type:"project",分类:"知识"}],["特殊输入",{type:"capture",分类:"__proto__"}],["数组输入",{type:"capture",分类:["项目"]}]]) {
    assert.equal(Core.classificationKind(fm),null,name);
  }
  const templated=new File(root+"/91_模板/不动.md","---\ntype: capture\n分类: 项目\n---\n模板\n");v.files.set(templated.path,templated);
  const writes=v.writes;assert.equal((await Core.convertCapture({root,file:templated},io)).changed,false);assert.equal(v.writes,writes);
  const example=new File(root+"/01_收集/示例保护.md","---\ntype: capture\n分类: 项目\nis_example: true\n---\n示例保留\n");v.files.set(example.path,example);
  assert.equal((await Core.convertCapture({root,file:example},io)).changed,false);
  const snapshot=new File(root+"/99_迁移记录/收集快照.md","---\ntype: capture\n分类: 项目\n---\n快照保留\n");v.files.set(snapshot.path,snapshot);
  assert.equal((await Core.convertCapture({root,file:snapshot},io)).changed,false);assert.equal(v.writes,writes);
  const installerTemplate=new File("安装包/templates/收集.md","---\ntype: capture\n分类: 项目\n---\n安装模板\n");v.files.set(installerTemplate.path,installerTemplate);
  assert.equal((await Core.convertCapture({root,file:installerTemplate},io)).changed,false);assert.equal(v.writes,writes);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
