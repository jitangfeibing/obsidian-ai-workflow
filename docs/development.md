# 维护与构建

安装用户只需要预编译文件和 PowerShell，无需 Node/Python。

开发校验使用 Node.js 20+、Python 3（PyYAML 6.0.3）与 PowerShell。Windows 原生语法与安装检查由 CI 使用 Windows PowerShell 5.1 执行。

```powershell
python -m pip install -r tests/requirements.txt
python scripts/build.py
node plugins/personal-project-pages/test.js
node plugins/personal-project-pages/home-test.js
node plugins/personal-project-pages/project-test.js
node plugins/personal-project-pages/study-test.js
node --test tests/system-logic.test.js tests/system-ui.test.js tests/system-workflow.test.js tests/capture-panel.test.js
.\tests\Test-ScriptSyntax.ps1
.\tests\Test-SystemInstall.ps1
.\tests\Test-ClientOptions.ps1
.\backup\tests\Backup.Tests.ps1 -WorkPath (Join-Path $env:TEMP ("ob-backup-test-" + [guid]::NewGuid().ToString("N")))
.\backup\tests\TaskDefinition.Tests.ps1
python scripts/verify-repo.py
```

`plugins/personal-project-pages/src` 是首页、项目、分类和学习实现；`plugins/personal-system-tools/src` 是计时、甘特图与回顾。编译产物位于各自 `plugin/`。安装模板在 `vault-template/`；release.json 是带 SHA-256 的安装白名单。

修改源文件后重新构建，确认编译产物与哈希一起提交。安装器不会读取用户库生成发布清单，也不会把插件 data.json 或运行凭证收进源码。
