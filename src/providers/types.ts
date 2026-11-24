export interface TranslateResult {
  translations: string[];
  detected?: string;
  /**
   * Index-aligned flags marking slots the provider could **not** translate.
   *
   * This exists to separate two cases that used to look identical to callers:
   *
   *  - a genuine failure (HTTP error, unparseable reply, a chunk the model
   *    dropped) — the provider pads the slot with `""` or with the original
   *    text so the array stays aligned, and
   *  - a legitimate translation that happens to equal the source ("OK", a
   *    proper noun, or a page already written in the target language).
   *
   * Without the distinction the second case was treated as a failure: it was
   * never cached and never marked done, so the engine re-requested those
   * segments on every mutation pass, forever.
   *
   * Omitted entirely when nothing failed, so the happy path allocates nothing.
   */
  failed?: boolean[];
}

/** Build the optional `failed` mask, omitted entirely when nothing failed. */
export function failedMask(flags: boolean[]): boolean[] | undefined {
  return flags.some(Boolean) ? flags : undefined;
}
