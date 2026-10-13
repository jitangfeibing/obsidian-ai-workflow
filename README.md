# Obsidian AI Workflow

让 ChatGPT 通过 MCP 读取和维护本机 Obsidian，用于章节学习、项目规划、任务整理和回顾。这份 README 按从零搭建到日常使用的顺序说明。

搭建完成后：登录 Windows，打开正确的 Obsidian 库和 Clash，隧道在后台运行；在 ChatGPT 中选择已连接的 Obsidian 应用，就可以操作笔记。

## 1. 准备环境和项目文件

当前实测组合为 Windows AMD64、Obsidian 1.14.4、Local REST API with MCP 5.4.0、tunnel-client v0.0.16 和 Clash Verge。脚本目前按 Clash 的 `127.0.0.1:7897` 代理编写；其他代理、端口或无代理环境需要适配。

先安装 Obsidian 和 Git，获取本仓库：

```powershell
git clone https://github.com/jitangfeibing/obsidian-ai-workflow.git
cd obsidian-ai-workflow
```

没有 Git 时，也可以在仓库页面选择 Code → Download ZIP，下载后完整解压。

| 目录 | 用途 |
|---|---|
| `vault-example/` | 样例库说明和八类 Markdown 模板 |
| `prompts/` | ChatGPT 操作笔记的协作约定 |
| `windows/` | 密钥保存、登录启动、状态与管理脚本 |
| `docs/` | 详细排错、验收记录和优化路线 |

## 2. 准备 Obsidian 笔记库

已有库可以直接使用。新建库时，可把 `vault-example` 复制到仓库之外的独立目录，再由 Obsidian 打开，逐步建立下面的结构：

| 目录 | 保存内容 |
|---|---|
| `01_收集` | 原始想法、待整理输入 |
| `02_行动/任务` | 明确的下一步动作 |
| `03_目标与项目/项目` | 项目主记录 |
| `03_目标与项目/项目文档` | 规划、调研和方案 |
| `04_学习/主题` | 分章节学习笔记 |
| `05_求职`、`06_刷题` | 面试准备和编程题 |
| `07_回顾` | 每日记录与周回顾 |
| `08_生活` | 生活记录 |
| `91_模板`、`92_AI协作` | 记录模板和 AI 操作约定 |

八类模板已放在 `vault-example/91_模板`。创建正式记录时，渲染标题和日期变量，沿用实际库的字段与模板。GitHub 用来维护方案和通用模板，实际笔记在自己的库中保存。

## 3. 安装并开启 Obsidian MCP 插件

在目标库中打开“设置 → 第三方插件”，搜索并安装 **Local REST API**，当前插件名称为 **Local REST API with MCP**，作者 Adam Coddington。启用插件后：

1. 进入插件设置，找到这个库的 API Key，供后面的安装程序使用。
2. 开启 HTTP 服务，本方案使用端口 `27123`。
3. 保持该库打开。

| 地址 | 用途 |
|---|---|
| `http://127.0.0.1:27123/` | 查看本地服务状态 |
| `http://127.0.0.1:27123/mcp/` | MCP 工具调用入口 |

浏览器打开根地址并看到 `status: OK`，说明服务在响应。未携带 Key 时显示 `authenticated: false` 可以是正常结果；安装程序会携带 Key 检查认证。

`127.0.0.1` 指向当前运行程序的电脑。这个地址交给隧道客户端使用。

## 4. 创建 OpenAI 隧道并准备 Runtime Key

打开 [OpenAI 隧道管理](https://platform.openai.com/settings/organization/tunnels)，创建隧道，复制自己的 Tunnel ID。检查它对应的组织，以及要使用它的 ChatGPT 工作区关联。

再到 [Runtime API Keys](https://platform.openai.com/settings/organization/api-keys) 创建运行客户端所需的 Key，使用与隧道相符的组织。运行客户端需要 Tunnels Read + Use；创建或修改隧道需要 Read + Manage。账号和工作区的可用权限以实际设置为准。

| 密钥 | 从哪里获取 | 用于什么 |
|---|---|---|
| OpenAI Runtime API Key | OpenAI Platform | 客户端连接 OpenAI 隧道控制面 |
| Obsidian 插件 API Key | 目标库的插件设置 | 客户端访问本机 Obsidian MCP |

两种 Key 会在第 6 步按提示输入，并加密保存在本机。

## 5. 下载完整客户端并初始化配置

打开 [OpenAI 官方客户端下载页](https://github.com/openai/tunnel-client/releases/latest)，展开 Assets。普通 Intel/AMD Windows 选择名称包含 `tunnel-client`、`windows`、`amd64` 的完整 ZIP；Windows ARM 选择 `arm64`。

解压后找到 `tunnel-client.exe`，在该目录打开 PowerShell。下面命令以已实测的 v0.0.16 为基线，先将 `<YOUR_TUNNEL_ID>` 换成自己的 Tunnel ID：

```powershell
.\tunnel-client.exe init `
  --sample sample_mcp_remote_no_auth `
  --profile obsidian `
  --tunnel-id "<YOUR_TUNNEL_ID>" `
  --mcp-server-url "http://127.0.0.1:27123/mcp/"
```

成功后会生成：

```text
%APPDATA%\tunnel-client\obsidian.yaml
```

这一步保存隧道 ID 和本地服务地址。配置已经存在时先检查原配置，不必每次使用都重新初始化。下载到较新版本时，结合它的 `help quickstart` 核对参数。

## 6. 保存密钥并设置后台自启

确认 Obsidian 的正确库和 Clash Verge 已打开，代理端口为 `7897`。进入本仓库的 `windows` 目录，双击 **`01-Install.cmd`**：

1. 客户端不在默认路径时，输入 `tunnel-client.exe` 的实际完整路径。
2. 等窗口提示后，复制 **OpenAI Runtime API Key**，回来按回车。
3. 等第二次提示后，复制 **Obsidian 插件 API Key**，回来按回车。
4. 出现“安装完成”后，稍等并打开桌面的 **Obsidian Tunnel - Status**。

先运行安装程序，再按提示复制密钥，避免复制命令或其他文本时覆盖剪贴板。密钥不需要粘贴到 PowerShell 命令行或聊天中。

安装程序会验证 Obsidian 认证，将两种密钥用 Windows 账户加密保存，注册登录启动，并启动后台守护程序。运行时会给 MCP 请求附加插件认证头。密钥文件绑定本机同一个 Windows 账户。

桌面会生成 Status 和 Start 快捷方式。安装目录为 `%LOCALAPPDATA%\ObsidianTunnel`。客户端退出后，守护程序每隔 15 秒重试；网络临时中断时使用客户端的重连机制。

普通账户 ACL 修正版已收录，尚待专项 Windows 验证。先前版本已在用户电脑完成安装并连通，用户接受同账户管理员方式安装；详细状态见 [验收记录](docs/verification.md)。

### 查看状态

| 状态 | 下一步 |
|---|---|
| `WaitingForObsidian` | 打开正确的库，检查插件、HTTP 27123 和 Key |
| `WaitingForClash` | 检查 Clash 和代理端口 7897 |
| 隧道进程运行中 | 继续检查控制连接，进程运行不能单独证明连通 |
| OpenAI 控制连接为 `ok` | 到 ChatGPT 实际读取笔记验证 |

管理界面是 `http://127.0.0.1:8080/ui`。更多脚本说明见 [Windows 启动包](windows/README.md)。

## 7. 在 ChatGPT 添加 Obsidian 应用

保持隧道在线，在 ChatGPT 的自定义 MCP 应用/插件入口添加服务：

1. 填写名称，例如“Obsidian 个人库”。
2. 连接方式选择 **Tunnel**，选择隧道或填写自己的 Tunnel ID。
3. 当前静态 API Key 方案选择单独的 **No authentication / 无需身份验证**。
4. 按界面提示完成创建，并安装到可使用的应用/插件中。
5. 在对话输入框通过 `@` 选择该应用。

此处的“无需身份验证”对应 ChatGPT 应用配置；客户端到 Obsidian 的调用仍携带第 6 步保存的插件 Key。不要将单独的无认证选项与“OAuth 或无需身份验证”的混合选项混淆。

应用创建、工具发现和后续 MCP 调用，都依赖正在运行并已连接的客户端。没有看到自定义 MCP 或 Tunnel 入口时，先检查账号与工作区是否允许该能力。

## 8. 验证读写并加入日常工作流

先做只读测试：

> 使用 Obsidian 应用列出我的库根目录，暂时不要修改文件。

再指定一篇已有笔记，要求读取正文。目录和内容都能返回后，创建一份独立的测试记录，写入简短内容，再读取确认；测试记录不要覆盖真实笔记。

随后把 [操作约定](prompts/obsidian-assistant.md) 的必要规则放到实际库的 `92_AI协作` 中。已有协作约定时先读取并合并，每次协作让 ChatGPT 先读取相关模板和记录。

可以这样开始使用：

- “按章节学习模板，整理这一章的原始回答、代码、易错点和复习问题。”
- “在已有项目下面增加规划文档，关联到主项目。”
- “把这个明确的下一步动作记成任务，缺少日期的先留空。”
- “根据本周实际记录做回顾，区分计划与完成。”

日常使用时，登录 Windows 后保持正确的 Obsidian 库和 Clash 运行，隧道会自动后台启动，无需每天重新输入密钥。第一次重启后再次用 Status 和 ChatGPT 读取验证自启；这一项目前仍待实测。

电脑需要开机、联网，不能进入睡眠或休眠。关机后的持续访问需要另行部署到常开设备，并准备笔记副本和 MCP 服务。

## 常见问题和维护入口

| 问题 | 重点检查 |
|---|---|
| `CONTROL_PLANE_API_KEY is not set` | 当前进程没有读到 Runtime Key；检查安装与运行账户 |
| 本地 27123 连接被拒绝 | Obsidian、目标库、插件 HTTP 服务和端口 |
| `protected resource metadata missing resource` | 当前静态 Key 配置的 OAuth 探测与认证选项；结合实际运行验证 |
| 客户端显示 started，但应用找不到 MCP | 控制连接、代理、Runtime Key 和 Tunnel ID |
| `poll transport failed (network_error)` | 客户端到 OpenAI 的网络和代理 |
| `codex_plugin SKIP` | 可选本机 Codex 插件；当前 ChatGPT 连接不依赖它 |

停止、更新密钥、卸载和查看日志分别使用 `04-Stop.cmd`、`05-UpdateKeys.cmd`、`06-Uninstall.cmd`、`07-Logs.cmd`。

| 文档 | 内容 |
|---|---|
| [接入细节](docs/setup.md) | 配置字段与认证职责 |
| [工作流约定](docs/workflows.md) | 记录类型和写回规则 |
| [排错记录](docs/troubleshooting.md) | 已遇到的问题与有效处理 |
| [验收记录](docs/verification.md) | 已实测结果和待验证事项 |
| [优化路线](docs/roadmap.md) | 下一阶段改进与完成条件 |
| [GitHub 使用方式](docs/github-start.md) | 获取源码、问题记录和迭代 |

官方资料：[OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels?site_locale=en)、[添加自定义 MCP 服务](https://developers.openai.com/api/docs/guides/custom-mcp-server?trk=public_post_comment-text)、[Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api)。

当前源码公开，尚未选定开源许可证。
