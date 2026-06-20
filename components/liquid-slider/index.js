Component({
	properties: {
		tabs: {
			type: Array,
			value: [],
			// 每项: { key: String|Null, label: String, count?: Number }
		},
		currentKey: {
			type: null,
			value: null,
		},
		showCount: {
			type: Boolean,
			value: false,
		},
	},

	data: {
		sliderLeft: 0,
		sliderWidth: 0,
	},

	observers: {
		"tabs, currentKey": function () {
			wx.nextTick(() => this._updateSliderPosition());
		},
	},

	methods: {
		onTap(e) {
			const key = e.currentTarget.dataset.key;
			this.triggerEvent("change", { key });
		},

		_updateSliderPosition() {
			const tabs = this.data.tabs;
			const currentKey = this.data.currentKey;
			if (!tabs || tabs.length === 0) return;

			const activeIndex = tabs.findIndex((t) => {
				// 同时支持 null 和字符串比较
				if (currentKey === null && t.key === null) return true;
				return t.key === currentKey;
			});
			if (activeIndex < 0) return;

			const query = this.createSelectorQuery();
			query.selectAll(".liquid-slider-item").boundingClientRect();
			query.select(".liquid-slider").boundingClientRect();
			query.exec((res) => {
				const rects = res[0];
				const containerRect = res[1];
				if (!rects?.[activeIndex] || !containerRect) return;
				this.setData({
					sliderLeft: rects[activeIndex].left - containerRect.left,
					sliderWidth: rects[activeIndex].width,
				});
			});
		},
	},

	lifetimes: {
		ready() {
			wx.nextTick(() => this._updateSliderPosition());
		},
	},
});
