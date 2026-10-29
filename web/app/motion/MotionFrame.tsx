'use client';

import { useEffect, useRef, useState } from 'react';

// The playground runs in a sandbox without allow-same-origin, so it cannot
// reach the clipboard itself. It posts the text it wants copied; this parent
// copies it and answers. Only messages from this iframe's own window, with the
// opaque origin a sandboxed frame has, are accepted.
const MAX_TEXT = 64 * 1024;

export default function MotionFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [fallback, setFallback] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const win = frame.current?.contentWindow;
      if (!win || event.source !== win || event.origin !== 'null') return;
      const data = event.data;
      if (!data || data.type !== 'raven-motion-copy') return;
      if (typeof data.text !== 'string' || data.text.length >= MAX_TEXT) return;
      const reply = (ok: boolean) => win.postMessage({ type: 'raven-motion-copied', id: data.id, ok }, '*');
      if (!navigator.clipboard?.writeText) {
        setFallback(data.text);
        reply(false);
        return;
      }
      navigator.clipboard.writeText(data.text).then(
        () => reply(true),
        () => {
          setFallback(data.text);
          reply(false);
        },
      );
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <>
      <iframe ref={frame} className="motion-frame" src={src} title={title} sandbox="allow-scripts" />
      {fallback !== null && (
        <div className="motion-fallback" role="status">
          <p>The browser blocked the copy. Select the text below, or try the button.</p>
          <textarea readOnly value={fallback} rows={8} onFocus={(e) => e.currentTarget.select()} />
          <div className="motion-fallback-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigator.clipboard?.writeText(fallback).then(() => setFallback(null), () => {})}
            >
              Copy
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setFallback(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
