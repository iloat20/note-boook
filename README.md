# 茄子笔记本

微信小程序 · 股票持仓追踪与交易记录

纯客户端微信小程序，记录 A 股 / 港股 / 美股交易，追踪持仓盈亏，生成统计图表与年度报告。所有数据本地存储（`wx.setStorageSync`），无需云端。

## 功能

- **持仓看板** — 自选股票，按市场筛选（全部/A股/港股/美股）；实时行情（腾讯财经 API），滑动操作快速编辑/卖出/删除
- **交易流水** — 买入/卖出/分红记录，市场、类型、策略多维筛选，搜索、分页、批量删除
- **统计图表** — ECharts 持仓分布、盈亏趋势（混合柱线图）、收益散点图
- **年度报告** — 年度盈亏、胜率、月度盈亏 CSS 条形图、策略分布、资金流向
- **多市场** — A 股、港股、美股，含 USD/HKD → CNY 汇率换算
- **数据备份** — JSON 导入/导出（合并或覆盖模式）
- **Markdown 导出** — 一键生成交易流水 Markdown 文件并分享
- **持仓分享图** — Canvas 2D 渲染持仓卡片，支持保存/分享
- **内置股票库** — ~130 只常见 A 股/港股/美股，代码+名称搜索建议
- **交易日志** — 每笔交易可记录操作原因与策略标签

## 架构

```
├── pages/                  # 主包页面
│   ├── index/              #   持仓看板（持仓池首页）
│   ├── history/            #   交易流水
│   └── stats/              #   统计图表 + 年度报告
├── packageDetail/          # 分包 — 股票详情、分红管理
├── packageRecord/          # 分包 — 新增/编辑交易
├── components/             # 通用组件
│   ├── annual-report/      #   年度报告（CSS 图表）
│   ├── empty-state/        #   空状态占位
│   ├── liquid-slider/      #   液态动画切换滑块
│   ├── market-tag/         #   市场标签（A/HK/US）
│   ├── quick-record/       #   快捷录入浮层
│   ├── section-header/     #   分区标题
│   └── strategy-tags/      #   策略标签选择器
├── custom-tab-bar/         # 自定义 Tab Bar（毛玻璃 + SVG 图标）
├── styles/                 # 全局样式（iOS 26.5 毛玻璃设计系统）
├── utils/
│   ├── storageCore/        #   底层存储（LRU 缓存、时间戳 ID、脏标记）
│   ├── models/             #   Active Record 模型（Stock/Transaction/Dividend…）
│   ├── services/           #   业务服务（行情、统计、图表、汇率、持仓）
│   ├── helpers/            #   纯函数（持仓计算、手续费、XIRR、排序、格式化）
│   ├── cache/              #   4 路 LRU 缓存（position/heatmap/periodStats/mem）
│   ├── state/              #   轻量 Store（appStore/positionStore）
│   ├── constants/          #   配置 + 常量（config.js, market.js, errorCodes.js）
│   ├── data/               #   内置股票数据库（~130 只）
│   ├── exporters/          #   Markdown 导出
│   ├── render/             #   Canvas 2D 持仓分享图
│   ├── ui/                 #   页面 mixin、手势、反馈、动画、确认弹窗
│   └── errors.js           #   语义化错误类（AppError 体系）
├── api/                    # 网络请求层（Token 管理、重试、占位）
└── tests/                  # Jest 单元测试
```

### 数据流

```
用户操作 → Stock/Transaction.save()
  → wx.setStorageSync（持久化）
  → markDataDirty()（设脏标记 + 清除 LRU 缓存）
  → 返回上一页
  → onShow() 检测 dataDirty
  → positionService.getPositionSummary()
  → 持仓池实时计算入库
```

### 渲染风格

iOS 26.5 毛玻璃设计系统（`app.wxss` 定义 CSS 自定义属性），`backdrop-filter: blur` 导航栏与 Tab Bar，强调橙色 `#FF6B35`。

### 分包预加载

| 页面 | 分包 | 预加载触发页 |
|------|------|-------------|
| 新建/编辑交易 | `packageRecord/` | index, history, stats |
| 股票详情 + 分红 | `packageDetail/` | index, history, stats |

## 开发

用微信开发者工具打开项目根目录即可开发、预览、上传。

```bash
# 运行单元测试
npm test
```

## 项目约定

- `project.config.json` — AppID、基础库版本、编译设置
- `project.private.config.json` — 本地开发覆盖（ES6 转译、PostCSS、压缩）
- `componentFramework: "glass-easel"` — glass-easel 组件框架
- `lazyCodeLoading: "requiredComponents"` — 按需加载组件
- `preloadRule` — 分包预加载优化

## License

MIT
