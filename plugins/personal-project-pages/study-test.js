"use strict";
const assert = require("node:assert/strict"), {spawnSync} = require("node:child_process");
const Core = require("./src/core"), Study = require("./src/study-core")(Core), Home = require("./src/home-core");
const yaml = (code, input) => {const r=spawnSync("python",["-c",code],{input,encoding:"utf8"});if(r.error || r.status!==0)throw new Error(r.stderr || String(r.error));return r.stdout;};
const codec={parseYaml:s=>JSON.parse(yaml("import sys,yaml,json;print(json.dumps(yaml.safe_load(sys.stdin.read()),ensure_ascii=False,default=str))",s)),stringifyYaml:v=>yaml("import sys,yaml,json;print(yaml.safe_dump(json.load(sys.stdin),allow_unicode=True,sort_keys=False),end='')",JSON.stringify(v))};
const root="personal-system-starter",today="2026-10-14";
class File{constructor(path,content){Object.assign(this,{path,content,extension:"md",basename:path.split("/").pop().replace(/\.md$/,""),stat:{mtime:1}});}}
class Vault{
 constructor(){this.files=new Map();this.beforeProcess=null;this.beforeCreate=null;}
 getAbstractFileByPath(p){return this.files.get(p);}
 getMarkdownFiles(){return [...this.files.values()].filter(f=>f instanceof File);}
 async read(f){return f.content;}
 async createFolder(p){if(this.files.has(p))throw new Error("exists");this.files.set(p,{path:p,children:[]});}
 async create(p,c){if(this.beforeCreate){const cb=this.beforeCreate;this.beforeCreate=null;cb(p);}if(this.files.has(p))throw new Error("exists");const f=new File(p,c);this.files.set(p,f);return f;}
 async process(f,fn){if(this.beforeProcess){const cb=this.beforeProcess;this.beforeProcess=null;cb(f);}return f.content=fn(f.content);}
 add(path,fm,body="\n# 原笔记\n\n```python\nprint('actual')\n```\n"){const f=new File(path,"---\n"+codec.stringifyYaml(fm)+"---\n"+body);this.files.set(path,f);return f;}
}
(async()=>{
 const v=new Vault(),io={vault:v,codec},base=root+"/04_学习/Agent/";
 const f=v.add(base+"第一章.md",{type:"learning",topic:"Agent",mastery:"未验收",last_review:null,next_review:null,status:"已整理",custom:{keep:[1,2]},source_url:"https://example.org/ch1",related:["[[原关联]]"]});
 const original=Core.splitNote(f.content,codec),now=new Date("2026-10-14T10:00:00Z");
 const update=change=>Study.update({root,file:f,change,expectedSource:f.content,now},io);
 await update({kind:"schedule",next:today});let parsed=Core.splitNote(f.content,codec);
 assert.equal(parsed.fm.last_review,null);assert.equal(parsed.fm.mastery,"未验收");assert.equal(parsed.body,original.body);assert.deepEqual(parsed.fm.custom,original.fm.custom);
 assert.equal(Home.collect([f],x=>Core.splitNote(x.content,codec).fm,root,today).reviews.length,1);
 await update({kind:"review",next:"2026-10-16",date:today,question:"解释请求流程",answer:"我的原始回答\n```python\nprint('未执行示例')\n```",hint:"轻提示",feedback:"还需验证异常分支"});
 parsed=Core.splitNote(f.content,codec);assert(parsed.body.startsWith(original.body));assert(parsed.body.includes("我的原始回答"));assert.equal(parsed.fm.last_review,today);assert.equal(parsed.fm.next_review,"2026-10-16");assert.equal(parsed.fm.mastery,"未验收");assert.equal(parsed.fm.status,"已整理");assert(!parsed.fm.completed_at);
 await update({kind:"review",next:"",date:"2026-10-12",question:"补记",answer:"旧回答",hint:"无提示",feedback:""});assert.equal(Core.splitNote(f.content,codec).fm.last_review,today);
 const before=f.content;
 for(const change of [{kind:"schedule",next:"2026-02-30"},{kind:"review",next:"",date:"2026-10-15",question:"q",answer:"a",hint:"无提示",feedback:""},{kind:"review",next:"",date:today,question:"q",answer:"",hint:"无提示",feedback:""}]){await assert.rejects(()=>update(change));assert.equal(f.content,before);}
 v.beforeProcess=x=>{x.content+="\n用户同时补充\n";};await assert.rejects(()=>update({kind:"schedule",next:today}),/新修改/);assert(f.content.endsWith("用户同时补充\n"));
 await update({kind:"archive",value:true});await assert.rejects(()=>update({kind:"schedule",next:today}),/恢复/);await update({kind:"archive",value:false});assert.equal(Core.splitNote(f.content,codec).fm.mastery,"未验收");
 const meta=x=>Core.splitNote(x.content,codec).fm;
 for(const [name,fm] of [["已排",{next_review:"2026-10-20"}],["无日期",{}],["坏日期",{next_review:"2026-02-30"}],["已归档",{archived:true,next_review:today}],["示例",{is_example:true}]] )v.add(base+name+".md",{type:"learning",mastery:"未验收",...fm});
 v.add(root+"/91_模板/章节学习.md",{type:"learning"});v.add("other/04_学习/别库.md",{type:"learning"});v.add(root+"/04_学习/templates/样例.md",{type:"learning"});
 const records=Study.collect(v.getMarkdownFiles(),meta,root,today);assert.equal(records.length,5);assert.equal(Study.select(records,{tab:"invalid"}).length,1);assert.equal(Study.select(records,{tab:"archived"}).length,1);assert.equal(Study.select(records,{tab:"planned"}).length,1);assert.equal(Study.select(records,{query:"example.org"}).length,1);
 assert.equal(Study.day("2026-02-30"),"");assert.equal(Study.day("2028-02-29"),"2028-02-29");assert.equal(Study.group({next_review:[]},today),"invalid");
  assert.equal(Home.collect([f],()=>({type:"learning",next_review:"2026-02-30"}),root,today).reviews.length,0);
 // Actual templates with unknown fields survive; new chapters never inherit old evidence dates.
 const template=v.getAbstractFileByPath(root+"/91_模板/章节学习.md");template.content="---\ntype: learning\ncustom: KEEP\nmastery: 能够应用\nlast_review: 2026-10-01\nnext_review: 2026-10-20\n---\n# {{title}}\n\n## 原始回答与实践\n";
 const chapter=await Study.create({root,kind:"learning",title:"第二章 工具调用",topic:"Agent",source:"https://example.org/ch2",now},io);const fm=meta(chapter);
 assert(chapter.path.endsWith("Agent/第二章 工具调用.md"));assert.equal(fm.created,today);assert.equal(fm.mastery,"未验收");assert.equal(fm.last_review,null);assert.equal(fm.next_review,null);assert.equal(fm.custom,"KEEP");assert(chapter.content.includes("```personal-study\nnote"));assert(!chapter.content.includes("{{"));
 await assert.rejects(()=>Study.create({root,kind:"learning",title:"第二章 工具调用",topic:"Agent",now},io),/同名/);
 await assert.rejects(()=>Study.create({root,kind:"learning",title:"第三章",topic:"../坏路径",now},io),/目录名/);
 await assert.rejects(()=>Study.create({root,kind:"learning",title:"第三章",topic:"",now},io),/主题/);
 await assert.rejects(()=>Study.create({root,kind:"knowledge",title:"三",source:"javascript:bad",now},io),/来源/);
  const knowledge=await Study.create({root,kind:"knowledge",title:"知识测试",topic:"MCP",now},io);assert(knowledge.path.endsWith("04_学习/资料/知识测试.md"));assert(knowledge.content.includes("## 资料与来源"));assert.equal(meta(knowledge).type,"knowledge");assert.equal(meta(knowledge).mastery,undefined);
 console.log("PASS: learning creation, duplicate prevention, source validation, review dates, evidence preservation, no inferred mastery, homepage linkage, archive/restore, concurrent edit protection and scope filters.");
})().catch(e=>{console.error(e);process.exitCode=1;});
