import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
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

function ResizableImageComponent({ node, updateAttributes, selected, editor }) {
  const [dragWidth, setDragWidth] = useState(null)
  const dragWidthRef = useRef(null)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const innerRef = useRef(null)

  const editable = editor.isEditable
  const { src, alt, title, width } = node.attrs
  const displayWidth = dragWidth ?? width

  function onHandleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    startWidth.current = innerRef.current?.getBoundingClientRect().width || 300

    function onMouseMove(ev) {
      const delta = ev.clientX - startX.current
      const raw = Math.max(50, startWidth.current + delta)
      const maxW = innerRef.current?.closest('.ProseMirror')?.getBoundingClientRect().width || Infinity
      const w = `${Math.round(Math.min(raw, maxW))}px`
      dragWidthRef.current = w
      setDragWidth(w)
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (dragWidthRef.current) {
        updateAttributes({ width: dragWidthRef.current })
        dragWidthRef.current = null
        setDragWidth(null)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <NodeViewWrapper style={{ display: 'block', margin: '4px 0' }}>
      <div
        ref={innerRef}
        data-img-inner="true"
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
          lineHeight: 0,
          borderRadius: '4px',
          ...(displayWidth ? { width: displayWidth } : {}),
          ...(editable && selected ? { outline: '2px solid #0b6e99', outlineOffset: '2px' } : {}),
        }}
      >
        <img
          src={src}
          alt={alt || ''}
          title={title || undefined}
          draggable={false}
          style={{
            display: 'block',
            height: 'auto',
            borderRadius: '4px',
            margin: 0,
            ...(displayWidth ? { width: '100%' } : { maxWidth: '100%' }),
          }}
        />
        {editable && selected && (
          <>
            <div className="img-handle img-handle-tl" />
            <div className="img-handle img-handle-tr" />
            <div className="img-handle img-handle-bl" />
            <div className="img-handle img-handle-br" onMouseDown={onHandleMouseDown} />
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}

// 内链节点：atom 行内节点，存储 id + label
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.style.width || null,
        renderHTML: (attrs) => attrs.width ? { style: `width: ${attrs.width}; height: auto;` } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent)
  },
})

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

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsDataURL(file)
  })
}

export default function RichEditor({ content, editable, onChange, getEntries, onNavigate }) {
  const [, setTick] = useState(0)
  const [linkActive, setLinkActive] = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkIdx, setLinkIdx] = useState(0)
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 })
  const wrapperRef = useRef(null)
  const popupRef = useRef(null)
  const editorRef = useRef(null)
  const editableRef = useRef(editable)

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
      ResizableImage.configure({ inline: false }),
    ],
    content: content || '',
    editable,
    editorProps: {
      handleDrop(view, event, _slice, moved) {
        if (moved || !editableRef.current) return false
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        const imageFile = Array.from(files).find(f => f.type.startsWith('image/'))
        if (!imageFile) return false
        event.preventDefault()
        fileToBase64(imageFile).then(src => {
          editorRef.current?.chain().focus().setImage({ src }).run()
        })
        return true
      },
      handlePaste(view, event) {
        if (!editableRef.current) return false
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              fileToBase64(file).then(src => {
                editorRef.current?.chain().focus().setImage({ src }).run()
              })
              return true
            }
          }
        }
        return false
      },
    },
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

  useEffect(() => { editorRef.current = editor }, [editor])
  useEffect(() => { editableRef.current = editable }, [editable])

  const currentColor = editor?.getAttributes('textStyle')?.color ?? null
  const stats = editor ? countWords(editor.getText()) : { chars: 0, words: 0 }
  const cmd = (fn) => (e) => { e.preventDefault(); fn() }

  function getImgPopupPos() {
    if (!editable || !editor?.isActive('image')) return null
    const sel = wrapperRef.current?.querySelector('.ProseMirror-selectednode')
    if (!sel) return null
    const inner = sel.querySelector('[data-img-inner]') || sel.querySelector('img') || sel
    const rect = inner.getBoundingClientRect()
    const wRect = wrapperRef.current?.getBoundingClientRect()
    if (!wRect) return null
    return { top: rect.bottom - wRect.top + 6, left: rect.left - wRect.left }
  }

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

          <div className="tb-sep" />

          {/* 图片 */}
          <button
            className="tb-btn"
            onMouseDown={cmd(async () => {
              const result = await window.electronAPI.pickImage()
              if (result?.success) editor.chain().focus().setImage({ src: result.src }).run()
            })}
            title="插入图片"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="2.5" width="11" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="4.5" cy="5.5" r="1" fill="currentColor"/>
              <path d="M1.5 9.5l2.5-2.5 2 2 2.5-3L11.5 12" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
          </button>
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

      {(() => {
        const imgPos = getImgPopupPos()
        if (!imgPos) return null
        const currentWidth = editor.getAttributes('image').width
        return (
          <div className="img-resize-popup" style={{ top: imgPos.top, left: imgPos.left }}>
            {[['25%', '小'], ['50%', '中'], ['100%', '大'], [null, '原始']].map(([w, label]) => (
              <button
                key={label}
                className={`img-resize-btn ${currentWidth === w ? 'img-resize-active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  editor.chain().focus().updateAttributes('image', { width: w }).run()
                }}
              >{label}</button>
            ))}
          </div>
        )
      })()}

      {editor && (
        <div className="word-count-bar">
          {stats.chars} 字 · {stats.words} 词
        </div>
      )}
    </div>
  )
}
