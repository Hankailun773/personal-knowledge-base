import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { Node } from '@tiptap/core'
import { useEffect, useState, useRef } from 'react'

function countWords(text) {
  const zhRe = /[一-龥]/g
  const chineseChars = (text.match(zhRe) || []).length
  const withoutChinese = text.replace(/[一-龥]/g, ' ')
  const englishWords = (withoutChinese.match(/[a-zA-Z0-9]+/g) || []).length
  return { chars: chineseChars, words: englishWords }
}

const TEXT_COLORS = [
  { label: '默认',  value: null },
  { label: '红色',  value: '#e03e3e' },
  { label: '橙色',  value: '#d9730d' },
  { label: '黄色',  value: '#ca8a04' },
  { label: '绿色',  value: '#0f7b6c' },
  { label: '蓝色',  value: '#0b6e99' },
  { label: '紫色',  value: '#6940a5' },
  { label: '灰色',  value: '#787774' },
]

// 内链节点：atom 行内节点，存储 id + label
const InternalLink = Node.create({
  name: 'internalLink',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-entry-id'),
        renderHTML: (attrs) => ({ 'data-entry-id': attrs.id }),
      },
      label: {
        default: '',
        parseHTML: (el) => {
          const t = el.textContent || ''
          return t.startsWith('[[') && t.endsWith(']]') ? t.slice(2, -2) : t
        },
        renderHTML: () => ({}),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-internal-link]' }]
  },
  renderHTML({ node }) {
    return ['span', {
      'data-internal-link': 'true',
      'data-entry-id': node.attrs.id,
      class: 'internal-link',
    }, `[[${node.attrs.label}]]`]
  },
})

export default function RichEditor({ content, editable, onChange, getEntries, onNavigate }) {
  const [, setTick] = useState(0)
  const [linkActive, setLinkActive] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkIdx, setLinkIdx] = useState(0)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef(null)
  const popupRef = useRef(null)

  const filteredEntries = linkActive
    ? (getEntries?.() || [])
        .filter(e => !linkQuery || e.title.toLowerCase().includes(linkQuery.toLowerCase()))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    : []

  useEffect(() => {
    if (linkActive && popupRef.current) popupRef.current.scrollTop = 0
  }, [linkActive])

  const safeIdx = filteredEntries.length > 0 ? Math.min(linkIdx, filteredEntries.length - 1) : 0

  function checkLinkTrigger(editor) {
    if (!editor.isEditable) { setLinkActive(false); return }
    const { state } = editor
    const { $from } = state.selection
    if ($from.parent.type.name === 'internalLink') { setLinkActive(false); return }
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
    const match = textBefore.match(/\[\[([^\[\]]*)$/)
    if (match) {
      setLinkQuery(match[1])
      setLinkActive(true)
      setLinkIdx(0)
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        const wRect = wrapperRef.current?.getBoundingClientRect()
        if (wRect) {
          setPopupPos({
            top: rect.bottom - wRect.top + 4,
            left: Math.max(0, rect.left - wRect.left),
          })
        }
      }
    } else {
      setLinkActive(false)
      setLinkQuery('')
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
      InternalLink,
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
      checkLinkTrigger(editor)
    },
    onTransaction: () => setTick(t => t + 1),
    onSelectionUpdate: ({ editor }) => {
      setTick(t => t + 1)
      checkLinkTrigger(editor)
    },
  })

  function insertLink(entry) {
    if (!editor) return
    const { state } = editor
    const { $from } = state.selection
    const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
    const match = textBefore.match(/\[\[([^\[\]]*)$/)
    if (!match) return
    const from = $from.pos - match[0].length
    const to = $from.pos
    editor.chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, { type: 'internalLink', attrs: { id: entry.id, label: entry.title } })
      .run()
    setLinkActive(false)
    setLinkQuery('')
  }

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
    if (!editable) { setLinkActive(false); setLinkQuery('') }
  }, [editor, editable])

  const currentColor = editor?.getAttributes('textStyle')?.color ?? null
  const stats = editor ? countWords(editor.getText()) : { chars: 0, words: 0 }
  const cmd = (fn) => (e) => { e.preventDefault(); fn() }

  return (
    <div
      className="rich-editor-wrapper"
      ref={wrapperRef}
      onClick={(e) => {
        if (editable) return
        const link = e.target.closest('[data-internal-link]')
        if (link) {
          const id = link.getAttribute('data-entry-id')
          if (id) onNavigate?.(id)
        }
      }}
      onKeyDown={(e) => {
        if (!linkActive) return
        if (e.key === 'ArrowDown') {
          e.preventDefault(); e.stopPropagation()
          setLinkIdx(i => Math.min(i + 1, filteredEntries.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault(); e.stopPropagation()
          setLinkIdx(i => Math.max(i - 1, 0))
        } else if (e.key === 'Enter') {
          if (filteredEntries[safeIdx]) {
            e.preventDefault(); e.stopPropagation()
            insertLink(filteredEntries[safeIdx])
          }
        } else if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation()
          setLinkActive(false); setLinkQuery('')
        }
      }}
    >
      {editable && editor && (
        <div className="toolbar">
          {/* 标题 */}
          <button
            className={`tb-btn ${editor.isActive('heading', { level: 1 }) ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleHeading({ level: 1 }).run())}
            title="大标题"
          >H1</button>
          <button
            className={`tb-btn ${editor.isActive('heading', { level: 2 }) ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}
            title="小标题"
          >H2</button>

          <div className="tb-sep" />

          {/* 内联格式 */}
          <button
            className={`tb-btn tb-b ${editor.isActive('bold') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleBold().run())}
            title="加粗"
          >B</button>
          <button
            className={`tb-btn tb-i ${editor.isActive('italic') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleItalic().run())}
            title="斜体"
          >I</button>
          <button
            className={`tb-btn tb-u ${editor.isActive('underline') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleUnderline().run())}
            title="下划线"
          >U</button>

          <div className="tb-sep" />

          {/* 字体颜色 */}
          {TEXT_COLORS.map((c) => (
            <button
              key={c.value ?? 'default'}
              className={`tb-color-dot ${currentColor === c.value ? 'tb-color-active' : ''}`}
              style={{ background: c.value ?? '#37352f' }}
              onMouseDown={cmd(() => {
                if (c.value) editor.chain().focus().setColor(c.value).run()
                else editor.chain().focus().unsetColor().run()
              })}
              title={c.label}
            />
          ))}

          <div className="tb-sep" />

          {/* 高亮 */}
          <button
            className={`tb-btn ${editor.isActive('highlight') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleHighlight().run())}
            title="高亮"
          ><span className="tb-hi">A</span></button>

          <div className="tb-sep" />

          {/* 列表 */}
          <button
            className={`tb-btn ${editor.isActive('bulletList') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleBulletList().run())}
            title="无序列表"
          >≡</button>
          <button
            className={`tb-btn ${editor.isActive('orderedList') ? 'tb-active' : ''}`}
            onMouseDown={cmd(() => editor.chain().focus().toggleOrderedList().run())}
            title="有序列表"
          >1.</button>

          <div className="tb-sep" />

          {/* 分割线 */}
          <button
            className="tb-btn"
            onMouseDown={cmd(() => editor.chain().focus().setHorizontalRule().run())}
            title="插入分割线"
          >─</button>
        </div>
      )}

      {!editable && editor?.isEmpty ? (
        <div className="tiptap-placeholder">暂无内容，切换到编辑模式开始写作</div>
      ) : (
        <EditorContent editor={editor} className="tiptap-content" />
      )}

      {linkActive && (
        <div className="link-popup" style={{ top: popupPos.top, left: popupPos.left }} ref={popupRef}>
          {filteredEntries.length === 0 ? (
            <div className="link-popup-empty">无匹配条目</div>
          ) : (
            filteredEntries.map((entry, i) => (
              <button
                key={entry.id}
                className={`link-popup-item ${i === safeIdx ? 'link-popup-item-active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertLink(entry) }}
              >
                <span className="link-popup-title">{entry.title}</span>
                {entry.path && <span className="link-popup-path">{entry.path}</span>}
              </button>
            ))
          )}
        </div>
      )}

      {editor && (
        <div className="word-count-bar">
          {stats.chars} 字 · {stats.words} 词
        </div>
      )}
    </div>
  )
}
