/**
 * An address from a third party, admitted as a link only when it is https.
 *
 * `conversation.url` arrives from Zernio and is rendered as an `<a href>`. A
 * `javascript:` or `data:` value there would run in the reader's session the
 * moment they pressed "Open on Instagram", so anything but a parseable https
 * URL is dropped and the link is simply not drawn.
 */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
