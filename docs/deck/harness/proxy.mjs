/**
 * A local stand-in for the Supabase edge, so apps/web can run entirely offline
 * against the throwaway pgbox.
 *
 * supabase-js talks to `<origin>/rest/v1/...` and `<origin>/storage/v1/...`.
 * PostgREST serves at its own root and knows nothing about storage, so this
 * process is the only thing between them:
 *
 *   /rest/v1/*      → PostgREST on 3222, prefix stripped
 *   /storage/v1/*   → demo image bytes, generated here (see NOTE below)
 *   everything else → 404, loudly, so a missed surface is visible rather than silent
 *
 * NOTE ON IMAGES. The seeded asset rows describe photographs that do not exist —
 * there is no object store here. Rather than serve broken thumbnails, this
 * returns a generated card carrying the asset's own alt text, so the library and
 * post previews are legible. Every one of them is plainly a demo tile, not a
 * photograph, which is the honest way round: a fake photo in a deck would be a
 * claim, a labelled tile is a placeholder.
 */
import { createServer } from 'node:http'
import { request as httpRequest } from 'node:http'

const PGRST = { host: '127.0.0.1', port: 3222 }
const PORT = 3223

/** Warm, bakery-ish tones so the library reads as one brand rather than noise. */
const TONES = [
  ['#F3E3CE', '#8A5A2B'],
  ['#EFE0D6', '#7A4B33'],
  ['#F6E9D8', '#94612F'],
  ['#EADFD1', '#6F5138'],
  ['#F5E2D0', '#A05A2C'],
]

function tile(label, w = 1200, h = 900) {
  const [bg, fg] = TONES[Math.abs(hash(label)) % TONES.length]
  const words = String(label).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > 22) {
      lines.push(line.trim())
      line = word
    } else line += ' ' + word
  }
  if (line.trim()) lines.push(line.trim())

  const fontSize = Math.round(w / 18)
  const startY = h / 2 - ((lines.length - 1) * fontSize * 1.25) / 2
  const text = lines
    .map(
      (l, i) =>
        `<text x="${w / 2}" y="${startY + i * fontSize * 1.25}" font-family="Georgia,serif" font-size="${fontSize}" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${escapeXml(l)}</text>`,
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${bg}"/>
    <rect x="${w * 0.04}" y="${h * 0.05}" width="${w * 0.92}" height="${h * 0.9}" fill="none" stroke="${fg}" stroke-opacity="0.28" stroke-width="${Math.max(2, w / 400)}"/>
    ${text}
    <text x="${w / 2}" y="${h - h * 0.09}" font-family="Helvetica,Arial,sans-serif" font-size="${Math.round(fontSize * 0.42)}" fill="${fg}" fill-opacity="0.65" text-anchor="middle" letter-spacing="2">DEMO IMAGE</text>
  </svg>`
}

function escapeXml(s) {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c],
  )
}
function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

/** Turn `<ws>/library/morning-tray-7am.jpg` into "Morning tray 7am". */
function labelFor(path) {
  const base = decodeURIComponent(String(path).split('/').pop() ?? 'image')
  return base
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function sendSvg(res, label) {
  const body = tile(label)
  res.writeHead(200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=3600',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname

  // ── STORAGE ───────────────────────────────────────────────────────────────
  if (path.startsWith('/storage/v1/')) {
    // createSignedUrls: POST /storage/v1/object/sign/<bucket>  {paths, expiresIn}
    const signMatch = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)$/)
    if (signMatch && req.method === 'POST') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        let paths = []
        try {
          paths = JSON.parse(raw || '{}').paths ?? []
        } catch {
          /* fall through to an empty list */
        }
        const bucket = signMatch[1]
        const body = JSON.stringify(
          paths.map((p) => ({
            error: null,
            path: p,
            signedURL: `/object/sign/${bucket}/${encodeURI(p)}?token=demo`,
          })),
        )
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(body)
      })
      return
    }

    // Any GET of an object — signed, authenticated or public — is a demo tile.
    const objMatch = path.match(
      /^\/storage\/v1\/object\/(?:sign|authenticated|public)\/[^/]+\/(.+)$/,
    )
    if (objMatch) return sendSvg(res, labelFor(objMatch[1]))

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found', path }))
    return
  }

  // ── POSTGREST ─────────────────────────────────────────────────────────────
  if (path.startsWith('/rest/v1')) {
    const forwarded = path.replace(/^\/rest\/v1/, '') || '/'
    const headers = { ...req.headers, host: `${PGRST.host}:${PGRST.port}` }
    // `apikey` is a Supabase-edge concept; PostgREST would reject the unknown header
    // pair on some paths, and it carries nothing we need.
    delete headers.apikey
    delete headers['accept-encoding']

    const upstream = httpRequest(
      {
        host: PGRST.host,
        port: PGRST.port,
        method: req.method,
        path: forwarded + url.search,
        headers,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      },
    )
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: `proxy → postgrest failed: ${err.message}` }))
    })
    req.pipe(upstream)
    return
  }

  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ message: `local supabase stand-in has no route for ${path}` }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local supabase stand-in on http://127.0.0.1:${PORT}`)
  console.log(`  /rest/v1/*    -> postgrest ${PGRST.host}:${PGRST.port}`)
  console.log(`  /storage/v1/* -> generated demo tiles`)
})
