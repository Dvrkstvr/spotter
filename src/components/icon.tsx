/** The design's inline SVGs. Stroked 24×24 paths, plus the filled drag grip. */
import Svg, { Circle, Path } from 'react-native-svg';

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
