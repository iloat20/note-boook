// 纯函数：把 groupedHistory（[{date, items:[{id}]}]）摊平为 id 数组
function collectFilterIds(grouped) {
	const ids = [];
	(grouped || []).forEach((g) => {
		(g.items || []).forEach((it) => {
			if (it.merged && Array.isArray(it.subRecords)) {
				it.subRecords.forEach((sub) => {
					ids.push(sub.id);
				});
			} else {
				ids.push(it.id);
			}
		});
	});
	return ids;
}

// 纯函数：当前筛选内 id 是否全部被选中
function isAllSelected(selectedIds, filterIds) {
	if (!filterIds || filterIds.length === 0) return false;
	const set = new Set(selectedIds || []);
	return filterIds.every((id) => set.has(id));
}

module.exports = { collectFilterIds, isAllSelected };
