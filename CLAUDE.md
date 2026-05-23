# Kn0wledge 项目说明

## 项目简介

本地桌面知识库应用（Mac），Electron + React + Vite，数据完全离线存储为本地 JSON 文件，无服务器、无网络请求。

---

## 技术栈

- **桌面框架**：Electron 33
- **前端**：React 18 + Vite 5
- **富文本编辑器**：Tiptap 3（StarterKit、Underline、Color、TextStyle、Highlight、自定义 InternalLink 节点）
- **样式**：纯 CSS，无 UI 框架
- **IPC**：contextBridge + ipcMain.handle（preload.js 暴露为 `window.electronAPI`）
- **数据持久化**：JSON 文件，路径 `app.getPath('userData')/data.json`

---

## 启动命令

```bash
npm run dev    # 同时启动 Vite dev server + Electron（用 concurrently + wait-on）
npm run build  # 构建前端产物到 dist/
```

---

## 主要文件结构

```
First-cc/
├── electron/
│   ├── main.js       # 主进程：窗口创建、IPC 处理、数据读写、PDF/Markdown 导出
│   └── preload.js    # contextBridge 暴露 window.electronAPI（getData/saveData/exportMarkdown/exportPDF）
├── src/
│   ├── App.jsx       # 根组件，包含全部业务状态与 UI 逻辑（约 1530 行）
│   ├── RichEditor.jsx # Tiptap 编辑器组件，含工具栏、内链弹窗、字数统计
│   ├── App.css       # 全部样式（三栏布局、深色模式、各组件样式）
│   └── index.css     # 全局基础样式
├── vite.config.js
└── package.json
```

---

## 已完成功能列表

1. **三栏布局**：左侧分类导航（200px）+ 中间条目列表（240px）+ 右侧详情面板（flex 占余）
2. **分类管理**：新增、重命名（双击或右键菜单）、删除（至少保留一个）
3. **条目管理**：新增、重命名（双击或右键菜单）、删除（含确认对话框）
4. **二级条目（子条目）**：右键菜单"新增子条目"，支持折叠/展开，面包屑导航显示层级路径
5. **富文本编辑（Tiptap）**：H1/H2、加粗/斜体/下划线、字体颜色（7色）、高亮、无序/有序列表、分割线；编辑/预览双模式切换
6. **自动保存**：停止输入 1.5 秒后自动保存（防抖），Cmd+S 立即保存；保存后显示"已保存"提示 2 秒
7. **历史版本**：每次保存内容有变化时自动记录旧版本（最多 20 条），支持左侧列表预览 + 一键恢复
8. **条目置顶**：星星按钮，置顶后显示金星，置顶条目置于列表顶部，按置顶时间倒序
9. **排序**：最新修改 / 最早创建 / 标题 A→Z，选择持久化到 `localStorage`；排序稳定（保存操作不触发列表重排）
10. **全局搜索**：跨分类搜索标题和正文，命中关键词高亮显示，带内容预览片段；Cmd+F 聚焦搜索框
11. **最近编辑视图**：左侧导航入口，跨分类按修改时间倒序，最多 20 条
12. **标签**：条目可添加多个标签，详情区标签行管理，输入时自动补全已有标签；条目列表显示前三个标签徽章；左侧标签视图按标签名聚合
13. **内链**（`[[` 触发）：编辑中输入 `[[` 弹出条目选择弹窗（↑↓导航、Enter 确认、Esc 关闭），插入后渲染为蓝色可点击链接；预览模式点击跳转目标条目
14. **导出**：Markdown（自定义 HTML→MD 转换）、PDF（Electron `printToPDF`，@media print 隐藏侧栏和工具栏），均弹出系统保存对话框
15. **深色模式**：左下角按钮切换，`body.dark` 选择器覆盖全部组件，状态持久化到 `localStorage`
16. **键盘快捷键**：Cmd+S 保存、Cmd+N 新建条目/子条目、Cmd+F 聚焦搜索
17. **字数统计**：编辑器底部状态栏显示中文字数 + 英文词数

---

## 条目数据结构

数据文件：`{userData}/data.json`

```jsonc
{
  "categories": [
    { "id": "string", "name": "string" }
  ],
  "entries": [
    {
      "id": "string",            // Date.now().toString()
      "categoryId": "string",
      "title": "string",
      "content": "html string",  // Tiptap 输出的 HTML
      "createdAt": "ISO string",
      "updatedAt": 1700000000000, // number（毫秒时间戳），每次保存更新
      "pinned": false,
      "pinnedAt": null,           // number | null，置顶时记录时间戳
      "tags": ["string"],
      "history": [
        { "content": "html string", "savedAt": "ISO string" }
        // 最多 20 条，最新在前
      ],
      "children": [
        // 结构同上，无 categoryId、无 children 字段
      ]
    }
  ]
}
```

内链在 HTML 中的存储格式：
```html
<span data-internal-link="true" data-entry-id="条目id" class="internal-link">[[条目标题]]</span>
```

---

## 关键函数说明（App.jsx）

| 函数 | 说明 |
|------|------|
| `saveData(next)` | 同时执行 `setData` + `window.electronAPI.saveData`，所有数据变更都走这里 |
| `performSave(entryId, title, content, currentData)` | 实际写入条目内容，更新 `updatedAt` 和 `history`，返回新 data |
| `flushSave()` | 切换条目/分类前调用，清除防抖计时器并立即同步保存 |
| `findEntryById(id)` | 在 `data` 中查找条目，返回 `{ entry, parent }` |
| `findEntryInData(id, d)` | 同上但接受显式 data 参数，用于事件回调中避免闭包陈旧 |
| `applyEntrySwitch(id, content, title)` | 切换选中条目，批量重置相关状态 |
| `updateEntry(id, updater)` | 通用条目字段更新，updater 为 `(entry) => newEntry` |
| `removeEntry(id)` | 删除一级或子条目 |
| `handleAddChild(parentId)` | 新建子条目，自动展开父条目并进入重命名状态 |
| `resolveInternalLinks(html, flatEntries)` | 加载条目时用最新标题刷新内链显示文本 |
| `htmlToMarkdown(html)` | 导出时将 Tiptap HTML 转为 Markdown 字符串 |
| `sortEntries(arr, order)` | 置顶条目优先，再按 updated/created/title 排序 |

---

## 开发注意事项

**最小改动**
- 只改本次需求相关的文件，不顺带重构无关代码，不改没有问题的东西
- 不升级依赖版本

**先读文件再动手**
- 修改前必须先读相关文件，理解现有实现方式
- 优先复用现有组件、函数、逻辑，保持现有代码风格（纯 CSS、无 UI 框架）

**状态管理要点**
- 所有业务状态集中在 `App.jsx`，通过 props 传入子组件
- `dataRef.current` 始终指向最新 data，用于定时器/事件回调中避免闭包陈旧
- 切换条目/分类前必须调用 `flushSave()`，防止数据丢失
- 条目列表排序用 `sortKeyRef` + `sortedIdsRef` 稳定化，避免保存后列表跳动

**main.js / preload.js 改动需重启应用**
- 修改 `electron/main.js` 或 `electron/preload.js` 后，必须重启（重新执行 `npm run dev`）才能生效，Vite HMR 不覆盖 Electron 主进程

**新增数据字段**
- 在 `main.js` 的 `normalizeData()` 中同步添加新字段的默认值，保证旧数据文件兼容

**深色模式样式**
- 深色模式通过 `body.dark` 选择器覆盖，统一写在 `App.css` 对应组件样式的末尾
