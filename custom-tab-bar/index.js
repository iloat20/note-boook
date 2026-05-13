Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: "/pages/index/index",
        text: "持仓",
        iconPath: "/images/tab-portfolio.svg",
        selectedIconPath: "/images/tab-portfolio-active.svg"
      },
      {
        pagePath: "/pages/history/history",
        text: "流水",
        iconPath: "/images/tab-history.svg",
        selectedIconPath: "/images/tab-history-active.svg"
      },
      {
        pagePath: "/pages/stats/stats",
        text: "统计",
        iconPath: "/images/tab-stats.svg",
        selectedIconPath: "/images/tab-stats-active.svg"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const url = e.currentTarget.dataset.path
      wx.switchTab({ url })
    }
  }
})
