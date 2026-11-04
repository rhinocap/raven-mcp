'use client';

import { useRef, useState } from 'react';
import MotionFrame from './MotionFrame';
import data from '@/public/playgrounds/try/suggestions.json';

// What suggest_motion found on the sample page (scripts/build-motion-try.mjs):
// the page capture with a numbered spot per suggestion, the list the Grab Motion
// tab shows, and the chosen suggestion's playground live below.
type Suggestion = { kind: string; label: string; why: string; when: string; box: { x: number; y: number; w: number; h: number }; file: string };

const BASE = '/playgrounds/try/';
const suggestions = data.suggestions as Suggestion[];
const pageWidth = data.page.width;
// Smaller spots stack higher, so a spot inside a larger one stays clickable.
const byArea = suggestions.map((s, i) => ({ i, area: s.box.w * s.box.h })).sort((a, b) => b.area - a.area);
const stackOrder: number[] = [];
byArea.forEach((x, rank) => { stackOrder[x.i] = rank + 1; });

export default function TryMotion() {
  const [chosen, setChosen] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const current = suggestions[chosen];

  function choose(i: number, fromPage: boolean) {
    setChosen(i);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // From the list, bring the spot into view in the page capture; either way the
    // playground is the next thing to look at.
    if (!fromPage) {
      const spot = pageRef.current?.querySelector<HTMLElement>(`[data-spot="${i}"]`);
      spot?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    }
    frameRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }

  return (
    <section className="try" aria-labelledby="try-title">
      <h2 id="try-title">Try it on a sample page</h2>
      <p className="try-lede">
        Raven looked at this studio page and found {suggestions.length} places where motion would help. Pick one and tune it below.
      </p>
      <div className="try-grid">
        <div className="try-page" ref={pageRef}>
          <div className="try-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BASE + data.page.file} alt="A sample studio website: a header, a large headline with two buttons, three project cards, and a wide image." width={pageWidth} />
            {suggestions.map((s, i) => (
              <button
                key={s.file}
                type="button"
                className="try-spot"
                data-spot={i}
                data-hot={i === chosen ? 'true' : 'false'}
                aria-label={`${i + 1}. ${s.label}`}
                aria-pressed={i === chosen}
                onClick={() => choose(i, true)}
                style={{
                  left: `${(s.box.x / pageWidth) * 100}%`,
                  top: `${(s.box.y / pageWidth) * 100}cqw`,
                  width: `${(s.box.w / pageWidth) * 100}%`,
                  height: `${(s.box.h / pageWidth) * 100}cqw`,
                  // A spot inside another (the button inside the hero) sits above it.
                  zIndex: stackOrder[i],
                }}
              >
                <span className="try-badge" aria-hidden="true">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="try-panel">
          <p className="try-panel-title">Motion</p>
          <ol className="try-list">
            {suggestions.map((s, i) => (
              <li key={s.file}>
                <button type="button" className="try-row" data-hot={i === chosen ? 'true' : 'false'} aria-pressed={i === chosen} onClick={() => choose(i, false)}>
                  <span className="try-chip" aria-hidden="true">{i + 1}</span>
                  <span className="try-row-body">
                    <span className="try-name">{s.label}</span>
                    <span className="try-when">{s.when}</span>
                    <span className="try-why">{s.why}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div ref={frameRef} className="try-frame">
        <MotionFrame key={current.file} src={BASE + current.file} title={`Motion playground: ${current.label}`} />
      </div>
    </section>
  );
}
