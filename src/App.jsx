import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

export default function App() {
  const [data, setData] = useState({ categories: [], entries: [] })
  const [selectedCatId, setSelectedCatId] = useState(null)
  const [selectedEntryId, setSelectedEntryId] = useState(null)

  const [searchQuery, setSearchQuery] = useState('')

  const [renamingCatId, setRenamingCatId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null) // { catId, x, y }

  const [isAddingCat, setIsAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const catInputRef = useRef(null)

  const [isAddingEntry, setIsAddingEntry] = useState(false)
  const [newEntryTitle, setNewEntryTitle] = useState('')
  const entryInputRef = useRef(null)

  // 条目列表重命名
  const [renamingEntryId, setRenamingEntryId] = useState(null)
  const [renameEntryValue, setRenameEntryValue] = useState('')
  const renameEntryInputRef = useRef(null)
  const [entryContextMenu, setEntryContextMenu] = useState(null) // { id, x, y }

  // 详情编辑状态
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [viewMode, setViewMode] = useState('preview') // 'preview' | 'edit'
  const [isDirty, setIsDirty] = useState(false)
  const titleInputRef = useRef(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  useEffect(() => {
    window.electronAPI.getData().then((d) => {
      setData(d)
      if (d.categories.length > 0) setSelectedCatId(d.categories[0].id)
    })
  }, [])

  useEffect(() => {
    if (isAddingCat) catInputRef.current?.focus()
  }, [isAddingCat])

  useEffect(() => {
    if (renamingCatId) {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }
  }, [renamingCatId])

  useEffect(() => {
    if (isAddingEntry) entryInputRef.current?.focus()
  }, [isAddingEntry])

  useEffect(() => {
    if (renamingEntryId) {
      renameEntryInputRef.current?.focus()
      renameEntryInputRef.current?.select()
    }
  }, [renamingEntryId])

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [isEditingTitle])

  // 切换条目时加载内容
  useEffect(() => {
    setIsEditingTitle(false)
    setTitleDraft('')
    if (!selectedEntryId) {
      setEditTitle('')
      setEditContent('')
      setViewMode('preview')
      setIsDirty(false)
      return
    }
    const entry = data.entries.find((e) => e.id === selectedEntryId)
    if (entry) {
      setEditTitle(entry.title)
      setEditContent(entry.content || '')
      setViewMode('preview')
      setIsDirty(false)
    }
  }, [selectedEntryId])

  function saveData(next) {
    setData(next)
    window.electronAPI.saveData(next)
  }

  function checkUnsaved() {
    if (!isDirty) return true
    return window.confirm('有未保存的修改，确定要离开吗？')
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

  function cancelRename() {
    setRenamingCatId(null)
    setRenameValue('')
  }

  function openContextMenu(e, catId) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ catId, x: e.clientX, y: e.clientY })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  // ── 分类操作 ──
  function handleSelectCategory(id) {
    if (id === selectedCatId) return
    if (!checkUnsaved()) return
    setSelectedCatId(id)
    setSelectedEntryId(null)
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
      setSelectedCatId(nextCats[0].id)
      setSelectedEntryId(null)
      setIsDirty(false)
    }
  }

  // ── 条目操作 ──
  function handleSelectEntry(id) {
    if (id === selectedEntryId) return
    if (!checkUnsaved()) return
    setSelectedEntryId(id)
  }

  function handleAddEntry() {
    const title = newEntryTitle.trim()
    if (!title) { setIsAddingEntry(false); setNewEntryTitle(''); return }
    if (!checkUnsaved()) return
    const newEntry = {
      id: Date.now().toString(),
      categoryId: selectedCatId,
      title,
      content: '',
      createdAt: new Date().toISOString(),
      pinned: false,
      pinnedAt: null,
    }
    saveData({ ...data, entries: [...data.entries, newEntry] })
    setSelectedEntryId(newEntry.id)
    setIsAddingEntry(false)
    setNewEntryTitle('')
  }

  function handleDeleteEntry(id) {
    const entry = data.entries.find((e) => e.id === id)
    if (!window.confirm(`确定要删除「${entry?.title}」吗？此操作不可撤销。`)) return
    const nextEntries = data.entries.filter((e) => e.id !== id)
    saveData({ ...data, entries: nextEntries })
    if (selectedEntryId === id) {
      setSelectedEntryId(null)
      setIsDirty(false)
    }
  }

  // ── 搜索 ──
  function handleSelectSearchResult(entry) {
    if (!checkUnsaved()) return
    setSelectedCatId(entry.categoryId)
    setSelectedEntryId(entry.id)
    setSearchQuery('')
  }

  // ── 条目列表重命名 ──
  function startRenameEntry(entryId) {
    const entry = data.entries.find((e) => e.id === entryId)
    if (!entry) return
    setRenamingEntryId(entryId)
    setRenameEntryValue(entry.title)
  }

  function commitRenameEntry() {
    const title = renameEntryValue.trim()
    if (title && renamingEntryId) {
      const nextEntries = data.entries.map((e) =>
        e.id === renamingEntryId ? { ...e, title } : e
      )
      saveData({ ...data, entries: nextEntries })
      if (renamingEntryId === selectedEntryId) setEditTitle(title)
    }
    setRenamingEntryId(null)
    setRenameEntryValue('')
  }

  function cancelRenameEntry() {
    setRenamingEntryId(null)
    setRenameEntryValue('')
  }

  function openEntryContextMenu(e, entryId) {
    e.preventDefault()
    e.stopPropagation()
    setEntryContextMenu({ id: entryId, x: e.clientX, y: e.clientY })
  }

  // ── 详情标题独立编辑 ──
  function startTitleEdit() {
    setTitleDraft(editTitle)
    setIsEditingTitle(true)
  }

  function commitTitleEdit() {
    const title = titleDraft.trim()
    if (title && selectedEntryId) {
      const nextEntries = data.entries.map((e) =>
        e.id === selectedEntryId ? { ...e, title } : e
      )
      saveData({ ...data, entries: nextEntries })
      setEditTitle(title)
    }
    setIsEditingTitle(false)
    setTitleDraft('')
  }

  function cancelTitleEdit() {
    setIsEditingTitle(false)
    setTitleDraft('')
  }

  function handleTogglePin(entryId) {
    const entry = data.entries.find((e) => e.id === entryId)
    if (!entry) return
    const nextEntries = data.entries.map((e) =>
      e.id === entryId
        ? { ...e, pinned: !e.pinned, pinnedAt: !e.pinned ? Date.now() : null }
        : e
    )
    saveData({ ...data, entries: nextEntries })
  }

  // ── 详情操作 ──
  function handleSave() {
    const nextEntries = data.entries.map((e) =>
      e.id === selectedEntryId ? { ...e, title: editTitle || e.title, content: editContent } : e
    )
    saveData({ ...data, entries: nextEntries })
    setIsDirty(false)
  }

  // ── Derived ──
  const { categories, entries: allEntries } = data
  const selectedCategory = categories.find((c) => c.id === selectedCatId)
  const categoryEntries = allEntries
    .filter((e) => e.categoryId === selectedCatId)
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (a.pinned && b.pinned) return (b.pinnedAt || 0) - (a.pinnedAt || 0)
      return 0
    })
  const selectedEntry = allEntries.find((e) => e.id === selectedEntryId)
  const isSearching = searchQuery.trim().length > 0
  const searchResults = isSearching
    ? allEntries.filter((e) => {
        const q = searchQuery.toLowerCase()
        return e.title.toLowerCase().includes(q) || (e.content || '').toLowerCase().includes(q)
      })
    : []

  return (
    <div className="app">
      {/* 左侧分类导航 */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-icon">📚</span>
          <span className="sidebar-title">知识库</span>
        </div>

        <div className="search-box">
          <input
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
          {categories.map((cat) => (
            <div
              key={cat.id}
              className={`category-item ${selectedCatId === cat.id ? 'active' : ''}`}
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
            <button className="add-btn" onClick={() => setIsAddingCat(true)}>
              <span>+</span> 新增分类
            </button>
          )}
        </div>
      </aside>

      {/* 中间条目列表 */}
      <div className="panel-entries">
        <div className="panel-entries-header">
          <span className="panel-entries-title">
            {isSearching ? `搜索结果 ${searchResults.length > 0 ? `(${searchResults.length})` : ''}` : selectedCategory?.name || ''}
          </span>
          {!isSearching && !isAddingEntry && (
            <button className="add-entry-icon-btn" onClick={() => setIsAddingEntry(true)} title="新增条目">+</button>
          )}
        </div>

        <div className="entry-list">
          {isSearching ? (
            searchResults.length === 0 ? (
              <div className="entry-empty">无匹配结果</div>
            ) : (
              searchResults.map((entry) => {
                const cat = categories.find((c) => c.id === entry.categoryId)
                return (
                  <div
                    key={entry.id}
                    className={`entry-item ${selectedEntryId === entry.id ? 'active' : ''}`}
                    onClick={() => renamingEntryId !== entry.id && handleSelectSearchResult(entry)}
                    onDoubleClick={() => startRenameEntry(entry.id)}
                    onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                  >
                    {renamingEntryId === entry.id ? (
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
                          <span className="entry-time">{cat?.name || ''}</span>
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
                categoryEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`entry-item ${selectedEntryId === entry.id ? 'active' : ''}`}
                    onClick={() => renamingEntryId !== entry.id && handleSelectEntry(entry.id)}
                    onDoubleClick={() => startRenameEntry(entry.id)}
                    onContextMenu={(e) => openEntryContextMenu(e, entry.id)}
                  >
                    {renamingEntryId === entry.id ? (
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
                ))
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

            <div className={`detail-body ${viewMode === 'edit' ? 'edit-mode' : ''}`}>
              {viewMode === 'edit' ? (
                <textarea
                  className="detail-editor"
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setIsDirty(true) }}
                  placeholder="用 Markdown 格式写点什么..."
                />
              ) : (
                <div className="detail-preview">
                  {editContent ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editContent}</ReactMarkdown>
                  ) : (
                    <p className="preview-empty">暂无内容，点击右上角「编辑」开始写作</p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="detail-placeholder">
            <p>选择一个条目查看详情</p>
          </div>
        )}
      </div>
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
            >{allEntries.find((e) => e.id === entryContextMenu.id)?.pinned ? '取消置顶' : '置顶'}</button>
            <button
              className="ctx-item ctx-item-danger"
              onClick={() => { setEntryContextMenu(null); handleDeleteEntry(entryContextMenu.id) }}
            >删除</button>
          </div>
        </>
      )}

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
