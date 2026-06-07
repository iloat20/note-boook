# 茄子笔记本

微信小程序 · 股票持仓追踪与交易记录

一款纯客户端的微信小程序，帮你记录 A 股 / 港股 / 美股交易，追踪持仓盈亏，生成统计图表与年度报告。所有数据本地存储，无需云端。

## 功能

- **持仓看板** — 实时行情（腾讯财经 API），滑动操作快速编辑，市场标签
- **交易流水** — 买入 / 卖出记录，筛选、搜索、分页
- **统计图表** — ECharts 盈亏趋势、持仓分布、收益分布散点图
- **年度报告** — 年度盈亏、胜率、月度盈亏可视化、策略分布
- **多市场** — A 股、港股、美股，含汇率换算
- **数据备份** — JSON 导入 / 导出（合并或覆盖模式）
- **Markdown 导出** — 一键生成交易流水 Markdown 文件并分享

## 架构

```
├── pages/              # 主包页面（持仓 / 流水 / 统计）
├── packageDetail/      # 分包 — 股票详情、分红
├── packageRecord/      # 分包 — 新增 / 编辑交易
├── components/         # 通用组件（年度报告、空状态、策略标签等）
├── custom-tab-bar/     # 自定义 Tab Bar（SVG 图标 + 毛玻璃样式）
├── styles/             # 全局样式
├── utils/
│   ├── storageCore/    # 底层存储（LRU 缓存、时间戳 ID、脏标记）
│   ├── models/         # Active Record 模型（Stock / Transaction / Dividend …）
│   ├── services/       # 业务服务（行情、统计、图表、汇率）
│   ├── helpers/        # 纯函数（持仓计算、手续费、排序）
│   ├── exporters/      # Markdown 导出
│   ├── ui/             # 页面 mixin、反馈
│   └── constants.js    # 枚举常量
├── api/                # 网络请求层（Token 管理、重试、占位）
└── tests/              # Jest 单元测试
```

### 数据流

用户操作 → 页面调用 `Stock/Transaction.save()` → `wx.setStorageSync` 持久化 → `markDataDirty()` 清除缓存 → 返回上一页 → `onShow()` 检测到脏标记重新加载。

### 渲染风格

iOS 26.5 毛玻璃设计系统，CSS 自定义属性定义 Apple 系统色、SF Pro 字号、强调橙 `#FF6B35`，`backdrop-filter: blur` 导航栏。

## 开发

用微信开发者工具打开项目根目录即可开发、预览、上传。

```bash
# 运行单元测试
npm test
```

## 项目结构约定

- `project.config.json` — AppID、基础库版本、编译设置
- `project.private.config.json` — 本地开发覆盖（ES6 转译、PostCSS、压缩）
- `lazyCodeLoading: "requiredComponents"` — 按需加载组件
- `componentFramework: "glass-easel"` — 使用 glass-easel 组件框架

## License

MIT
