#!/usr/bin/env node
/**
 * Before ANY isolation claim: prove the token is actually being honoured.
 * A minted token PostgREST rejects would make every table look "isolated"
 * for the wrong reason — the third way a guard passes without proving
 * anything. So: the anon path must deny, and the member path must SEE its
 * own workspace. Both are printed as the server's own answer.
 */
import { mintToken } from '../lib/jwt.mjs'
import { rest } from '../lib/rest.mjs'

const WS = '6473b616-dbf0-5a27-9d5b-4b67695a9c2c' // Chai & Chapters (Demo)
const USER = 'user_3GrFkWZEcP63riPoPzMadsAzBaP' // a member of it

const anon = await rest(`/workspaces?select=id,name&id=eq.${WS}`)
console.log('ANON  /workspaces  ->', anon.status, anon.text.slice(0, 200))

const tok = mintToken({ sub: USER })
const mem = await rest(`/workspaces?select=id,name&id=eq.${WS}`, { token: tok })
console.log('MEMBER/workspaces  ->', mem.status, mem.text.slice(0, 200))

const who = await rest(`/rpc/whoami`, { token: tok, method: 'POST', body: {} })
console.log('whoami rpc         ->', who.status, who.text.slice(0, 200))

console.log(
  '\nVERDICT:',
  mem.status === 200 && mem.rows === 1
    ? 'HS256 minted token IS honoured — member JWT path is live.'
    : 'HS256 minted token NOT honoured — must obtain real Clerk session tokens instead.',
)
