Component({
  properties: {
    market: {
      type: String,
      value: '' // 'A_SHARE' | 'HK_SHARE' | 'US_SHARE'
    },
    label: {
      type: String,
      value: '' // 可选，覆盖默认显示文字
    }
  }
})
