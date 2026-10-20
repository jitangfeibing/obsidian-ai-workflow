"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.events={};this.value='';}
  createEl(tag,props={}){const n=new Element(tag);Object.assign(n,props);if(props.attr?.value)n.value=props.attr.value;this.children.push(n);return n;}
  createDiv(props){return this.createEl('div',props);} empty(){this.children=[];} addClass(){} addEventListener(k,fn){this.events[k]=fn;}
}
class TFile {constructor(path){this.path=path;this.extension='md';this.basename=path.split('/').pop().replace(/\.md$/,'');}}
class Child {constructor(el){this.containerEl=el;}registerEvent(){}}
class Plugin {constructor(app){this.app=app;this.processors={};}async loadData(){return null;}addSettingTab(){}addCommand(){}registerEvent(){}registerMarkdownCodeBlockProcessor(k,v){this.processors[k]=v;}}
test('收集箱自带分类菜单，保存去向保留未知属性并拒绝已转换记录',async()=>{
  const files=['personal-system-starter/01_收集/A.md','personal-system-starter/91_模板/随手收集.md','outside/B.md'].map(p=>new TFile(p));
  const fm=new Map(files.map(f=>[f.path,{type:'capture',分类:'未分类',custom:'保留'}]));
  const notices=[],queued=[];
  const app={vault:{getMarkdownFiles:()=>files,getAbstractFileByPath:p=>files.find(f=>f.path===p),on:()=>({})},metadataCache:{getFileCache:f=>({frontmatter:fm.get(f.path)}),on:()=>({})},workspace:{onLayoutReady:()=>{}},fileManager:{processFrontMatter:async(f,fn)=>fn(fm.get(f.path))}};
  const original=Module._load;
  Module._load=function(name,...args){return name==='obsidian'?{Plugin,Modal:class{},Setting:class{},Notice:class{constructor(t){notices.push(t);}},PluginSettingTab:class{},MarkdownRenderChild:Child,TFile,parseYaml:JSON.parse,stringifyYaml:JSON.stringify,setIcon:()=>{}}:original.call(this,name,...args);};
  let Main;try{Main=require('../plugins/personal-project-pages/plugin/main');}finally{Module._load=original;}
  const plugin=new Main(app);await plugin.onload();plugin.queueCapture=f=>queued.push(f.path);
  const root=new Element('div');let child;plugin.processors['personal-capture']('',root,{addChild:x=>child=x});child.onload();
  const all=n=>[n,...n.children.flatMap(all)];const selects=all(root).filter(n=>n.tag==='select');
  assert.equal(selects.length,1);assert.equal(selects[0].children.length,5);
  selects[0].value='知识';await selects[0].events.change();
  assert.equal(fm.get(files[0].path).分类,'知识');assert.equal(fm.get(files[0].path).custom,'保留');assert.deepEqual(queued,[files[0].path]);
  fm.get(files[0].path).type='knowledge';selects[0].value='任务';await selects[0].events.change();
  assert.equal(fm.get(files[0].path).分类,'知识');assert.ok(notices.some(x=>x.includes('已转换')));
});
