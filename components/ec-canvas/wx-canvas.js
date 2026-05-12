// components/ec-canvas/wx-canvas.js
// WxCanvas - 适配微信小程序 Canvas API 到 ECharts

module.exports = class WxCanvas {
  constructor(ctx, canvasId, isNew, canvasNode) {
    this.ctx = ctx;
    this.canvasId = canvasId;
    this.chart = null;
    this.isNew = isNew;
    if (isNew) {
      this.canvasNode = canvasNode;
    } else {
      this._initStyle(ctx);
    }
    this._initEvent();
  }

  getContext(contextType) {
    if (contextType === '2d') {
      return this.ctx;
    }
  }

  setChart(chart) {
    this.chart = chart;
  }

  addEventListener() {}
  attachEvent() {}
  detachEvent() {}

  _initStyle(ctx) {
    ctx.createRadialGradient = function () {
      return ctx.createCircularGradient.apply(ctx, arguments);
    };
  }

  _initEvent() {
    this.event = {};
    const eventNames = [
      { wxName: 'touchStart', ecName: 'mousedown' },
      { wxName: 'touchMove', ecName: 'mousemove' },
      { wxName: 'touchEnd', ecName: 'mouseup' }
    ];
    eventNames.forEach(name => {
      this.event[name.wxName] = (e) => {
        const touch = e.touches[0];
        this.chart.getZr().handler.dispatch(name.ecName, {
          zrX: name.wxName === 'tap' ? touch.clientX : touch.x,
          zrY: name.wxName === 'tap' ? touch.clientY : touch.y,
          preventDefault: () => {},
          stopImmediatePropagation: () => {},
          stopPropagation: () => {}
        });
      };
    });
  }

  set width(w) {
    if (this.canvasNode) this.canvasNode.width = w;
  }
  set height(h) {
    if (this.canvasNode) this.canvasNode.height = h;
  }
  get width() {
    if (this.canvasNode) return this.canvasNode.width;
    return 0;
  }
  get height() {
    if (this.canvasNode) return this.canvasNode.height;
    return 0;
  }
};
