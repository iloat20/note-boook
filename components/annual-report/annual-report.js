const { fmt } = require("../../utils/helpers/format");

Component({
	properties: {
		data: {
			type: Object,
			value: null,
		},
	},

	data: {
		exporting: false,
		processedMonthlyData: [],
	},

	lifetimes: {
		attached: function () {
			this._processData();
		},
	},

	observers: {
		data: function (newData) {
			if (newData) {
				this._processData();
			}
		},
	},

	methods: {
		_processData: function () {
			const data = this.properties.data;
			if (!data || !data.monthlyPnL) {
				this.setData({ processedMonthlyData: [] });
				return;
			}

			const monthlyPnL = data.monthlyPnL;
			let maxVal = 1;

			monthlyPnL.forEach((item) => {
				if (Math.abs(item.pnL) > maxVal) {
					maxVal = Math.abs(item.pnL);
				}
			});

			if (maxVal === 0) maxVal = 1;

			const processedData = monthlyPnL.map((item) => {
				let heightPercent = Math.min((Math.abs(item.pnL) / maxVal) * 100, 100);
				if (heightPercent === 0 && item.pnL === 0) {
					heightPercent = 5;
				}
				return {
					month: item.month,
					monthText: item.month + "月",
					pnL: item.pnL,
					pnLText:
						item.pnL >= 0 ? "+" + item.pnL.toFixed(0) : item.pnL.toFixed(0),
					heightPercent: heightPercent,
					isProfit: item.pnL >= 0,
				};
			});

			this.setData({
				processedMonthlyData: processedData,
			});
		},

		onClose: function () {
			this.triggerEvent("close");
		},

		onExportImage: function () {
			if (this.data.exporting) return;
			this.setData({ exporting: true });
			wx.showToast({ title: "导出功能开发中", icon: "none" });
			setTimeout(() => {
				this.setData({ exporting: false });
			}, 1000);
		},
	},
});
