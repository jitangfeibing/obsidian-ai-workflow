> 当前可移植安装入口见 [Codex 迁移手册](codex-migration.md)，以下保留认证字段和早期基线说明。

# 当前 Windows 接入步骤

## 前置条件

Obsidian 桌面应用、Local REST API with MCP 插件、OpenAI Tunnel ID、对应组织的 Runtime API Key，以及允许添加自定义 MCP 应用的 ChatGPT 环境。实际入口与权限以账号及工作区为准。

当前文档记录已验证的 Windows AMD64 / tunnel-client v0.0.16 / HTTP 27123 / Clash 7897 组合。

## 本地接口

打开目标 Obsidian 库，启用插件的 HTTP 服务。当前 MCP 地址为 `http://127.0.0.1:27123/mcp/`。在该库的插件设置中获取 API Key。本地请求使用 `Authorization: Bearer <OBSIDIAN_API_KEY>`。

根地址返回 `status: OK` 只证明服务响应；没有携带认证时 `authenticated: false` 可以是正常结果。用正确 Key 请求根地址，需得到 `authenticated: true`。

## 隧道配置

下载完整的官方 `tunnel-client` 包。普通 Intel/AMD Windows 选择 amd64，Windows ARM 选择 arm64。

按官方 quickstart 创建 `obsidian` 配置，目标设置为上述 MCP URL，使用自己的 Tunnel ID。个人配置文件位于 `%APPDATA%\tunnel-client\obsidian.yaml`；不要提交它到仓库。

| 环境变量 | 内容 |
|---|---|
| `CONTROL_PLANE_API_KEY` | OpenAI Runtime API Key |
| `OBSIDIAN_AUTH` | `Bearer <OBSIDIAN_API_KEY>` |
| `MCP_EXTRA_HEADERS` | `Authorization: env:OBSIDIAN_AUTH` |
| `MCP_DISCOVERY_EXTRA_HEADERS` | `Authorization: env:OBSIDIAN_AUTH` |

创建和管理隧道、运行客户端以及 ChatGPT 访问分别涉及对应的账号和权限。Runtime Key 用于运行；Admin Key 用于需要的管理操作，不把两种职责混在一起。

## 常驻运行

打开 Obsidian 和 Clash 后，使用 `windows/01-Install.cmd` 保存密钥并注册登录启动。细节见 [启动包说明](../windows/README.md)。新版脚本通过 Profile、ProxyUrl 和 HealthListenAddr 参数指定这些值；首次安装默认直连，升级复用原有未显式更改的配置。

如果希望改动端口、配置名称或代理类型，先阅读脚本；这一版没有统一配置向导。

## ChatGPT 应用

在自定义 MCP 应用中选择 Tunnel，使用自己的 Tunnel ID。当前本地静态 API Key 由隧道客户端提供，使用单独的“无需身份验证”选项；不要将它与“OAuth 或无需身份验证”的混合选项混淆。

创建应用和工具发现时，隧道客户端必须已连接，并能访问本机 MCP 服务。保存应用配置不等于服务已经上线。

## 验收

依次检查本地认证、客户端进程、OpenAI 控制连接，以及 ChatGPT 实际读取笔记。读写测试使用独立的虚构测试记录，并在写后重读确认。最后重启电脑，验证登录后的恢复过程。

在 [验收记录](verification.md) 中保留日期、步骤、结果和证据。更改密钥或代理时重新验证受影响环节。

资料：[官方隧道指南](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels?site_locale=en)、[添加自定义 MCP 服务](https://developers.openai.com/api/docs/guides/custom-mcp-server?trk=public_post_comment-text)、[插件说明](https://github.com/coddingtonbear/obsidian-local-rest-api)。
