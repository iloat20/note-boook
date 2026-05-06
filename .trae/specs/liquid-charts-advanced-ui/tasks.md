# 液态滑动器 + 高级动效 + 图表增强 - 任务列表

- [x] Task 1: 实现液态市场滑动器组件
  - [x] SubTask 1.1: 在 app.wxss 添加液态滑动器样式（胶囊滑块、渐变背景、过渡动画）
  - [x] SubTask 1.2: 更新 index.wxml 和 history.wxml，替换 tab-bar-line 为液态滑动器
  - [x] SubTask 1.3: 更新 index.js 和 history.js，适配新滑动器数据绑定

- [x] Task 2: 费率实时自动计算增强
  - [x] SubTask 2.1: 更新 record.js，移除"重算"按钮，输入价格/数量时自动触发计算
  - [x] SubTask 2.2: 更新 record.wxml，费率明细实时展示，移除手动触发按钮

- [x] Task 3: 卡片 Z 轴视差滚动效果
  - [x] SubTask 3.1: 在 app.wxss 添加视差相关样式（perspective、translateZ、transition）
  - [x] SubTask 3.2: 在 index.js 中添加 scroll 事件监听，计算每张卡片位置并设置视差
  - [x] SubTask 3.3: 在 index.wxml 中添加 data-index 和动态 style 绑定

- [x] Task 4: 液态消融删除动效
  - [x] SubTask 4.1: 在 app.wxss 添加消融动画关键帧（scale+opacity+blur）
  - [x] SubTask 4.2: 在 history.js 和 detail.js 删除方法中添加删除动画逻辑
  - [x] SubTask 4.3: 动画结束后执行实际数据删除和列表刷新

- [x] Task 5: 交易热力图
  - [x] SubTask 5.1: 在 storage.js 添加热力图数据生成函数（按日统计交易次数/金额）
  - [x] SubTask 5.2: 在 stats.wxml 添加热力图模块（日历格布局，按月分组）
  - [x] SubTask 5.3: 在 stats.wxss 添加热力图样式（格子尺寸、颜色渐变）
  - [x] SubTask 5.4: 在 stats.js 添加热力图数据加载和月份切换逻辑

- [x] Task 6: 图表优化 - 渐变连线 + 标注极值
  - [x] SubTask 6.1: 在 stats.wxss 优化柱状图样式，确保红涨绿跌配色
  - [x] SubTask 6.2: 在 stats.js 计算累计收益最大/最小值，标注极值点
  - [x] SubTask 6.3: 在 stats.wxml 为极值点添加特殊样式标注
