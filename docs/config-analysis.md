# 配置深度分析（Config Analysis）

> 所有路径均已脱敏为 `~` 或说明性占位。不含任何密钥。

## 1. Profile 装配配置

### `~/.dsh/profiles/web/package.json`（Bundle 装配）
```json
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "@dsh-external/dsh-super-injector": "link:<injector-path>",
    "dsh-reasoning-effort": "link:<workspace>/dsh-reasoning-effort"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@dsh-external/dsh-super-injector",
        "dsh-reasoning-effort"
      ]
    }
  }
}
```
- 官方 bundle 2 个 + 自定义 bundle 2 个（link: 依赖指向本地项目，junction 由装配器建立）

### `~/.dsh/profiles/web/cordis.patch.yml`（Patch 层）
```yaml
- insert:
    - id: schedule
      name: '@deepseek-ai/dsh-schedule'
    - id: time-context
      name: '@deepseek-ai/dsh-time-context'
      config:
        timeZone: Asia/Shanghai
        refreshIntervalMs: 60000
- insert:
    - id: image-bridge
      name: ./image-bridge.mjs?rev=9
      config:
        modlens: <modlens.cmd 路径>
        ocrTimeoutMs: 90000
        modlensTimeoutMs: 180000
        logFile: ~/.dsh/profiles/web/image-bridge.log
- insert:
    - id: image-display
      name: ./image-display.mjs?rev=6
```
- `?rev=N` 是 HMR 版本号，热重载时递增
- MCP GitHub 示例被注释保留（`@deepseek-ai/dsh-mcp-client` + GITHUB_TOKEN env）

## 2. 全局设置 `~/.dsh/settings.yaml`

```yaml
ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash
  reasoningEffort: max        # 推理强度拉满
ui-theme:
  preference: dark            # 深色主题
```

## 3. Agent Presets

### router-standard（实验性：任务感知路由）
- `preset.yml`：`Router Standard (experimental)` — 按任务路由：spec（先规划，适合修复）/ react（直接执行，适合构建）；首个工具调用后开放全量 Standard 工具
- `agent.cordis.yml`（270 行）关键设计：
  - **realm 隔离**：planMode / compaction / workflowEngine 用 entry-local realm（`isolate: true`），避免跨 preset 冲突
  - persona 为 fallback（路由插件首轮覆盖 sections）
  - 工具分层：shell / filesystem / jobs / skills / goals / plan / compaction / delegation / workflows
  - 产品提供方（codex / claude-code）默认 disabled，复制 preset 后可选择性启用
  - tool-ralph maxRounds: 64
- `router-bootstrap.mjs`：首消息分类 → 注入匹配的 persona + 首轮核心工具集
- `router-core.mjs`（8.4KB）：路由核心逻辑

### minimal-win（极简模式 Windows）
- 双工具编码 Agent：仅 `pwsh` + `str_replace_editor`
- 理由：出厂极简模式的 bash 依赖 PTY，Windows 不可用，故提供原生版

## 4. 注入器状态（`~/.dsh/super-injector/`）

```
registry.json    # 注入清单（当前为空 —— 注入已全部卸载）
self-reload.json # 自重载记录
self-heal.log    # 自愈审计（purge-stale-tools 定期清理过期 staging 工具）
stats.json       # 操作统计
```

## 5. 安全边界

- 凭据存储：`~/.dsh/.credentials.yaml`（仅字段名：`DEEPSEEK_API_KEY`，**值不公开**）
- 远程浏览器无法访问特权 settings API，主题等偏好仅进程内保留
- 文件沙箱：workspace-write（仅工作区可写）；审批策略可配置
