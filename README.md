# Obsidian AI Workflow

通过 ChatGPT 对话读取和维护本机 Obsidian，把学习、项目、任务和回顾连成一个可持续使用的个人工作流。

项目名：`obsidian-ai-workflow`。第一阶段记录和复现当前方案，随后按真实使用问题逐步改进。

## 使用场景

- 学完一章后，保留自己的回答和代码，整理成有章号的学习笔记。
- 为已有项目补充规划文档，关联到项目主记录。
- 从讨论中提取具体任务，区分计划、实际完成和待确认信息。
- 根据实际笔记做每日或每周回顾。

## 当前组成

| 模块 | 作用 |
|---|---|
| `vault-example/` | 不含个人内容的目录和八类 Markdown 模板 |
| `prompts/` | ChatGPT 读写笔记的操作约定 |
| `windows/` | 已制作的加密密钥、登录启动、进程重试和管理脚本 |
| `docs/` | 接入步骤、架构、排错、验收记录和迭代方向 |
| `.github/` | 问题模板和 Windows PowerShell 语法检查 |

这些目录分别解决记录格式、AI 操作约定、运行方式和改进过程。GitHub 保存方案的源代码与文档；个人笔记仍在实际 Obsidian 库中。

## 当前接入路径

ChatGPT 通过 OpenAI Secure MCP Tunnel 调用本机 `tunnel-client`，客户端把请求转发给 Obsidian 的 Local REST API with MCP 插件。插件读取或更新当前库中的 Markdown 文件，并返回结果。

| 组件 | 当前基线 | 密钥职责 |
|---|---|---|
| ChatGPT 自定义 MCP 应用 | Tunnel 连接，单独的“无需身份验证”选项 | 使用已配置的应用与隧道权限 |
| OpenAI `tunnel-client` | 已使用 v0.0.16 Windows AMD64 | OpenAI Runtime API Key 用于隧道控制连接 |
| Obsidian Local REST API with MCP | 已使用 5.4.0，HTTP 27123 | Obsidian 插件 Key 用于本地接口认证 |
| Clash Verge | 当前代理端口 7897 | 提供客户端到 OpenAI 的网络路径 |

版本和端口是已验证的基线；目前脚本面向这套 Windows 配置，尚未做跨平台或多代理方案适配。

## 从哪里开始

1. 看 [项目定位](docs/project-plan.md)，确定这一轮要改进的具体问题。
2. 按 [接入步骤](docs/setup.md) 配置 Obsidian、隧道和 ChatGPT 应用。
3. 参考 [Windows 启动包](windows/README.md) 安装本机启动脚本。
4. 使用 [操作约定](prompts/obsidian-assistant.md) 和 `vault-example/91_模板` 整理笔记。
5. 在 [验收记录](docs/verification.md) 中记录实际结果，把未通过的问题转成 Issue。

## 目前验证到哪里

当前会话已实际完成库目录读取、已有笔记读取、创建项目规划文档和局部更新项目链接。用户已展示 Windows 登录启动任务安装成功，随后再次读取库目录成功。

电脑重启后的自动恢复尚未验证。普通账户 ACL 修正版经过静态检查，尚未在用户的 Windows 环境重新安装验证。相关结论见 [验收记录](docs/verification.md)。

本地运行时电脑必须开机、联网，目标 Obsidian 库和代理需要可用。关机后的访问属于后续独立部署方向，需要在常开设备上准备笔记副本与 MCP 服务。

## 如何记录和优化

- `docs/roadmap.md`：写阶段目标和完成条件。
- `docs/verification.md`：只记录实际执行过的检查与证据。
- `docs/troubleshooting.md`：保留症状、原因和有效处理办法。
- `CHANGELOG.md`：说明每个版本改变了什么。
- GitHub Issues：一个问题对应一个 Issue；关联解决它的提交和验收结果。

优先把当前接入和日常使用做稳定，再增加新的能力。当前仓库不包含个人库、真实密钥、运行时配置或日志。

## 发布状态

仓库：[jitangfeibing/obsidian-ai-workflow](https://github.com/jitangfeibing/obsidian-ai-workflow)，当前公开。内容包括方案代码、通用模板与脱敏实践记录；当前尚未选定开源许可证。

官方资料：[OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels?site_locale=en)、[Obsidian 插件源码](https://github.com/coddingtonbear/obsidian-local-rest-api)、[tunnel-client Releases](https://github.com/openai/tunnel-client/releases/latest)。
