const test=require("node:test"),assert=require("node:assert/strict");
const P="../plugins/personal-system-tools/src/";
const UI=require(P+"ui"),L=require(P+"logic");
class Element {
 constructor(doc,tag){this.ownerDocument=doc;this.tag=tag;this.className="";this.children=[];this.listeners={};this.style={setProperty:(k,v)=>{this.style[k]=v;}};this.classList={add:()=>{}};this.textContent="";}
 appendChild(child){this.children.push(child);}
 replaceChildren(){this.children=[];}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
const doc={createElement:tag=>new Element(doc,tag)};
function all(el){return [el,...el.children.flatMap(all)];}
test("按钮调用对应动作，内容使用文本节点，不解释成 HTML",async()=>{
 const root=new Element(doc,"div"),calls=[];
 const a={newTask:()=>calls.push("newTask"),newProject:()=>{},daily:()=>{},review:()=>{},open:path=>calls.push(path)};
 UI.dashboard(root,{activeTasks:[],overdue:[],completed:[],minutes:0},a,"2026-10-12");
 const button=all(root).find(x=>x.textContent==="＋ 新建任务");
 button.listeners.click();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,["newTask"]);assert.equal(all(root).filter(x=>x.className==="ps-nav-card").length,6);
 const p=UI.node(root,"p","","<script>not executed</script>");
 assert.equal(p.textContent,"<script>not executed</script>");assert.equal(p.children.length,0);
});
test("甘特图横轴和时间条共用宽度，单日条有宽度，日期编辑动作可触发",async()=>{
 const root=new Element(doc,"div"),calls=[];
 const rows=[{name:"当天任务",path:"task.md",fm:{type:"task",start:"2026-10-12",end:"2026-10-12"}}];
 const model=L.gantt(rows,"2026-10-12",21);
 UI.gantt(root,model,{open:p=>calls.push(p),editDates:p=>calls.push("edit:"+p),shift:()=>{}},L);
 const elements=all(root),bar=elements.find(x=>x.className.startsWith("ps-gantt-bar"));
 assert.ok(parseFloat(bar.style.width)>0);assert.equal(bar.style.left,"0%");
 assert.equal(elements.find(x=>x.className==="ps-gantt-grid").style.minWidth,"828px");
 elements.find(x=>x.textContent==="编辑日期").listeners.click();await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls,["edit:task.md"]);
});
