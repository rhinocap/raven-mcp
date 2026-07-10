import { buildPreviewDocument, renderedElementFor } from '../component-request/preview'

// Stateless preview renderer: the email links here with the captured element
// encoded in the URL, so nothing is stored server-side.
export async function GET(request: Request) {
  const encoded = new URL(request.url).searchParams.get('d') || ''
  if (!encoded || encoded.length > 8_000) {
    return new Response('Missing or oversized preview payload.', { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return new Response('Invalid preview payload.', { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return new Response('Invalid preview payload.', { status: 400 })
  }

  const record = body as Record<string, unknown>
  const rendered = renderedElementFor(record)
  if (!rendered) {
    return new Response('No renderable element in payload.', { status: 400 })
  }

  const selector = typeof record.selector === 'string' ? record.selector.slice(0, 500) : 'selected-element'
  return new Response(buildPreviewDocument(selector, rendered), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:",
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
