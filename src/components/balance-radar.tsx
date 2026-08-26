/**
 * The muscle-balance radar — six regions, one shape.
 *
 * A radar is the right form here for the one reason radars are usually the
 * wrong one: the six axes are a *fixed, complete* set that always appears in
 * the same order, so the shape itself is the reading. A body that leans
 * forward looks like a body that leans forward, and you learn your own outline
 * well enough to spot a change in it.
 *
 * It is deliberately not the whole story — the ranked rows under it are, and
 * they are what the coach prompt uses. This says "look" and the rows say
 * "here".
 */
import Svg, { Circle, Line, Polygon, Text as SvgText, TSpan } from 'react-native-svg';

import type { Palette } from '@/design/tokens';
import { font } from '@/design/tokens';
import { EVEN_SHARE, pct, type Region, type RegionStat } from '@/data/stats';

export function BalanceRadar({
  balance,
  label,
  size,
  c,
}: {
  balance: RegionStat[];
  /** A region's display name — passed in so this file holds no dictionary. */
  label: (r: Region) => string;
  /** Available width. Height follows from it. */
  size: number;
  /** The palette, as an argument: a colour read at module scope is a colour
      that stops following the theme. See `missingName` in ui.tsx. */
  c: Palette;
}) {
  const H = 196;
  const cx = size / 2;
  const cy = H / 2;
  // Room for the labels, which sit outside the outer ring on all six sides.
  // The vertical budget is the binding one — a label above the top axis and
  // another below the bottom one both need the ring's offset plus a line of
  // type, so the radius is what gives way rather than the clearance. Without
  // the slack the top label sits on the card's own heading.
  const R = Math.min(H / 2 - 34, size / 2 - 52);

  // The outer ring is whatever the biggest region has, so the shape fills the
  // chart however lopsided the eight weeks were. Floored at an even split, or
  // a diary with one region in it would draw a full hexagon.
  const peak = Math.max(EVEN_SHARE, ...balance.map((b) => b.share));

  const at = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / balance.length;
    return [cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r];
  };

  return (
    <Svg width={size} height={H} style={{ marginTop: 8 }}>
      {/* Rings and spokes, recessive — scaffolding, never data. */}
      {[1 / 3, 2 / 3, 1].map((r) => (
        <Circle key={r} cx={cx} cy={cy} r={R * r} fill="none" stroke={c.wash.text(9)} />
      ))}
      {balance.map((b, i) => {
        const [x, y] = at(i, 1);
        return <Line key={b.region} x1={cx} y1={cy} x2={x} y2={y} stroke={c.wash.text(9)} />;
      })}

      {/* An even split. The only reason a dent in the shape means anything. */}
      <Circle
        cx={cx}
        cy={cy}
        r={R * (EVEN_SHARE / peak)}
        fill="none"
        stroke={c.neutral500}
        strokeDasharray="3 4"
      />

      <Polygon
        points={balance.map((b, i) => at(i, b.share / peak).join(',')).join(' ')}
        fill={c.wash.accent(20)}
        stroke={c.accent}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {balance.map((b, i) => {
        const [x, y] = at(i, b.share / peak);
        return <Circle key={b.region} cx={x} cy={y} r={2.6} fill={c.accent} />;
      })}

      {balance.map((b, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / balance.length;
        const lx = cx + Math.cos(a) * (R + 14);
        const ly = cy + Math.sin(a) * (R + 14);
        // Anchored away from the centre, so a label never sits on the shape.
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        const dy = Math.sin(a) > 0.5 ? 11 : Math.sin(a) < -0.5 ? -4 : 4;
        return (
          <SvgText
            key={b.region}
            x={lx}
            y={ly + dy}
            textAnchor={anchor}
            fontFamily={font.regular}
            fontSize={11}
            fill={b.low > 0 ? c.neutral600 : c.text}
          >
            {label(b.region)}
            <TSpan fontSize={9.5} fill={c.neutral600}>
              {`  ${pct(b.share)}%`}
            </TSpan>
          </SvgText>
        );
      })}
    </Svg>
  );
}
