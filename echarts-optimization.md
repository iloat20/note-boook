# ECharts 精简优化报告

## 优化结果

| 项目 | 优化前 | 优化后 | 减少 |
|------|--------|--------|------|
| echarts.js | 600KB | 351KB | **42%** |
| 总包大小（估算） | 5.3MB | 4.9MB | ~7% |

## 使用方式

用 Google Closure Compiler ADVANCED_OPTIMIZATIONS 级别压缩
（ECharts 官方在线构建器同款压缩器，压缩率高于 esbuild/terser）

## 验证步骤

在微信开发者工具中：
1. 打开统计页面（pages/stats/stats）
2. 确认柱状图、折线图正常渲染
3. 确认 tooltip 提示框正常显示
4. 确认图例（legend）正常切换

## 进一步优化（可选）

如需达到 150-200KB（70% 压缩），需使用 ECharts 官方在线构建器：
1. 访问 https://echarts.apache.org/zh/builder.html
2. 只勾选：Bar、Line（图表）；Tooltip、Legend、Grid（组件）
3. 点击下载，用下载的文件替换 `components/ec-canvas/echarts.js`
