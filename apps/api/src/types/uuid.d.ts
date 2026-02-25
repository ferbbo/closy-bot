/**
 * Minimal ambient declaration for uuid@10 (which ships no .d.ts files).
 * Only declares what is actually used in this codebase: v4.
 */
declare module 'uuid' {
  /** Generate a RFC 4122 version 4 UUID */
  export function v4(): string;
}
