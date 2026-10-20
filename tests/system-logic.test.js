const test=require("node:test"),assert=require("node:assert/strict");
const path=require("node:path");
const L=require("../plugins/personal-system-tools/src/logic");
const record=(name,fm,pathOverride)=>({name,path:pathOverride||"任务/"+name+".md",fm});
test("日期只接受真实日历日期，按天排期不受夏令时影响",()=>{
 assert.equal(L.ordinal("2026-02-30"),null);
 assert.equal(L.ordinal("2026-10-13")-L.ordinal("2026-10-12"),1);
 assert.equal(L.ordinal(""),null);
});
test("甘特图包含结束当天，未排期和无效日期分别保留",()=>{
 const model=L.gantt([
  record("一天",{type:"task",start:"2026-10-12",end:"2026-10-12"}),
  record("跨窗口",{type:"task",start:"2026-10-10",end:"2026-10-13"}),
  record("待排",{type:"task"}),record("倒置",{type:"task",start:"2026-10-15",end:"2026-10-14"}),
  record("以前",{type:"task",due:"2026-09-12"})
 ],"2026-10-12",7);
 assert.ok(Math.abs(model.rows.find(r=>r.name==="一天").width-100/7)<1e-10);
 assert.ok(Math.abs(model.rows.find(r=>r.name==="跨窗口").width-200/7)<1e-10);
 assert.equal(model.unscheduled[0].name,"待排");
 assert.equal(model.invalid[0].name,"倒置");
 assert.equal(model.outside[0].name,"以前");
});
test("示例、模板和归档事项不污染真实排期",()=>{
 const items=[record("真实",{type:"task",due:"2026-10-12"}),
  record("示例",{type:"task",is_example:true,due:"2026-10-12"}),
  record("模板",{type:"task",due:"2026-10-12"},"91_模板/任务.md"),
  record("归档",{type:"task",archived:true,due:"2026-10-12"})];
 assert.deepEqual(L.gantt(items,"2026-10-12",7).rows.map(r=>r.name),["真实"]);
 assert.equal(L.gantt(items,"2026-10-12",7,{include_examples:true}).rows.length,2);
});
test("学习与项目只显示当前项目的任务",()=>{
 const model=L.gantt([record("甲",{type:"task",parent:"[[项目/A]]",due:"2026-10-12"}),
 record("乙",{type:"task",parent:"[[项目/B]]",due:"2026-10-12"})],"2026-10-12",7,{parent:"项目/A.md"});
 assert.deepEqual(model.rows.map(r=>r.name),["甲"]);
});
test("统计保留归档后的成果，旧完成但无日期的任务不冒充本周完成",()=>{
 const rows=[
 record("本周",{type:"task",status:"完成",completed_at:"2026-10-12T12:00:00Z",archived:true}),
 record("旧完成",{type:"task",status:"Done"}),
 record("示例",{type:"task",status:"完成",completed_at:"2026-10-12T12:00:00Z",is_example:true}),
 record("未验收",{type:"learning",mastery:"未验收"})
 ];
 const result=L.period(rows,"2026-10-12","2026-10-19",new Date("2026-10-14T12:00:00Z"));
 assert.deepEqual(result.completed.map(r=>r.name),["本周"]);
 assert.equal(result.unconfirmedDone.length,1);assert.equal(result.unverified.length,1);
});
test("跨回顾边界的工作段只计入实际覆盖的用时",()=>{
 const start=new Date("2026-10-12T23:30:00"),end=new Date("2026-10-13T00:30:00");
 const row=record("工作段",{type:"time_session",started_at:start.toISOString(),ended_at:end.toISOString(),duration_minutes:60});
 assert.equal(L.period([row],"2026-10-12","2026-10-13").minutes,30);
 assert.equal(L.period([row],"2026-10-13","2026-10-14").minutes,30);
});
test("计时拒绝倒置设备时间，保留小数分钟",()=>{
 assert.equal(L.sessionMinutes("2026-10-12T10:00:00Z","2026-10-12T10:00:30Z"),0.5);
 assert.throws(()=>L.sessionMinutes("2026-10-12T10:10:00Z","2026-10-12T10:00:00Z"));
});
