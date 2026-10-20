# Obsidian 本地版本备份 1.0.0

为当前个人库保存可核验的 ZIP 版本。一次设置后，登录 Windows 时和每天 21:00 检查；内容有变化才创建新版本。也可随时手动备份。

## 第一次使用

1. 将本包完整解压到 **Obsidian 库外的新文件夹**。
2. 双击 `01-Setup.cmd`，使用平时打开 Obsidian 的 Windows 账户，无需管理员身份。
3. 选择同时包含 `.obsidian` 和 `personal-system-starter` 的库根目录。
4. 选择 **库外、与库互不包含** 的备份父目录。工具会在其中新建独立的 `ObsidianBackups-编号` 文件夹；有另一块磁盘或移动硬盘时可以选在那里。
5. 等待窗口显示 **首份备份已校验**。桌面会出现 Now、Status、Restore 三个快捷方式。

工具安装在当前账户的 `%LOCALAPPDATA%\ObsidianVaultBackup`。安装后的入口不依赖下载解压目录，确认设置成功后可收起安装包。重复设置沿用现有库、位置和版本，不删除旧备份。

日常备份无需退出 Obsidian。大量移动笔记或升级插件前，先保存并退出 Obsidian，再点击「立即备份」，更便于得到一致版本。

## 六个入口

| 文件 | 作用 |
| --- | --- |
| 01-Setup.cmd | 设置位置、创建首份备份、启用自动检查 |
| 02-BackupNow.cmd | 立即备份；内容未变则核验并沿用已有版本 |
| 03-Restore.cmd | 选择历史 ZIP，校验后恢复到库外的新文件夹 |
| 04-Status.cmd | 查看最近结果、最新有效版本、自动任务状态和 ZIP 占用 |
| 05-DisableAuto.cmd | 暂停后续自动检查，已有版本与手动入口保留 |
| 06-EnableAuto.cmd | 重新启用登录及每日检查 |

自动方式通常为 `ScheduledTask`：当前用户登录约 60 秒后检查一次，每日按电脑本地时间 21:00 检查。电脑需开机、账户已登录且可访问备份磁盘。关机、睡眠或移动硬盘未连接时不能完成备份；未连接造成的失败会显示在状态中，恢复条件后可手动补一次。

若 Windows 策略不允许普通用户注册任务，工具会改为 `StartupOnly`，即每次登录备份一次，并明确提示 **每日 21:00 未启用**。不用为此改成管理员运行。运行期间只有短时 PowerShell 进程，没有常驻轮询程序。

## 保存范围

| 内容 | 处理 |
| --- | --- |
| 笔记、附件、Canvas、Bases、模板、原始记录及迁移记录 | 保留文件内容与修改时间，包含库根目录的实际笔记 |
| Obsidian 外观、快捷键、类型与插件启用列表 | 只保存明确列出的配置文件 |
| snippets、themes，插件 main.js / manifest.json / styles.css / assets | 保存界面样式与插件程序 |
| 插件 data.json | 全部排除，避免带入 REST API 等插件密钥；个别插件的自定义设置需重新配置 |
| 会话布局、未列入白名单的 .obsidian 配置、.git、.trash 等隐藏路径 | 排除 |
| .env、keys.xml、secrets.json、credentials.json、pem/key/p12/pfx 文件 | 排除 |
| 已知旧安装 ZIP 及解压副本 | 排除 |
| 目录联接、符号链接、空目录 | 不跟随链接；空目录不生成文件条目 |

具体排除路径及理由记录在 ZIP 内的 `backup-manifest.json`。这是文件范围排除，不扫描或改写笔记正文。如果笔记正文含私人内容，它也属于备份内容。

普通 ZIP **未加密**，只写到你选的位置，不上传 GitHub，不访问网络，也不复制隧道账户的 AppData 密钥。请把备份放在私人位置。与原库位于同一块硬盘的副本适合找回误改；防硬盘故障需要另存到不同设备。

## 找回误删或误改

1. 点击 `03-Restore.cmd`，选择时间合适的 `backup-日期-编号.zip`。
2. 选择库外的恢复父文件夹。工具会新建 `Obsidian-Restored-日期-编号`。
3. 校验通过后，在新目录核对旧内容。原库没有被覆盖。
4. 只找回单篇：比较同路径文件，保存当前版本后，再将需要的旧文件复制回原位置。
5. 需要整库使用：在 Obsidian 中选择「打开文件夹作为仓库」，打开新恢复目录。API 密钥及排除的插件设置需按原教程重新配置；确认后再决定原库如何保留。

恢复不能直接指向原库或备份目录。新版本不会删除过去的文件，因此从旧版本能够找回后来删除的笔记。逐文件哈希和整包配套 JSON 用于检测损坏；它们不提供加密或来源认证。

## 版本、占用与失败

- 每个版本是独立的完整 ZIP，文件名含时间和唯一编号；旧版本 **不自动清理**。
- 内容完全相同时不重复打包，删除或改动文件会生成新版本。
- 每次备份会读取和校验文件，附件很多时会增加耗时与磁盘占用；在 Status 中查看实际占用。
- 文件被其他程序独占、来源持续变化、磁盘未连接或空间不足时，本次可以失败；已有版本继续保留。
- 在临时 ZIP 完成并校验前，不发布新版本。备份是在线文件快照；跨多篇笔记的事务一致性仍以保存并退出 Obsidian 后备份更稳妥。
- 暂停自动备份不会强杀当前备份，避免留下写到一半的文件。

## 验证与限制

开发侧在 PowerShell 7 隔离目录实际验证 ZIP 生成、无变化跳过、修改与删除、中文/二进制文件、原始记录恢复、配置白名单、密钥排除、损坏拒绝、路径保护、并发锁、只读源失败保护和版本索引修复。自动任务定义通过模拟原生命令核对当前交互账户、Limited 权限、登录/每日触发和防重复执行。

脚本采用 Windows PowerShell 5.1 可用语法；本机 Windows 5.1、文件选择框、桌面快捷方式、任务实际注册与执行尚待首次设置确认。这个包与项目页面助手的版本独立，不需要更换已经安装的 0.5.0。

测试脚本在 tests 中，只接受全新或空测试目录，不能指向真实库。日常使用无需额外安装 Python、Node.js 或 Git。

## 实现参考

- [Microsoft：任务执行账户](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal)
- [Microsoft：注册计划任务](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask)
- [Microsoft：任务设置](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset)
- [Microsoft：ZIP 压缩、解压与路径检查](https://learn.microsoft.com/en-us/dotnet/standard/io/how-to-compress-and-extract-files)
