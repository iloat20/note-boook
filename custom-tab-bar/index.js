Component({
  data: {
    selected: 0,
    list: [
      { pagePath: "/pages/index/index", text: "持仓", icon: "□" },
      { pagePath: "/pages/history/history", text: "流水", icon: "≡" },
      { pagePath: "/pages/stats/stats", text: "统计", icon: "⊙" }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      wx.switchTab({ url })
    }
  }
})
