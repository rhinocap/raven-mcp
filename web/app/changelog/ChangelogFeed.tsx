'use client'

import { useMemo, useState } from 'react'
import data from '@/data/changelog.json'

type Category = string

const formatDate = (iso: string) => {
  // Parse as UTC noon to dodge timezone day-shift, then format.
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function ChangelogFeed() {
  const [filter, setFilter] = useState<Category>('all')

  const entries = useMemo(() => {
    const list =
      filter === 'all'
        ? data.releases
        : data.releases.filter((r) => r.category === filter)
    return [...list].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  }, [filter])

  return (
    <>
      {/* Filter pills */}
      <div role="tablist" aria-label="Filter updates by area" className="cl-filters">
        {data.categories.map((c) => {
          const active = filter === c.id
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              className={`cl-pill${active ? ' is-active' : ''}`}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </button>
          )
        })}
      </div>

      {/* Feed — a left timeline rail with a node per release. */}
      <ol className="cl-timeline">
        {entries.map((r) => (
          <li key={r.version} className="cl-item">
            <span aria-hidden="true" className={`cl-node cat-${r.category}`} />
            <article className="cl-card">
              <header className="cl-card-head">
                <span className="cl-surface">
                  <span aria-hidden="true" className={`cl-dot cat-${r.category}`} />
                  {data.categories.find((c) => c.id === r.category)?.label ?? 'Update'}
                </span>
                <span className="cl-version">{r.version}</span>
                <span className={`cl-badge kind-${r.kind}`}>
                  {(data.kinds as Record<string, string>)[r.kind] ?? r.kind}
                </span>
                <time dateTime={r.date} className="cl-date">
                  {formatDate(r.date)}
                </time>
              </header>
              <h2 className="cl-title">{r.title}</h2>
              <ul className="cl-changes">
                {r.changes.map((c, ci) => (
                  <li key={ci}>{c}</li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>

      {entries.length === 0 && (
        <div className="cl-empty">
          <p>No updates in this area yet — check back soon.</p>
        </div>
      )}
    </>
  )
}
