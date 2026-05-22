import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { useEffect, useState } from 'react'

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

export default function RichEditor({ content, editable, onChange }) {
  const [, setTick] = useState(0)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: false }),
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    onTransaction: () => setTick(t => t + 1),
    onSelectionUpdate: () => setTick(t => t + 1),
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  const currentColor = editor?.getAttributes('textStyle')?.color ?? null

  const cmd = (fn) => (e) => { e.preventDefault(); fn() }

  return (
    <div className="rich-editor-wrapper">
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
    </div>
  )
}
