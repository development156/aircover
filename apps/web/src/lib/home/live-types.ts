/** The live console's one shape, in a file with no imports so the client can take it. */
export type LiveKind = 'you' | 'sahoda' | 'credits' | 'check'

export interface LiveLine {
  /** ISO time the thing happened. */
  at: string
  /** One plain sentence. */
  text: string
  kind: LiveKind
}
