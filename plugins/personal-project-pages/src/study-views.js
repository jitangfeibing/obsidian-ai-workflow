"use strict";
module.exports = function studyViews({Modal, Notice, MarkdownRenderChild, TFile, Core, StudyCore, parseYaml, stringifyYaml}) {
  const codec = {parseYaml, stringifyYaml};
  function button(el, text, action, primary = false) {
    const b = el.createEl("button", {text, cls: "pw-button" + (primary ? " pw-primary" : "")});
    b.addEventListener("click", action); return b;
  }
  function field(el, label, tag = "input", value = "", placeholder = "") {
    const wrap = el.createEl("label", {cls: "ps-field"}); wrap.createEl("span", {text: label});
    const input = wrap.createEl(tag, {attr: {"aria-label": label, placeholder}}); input.value = value; return input;
  }
  function choices(el, items, value) {
    for (const [key, text] of items) el.createEl("option", {text, attr: {value: key}});
    el.value = value;
  }
  function open(plugin, file, event) {
    const path = typeof file === "string" ? file : file.path;
    if (!plugin.app.vault.getAbstractFileByPath(path)) { new Notice("文件不存在，请检查当前位置。"); return; }
    void plugin.app.workspace.openLinkText(path, "", Boolean(event?.ctrlKey || event?.metaKey));
  }
  class CreateStudyModal extends Modal {
    constructor(plugin, kind = "learning") { super(plugin.app); this.plugin = plugin; this.kind = kind; }
    onOpen() {
      this.containerEl.addClass("ps-modal"); this.containerEl.addClass("pw-modal"); this.contentEl.createEl("h2", {text: this.kind === "learning" ? "新建学习章节" : "新建知识笔记"});
      this.title = field(this.contentEl, "标题", "input", "", this.kind === "learning" ? "例如：第二章 Agent 工具调用" : "例如：MCP 与工具调用的关系");
      this.topic = field(this.contentEl, this.kind === "learning" ? "学习主题" : "主题（可选）", "input", "", "例如：Agent 或 FastAPI");
      this.source = field(this.contentEl, "资料链接（可选）", "input", "", "https://…");
      this.contentEl.createEl("p", {cls: "pw-muted", text: this.kind === "learning" ? "保存到学习目录下的主题文件夹，沿用章节学习模板。章号由你填写，创建后从未验收开始。" : "保存到学习目录下的「资料」，沿用当前知识模板。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const actions = this.contentEl.createDiv({cls: "pw-actions"});
      this.save = button(actions, "创建并打开", () => { void this.submit(); }, true); button(actions, "取消", () => this.close());
      this.title.focus();
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      let file;
      try { file = await this.plugin.createStudy({kind: this.kind, title: this.title.value, topic: this.topic.value, source: this.source.value}); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
      if (file) { this.close(); open(this.plugin, file); new Notice("已创建：" + file.basename); }
    }
    onClose() { this.contentEl.empty(); }
  }
  class ReviewModal extends Modal {
    constructor(plugin, file, source, kind) { super(plugin.app); this.plugin = plugin; this.file = file; this.source = source; this.kind = kind; this.fm = Core.splitNote(source, codec).fm; }
    onOpen() {
      this.containerEl.addClass("ps-modal"); this.containerEl.addClass("pw-modal"); this.contentEl.createEl("h2", {text: this.kind === "schedule" ? "安排复习" : this.kind === "review" ? "记录本次复习" : this.fm.archived === true ? "恢复笔记" : "归档笔记"});
      this.contentEl.createEl("p", {text: this.file.basename, cls: "pw-muted"});
      if (this.kind === "review") {
        this.date = field(this.contentEl, "实际复习日期", "input", Core.localDate()); this.date.type = "date"; this.date.max = Core.localDate();
        this.question = field(this.contentEl, "问题或实践", "textarea", "", "这次尝试解释或验证什么？");
        this.answer = field(this.contentEl, "实际回答、代码或结果", "textarea", "", "保留实际输出；没有运行代码时，不填写已经运行。");
        this.hint = field(this.contentEl, "提示程度", "select"); choices(this.hint, StudyCore.HINTS.map(s => [s, s]), "未说明");
        this.feedback = field(this.contentEl, "反馈与待解决问题（可选）", "textarea");
      }
      if (this.kind !== "archive") {
        this.next = field(this.contentEl, "下次复习日期（可选）", "input", this.kind === "schedule" ? StudyCore.day(this.fm.next_review) : ""); this.next.type = "date";
        this.contentEl.createEl("p", {text: this.kind === "schedule" ? "这里只调整计划。留空可取消安排；上次实际复习日和掌握程度保持。" : "保存后将原文追加到本笔记，并更新实际复习日。下次日期留空会清除旧安排；掌握程度保持，待依据证据验收。", cls: "pw-muted"});
        if (this.fm.next_review && !StudyCore.day(this.fm.next_review)) this.contentEl.createEl("p", {text: "原复习日期格式无效，请重新选择。", cls: "pph-error"});
      } else this.contentEl.createEl("p", {text: this.fm.archived === true ? "按原类型与原状态恢复显示，原文与复习记录保留。" : "归档后从当前列表收起，可在「已归档」中恢复。学习状态和掌握程度保持。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const actions = this.contentEl.createDiv({cls: "pw-actions"}); this.save = button(actions, "保存", () => { void this.submit(); }, true); button(actions, "取消", () => this.close());
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      const change = this.kind === "archive" ? {kind: "archive", value: this.fm.archived !== true} : {kind: this.kind, next: this.next.value};
      if (this.kind === "review") Object.assign(change, {date: this.date.value, question: this.question.value, answer: this.answer.value, hint: this.hint.value, feedback: this.feedback.value});
      try { await this.plugin.updateStudy(this.file, change, this.source); this.close(); new Notice("已保存：" + this.file.basename); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
    }
    onClose() { this.contentEl.empty(); }
  }
  async function edit(plugin, file, kind) {
    try { new ReviewModal(plugin, file, await plugin.app.vault.read(file), kind).open(); }
    catch (error) { new Notice("无法打开笔记：" + (error.message || String(error))); }
  }
  class StudyPanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath, mode) {
      super(el); this.plugin = plugin; this.file = plugin.app.vault.getAbstractFileByPath(sourcePath); this.mode = mode;
      this.tab = mode === "center" ? "chapters" : "all"; this.query = ""; this.topic = ""; this.limit = 40;
    }
    onload() {
      this.alive = true;
      for (const name of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(name, () => this.queue()));
      for (const name of ["rename", "delete"]) this.registerEvent(this.plugin.app.vault.on(name, () => this.queue()));
      this.registerInterval(window.setInterval(() => { if (this.alive) this.refresh(); }, 60000));
      this.build(); this.refresh();
    }
    onunload() { this.alive = false; window.clearTimeout(this.timer); }
    queue() { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150); }
    build() {
      this.containerEl.empty(); this.containerEl.addClass("pph-workspace"); this.containerEl.addClass("ps-workspace");
      const header = this.containerEl.createDiv({cls: "pw-header"}); const title = header.createDiv();
      title.createDiv({text: "学习 · 实践 · 复习", cls: "pw-kicker"}); this.heading = title.createEl("h2"); this.sub = title.createEl("p", {cls: "pw-muted"}); this.actions = header.createDiv({cls: "pw-actions"});
      this.stats = this.containerEl.createDiv({cls: "pw-stats"}); this.stats.hidden = this.mode === "note";
      if (this.mode !== "note") {
        button(this.actions, "新建章节", () => new CreateStudyModal(this.plugin, "learning").open(), true);
        button(this.actions, "新建知识", () => new CreateStudyModal(this.plugin, "knowledge").open());
        const toolbar = this.containerEl.createDiv({cls: "ps-toolbar"}); this.tabs = toolbar.createDiv({cls: "pw-tabs"});
        const filters = toolbar.createDiv({cls: "pw-filters"}); this.search = filters.createEl("input", {attr: {type: "search", "aria-label": "搜索标题、主题、来源", placeholder: "搜索标题、主题、来源"}});
        this.search.addEventListener("input", () => { this.query = this.search.value; this.limit = 40; this.renderItems(); });
        this.topics = filters.createEl("select", {attr: {"aria-label": "主题筛选"}}); this.topics.addEventListener("change", () => { this.topic = this.topics.value; this.limit = 40; this.renderItems(); });
      }
      this.body = this.containerEl.createDiv({cls: "ps-body"});
    }
    refresh() {
      if (!this.alive) return;
      this.today = Core.localDate(); this.records = this.plugin.studyRecords(this.today);
      this.stats.empty();
      if (this.mode === "note") { this.renderNote(); return; }
      this.heading.setText(this.mode === "center" ? "学习中心" : "知识库");
      this.sub.setText("先留下理解与实践，再根据证据验收。复习按已填写的日期显示。");
      const live = this.records.filter(r => r.fm.archived !== true);
      for (const [value, name] of [[live.filter(r => r.fm.type === "learning").length, "学习章节"], [live.filter(r => StudyCore.pending(r.fm)).length, "待验收"], [live.filter(r => r.reviewGroup === "due").length, "到期复习"], [live.filter(r => r.reviewGroup === "unscheduled").length, "未安排复习"]]) {
        const stat = this.stats.createDiv({cls: "pw-stat"}); stat.createEl("strong", {text: String(value)}); stat.createEl("span", {text: name});
      }
      const values = [...new Set(this.records.map(r => String(r.fm.topic || "")).filter(Boolean))].sort((a,b) => a.localeCompare(b,"zh-CN"));
      if (JSON.stringify(values) !== this.topicKey) {
        this.topicKey = JSON.stringify(values); this.topics.empty(); choices(this.topics, [["", "全部主题"], ...values.map(s => [s, s])], values.includes(this.topic) ? this.topic : ""); this.topic = this.topics.value;
      }
      this.renderItems();
    }
    renderItems() {
      this.tabs.empty(); this.body.empty();
      for (const [key, label] of [["all", "全部"], ["chapters", "章节"], ["pending", "待验收"], ["due", "到期复习"], ["planned", "已安排"], ["unscheduled", "未安排"], ["invalid", "日期异常"], ["archived", "已归档"]]) {
        const b = button(this.tabs, label, () => { this.tab = key; this.limit = 40; this.renderItems(); }); b.setAttr("aria-pressed", String(this.tab === key)); if (this.tab === key) b.addClass("is-active");
      }
      const items = StudyCore.select(this.records, {tab: this.tab, query: this.query, topic: this.topic});
      this.body.createEl("p", {text: "当前筛选 · " + items.length + " 条", cls: "pw-muted"});
      if (!items.length) this.body.createDiv({cls: "pw-empty", text: this.tab === "due" ? "目前没有到期复习。可在笔记卡片中安排日期，未安排的内容保留在「未安排」。" : this.tab === "pending" ? "当前没有符合筛选的待验收章节。掌握结论仍需查看实际回答与实践。" : "当前没有符合筛选的记录，可以切换分类或清空搜索。"});
      const grid = this.body.createDiv({cls: "pw-grid ps-grid"});
      for (const r of items.slice(0, this.limit)) {
        const card = grid.createEl("article", {cls: "pw-card ps-card"}); const top = card.createDiv({cls: "ps-card-top"});
        top.createEl("span", {text: ({learning:"章节", knowledge:"知识", resource:"资料"})[r.fm.type], cls: "pw-badge"});
        top.createEl("span", {text: String(r.fm.topic || "未填主题"), cls: "pw-muted"});
        const link = card.createEl("a", {text: r.file.basename, cls: "ps-title internal-link", attr: {href: r.file.path, "data-href": r.file.path}});
        link.addEventListener("click", e => {e.preventDefault(); open(this.plugin, r.file, e);});
        card.createEl("p", {text: "掌握：" + String(r.fm.mastery || "未记录") + " · 状态：" + String(r.fm.status || "未记录"), cls: "pw-muted"});
        card.createEl("p", {text: "复习：" + (r.reviewGroup === "invalid" ? "日期异常，请核对属性" : StudyCore.day(r.fm.next_review) || "尚未安排") + " · 上次：" + (StudyCore.day(r.fm.last_review) || "未记录"), cls: "ps-review-date"});
        if (r.sources.length) { const a = card.createEl("a", {text: "查看来源 ↗", attr: {href: r.sources[0], target:"_blank", rel:"noopener noreferrer"}, cls: "ps-source"}); a.setAttr("aria-label", "查看来源：" + r.file.basename); }
        const actions = card.createDiv({cls: "pw-actions"});
        if (r.fm.archived !== true) { button(actions, "安排复习", () => {void edit(this.plugin,r.file,"schedule");}); button(actions, "记录复习", () => {void edit(this.plugin,r.file,"review");}); }
        button(actions, r.fm.archived === true ? "恢复" : "归档", () => {void edit(this.plugin,r.file,"archive");});
      }
      if (items.length > this.limit) button(this.body, "再显示 40 条", () => {this.limit += 40;this.renderItems();});
    }
    renderNote() {
      this.actions.empty(); this.body.empty(); const file = this.file;
      if (!(file instanceof TFile) || this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) { this.heading.setText("笔记已变化"); return; }
      const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (!StudyCore.inScope(file, fm, this.plugin.settings.root)) { this.heading.setText("学习笔记入口"); this.sub.setText("此入口在实际章节、知识与资料笔记中显示。"); return; }
      this.heading.setText(file.basename); this.sub.setText(String(fm.topic || "未填主题") + " · 掌握程度：" + String(fm.mastery || "未记录") + (fm.archived === true ? " · 已归档" : ""));
      button(this.actions, "学习中心", () => open(this.plugin, this.plugin.settings.root + "/04_学习/学习中心.md"));
      if (fm.archived !== true) { button(this.actions, "安排复习", () => {void edit(this.plugin,file,"schedule");}); button(this.actions,"记录复习",()=>{void edit(this.plugin,file,"review");},true); }
      button(this.actions, fm.archived === true ? "恢复" : "归档",()=>{void edit(this.plugin,file,"archive");});
      this.body.createEl("p", {text: "上次实际复习：" + (StudyCore.day(fm.last_review) || "未记录") + "　下次计划：" + (StudyCore.day(fm.next_review) || (fm.next_review ? "日期异常" : "未安排")), cls: "ps-review-date"});
      const nav = this.body.createDiv({cls:"pw-actions"});
      const hs = this.plugin.app.metadataCache.getFileCache(file)?.headings || [];
      for (const h of hs.filter(h => /资料|来源|原始|实践|验收|Recall|复习|Notes|笔记|Summary|总结|下一步/i.test(h.heading)).slice(0,10)) button(nav,h.heading.replace(/\*/g,""),()=>{void this.plugin.app.workspace.openLinkText(file.path + "#" + h.heading,file.path,false);});
      this.body.createEl("p", {text:"正文保留来源、原始回答、代码与验收依据；安排日期和记录复习均不会自动提升掌握程度。", cls:"pw-muted"});
    }
  }
  return {StudyPanel, CreateStudyModal, ReviewModal};
};
