# 代码审查报告 · 2026-07-14

> 范围：全量静态审查 + lint + 测试 + 微信洗词改造残留排查
> 方法：从 `app.json` 可达性图出发定位未注册/未引用页面与组件；全量 `require` 引用图找零调用模块；`biome lint` + `jest`；洗词残留专项排查

---

## 一、死文件（建议删除）

| # | 路径 | 文件数 | 证据 | 影响 |
|---|------|-------|------|------|
| 1 | `components/market-tag/` | 4（js/json/wxml/wxss） | 无任何 `usingComponents` 引用、无 `require`、无 `<market-tag>` 标签；git 显示 `index.wxml` 曾被改动但从未接入任何页面 | 受 `lazyCodeLoading` 影响，WeChat 不会编译，纯磁盘冗余 |
| 2 | `packageDetail/pages/dividend/` | 4（js/json/wxml/wxss） | `app.json` 子包 `packageDetail` 仅注册 `detail`；全仓无任何 `wx.navigateTo` 入口指向它；`BUG_AUDIT_REPORT` 里记录的 dividend bug 已无入口可触发 | 不可达死页 |
| 3 | `utils/helpers/feeCalculator.js` | 1 | 零 `require`、零调用（`calculateFee`/`getFeeBreakdown` 全仓仅自身定义）；注释称"保留接口兼容调用方"但已无调用方，且函数体被掏空恒返回 0 | 真·死桩模块 |
| 4 | `scripts/_patch_detail.py` | 1 | 一次性补丁脚本，已应用，硬编码绝对路径，非应用代码 | 开发残留，建议移出仓库或删除 |

---

## 二、无效 / 无用代码（非文件级）

- **`components/annual-report/annual-report.js:48`** — `catch (e)` 未用变量（`biome noUnusedVariables`）。**已修复**为 `catch`。
- **未使用的 CSS**：`app.wxss` 的 `.xhs-type-dividend` 系列、`styles/common.wxss` 的 `.market-tag` / `.tag-dividend` 等。对应 UI（分红展示 / market-tag 组件）已下线，属死样式。清理风险低、收益小，可选。
- **XIRR 计算链（半死逻辑）**：`xirrService` 经 `statsService.calcXIRRForRange` 仍被引用，但年报 UI 已移除 XIRR 展示，目前无页面入口调用该计算路径。原为"待确认裁剪"，**已于 2026-07-14 裁除**（见执行记录）。

---

## 三、lint / 测试

- **jest**：21 套件 / 156 用例全绿，**无运行期崩溃**。
- **biome lint**：31 warning + 10 info，**无 error**。均为风格项：
  - `useTemplate` ×10、`useArrowFunction` ×5、`useOptionalChain` ×4 — 可 `npx biome lint --write` 安全自动修复（**仅 lint 修复，不触碰 CRLF 格式化**）
  - `noUnusedVariables` ×1 — 已修复
- ⚠️ 勿用 `npx biome check --write --unsafe`：其格式化器会触发全量 CRLF 行尾差异（属预存问题，非本任务引入），产生巨大无意义 diff。

---

## 四、微信洗词改造残留排查

- 无任何文件仍 `<market-tag>` 或 `navigateTo` 到 dividend 页 → **无悬空组件/页引用**。
- 可见 UI 文案洗词前期已完成（见 `docs/wechat-review-residual-audit.md`），本次未发现新的"股票/持仓/分红"可见文案泄漏点。
- 按审核策略"只查运行期可见内容"：保留 `utils/models/dividend.js` 数据模型、`stockDatabase` 内置池（已置空）属合规，无需动。

---

## 五、不在本次范围

- git 工作区存在大批其他 AI 工具目录的删除（`.claude/` `.codebuddy/` `.omc/` `.trae/` `.mimocode/` 等），属你自身的清理动作，未触碰、未纳入审查。

---

## 建议删除清单（待确认）

1. `components/market-tag/`（4 文件）
2. `packageDetail/pages/dividend/`（4 文件）
3. `utils/helpers/feeCalculator.js`（1 文件）
4. `scripts/_patch_detail.py`（1 文件）

确认后执行删除并跑回归（`npx biome lint` + `npm test`）。删除对测试零影响（无任何测试引用上述文件）。

---

## 执行记录（2026-07-14）

✅ 已删除 10 个文件 + 3 个空目录（`components/market-tag/`、`packageDetail/pages/dividend/`、`scripts/`）：

- `components/market-tag/`：index.js / index.json / index.wxml / index.wxss
- `packageDetail/pages/dividend/`：dividend.js / dividend.json / dividend.wxml / dividend.wxss
- `utils/helpers/feeCalculator.js`
- `scripts/_patch_detail.py`

✅ 已修复 `components/annual-report/annual-report.js:48` `catch (e)` → `catch`（biome noUnusedVariables）。

✅ 回归结果：

- `npx biome lint`：无 error；30 warning + 10 info（均为风格项，`noUnusedVariables` 已清零）；检查文件 69 → 64。
- `npm test`：21 套件 / 156 用例全绿，无运行期崩溃。

⚠️ 删除为未暂存状态（working tree 显示 deleted），待你 review 后自行 commit。

---

## 执行记录（追加 · 2026-07-14，用户确认「裁了」）

✅ 追加裁剪 **XIRR 计算链**：

- 删除 `utils/services/xirrService.js`（XIRR 服务层：`calcXIRRForRange` / `getTotalXIRR`）、`utils/helpers/xirr.js`（纯数学 `xirr()`）、`tests/xirr.test.js`（对应单测，12 用例）。
- `utils/services/statsService.js`：移除对 xirrService 的 require；删除整段 `_getPeriodStatsWithReturn`（死函数，无任何调用方，XIRR 分支即在其中）；`returnLabel="XIRR"` 改为纯周期收益率（周/月/收益率）；`module.exports` 移除 `calcXIRRForRange` / `getTotalXIRR`。
- `utils/cache/computedCache.js`：`clearAll` 的 `knownKeys` 移除 `"total_xirr"`；同步更新 `tests/computedCache.test.js` 断言（改为验证白名单行为，非已知键应保留）。
- 回归：`npm test` **20 套件 / 144 用例全绿**（xirr.test.js 随模块删除，少 12 用例）；`biome lint` 无 error、无 warning（XIRR 裁剪无新增诊断）。

📝 报告第三节"lint/测试"为历史快照，更正如下：
- 实际用例数 **156 → 144**（删除 xirr 测试）；biome lint 当前 **0 warning**。
- "⚠️ 勿用 `biome check --write --unsafe`" 提醒已过时——本次正是用 `biome check --write --unsafe --formatter-enabled=false --assist-enabled=false` 完成风格修复（关 formatter 即不触发 CRLF diff），且 `npm test` 全绿验证无行为回退。

## 执行记录（追加 · 2026-07-14，统计页改造：取消综合明细 + 新增记录天数）

✅ 统计页（`pages/stats/`）改造：

- `stats.js`：`loadStats()` 移除 `detailItems`（仅「累计净变动」一行）数据源及 setData；新增 `stats.recordDays` = 最早记录（交易/分红 `date` 取 min，定宽 `"YYYY-MM-DD"` 字符串比较）到今天（含今天）的天数，`Math.ceil((今日UTC零点-最早UTC零点)/86400000)+1`；`onClearAllData` setData 同步移除 `detailItems: []`。
- `stats.wxml`：删除整块「综合明细」卡片；顶部网格新增第 4 张「记录天数」卡（🗓️ / `cover-days`）。
- `stats.wxss`：新增 `.cover-days` 紫色渐变 `linear-gradient(135deg,#F0F0FF,#E0E0FF)`。
- `tests/statsWashWords.test.js`：原 `detailItems` 断言改为校验 `stats.recordDays` 为 number 且 > 0。
- `README.md`：两处功能描述同步（综合明细→记录天数等）。
- 顺手清理 XIRR 裁剪遗留：`statsService.js` 删除未用 import（Stock / getClearedPositions / getRate / getRates / fmt）。
- 回归：`npm test` **20 套件 / 144 用例全绿**；`npx biome lint` 0 error / 0 warning / 0 info（含 `useTemplate` 改写为模板字符串）。
