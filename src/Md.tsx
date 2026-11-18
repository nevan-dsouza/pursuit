/* Notes are stored as light Markdown. Md shows them read-only; NotesEditor.tsx is where they are written. */
import type { ReactNode } from 'react'

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
  lines.forEach((raw, i) => {
    let line = raw
    const h = /^(#{1,3})\s+(.+)$/.exec(line)
    const it = ITEM.exec(line)
    const quote = /^>\s?(.*)$/.exec(line)
    line = line.replace(/(\\| {2,})$/, '')
    if (!line.trim() || line.trim() === '&nbsp;') return flush(i)
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
