/* Notes: plain text with light Markdown. Md renders it; NotesEditor is a textarea that helps you write it. */
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)/i.test(u) ? u : /^www\./i.test(u) ? `https://${u}` : null)
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\s]+\))|((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"])/g

function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const k = `${key}${n++}`
    const tok = m[0]
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>)
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>)
    else if (m[4]) out.push(<s key={k}>{inline(tok.slice(2, -2), k)}</s>)
    else {
      const link = m[5] ? /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok) : null
      const url = safeUrl(link ? link[2] : tok)
      const label = link ? link[1] : tok
      out.push(
        url ? (
          <a key={k} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            {label}
          </a>
        ) : (
          label
        ),
      )
    }
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/

/** Renders notes. With onChange, checkboxes can be ticked right in the rendered view. */
export function Md({ text, onChange, className = '' }: { text: string; onChange?: (next: string) => void; className?: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const out: ReactNode[] = []
  let para: string[] = []
  const flush = (k: number) => {
    if (!para.length) return
    out.push(
      <p key={`p${k}`}>
        {para.flatMap((l, i) => [...(i ? [<br key={`b${i}`} />] : []), ...inline(l, `p${k}-${i}-`)])}
      </p>,
    )
    para = []
  }
  lines.forEach((line, i) => {
    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    const it = ITEM.exec(line)
    const quote = /^>\s?(.*)$/.exec(line)
    if (!line.trim()) return flush(i)
    if (!h && !it && !quote && !/^(-{3,}|\*{3,})$/.test(line.trim())) return void para.push(line)
    flush(i)
    if (h) out.push(<div key={i} className={`md-h md-h${h[1].length}`}>{inline(h[2], `h${i}-`)}</div>)
    else if (quote) out.push(<div key={i} className="md-quote">{inline(quote[1], `q${i}-`)}</div>)
    else if (it) {
      const [, indent, marker, box, body] = it
      const checked = box === 'x' || box === 'X'
      const toggle = () => {
        if (!onChange) return
        const next = [...lines]
        next[i] = line.replace(/\[([ xX])\]/, checked ? '[ ]' : '[x]')
        onChange(next.join('\n'))
      }
      out.push(
        <div key={i} className={`md-li ${box !== undefined && checked ? 'checked' : ''}`} style={{ paddingLeft: Math.min(4, Math.floor(indent.replace(/\t/g, '  ').length / 2)) * 18 }}>
          {box !== undefined ? (
            <button type="button" className={`md-box ${checked ? 'on' : ''}`} onClick={toggle} disabled={!onChange} aria-label={checked ? 'Mark as not done' : 'Mark as done'}>
              {checked ? '✓' : ''}
            </button>
          ) : (
            <span className="md-mark">{/\d/.test(marker) ? marker.replace(')', '.') : '•'}</span>
          )}
          <span>{inline(body, `l${i}-`)}</span>
        </div>,
      )
    } else out.push(<hr key={i} className="md-hr" />)
  })
  flush(lines.length)
  return <div className={`md ${className}`}>{out}</div>
}

type Sel = [number, number]

/** A textarea with a small toolbar, shortcuts, lists that continue by themselves, and a preview. */
export function NotesEditor({ value, onChange, placeholder, rows = 10, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pending = useRef<Sel | null>(null)
  const [preview, setPreview] = useState(false)
  useLayoutEffect(() => {
    if (pending.current && ref.current) {
      ref.current.focus()
      ref.current.setSelectionRange(...pending.current)
      pending.current = null
    }
  })
  const apply = (next: string, sel: Sel) => {
    pending.current = sel
    onChange(next)
  }
  const cur = (): Sel => [ref.current?.selectionStart ?? value.length, ref.current?.selectionEnd ?? value.length]

  const wrap = (mark: string, fallback: string) => {
    const [a, b] = cur()
    const picked = value.slice(a, b)
    if (picked && value.slice(a - mark.length, a) === mark && value.slice(b, b + mark.length) === mark) return apply(value.slice(0, a - mark.length) + picked + value.slice(b + mark.length), [a - mark.length, b - mark.length])
    const body = picked || fallback
    apply(value.slice(0, a) + mark + body + mark + value.slice(b), [a + mark.length, a + mark.length + body.length])
  }
  /** put a marker in front of every selected line; if all already have it, take it off */
  const prefix = (make: (i: number) => string, has: RegExp) => {
    const [a, b] = cur()
    const from = value.lastIndexOf('\n', a - 1) + 1
    const to = value.indexOf('\n', b) === -1 ? value.length : value.indexOf('\n', b)
    const block = value.slice(from, to).split('\n')
    const all = block.every((l) => has.test(l))
    const strip = /^(\s*)(?:#{1,3}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/
    const next = block.map((l, i) => (all ? l.replace(has, '$1') : l.replace(strip, '$1').replace(/^(\s*)/, `$1${make(i)}`))).join('\n')
    apply(value.slice(0, from) + next + value.slice(to), block.length > 1 ? [from, from + next.length] : [from + next.length, from + next.length])
  }
  const link = (url?: string) => {
    const [a, b] = cur()
    const picked = value.slice(a, b)
    if (/^(https?:\/\/|www\.)\S+$/.test(picked) && !url) return apply(value.slice(0, a) + `[link](${picked})` + value.slice(b), [a + 1, a + 5])
    const label = picked || 'link'
    const target = url ?? 'https://'
    const text = `[${label}](${target})`
    const at = a + label.length + 3
    apply(value.slice(0, a) + text + value.slice(b), url ? [a + text.length, a + text.length] : [at, at + target.length])
  }
  const tools: { label: ReactNode; title: string; run: () => void }[] = [
    { label: <b>B</b>, title: 'Bold (Ctrl+B)', run: () => wrap('**', 'bold') },
    { label: <i>I</i>, title: 'Italic (Ctrl+I)', run: () => wrap('*', 'italic') },
    { label: 'H', title: 'Heading', run: () => prefix(() => '## ', /^(\s*)#{1,3}\s+/) },
    { label: '•', title: 'Bullet list', run: () => prefix(() => '- ', /^(\s*)[-*+]\s+(?!\[[ xX]\])/) },
    { label: '1.', title: 'Numbered list', run: () => prefix((i) => `${i + 1}. `, /^(\s*)\d+[.)]\s+/) },
    { label: '☐', title: 'Checklist', run: () => prefix(() => '- [ ] ', /^(\s*)[-*+]\s+\[[ xX]\]\s+/) },
    { label: 'Link', title: 'Link (Ctrl+K)', run: () => link() },
  ]

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && (k === 'b' || k === 'i' || k === 'k')) {
      e.preventDefault()
      return k === 'b' ? wrap('**', 'bold') : k === 'i' ? wrap('*', 'italic') : link()
    }
    const [a, b] = cur()
    const from = value.lastIndexOf('\n', a - 1) + 1
    const line = value.slice(from, a)
    const m = /^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/.exec(line)
    if (e.key === 'Enter' && !e.shiftKey && !mod && a === b && m) {
      e.preventDefault()
      if (line.length === m[0].length) return apply(value.slice(0, from) + value.slice(a), [from, from]) // an empty item ends the list
      const marker = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2]
      const ins = `\n${m[1]}${marker} ${m[5] ? '[ ] ' : ''}`
      return apply(value.slice(0, a) + ins + value.slice(b), [a + ins.length, a + ins.length])
    }
    if (e.key === 'Tab' && !mod && m) {
      e.preventDefault()
      if (e.shiftKey) {
        const cut = Math.min(2, m[1].length)
        return apply(value.slice(0, from) + value.slice(from + cut), [Math.max(from, a - cut), Math.max(from, b - cut)])
      }
      return apply(value.slice(0, from) + '  ' + value.slice(from), [a + 2, b + 2])
    }
  }

  return (
    <div className="notes-ed">
      <div className="ne-bar">
        {!preview &&
          tools.map((t) => (
            <button key={t.title} type="button" title={t.title} aria-label={t.title} onMouseDown={(e) => e.preventDefault()} onClick={t.run}>
              {t.label}
            </button>
          ))}
        <div className="spacer" />
        <button type="button" className={`ne-mode ${preview ? 'on' : ''}`} onClick={() => setPreview(!preview)} disabled={!value.trim() && !preview}>
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <Md text={value} onChange={onChange} className="ne-view" />
      ) : (
        <textarea
          ref={ref}
          autoFocus={autoFocus}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onPaste={(e) => {
            const url = e.clipboardData.getData('text').trim()
            const [a, b] = cur()
            if (a !== b && /^https?:\/\/\S+$/.test(url) && !/^https?:\/\//.test(value.slice(a, b))) {
              e.preventDefault()
              link(url)
            }
          }}
        />
      )}
    </div>
  )
}
