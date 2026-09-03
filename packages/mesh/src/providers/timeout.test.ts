import { describe, expect, it } from 'vitest'

import { createOpenAiCompatibleProvider } from './openai-compatible'
import { createOpenRouterProvider } from './openrouter'
import { ProviderCallError, type ChatRequest, type FetchLike } from './types'
import { DEFAULT_CHAT_TIMEOUT_MS, IMAGE_TIMEOUT_MS } from '../timeouts'

/**
 * A STALLED SOCKET MUST BECOME A ProviderCallError INSIDE THE CEILING.
 *
 * Before this file, no fetch in the package carried a signal (MEASURED:
 * `grep -rn 'abort|signal|timeout' src --include=*.ts` hit only prose). A call
 * that never answered ran until the platform killed the function, and a killed
 * function never reaches the code that releases the credit hold.
 *
 * The transport below behaves like the real `fetch`: it settles ONLY when the
 * signal it was handed fires. A provider that forgets to pass a signal therefore
 * hangs this test until vitest's own timeout fails it, which is the defect
 * reproduced rather than approximated.
 */
const hangUntilAborted: FetchLike = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init.signal
    if (!signal) return
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

function recordingHang(): { fetchImpl: FetchLike; inits: RequestInit[] } {
  const inits: RequestInit[] = []
  const fetchImpl: FetchLike = (url, init) => {
    inits.push(init)
    return hangUntilAborted(url, init)
  }
  return { fetchImpl, inits }
}

const chatReq = (timeoutMs?: number): ChatRequest => ({
  model: 'm',
  messages: [{ role: 'user', content: 'a secret brief' }],
  maxTokens: 16,
  ...(timeoutMs !== undefined ? { timeoutMs } : {}),
})

describe('a chat call that never answers', () => {
  it('fails as a ProviderCallError naming the ceiling, without the request body', async () => {
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: hangUntilAborted,
    })

    let caught: unknown
    try {
      await provider.chat(chatReq(20))
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(ProviderCallError)
    const err = caught as ProviderCallError
    expect(err.message).toBe('provider did not answer within 20 ms')
    expect(err.timedOut).toBe(true)
    expect(err.status).toBeNull()
    expect(err.message).not.toContain('a secret brief')
  })

  it('carries the package default ceiling on the request when the caller set none', async () => {
    const { fetchImpl, inits } = recordingHang()
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    // The default is 90s, so the call cannot be allowed to run: abort it by hand
    // and read the signal the provider attached.
    const pending = provider.chat(chatReq()).catch((e: unknown) => e)
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(DEFAULT_CHAT_TIMEOUT_MS).toBe(90_000)
    // Release the hanging promise so the test does not leak a timer.
    ;(inits[0]!.signal as AbortSignal).dispatchEvent(new Event('abort'))
    await pending
  })
})

describe('an image call that never answers', () => {
  it('fails as a ProviderCallError naming the ceiling, never the prompt', async () => {
    const provider = createOpenRouterProvider('k', hangUntilAborted)

    let caught: unknown
    try {
      await provider.image!({
        model: 'm',
        prompt: 'a secret plan',
        width: 1024,
        height: 1024,
        timeoutMs: 20,
      })
    } catch (e) {
      caught = e
    }

    expect(caught).toBeInstanceOf(ProviderCallError)
    const err = caught as ProviderCallError
    expect(err.message).toBe('provider did not answer within 20 ms')
    expect(err.timedOut).toBe(true)
    expect(err.message).not.toContain('a secret plan')
  })

  it('attaches a signal by default', async () => {
    const { fetchImpl, inits } = recordingHang()
    const provider = createOpenRouterProvider('k', fetchImpl)

    const pending = provider.image!({ model: 'm', prompt: 'p', width: 1024, height: 1024 }).catch(
      (e: unknown) => e,
    )
    expect(inits[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(IMAGE_TIMEOUT_MS).toBe(120_000)
    ;(inits[0]!.signal as AbortSignal).dispatchEvent(new Event('abort'))
    await pending
  })
})
