# 接入排错记录

| 症状 | 重点判断 | 有效处理方向 |
|---|---|---|
| `CONTROL_PLANE_API_KEY is not set` | 当前进程没有密钥；临时 PowerShell 变量已消失 | 使用本机加密保存和启动时读取，检查同一 Windows 账户 |
| `127.0.0.1:27123 actively refused` | 本地服务没有监听该端口 | 打开正确的 Obsidian 库、启用插件 HTTP 服务、核对端口 |
| 根地址 `authenticated: false` | 当前请求没有正确认证 | 携带插件 Bearer Key 验证；无认证访问根地址不能判断密钥是否正确 |
| `protected resource metadata missing resource` | 静态 Key 服务被 OAuth 探测，或探测未携带所需认证头 | 核对应用认证选项、运行时请求头；结合实际连接判断 |
| 客户端 `started`，但 ChatGPT 找不到 MCP | 进程启动与控制连接分开检查 | 查看 `/health/control-plane`、代理和实际 MCP 调用 |
| `poll transport failed (network_error)` | 客户端到 OpenAI 的网络路径异常 | 当前环境通过显式 Clash 7897 控制面代理解决 |
| `Tunnel-client has not been seen for 300 seconds` | OpenAI 没有看到在线客户端 | 检查后台状态、网络、Runtime Key 和 Tunnel ID |
| 普通账户安装时报 `SeSecurityPrivilege` | 旧权限代码触及高权限安全描述符操作 | 当前源码只读取并修改 DACL Access 部分；已安装并正常使用的版本可继续运行 |
| `codex_plugin SKIP` | 本机可选 Codex 插件没有安装 | 当前 ChatGPT 接入不以这个可选插件为前提 |

## 当前版本的 doctor 限制

此前核对 v0.0.16 源码时，doctor 的本地 HTTP 和 OAuth 探测未附加这套静态认证头，因此该项失败不能代替运行态验证。排错依据本地认证、控制连接和 ChatGPT 的实际请求。客户端升级后需重新核对这一限制。

## 添加新问题

保留错误文本和发生步骤，记录最后有效的配置变更、解决方式与实际验证结果。公开截图前清除 API Key、个人笔记内容和本机身份信息。不要上传 `keys.xml` 或完整运行配置。
