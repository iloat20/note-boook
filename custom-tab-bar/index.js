Component({
	data: {
		selected: 0,
		animating: false,
		list: [
			{
				pagePath: "/pages/index/index",
				text: "持仓",
				iconPath: "/images/tab-portfolio.svg",
				selectedIconPath: "/images/tab-portfolio-active.svg",
			},
			{
				pagePath: "/pages/history/history",
				text: "流水",
				iconPath: "/images/tab-history.svg",
				selectedIconPath: "/images/tab-history-active.svg",
			},
			{
				pagePath: "/pages/stats/stats",
				text: "统计",
				iconPath: "/images/tab-stats.svg",
				selectedIconPath: "/images/tab-stats-active.svg",
			},
		],
	},

	lifetimes: {
		attached() {
			// 初始化时检查当前页面
			setTimeout(() => {
				this.updateSelectedTab();
			}, 100);
		},
	},

	pageLifetimes: {
		show() {
			// 页面显示时更新选中状态
			this.updateSelectedTab();
		},
	},

	methods: {
		updateSelectedTab() {
			try {
				const pages = getCurrentPages();
				if (!pages || pages.length === 0) return;

				const currentPage = pages[pages.length - 1];
				if (!currentPage) return;

				const route = currentPage.route ? "/" + currentPage.route : "";
				if (!route) return;

				const index = this.data.list.findIndex(
					(item) => item.pagePath === route,
				);
				if (index !== -1 && index !== this.data.selected) {
					this.setData({ selected: index });
				}
			} catch (e) {
				console.log("[TabBar] updateSelectedTab error:", e);
			}
		},

		switchTab(e) {
			const url = e.currentTarget.dataset.path;
			const index = e.currentTarget.dataset.index;

			// 如果点击的是当前页面，不执行切换
			if (index === this.data.selected) return;

			// 添加触觉反馈
			try {
				wx.vibrateShort({ type: "light" });
			} catch (e) {}

			// 设置动画状态
			this.setData({ animating: true, selected: index });

			// 执行切换
			wx.switchTab({
				url,
				success: () => {
					setTimeout(() => {
						this.setData({ animating: false });
					}, 300);
				},
			});
		},
	},
});
