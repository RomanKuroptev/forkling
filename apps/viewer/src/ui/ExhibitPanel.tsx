import { workFrame } from '@forkling/schema'
import { useEffect, useState } from 'react'
import type { PanelContent } from '../world/panelContent.ts'
import { panelStore, usePanel } from '../world/panelStore.ts'

const FRAME_STYLE = '.exhibit-frame iframe { width: 100%; height: min(60vh, 520px); border: 0; background: #fff; border-radius: 6px; }'

const link = (url: string | null, text: string) =>
  url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  )

function Body({ content }: { content: PanelContent }) {
  const [work, setWork] = useState<{ title: string; url: string } | null>(null)
  switch (content.kind) {
    case 'souvenir':
      return (
        <>
          {content.image?.url && <img src={content.image.url} alt={content.why} referrerPolicy="no-referrer" style={{ maxWidth: '100%', maxHeight: '45vh', borderRadius: 6 }} />}
          {content.image && (
            <p>
              {content.image.credit} · {content.image.licence}
            </p>
          )}
          {content.text && <blockquote style={{ margin: '8px 0' }}>{content.text}</blockquote>}
          {content.evidence && (
            <p>
              <em>From the page: &ldquo;{content.evidence}&rdquo;</em>
            </p>
          )}
          <p>Why I kept it: {content.why}</p>
          <p>Source: {link(content.source.url, content.source.title || 'the page')}</p>
        </>
      )
    case 'work':
      return (
        <>
          <p>{content.about}</p>
          {content.frameHtml ? <div className="exhibit-frame" dangerouslySetInnerHTML={{ __html: content.frameHtml }} /> : <p>This world has no site to show the work from.</p>}
        </>
      )
    case 'plaque':
      return <p style={{ whiteSpace: 'pre-wrap' }}>{content.text}</p>
    case 'trail':
      return <p>{content.url ? link(content.url, 'Open this trail on the site') : 'This trail is on the site.'}</p>
    case 'gallery':
      if (work) {
        return (
          <>
            <p>
              <button onClick={() => setWork(null)}>&larr; all works</button> {work.title}
            </p>
            <div className="exhibit-frame" dangerouslySetInnerHTML={{ __html: workFrame(work.url, work.title) }} />
          </>
        )
      }
      return content.works.length === 0 ? (
        <p>No work is on the shelf yet.</p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {content.works.map((w) => (
            <li key={w.id} style={{ margin: '6px 0' }}>
              {w.url ? <button onClick={() => setWork({ title: w.title, url: w.url! })}>{w.title}</button> : w.title} <small>({w.kind})</small> {w.about}
            </li>
          ))}
        </ul>
      )
    case 'sign':
      return (
        <>
          <p>{content.purpose}</p>
          <p>
            Founded {content.founded}. {content.tags.length > 0 && `About ${content.tags.join(', ')}.`}
          </p>
          {content.related.length > 0 && <p>Related: {content.related.join(', ')}</p>}
          <ul style={{ paddingLeft: 18 }}>
            {content.history.map((h, i) => (
              <li key={i}>
                {h.at.slice(0, 10)} · {h.verb}: {h.summary}
              </li>
            ))}
          </ul>
          {content.pageUrl && <p>{link(content.pageUrl, 'Its page on the site')}</p>}
        </>
      )
    case 'plot':
      return (
        <>
          <p>{content.status}</p>
          <p>{content.purpose}</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{content.body}</p>
          <p>
            Asked on {content.written}. {content.tags.length > 0 && `About ${content.tags.join(', ')}.`} {content.souvenirs > 0 && `${content.souvenirs} souvenir${content.souvenirs === 1 ? '' : 's'} behind it.`}
          </p>
        </>
      )
    case 'note':
      return <p>{content.text}</p>
  }
}

/** What a click on an exhibit or a sign opens (spec 4.6). Escape or the button closes it. Everything shown is text, or a sandboxed frame. */
export function ExhibitPanel() {
  const state = usePanel()
  useEffect(() => {
    if (state.status === 'closed') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && panelStore.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.status])
  if (state.status === 'closed') return null
  return (
    <div className="hud" role="dialog" aria-label="Details" style={{ top: 16, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', width: 'min(640px, 94vw)', maxHeight: '84vh', overflow: 'auto', pointerEvents: 'auto' }}>
      <style>{FRAME_STYLE}</style>
      <button onClick={() => panelStore.close()} style={{ float: 'right' }} aria-label="Close">
        ×
      </button>
      <h3 style={{ margin: '0 0 8px' }}>{state.status === 'loading' ? state.heading : state.content.heading}</h3>
      {state.status === 'loading' ? <p>Opening…</p> : <Body content={state.content} />}
    </div>
  )
}
