# 工作区盘点（Workspace Inventory）

> 盘点对象：`C:\Users\32169\Desktop\harness测试`（DSH 默认工作区），快照时间 2026-08-17。
> 本仓库只归档其中的**成果**（插件/脚本/配置/安装包），演示材料与测试数据仅在此盘点。

## 1. 安装包与快捷方式

| 文件 | 大小 | 说明 |
|------|------|------|
| `DeepSeekHarness-Setup.exe` | 32.3 MB | DSH 安装程序（已归档 → `installers/`） |
| `DeepSeekHarness-安装包.msi` | 68.4 MB | DSH MSI 安装包（已归档 → `installers/`） |
| `DeepSeek Harness.lnk` | 2.2 KB | 桌面快捷方式 |
| `启动DSH.vbs` / `停止DSH.vbs` | 1.2 KB / 0.8 KB | 一键启停（已归档 → `scripts/`） |

## 2. 自定义插件 / 项目（成果，均已归档 → `plugins/`）

| 目录 | 大小 | 说明 |
|------|------|------|
| `dsh-reasoning-effort/` | 6.4 MB | 推理强度插件（完整项目：src/lib/design/assets + GitHub Actions + 双语 README） |
| `dsh-anchored-standard/` | 0.1 MB | 锚定标准 Agent preset 项目（preset + zero 变体 + 测试） |
| `image-bridge/` | 0.0 MB | 图片桥接：image-bridge.mjs（OCR）+ image-display.mjs（内联图）+ ocr.ps1 + repro/test |
| `proxy-pick/` | 0.0 MB | 代理选择工具（TS + build.sh） |
| `bh-plugin/` | 0.9 MB | Blackhole 可视化面板（HTML + README + 预览图） |

## 3. 测试 / 基准目录（未归档，仅盘点）

| 目录 | 大小 | 说明 |
|------|------|------|
| `bench-control/` `bench-jspace/` `bench2-control/` `bench2-jspace/` `bench2-src/` | ~0 | Agent 基准测试（jspace 对照） |
| `bh-control/` | 4.8 MB | Blackhole 对照测试 |
| `modeltest/`（含 zip） | 89.9 MB | 模型测试 |
| `modlens-test/` | 2.4 MB | modlens 视觉测试 |
| `doc-tools/` | 131.3 MB | 文档工具链（node_modules 占大头） |
| `pw-browsers/` | 701 MB | Playwright 浏览器二进制（未归档） |
| `.npm-cache/` | 289 MB | npm 缓存（未归档） |
| `node_modules/` | 17.7 MB | 工作区 npm 依赖（未归档） |

## 4. 脚本（已归档 → `scripts/`）

运维类：`restart-dsh.ps1`、`restart-web.ps1`、`restart-watchdog.ps1`、`safe-delete.ps1`（防误删保险）、`install-tailscale.ps1`、`firewall-dsh-tailscale.ps1`（仅允许 Tailscale 网段访问 3080）、`uac-probe.ps1`
工具类：`verify-reasoning-effort.mjs`、`demo_search.js`、`bilibili_v2.js`、`fetch-repo.js`

未归档（演示/生成类）：`analyze-blackhole.mjs`、`shot-blackhole.mjs`、`plot-profiles.mjs`、`render-svg.mjs`、`gen-intro-ppt.mjs`、`gen-youth-ppt.mjs`、`gen-population-xlsx.mjs`

## 5. 演示材料（未归档，仅盘点）

- PPT：`DeepSeekV4与Harness全景介绍.pptx`、`DSH多模态能力演示.pptx`、`自我介绍.pptx`、`青春校园版-DeepSeek与Harness.pptx`、`Marp版介绍.pptx`
- HTML/CSS：`blackhole.html`、`blackhole-cinema.html`、`dsh.css`
- 图片：`321.png`、`arknights_*.png`×4、`generated_*.png`×2、`chart_test.png`、`table_test.png`、`vision_test.png`、`verify-reasoning-effort.png`、`bh-*.png/svg`
- 数据：`全国人口统计表_分市_七普2020.xlsx`、`census2020_clean.tsv`、`census2020_raw.tsv`
- 杂项：`dsh.ico`、`ds_logo/`、`conversation-handoff.md`、`bh-comparison.md`、`table.md`、`intro-slides.md`、`bh-profile-*.json`、`winget.log`

## 6. 数据目录（`~/.dsh/`，未归档）

```
.agent-presets/   # router-standard / minimal-win（已归档 → agent-presets/）
attachments/      # 附件
profiles/web/     # 活动 profile（配置已脱敏归档 → config/）
sessions/         # 会话记录（不公开）
skills/           # 技能（含 safe-delete 防误删技能）
storages/         # 存储
super-injector/   # 注入器状态（registry/stats/logs）
.credentials.yaml # 凭据（DEEPSEEK_API_KEY —— 不公开）
settings.yaml     # 全局设置（已脱敏归档）
AGENTS.md         # 用户全局安全规则（删除铁律 / 权限边界 / 审计）
```
