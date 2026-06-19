Component({
  properties: {
    tabs: {
      type: Array,
      value: []
      // 每项: { key: String|Null, label: String, count?: Number }
    },
    currentKey: {
      type: null,
      value: null
    },
    showCount: {
      type: Boolean,
      value: false
    }
  },

  data: {
    sliderLeft: 0,
    sliderWidth: 0
  },

  observers: {
    'tabs, currentKey': function () {
      wx.nextTick(() => this._updateSliderPosition())
    }
  },

  methods: {
    onTap(e) {
      const key = e.currentTarget.dataset.key
      this.triggerEvent('change', { key })
    },

    _updateSliderPosition() {
      var tabs = this.data.tabs
      var currentKey = this.data.currentKey
      if (!tabs || tabs.length === 0) return

      var activeIndex = tabs.findIndex(function (t) {
        if (currentKey === null && t.key === null) return true
        return t.key === currentKey
      })
      if (activeIndex < 0) return

      var query = this.createSelectorQuery()
      query.selectAll('.liquid-slider-item').boundingClientRect()
      query.select('.liquid-slider').boundingClientRect()
      query.exec(function (res) {
        var rects = res[0]
        var containerRect = res[1]
        if (!rects || !rects[activeIndex] || !containerRect) return
        this.setData({
          sliderLeft: rects[activeIndex].left - containerRect.left,
          sliderWidth: rects[activeIndex].width
        })
      }.bind(this))
    }
  },

  lifetimes: {
    ready() {
      wx.nextTick(() => this._updateSliderPosition())
    }
  }
})
