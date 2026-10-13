# 在 GitHub 记录和迭代

仓库：[jitangfeibing/obsidian-ai-workflow](https://github.com/jitangfeibing/obsidian-ai-workflow)。当前仓库公开，保存方案代码、通用模板、脱敏问题记录和验收过程。

## 获取源码

```powershell
git clone https://github.com/jitangfeibing/obsidian-ai-workflow.git
cd obsidian-ai-workflow
```

拉取源码与运行本机安装程序是两个步骤。先阅读 README 和 windows/README.md，再决定是否在目标 Windows 环境安装。

## 记录改进

- 实际遇到的问题先建一个 Bug Issue。
- 改动前写清楚具体触发场景与预期行为。
- 对应代码改动、文档、验证证据放在同一个提交或 PR 中。
- 完成后补充 Issue 的验收结果，再关闭。
- 每一阶段在 CHANGELOG 写清楚改动与剩余限制。

第一批建议记录的 Issue：重启登录自动恢复、客户端退出重试、普通账户 ACL 修正版、配置参数集中管理、四类工作流虚构示例。

## 本地修改

修改前拉取最新版本，查看 git status 和 git diff，确认提交的是本次改动。仓库已经提供 gitignore。准备公开新内容时仍需检查文件及历史提交，公开案例采用虚构或脱敏内容。

目前未选定开源许可证；公开源码与允许他人按开源协议使用是不同决定，确定许可后再添加 LICENSE。
