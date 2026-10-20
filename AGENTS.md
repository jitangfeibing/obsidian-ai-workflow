# Reproduce Obsidian AI Workflow

This repository distributes the reusable implementation, not a person's vault.
For migration, read README.md, docs/codex-migration.md and release.json first.

## On a new user's computer

1. Establish the actual host, OS, Obsidian vault path and whether this is a new or existing vault. The vault must be outside this checkout. Never infer a Windows path, proxy port, tunnel ID, account or key from the author's setup.
2. Inspect existing plugins and configuration before installation. Run `setup/Install-System.ps1 -VaultPath <path> -Plan`, summarize conflicts, then execute the authorized install with Obsidian closed. A conflict preserves the existing file; read and merge only when authorized. Do not use blanket overwrite or delete real notes.
3. This repo ships prebuilt plugins; Node/Python are needed only for development. Windows installation needs PowerShell 5.1+. Enable the custom plugins and trust the vault in the actual Obsidian UI. Check the home, inbox, project, task, learning, review and archive pages.
4. Install Local REST API with MCP from its official source. Configure the user's own API key locally. Verify authenticated local service access, then inspect the actual MCP tool list. Do not assume this chat has an Obsidian connector because another chat did.
5. Follow current OpenAI Secure MCP Tunnel docs and `tunnel-client help quickstart`. Reuse suitable resources. Configure the user's own organization/workspace association and profile; run doctor, start the client, verify readiness, then make a real ChatGPT MCP call. `started` or a process ID alone is not proof.
6. Use windows/Install.ps1 for the optional current-user supervisor. Supply ClientExe/Profile/McpUrl/ProxyUrl explicitly as appropriate; an empty ProxyUrl is direct connection. Account/key entry and workspace permissions are user-local steps. Never request secrets in chat or put them in command arguments, git, logs or screenshots.
7. Offer backup/ and clipper/ as separate optional setup steps. Verify actual backup/restore and webpage import; do not mark an unperformed step done.
8. Report observed checkpoints and exact remaining blockers. Connection is complete only after a real ChatGPT read/create/readback succeeds. Preserve test records until the user chooses how to remove them.

## Writing notes

Read the target vault's AI collaboration agreement and actual template. Search by title/path/parent before creating. Preserve original input, unknown properties, source links, creation dates and renderer blocks. Children use the real `parent` link. Completion, archive, learning mastery and review dates are distinct and evidence based. Normal discussion does not automatically authorize saving every message. Read before writing, guard concurrent changes, and read back afterwards.

## Maintaining this repo

- Change sources under plugins/*/src, rebuild prebuilt files and release.json with `python scripts/build.py`.
- Run Node plugin tests, PowerShell installer/restore and backup tests, plus `python scripts/verify-repo.py`. See docs/development.md.
- Keep the starter empty of personal notes, tasks, progress, imported snapshots and credentials. Only the generic file allowlist in release.json is installed.
- Never publish a user's real `.obsidian`, plugin data.json, backup archives, runtime state, API keys or tunnel profile. Do not enable chat/API access or install this on a remote person's computer without their own authorization.
- Update component versions, CHANGELOG.md, docs/verification.md and migration docs when behavior changes. Preserve newer installed plugins and edited pages.
