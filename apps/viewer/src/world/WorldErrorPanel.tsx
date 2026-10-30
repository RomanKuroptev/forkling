import type { WorldError } from './loadWorld.ts'
import type { WorldRef } from './route.ts'

const fileUrl = (ref: WorldRef, file: string) => `https://github.com/${ref.owner}/${ref.repo}/blob/${ref.ref ?? 'HEAD'}/${file}`

/** What went wrong loading a world, in words, instead of a blank screen. */
export function WorldErrorPanel({ error, worldRef }: { error: WorldError; worldRef?: WorldRef }) {
  return (
    <div className="world-error">
      <div className="world-error-card">
        <h1>{error.title}</h1>
        <p>{error.message}</p>
        {error.problems.map((problem) => (
          <div className="problem" key={problem.file}>
            <div className="problem-file">
              {worldRef ? (
                <a href={fileUrl(worldRef, problem.file)} target="_blank" rel="noreferrer">
                  {problem.file}
                </a>
              ) : (
                problem.file
              )}
            </div>
            <ul>
              {problem.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
        <div className="world-error-actions">
          <button onClick={() => location.reload()}>Try again</button>
          {worldRef && (
            <a href={`https://github.com/${worldRef.owner}/${worldRef.repo}`} target="_blank" rel="noreferrer">
              Open the repo
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
