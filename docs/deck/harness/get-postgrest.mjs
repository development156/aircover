// Download the PostgREST static linux binary into the scratchpad (never the repo).
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const OUT =
  '/tmp/claude-1000/-home-divas-Documents-GitHub-sahodalabs/bba3e938-0904-498b-b8eb-82ebf7aa416b/scratchpad/postgrest.tar.xz'

const r = await fetch('https://api.github.com/repos/PostgREST/postgrest/releases/latest', {
  headers: { 'user-agent': 'sahoda-shots' },
})
const rel = await r.json()
const asset = rel.assets.find((a) => /linux-static-x86-64\.tar\.xz$/.test(a.name))
if (!asset) throw new Error('no linux static asset')
console.log('downloading', asset.name, `${(asset.size / 1e6).toFixed(1)} MB`)

const dl = await fetch(asset.browser_download_url, { headers: { 'user-agent': 'sahoda-shots' } })
if (!dl.ok) throw new Error(`download failed ${dl.status}`)
await pipeline(Readable.fromWeb(dl.body), createWriteStream(OUT))
console.log('saved ->', OUT)
