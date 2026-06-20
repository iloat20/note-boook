---
name: wxminiprogram-audit
description: "Run a comprehensive audit of this WeChat Mini Program codebase — dispatch parallel subagents to review storage/models, helpers/services, pages, WXML/WXSS, and app-level code for bugs, performance issues, or memory leaks."
---

# WeChat Mini Program Audit

Runs a structured, multi-agent audit of this WeChat Mini Program codebase. Dispatches parallel subagents to cover every layer, then synthesizes findings into an actionable report.

## Usage

```
/wxminiprogram-audit [mode]
```

Modes:
- `bug` (default) — full bug audit across all layers
- `perf` — performance and memory audit
- `both` — run both audits sequentially

## Procedure

### Step 1: Discover current project structure

Before dispatching subagents, run a quick project scan to confirm the current file tree:

```bash
Get-ChildItem -Recurse -File -Include *.js,*.wxml,*.wxss,*.json | Where-Object { $_.FullName -notmatch 'node_modules|\.claude' } | Select-Object -ExpandProperty FullName
```

Update the file lists below if pages/components have been added or removed since the last run.

### Step 2: Dispatch audit subagents (parallel)

#### Bug Audit Mode — 7 subagents

**Subagent 1: Explore project structure**
- Read the full file tree and confirm all directories: `pages/`, `utils/`, `components/`, `custom-tab-bar/`, `packageRecord/`, `packageDetail/`
- Report any orphaned files or missing expected files

**Subagent 2: Review storage & data layer**
- Read: `utils/storageCore/core.js`, `utils/models/` (all), `utils/helpers/` (all), `utils/services/` (all)
- Look for: logic errors, race conditions, data corruption risks, off-by-one errors, null/undefined handling, incorrect calculations, memory leaks
- Report specific line numbers

**Subagent 3: Review main pages**
- Read: `pages/index/index.js`, `pages/history/history.js`, `pages/stats/stats.js`
- Look for: logic errors, lifecycle issues, data binding problems, navigation bugs, event handler issues, memory leaks, incorrect calculations, missing error handling
- Report specific line numbers

**Subagent 4: Review subpackage pages**
- Read: `packageRecord/pages/record/record.js`, `packageDetail/pages/detail/detail.js`, `packageDetail/pages/dividend/dividend.js`
- Look for: form validation gaps, data mutation issues, navigation bugs, missing error handling, race conditions, incorrect calculations
- Report specific line numbers

**Subagent 5: Review WXML templates & WXSS styles**
- Read all `.wxml` and `.wxss` files across pages, subpackages, and components
- Look for: incorrect bindings, missing conditionals, wrong event handlers, accessibility issues, template rendering bugs, CSS specificity issues
- Report specific line numbers

**Subagent 6: Review app-level code & components**
- Read: `app.js`, `app.json`, `app.wxss`, `custom-tab-bar/index.js`, `custom-tab-bar/index.wxml`, `custom-tab-bar/index.wxss`, `components/ec-canvas/ec-canvas.js`, `utils/render/`, `utils/exporters/`, `utils/ui/` (all)
- Look for: CSS bugs, wrong selectors, specificity issues, missing styles, lifecycle bugs, share/export bugs
- Report specific line numbers

**Subagent 7: Review animation implementations**
- Search for: CSS `@keyframes`, animation/transition properties, JS animation logic, `wx.createAnimation`, animation helpers
- Report ALL findings with file paths and line numbers, grouped by page/component

#### Performance Audit Mode — 3 subagents

**Subagent 1: Audit page performance**
- Read: `pages/index/index.js`, `pages/stats/stats.js`, `pages/history/history.js`
- Focus on: unnecessary re-renders, heavy onShow logic, expensive repeated calculations, memory leaks from timers/intervals, large array copies

**Subagent 2: Audit utils memory/perf**
- Read: `utils/storageCore/core.js`, `utils/helpers/` (all), `utils/services/` (all), `utils/cache/cacheManager.js`, `utils/state/` (all)
- Focus on: LRU cache sizing, memory cache growth, expensive calculations, unnecessary object creation, repeated work, numerical stability

**Subagent 3: Audit WXML/WXSS rendering perf**
- Read all `.wxml` and `.wxss` files
- Focus on: excessive `wx:for` loops, nested conditional rendering, complex template expressions, `hidden` vs `wx:if` usage, heavy list rendering without virtual lists, oversized CSS selectors

### Step 3: Collect findings

After all subagents complete, collect their reports. Deduplicate findings that appear in multiple subagents.

### Step 4: Produce report

Generate a prioritized report with:
1. **Critical bugs** — data corruption, crashes, security issues
2. **High-priority bugs** — logic errors affecting correctness
3. **Medium-priority** — edge cases, missing error handling
4. **Low-priority** — code quality, style, minor optimizations
5. **Performance issues** — memory leaks, unnecessary work, rendering bottlenecks

For each finding: file path, line number, description, suggested fix.

### Step 5: Fix (optional)

If the user requests fixes, apply them one category at a time (critical first), re-running affected subagents to verify.

## Notes

- This skill was extracted from 4+ identical audit sessions where the same subagent dispatch pattern was used manually each time.
- The file lists are based on the current project structure. Update them if the project adds new pages or components.
- Subagents should be dispatched in parallel for speed. Use the `Agent` tool with independent prompts.
