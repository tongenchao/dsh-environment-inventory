# My DeepSeek Harness Setup — 环境全面盘点与成果仓库

> 本仓库是对本机 DeepSeek Harness（DSH）环境的**全面分析**与**成果归档**：
> 已装配插件清单、自定义扩展、配置方案、辅助脚本、Agent Presets 与安装包。
> 不含任何 API 密钥、会话记录或日志等敏感内容（已脱敏）。

---

## 📌 环境总览

| 项目 | 值 |
|------|-----|
| DSH 核心版本 | `@deepseek-ai/dsh` **0.1.0-rc.6**（全系 rc.6） |
| 安装位置 | `D:\deepseekexe\DeepSeek Harness\app` |
| Node.js | v24.19.0 |
| Git | 2.51.2.windows.1 |
| 活动 Profile | `web`（`~/.dsh/profiles/web`） |
| 数据目录 | `~/.dsh`（settings / sessions / storages / skills / agent-presets） |
| Web GUI | http://127.0.0.1:3080 |

---

## 🧩 装配架构（Profile: web）

### 官方 Bundle
- `@deepseek-ai/dsh-base` — 官方基础插件集（agent / session / sandbox / tools / storage / web 等 130+ loader entries）
- `@deepseek-ai/dsh-web-app` — 官方 Web 应用（UI 全家桶 + webserver）

### 自定义 Bundle（本仓库核心成果）
| 插件 | 说明 | 位置 |
|------|------|------|
| `@dsh-external/dsh-super-injector` | **超级模组注入器**：运行时注入/热重载/卸载本地插件包，免重启 | `plugins/dsh-super-injector/` |
| `dsh-reasoning-effort` | **推理强度控制插件**：LLM reasoning effort 调节 | `plugins/dsh-reasoning-effort/` |
| `./image-bridge.mjs` | **图片桥接**：OCR（modlens）+ 图片工具链 | `plugins/image-bridge/` |
| `./image-display.mjs` | **对话内联图片**：show_image / generate_image 直接渲染在对话里 | `plugins/image-bridge/` |

### Patch 层（cordis.patch.yml）追加的官方插件
- `@deepseek-ai/dsh-schedule` — 定时任务工具
- `@deepseek-ai/dsh-time-context` — 时间上下文（Asia/Shanghai，60s 刷新）

### Agent Presets
- `router-standard` — **任务感知路由**（实验性）：按首个用户消息分类为 `spec`（先规划，适合修复）或 `react`（直接执行，适合构建），首个工具调用后开放全量 Standard 工具目录；含 `router-bootstrap.mjs` / `router-core.mjs`
- `minimal-win` — 极简模式（Windows 原生）：仅 pwsh + str_replace_editor 的双工具编码 Agent

### 全局设置（settings.yaml，脱敏）
```yaml
agent-default-model:
  provider: deepseek-official
  model: deepseek-v4-flash
  reasoningEffort: max
ui-theme:
  preference: dark
```

---

## 📁 仓库结构

```
├── README.md                  # 本文件：环境全面分析总览
├── docs/
│   ├── plugin-inventory.md    # 插件/装配全清单（官方 + 自定义）
│   ├── config-analysis.md     # 配置深度分析（patch / settings / presets）
│   └── workspace-inventory.md # 工作区（harness测试）文件盘点
├── installers/                # DSH 安装包（Setup.exe + MSI）
├── plugins/                   # 自定义插件/扩展源码
│   ├── dsh-reasoning-effort/  # 推理强度插件（完整项目）
│   ├── dsh-anchored-standard/ # 锚定标准 Agent preset 项目
│   ├── dsh-super-injector/    # 超级模组注入器（完整项目）
│   ├── image-bridge/          # 图片桥接 + 内联图片 + OCR
│   ├── proxy-pick/            # 代理选择工具
│   └── bh-plugin/             # Blackhole 可视化面板
├── agent-presets/             # 已装配的 Agent Presets
│   ├── router-standard/
│   └── minimal-win/
├── scripts/                   # 运维辅助脚本（含 proxy.ps1 代理自助助手）
└── config/                    # 脱敏后的关键配置样板（含 AGENTS.md 全局规则快照）
```

---

## 🚀 快速使用

### 注入自定义插件（重启免生效）
```bash
# 前提：已装配 dsh-super-injector（本仓库 plugins/dsh-super-injector）
# 构建插件包后：
dsh dev_inject_plugin --dir <插件包绝对路径>   # 运行时注入
dsh dev_plugin_status                          # 查看装配清单
dsh dev_reload_package <包名>                  # 热重载
dsh dev_uninject_plugin <包名子串>             # 卸载即净
```

### 装配自定义 Bundle（重启生效）
编辑 `~/.dsh/profiles/web/package.json`：
```json
{
  "dependencies": {
    "@dsh-external/dsh-super-injector": "link:C:/Users/xxx/dsh-super-injector",
    "dsh-reasoning-effort": "link:C:/Users/xxx/dsh-reasoning-effort"
  },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsh-external/dsh-super-injector", "dsh-reasoning-effort"] } }
}
```

### Agent Preset 使用
- 会话选择 `Router Standard`：任务感知路由（修复走 spec / 构建走 react）
- 会话选择 `极简模式 (Windows)`：双工具极简 Agent

---

## 🔒 安全说明

- 本仓库**不含**：API 密钥（DEEPSEEK_API_KEY 等）、会话记录（sessions/）、存储数据（storages/）、日志（*.log）、浏览器二进制（pw-browsers/）、npm 缓存
- 配置样板中的本机绝对路径（`C:\Users\...`、`D:\deepseekexe\...`）为原始配置，公开后请按需替换
- 公开仓库中的脚本仅供学习参考，使用前请审查

## 📄 许可

各插件项目自带 LICENSE（dsh-reasoning-effort / dsh-anchored-standard / dsh-super-injector 均为开源许可）；本仓库其余内容为个人环境归档。
