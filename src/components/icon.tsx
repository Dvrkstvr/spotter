/** The design's inline SVGs. Stroked 24×24 paths, plus the filled drag grip. */
import Svg, { Circle, Path } from 'react-native-svg';

import type { SetMark } from '@/data/exercises';

export function Icon({
  d,
  size = 21,
  color,
  strokeWidth = 1.7,
}: {
  d: string;
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export const GEAR_D =
  'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM12 2.6l1.5 2.3 2.7-.5.6 2.7 2.5 1.1-1 2.6 1 2.6-2.5 1.1-.6 2.7-2.7-.5L12 21.4l-1.5-2.3-2.7.5-.6-2.7-2.5-1.1 1-2.6-1-2.6 2.5-1.1.6-2.7 2.7.5Z';

export const CHECK_D = 'M20.5 6.5 9.4 17.6 3.5 11.7';

/**
 * Camera — the take-a-photo affordance on an <ImageSlot> that allows one.
 * Body, lens and the raised hump over the shutter, drawn as one stroked path
 * so it reads at the 13px it is used at.
 */
export const CAMERA_D =
  'M3.5 8.5h3l1.4-2.2a1 1 0 0 1 .9-.5h6.4a1 1 0 0 1 .9.5L17.5 8.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM12 16.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z';

/**
 * The four set marks — see `SetMark`. Stroked like everything else here, so
 * one glyph serves the 15px slot in a set row and the 22px tile in the sheet.
 *
 * `ok` is a bare circle and `note` a bare i, rather than the usual circled-i:
 * at the size these are actually drawn a ring around the i makes the two read
 * as the same mark, which is the one thing they must never do. The i's dot is
 * a zero-length segment — round caps turn it into a dot, and it stays on the
 * same stroke width as the stem.
 */
export const MARK_D: Record<SetMark, string> = {
  up: 'M12 19.2V5.2M5.8 11.4l6.2-6.2 6.2 6.2',
  down: 'M12 4.8v14M5.8 12.6l6.2 6.2 6.2-6.2',
  ok: 'M18.6 12A6.6 6.6 0 1 1 5.4 12a6.6 6.6 0 1 1 13.2 0',
  note: 'M12 10.8v6.6M12 6.9v.01',
};

/** The six-dot drag handle. */
export function GripIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {[5, 12, 19].map((cy) => (
        <Circle key={cy} cx={9} cy={cy} r={1.5} fill={color} />
      ))}
      {[5, 12, 19].map((cy) => (
        <Circle key={`r${cy}`} cx={15} cy={cy} r={1.5} fill={color} />
      ))}
    </Svg>
  );
}

/** Empty-image glyph for <ImageSlot>. */
export function ImageGlyph({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 5.5h17v13h-17zM3.5 15l4.5-4.5 4 4 3-3 5 5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9} cy={9.5} r={1.4} fill={color} />
    </Svg>
  );
}
