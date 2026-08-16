# 插件装配全清单（Plugin Inventory）

> 来源：`dev_plugin_status`（loader entries 实时清单，2026-08-17 快照）。
> 全部官方包版本均为 `0.1.0-rc.6`，位于 `D:\deepseekexe\DeepSeek Harness\app\node_modules\@deepseek-ai\`。

## 1. 官方基础插件（dsh-base bundle，核心）

| ID | 包 | 状态 | 职责 |
|----|-----|------|------|
| include | @deepseek-ai/cordis-plugin-include | active | patch/include 装配 |
| timer | @deepseek-ai/cordis-plugin-timer | active | 定时器 |
| hmr | @deepseek-ai/cordis-plugin-hmr | disabled | 热重载（host 侧） |
| llm | @deepseek-ai/dsh-llm | active | LLM 抽象层 |
| session | @deepseek-ai/dsh-session | active | 会话模型 |
| typert / typert-loader / typert-gateway | @deepseek-ai/dsh-typert-* / dsh-api-gateway | active | 类型化注册 + 网关 |
| session-title / session-title-llm | @deepseek-ai/dsh-session-title* | active | 会话标题 |
| user-questions | @deepseek-ai/dsh-user-questions | active | 用户提问缝 |
| agent | @deepseek-ai/dsh-agent | active | Agent 核心 |
| agent-default-model | @deepseek-ai/dsh-agent-default-model | active | 默认模型 |
| jobs | @deepseek-ai/dsh-jobs-local | active | 后台任务 |
| llm-retry | @deepseek-ai/dsh-llm-retry | active | LLM 重试 |
| settings | @deepseek-ai/dsh-settings-file | active | 设置持久化 |
| credentials | @deepseek-ai/dsh-credentials-local | active | 凭据 |
| llm-pi-ai | @deepseek-ai/dsh-llm-pi-ai | active | 提供方适配 |
| session-persistence-jsonl | @deepseek-ai/dsh-session-persistence-jsonl | active | JSONL 持久化 |
| attachment-local | @deepseek-ai/dsh-attachment-local | active | 附件 |
| session-query-sqlite | @deepseek-ai/dsh-session-query-sqlite | active | SQLite 查询 |
| session-projection / -cache / -stats | @deepseek-ai/dsh-session-projection* | active | 会话投影 |
| session-telemetry-otel | @deepseek-ai/dsh-session-telemetry-otel | active | OTEL 遥测 |
| subprocess | @deepseek-ai/dsh-subprocess-local | active | 子进程 |
| sandbox / sandbox-policy | @deepseek-ai/dsh-sandbox-local / -policy | active | 沙箱 |
| bash-sandbox | @deepseek-ai/dsh-bash-sandbox | disabled | bash 沙箱 |
| pwsh-sandbox | @deepseek-ai/dsh-pwsh-sandbox | active(disabled 标记) | pwsh 沙箱 |
| approval | @deepseek-ai/dsh-user-approval | active | 审批 |
| permission | @deepseek-ai/dsh-permission-presets | active | 权限预设 |
| shell-env | @deepseek-ai/dsh-shell-env | active | Shell 环境 |
| fs-observation-policy | @deepseek-ai/dsh-fs-observation-policy | active | 文件观察策略 |
| agent-instructions | @deepseek-ai/dsh-agent-instructions | active | Agent 指令 |
| skill / skill-filesystem / skill-badge | @deepseek-ai/dsh-skill* | active | 技能系统 |
| commands / command-feedback | @deepseek-ai/dsh-commands / -feedback | active | 命令系统 |
| goal / goal-round-driver / command-goal | @deepseek-ai/dsh-goal* | active | 目标系统 |
| token-meter | @deepseek-ai/dsh-token-meter | active | Token 计量 |
| subagent / -spawn / -fork | @deepseek-ai/dsh-subagent* | active | 子代理 |
| workflow-worker-thread | @deepseek-ai/dsh-workflow-worker-thread | active | 工作流 |
| timeout-policy | @deepseek-ai/dsh-tool-call-timeout-policy | active | 工具超时 |
| spill-local / spill-policy | @deepseek-ai/dsh-spill-* | active | 溢出策略 |
| session-checkpoint-policy | @deepseek-ai/dsh-session-checkpoint-policy | active | 检查点 |
| repeat-tool-reminder | @deepseek-ai/dsh-repeat-tool-reminder | active | 工具提醒 |
| web / web-search-deepseek | @deepseek-ai/dsh-web / -web-search-deepseek | active | Web 搜索 |
| tools / system-prompt / agent-loop | @deepseek-ai/dsh-tools / -system-prompt / -agent-loop | active | 工具目录 / 提示词 / 循环 |
| fs-sandbox | @deepseek-ai/dsh-fs-sandbox | active | 文件沙箱 |
| llm-deepseek | @deepseek-ai/dsh-llm-deepseek | active | DeepSeek 提供方 |
| code-runtime | @deepseek-ai/dsh-code-runtime-worker-thread | active | 代码运行 |
| storage / -json / -domain | @deepseek-ai/dsh-storage* | active | 存储 |
| message-feedback | @deepseek-ai/dsh-message-feedback | active | 消息反馈 |
| session-log-download | @deepseek-ai/dsh-session-log-export | active | 会话导出 |
| workspace | @deepseek-ai/dsh-workspace | active | 工作区 |
| directory-picker | @deepseek-ai/dsh-host-directory-picker-auto | active | 目录选择 |
| plugin-inventory | @deepseek-ai/dsh-host-plugin-inventory | active | 插件清单 |
| api-gateway | @deepseek-ai/dsh-host-apiproxy | active | API 代理 |
| cordis-host-runner | @deepseek-ai/dsh-cordis-host-runner | active | Host 运行器 |
| webserver | @deepseek-ai/dsh-host-webserver | active | Web 服务器 |

## 2. 官方 Web 插件（dsh-web-app bundle）

`web / web-startup / web-runtime / client-hmr / modules / connection / api-remotes / client-runtime / cordis-client-runner / ui-theme / locale / ui-layout / ui-sidebar / ui-settings / ui-settings-general / ui-settings-models / ui-settings-plugin-inventory / ui-conversation / ui-tool / ui-cordis / ui-workflow-run / ui-deliverables / ui-workspace / ui-input-trigger / ui-commands / ui-skill / ui-subagent / ui-jobs / ui-goal / ui-message-feedback / ui-model-selection / ui-permission / ui-agent-preset / ui-settings-plugins / ui-plan / ui-user-questions / ui-trajectory / agent-presets / persona / agent-instructions`

## 3. 会话级工具（preset 装配，active）

`tool-bash(disabled) / tool-pwsh / tool-fs / tool-fs-search / tool-jobs / skill-filesystem / tool-skill / tool-goal / tool-ask-user / tool-todo / tool-web / plan-mode / compaction-basic / command-compact / tool-result-pruner / tool-subagent-control / tool-subagent-list-agents / tool-subagent / tool-subagent-fork / workflow-worker-thread / tool-workflow / tool-ralph`

## 4. 自定义 / 第三方组件 ⭐（本仓库核心）

| ID | 来源 | 状态 | 说明 |
|----|------|------|------|
| **dsh-super-injector** | `@dsh-external/dsh-super-injector`（`C:\Users\32169\dsh-super-injector`） | active | 超级模组注入器：dev_inject/install/reload/uninject/self-test 全链路 |
| **reasoning-effort** | `dsh-reasoning-effort`（工作区） | active | 推理强度调节插件（已注入并运行） |
| **router-bootstrap** | `~/.dsh/.agent-presets/router-standard/router-bootstrap.mjs` | active | 任务感知路由引导（spec/react 双模式） |
| **image-bridge** | `~/.dsh/profiles/web/image-bridge.mjs?rev=9` | active | 图片桥接（modlens OCR，90000ms 超时） |
| **image-display** | `~/.dsh/profiles/web/image-display.mjs?rev=6` | active | 对话内联图片（show_image / generate_image） |
| c0353823 | @deepseek-ai/cordis-plugin-hmr | active | 客户端 HMR |
| a5e39c36 / 7447b4c3 | directory-picker-browse / ui-directory-picker-browse | active | 目录浏览扩展 |

## 5. 注入器操作统计（跨重启累计）

```
inject 1✓/0✗ | reload 0✓/0✗ | uninject 1✓/0✗ | install 1✓/0✗ | selfHeal 0✓/0✗
```

（曾注入 1 个插件并完成 1 次卸载演练；当前无残留注入记录 —— 卸载即净已验证。）
