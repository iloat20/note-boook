const { collectFilterIds, isAllSelected } = require("../utils/helpers/batchSelect");

test("collectFilterIds 摊平分组记录", () => {
	const grouped = [{ items: [{ id: 1 }, { id: 2 }] }, { items: [{ id: 3 }] }];
	expect(collectFilterIds(grouped)).toEqual([1, 2, 3]);
});

test("isAllSelected: 筛选内全部选中 => true", () => {
	expect(isAllSelected([1, 2, 3], [1, 2, 3])).toBe(true);
});

test("isAllSelected: 仅选中子集 => false", () => {
	expect(isAllSelected([1], [1, 2, 3])).toBe(false);
});

test("isAllSelected: 筛选为空 => false", () => {
	expect(isAllSelected([], [])).toBe(false);
});
