# 茄子笔记本 🦞

微信小程序 · 股票持仓追踪与交易记录

纯客户端的微信小程序，记录 A 股 / 港股 / 美股交易，追踪持仓盈亏，生成统计图表与年度报告。所有数据 `wx.setStorageSync` 本地存储，无需云端。

## 功能

- **持仓看板** — 实时行情（腾讯财经 API），左滑编辑/卖出/删除，多市场标签切换
- **交易流水** — 买入 / 卖出 / 分红记录，筛选、搜索、分页、批量删除
- **统计图表** — 盈亏概览、收益率（含 XIRR）、周期趋势、月度热力图
- **年度报告** — 纯 CSS 渲染的年度盈亏、胜率、月度可视化、策略分布
- **多市场** — A 股、港股、美股，汇率实时换算
- **数据备份** — JSON 导入 / 导出（合并或覆盖模式）
- **Markdown 导出** — 一键生成交易流水 Markdown 文件并分享

## 架构

```
├── pages/              # 主包页面（持仓 / 流水 / 统计）
├── packageDetail/      # 分包 — 股票详情、分红
├── packageRecord/      # 分包 — 新增 / 编辑交易
├── components/         # 通用组件（年度报告、快捷记录、滑动选择器等）
├── custom-tab-bar/     # 自定义 Tab Bar（SVG 图标 + 毛玻璃样式）
├── styles/             # 全局样式变量

├── utils/
│   ├── storageCore/    # 底层存储（LRU 缓存 + Object.freeze 防篡改）
│   ├── models/         # Active Record 模型（Stock / Transaction / Dividend …）
│   ├── services/       # 业务服务（行情、统计、持仓计算、汇率、XIRR）
│   ├── helpers/        # 纯函数（持仓计算、手续费、排序、日期范围）
│   ├── state/          # 轻量状态管理（脏标记 + mutation 订阅）
│   ├── cache/          # LRU 缓存管理器（按股票粒度清除）
│   ├── ui/             # 页面 mixin、触摸手势、动画助手
│   └── constants/      # 枚举常量、市场配置
├── api/                # 网络请求层
└── tests/              # Jest 单元测试
```

### 数据流

```
用户操作 → 页面调用 Model.save()
   → upsertAndSave() + wx.setStorageSync 持久化
   → markDataDirty() 按 stockId 粒度清除 LRU 缓存
   → 返回上一页 → onShow() 消费脏标记 → 增量刷新
```

### 技术特色

- **纯客户端** — 所有数据本地存储，0 服务端依赖
- **LRU 缓存** — 持仓计算结果 / 行情 / 统计数据分层缓存，带 TTL 自动过期
- **CSS 优先** — 年度报告纯 CSS 渲染，无需 Canvas，GPU 加速
- **毛玻璃设计** — iOS 风格设计系统，CSS 自定义属性，`backdrop-filter` 导航栏
- **手势驱动** — RAF 节流 + data path 精确更新的左滑菜单
- **延迟加载** — 分包预加载、按需组件、非首屏模块延迟 import
- **入场动画** — CSS `transform/opacity` 交错入场，首次展示后锁定，不重播

## 开发

```bash
# 安装依赖
npm install

# 运行单元测试
npm test

# 代码检查
npx biome check pages/ utils/ components/ packageDetail/ packageRecord/

# 自动修复
npx biome check --write --unsafe pages/ utils/ components/ packageDetail/ packageRecord/
```

在 **微信开发者工具** 中打开项目根目录即可构建、预览、上传。

### 项目配置

- `project.config.json` — AppID、基础库版本
- `lazyCodeLoading: "requiredComponents"` — 按需加载组件
- `componentFramework: "glass-easel"` — Glass Easel 组件框架

## License

MIT
