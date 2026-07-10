import { NextResponse } from 'next/server'
import { Resend } from 'resend'

type RecordValue = Record<string, unknown>

type ComponentRequest = {
  email: string
  issueType: string
  issueSize: string
  useCase: string
}

const FROM_ADDRESS = 'Raven MCP <drew@ravenmcp.ai>'
const TRIAGE_ADDRESS = 'drew@ravenmcp.ai'
const RATE_LIMIT = 5
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT_PRUNE_THRESHOLD = 500
const requestTimes = new Map<string, number[]>()

const RESERVED_IDENTIFIERS = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const ISSUE_TYPES = new Set([
  'UX/Usability',
  'Visual bug',
  'Missing variant',
  'Accessibility',
  'New pattern',
  'Other',
])

const ISSUE_SIZES = new Set([
  '1-10 users/customers',
  '10-100',
  '100-1,000',
  '1,000+',
  'Internal only',
])

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatPacketValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'None captured'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function sanitizeIdentifier(value: string, fallback: string, leadingDigitPrefix = '_'): string {
  const stripped = value.replace(/[^a-zA-Z0-9_$]/g, '')
  const prefixed = /^\d/.test(stripped) ? `${leadingDigitPrefix}${stripped}` : stripped
  const identifier = prefixed || fallback
  return RESERVED_IDENTIFIERS.has(identifier) ? `${identifier}_` : identifier
}

function selectorToComponentName(selector: string): string {
  const mostSpecificPart = selector.split(/[>+~\s]+/).filter(Boolean).at(-1) || 'SelectedElement'
  const words = mostSpecificPart
    .replace(/::?[\w-]+(?:\([^)]*\))?/g, '')
    .split(/[.#:[\]="'_-]+/)
    .filter(Boolean)

  const name = words
    .map((word) => word.replace(/[^a-zA-Z0-9_$]/g, ''))
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  return sanitizeIdentifier(name, 'SelectedElement', 'Component')
}

function toPropName(value: string): string {
  const words = value.split(/[^a-zA-Z0-9_$]+/).filter(Boolean)
  const [first = 'value', ...rest] = words
  const name = [first.toLowerCase(), ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1))].join('')
  return sanitizeIdentifier(name, 'value')
}

function collectPropNames(matchedTokens: unknown, computedStyles: unknown): string[] {
  const names = new Set<string>(['className'])

  if (isRecord(matchedTokens)) {
    Object.keys(matchedTokens).forEach((key) => names.add(toPropName(key)))
  } else if (Array.isArray(matchedTokens)) {
    matchedTokens.forEach((token) => {
      if (isRecord(token)) {
        const name = asTrimmedString(token.name || token.token || token.property, 100)
        if (name) names.add(toPropName(name))
      }
    })
  }

  if (isRecord(computedStyles)) {
    Object.keys(computedStyles).slice(0, 8).forEach((key) => names.add(toPropName(key)))
  } else if (Array.isArray(computedStyles)) {
    computedStyles.slice(0, 8).forEach((style) => {
      if (isRecord(style)) {
        const name = asTrimmedString(style.property || style.name, 100)
        if (name) names.add(toPropName(name))
      }
    })
  }

  return Array.from(names).slice(0, 10)
}

function buildComponentSpec(selector: string, matchedTokens: unknown, computedStyles: unknown) {
  const componentName = selectorToComponentName(selector)
  const propNames = collectPropNames(matchedTokens, computedStyles)
  const propsType = propNames
    .map((name) => `  ${name}?: string;`)
    .join('\n')
  const destructuredProps = propNames.join(', ')

  const tsx = `type ${componentName}Props = {\n${propsType}\n};\n\nexport function ${componentName}({ ${destructuredProps} }: ${componentName}Props) {\n  return (\n    <div className={className} data-raven-component="${componentName}">\n      {/* Apply the captured tokens and styles here. */}\n    </div>\n  );\n}`

  return { componentName, propNames, tsx }
}

function emailShell(label: string, title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <style>
    :root { color-scheme: dark only; }
    u + .body { background-color: #1a1a22 !important; }
    body, table, td { background-color: #1a1a22 !important; }
    .card, .card td { background-color: #212129 !important; }
  </style>
</head>
<body class="body" bgcolor="#1a1a22" style="margin:0; padding:0; background-color:#1a1a22; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table bgcolor="#1a1a22" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1a1a22; padding:48px 24px;">
    <tr><td bgcolor="#1a1a22" align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="width:100%; max-width:600px;">
        <tr><td style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding-bottom:12px;">${escapeHtml(label)}</td></tr>
        <tr><td style="color:#F0F0F2; font-size:26px; font-weight:700; line-height:1.3; padding-bottom:24px;">${escapeHtml(title)}</td></tr>
        <tr><td>${content}</td></tr>
        <tr><td style="padding-top:32px; color:#5C5F68; font-size:13px;">Sent by <a href="https://ravenmcp.ai" style="color:#00BFFF; text-decoration:none;">Raven</a></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function packetRow(label: string, value: unknown): string {
  return `<tr>
    <td style="width:150px; color:#8E929C; font-size:12px; line-height:1.5; padding:10px 16px 10px 0; border-bottom:1px solid rgba(255,255,255,.06); vertical-align:top;">${escapeHtml(label)}</td>
    <td style="color:#F0F0F2; font:12px/1.6 ui-monospace,'SFMono-Regular',Consolas,monospace; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.06); white-space:pre-wrap; word-break:break-word;">${escapeHtml(formatPacketValue(value))}</td>
  </tr>`
}

function buildPacketCard(body: RecordValue, request: ComponentRequest): string {
  const matchedTokens = body.matchedTokens ?? body.tokens ?? body.tokenIntents
  const computedStyles = body.computedStyles ?? body.styles ?? body.styleEdits

  return `<table class="card" bgcolor="#212129" width="100%" cellpadding="0" cellspacing="0" style="background-color:#212129; border:1px solid rgba(255,255,255,.06); border-radius:12px;">
    <tr><td class="card" bgcolor="#212129" style="background-color:#212129; padding:16px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        ${packetRow('Element selector', body.selector)}
        ${packetRow('Matched tokens', matchedTokens)}
        ${packetRow('Computed styles', computedStyles)}
        ${packetRow('Issue type', request.issueType)}
        ${packetRow('Issue size', request.issueSize)}
        ${packetRow('Use case', request.useCase)}
      </table>
    </td></tr>
  </table>`
}

function buildRequesterEmail(body: RecordValue, request: ComponentRequest): string {
  const selector = asTrimmedString(body.selector, 500) || 'selected-element'
  const matchedTokens = body.matchedTokens ?? body.tokens ?? body.tokenIntents
  const computedStyles = body.computedStyles ?? body.styles ?? body.styleEdits
  const spec = buildComponentSpec(selector, matchedTokens, computedStyles)

  const content = `
    <div style="color:#9498A0; font-size:15px; line-height:1.7; padding-bottom:24px;">Here is the triage packet captured from your selection, plus a deterministic starting spec for <strong style="color:#F0F0F2;">${escapeHtml(spec.componentName)}</strong>.</div>
    ${buildPacketCard(body, request)}
    <div style="color:#00BFFF; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:28px 0 12px;">Example component spec</div>
    <table class="card" bgcolor="#212129" width="100%" cellpadding="0" cellspacing="0" style="background-color:#212129; border:1px solid rgba(255,255,255,.06); border-radius:12px;">
      <tr><td class="card" bgcolor="#212129" style="background-color:#212129; padding:20px;">
        <div style="color:#F0F0F2; font-size:16px; font-weight:700; padding-bottom:8px;">${escapeHtml(spec.componentName)}</div>
        <div style="color:#9498A0; font-size:13px; line-height:1.6; padding-bottom:16px;">Inferred props: ${escapeHtml(spec.propNames.join(', '))}</div>
        <pre style="margin:0; color:#F0F0F2; font:12px/1.65 ui-monospace,'SFMono-Regular',Consolas,monospace; white-space:pre-wrap; word-break:break-word;">${escapeHtml(spec.tsx)}</pre>
      </td></tr>
    </table>`

  return emailShell('Component request', 'Your component request — Raven', content)
}

function buildTriageEmail(body: RecordValue, request: ComponentRequest): string {
  const content = `
    <div style="color:#9498A0; font-size:15px; line-height:1.7; padding-bottom:24px;">A Playground visitor requested a component. Reply to <a href="mailto:${escapeHtml(request.email)}" style="color:#00BFFF;">${escapeHtml(request.email)}</a>.</div>
    ${buildPacketCard(body, request)}`
  return emailShell('Playground triage', 'New Raven component request', content)
}

function parseComponentRequest(body: RecordValue): ComponentRequest | null {
  const raw = isRecord(body.componentRequest) ? body.componentRequest : body
  const email = asTrimmedString(raw.email, 320).toLowerCase()
  const issueType = asTrimmedString(raw.issueType, 80)
  const issueSize = asTrimmedString(raw.issueSize, 80)
  const useCase = asTrimmedString(raw.useCase, 4_000)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailPattern.test(email) || !ISSUE_TYPES.has(issueType) || !ISSUE_SIZES.has(issueSize) || !useCase) {
    return null
  }

  return { email, issueType, issueSize, useCase }
}

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

function pruneExpiredRequestTimes(now: number): void {
  if (requestTimes.size <= RATE_LIMIT_PRUNE_THRESHOLD) return

  requestTimes.forEach((timestamps, ip) => {
    const recent = timestamps.filter((timestamp) => now - timestamp < RATE_WINDOW_MS)
    if (recent.length === 0) {
      requestTimes.delete(ip)
    } else if (recent.length !== timestamps.length) {
      requestTimes.set(ip, recent)
    }
  })
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  pruneExpiredRequestTimes(now)
  const recent = (requestTimes.get(ip) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS)

  if (recent.length >= RATE_LIMIT) {
    requestTimes.set(ip, recent)
    return true
  }

  recent.push(now)
  requestTimes.set(ip, recent)
  return false
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Component requests are temporarily unavailable.' }, { status: 503 })
  }

  const ip = getClientIp(request)
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: 'Request body must be an object.' }, { status: 400 })
  }

  const componentRequest = parseComponentRequest(body)
  const selector = asTrimmedString(body.selector, 500)
  if (!componentRequest || !selector) {
    return NextResponse.json({ error: 'A selection, valid email, issue type, issue size, and use case are required.' }, { status: 400 })
  }

  const resend = new Resend(apiKey)
  const requestId = asTrimmedString(body.requestId, 100)
  const sendOptions = (suffix: string) =>
    requestId ? { idempotencyKey: `${requestId}-${suffix}` } : undefined

  try {
    const requesterResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [componentRequest.email],
      replyTo: TRIAGE_ADDRESS,
      subject: 'Your component request — Raven',
      html: buildRequesterEmail(body, componentRequest),
    }, sendOptions('requester'))

    if (requesterResult.error) {
      return NextResponse.json({ error: 'Failed to send the component request.' }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ error: 'Failed to send the component request.' }, { status: 500 })
  }

  try {
    const triageResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [TRIAGE_ADDRESS],
      replyTo: componentRequest.email,
      subject: `Component request: ${componentRequest.issueType}`,
      html: buildTriageEmail(body, componentRequest),
    }, sendOptions('triage'))

    if (triageResult.error) {
      console.error('Failed to send component request triage notification.', triageResult.error)
    }
  } catch (error) {
    console.error('Failed to send component request triage notification.', error)
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
