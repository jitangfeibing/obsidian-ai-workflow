# 交给 Codex 的完整迁移流程

适用：新电脑复用这套系统，或在已有 Obsidian 库中增加这套模块。仓库已经携带源码和可直接安装的插件，不需要拿到作者的个人库、聊天记录或旧下载包。

## 一、复制给自己的 Codex

```text
请把 https://github.com/jitangfeibing/obsidian-ai-workflow 这套方案部署到我的电脑。
先读取仓库 AGENTS.md、README.md、docs/codex-migration.md 和 release.json。
检查我的实际系统、Obsidian、目标库、已有插件和网络设置。新建或已有库先输出安装计划，保留我的已有笔记和用户修改；按仓库脚本完成已授权的安装。
先完成本地工作台，再配置我自己的 Local REST API with MCP 与 OpenAI Secure MCP Tunnel，最后接入我的 ChatGPT。使用当前官方文档与 CLI help，不沿用作者电脑路径、密钥、隧道或代理端口。需要密钥时让我在本机安全输入。
逐项实际验证首页、收集分类、项目文档及 parent、学习复习、归档和 ChatGPT 的读取/创建/回读；备份与剪藏按我的需要设置。列出已通过、失败和需要我在账号界面操作的项目。不要把仅生成文件或仅启动进程当作全流程成功。
```

## 二、分清三个位置

| 位置 | 例子 | 保存什么 |
| --- | --- | --- |
| 本仓库目录 | 任意库外代码目录 | 可复用代码、模板、教程 |
| Obsidian 实际库根 | 用户自己选择 | `.obsidian` 与 `personal-system-starter` |
| 本机运行目录 | 当前用户的 LocalAppData | 隧道加密凭证、运行状态、备份工具配置 |

不能把仓库直接当作私人笔记库；不要提交迁移后的真实笔记。系统内层默认目录固定为 `personal-system-starter`，外层库名和磁盘位置任意。此版按这一内层目录提供模板、视图和计时插件，不自动改成其他根目录。

## 三、安装本地系统

先关闭 Obsidian。PowerShell 中进入仓库，使用自己的实际路径：

```powershell
# 只读计划；新目录不会被创建
.\setup\Install-System.ps1 -VaultPath "E:\Notes\MyVault" -Plan
# 执行安装，新库也使用此命令
.\setup\Install-System.ps1 -VaultPath "E:\Notes\MyVault"
```

安装器校验 release.json 中的全部文件哈希，复制空白页面、11 类模板、Bases 和两个自定义插件，合并插件启用列表。打开目标文件夹为 Obsidian 库，在实际界面信任并启用第三方插件。阅读模式下打开 `personal-system-starter/00_首页.md`。

### 已有库与升级

- 不同内容的已有文件保留并标为 Conflict；不自动套用模板替换旧笔记。
- 同一个安装器曾管理、且此后未修改的文件可以更新；用户修改的页面或代码保留。
- 较新已安装自定义插件不降级；插件配置 `data.json` 不在安装清单。
- 本库的其他插件、设置、Markdown、附件和状态继续保留。
- 报告中 `conflicts` 非零时是部分安装，不能宣布全部完成。查看具体路径，备份后逐项合并；不要删除整个 `.obsidian`。

每次执行在 `.obsidian/obsidian-ai-workflow-backups/` 保存恢复清单和被替换文件。它用于安装回退，不能代替整库版本备份。

```powershell
.\setup\Restore-System.ps1 -ManifestPath "实际恢复清单的完整路径" -Plan
.\setup\Restore-System.ps1 -ManifestPath "实际恢复清单的完整路径"
```

安装后再次修改过的文件会阻止自动恢复。恢复只处理本次清单，不覆盖这些新修改。

## 四、连接 Obsidian 与 ChatGPT

1. 从 Obsidian 社区插件或[官方项目](https://github.com/coddingtonbear/obsidian-local-rest-api)安装 Local REST API with MCP，在本机配置自己的插件 Key。
2. 确认实际 HTTP/HTTPS 端口与 MCP URL，并在 Obsidian 启用核心插件 Bases。本文原实测 HTTP 地址为 `http://127.0.0.1:27123/mcp/`；按本机配置调整。
3. 本地根服务返回 OK 只证明服务响应；带 Key 后 `authenticated: true` 才证明该 Key 的认证。继续实际列出 MCP 工具。
4. 按 [OpenAI 官方 Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)创建/复用自己的隧道、Runtime Key 和组织/工作区关联。账号权限决定是否有相应入口。
5. 下载[完整 tunnel-client](https://github.com/openai/tunnel-client/releases/latest)，普通 Intel/AMD Windows 用 amd64，ARM Windows 用 arm64。使用 `help quickstart` 核对当前参数。原实测基线为 v0.0.16，不将它当作最新版本保证。
6. 初始化自己的 profile，运行 doctor，启动客户端并确认 readiness 与控制连接。保持运行，再在 ChatGPT 添加 Tunnel 连接并配置实际认证。
7. 发起真实工具调用：读取、在单独试用位置创建、再次读取并核对。平台 tunnel 权限与 ChatGPT 连接权限分别检查。

可复用早期逐步说明 [tunnel-setup.md](tunnel-setup.md)，当前界面与参数以官方文档/CLI 为准。新的可配置启动脚本如下：

```powershell
# 直连；实际 ClientExe 路径由你提供，Profile 需已初始化
.\windows\Install.ps1 -ClientExe "E:\Tools\tunnel-client.exe" -Profile obsidian -McpUrl "http://127.0.0.1:27123/mcp/" -ProxyUrl ""
# 使用自己的代理时显式填写地址；端口只是例子
.\windows\Install.ps1 -ClientExe "E:\Tools\tunnel-client.exe" -ProxyUrl "http://127.0.0.1:7897"
```

程序提示时在本机复制两种密钥并按回车，不把密钥放到聊天或命令参数。普通用户运行；密钥由 Windows 当前用户加密保存。原有安装再次运行会沿用未显式指定的配置。可用 `-HealthListenAddr "127.0.0.1:8081"` 避开本机端口冲突。

安装保存凭证后可用 `windows/08-Doctor.cmd` 执行诊断，避免在普通命令行粘贴密钥。`windows/02-Status.cmd` 看实际状态。只有客户端进程运行不能证明 ChatGPT 可调用。后台自启属于 Windows 功能；其他系统需要另外配置常驻服务，不能原样执行 Windows 脚本。

## 五、快速验收

| 检查 | 通过标准 |
| --- | --- |
| 首页 | 背景、导航与随手记可用，空库不展示虚构项目 |
| 分类 | 收集箱创建真实输入，选择知识后同一篇进入资料目录，原文和来源还在 |
| 项目 | 创建项目及文档，文档 parent 指向该项目，父页能列出 |
| 任务与回顾 | 创建任务、实际开始/暂停计时；日报/周回顾位于内层系统目录 |
| 学习 | 新建章节带主题，安排计划；真实复习后记录回答，不自动提升掌握程度 |
| 归档 | 收起后从归档入口恢复，完成情况不被改写 |
| GPT | 实际读笔记、创建独立试用记录、回读一致；换聊天再次读取 |
| 可选备份 | 首份真实备份可校验，恢复到新目录抽查 |
| 可选剪藏 | 导入模板，使用自己的库名，保存与分类成功 |

默认 starter 没有作者的课程、项目、求职记录、截止日或已完成任务。验收样例应标为示例或使用本人真实内容，不能制造学习/求职成果。
