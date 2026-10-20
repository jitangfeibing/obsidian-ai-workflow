"use strict";
module.exports = function projectViews({Modal, Setting, Notice, MarkdownRenderChild, TFile, setIcon, Core, ProjectCore, parseYaml, stringifyYaml, CreatePageModal}) {
  const codec = {parseYaml, stringifyYaml};
  function button(parent, text, fn, cls = "pw-button", icon) {
    const el = parent.createEl("button", {cls, attr: {type: "button"}});
    if (icon) { const i = el.createEl("span", {cls: "pw-icon", attr: {"aria-hidden": "true"}}); setIcon(i, icon); }
    el.createEl("span", {text}); el.addEventListener("click", fn); return el;
  }
  async function open(plugin, path, event, heading) {
    event?.preventDefault(); event?.stopPropagation();
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { new Notice("未找到页面，请检查文件列表：" + path); return; }
    try {
      if (heading) await plugin.app.workspace.openLinkText(file.path + "#" + heading, file.path, Boolean(event?.ctrlKey || event?.metaKey));
      else await plugin.app.workspace.getLeaf(Boolean(event?.ctrlKey || event?.metaKey)).openFile(file);
    } catch (error) { new Notice("打开失败：" + (error.message || String(error))); }
  }
  function link(plugin, parent, file, text, cls = "pw-link") {
    const el = parent.createEl("a", {text: text || file.basename, cls, attr: {href: file.path, "data-href": file.path}});
    el.addEventListener("click", event => { void open(plugin, file.path, event); }); return el;
  }
  function options(select, entries, value) { for (const [key, label] of entries) select.createEl("option", {text: label, attr: {value: key}}); select.value = value; }
  class RecordModal extends Modal {
    constructor(plugin, file, fm, mode) { super(plugin.app); this.plugin = plugin; this.file = file; this.fm = fm; this.mode = mode; this.busy = false; this.expected = ProjectCore.expected(fm); }
    onOpen() {
      this.contentEl.addClass("pw-modal");
      const titles = {summary: "下一步与卡点", status: "修改状态", parent: "调整所属页面", archive: this.fm.archived === true ? "恢复页面" : "归档页面"};
      this.contentEl.createEl("h2", {text: titles[this.mode]}); this.contentEl.createEl("p", {text: this.file.basename, cls: "pw-muted"});
      if (this.mode === "summary") {
        for (const [key, label, placeholder] of [["next_action", "下一步", "下一次打开这个项目时，先做哪件事？"], ["blocker", "当前卡点", "有明确卡点时再填写，可留空。"]]) {
          this.contentEl.createEl("label", {text: label}); this[key] = this.contentEl.createEl("textarea", {attr: {rows: "3", placeholder, "aria-label": label}});
          this[key].value = typeof this.fm[key] === "string" ? this.fm[key] : "";
        }
        this.contentEl.createEl("p", {text: "下一步会同步显示在首页与项目卡片；详细过程和证据继续写在正文。", cls: "pw-muted"});
      }
      if (this.mode === "status") {
        const states = this.fm.type === "task" ? ["未整理", "待办", "日程", "进行中", "正在进行", "等待", "暂停", "将来也许", "完成", "已取消"] : this.fm.type === "project" ? ["未开始", "进行中", "暂停", "完成", "已取消"] : ["草稿", "进行中", "待确认", "已定稿"];
        if (this.fm.status && !states.includes(String(this.fm.status))) states.unshift(String(this.fm.status));
        this.contentEl.createEl("label", {text: "状态"}); this.status = this.contentEl.createEl("select", {attr: {"aria-label": "状态"}}); options(this.status, states.map(s => [s, s]), String(this.fm.status || states[0]));
        if (this.fm.type === "task") {
          this.completion = this.contentEl.createDiv({cls: "pw-completion"}); this.completion.createEl("label", {text: "完成日期（不知道可留空）"});
          this.completedDate = this.completion.createEl("input", {attr: {type: "date", "aria-label": "完成日期"}}); this.completedDate.value = ProjectCore.day(this.fm.completed);
          const row = this.completion.createEl("label", {cls: "pw-check"}); this.finishedNow = row.createEl("input", {attr: {type: "checkbox"}}); row.createEl("span", {text: "记为刚刚完成，填写当前日期和时间"});
          const refresh = () => { this.completion.hidden = !ProjectCore.done({status: this.status.value}); if (this.completion.hidden) this.finishedNow.checked = false; };
          this.status.addEventListener("change", refresh); refresh();
          this.contentEl.createEl("p", {text: "历史完成记录不补造时间。改回未完成状态时，会清空当前完成日期与时间，过程正文保留。计时中的任务需先通过原计时工具暂停或结束。", cls: "pw-muted"});
        }
      }
      if (this.mode === "parent") {
        const index = this.plugin.projectIndex(), blocked = new Set([this.file.path, ...ProjectCore.descendants(index, this.file).map(r => r.file.path)]);
        const parents = index.records.filter(r => ["project", "project_doc"].includes(r.fm.type) && r.fm.archived !== true && !blocked.has(r.file.path));
        this.contentEl.createEl("label", {text: "所属项目或父文档"}); this.parentSelect = this.contentEl.createEl("select", {attr: {"aria-label": "所属项目或父文档"}});
        const current = index.parents.get(this.file.path)?.[0]?.file.path || "";
        options(this.parentSelect, [["", this.fm.type === "project_doc" ? "请选择所属页面" : "独立记录 / 暂不关联"], ...parents.map(r => [r.file.path, (r.fm.type === "project" ? "项目 · " : "文档 · ") + r.file.basename])], current);
        this.contentEl.createEl("p", {text: "保存后更新当前笔记的 parent；正文和文件位置保留。多父级记录会替换为本次选定的一个父级。", cls: "pw-muted"});
      }
      if (this.mode === "archive") this.contentEl.createEl("p", {text: this.fm.archived === true ? "恢复后按原类型与原状态重新显示。" : "归档只收起当前页面，子项保持各自状态。不会将记录标为完成；可以从项目中心的已归档筛选或归档中心恢复。"});
      this.error = this.contentEl.createDiv({cls: "pph-error", attr: {"aria-live": "polite"}});
      const controls = this.contentEl.createDiv({cls: "pw-actions"});
      this.save = button(controls, this.mode === "archive" ? (this.fm.archived === true ? "恢复本页" : "归档本页") : "保存", () => { void this.submit(); }, "pw-button pw-primary");
      button(controls, "取消", () => this.close());
    }
    async submit() {
      if (this.busy) return; this.busy = true; this.save.disabled = true; this.error.setText("");
      let change;
      if (this.mode === "summary") change = {kind: "summary", next_action: this.next_action.value, blocker: this.blocker.value};
      if (this.mode === "status") {
        change = {kind: "status", status: this.status.value};
        if (this.fm.type === "task" && ProjectCore.done({status: change.status})) { change.completedDate = this.completedDate.value; change.finishedNow = this.finishedNow.checked; }
      }
      if (this.mode === "parent") change = {kind: "parent", parentPath: this.parentSelect.value};
      if (this.mode === "archive") change = {kind: "archive", value: this.fm.archived !== true};
      try { await this.plugin.updateProjectRecord(this.file, change, this.expected); this.close(); new Notice("已保存：" + this.file.basename); }
      catch (error) { this.error.setText(error.message || String(error)); }
      finally { this.busy = false; this.save.disabled = false; }
    }
    onClose() { this.contentEl.empty(); }
  }
  async function editRecord(plugin, file, mode) {
    try {
      const fm = Core.splitNote(await plugin.app.vault.read(file), codec).fm;
      new RecordModal(plugin, file, fm, mode).open();
    } catch (error) { new Notice("无法读取页面：" + (error.message || String(error))); }
  }
  class WorkspacePanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath, mode) { super(el); this.plugin = plugin; this.source = plugin.app.vault.getAbstractFileByPath(sourcePath); this.mode = mode; this.tab = mode === "workspace" ? "projects" : "overview"; this.filter = "all"; this.query = ""; }
    onload() {
      this.alive = true;
      for (const name of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(name, () => this.queue()));
      for (const name of ["rename", "delete"]) this.registerEvent(this.plugin.app.vault.on(name, () => this.queue()));
      this.build(); this.refresh();
    }
    onunload() { this.alive = false; window.clearTimeout(this.timer); }
    queue() { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150); }
    module(relative, event) { return open(this.plugin, this.plugin.settings.root + "/" + relative, event); }
    action(el, label, kind, file, locked, icon) { return button(el, label, () => new CreatePageModal(this.plugin, kind, file, locked).open(), "pw-button", icon); }
    build() {
      const el = this.containerEl; el.empty(); el.addClass("pph-workspace"); if (this.mode === "workspace") el.addClass("pw-center");
      this.crumbs = el.createEl("nav", {cls: "pw-breadcrumb", attr: {"aria-label": "所在位置"}});
      const header = el.createDiv({cls: "pw-header"}); const title = header.createDiv(); this.kicker = title.createDiv({cls: "pw-kicker"}); this.heading = title.createEl("h2"); this.subtitle = title.createEl("p", {cls: "pw-muted"});
      this.headActions = header.createDiv({cls: "pw-actions"});
      this.stats = el.createDiv({cls: "pw-stats"}); this.toolbar = el.createDiv({cls: "pw-toolbar"}); this.tabEl = this.toolbar.createDiv({cls: "pw-tabs"});
      if (this.mode === "workspace") {
        const filters = this.toolbar.createDiv({cls: "pw-filters"});
        this.search = filters.createEl("input", {attr: {type: "search", placeholder: "搜索项目或文档", "aria-label": "搜索项目或文档"}});
        this.search.addEventListener("input", () => { this.query = this.search.value; this.renderList(); });
        this.statusFilter = filters.createEl("select", {attr: {"aria-label": "筛选状态"}}); options(this.statusFilter, [["all", "全部状态"], ["active", "进行中"], ["pending", "待启动 / 草稿"], ["done", "已完成"], ["archived", "已归档"]], this.filter);
        this.statusFilter.addEventListener("change", () => { this.filter = this.statusFilter.value; this.renderList(); });
      }
      this.content = el.createDiv({cls: "pw-content"}); this.footer = el.createDiv({cls: "pw-footer"});
    }
    refresh() {
      this.index = this.plugin.projectIndex();
      this.crumbs.empty(); this.headActions.empty(); this.stats.empty(); this.footer.empty();
      button(this.crumbs, "首页", event => { void this.module("00_首页.md", event); }, "pw-text-button");
      if (this.mode === "workspace") {
        this.crumbs.createEl("span", {text: "/ 项目中心"}); this.kicker.setText("PROJECT WORKSPACE"); this.heading.setText("目标与项目"); this.subtitle.setText("明确下一步，把过程和成果留在同一个项目里。");
        this.action(this.headActions, "新建项目", "project", null, false, "folder-plus"); this.action(this.headActions, "项目文档", "doc", null, false, "file-plus"); this.action(this.headActions, "新建收集", "capture", null, false, "inbox");
        const live = this.index.records.filter(r => r.fm.archived !== true);
        this.stat(this.stats, "推进中的项目", live.filter(r => r.fm.type === "project" && ProjectCore.active(r.fm)).length);
        this.stat(this.stats, "未完成任务", live.filter(r => r.fm.type === "task" && !ProjectCore.done(r.fm) && !ProjectCore.cancelled(r.fm)).length);
        this.stat(this.stats, "项目文档", live.filter(r => r.fm.type === "project_doc").length);
        button(this.footer, "归档中心", event => { void this.module("07_回顾/归档中心.md", event); }, "pw-text-button", "archive");
        button(this.footer, "项目使用说明", event => { void this.module("92_AI协作/项目页面助手使用.md", event); }, "pw-text-button", "circle-help");
        const seenGoals = new Set();
        for (const entry of (this.source instanceof TFile ? this.plugin.app.metadataCache.getFileCache(this.source)?.links : null) || []) {
          const goal = this.plugin.app.metadataCache.getFirstLinkpathDest(entry.link, this.source.path);
          if (goal && this.plugin.app.metadataCache.getFileCache(goal)?.frontmatter?.type === "goal" && !seenGoals.has(goal.path)) { seenGoals.add(goal.path); link(this.plugin, this.footer, goal, goal.basename); }
        }
      } else {
        button(this.crumbs, "项目中心", event => { void this.module("03_目标与项目/目标与项目.md", event); }, "pw-text-button");
        this.current = this.source instanceof TFile && this.index.byPath.get(this.source.path);
        if (!this.current) { this.heading.setText("项目工作区"); this.subtitle.setText("此处只展示个人系统中的实际项目和项目文档。"); this.content.empty(); return; }
        const {file, fm} = this.current, trail = ProjectCore.trail(this.index, file);
        for (const parent of trail.chain) { this.crumbs.createEl("span", {text: "/"}); link(this.plugin, this.crumbs, parent.file, parent.file.basename); }
        this.kicker.setText((fm.type === "project_doc" ? "项目文档" : "项目") + " · " + String(fm.status || "未设置状态") + (fm.archived === true ? " · 已归档" : "")); this.heading.setText(file.basename);
        this.subtitle.setText(trail.cycle ? "父级链路存在循环或层级过深，请通过“所属页面”检查。" : "目标、下一步与关联记录，集中查看。");
        if (fm.archived !== true) {
          if (fm.type === "project_doc") this.action(this.headActions, "子文档", "doc", file, true, "file-plus");
          else { this.action(this.headActions, "子任务", "task", file, true, "plus"); this.action(this.headActions, "项目文档", "doc", file, true, "file-plus"); this.action(this.headActions, "子项目", "project", file, true, "folder-plus"); }
          if (fm.type === "project") button(this.headActions, "下一步", () => { void editRecord(this.plugin, file, "summary"); }, "pw-button pw-primary", "arrow-right");
        }
        this.related = ProjectCore.descendants(this.index, file); const stats = ProjectCore.taskStats(this.related);
        this.stat(this.stats, "未归档待办", stats.open); this.stat(this.stats, "关联文档", this.related.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true).length); this.stat(this.stats, "任务完成（含归档）", stats.done + " / " + stats.total);
        if (fm.archived !== true) {
          button(this.footer, "修改状态", () => { void editRecord(this.plugin, file, "status"); }, "pw-text-button");
          button(this.footer, "所属页面", () => { void editRecord(this.plugin, file, "parent"); }, "pw-text-button");
        }
        button(this.footer, fm.archived === true ? "恢复本页" : "归档本页", () => { void editRecord(this.plugin, file, "archive"); }, "pw-text-button", "archive");
      }
      this.renderTabs(); this.renderList();
    }
    stat(parent, label, value) { const item = parent.createDiv({cls: "pw-stat"}); item.createEl("span", {text: label}); item.createEl("strong", {text: String(value)}); }
    renderTabs() {
      this.tabEl.empty(); const detail = this.mode !== "workspace", related = this.related || [];
      const entries = detail ? [["overview", "概览"], ["tasks", "任务 " + related.filter(r => r.fm.type === "task" && r.fm.archived !== true).length], ["docs", "文档 " + related.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true).length], ["projects", "子项目"], ["archived", "已归档 " + related.filter(r => r.fm.archived === true).length]] : [["projects", "项目"], ["docs", "项目文档"], ["unlinked", "可关联 " + this.index.unlinked.length]];
      for (const [key, text] of entries) { const el = button(this.tabEl, text, () => { this.tab = key; this.renderTabs(); this.renderList(); }, "pw-tab"); el.setAttr("aria-pressed", String(this.tab === key)); }
    }
    renderList() {
      this.content.empty(); if (!this.index) return;
      if (this.mode !== "workspace" && !this.current) return;
      if (this.mode !== "workspace" && this.tab === "overview") { this.overview(); return; }
      let items;
      if (this.mode === "workspace") {
        items = this.tab === "unlinked" ? this.index.unlinked : this.index.records.filter(r => r.fm.type === (this.tab === "docs" ? "project_doc" : "project"));
        items = items.filter(r => this.filter === "archived" ? r.fm.archived === true : r.fm.archived !== true);
        if (this.filter === "active") items = items.filter(r => ProjectCore.active(r.fm));
        if (this.filter === "pending") items = items.filter(r => ProjectCore.pending(r.fm));
        if (this.filter === "done") items = items.filter(r => ProjectCore.done(r.fm));
        const q = this.query.trim().toLocaleLowerCase(); if (q) items = items.filter(r => (r.file.basename + " " + String(r.fm.next_action || "")).toLocaleLowerCase().includes(q));
        this.content.createEl("p", {text: this.tab === "unlinked" ? "独立任务可以保持现状；需要归入项目时，选择“关联”。无效父链接也会列在这里供检查。" : "显示 " + items.length + " 条 · 状态沿用原笔记", cls: "pw-caption"});
      } else items = this.related.filter(r => this.tab === "archived" ? r.fm.archived === true : r.fm.archived !== true && r.fm.type === ({tasks: "task", docs: "project_doc", projects: "project"})[this.tab]);
      if (!items.length) { this.content.createEl("p", {text: this.tab === "unlinked" ? "当前没有需要补关联的任务或文档。" : this.tab === "tasks" ? "当前没有未归档任务。已有完成记录可在“已归档”查看；需要新行动时用上方“子任务”创建。" : "当前没有符合筛选的记录。", cls: "pw-empty"}); return; }
      const cards = this.content.createDiv({cls: this.mode === "workspace" && this.tab === "projects" ? "pw-card-grid" : "pw-record-list"});
      for (const record of items) this.card(cards, record);
    }
    card(parent, record) {
      const {file, fm} = record, card = parent.createEl("article", {cls: "pw-card"});
      const heading = card.createDiv({cls: "pw-card-heading"}); link(this.plugin, heading, file); heading.createEl("span", {text: String(fm.status || "未设置状态"), cls: "pw-badge"});
      const parents = this.index.parents.get(file.path) || [], meta = card.createDiv({cls: "pw-card-meta"}); meta.createEl("span", {text: ({project: "项目", project_doc: "项目文档", task: "任务"})[fm.type] + (fm.archived === true ? " · 已归档" : "")});
      for (const p of parents) link(this.plugin, meta, p.file, "所属：" + p.file.basename);
      if (record.parentIssues?.length) meta.createEl("span", {text: "父链接待检查"});
      if (fm.type === "project") {
        const all = ProjectCore.descendants(this.index, file), stats = ProjectCore.taskStats(all), docs = all.filter(r => r.fm.type === "project_doc" && r.fm.archived !== true);
        card.createEl("p", {text: typeof fm.next_action === "string" && fm.next_action ? fm.next_action : "打开项目，查看目标与下一步。", cls: "pw-card-summary"});
        const info = card.createDiv({cls: "pw-card-info"}); info.createEl("span", {text: stats.total ? "关联任务 " + stats.done + "/" + stats.total + "（含归档）" : "暂无关联任务"}); info.createEl("span", {text: "文档 " + docs.length});
        if (stats.total) { const bar = card.createEl("progress", {attr: {max: String(stats.total), value: String(stats.done), "aria-label": "关联任务完成数量，含归档"}}); bar.setAttr("title", "按关联任务状态计算，不代表整个项目验收。"); }
        if (docs.length) { const links = card.createDiv({cls: "pw-doc-chips"}); for (const doc of docs.slice(0, 2)) link(this.plugin, links, doc.file, doc.file.basename, "pw-doc-chip"); }
      } else if (fm.type === "task") {
        const details = [fm.priority === true ? "优先" : "", fm.due ? "截止 " + String(fm.due).slice(0, 10) : "", ProjectCore.done(fm) ? (fm.completed || fm.completed_at ? "完成 " + String(fm.completed || fm.completed_at).slice(0, 10) : "完成日期未记录") : ""].filter(Boolean);
        if (details.length) card.createEl("p", {text: details.join(" · "), cls: "pw-caption"});
      }
      const actions = card.createDiv({cls: "pw-row-actions"});
      if (fm.archived !== true) {
        button(actions, "状态", () => { void editRecord(this.plugin, file, "status"); }, "pw-text-button");
        button(actions, "关联", () => { void editRecord(this.plugin, file, "parent"); }, "pw-text-button");
      }
      button(actions, fm.archived === true ? "恢复" : "归档", () => { void editRecord(this.plugin, file, "archive"); }, "pw-text-button");
    }
    overview() {
      const {file, fm} = this.current; const grid = this.content.createDiv({cls: "pw-overview-grid"});
      const next = grid.createDiv({cls: "pw-note-card pw-next"}); next.createEl("h3", {text: "下一步"});
      next.createEl("p", {text: typeof fm.next_action === "string" && fm.next_action ? fm.next_action : (fm.type === "project_doc" ? "在正文写清目的、内容与结论；需要更细的记录时创建子文档。" : "填写一个下次能直接开始的行动，首页和项目卡片会一起显示。")});
      if (fm.type === "project" && fm.archived !== true) button(next, fm.next_action ? "调整下一步" : "填写下一步", () => { void editRecord(this.plugin, file, "summary"); }, "pw-text-button");
      const blocker = grid.createDiv({cls: "pw-note-card"}); blocker.createEl("h3", {text: "当前卡点"}); blocker.createEl("p", {text: typeof fm.blocker === "string" && fm.blocker ? fm.blocker : "尚未填写卡点摘要。具体问题和处理证据保留在正文与项目文档里。"});
      const nav = this.content.createDiv({cls: "pw-body-nav"}); nav.createEl("h3", {text: "正文与验收"});
      const headings = (this.plugin.app.metadataCache.getFileCache(file)?.headings || []).filter(h => h.level <= 2 && !["子项", "子文档", "项目子项"].includes(h.heading)).slice(0, 9);
      for (const h of headings) button(nav, h.heading, event => { void open(this.plugin, file.path, event, h.heading); }, "pw-anchor");
      if (!headings.length) nav.createEl("p", {text: "继续在下方正文记录目标、完成标准、过程与实际成果。", cls: "pw-muted"});
      this.content.createEl("p", {text: "关联项包含下层项目和文档。任务完成数按任务记录计算，项目是否验收通过仍以实际成果与标准为准。", cls: "pw-caption"});
      if (this.current.parentIssues?.length) this.content.createEl("p", {text: "此页有无法解析的父链接，可通过下方“所属页面”调整。", cls: "pw-caption"});
    }
  }
  return {WorkspacePanel, RecordModal, editRecord};
};
