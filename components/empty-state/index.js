Component({
	options: {
		multipleSlots: true,
	},
	properties: {
		icon: {
			type: String,
			value: "📊",
		},
		title: {
			type: String,
			value: "暂无数据",
		},
		desc: {
			type: String,
			value: "",
		},
		showSlot: {
			type: Boolean,
			value: false,
		},
	},
});
