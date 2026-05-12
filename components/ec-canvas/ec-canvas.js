// components/ec-canvas/ec-canvas.js
// ECharts 微信小程序组件 - 适配 liquid glass 主题

const WxCanvas = require('./wx-canvas');
const echarts = require('./echarts');

let ctx;

function compareVersion(v1, v2) {
  v1 = v1.split('.');
  v2 = v2.split('.');
  const len = Math.max(v1.length, v2.length);
  while (v1.length < len) v1.push('0');
  while (v2.length < len) v2.push('0');
  for (let i = 0; i < len; i++) {
    const num1 = parseInt(v1[i]) || 0;
    const num2 = parseInt(v2[i]) || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

Component({
  properties: {
    canvasId: { type: String, value: 'ec-canvas' },
    ec: { type: Object },
    forceUseOldCanvas: { type: Boolean, value: false }
  },

  data: {
    isUseNewCanvas: false
  },

  ready: function () {
    // 禁用 progressive 渲染（小程序不支持）
    echarts.registerPreprocessor(function (option) {
      if (option && option.series) {
        if (Array.isArray(option.series)) {
          option.series.forEach(function (series) { series.progressive = 0; });
        } else if (typeof option.series === 'object') {
          option.series.progressive = 0;
        }
      }
    });

    if (!this.data.ec) {
      console.warn('ec-canvas 组件需绑定 ec 变量，例：<ec-canvas id="mychart" canvas-id="mychart" ec="{{ec}}"></ec-canvas>');
      return;
    }

    if (!this.data.ec.lazyLoad) {
      this.init();
    }
  },

  methods: {
    init: function (callback) {
      const systemInfo = wx.getWindowInfo() || {};
      const appBaseInfo = wx.getAppBaseInfo() || {};
      const version = appBaseInfo.SDKVersion || '2.0.0';
      const canUseNewCanvas = compareVersion(version, '2.9.0') >= 0;
      const forceUseOldCanvas = this.data.forceUseOldCanvas;
      const isUseNewCanvas = canUseNewCanvas && !forceUseOldCanvas;
      this.setData({ isUseNewCanvas: isUseNewCanvas });

      if (isUseNewCanvas) {
        this.initByNewWay(callback);
      } else {
        const isValid = compareVersion(version, '1.9.91') >= 0;
        if (!isValid) {
          console.error('微信基础库版本过低，需大于等于 1.9.91');
          return;
        }
        this.initByOldWay(callback);
      }
    },

    initByOldWay: function (callback) {
      ctx = wx.createCanvasContext(this.data.canvasId, this);
      const canvas = new WxCanvas(ctx, this.data.canvasId, false);
      if (echarts.setPlatformAPI) {
        echarts.setPlatformAPI({ createCanvas: function () { return canvas; } });
      } else {
        echarts.setCanvasCreator(function () { return canvas; });
      }
      const canvasDpr = 1;
      var query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').boundingClientRect(function (res) {
        if (typeof callback === 'function') {
          this.chart = callback(canvas, res.width, res.height, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, res.width, res.height, canvasDpr);
        }
      }.bind(this)).exec();
    },

    initByNewWay: function (callback) {
      const query = wx.createSelectorQuery().in(this);
      query.select('.ec-canvas').fields({ node: true, size: true }).exec(function (res) {
        const canvasNode = res[0].node;
        this.canvasNode = canvasNode;
        const windowInfo = wx.getWindowInfo() || {};
        const canvasDpr = windowInfo.pixelRatio || 1;
        const canvasWidth = res[0].width;
        const canvasHeight = res[0].height;
        const ctx = canvasNode.getContext('2d');
        const canvas = new WxCanvas(ctx, this.data.canvasId, true, canvasNode);

        if (echarts.setPlatformAPI) {
          echarts.setPlatformAPI({
            createCanvas: function () { return canvas; },
            loadImage: function (src, onload, onerror) {
              if (canvasNode.createImage) {
                const image = canvasNode.createImage();
                image.onload = onload;
                image.onerror = onerror;
                image.src = src;
                return image;
              }
              console.error('加载图片依赖 Canvas.createImage() API');
            }
          });
        } else {
          echarts.setCanvasCreator(function () { return canvas; });
        }

        if (typeof callback === 'function') {
          this.chart = callback(canvas, canvasWidth, canvasHeight, canvasDpr);
        } else if (this.data.ec && typeof this.data.ec.onInit === 'function') {
          this.chart = this.data.ec.onInit(canvas, canvasWidth, canvasHeight, canvasDpr);
        }
      }.bind(this));
    },

    canvasToTempFilePath: function (opt) {
      if (this.data.isUseNewCanvas) {
        const query = wx.createSelectorQuery().in(this);
        query.select('.ec-canvas').fields({ node: true, size: true }).exec(function (res) {
          const canvasNode = res[0].node;
          opt.canvas = canvasNode;
          wx.canvasToTempFilePath(opt);
        });
      } else {
        if (!opt.canvasId) opt.canvasId = this.data.canvasId;
        ctx.draw(true, function () {
          wx.canvasToTempFilePath(opt, this);
        }.bind(this));
      }
    },

    touchStart: function (e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousedown', {
          zrX: touch.x, zrY: touch.y,
          preventDefault: function () {}, stopImmediatePropagation: function () {}, stopPropagation: function () {}
        });
        handler.dispatch('mousemove', {
          zrX: touch.x, zrY: touch.y,
          preventDefault: function () {}, stopImmediatePropagation: function () {}, stopPropagation: function () {}
        });
        handler.processGesture(wrapTouch(e), 'start');
      }
    },

    touchMove: function (e) {
      if (this.chart && e.touches.length > 0) {
        var touch = e.touches[0];
        var handler = this.chart.getZr().handler;
        handler.dispatch('mousemove', {
          zrX: touch.x, zrY: touch.y,
          preventDefault: function () {}, stopImmediatePropagation: function () {}, stopPropagation: function () {}
        });
        handler.processGesture(wrapTouch(e), 'change');
      }
    },

    touchEnd: function (e) {
      if (this.chart) {
        var touch = e.changedTouches ? e.changedTouches[0] : {};
        var handler = this.chart.getZr().handler;
        handler.dispatch('mouseup', {
          zrX: touch.x, zrY: touch.y,
          preventDefault: function () {}, stopImmediatePropagation: function () {}, stopPropagation: function () {}
        });
        handler.dispatch('click', {
          zrX: touch.x, zrY: touch.y,
          preventDefault: function () {}, stopImmediatePropagation: function () {}, stopPropagation: function () {}
        });
        handler.processGesture(wrapTouch(e), 'end');
      }
    }
  }
});

function wrapTouch(event) {
  var touch = event.touches[0] || {};
  touch.offsetX = touch.x;
  touch.offsetY = touch.y;
  return event;
}
