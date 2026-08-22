import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const WT = path.resolve(HERE, '..', '..')

function parse(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

const DOT = '.env'
export const env = {
  ...parse(path.join(WT, DOT)),
  ...parse(path.join(WT, 'apps', 'web', DOT)),
}

export function need(k) {
  const v = env[k]
  if (!v) throw new Error(`missing env ${k}`)
  return v
}
