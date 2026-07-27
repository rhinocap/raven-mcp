type RecordValue = Record<string, unknown>

const PREVIEW_STYLE_PROPS = new Set([
  'display', 'width', 'height', 'padding', 'gap',
  'color', 'background', 'background-color', 'border-color', 'border-width', 'border-style', 'border-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'opacity', 'box-shadow', 'align-items', 'justify-content', 'grid-template-columns',
])

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function sanitizeElementHtml(raw: string): string {
  return raw
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(class|id)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href|action|formaction|srcset)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi, '')
}

function inlineRootStyles(html: string, styles: unknown): string {
  if (!isRecord(styles)) return html
  const decls = Object.entries(styles)
    // Values come from getComputedStyle — a real value is a single declaration
    // with no ';' or backslash escape. Rejecting both kills CSS declaration
    // injection (extra ';'-separated rules) and url()/escape obfuscation.
    .filter(([key, value]) => PREVIEW_STYLE_PROPS.has(key) && typeof value === 'string' && !/[<>";\\]|expression\s*\(|url\s*\(/i.test(value))
    .map(([key, value]) => `${key}:${value}`)
    .concat('margin:0 auto')
    .join(';')
  const match = html.match(/^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/)
  if (!decls || !match) return html
  const styleAttr = /\sstyle\s*=\s*"([^"]*)"/i
  const attrs = styleAttr.test(match[2])
    ? match[2].replace(styleAttr, (_full, existing) => ` style="${existing};${decls}"`)
    : `${match[2]} style="${decls}"`
  return `<${match[1]}${attrs}>${html.slice(match[0].length)}`
}

export function renderedElementFor(body: RecordValue): string {
  const raw = typeof body.html === 'string' ? body.html.trim().slice(0, 4_000) : ''
  // Truncated captures (client caps outerHTML and appends "…") are broken markup — skip.
  if (!raw || !raw.startsWith('<') || raw.endsWith('…')) return ''
  return inlineRootStyles(sanitizeElementHtml(raw), body.styles ?? body.computedStyles)
}

export function buildPreviewDocument(selector: string, rendered: string): string {
  const safeSelector = escapeHtml(selector)
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Raven component preview — ${safeSelector}</title>
</head>
<body style="margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; background:#F4F4F6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="color:#5C5F68; font-size:13px; letter-spacing:.04em;">Raven component preview · <code>${safeSelector}</code></div>
  <div style="background:#FFFFFF; border:1px solid rgba(0,0,0,.08); border-radius:12px; padding:48px 64px; box-shadow:0 2px 12px rgba(0,0,0,.06);">${rendered}</div>
</body>
</html>`
}
