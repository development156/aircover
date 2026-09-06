/**
 * A chainable, thenable stand-in for the Supabase client, for the asset
 * action tests.
 *
 * Records every call (table, method, args) so a test can assert WHAT was
 * asked of the database, and answers each table from a script the test
 * sets. Not a mock of PostgREST: it does not evaluate filters. A test that
 * needs "the update touched two rows" sets the answer to two rows and asserts
 * the filters it saw, which is the same thing the real client would do with a
 * real database and is the only claim a unit test can make honestly.
 */

export interface FakeCall {
  table: string
  method: string
  args: unknown[]
}

export interface FakeAnswer {
  data?: unknown
  error?: { code?: string; message?: string } | null
  count?: number | null
}

export interface FakeSupabaseState {
  /** Answers by table. A table with several calls answers in order, last one repeating. */
  answers: Record<string, FakeAnswer[]>
  calls: FakeCall[]
  storage: {
    uploads: { path: string; options: unknown }[]
    removed: string[][]
    uploadError: { message: string } | null
    signed: { path: string; options: unknown }[]
    signedUrl: string | null
  }
  rpc: { fn: string; args: unknown }[]
  rpcAnswer: FakeAnswer
}

export function freshState(): FakeSupabaseState {
  return {
    answers: {},
    calls: [],
    storage: { uploads: [], removed: [], uploadError: null, signed: [], signedUrl: null },
    rpc: [],
    rpcAnswer: { data: null, error: null },
  }
}

const CHAIN = [
  'select',
  'eq',
  'is',
  'in',
  'not',
  'or',
  'order',
  'limit',
  'update',
  'insert',
  'delete',
] as const

export function fakeSupabase(state: FakeSupabaseState) {
  return {
    from(table: string) {
      const queue = state.answers[table] ?? []
      const answer = (): FakeAnswer => {
        if (queue.length === 0) return { data: [], error: null }
        return queue.length === 1 ? (queue[0] as FakeAnswer) : (queue.shift() as FakeAnswer)
      }
      const resolved = () => {
        const a = answer()
        return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null }
      }
      const builder: Record<string, unknown> = {}
      for (const method of CHAIN) {
        builder[method] = (...args: unknown[]) => {
          state.calls.push({ table, method, args })
          return builder
        }
      }
      builder.single = () => Promise.resolve(resolved())
      builder.maybeSingle = () => Promise.resolve(resolved())
      builder.then = (onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve(resolved()).then(onFulfilled)
      return builder
    },
    storage: {
      from: () => ({
        upload: (path: string, _bytes: unknown, options: unknown) => {
          state.storage.uploads.push({ path, options })
          return Promise.resolve({ error: state.storage.uploadError })
        },
        remove: (paths: string[]) => {
          state.storage.removed.push(paths)
          return Promise.resolve({ error: null })
        },
        list: () => Promise.resolve({ data: [], error: null }),
        createSignedUrl: (path: string, _ttl: number, options: unknown) => {
          state.storage.signed.push({ path, options })
          return Promise.resolve(
            state.storage.signedUrl === null
              ? { data: null, error: { message: 'no' } }
              : { data: { signedUrl: state.storage.signedUrl }, error: null },
          )
        },
      }),
    },
    rpc: (fn: string, args: unknown) => {
      state.rpc.push({ fn, args })
      return Promise.resolve({
        data: state.rpcAnswer.data ?? null,
        error: state.rpcAnswer.error ?? null,
      })
    },
  }
}
