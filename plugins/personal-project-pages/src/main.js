"use strict";
const { Plugin, Modal, Setting, Notice, PluginSettingTab, MarkdownRenderChild, TFile, parseYaml, stringifyYaml, setIcon } = require("obsidian");
const Core = require("./core");
const HomeCore = require("./home-core");
const buildHomePanel = require("./home-panel");
const buildProjectCore = require("./project-core");
const ProjectCore = buildProjectCore(Core);
const buildProjectViews = require("./project-views");
const buildStudyCore = require("./study-core");
const StudyCore = buildStudyCore(Core);
const buildStudyViews = require("./study-views");
class CreatePageModal extends Modal {
  constructor(plugin, kind, parent, locked) {
    super(plugin.app); this.plugin = plugin; this.kind = kind;
    this.parentPath = parent ? parent.path : ""; this.locked = locked; this.title = ""; this.busy = false;
  }
  onOpen() {
    this.contentEl.createEl("h2", { text: "新建" + Core.KINDS[this.kind].label });
    new Setting(this.contentEl).setName("标题").addText(text => {
      this.titleInput = text.inputEl;
      text.setPlaceholder("填写页面标题").onChange(value => { this.title = value; });
      text.inputEl.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void this.submit(); } });
    });
    if (["capture", "project", "task", "doc"].includes(this.kind)) new Setting(this.contentEl).setName(this.locked ? "所属页面（自动关联）" : this.kind === "capture" ? "关联项目（可选）" : "父项目").addDropdown(drop => {
      drop.addOption("", this.kind === "project" ? "独立项目" : this.kind === "capture" ? "暂不关联" : "请选择父项目");
      const parents = this.plugin.parentFiles();
      if (this.parentPath && !parents.some(f => f.path === this.parentPath)) {
        const file = this.app.vault.getAbstractFileByPath(this.parentPath);
        if (file instanceof TFile) drop.addOption(file.path, file.basename);
      }
      for (const file of parents) drop.addOption(file.path, file.basename + " · " + (file.parent?.path || "库根目录"));
      drop.setValue(this.parentPath).onChange(value => { this.parentPath = value; });
      drop.setDisabled(Boolean(this.locked));
    });
    this.errorEl = this.contentEl.createDiv({ cls: "pph-error" });
    new Setting(this.contentEl)
      .addButton(button => { this.submitButton = button; button.setButtonText("创建并打开").setCta().onClick(() => { void this.submit(); }); })
      .addButton(button => button.setButtonText("取消").onClick(() => this.close()));
    window.setTimeout(() => this.titleInput && this.titleInput.focus(), 30);
  }
  async submit() {
    if (this.busy) return;
    this.busy = true; this.errorEl.setText(""); this.submitButton.setDisabled(true);
    let file = null;
    try { file = await this.plugin.create(this.kind, this.title, this.parentPath); }
    catch (error) { this.errorEl.setText(error.message || String(error)); }
    finally { this.busy = false; this.submitButton.setDisabled(false); }
    if (file) {
      this.close();
      try { await this.app.workspace.getLeaf(true).openFile(file); new Notice("已创建：" + file.basename); }
      catch { new Notice("页面已创建；请从文件列表打开：" + file.path); }
    }
  }
  onClose() { this.contentEl.empty(); }
}
const HomePanel = buildHomePanel({MarkdownRenderChild, TFile, Notice, setIcon, Core, HomeCore, CreatePageModal});
const ProjectViews = buildProjectViews({Modal, Setting, Notice, MarkdownRenderChild, TFile, setIcon, Core, ProjectCore, parseYaml, stringifyYaml, CreatePageModal});
const StudyViews = buildStudyViews({Modal, Notice, MarkdownRenderChild, TFile, Core, StudyCore, parseYaml, stringifyYaml});
class CapturePanel extends MarkdownRenderChild {
  constructor(plugin, el) { super(el); this.plugin=plugin; }
  onload() {
    const refresh=()=>this.render();
    this.registerEvent(this.plugin.app.metadataCache.on("changed",refresh));
    this.registerEvent(this.plugin.app.vault.on("rename",refresh));
    this.registerEvent(this.plugin.app.vault.on("delete",refresh));
    this.render();
  }
  render() {
    const el=this.containerEl;el.empty();el.addClass("pph-panel");
    const controls=el.createDiv({cls:"pph-controls"});
    controls.createEl("button",{text:"新建收集"}).addEventListener("click",()=>new CreatePageModal(this.plugin,"capture",null,false).open());
    controls.createEl("button",{text:"处理已分类记录"}).addEventListener("click",()=>{
      const count=this.plugin.scanCaptures(true);new Notice(count?"已安排处理 "+count+" 条收集记录。":"没有等待转换的记录。");
    });
    el.createEl("p",{text:"选择去向后补模板并移动同一篇笔记；转换成功后才退出收集箱。",cls:"pph-muted"});
    for(const file of this.plugin.app.vault.getMarkdownFiles()) {
      const fm=this.plugin.app.metadataCache.getFileCache(file)?.frontmatter||{};
      if(!file.path.startsWith(this.plugin.settings.root+"/")||Core.isTemplate(file.path)||fm.type!=="capture"||fm.archived===true||fm.is_example===true||file.path.split("/").some(p=>p.startsWith(".")||/^99_迁移/.test(p)))continue;
      const row=el.createDiv({cls:"pph-controls"});
      const link=row.createEl("a",{text:file.basename,cls:"internal-link"});
      link.addEventListener("click",()=>void this.plugin.app.workspace.getLeaf(true).openFile(file));
      const select=row.createEl("select",{attr:{"aria-label":"分类："+file.basename}});
      for(const label of Object.keys(Core.CATEGORIES))select.createEl("option",{text:label,attr:{value:label}});
      select.value=Object.prototype.hasOwnProperty.call(Core.CATEGORIES,fm.分类)?fm.分类:"未分类";
      select.addEventListener("change",async()=>{
        const category=select.value;select.disabled=true;
        try {
          if(!Object.prototype.hasOwnProperty.call(Core.CATEGORIES,category)||this.plugin.app.vault.getAbstractFileByPath(file.path)!==file)throw new Error("记录已变化，请重新打开收集箱。");
          await this.plugin.app.fileManager.processFrontMatter(file,current=>{
            if(current.type!=="capture"||current.archived===true||current.is_example===true)throw new Error("记录已转换或归档，请刷新。");
            current.分类=category;
          });
          this.plugin.queueCapture(file);
        } catch(error) { new Notice(error.message||String(error));this.render(); }
        finally { select.disabled=false; }
      });
    }
  }
}
class ProjectPanel extends MarkdownRenderChild {
  constructor(plugin, el, sourcePath, mode) {
    super(el); this.plugin = plugin; this.sourceFile = plugin.app.vault.getAbstractFileByPath(sourcePath);
    this.mode = mode; this.alive = false; this.timer = null;
  }
  onload() {
    this.alive = true;
    const refresh = () => this.queue();
    this.registerEvent(this.plugin.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.plugin.app.metadataCache.on("resolved", refresh));
    this.registerEvent(this.plugin.app.vault.on("delete", refresh));
    this.registerEvent(this.plugin.app.vault.on("rename", refresh));
    this.render();
  }
  queue() {
    if (!this.alive) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { if (this.alive) this.render(); }, 120);
  }
  onunload() { this.alive = false; window.clearTimeout(this.timer); }
  addButton(parentEl, label, kind, file, locked) {
    const button = parentEl.createEl("button", { text: label });
    button.addEventListener("click", () => new CreatePageModal(this.plugin, kind, file, locked).open());
  }
  render() {
    const el = this.containerEl; el.empty(); el.addClass("pph-panel");
    const controls = el.createDiv({ cls: "pph-controls" });
    if (this.mode === "dashboard") {
      this.addButton(controls, "新建项目", "project", null, false);
      this.addButton(controls, "新建项目文档", "doc", null, false);
      return;
    }
    const file = this.sourceFile;
    if (!(file instanceof TFile) || this.plugin.app.vault.getAbstractFileByPath(file.path) !== file) {
      el.createEl("p", { text: "所属页面已变化，重新打开此页即可刷新。", cls: "pph-muted" }); return;
    }
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (Core.isTemplate(file.path) || !["project", "project_doc"].includes(Core.effectiveType(fm))) {
      el.createEl("p", { text: "创建子项的入口会在实际项目或项目文档中显示。", cls: "pph-muted" }); return;
    }
    if (fm.archived === true) {
      el.createEl("p", { text: "本页已归档。取消笔记属性里的归档勾选后，可以继续新建子项。", cls: "pph-muted" });
    } else if (this.mode === "document" || fm.type === "project_doc") {
      this.addButton(controls, "新建子文档", "doc", file, true);
    } else {
      this.addButton(controls, "新建子任务", "task", file, true);
      this.addButton(controls, "新建子项目", "project", file, true);
      this.addButton(controls, "新建项目文档", "doc", file, true);
    }
    const children = this.plugin.children(file);
    if (!children.length) {
      el.createEl("p", { text: fm.archived === true ? "没有未归档的子项。已归档子项可在归档中心查看。" : "还没有子项。通过上方按钮创建，或在已有笔记的 parent 中链接本页。", cls: "pph-muted" }); return;
    }
    const groups = [["task","任务"],["project","子项目"],["project_doc","项目文档"],["other","其他关联页面"]];
    for (const [type, label] of groups) {
      const items = children.filter(item => (["task","project","project_doc"].includes(item.type) ? item.type : "other") === type);
      if (!items.length) continue;
      el.createEl("h4", { text: label + " · " + items.length });
      const list = el.createEl("ul");
      for (const item of items) {
        const row = list.createEl("li");
        const link = row.createEl("a", { text: item.file.basename, cls: "internal-link" });
        link.setAttr("href", item.file.path); link.setAttr("data-href", item.file.path);
        link.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          void this.plugin.app.workspace.openLinkText(item.file.path, file.path, event.ctrlKey || event.metaKey);
        });
        if (item.status) row.createEl("span", { text: String(item.status), cls: "pph-status" });
      }
    }
  }
}
class SettingsTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    let draft = this.plugin.settings.root;
    new Setting(this.containerEl).setName("个人系统目录").setDesc("填写库内相对路径。当前库使用 personal-system-starter。")
      .addText(text => text.setValue(draft).onChange(value => { draft = value; }))
      .addButton(button => button.setButtonText("保存").onClick(async () => {
        try { this.plugin.settings.root = Core.validateRoot(draft); await this.plugin.saveSettings(); new Notice("目录已保存。"); }
        catch (error) { new Notice(error.message || String(error)); }
      }));
    new Setting(this.containerEl).setName("自动转换收集记录")
      .setDesc("选择任务、项目、知识或生活后，保留正文、补齐对应模板并移动原文件。启动时也处理已选分类的收集记录。")
      .addToggle(toggle => toggle.setValue(this.plugin.settings.autoClassify).onChange(async value => {
        this.plugin.settings.autoClassify = value;
        await this.plugin.saveSettings();
        if (value) this.plugin.scanCaptures();
      }));
  }
}
module.exports = class ProjectPageHelper extends Plugin {
  async onload() {
    const data = await this.loadData();
    this.settings = { ...(data || {}), root: "personal-system-starter", autoClassify: data?.autoClassify !== false };
    this.alive = true; this.classificationTimers = new Map(); this.classificationChain = Promise.resolve();
    this.settingsChain = Promise.resolve(); this.homeDraftTimer = null;
    this.recordChain = Promise.resolve();
    if (data && typeof data.root === "string") {
      try { this.settings.root = Core.validateRoot(data.root); } catch {}
    }
    this.addSettingTab(new SettingsTab(this.app, this));
    this.addCommand({id: "new-learning-chapter", name: "新建学习章节", callback: () => new StudyViews.CreateStudyModal(this, "learning").open()});
    this.addCommand({id: "new-knowledge-note", name: "新建知识笔记", callback: () => new StudyViews.CreateStudyModal(this, "knowledge").open()});
    this.addCommand({ id: "new-project", name: "新建项目", callback: () => new CreatePageModal(this, "project", null, false).open() });
    this.addCommand({ id: "new-capture", name: "新建收集", callback: () => new CreatePageModal(this, "capture", null, false).open() });
    this.addCommand({ id: "convert-classified-captures", name: "处理已分类收集记录", callback: () => {
      const count = this.scanCaptures(true);
      new Notice(count ? "已安排处理 " + count + " 条收集记录。" : "没有等待转换的已分类收集记录。");
    }});
    for (const [kind, name] of [["task","新建子任务"],["project","新建子项目"],["doc","新建项目文档"]]) {
      this.addCommand({ id: "new-child-" + kind, name, checkCallback: checking => {
        const file = this.app.workspace.getActiveFile();
        const allowed = this.isParent(file);
        if (!checking && allowed) new CreatePageModal(this, kind, file, true).open();
        return allowed;
      }});
    }
    this.registerMarkdownCodeBlockProcessor("personal-project", (source, el, ctx) => {
      const mode = ["dashboard", "workspace", "document"].includes(source.trim()) ? source.trim() : "project";
      ctx.addChild(mode === "dashboard" ? new ProjectPanel(this, el, ctx.sourcePath, mode) : new ProjectViews.WorkspacePanel(this, el, ctx.sourcePath, mode));
    });
    this.registerMarkdownCodeBlockProcessor("personal-capture", (_source, el, ctx) => {
      ctx.addChild(new CapturePanel(this,el));
    });
    this.registerMarkdownCodeBlockProcessor("personal-home", (_source, el, ctx) => {
      ctx.addChild(new HomePanel(this, el, ctx.sourcePath));
    });
    this.registerMarkdownCodeBlockProcessor("personal-study", (source, el, ctx) => {
      const mode = ["center", "knowledge"].includes(source.trim()) ? source.trim() : "note";
      ctx.addChild(new StudyViews.StudyPanel(this, el, ctx.sourcePath, mode));
    });
    this.registerEvent(this.app.metadataCache.on("changed", (file, _text, cache) => {
      if (Core.classificationKind(cache?.frontmatter || this.app.metadataCache.getFileCache(file)?.frontmatter || {})) this.queueCapture(file);
    }));
    this.app.workspace.onLayoutReady(() => { if (this.alive) this.scanCaptures(); });
  }
  onunload() {
    this.alive = false;
    for (const timer of this.classificationTimers.values()) window.clearTimeout(timer);
    this.classificationTimers.clear();
    void this.flushHomeDraft().catch(() => new Notice("首页草稿未能保存，请核对后重试。"));
  }
  saveSettings() {
    const snapshot = JSON.parse(JSON.stringify(this.settings));
    const pending = this.settingsChain.catch(() => {}).then(() => this.saveData(snapshot));
    this.settingsChain = pending; return pending;
  }
  updateHomeDraft(text) {
    this.settings.homeDraft = text; window.clearTimeout(this.homeDraftTimer);
    this.homeDraftTimer = window.setTimeout(() => {
      this.homeDraftTimer = null;
      void this.saveSettings().catch(() => new Notice("随手记草稿未能保存，请保留输入内容后重试。"));
    }, 500);
  }
  flushHomeDraft() {
    if (!this.homeDraftTimer) return this.settingsChain;
    window.clearTimeout(this.homeDraftTimer); this.homeDraftTimer = null; return this.saveSettings();
  }
  async createCaptureText(text) {
    if (!String(text).trim()) throw new Error("请先输入内容。");
    return Core.createPage({root: this.settings.root, kind: "capture", title: HomeCore.captureTitle(text), captureText: text}, {
      vault: this.app.vault, codec: {parseYaml, stringifyYaml}, isParent: file => this.isParent(file)
    });
  }
  scanCaptures(manual = false) {
    if (!this.alive || (!manual && !this.settings.autoClassify)) return 0;
    let count = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (Core.isTemplate(file.path) || file.path.split("/").some(p => p.startsWith(".") || /^99_迁移/.test(p))) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (Core.classificationKind(fm)) { this.queueCapture(file, manual); count++; }
    }
    return count;
  }
  queueCapture(file, manual = false) {
    if (!this.alive || (!manual && !this.settings.autoClassify) || !(file instanceof TFile) || Core.isTemplate(file.path)) return;
    window.clearTimeout(this.classificationTimers.get(file));
    const timer = window.setTimeout(() => {
      this.classificationTimers.delete(file);
      this.classificationChain = this.classificationChain.then(async () => {
        if (!this.alive || (!manual && !this.settings.autoClassify)) return;
        try {
          const result = await Core.convertCapture({ root: this.settings.root, file }, {
            vault: this.app.vault, codec: { parseYaml, stringifyYaml },
            rename: (source, destination) => this.app.fileManager.renameFile(source, destination),
            shouldContinue: () => this.alive && (manual || this.settings.autoClassify)
          });
          if (result.changed) new Notice("已转为" + Core.KINDS[result.kind].label + "：" + file.path, 6000);
          if (result.stale && this.alive) this.queueCapture(file, manual);
        } catch (error) {
          if (this.alive) new Notice("分类未完成，原笔记仍在「" + file.path + "」：" + (error.message || String(error)), 9000);
        }
      }).catch(error => { if (this.alive) new Notice("分类处理失败：" + (error.message || String(error))); });
    }, 350);
    this.classificationTimers.set(file, timer);
  }
  isParent(file) {
    if (!(file instanceof TFile) || Core.isTemplate(file.path)) return false;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return ProjectCore.inScope(file, fm, this.settings.root) && fm.archived !== true && ["project","project_doc"].includes(fm.type);
  }
  parentFiles() {
    return this.app.vault.getMarkdownFiles().filter(file => this.isParent(file) &&
      Core.effectiveType(this.app.metadataCache.getFileCache(file)?.frontmatter || {}) === "project")
      .sort((a,b) => a.path.localeCompare(b.path, "zh-CN"));
  }
  children(parent) {
    return this.app.vault.getMarkdownFiles().filter(file => file.path !== parent.path && !Core.isTemplate(file.path)).map(file => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      return { file, fm };
    }).filter(({file,fm}) => fm.archived !== true && Core.parentTargets(fm.parent).some(target => {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(target, file.path);
      return resolved && resolved.path === parent.path;
    })).map(({file,fm}) => ({ file, type: Core.effectiveType(fm), status: fm.status || "" }))
      .sort((a,b) => a.file.path.localeCompare(b.file.path, "zh-CN"));
  }
  projectIndex() {
    return ProjectCore.makeIndex(this.app.vault.getMarkdownFiles(), file => this.app.metadataCache.getFileCache(file)?.frontmatter,
      (target, source) => this.app.metadataCache.getFirstLinkpathDest(target, source), this.settings.root);
  }
  studyRecords(today) {
    return StudyCore.collect(this.app.vault.getMarkdownFiles(), file => this.app.metadataCache.getFileCache(file)?.frontmatter, this.settings.root, today);
  }
  createStudy(options) {
    const operation = this.recordChain.catch(() => {}).then(() => StudyCore.create({...options, root: this.settings.root}, {vault: this.app.vault, codec: {parseYaml, stringifyYaml}}));
    this.recordChain = operation; return operation;
  }
  updateStudy(file, change, expectedSource) {
    const operation = this.recordChain.catch(() => {}).then(() => StudyCore.update({root: this.settings.root, file, change, expectedSource}, {vault: this.app.vault, codec: {parseYaml, stringifyYaml}}));
    this.recordChain = operation; return operation;
  }
  updateProjectRecord(file, change, expected) {
    const operation = this.recordChain.catch(() => {}).then(() => ProjectCore.updateRecord({root: this.settings.root, file, change, expected}, {
      vault: this.app.vault, codec: {parseYaml, stringifyYaml}, resolve: (target, source) => this.app.metadataCache.getFirstLinkpathDest(target, source)
    }));
    this.recordChain = operation; return operation;
  }
  async create(kind, title, parentPath) {
    return Core.createPage({ root: this.settings.root, kind, title, parentPath }, {
      vault: this.app.vault, codec: { parseYaml, stringifyYaml }, isParent: file => this.isParent(file)
    });
  }
};
