# Obsidian 隧道登录启动包

适用于你已配置好的 Windows AMD64 客户端、`obsidian` 配置、Obsidian HTTP 27123 和 Clash Verge 代理 7897。

当前版本已修正普通用户安装时可能出现的 `SeSecurityPrivilege` 错误：只修改安装目录的读写访问规则，不设置审计权限或更改所有者。若旧版已经安装并连通，日常使用不需要重新安装；本修正用于后续安装或更新。

## 首次安装

1. 解压整个 ZIP。不要在 ZIP 预览窗口内直接运行。
2. 打开 Obsidian 的目标库和 Clash Verge，确认 Local REST API with MCP 插件已启用，HTTP 27123 已开启。
3. 双击 `01-Install.cmd`，使用平时登录的 Windows 账户运行。通常不需要管理员权限。
4. 等安装窗口提示后，复制 **OpenAI Runtime API Key**，回窗口按回车；等第二次提示，再复制 **Obsidian 插件 API Key**，按回车。不要把密钥粘贴到命令行或聊天里。
5. 出现“安装完成”后可以关闭窗口。稍等后双击桌面的 **Obsidian Tunnel - Status** 检查状态。

默认客户端路径是 `D:\app\tunnel-client-v0.0.16-windows-amd64\tunnel-client.exe`。找不到时安装程序会询问实际路径。

两种密钥只在第一次安装、主动更换或失效后需要提供。安装程序先验证 Obsidian 密钥，再通过 Windows 的账户加密机制保存并回读验证。密钥不写入脚本、任务参数、普通环境变量配置或日志；运行时只传入客户端进程环境。此密钥文件只能由本机同一个 Windows 账户解密。不要在另一账户下安装，也不要把安装后的密钥文件当作跨电脑备份。

## 日常使用

登录 Windows 后，任务约延迟 20 秒开始。守护程序会打开已记录路径的 Obsidian 和 Clash，然后等待正确的 Obsidian 库及代理端口准备好，再启动隧道。Obsidian 默认恢复它上次打开的库；如果不是这个库，请手动打开正确的库，守护程序会继续重试。

以后不需要打开 PowerShell 或重新输入密钥。电脑仍需开机、联网；睡眠、休眠、关机或退出登录会停止服务。可以关显示器。此安装包不会修改电源设置。

客户端退出后，守护程序每隔 15 秒重试；客户端还在运行但网络临时中断时，使用客户端自身的重连机制。配套应用被关闭后，守护程序会尝试重新打开它们，因此需要暂停时先运行 `04-Stop.cmd`。

| 入口 | 用途 |
|---|---|
| `01-Install.cmd` | 首次安装或重新检测程序路径；已有密钥会复用 |
| `02-Status.cmd` | 检查进程、本地认证、代理、客户端就绪、OpenAI 控制连接及内存 |
| `03-Start.cmd` | 手动启动后台程序 |
| `04-Stop.cmd` | 停止本启动包的程序；下次登录或手动启动后恢复 |
| `05-UpdateKeys.cmd` | 更换本机加密保存的密钥并重启 |
| `06-Uninstall.cmd` | 取消自启、停止程序、删除本包保存的密钥和设置 |
| `07-Logs.cmd` | 用记事本查看日志 |

安装位置：`%LOCALAPPDATA%\ObsidianTunnel`。桌面会创建 Status 和 Start 快捷方式。其他管理入口也可以直接在这个安装目录运行。原下载和解压目录在成功安装后可以移走；原 `tunnel-client.exe` 文件及它的目录仍需保留。

## 状态判断

- `WaitingForObsidian`：打开正确的库，确认插件和 HTTP 27123；密钥变更后运行 UpdateKeys。
- `WaitingForClash`：确认 Clash 正在运行，代理端口仍为 7897。
- `Running`：客户端进程正在运行；不能仅凭此判断已经连通 OpenAI。
- `OpenAI 控制连接：ok / ...`：客户端观察到正常控制连接。最后仍应在 ChatGPT 实际读取笔记验证。
- 客户端内存会显示在 Status 中，也可以在任务管理器的“详细信息”里查看 `tunnel-client.exe`。

遇到错误，运行 Status 或 Logs；只需提供错误文本，不要提供密钥或 `keys.xml`。此安装包不调用 `doctor`，避免你的 API Key MCP 配置被 OAuth 元数据检查误判。

## 启动与卸载范围

优先创建仅限当前账户、登录后运行的 Windows 计划任务，不保存 Windows 登录密码，也不要求提升到管理员。任务没有默认的三天执行限制，并配置守护程序失败后最多三次重启。若 Windows 策略禁止注册任务，会自动使用当前账户启动文件夹的快捷方式；该模式仍会重启退出的客户端，但守护程序本身崩溃后需要手动 Start 或下次登录。

首次安装会替换同一路径、同一 `obsidian` 配置正在运行的旧客户端，避免端口冲突；不会停止其他配置的隧道。停止和卸载只管理本包启动的进程。卸载不删除 Obsidian 笔记、插件、原隧道配置或客户端，不关闭 Obsidian 和 Clash；日志和脚本保留供查看。

脚本只在这一次执行中指定 ExecutionPolicy Bypass，不改变系统执行策略。若组织策略阻止脚本运行，不尝试绕过组织管理。

## 验证和文档

交付前已进行 PowerShell 语法静态检查和安装包完整性检查。当前源码的静态检查已通过。旧版在用户电脑上已完成安装并实际连接；重启验收和本权限修正版的普通账户安装待验证。安装程序会用 Windows 原生解析器检查所有脚本，并进行本机密钥加密回读和 Obsidian 认证检查。

- [OpenAI Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels?site_locale=en)
- [tunnel-client v0.0.16 配置文档](https://github.com/openai/tunnel-client/blob/v0.0.16/docs/configuration.md)
- [Windows 加密保存凭据说明](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/export-clixml?view=powershell-7.5)
- [计划任务设置说明](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset?view=windowsserver2025-ps)
