/* The notes editor: formats as you type. "- " starts a bullet, Enter continues it, Tab indents, Ctrl+B / I / K work. Saved as Markdown. */
import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'

const tidy = (md: string) => md.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')

export default function NotesEditor({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const sent = useRef(value) // what this editor last reported, to tell its own changes from outside ones
  const [linking, setLinking] = useState(false)
  const [url, setUrl] = useState('')
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        underline: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: 'ne-doc md', 'aria-label': 'Notes' },
      handleKeyDown: (_view, e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault()
          setTimeout(openLink, 40) // lets a selection made a moment ago reach the editor first
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const md = tidy(editor.getMarkdown())
      sent.current = md
      onChange(md)
    },
  })
  // text added from outside (e.g. "Bring in today's logs") shows up in the editor
  useEffect(() => {
    if (!editor || value === sent.current) return
    sent.current = value
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
  }, [value, editor])

  const openLink = () => {
    if (!editor) return
    setUrl((editor.getAttributes('link').href as string) ?? '')
    setLinking(true)
  }
  const applyLink = () => {
    if (!editor) return
    const href = url.trim() && !/^(https?:\/\/|mailto:)/i.test(url.trim()) ? `https://${url.trim()}` : url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!href) chain.unsetLink().run()
    else if (editor.state.selection.empty && !editor.isActive('link')) chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
    else chain.setLink({ href }).run()
    setLinking(false)
  }
  if (!editor) return <div className="notes-ed loading" />

  const c = () => editor.chain().focus()
  const tools: { label: React.ReactNode; title: string; on: boolean; run: () => void }[] = [
    { label: <b>B</b>, title: 'Bold (Ctrl+B)', on: editor.isActive('bold'), run: () => c().toggleBold().run() },
    { label: <i>I</i>, title: 'Italic (Ctrl+I)', on: editor.isActive('italic'), run: () => c().toggleItalic().run() },
    { label: <s>S</s>, title: 'Strikethrough (Ctrl+Shift+S)', on: editor.isActive('strike'), run: () => c().toggleStrike().run() },
    { label: 'H', title: 'Heading (type # and a space)', on: editor.isActive('heading'), run: () => c().toggleHeading({ level: 2 }).run() },
    { label: '•', title: 'Bullet list (type - and a space)', on: editor.isActive('bulletList'), run: () => c().toggleBulletList().run() },
    { label: '1.', title: 'Numbered list (type 1. and a space)', on: editor.isActive('orderedList'), run: () => c().toggleOrderedList().run() },
    { label: '☐', title: 'Checklist (type [ ] and a space)', on: editor.isActive('taskList'), run: () => c().toggleTaskList().run() },
    { label: 'Link', title: 'Link (Ctrl+K)', on: editor.isActive('link'), run: openLink },
  ]
  return (
    <div
      className="notes-ed"
      onKeyDown={(e) => {
        // Tab indents a list item; anywhere else it must not jump out of the editor
        if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target as HTMLElement).closest('.ne-doc')) e.preventDefault()
      }}
    >
      <div className="ne-bar">
        {linking ? (
          <>
            <input
              autoFocus
              className="ne-url"
              placeholder="Paste or type a link, then Enter"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyLink()
                if (e.key === 'Escape') (setLinking(false), editor.commands.focus())
              }}
            />
            <button type="button" className="ne-mode on" onClick={applyLink}>
              {url.trim() ? 'Apply' : editor.isActive('link') ? 'Remove' : 'Cancel'}
            </button>
          </>
        ) : (
          tools.map((t) => (
            <button key={t.title} type="button" className={t.on ? 'on' : ''} title={t.title} aria-label={t.title} aria-pressed={t.on} onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
              {t.label}
            </button>
          ))
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
