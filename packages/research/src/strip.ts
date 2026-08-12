/**
 * SAFE corpus stripping — syntax and addresses only.
 *
 * Measured on fbs.edu.in (2026-08-12, three trials, single-pass minimum):
 * 27,851 chars / 13,119 tokens / 2.12 chars-per-token becomes
 * 23,172 chars / 10,215 tokens / 2.27 — a 22% cut in input tokens.
 *
 * Nothing a human reads as a sentence is touched: link TEXT survives, only the
 * href goes. That line is the whole design. The measured `aggressive` variant
 * cut 30% instead of 22%, but it drops every line under four words, and on a
 * real SMB site those lines are the address, the phone number and the opening
 * hours — the facts a local business exists to publish. It is held out
 * deliberately.
 */

/** U+200B..U+200D and U+FEFF — Wix and Squarespace pepper these through copy. */
const ZERO_WIDTH = /[​‌‍﻿]/g

export function stripCorpusNoise(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images: alt text at best, base64 at worst
    .replace(/\[\s*\]\([^)]*\)/g, '') // empty-text links — an href and nothing else
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // keep the words, drop the target
    .replace(/<https?:\/\/[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '') // bare URLs tokenise terribly and say nothing
    .replace(ZERO_WIDTH, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .filter((line) => !/^[\s\-*_|#>]*$/.test(line)) // rules, empty bullets, bare hashes
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
