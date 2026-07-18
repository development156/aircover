import { describe, it, expect } from 'vitest'
import type { ChatRequest, FetchLike } from './types'
import { ProviderCallError } from './types'
import { createOpenAiCompatibleProvider } from './openai-compatible'
import { createOpenRouterProvider } from './openrouter'
import { createOpenAIProvider } from './openai'

interface Recorded {
  url: string
  init: RequestInit
}

/** A fake transport that records calls and returns a canned completion body. */
function fakeFetch(body: unknown, status = 200): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl, calls }
}

const completion = {
  model: 'test-model',
  choices: [{ message: { role: 'assistant', content: 'hello world' } }],
  usage: {
    prompt_tokens: 42,
    completion_tokens: 7,
    prompt_tokens_details: { cached_tokens: 30 },
  },
}

const req: ChatRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'hi' }],
  maxTokens: 100,
}

describe('createOpenAiCompatibleProvider', () => {
  it('POSTs to {baseUrl}/chat/completions with bearer auth and the request body', async () => {
    const { fetchImpl, calls } = fakeFetch(completion)
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'secret-key-123',
      fetchImpl,
    })

    await provider.chat(req)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://example.test/v1/chat/completions')
    expect(calls[0]!.init.method).toBe('POST')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret-key-123')
    const sent = JSON.parse(calls[0]!.init.body as string)
    expect(sent.model).toBe('test-model')
    expect(sent.max_tokens).toBe(100)
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('parses content and token usage from the completion', async () => {
    const { fetchImpl } = fakeFetch(completion)
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    const res = await provider.chat(req)

    expect(res.text).toBe('hello world')
    expect(res.usage).toEqual({
      provider: 'x',
      model: 'test-model',
      tokensIn: 42,
      tokensOut: 7,
      cachedTokens: 30,
    })
  })

  it('adds response_format json_object when jsonMode is set', async () => {
    const { fetchImpl, calls } = fakeFetch(completion)
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    await provider.chat({ ...req, jsonMode: true })

    const sent = JSON.parse(calls[0]!.init.body as string)
    expect(sent.response_format).toEqual({ type: 'json_object' })
  })

  it('throws ProviderCallError with status on non-2xx, without leaking the api key', async () => {
    const { fetchImpl } = fakeFetch({ error: 'nope' }, 429)
    const provider = createOpenAiCompatibleProvider({
      name: 'openrouter',
      baseUrl: 'https://example.test/v1',
      apiKey: 'super-secret-do-not-leak',
      fetchImpl,
    })

    let caught: unknown
    try {
      await provider.chat(req)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderCallError)
    const err = caught as ProviderCallError
    expect(err.status).toBe(429)
    expect(err.provider).toBe('openrouter')
    expect(err.message).not.toContain('super-secret-do-not-leak')
  })

  it('wraps a network failure as ProviderCallError with null status', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    let caught: unknown
    try {
      await provider.chat(req)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderCallError)
    expect((caught as ProviderCallError).status).toBeNull()
  })

  it('defaults missing usage fields to zero', async () => {
    const { fetchImpl } = fakeFetch({
      model: 'm',
      choices: [{ message: { content: 'x' } }],
    })
    const provider = createOpenAiCompatibleProvider({
      name: 'x',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    const res = await provider.chat(req)
    expect(res.usage.tokensIn).toBe(0)
    expect(res.usage.tokensOut).toBe(0)
    expect(res.usage.cachedTokens).toBe(0)
  })

  it('throws ProviderCallError on a 200 with a non-JSON body (proxy/gateway HTML)', async () => {
    const fetchImpl: FetchLike = async () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    const provider = createOpenAiCompatibleProvider({
      name: 'openrouter',
      baseUrl: 'https://example.test/v1',
      apiKey: 'do-not-leak',
      fetchImpl,
    })

    let caught: unknown
    try {
      await provider.chat(req)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ProviderCallError)
    expect((caught as Error).message).not.toContain('do-not-leak')
  })

  it('throws ProviderCallError on a 200 with an empty body', async () => {
    const fetchImpl: FetchLike = async () => new Response('', { status: 200 })
    const provider = createOpenAiCompatibleProvider({
      name: 'openai',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl,
    })

    await expect(provider.chat(req)).rejects.toBeInstanceOf(ProviderCallError)
  })
})

describe('createOpenRouterProvider', () => {
  it('targets the OpenRouter base and sets attribution headers', async () => {
    const { fetchImpl, calls } = fakeFetch(completion)
    const provider = createOpenRouterProvider('or-key', fetchImpl)

    expect(provider.name).toBe('openrouter')
    await provider.chat(req)

    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['http-referer']).toBeTruthy()
    expect(headers['x-title']).toBeTruthy()
  })

  it('attaches cache_control on a message marked cache:true', async () => {
    const { fetchImpl, calls } = fakeFetch(completion)
    const provider = createOpenRouterProvider('or-key', fetchImpl)

    await provider.chat({
      model: 'm',
      maxTokens: 50,
      messages: [
        { role: 'system', content: 'BRAND PREFIX', cache: true },
        { role: 'user', content: 'go' },
      ],
    })

    const sent = JSON.parse(calls[0]!.init.body as string)
    expect(sent.messages[0].content).toEqual([
      { type: 'text', text: 'BRAND PREFIX', cache_control: { type: 'ephemeral' } },
    ])
    expect(sent.messages[1].content).toBe('go')
  })
})

describe('createOpenAIProvider', () => {
  it('targets the OpenAI base with plain string content', async () => {
    const { fetchImpl, calls } = fakeFetch(completion)
    const provider = createOpenAIProvider('oai-key', fetchImpl)

    expect(provider.name).toBe('openai')
    await provider.chat({
      model: 'm',
      maxTokens: 50,
      messages: [{ role: 'system', content: 'BRAND PREFIX', cache: true }],
    })

    expect(calls[0]!.url).toBe('https://api.openai.com/v1/chat/completions')
    const sent = JSON.parse(calls[0]!.init.body as string)
    expect(sent.messages[0].content).toBe('BRAND PREFIX')
  })
})
