"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),{spawnSync}=require('node:child_process');
const Core=require('./src/core'),P=require('./src/project-core')(Core),root='personal-system-starter';
const codec={parseYaml:text=>{const r=spawnSync('python',['-c','import sys,yaml,json;print(json.dumps(yaml.safe_load(sys.stdin.read()),ensure_ascii=False,default=str))'],{input:text,encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout)},stringifyYaml:value=>{const r=spawnSync('python',['-c','import sys,yaml,json;print(yaml.safe_dump(json.loads(sys.stdin.read()),allow_unicode=True,sort_keys=False),end="")'],{input:JSON.stringify(value),encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout}};
const body='\n# 原始正文\n\n原话 [[保留链接]]\n\n```python\n## 子文档\nprint("原代码")\n```\n';
class File{constructor(path,fm){this.path=path;this.extension='md';this.basename=path.split('/').pop().replace(/\.md$/,'');this.stat={mtime:1};this.content='---\n'+codec.stringifyYaml(fm)+'---\n'+body}}
class Vault{constructor(){this.files=new Map();this.writes=0;this.hook=null}getAbstractFileByPath(p){return this.files.get(p)||null}getMarkdownFiles(){return [...this.files.values()].filter(f=>f instanceof File)}async read(f){return f.content}async process(f,fn){if(this.hook){const h=this.hook;this.hook=null;h(f)}const next=fn(f.content);if(next!==f.content){f.content=next;this.writes++}return next}async createFolder(path){this.files.set(path,{path,children:[]})}async create(path,content){if(this.files.has(path))throw Error('exists');const f=new File(path,{});f.content=content;this.files.set(path,f);return f}async rename(file,path){if(this.files.has(path))throw Error('exists');this.files.delete(file.path);file.path=path;file.basename=path.split('/').pop().replace(/\.md$/,'');this.files.set(path,file)}}
async function run(){
 const v=new Vault(),fm=f=>Core.splitNote(f.content,codec).fm;
 const add=(name,props)=>{const f=new File(root+'/'+name+'.md',props);v.files.set(f.path,f);return f};
 const a=add('项目/A',{type:'project',status:'In progress',custom:{nested:[1,2]},source_url:'https://example.test/keep'});
 const d=add('文档/方案',{type:'project_doc',parent:Core.parentLink(a.path)});
 const sub=add('文档/子方案',{type:'project_doc',parent:Core.parentLink(d.path)});
 const t=add('任务/动作',{type:'task',status:'待办',parent:Core.parentLink(a.path),created:'2026-10-12',completed:null,spent_minutes:30});
 const historical=add('任务/历史完成',{type:'task',status:'Done',archived:true,completed:null,parent:Core.parentLink(a.path)});
 add('91_模板/项目',{type:'project'});add('包/Templates/项目',{type:'project'});add('99_迁移记录/项目',{type:'project'});add('示例',{type:'project',is_example:true});
 const capture=add('收集/尚未转换',{type:'capture',分类:'项目'});const independent=add('任务/独立动作',{type:'task'});
 const resolve=target=>v.getAbstractFileByPath(target+'.md')||v.getMarkdownFiles().find(f=>f.basename===target);
 const io={vault:v,codec,resolve},index=()=>P.makeIndex(v.getMarkdownFiles(),fm,resolve,root),edit=(file,change,extra={})=>P.updateRecord({root,file,change,expected:P.expected(fm(file)),...extra},io);
 assert.equal(index().records.filter(r=>r.fm.type==='project').length,1);assert(!index().byPath.has(capture.path));assert.equal(index().unlinked.length,1);assert.equal(index().unlinked[0].file,independent);
 assert.deepEqual(P.trail(index(),sub).chain.map(r=>r.file),[a,d]);assert.equal(P.descendants(index(),a).length,4);assert.deepEqual(P.taskStats(P.descendants(index(),a)),{total:2,done:1,open:1});
 await edit(a,{kind:'summary',next_action:'先跑一个最小案例',blocker:'等待接口'});assert.equal(fm(a).custom.nested[1],2);assert.equal(fm(a).source_url,'https://example.test/keep');assert.equal(Core.splitNote(a.content,codec).body,body);
 const stale=P.expected(fm(a));v.hook=f=>{f.content=f.content.replace('等待接口','已有新卡点')};await assert.rejects(()=>edit(a,{kind:'summary',next_action:'不能覆盖',blocker:''},{expected:stale}),/已经变化/);assert.equal(fm(a).blocker,'已有新卡点');
 await edit(independent,{kind:'parent',parentPath:d.path});assert.equal(fm(independent).parent,Core.parentLink(d.path));assert.equal(index().unlinked.length,0);
 await assert.rejects(()=>edit(a,{kind:'parent',parentPath:sub.path}),/自己或自己的子页面/);await assert.rejects(()=>edit(d,{kind:'parent',parentPath:''}),/需要选择/);
 await edit(t,{kind:'status',status:'完成',completedDate:''});assert.equal(fm(t).completed,null);assert(!fm(t).completed_at);assert.equal(fm(t).created,'2026-10-12');assert.equal(fm(t).spent_minutes,30);
 await edit(t,{kind:'status',status:'进行中'});assert.equal(fm(t).completed,null);assert.equal(fm(t).completed_at,null);
 await edit(t,{kind:'status',status:'完成',finishedNow:true},{now:new Date('2026-10-14T09:00:00Z')});assert.equal(fm(t).completed,'2026-10-14');assert.equal(fm(t).completed_at,'2026-10-14T17:00:00.000+08:00');
 const before=t.content;await assert.rejects(()=>edit(t,{kind:'status',status:'完成',completedDate:'2026-02-30'}),/日期/);assert.equal(t.content,before);
 await edit(a,{kind:'archive',value:true});assert.equal(fm(a).status,'In progress');assert.equal(fm(d).archived,undefined);await assert.rejects(()=>edit(a,{kind:'summary',next_action:'不应修改',blocker:''}),/先恢复/);await edit(a,{kind:'archive',value:false});
 const untouched=historical.content;await edit(historical,{kind:'archive',value:false});assert.equal(fm(historical).completed,null);assert(!fm(historical).completed_at);assert.equal(fm(historical).status,'Done');assert.equal(Core.splitNote(historical.content,codec).body,Core.splitNote(untouched,codec).body);
 t.content=t.content.replace('status: 完成','status: 完成\nactive_session_id: timer-1');const timed=t.content;await assert.rejects(()=>edit(t,{kind:'archive',value:true}),/计时/);assert.equal(t.content,timed);
 const wrong=add('非业务',{type:'guide'});await assert.rejects(()=>edit(wrong,{kind:'archive',value:true}),/实际项目/);
 const c1=add('项目/循环1',{type:'project'}),c2=add('项目/循环2',{type:'project',parent:Core.parentLink(c1.path)});c1.content=c1.content.replace('type: project','type: project\nparent: '+JSON.stringify(Core.parentLink(c2.path)));
 assert(P.trail(index(),c1).cycle);await assert.rejects(()=>edit(independent,{kind:'parent',parentPath:c1.path}),/已有循环/);
 assert.equal(P.day(new Date('2026-10-14T00:00:00Z')),'2026-10-14');
 const raw='收集时的原话 [[链接]]\n\n```python\nprint("保留原代码")\n```';
 const captured=await Core.createPage({root,kind:'capture',title:'收集链路验证',parentPath:a.path,captureText:raw}, {...io,isParent:f=>f===a});
 assert(captured.content.includes(raw));await v.process(captured,text=>text.replace('分类: 未分类','分类: 任务'));
 const converted=await Core.convertCapture({root,file:captured}, {...io,rename:(file,path)=>v.rename(file,path)});
 assert(converted.changed);assert.equal(fm(captured).type,'task');assert(captured.path.startsWith(root+'/02_行动/任务/'));assert.equal(fm(captured).parent,Core.parentLink(a.path));assert(P.descendants(index(),a).some(r=>r.file===captured));assert(captured.content.includes(raw));
 await edit(captured,{kind:'status',status:'完成',finishedNow:true},{now:new Date('2026-10-14T09:00:00Z')});await edit(captured,{kind:'archive',value:true});await edit(captured,{kind:'archive',value:false});assert.equal(fm(captured).status,'完成');assert.equal(fm(captured).parent,Core.parentLink(a.path));assert(captured.content.includes(raw));
 console.log('PASS: 实际类型与模板/迁移/示例筛选；多层文档与任务统计；下一步保存与并发保护；关联与循环校验；历史完成日期保留；明确完成时间；归档恢复不级联；计时与原文保护。');
}
run().catch(e=>{console.error(e);process.exitCode=1});
