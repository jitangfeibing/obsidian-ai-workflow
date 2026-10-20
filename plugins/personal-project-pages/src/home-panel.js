"use strict";
module.exports = function buildHomePanel({MarkdownRenderChild, TFile, Notice, setIcon, Core, HomeCore, CreatePageModal}) {
  return class HomePanel extends MarkdownRenderChild {
    constructor(plugin, el, sourcePath) {
      super(el); this.plugin = plugin; this.sourcePath = sourcePath; this.tab = "project"; this.alive = false; this.busy = false;
    }
    onload() {
      this.alive = true;
      for (const event of ["changed", "resolved"]) this.registerEvent(this.plugin.app.metadataCache.on(event, () => this.queue()));
      for (const event of ["delete", "rename"]) this.registerEvent(this.plugin.app.vault.on(event, () => this.queue()));
      this.build(); this.refresh();
      this.registerInterval(window.setInterval(() => this.refresh(), 60000));
    }
    onunload() {
      this.alive = false; window.clearTimeout(this.timer);
      void this.plugin.flushHomeDraft().catch(() => new Notice("随手记草稿未能保存，请重新打开首页核对。"));
    }
    queue() {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => { if (this.alive) this.refresh(); }, 150);
    }
    icon(el, name) { const span = el.createEl("span", {cls: "hp-icon", attr: {"aria-hidden": "true"}}); setIcon(span, name); }
    button(parent, text, cls, action, icon) {
      const button = parent.createEl("button", {cls, attr: {type: "button"}});
      if (icon) this.icon(button, icon);
      button.createEl("span", {text});
      button.addEventListener("click", action);
      return button;
    }
    path(relative) { return this.plugin.settings.root + "/" + relative; }
    async open(path, event) {
      event?.preventDefault(); event?.stopPropagation();
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) { new Notice("未找到页面，请在文件列表中确认位置：" + path); return; }
      try { await this.plugin.app.workspace.getLeaf(Boolean(event?.ctrlKey || event?.metaKey)).openFile(file); }
      catch (error) { new Notice("打开失败：" + (error.message || String(error))); }
    }
    link(parent, file, label, cls = "hp-link") {
      const link = parent.createEl("a", {text: label || file.basename, cls, attr: {href: file.path, "data-href": file.path}});
      link.addEventListener("click", event => { void this.open(file.path, event); });
      return link;
    }
    build() {
      const el = this.containerEl; el.empty(); el.addClass("pph-home");
      const cover = el.createDiv({cls: "hp-cover"});
      const asset = (this.plugin.app.vault.configDir || ".obsidian") + "/plugins/" + this.plugin.manifest.id + "/assets/forest-banner.png";
      cover.createEl("img", {attr: {src: this.plugin.app.vault.adapter.getResourcePath(asset), alt: "晨雾里的山林与湖泊", draggable: "false"}});
      const badge = cover.createDiv({cls: "hp-date"}); this.dateBadge = badge;
      this.dateMonth = badge.createDiv({cls: "hp-date-month"});
      this.dateDay = badge.createDiv({cls: "hp-date-day"});
      this.dateWeek = badge.createDiv({cls: "hp-date-week"});
      const content = el.createDiv({cls: "hp-content"});
      const heading = content.createDiv({cls: "hp-heading"});
      const title = heading.createDiv(); title.createEl("h1", {text: "Carl 的个人空间"});
      title.createEl("p", {text: "写下想法，推进项目，留下积累。"});
      const actions = heading.createDiv({cls: "hp-actions"});
      for (const [label, kind, icon] of [["新建收集", "capture", "plus"], ["新建项目", "project", "folder-plus"], ["项目文档", "doc", "file-plus"]]) {
        this.button(actions, label, "hp-action", () => new CreatePageModal(this.plugin, kind, null, false).open(), icon);
      }
      const nav = content.createEl("nav", {cls: "hp-navigation", attr: {"aria-label": "个人系统模块"}});
      const groups = [
        ["记录", [["收集箱", "01_收集/收集箱.md", "inbox"], ["生活记录", "08_生活/生活记录.md", "notebook-pen"]]],
        ["行动", [["项目", "03_目标与项目/目标与项目.md", "folder"], ["任务", "02_行动/事务执行.md", "square-check"]]],
        ["学习", [["章节学习", "04_学习/学习中心.md", "book-open"], ["知识库", "04_学习/知识库.md", "library"]]],
        ["回顾", [["回顾中心", "07_回顾/回顾中心.md", "calendar-days"], ["归档中心", "07_回顾/归档中心.md", "archive"]]]
      ];
      for (const [label, entries] of groups) {
        const section = nav.createEl("section"); section.createEl("h2", {text: label});
        for (const [text, relative, icon] of entries) this.button(section, text, "hp-nav-button", event => { void this.open(this.path(relative), event); }, icon);
      }
      const board = content.createDiv({cls: "hp-board"}); const main = board.createEl("section", {cls: "hp-overview"});
      const sectionHeading = main.createDiv({cls: "hp-section-heading"});
      this.listHeading = sectionHeading.createEl("h2");
      const tabs = sectionHeading.createDiv({cls: "hp-tabs", attr: {"aria-label": "首页速览"}}); this.tabs = new Map();
      for (const [key, label] of [["project", "项目"], ["learning", "学习"], ["review", "回顾"]]) {
        const button = this.button(tabs, label, "hp-tab", () => { this.tab = key; this.refreshList(); });
        this.tabs.set(key, button);
      }
      this.list = main.createDiv({cls: "hp-list"});
      this.more = main.createDiv({cls: "hp-more"});
      const aside = board.createEl("aside", {cls: "hp-aside"});
      const quiet = aside.createDiv({cls: "hp-mini-panel hp-today"});
      quiet.createEl("h2", {text: "今天，留一点空间"});
      quiet.createEl("p", {text: "先记下，再慢慢理清。", cls: "hp-quiet"});
      this.todayStats = quiet.createDiv({cls: "hp-today-stats"});
      const capture = aside.createDiv({cls: "hp-mini-panel"}); capture.createEl("h2", {text: "随手记"});
      this.textarea = capture.createEl("textarea", {cls: "hp-note", attr: {placeholder: "一个想法、一件小事，或者一个还没想明白的问题……", "aria-label": "随手记内容", rows: "4"}});
      this.textarea.value = typeof this.plugin.settings.homeDraft === "string" ? this.plugin.settings.homeDraft : "";
      const footer = capture.createDiv({cls: "hp-note-footer"}); this.counter = footer.createEl("span");
      this.saveButton = this.button(footer, "存入收集箱", "hp-save", () => { void this.saveCapture(); }, "arrow-right");
      this.message = capture.createDiv({cls: "hp-message", attr: {"aria-live": "polite"}});
      this.textarea.addEventListener("input", () => { this.plugin.updateHomeDraft(this.textarea.value); this.updateCounter(); });
      this.textarea.addEventListener("blur", () => { void this.plugin.flushHomeDraft().catch(() => new Notice("草稿未能保存，请保留输入内容后重试。")); });
      this.updateCounter();
      const bottom = content.createEl("nav", {cls: "hp-bottom", attr: {"aria-label": "更多模块"}});
      for (const [label, relative, icon] of [["求职", "05_求职/求职中心.md", "briefcase-business"], ["刷题", "06_刷题/刷题中心.md", "code"], ["生活", "08_生活/生活记录.md", "leaf"], ["AI 协作", "92_AI协作/AI 协作约定.md", "sparkles"], ["使用说明", "92_AI协作/首页工作台使用.md", "circle-help"]]) {
        this.button(bottom, label, "hp-bottom-link", event => { void this.open(this.path(relative), event); }, icon);
      }
    }
    refresh() {
      const now = new Date(), today = Core.localDate(now);
      const parts = today.split("-");
      this.dateMonth.setText(parts[0] + " / " + parts[1]); this.dateDay.setText(parts[2]);
      const week = new Intl.DateTimeFormat("zh-CN", {timeZone: "Asia/Shanghai", weekday: "long"}).format(now);
      this.dateWeek.setText(week); this.dateBadge.setAttr("aria-label", today + "，" + week);
      this.records = HomeCore.collect(this.plugin.app.vault.getMarkdownFiles(), file => this.plugin.app.metadataCache.getFileCache(file)?.frontmatter, this.plugin.settings.root, today);
      this.todayStats.empty();
      const {captures, dueTasks, reviews} = this.records;
      for (const [count, label, path] of [[captures.length, "待整理", "01_收集/收集箱.md"], [dueTasks.length, "任务到期", "02_行动/事务执行.md"], [reviews.length, "待复习", "07_回顾/回顾中心.md"]]) {
        const button = this.button(this.todayStats, label, "hp-stat", event => { void this.open(this.path(path), event); });
        button.createEl("strong", {text: String(count)});
      }
      this.refreshList();
    }
    refreshList() {
      if (!this.records) return;
      this.list.empty(); this.more.empty();
      for (const [key, button] of this.tabs) button.setAttr("aria-pressed", String(key === this.tab));
      if (this.tab === "project") {
        const all = this.records.projects; this.listHeading.setText("项目速览 · " + all.length);
        for (const {file, fm} of all.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-project"});
          const heading = row.createDiv({cls: "hp-project-title"}); this.link(heading, file);
          if (fm.status) heading.createEl("span", {text: String(fm.status), cls: "hp-status"});
          const children = this.plugin.children(file).filter(c => HomeCore.visible(c.file, this.plugin.app.metadataCache.getFileCache(c.file)?.frontmatter || {}, this.plugin.settings.root));
          const docs = children.filter(c => c.type === "project_doc");
          const summary = typeof fm.next_action === "string" && fm.next_action.trim() ? fm.next_action : (docs.length ? docs.length + " 篇项目文档" : "打开项目，查看目标与下一步。");
          row.createEl("p", {text: summary, cls: "hp-quiet"});
          if (docs.length) { const links = row.createDiv({cls: "hp-docs"}); for (const doc of docs.slice(0, 2)) this.link(links, doc.file, doc.file.basename, "hp-doc"); }
        }
        if (!all.length) this.empty("还没有未归档项目。点上方“新建项目”，写下想推进的目标。");
        this.moduleLink("查看全部项目 →", "03_目标与项目/目标与项目.md");
      } else if (this.tab === "learning") {
        const all = this.records.learning; this.listHeading.setText("学习与积累 · " + all.length);
        for (const {file, fm} of all.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-resource"}); this.link(row, file);
          const tags = [fm.topic, fm.mastery, fm.status].filter(v => typeof v === "string" && v.trim());
          const due = HomeCore.day(fm.next_review); if (due) tags.push("复习 " + due);
          if (tags.length) row.createEl("p", {text: tags.join(" · "), cls: "hp-quiet"});
        }
        if (!all.length) this.empty("学习笔记和知识记录会显示在这里。");
        this.moduleLink("打开学习中心 →", "04_学习/学习中心.md");
      } else {
        this.listHeading.setText("需要回看");
        const due = [...this.records.dueTasks.map(r => ({...r, label: "任务到期 · " + HomeCore.day(r.fm.due)})), ...this.records.reviews.map(r => ({...r, label: "安排复习 · " + HomeCore.day(r.fm.next_review)}))];
        for (const {file, label} of due.slice(0, 5)) {
          const row = this.list.createDiv({cls: "hp-resource"}); this.link(row, file); row.createEl("p", {text: label, cls: "hp-quiet"});
        }
        if (!due.length) this.empty("当前没有到期任务或到期复习。可以到回顾中心整理这周的收获。");
        this.moduleLink("打开回顾中心 →", "07_回顾/回顾中心.md");
      }
    }
    moduleLink(label, relative) { this.button(this.more, label, "hp-more-link", event => { void this.open(this.path(relative), event); }); }
    empty(message) { this.list.createEl("p", {text: message, cls: "hp-empty"}); }
    updateCounter() { this.counter.setText(Array.from(this.textarea.value).length + " 字"); this.saveButton.disabled = this.busy || !this.textarea.value.trim(); }
    async saveCapture() {
      if (this.busy || !this.textarea.value.trim()) return;
      const text = this.textarea.value; this.busy = true; this.textarea.disabled = true; this.updateCounter(); this.message.setText("正在存入……");
      try {
        const file = await this.plugin.createCaptureText(text);
        this.textarea.value = ""; this.plugin.updateHomeDraft("");
        this.message.empty(); this.message.createEl("span", {text: "已存入："}); this.link(this.message, file);
        void this.plugin.flushHomeDraft().catch(() => new Notice("笔记已创建；草稿清除未能保存，重开首页时请核对，避免重复提交。"));
        this.queue();
      } catch (error) { this.message.setText("未能存入，内容仍在：" + (error.message || String(error))); }
      finally { this.busy = false; this.textarea.disabled = false; this.updateCounter(); }
    }
  };
};
