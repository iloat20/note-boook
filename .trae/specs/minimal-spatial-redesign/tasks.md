# Minimal + Spatial UI 设计重构 - 任务列表

- [x] Task 1: 重构全局设计系统 (app.wxss + app.json + app.js)
  - [x] SubTask 1.1: 重写 app.wxss，定义完整的设计 Token（色彩、阴影、排版、圆角、间距、交互）
  - [x] SubTask 1.2: 更新 app.json，配置透明导航栏、页面转场动画
  - [x] SubTask 1.3: 更新 app.js，添加系统暗黑模式检测与全局状态

- [x] Task 2: 重构首页 - 持仓 (pages/index/index)
  - [x] SubTask 2.1: 重写 index.wxml，极简结构：大标题 + 市场 Tab + 卡片列表 + FAB
  - [x] SubTask 2.2: 重写 index.wxss，Spatial UI 风格，shadow-md 卡片，无边框设计
  - [x] SubTask 2.3: 更新 index.js，格式化数据适配新模板

- [x] Task 3: 重构流水页 (pages/history/history)
  - [x] SubTask 3.1: 重写 history.wxml，日期分组 + 左滑删除支持
  - [x] SubTask 3.2: 重写 history.wxss，极简列表风格
  - [x] SubTask 3.3: 更新 history.js，数据格式化

- [x] Task 4: 重构统计页 (pages/stats/stats)
  - [x] SubTask 4.1: 重写 stats.wxml，指标卡片 + 时间 Tab + 图表 + 明细
  - [x] SubTask 4.2: 重写 stats.wxss，适配新设计系统
  - [x] SubTask 4.3: 更新 stats.js，预计算图表数据（Y轴标签、点位置等）

- [x] Task 5: 重构记录页 (pages/record/record)
  - [x] SubTask 5.1: 重写 record.wxml，表单结构
  - [x] SubTask 5.2: 重写 record.wxss，表单输入框样式
  - [x] SubTask 5.3: 更新 record.js，CTA 按钮逻辑

- [x] Task 6: 重构分红页 (pages/dividend/dividend)
  - [x] SubTask 6.1: 重写 dividend.wxml，股票选择器 + 表单
  - [x] SubTask 6.2: 重写 dividend.wxss，表单样式
  - [x] SubTask 6.3: 更新 dividend.js，数据格式化

- [x] Task 7: 重构详情页 (pages/detail/detail)
  - [x] SubTask 7.1: 重写 detail.wxml，信息卡片 + 记录列表
  - [x] SubTask 7.2: 重写 detail.wxss，卡片层级
  - [x] SubTask 7.3: 更新 detail.js，数据格式化

- [x] Task 8: 实现自定义 TabBar
  - [x] SubTask 8.1: 创建 custom-tab-bar 组件（WXML + WXSS + JS）
  - [x] SubTask 8.2: 各页面 JS 中设置选中态
  - [x] SubTask 8.3: 适配底部安全区
