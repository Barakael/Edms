import './PipelineDots.css'

export type PipelineStep = {
  user_id: number
  name: string
  state: 'pending' | 'current' | 'done' | string
}

export function PipelineDots({ steps }: { steps: PipelineStep[] }) {
  if (!steps?.length) {
    return <p className="muted">No routing path yet.</p>
  }

  return (
    <div className="pipeline">
      {steps.map((s, i) => (
        <div key={`${s.user_id}-${i}`} className="pipeline-step">
          <div className="pipeline-row">
            {i > 0 && <div className={`pipeline-line state-${steps[i - 1]?.state}`} />}
            <div className={`pipeline-dot state-${s.state}`} title={s.state}>
              {s.state === 'done' ? '✓' : ''}
            </div>
          </div>
          <div className="pipeline-name">{s.name}</div>
        </div>
      ))}
    </div>
  )
}
