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

	methods: {
		onTap(e) {
			const key = e.currentTarget.dataset.key;
			this.triggerEvent("change", { key });
		},
	},
});
