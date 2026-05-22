import { useState, useEffect, useRef } from 'react'
import RichEditor from './RichEditor.jsx'
import './App.css'

function formatDate(isoString) {
  const d = new Date(isoString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${m}/${day} ${h}:${min}`
}

function sortByPin(arr) {
  return [...arr].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0)
    return 0
  })
}

function sortEntries(arr, order) {
  const secondary = (a, b) => {
    if (order === 'updated') {
      const ta = a.updatedAt || new Date(a.createdAt || 0).getTime()
      const tb = b.updatedAt || new Date(b.createdAt || 0).getTime()
      return tb - ta
    }
    if (order === 'created') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    if (order === 'title') return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
    return 0
  }
  return [...arr].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0)
    return secondary(a, b)
  })
}

const SORT_OPTIONS = [
  { key: 'updated', label: '最新修改' },
  { key: 'created', label: '最早创建' },
  { key: 'title',   label: '标题 A→Z' },
]

function htmlToMarkdown(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  function walk(node) {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1) return ''
    const tag = node.tagName.toLowerCase()
    const kids = [...node.childNodes].map(walk).join('')
    switch (tag) {
      case 'h1': return `# ${kids.trim()}\n\n`
      case 'h2': return `## ${kids.trim()}\n\n`
      case 'p': {
        const parent = node.parentElement?.tagName.toLowerCase()
        return parent === 'li' ? kids : `${kids}\n\n`
      }
      case 'strong': case 'b': return `**${kids}**`
      case 'em': case 'i': return `*${kids}*`
      case 'ul': return `${kids}\n`
      case 'ol': return `${kids}\n`
      case 'li': {
        const isOrdered = node.parentElement?.tagName.toLowerCase() === 'ol'
        if (isOrdered) {
          const idx = [...(node.parentElement?.children || [])].indexOf(node) + 1
          return `${idx}. ${kids.trim()}\n`
        }
        return `- ${kids.trim()}\n`
      }
      case 'hr': return `---\n\n`
      case 'br': return '\n'
      default: return kids
    }
  }
  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}

function resolveInternalLinks(html, flatEntries) {
  if (!html || !html.includes('data-internal-link')) return html
  return html.replace(
    /<span([^>]*?)data-entry-id="([^"]*)"([^>]*)>\[\[.*?\]\]<\/span>/g,
    (match, pre, id, post) => {
      const entry = flatEntries.find(e => e.id === id)
      return entry ? `<span${pre}data-entry-id="${id}"${post}>[[${entry.title}]]</span>` : match
    }
  )
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function getSearchPreview(entry, query) {
  const text = stripHtml(entry.content || '')
  if (!text) return null
  const q = query.toLowerCase()
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) {
    return text.length > 40 ? text.slice(0, 40) + '…' : text
  }
  const start = Math.max(0, idx - 20)
  const end = Math.min(text.length, idx + q.length + 20)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function highlightMatch(preview, query) {
  if (!preview) return null
  const q = query.toLowerCase()
  const idx = preview.toLowerCase().indexOf(q)
  if (idx === -1) return <span className="search-preview">{preview}</span>
  return (
    <span className="search-preview">
      {preview.slice(0, idx)}
      <strong className="search-highlight">{preview.slice(idx, idx + query.length)}</strong>
      {preview.slice(idx + query.length)}
    </span>
  )
}

export default function App() {
  const [data, setData] = useState({ categories: [], entries: [] })
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [selectedEntryId, setSelectedEntryId] = useState(null)
  const [expandedEntryIds, setExpandedEntryIds] = useState(new Set())

  const [searchQuery, setSearchQuery] = useState('')

  const [renamingCatId, setRenamingCatId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)

  const [isAddingCat, setIsAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const catInputRef = useRef(null)

  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagInput, setTagInput] = useState('')

  const [isAddingEntry, setIsAddingEntry] = useState(false)
  const [newEntryTitle, setNewEntryTitle] = useState('')
  const entryInputRef = useRef(null)

  const [renamingEntryId, setRenamingEntryId] = useState(null)
  const [renameEntryValue, setRenameEntryValue] = useState('')
  const renameEntryInputRef = useRef(null)
  const [entryContextMenu, setEntryContextMenu] = useState(null)

  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [viewMode, setViewMode] = useState('preview')
  const [isDirty, setIsDirty] = useState(false)
  const titleInputRef = useRef(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [showRecent, setShowRecent] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [expandedTagName, setExpandedTagName] = useState(null)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')
  const [sortOrder, setSortOrder] = useState(() => localStorage.getItem('sortOrder') || 'updated')
  const [showSortMenu, setShowSortMenu] = useState(false)

  const dataRef = useRef(data)
  dataRef.current = data
  const sortKeyRef = useRef('')
  const sortedIdsRef = useRef([])
  const autoSaveTimerRef = useRef(null)
  const searchInputRef = useRef(null)
  const savedMsgTimerRef = useRef(null)
  const [pendingContent, setPendingContent] = useState(null) // null = 无待保存内容
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saved'
  const [exportStatus, setExportStatus] = useState(null) // null | 'done'
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportTimerRef = useRef(null)

  useEffect(() => {
    window.electronAPI.getData().then((d) => {
      setData(d)
      if (d.categories.length > 0) setSelectedCatId(d.categories[0].id)
    })
  }, [])

  useEffect(() => { if (isAddingCat) catInputRef.current?.focus() }, [isAddingCat])
  useEffect(() => {
    if (renamingCatId) { renameInputRef.current?.focus(); renameInputRef.current?.select() }
  }, [renamingCatId])
  useEffect(() => { if (isAddingEntry) entryInputRef.current?.focus() }, [isAddingEntry])
  useEffect(() => {
    if (renamingEntryId) { renameEntryInputRef.current?.focus(); renameEntryInputRef.current?.select() }
  }, [renamingEntryId])
  useEffect(() => {
    if (isEditingTitle) { titleInputRef.current?.focus(); titleInputRef.current?.select() }
  }, [isEditingTitle])

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode)
    localStorage.setItem('darkMode', String(darkMode))
  }, [darkMode])

  // 全局快捷键（用 ref 包裹 handler，只注册一次监听器）
  const shortcutHandlerRef = useRef(null)
  shortcutHandlerRef.current = (e) => {
    if (!e.metaKey) return
    const tag = document.activeElement?.tagName
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
    const inRichEditor = document.activeElement?.classList.contains('ProseMirror')

    if (e.key === 's' || e.key === 'S') {
      if (selectedEntryId && viewMode === 'edit') {
        e.preventDefault()
        handleSave()
      }
      return
    }
    if (e.key === 'n' || e.key === 'N') {
      if (!inInput && !inRichEditor && selectedCatId) {
        e.preventDefault()
        if (!selectedEntryId) {
          // 没有选中条目：新建一级条目
          setIsAddingEntry(true)
        } else {
          const info = findEntryById(selectedEntryId)
          const parentId = info?.parent ? info.parent.id : selectedEntryId
          // 选中一级条目：新建子条目；选中二级条目：在同一父条目下新建
          handleAddChild(parentId)
        }
      }
      return
    }
    if (e.key === 'f' || e.key === 'F') {
      if (!inInput && !inRichEditor) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
  }
  useEffect(() => {
    const handler = (e) => shortcutHandlerRef.current(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // 防抖自动保存：pendingContent 变化时重置 1.5s 计时器
  useEffect(() => {
    if (pendingContent === null || !selectedEntryId) return
    const id = selectedEntryId
    const content = pendingContent
    const title = editTitle
    const timer = setTimeout(() => {
      performSave(id, title, content, dataRef.current)
      setIsDirty(false)
      setPendingContent(null)
      setSaveStatus('saved')
      clearTimeout(savedMsgTimerRef.current)
      savedMsgTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
    }, 1500)
    autoSaveTimerRef.current = timer
    return () => {
      clearTimeout(timer)
      autoSaveTimerRef.current = null
    }
  }, [pendingContent, selectedEntryId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // 切换条目时：先清空待保存内容（自动取消计时器），再加载新条目
    setPendingContent(null)
    setIsEditingTitle(false)
    setTitleDraft('')
    if (!selectedEntryId) {
      setEditTitle(''); setEditContent(''); setViewMode('preview'); setIsDirty(false)
      return
    }
    // 搜索一级和子条目
    let found = null
    for (const e of data.entries) {
      if (e.id === selectedEntryId) { found = e; break }
      const child = (e.children || []).find((c) => c.id === selectedEntryId)
      if (child) { found = child; break }
    }
    if (found) {
      setEditTitle(found.title)
      const flatEntries = dataRef.current.entries.flatMap(e => [e, ...(e.children || [])])
      setEditContent(resolveInternalLinks(found.content || '', flatEntries))
      setViewMode('preview')
      setIsDirty(false)
    }
  }, [selectedEntryId])

  function saveData(next) {
    setData(next)
    window.electronAPI.saveData(next)
  }

  function performSave(entryId, title, content, currentData) {
    const now = Date.now()
    const nextEntries = currentData.entries.map((e) => {
      if (e.id === entryId) return { ...e, title: title || e.title, content, updatedAt: now }
      const children = e.children || []
      if (children.some((c) => c.id === entryId)) {
        return { ...e, children: children.map((c) => c.id === entryId ? { ...c, title: title || c.title, content, updatedAt: now } : c) }
      }
      return e
    })
    const next = { ...currentData, entries: nextEntries }
    setData(next)
    window.electronAPI.saveData(next)
    return next
  }

  function flushSave() {
    if (!isDirty || !selectedEntryId) return dataRef.current
    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = null
    const content = pendingContent !== null ? pendingContent : editContent
    const next = performSave(selectedEntryId, editTitle, content, dataRef.current)
    setIsDirty(false)
    setPendingContent(null)
    return next
  }

  // ── 通用条目帮助函数 ──
  function findEntryById(id) {
    for (const e of data.entries) {
      if (e.id === id) return { entry: e, parent: null }
      for (const c of (e.children || [])) {
        if (c.id === id) return { entry: c, parent: e }
      }
    }
    return null
  }

  // 从指定数据里找条目（event handler 里用，避免闭包陈旧问题）
  function findEntryInData(id, d) {
    if (!id || !d) return null
    for (const e of d.entries) {
      if (e.id === id) return e
      const child = (e.children || []).find((c) => c.id === id)
      if (child) return child
    }
    return null
  }

  // 切换到指定条目，保证 editContent 和 selectedEntryId 同批次更新
  function applyEntrySwitch(id, content, title) {
    setEditContent(content)
    setEditTitle(title)
    setPendingContent(null)
    setIsDirty(false)
    setViewMode('preview')
    setSelectedEntryId(id)
    setIsAddingTag(false)
    setTagInput('')
  }

  function updateEntry(id, updater) {
    const nextEntries = data.entries.map((e) => {
      if (e.id === id) return updater(e)
      const children = e.children || []
      if (children.some((c) => c.id === id)) {
        return { ...e, children: children.map((c) => c.id === id ? updater(c) : c) }
      }
      return e
    })
    saveData({ ...data, entries: nextEntries })
  }

  function removeEntry(id) {
    const isTopLevel = data.entries.some((e) => e.id === id)
    if (isTopLevel) {
      saveData({ ...data, entries: data.entries.filter((e) => e.id !== id) })
    } else {
      saveData({
        ...data,
        entries: data.entries.map((e) => ({
          ...e,
          children: (e.children || []).filter((c) => c.id !== id),
        })),
      })
    }
  }

  // ── 展开/折叠 ──
  function toggleExpand(entryId) {
    setExpandedEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  function expandEntry(entryId) {
    setExpandedEntryIds((prev) => {
      if (prev.has(entryId)) return prev
      const next = new Set(prev)
      next.add(entryId)
      return next
    })
  }

  // ── 分类重命名 ──
  function startRename(catId) {
    const cat = data.categories.find((c) => c.id === catId)
    if (!cat) return
    setRenamingCatId(catId)
    setRenameValue(cat.name)
  }

  function commitRename() {
    const name = renameValue.trim()
    if (name && renamingCatId) {
      const nextCats = data.categories.map((c) => c.id === renamingCatId ? { ...c, name } : c)
      saveData({ ...data, categories: nextCats })
    }
    setRenamingCatId(null)
    setRenameValue('')
  }

  function cancelRename() { setRenamingCatId(null); setRenameValue('') }

  function openContextMenu(e, catId) {
    e.preventDefault(); e.stopPropagation()
    setContextMenu({ catId, x: e.clientX, y: e.clientY })
  }

  function closeContextMenu() { setContextMenu(null) }

  // ── 分类操作 ──
  function handleSelectCategory(id) {
    flushSave()
    setSearchQuery('')
    setShowRecent(false)
    setShowTags(false)
    setExpandedTagName(null)
    setSelectedCatId(id)
    if (id !== selectedCatId) setSelectedEntryId(null)
  }

  function handleAddCategory() {
    const name = newCatName.trim()
    if (!name) { setIsAddingCat(false); setNewCatName(''); return }
    const newCat = { id: Date.now().toString(), name }
    saveData({ ...data, categories: [...data.categories, newCat] })
    setIsAddingCat(false)
    setNewCatName('')
  }

  function handleDeleteCategory(id) {
    if (data.categories.length <= 1) return
    const cat = data.categories.find((c) => c.id === id)
    if (!window.confirm(`确定要删除「${cat?.name}」及其所有条目吗？此操作不可撤销。`)) return
    const nextCats = data.categories.filter((c) => c.id !== id)
    const nextEntries = data.entries.filter((e) => e.categoryId !== id)
    saveData({ categories: nextCats, entries: nextEntries })
    if (selectedCatId === id) {
      clearTimeout(autoSaveTimerRef.current)
      setSelectedCatId(nextCats[0].id)
      setSelectedEntryId(null)
      setIsDirty(false)
    }
  }

  // ── 条目操作 ──
  function handleSelectEntry(id) {
    if (id === selectedEntryId) return
    const baseData = flushSave()
    const found = findEntryInData(id, baseData)
    applyEntrySwitch(id, found?.content || '', found?.title || '')
  }

  function handleAddEntry() {
    const title = newEntryTitle.trim()
    if (!title) { setIsAddingEntry(false); setNewEntryTitle(''); return }
    const baseData = flushSave()
    const newEntry = {
      id: Date.now().toString(),
      categoryId: selectedCatId,
      title,
      content: '',
      createdAt: new Date().toISOString(),
      pinned: false,
      pinnedAt: null,
      tags: [],
      children: [],
    }
    saveData({ ...baseData, entries: [...baseData.entries, newEntry] })
    applyEntrySwitch(newEntry.id, '', newEntry.title)
    setIsAddingEntry(false)
    setNewEntryTitle('')
  }

  function handleDeleteEntry(id) {
    const found = findEntryById(id)
    const hasChildren = !found?.parent && (found?.entry?.children?.length > 0)
    const msg = hasChildren
      ? `确定要删除「${found.entry.title}」及其所有子条目吗？此操作不可撤销。`
      : `确定要删除「${found?.entry?.title}」吗？此操作不可撤销。`
    if (!window.confirm(msg)) return

    // 若删除的是一级条目，其子条目中有选中的也要清除
    const childIds = found?.entry?.children?.map((c) => c.id) || []
    if (selectedEntryId === id || childIds.includes(selectedEntryId)) {
      clearTimeout(autoSaveTimerRef.current)
      setSelectedEntryId(null)
      setIsDirty(false)
    }
    removeEntry(id)
  }

  function handleAddChild(parentId) {
    const baseData = flushSave()
    const child = {
      id: Date.now().toString(),
      title: '新子条目',
      content: '',
      createdAt: new Date().toISOString(),
      pinned: false,
      pinnedAt: null,
      tags: [],
    }
    const nextEntries = baseData.entries.map((e) =>
      e.id === parentId ? { ...e, children: [...(e.children || []), child] } : e
    )
    saveData({ ...baseData, entries: nextEntries })
    expandEntry(parentId)
    applyEntrySwitch(child.id, '', child.title)
    setRenamingEntryId(child.id)
    setRenameEntryValue(child.title)
  }

  // ── 搜索 ──
  function handleSelectSearchResult({ entry, parent, categoryId }) {
    flushSave()
    setSelectedCatId(categoryId)
    if (parent) expandEntry(parent.id)
    applyEntrySwitch(entry.id, entry.content || '', entry.title || '')
    setSearchQuery('')
  }

  // ── 条目重命名 ──
  function startRenameEntry(id) {
    const found = findEntryById(id)
    if (!found) return
    setRenamingEntryId(id)
    setRenameEntryValue(found.entry.title)
  }

  function commitRenameEntry() {
    const title = renameEntryValue.trim()
    if (title && renamingEntryId) {
      updateEntry(renamingEntryId, (e) => ({ ...e, title }))
      if (renamingEntryId === selectedEntryId) setEditTitle(title)
    }
    setRenamingEntryId(null)
    setRenameEntryValue('')
  }

  function cancelRenameEntry() { setRenamingEntryId(null); setRenameEntryValue('') }

  function openEntryContextMenu(e, id) {
    e.preventDefault(); e.stopPropagation()
    setEntryContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  // ── 详情标题独立编辑 ──
  function startTitleEdit() { setTitleDraft(editTitle); setIsEditingTitle(true) }

  function commitTitleEdit() {
    const title = titleDraft.trim()
    if (title && selectedEntryId) {
      updateEntry(selectedEntryId, (e) => ({ ...e, title }))
      setEditTitle(title)
    }
    setIsEditingTitle(false)
    setTitleDraft('')
  }

  function cancelTitleEdit() { setIsEditingTitle(false); setTitleDraft('') }

  function handleTogglePin(id) {
    updateEntry(id, (e) => ({
      ...e,
      pinned: !e.pinned,
      pinnedAt: !e.pinned ? Date.now() : null,
    }))
  }

  // ── 详情保存 ──
  function handleSave() {
    if (!selectedEntryId) return
    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = null
    const content = pendingContent !== null ? pendingContent : editContent
    performSave(selectedEntryId, editTitle, content, dataRef.current)
    setIsDirty(false)
    setPendingContent(null)
    setSaveStatus('saved')
    clearTimeout(savedMsgTimerRef.current)
    savedMsgTimerRef.current = setTimeout(() => setSaveStatus(null), 2000)
  }

  async function handleExport() {
    if (!selectedEntry) return
    const content = pendingContent !== null ? pendingContent : editContent
    const md = `# ${editTitle}\n\n${htmlToMarkdown(content)}`
    const result = await window.electronAPI.exportMarkdown(editTitle, md)
    if (result?.success) {
      setExportStatus('done')
      clearTimeout(exportTimerRef.current)
      exportTimerRef.current = setTimeout(() => setExportStatus(null), 2000)
    }
  }

  async function handleExportPDF() {
    if (!selectedEntry) return
    const result = await window.electronAPI.exportPDF(editTitle)
    if (result?.success) {
      setExportStatus('done')
      clearTimeout(exportTimerRef.current)
      exportTimerRef.current = setTimeout(() => setExportStatus(null), 2000)
    }
  }

  // ── Derived ──
  const { categories, entries: allEntries } = data
  const selectedCategory = categories.find((c) => c.id === selectedCatId)

  // 稳定排序：只有 ID 集合、置顶状态、分类、排序方式变化时才重新排序
  // 保存操作更新 updatedAt，不应触发列表重新排序（避免视觉跳动）
  const filteredEntries = allEntries.filter((e) => e.categoryId === selectedCatId)
  const shapeKey = filteredEntries.map((e) => `${e.id}:${e.pinned ? 1 : 0}:${e.pinnedAt || 0}`).join(',')
  const currentSortKey = `${selectedCatId}|${sortOrder}|${shapeKey}`
  if (sortKeyRef.current !== currentSortKey) {
    sortKeyRef.current = currentSortKey
    sortedIdsRef.current = sortEntries(filteredEntries, sortOrder).map((e) => e.id)
  }
  const categoryEntries = sortedIdsRef.current
    .map((id) => filteredEntries.find((e) => e.id === id))
    .filter(Boolean)

  const selectedEntryInfo = selectedEntryId ? findEntryById(selectedEntryId) : null
  const selectedEntry = selectedEntryInfo?.entry || null
  const selectedParentEntry = selectedEntryInfo?.parent || null

  // 搜索：扁平化包含子条目
  const allSearchable = []
  for (const e of allEntries) {
    allSearchable.push({ entry: e, parent: null, categoryId: e.categoryId })
    for (const c of (e.children || [])) {
      allSearchable.push({ entry: c, parent: e, categoryId: e.categoryId })
    }
  }

  // 最近编辑：按 updatedAt（没有则用 createdAt）倒序，最多 20 条
  const recentEntries = [...allSearchable]
    .sort((a, b) => {
      const ta = a.entry.updatedAt || new Date(a.entry.createdAt || 0).getTime()
      const tb = b.entry.updatedAt || new Date(b.entry.createdAt || 0).getTime()
      return tb - ta
    })
    .slice(0, 20)

  function handleSelectRecentEntry({ entry, parent, categoryId }) {
    flushSave()
    setSelectedCatId(categoryId)
    if (parent) expandEntry(parent.id)
    applyEntrySwitch(entry.id, entry.content || '', entry.title || '')
    setShowRecent(false)
  }

  function handleNavigateToEntry(id) {
    const result = allSearchable.find(({ entry }) => entry.id === id)
    if (!result) return
    flushSave()
    setSelectedCatId(result.categoryId)
    setShowRecent(false)
    setShowTags(false)
    if (result.parent) expandEntry(result.parent.id)
    applyEntrySwitch(result.entry.id, result.entry.content || '', result.entry.title || '')
  }

  function handleSelectTagEntry({ entry, parent, categoryId }) {
    flushSave()
    setSelectedCatId(categoryId)
    if (parent) expandEntry(parent.id)
    applyEntrySwitch(entry.id, entry.content || '', entry.title || '')
    setShowTags(false)
    setExpandedTagName(null)
  }

  // 标签映射：tag → [{entry, parent, categoryId}]
  const tagMap = new Map()
  for (const item of allSearchable) {
    for (const tag of (item.entry.tags || [])) {
      if (!tagMap.has(tag)) tagMap.set(tag, [])
      tagMap.get(tag).push(item)
    }
  }
  const allTagNames = [...tagMap.keys()].sort()

  const isSearching = searchQuery.trim().length > 0

  // 所有条目的标签汇总去重，用于输入建议
  const allTags = [...new Set(allSearchable.flatMap(({ entry }) => entry.tags || []))]
  const filteredSuggestions = tagInput.trim()
    ? allTags.filter((t) =>
        t.toLowerCase().includes(tagInput.toLowerCase()) &&
        !(selectedEntry?.tags || []).includes(t)
      )
    : []

  function handleAddTag(tag) {
    const trimmed = tag.trim()
    if (!trimmed || !selectedEntryId) return
    if ((selectedEntry?.tags || []).includes(trimmed)) {
      setTagInput(''); setIsAddingTag(false); return
    }
    updateEntry(selectedEntryId, (e) => ({ ...e, tags: [...(e.tags || []), trimmed] }))
    setTagInput(''); setIsAddingTag(false)
  }

  function handleRemoveTag(tag) {
    if (!selectedEntryId) return
    updateEntry(selectedEntryId, (e) => ({ ...e, tags: (e.tags || []).filter((t) => t !== tag) }))
  }
  const searchResults = isSearching
    ? allSearchable.filter(({ entry }) => {
        const q = searchQuery.toLowerCase()
        return entry.title.toLowerCase().includes(q) || stripHtml(entry.content || '').toLowerCase().includes(q)
      })
    : []

  // 右键菜单对应条目是否为一级
  const ctxIsTopLevel = entryContextMenu
    ? !findEntryById(entryContextMenu.id)?.parent
    : false

  // ── 条目行通用渲染 ──
  function renderEntryRow(entry, isChild = false) {
    const isRenaming = renamingEntryId === entry.id
    const isSelected = selectedEntryId === entry.id
    return (
      <div
        key={entry.id}
        className={`entry-item ${isChild ? 'entry-child' : ''} ${isSelected ? 'active' : ''}`}
        onClick={() => !isRenaming && handleSelectEntry(entry.id)}
        onDoubleClick={() => startRenameEntry(entry.id)}
        onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
      >
        {isRenaming ? (
          <input
            ref={renameEntryInputRef}
            className="rename-input"
            value={renameEntryValue}
            onChange={(e) => setRenameEntryValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRenameEntry()
              if (e.key === 'Escape') cancelRenameEntry()
            }}
            onBlur={commitRenameEntry}
            onClick={(e) => e.stopPropagation()}
            maxLength={100}
          />
        ) : (
          <>
            <div className="entry-info">
              <span className="entry-title">{entry.title}</span>
              <span className="entry-time">{formatDate(entry.createdAt)}</span>
            </div>
            <button
              className={`pin-btn ${entry.pinned ? 'is-pinned' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleTogglePin(entry.id) }}
              title={entry.pinned ? '取消置顶' : '置顶'}
            >{entry.pinned ? '★' : '☆'}</button>
            <button
              className="entry-delete-btn"
              onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id) }}
              title="删除条目"
            >×</button>
          </>
        )}
      </div>
    )
  }

  function renderEntryMeta(entry, timeContent) {
    const tags = entry.tags || []
    if (tags.length === 0) return <span className="entry-time">{timeContent}</span>
    const visibleTags = tags.slice(0, 3)
    const extra = tags.length - 3
    return (
      <>
        <div className="entry-tags">
          {visibleTags.map((t) => <span key={t} className="entry-tag-pill">{t}</span>)}
          {extra > 0 && <span className="entry-tag-pill entry-tag-more">+{extra}</span>}
        </div>
        <span className="entry-time">{timeContent}</span>
      </>
    )
  }

  return (
    <div className="app">
      {/* 左侧分类导航 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-icon">📚</span>
          <span className="sidebar-title">Kn0wledge</span>
        </div>

        <div className="search-box">
          <input
            ref={searchInputRef}
            className="search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索条目..."
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>

        <nav className="category-list">
          <div
            className={`category-item ${showRecent && !showTags ? 'active' : ''}`}
            onClick={() => { flushSave(); setSearchQuery(''); setShowRecent(true); setShowTags(false); setExpandedTagName(null) }}
          >
            <span className="category-name">🕐 最近编辑</span>
          </div>
          <div
            className={`category-item ${showTags ? 'active' : ''}`}
            onClick={() => { flushSave(); setSearchQuery(''); setShowTags(true); setShowRecent(false) }}
          >
            <span className="category-name">🏷 标签</span>
          </div>
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`category-item ${!showRecent && !showTags && selectedCatId === cat.id ? 'active' : ''}`}
              onClick={() => renamingCatId !== cat.id && handleSelectCategory(cat.id)}
              onDoubleClick={() => startRename(cat.id)}
              onContextMenu={(e) => openContextMenu(e, cat.id)}
            >
              {renamingCatId === cat.id ? (
                <input
                  ref={renameInputRef}
                  className="rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  maxLength={20}
                />
              ) : (
                <>
                  <span className="category-name">{cat.name}</span>
                  {categories.length > 1 && (
                    <button
                      className="delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat.id) }}
                      title="删除分类"
                    >×</button>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          {isAddingCat ? (
            <div className="add-input-row">
              <input
                ref={catInputRef}
                className="add-input"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory()
                  if (e.key === 'Escape') { setIsAddingCat(false); setNewCatName('') }
                }}
                onBlur={handleAddCategory}
                placeholder="分类名称"
                maxLength={20}
              />
            </div>
          ) : (
            <div className="sidebar-footer-row">
              <button className="add-btn" onClick={() => setIsAddingCat(true)}>
                <span>+</span> 新增分类
              </button>
              <button
                className="dark-toggle-btn"
                onClick={() => setDarkMode((d) => !d)}
                title={darkMode ? '切换到浅色模式' : '切换到深色模式'}
              >{darkMode ? '☀️' : '🌙'}</button>
            </div>
          )}
        </div>
      </aside>

      {/* 中间条目列表 */}
      <div className="panel-entries">
        <div className="panel-entries-header">
          <span className="panel-entries-title">
            {isSearching
              ? `搜索结果 ${searchResults.length > 0 ? `(${searchResults.length})` : ''}`
              : showRecent
              ? '最近编辑'
              : showTags
              ? '标签'
              : selectedCategory?.name || ''}
          </span>
          {!isSearching && !showRecent && !showTags && (
            <div className="panel-header-actions">
              {!isAddingEntry && (
                <button className="add-entry-icon-btn" onClick={() => setIsAddingEntry(true)} title="新增条目">+</button>
              )}
              <div className="sort-menu-wrap">
                <button
                  className="sort-btn"
                  onClick={() => setShowSortMenu((v) => !v)}
                  title="排序方式"
                >↕</button>
                {showSortMenu && (
                  <>
                    <div className="ctx-overlay" onClick={() => setShowSortMenu(false)} />
                    <div className="sort-dropdown">
                      {SORT_OPTIONS.map(({ key, label }) => (
                        <button
                          key={key}
                          className="ctx-item"
                          onClick={() => {
                            setSortOrder(key)
                            localStorage.setItem('sortOrder', key)
                            setShowSortMenu(false)
                          }}
                        >
                          <span className="sort-check">{sortOrder === key ? '✓' : ''}</span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="entry-list">
          {isSearching ? (
            searchResults.length === 0 ? (
              <div className="entry-empty">无匹配结果</div>
            ) : (
              searchResults.map((result) => {
                const { entry, parent, categoryId } = result
                const cat = categories.find((c) => c.id === categoryId)
                const isRenaming = renamingEntryId === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`entry-item ${selectedEntryId === entry.id ? 'active' : ''}`}
                    onClick={() => !isRenaming && handleSelectSearchResult(result)}
                    onDoubleClick={() => startRenameEntry(entry.id)}
                    onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameEntryInputRef}
                        className="rename-input"
                        value={renameEntryValue}
                        onChange={(e) => setRenameEntryValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRenameEntry()
                          if (e.key === 'Escape') cancelRenameEntry()
                        }}
                        onBlur={commitRenameEntry}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={100}
                      />
                    ) : (
                      <>
                        <div className="entry-info">
                          <span className="entry-title">{entry.title}</span>
                          {highlightMatch(getSearchPreview(entry, searchQuery), searchQuery)}
                          {renderEntryMeta(entry, parent ? `${cat?.name || ''} / ${parent.title}` : cat?.name || '')}
                        </div>
                        <button
                          className={`pin-btn ${entry.pinned ? 'is-pinned' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(entry.id) }}
                          title={entry.pinned ? '取消置顶' : '置顶'}
                        >{entry.pinned ? '★' : '☆'}</button>
                      </>
                    )}
                  </div>
                )
              })
            )
          ) : showRecent ? (
            recentEntries.length === 0 ? (
              <div className="entry-empty">暂无编辑记录</div>
            ) : (
              recentEntries.map((result) => {
                const { entry, parent, categoryId } = result
                const cat = categories.find((c) => c.id === categoryId)
                const isRenaming = renamingEntryId === entry.id
                return (
                  <div
                    key={entry.id}
                    className={`entry-item ${selectedEntryId === entry.id ? 'active' : ''}`}
                    onClick={() => !isRenaming && handleSelectRecentEntry(result)}
                    onDoubleClick={() => startRenameEntry(entry.id)}
                    onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameEntryInputRef}
                        className="rename-input"
                        value={renameEntryValue}
                        onChange={(e) => setRenameEntryValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRenameEntry()
                          if (e.key === 'Escape') cancelRenameEntry()
                        }}
                        onBlur={commitRenameEntry}
                        onClick={(e) => e.stopPropagation()}
                        maxLength={100}
                      />
                    ) : (
                      <>
                        <div className="entry-info">
                          <span className="entry-title">{entry.title}</span>
                          {renderEntryMeta(entry, parent ? `${cat?.name || ''} / ${parent.title}` : cat?.name || '')}
                        </div>
                        <button
                          className={`pin-btn ${entry.pinned ? 'is-pinned' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(entry.id) }}
                          title={entry.pinned ? '取消置顶' : '置顶'}
                        >{entry.pinned ? '★' : '☆'}</button>
                      </>
                    )}
                  </div>
                )
              })
            )
          ) : showTags ? (
            allTagNames.length === 0 ? (
              <div className="entry-empty">暂无标签</div>
            ) : (
              allTagNames.map((tag) => {
                const tagEntries = tagMap.get(tag) || []
                const isExpanded = expandedTagName === tag
                return (
                  <div key={tag}>
                    <div
                      className="tag-section-header"
                      onClick={() => setExpandedTagName(isExpanded ? null : tag)}
                    >
                      <span className="tag-section-arrow">{isExpanded ? '▾' : '▸'}</span>
                      <span className="tag-section-name">{tag}</span>
                      <span className="tag-section-count">{tagEntries.length}</span>
                    </div>
                    {isExpanded && tagEntries.map((result) => {
                      const { entry, parent, categoryId } = result
                      const cat = categories.find((c) => c.id === categoryId)
                      return (
                        <div
                          key={entry.id}
                          className={`entry-item entry-child ${selectedEntryId === entry.id ? 'active' : ''}`}
                          onClick={() => handleSelectTagEntry(result)}
                          onDoubleClick={() => startRenameEntry(entry.id)}
                          onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                        >
                          <div className="entry-info">
                            <span className="entry-title">{entry.title}</span>
                            {renderEntryMeta(entry, parent ? `${cat?.name || ''} / ${parent.title}` : cat?.name || '')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )
          ) : (
            <>
              {isAddingEntry && (
                <div className="entry-input-row">
                  <input
                    ref={entryInputRef}
                    className="entry-input"
                    value={newEntryTitle}
                    onChange={(e) => setNewEntryTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddEntry()
                      if (e.key === 'Escape') { setIsAddingEntry(false); setNewEntryTitle('') }
                    }}
                    onBlur={handleAddEntry}
                    placeholder="条目标题"
                    maxLength={100}
                  />
                </div>
              )}
              {categoryEntries.length === 0 && !isAddingEntry ? (
                <div className="entry-empty">暂无条目</div>
              ) : (
                categoryEntries.map((entry) => {
                  const children = sortEntries(entry.children || [], sortOrder)
                  const isExpanded = expandedEntryIds.has(entry.id)
                  const hasChildren = children.length > 0
                  const isRenaming = renamingEntryId === entry.id
                  const isSelected = selectedEntryId === entry.id
                  return (
                    <div key={entry.id}>
                      {/* 一级条目行 */}
                      <div
                        className={`entry-item ${isSelected ? 'active' : ''}`}
                        onClick={() => !isRenaming && handleSelectEntry(entry.id)}
                        onDoubleClick={() => startRenameEntry(entry.id)}
                        onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                      >
                        <button
                          className={`expand-btn ${!hasChildren ? 'expand-btn-empty' : ''}`}
                          onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(entry.id) }}
                          tabIndex={-1}
                        >
                          {hasChildren ? (isExpanded ? '▾' : '▸') : ''}
                        </button>
                        {isRenaming ? (
                          <input
                            ref={renameEntryInputRef}
                            className="rename-input"
                            value={renameEntryValue}
                            onChange={(e) => setRenameEntryValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRenameEntry()
                              if (e.key === 'Escape') cancelRenameEntry()
                            }}
                            onBlur={commitRenameEntry}
                            onClick={(e) => e.stopPropagation()}
                            maxLength={100}
                          />
                        ) : (
                          <>
                            <div className="entry-info">
                              <span className="entry-title">{entry.title}</span>
                              {renderEntryMeta(entry, formatDate(entry.createdAt))}
                            </div>
                            <button
                              className={`pin-btn ${entry.pinned ? 'is-pinned' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleTogglePin(entry.id) }}
                              title={entry.pinned ? '取消置顶' : '置顶'}
                            >{entry.pinned ? '★' : '☆'}</button>
                            <button
                              className="entry-delete-btn"
                              onClick={(e) => { e.stopPropagation(); handleDeleteEntry(entry.id) }}
                              title="删除条目"
                            >×</button>
                          </>
                        )}
                      </div>

                      {/* 子条目列表 */}
                      {isExpanded && children.map((child) => {
                        const isChildRenaming = renamingEntryId === child.id
                        const isChildSelected = selectedEntryId === child.id
                        return (
                          <div
                            key={child.id}
                            className={`entry-item entry-child ${isChildSelected ? 'active' : ''}`}
                            onClick={() => !isChildRenaming && handleSelectEntry(child.id)}
                            onDoubleClick={() => startRenameEntry(child.id)}
                            onContextMenu={(e) => openEntryContextMenu(e, child.id)}
                          >
                            {isChildRenaming ? (
                              <input
                                ref={renameEntryInputRef}
                                className="rename-input"
                                value={renameEntryValue}
                                onChange={(e) => setRenameEntryValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRenameEntry()
                                  if (e.key === 'Escape') cancelRenameEntry()
                                }}
                                onBlur={commitRenameEntry}
                                onClick={(e) => e.stopPropagation()}
                                maxLength={100}
                              />
                            ) : (
                              <>
                                <div className="entry-info">
                                  <span className="entry-title">{child.title}</span>
                                  {renderEntryMeta(child, formatDate(child.createdAt))}
                                </div>
                                <button
                                  className={`pin-btn ${child.pinned ? 'is-pinned' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); handleTogglePin(child.id) }}
                                  title={child.pinned ? '取消置顶' : '置顶'}
                                >{child.pinned ? '★' : '☆'}</button>
                                <button
                                  className="entry-delete-btn"
                                  onClick={(e) => { e.stopPropagation(); handleDeleteEntry(child.id) }}
                                  title="删除条目"
                                >×</button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </>
          )}
        </div>
      </div>

      {/* 右侧详情面板 */}
      <div className="panel-detail">
        {selectedEntry ? (
          <>
            <div className="detail-header">
              <div className="breadcrumb">
                <span className="bc-seg">{selectedCategory?.name}</span>
                {selectedParentEntry && (
                  <>
                    <span className="bc-sep">›</span>
                    <span className="bc-seg">{selectedParentEntry.title}</span>
                  </>
                )}
                <span className="bc-sep">›</span>
                <span className="bc-seg bc-current">{editTitle}</span>
              </div>

              <div className="detail-title-row">
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    className="detail-title-input"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTitleEdit()
                      if (e.key === 'Escape') cancelTitleEdit()
                    }}
                    onBlur={commitTitleEdit}
                    placeholder="条目标题"
                  />
                ) : (
                  <h1 className="detail-title" onClick={startTitleEdit} title="点击编辑标题">
                    {editTitle}
                  </h1>
                )}
                <div className="detail-actions">
                  {isDirty && (
                    <button className="save-btn" onClick={handleSave}>保存</button>
                  )}
                  {!isDirty && saveStatus === 'saved' && (
                    <span className="save-status">已保存</span>
                  )}
                  {exportStatus === 'done' && (
                    <span className="save-status">已导出</span>
                  )}
                  <div className="export-menu-wrap">
                    <button className="export-btn" onClick={() => setShowExportMenu(v => !v)}>导出</button>
                    {showExportMenu && (
                      <>
                        <div className="ctx-overlay" onClick={() => setShowExportMenu(false)} />
                        <div className="export-dropdown">
                          <button className="ctx-item" onClick={() => { setShowExportMenu(false); handleExport() }}>导出为 Markdown</button>
                          <button className="ctx-item" onClick={() => { setShowExportMenu(false); handleExportPDF() }}>导出为 PDF</button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="mode-toggle">
                    <button
                      className={`mode-btn ${viewMode === 'edit' ? 'active' : ''}`}
                      onClick={() => setViewMode('edit')}
                    >编辑</button>
                    <button
                      className={`mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
                      onClick={() => setViewMode('preview')}
                    >预览</button>
                  </div>
                </div>
              </div>

              {/* 标签行 */}
              <div className="tag-row">
                {(selectedEntry?.tags || []).map((tag) => (
                  <span key={tag} className="tag-pill">
                    {tag}
                    <button className="tag-remove" onClick={() => handleRemoveTag(tag)} title="移除标签">×</button>
                  </span>
                ))}
                {isAddingTag ? (
                  <div className="tag-input-wrap">
                    <input
                      autoFocus
                      className="tag-input"
                      value={tagInput}
                      placeholder="标签名…"
                      maxLength={20}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTag(tagInput)
                        if (e.key === 'Escape') { setIsAddingTag(false); setTagInput('') }
                      }}
                      onBlur={() => setTimeout(() => { setIsAddingTag(false); setTagInput('') }, 150)}
                    />
                    {filteredSuggestions.length > 0 && (
                      <div className="tag-suggestions">
                        {filteredSuggestions.map((t) => (
                          <button key={t} className="tag-suggestion-item" onMouseDown={() => handleAddTag(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="tag-add-btn" onClick={() => setIsAddingTag(true)}>+ 添加标签</button>
                )}
              </div>
            </div>

            <div className={`detail-body ${viewMode === 'edit' ? 'edit-mode' : ''}`}>
              <RichEditor
                key={selectedEntryId}
                content={editContent}
                editable={viewMode === 'edit'}
                onChange={(html) => {
                  setEditContent(html)
                  setPendingContent(html)
                  setIsDirty(true)
                  setSaveStatus(null)
                }}
                getEntries={() => {
                  const flat = []
                  const cats = dataRef.current.categories
                  for (const e of dataRef.current.entries) {
                    const catName = cats.find(c => c.id === e.categoryId)?.name || ''
                    if (e.id !== selectedEntryId) flat.push({
                      id: e.id, title: e.title,
                      path: catName,
                      updatedAt: e.updatedAt || 0,
                    })
                    for (const c of (e.children || [])) {
                      if (c.id !== selectedEntryId) flat.push({
                        id: c.id, title: c.title,
                        path: catName ? `${catName} / ${e.title}` : e.title,
                        updatedAt: c.updatedAt || 0,
                      })
                    }
                  }
                  return flat
                }}
                onNavigate={handleNavigateToEntry}
              />
            </div>
          </>
        ) : (
          <div className="detail-placeholder">
            <p>选择一个条目查看详情</p>
          </div>
        )}
      </div>

      {/* 条目右键菜单 */}
      {entryContextMenu && (
        <>
          <div className="ctx-overlay" onClick={() => setEntryContextMenu(null)} />
          <div className="ctx-menu" style={{ top: entryContextMenu.y, left: entryContextMenu.x }}>
            <button
              className="ctx-item"
              onClick={() => { setEntryContextMenu(null); startRenameEntry(entryContextMenu.id) }}
            >重命名</button>
            <button
              className="ctx-item"
              onClick={() => { setEntryContextMenu(null); handleTogglePin(entryContextMenu.id) }}
            >{findEntryById(entryContextMenu.id)?.entry?.pinned ? '取消置顶' : '置顶'}</button>
            {ctxIsTopLevel && (
              <button
                className="ctx-item"
                onClick={() => { setEntryContextMenu(null); handleAddChild(entryContextMenu.id) }}
              >新增子条目</button>
            )}
            <button
              className="ctx-item ctx-item-danger"
              onClick={() => { setEntryContextMenu(null); handleDeleteEntry(entryContextMenu.id) }}
            >删除</button>
          </div>
        </>
      )}

      {/* 分类右键菜单 */}
      {contextMenu && (
        <>
          <div className="ctx-overlay" onClick={closeContextMenu} />
          <div className="ctx-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <button
              className="ctx-item"
              onClick={() => { closeContextMenu(); startRename(contextMenu.catId) }}
            >重命名</button>
            {categories.length > 1 && (
              <button
                className="ctx-item ctx-item-danger"
                onClick={() => { closeContextMenu(); handleDeleteCategory(contextMenu.catId) }}
              >删除</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
