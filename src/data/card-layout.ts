/**
 * Text layout for the share card, which is drawn in SVG and therefore has none
 * of its own.
 *
 * `<Text>` in react-native-svg neither ellipsizes nor wraps, so every line on
 * the card is measured here first, against Inter's real advance widths
 * (`inter-metrics.ts`, generated from the font files the app loads). Pure like
 * the rest of `data/`: strings and sizes in, lines out.
 *
 * The one rule the wrapping keeps is that a **token never breaks**: a set is
 * `85 × 6` or it is on the next line, because a figure split across two lines
 * reads as two figures.
 */
import { INTER } from './inter-metrics';

export type Weight = 'regular' | 'heading';

/** Width of `s` at `size`, with CSS-style letter spacing added between glyphs. */
export const textWidth = (s: string, size: number, weight: Weight = 'regular', spacing = 0) => {
  const m = INTER[weight];
  let em = 0;
  for (const ch of s) em += m.widths[ch] ?? m.fallback;
  return (em / 1000) * size + spacing * Math.max(0, [...s].length - 1);
};

/**
 * `s` cut to fit `max`, with an ellipsis when anything was cut. Never returns
 * something wider than `max`; a `max` too small for even the ellipsis returns
 * the empty string rather than overflowing.
 */
export const ellipsize = (
  s: string,
  size: number,
  max: number,
  weight: Weight = 'regular',
  spacing = 0
): string => {
  if (textWidth(s, size, weight, spacing) <= max) return s;
  const chars = [...s];
  for (let n = chars.length - 1; n > 0; n--) {
    const cut = `${chars.slice(0, n).join('').trimEnd()}…`;
    if (textWidth(cut, size, weight, spacing) <= max) return cut;
  }
  return textWidth('…', size, weight, spacing) <= max ? '…' : '';
};

/** One run of a rich line: text drawn in one weight and one tone. */
export type Run = { text: string; weight?: Weight; tone?: string };

const runsWidth = (runs: readonly Run[], size: number) =>
  runs.reduce((w, r) => w + textWidth(r.text, size, r.weight ?? 'regular'), 0);

/**
 * Tokens laid into lines no wider than `max`, joined by `sep` within a line.
 * A token wider than a whole line gets a line to itself and is left to
 * overflow — cutting a set in half would be worse than a long line.
 */
export const wrapRuns = (
  tokens: readonly Run[][],
  sep: Run,
  size: number,
  max: number
): Run[][] => {
  const lines: Run[][] = [];
  let line: Run[] = [];
  let width = 0;
  for (const tok of tokens) {
    const w = runsWidth(tok, size);
    if (line.length === 0) {
      line = [...tok];
      width = w;
      continue;
    }
    const joined = width + runsWidth([sep], size) + w;
    if (joined <= max) {
      line.push(sep, ...tok);
      width = joined;
    } else {
      lines.push(line);
      line = [...tok];
      width = w;
    }
  }
  if (line.length) lines.push(line);
  return lines;
};
