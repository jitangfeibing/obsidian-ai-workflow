# Obsidian AI Workflow

把 Obsidian 个人系统与 ChatGPT 连接起来：先收集，再分类，围绕项目和学习推进，保留原始证据并回顾。仓库包含可复用空白系统、插件源码与预编译文件、安装升级脚本和完整接入流程。

![山林工作台背景](plugins/personal-project-pages/plugin/assets/forest-banner.png)

## 让自己的 Codex 帮你迁移

把仓库链接和下面这句话交给能访问自己电脑文件、终端的 Codex：

> 请按此仓库 AGENTS.md 和 docs/codex-migration.md，把整套系统安装到我的 Obsidian。先检查环境并输出安装计划，保留已有内容；配置我自己的 MCP 与 OpenAI 隧道，逐项验证实际读写。密钥让我在本机输入。

**完整步骤及提示词：[Codex 迁移手册](docs/codex-migration.md)。** 账号登录、密钥输入、工作区权限和实际 ChatGPT 连接，需要在新用户自己的环境完成。

## 已包含的模块

| 模块 | 内容 |
| --- | --- |
| 首页 | 山林工作台、随手记、导航、真实任务/项目/复习摘要 |
| 收集与分类 | 内置去向下拉框，套模板并移动原记录，保留原文与来源 |
| 项目 | 父子项目、任务与文档入口、状态、下一步、卡点、归档恢复 |
| 学习 | 知识库、主题章节、复习计划、原始回答与验收记录 |
| 行动与回顾 | 任务计时、甘特图、每日及每周回顾 |
| ChatGPT 互联 | Local REST API with MCP + OpenAI Secure MCP Tunnel 教程 |
| Windows 常驻 | 当前用户密钥加密、登录自启、守护、状态与日志入口 |
| 维护 | 本地版本备份与恢复、剪藏模板、通用 AI 协作指令 |

版本：方案 **1.1.0**，项目页面助手 **0.5.1**，Personal System Tools **0.2.1**，备份工具 **1.0.0**。源码和可安装文件都在仓库内，无需回到作者聊天附件找插件。

## 快速安装空白系统

先安装 Obsidian，保存笔记并退出程序。仓库与实际笔记库分别存放，在 Windows PowerShell 中执行：

```powershell
git clone https://github.com/jitangfeibing/obsidian-ai-workflow.git
cd obsidian-ai-workflow
# 改成自己的库路径；第一条只展示计划，不创建目录
.\setup\Install-System.ps1 -VaultPath "E:\Notes\MyVault" -Plan
.\setup\Install-System.ps1 -VaultPath "E:\Notes\MyVault"
```

在 Obsidian 中打开目标文件夹为库，信任并启用两个自定义插件，确认核心插件 Bases 可用。打开 `personal-system-starter/00_首页.md`，按 Ctrl+E 切换阅读模式。接着按[迁移手册](docs/codex-migration.md)配置本人的 MCP、隧道和 ChatGPT，按需设置备份、剪藏。

安装需要 PowerShell 5.1+，无需 Node/Python。Windows 常驻及备份调度按 Windows 提供；其他系统可用 PowerShell 7 部署本地文件，常驻服务须另外适配，尚未宣称跨系统端到端验收。

### 已有库与升级

同样先执行 `-Plan`。安装器校验发布文件哈希，保留内容不同的已有文件并列出 Conflict；只自动更新此前管理且此后未改动的文件。插件配置与其他插件保留，较新自定义插件不降级。每次保存受保护的恢复清单和副本。

有冲突属于部分安装，查看具体路径后逐项合并。恢复命令见迁移手册。仓库不会自动导入 Notion、搬走私人笔记或上传个人库。

## 互联与账号配置

Obsidian 的 MCP 服务由本机 `tunnel-client` 通过出站 HTTPS 连接 OpenAI，供已授权的 ChatGPT 调用。每位用户配置自己的库、插件 Key、Runtime Key、Tunnel ID 和组织/工作区关联。

- [逐步接入说明](docs/tunnel-setup.md)
- [可配置 Windows 后台启动](windows/README.md)
- [OpenAI 官方 Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Local REST API with MCP 官方项目](https://github.com/coddingtonbear/obsidian-local-rest-api)

原用户实测基线：Windows AMD64、Obsidian 1.14.4、Local REST API with MCP 5.4.0、tunnel-client v0.0.16。这些不是最新版本保证；客户端使用官方 latest 下载入口，参数按当前 CLI help 核对。自定义 MCP/Tunnel 的可用入口取决于账号及工作区权限。

## 目录与维护

| 路径 | 用途 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Codex 迁移、保护和维护规则 |
| [release.json](release.json) | 组件版本、逐文件 SHA-256 安装白名单 |
| `vault-template/personal-system-starter/` | 空白页面、11 类模板、Bases、通用说明 |
| `plugins/` | 两个自定义插件的源码、测试、预编译文件与资源 |
| `setup/` | 安装、只读计划和受保护恢复 |
| `windows/` | 隧道后台运行与密钥管理 |
| `backup/` | Windows 本地版本备份与恢复 |
| `clipper/` | 官方 Web Clipper 导入模板 |
| `prompts/` | 跨主题的 Obsidian 协作指令 |
| [开发说明](docs/development.md) | 构建与检查 |
| [验收范围](docs/verification.md) | 实测结果及限制 |
| [更新记录](CHANGELOG.md) | 本轮与历史变动 |

私人笔记、密钥、运行配置和备份留在自己的环境。仓库只分发通用实现与空白结构；Obsidian、tunnel-client 和第三方 MCP 插件从各自官方来源安装。
