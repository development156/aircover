import { describe, it, expect } from 'vitest'
import { loadMeshConfig, keyClassForTier } from './config'

const fullEnv: Record<string, string | undefined> = {
  OPENROUTER_API_KEY_RESEARCH: 'or-research',
  OPENROUTER_API_KEY_TEXT: 'or-text',
  OPENROUTER_API_KEY_IMAGE: 'or-image',
  OPENAI_API_KEY: 'oai',
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc-role',
}

describe('loadMeshConfig', () => {
  it('parses a complete env into a typed config', () => {
    const cfg = loadMeshConfig(fullEnv)
    expect(cfg.openRouterKeys.research).toBe('or-research')
    expect(cfg.openRouterKeys.text).toBe('or-text')
    expect(cfg.openRouterKeys.image).toBe('or-image')
    expect(cfg.openaiKey).toBe('oai')
    expect(cfg.supabaseUrl).toBe('https://proj.supabase.co')
    expect(cfg.supabaseServiceKey).toBe('svc-role')
  })

  it('fails fast listing every missing required var', () => {
    let msg = ''
    try {
      loadMeshConfig({})
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('OPENROUTER_API_KEY_RESEARCH')
    expect(msg).toContain('OPENROUTER_API_KEY_TEXT')
    expect(msg).toContain('OPENROUTER_API_KEY_IMAGE')
    expect(msg).toContain('OPENAI_API_KEY')
    expect(msg).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(msg).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('treats a blank string as missing', () => {
    expect(() => loadMeshConfig({ ...fullEnv, OPENAI_API_KEY: '   ' })).toThrowError(
      /OPENAI_API_KEY/,
    )
  })

  it('never leaks a secret value into the thrown error', () => {
    let msg = ''
    try {
      loadMeshConfig({ ...fullEnv, SUPABASE_SERVICE_ROLE_KEY: '' })
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(msg).not.toContain('or-research')
    expect(msg).not.toContain('oai')
  })
})

describe('keyClassForTier', () => {
  it('routes the research tier to the research key', () => {
    expect(keyClassForTier('research')).toBe('research')
  })

  it('routes every text-generation tier to the text key', () => {
    for (const tier of ['nano', 'economy', 'standard', 'premium'] as const) {
      expect(keyClassForTier(tier)).toBe('text')
    }
  })
})
