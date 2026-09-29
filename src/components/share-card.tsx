/**
 * The share card, drawn — one SVG, laid out by hand.
 *
 * It is SVG rather than views because the same tree has to be two things: the
 * preview in the sheet, and the 1080-pixel PNG that leaves the phone
 * (`Svg.toDataURL`, which `react-native-svg` already ships — no capture module,
 * no rebuild, and Expo Go keeps working). **The preview is the export, drawn
 * smaller**, so what you see is exactly what is sent.
 *
 * What it costs is layout: SVG has no flexbox, no wrapping and no ellipsis, so
 * every line is measured first (`data/card-layout.ts`, against Inter's real
 * advance widths) and placed here. The card has a fixed shape and a capped
 * list, which is what makes that bearable.
 *
 * Every word on it is decided in `data/share-card.ts`. This file only places
 * those strings and colours them from a palette it is *handed* — the card's own
 * look, which need not be the app's (`paletteOf`) — so nothing here reads the
 * live theme or the app's language.
 *
 * Geometry is in the card's own 360-wide space (×3 on export), the way
 * `make-icons.mjs` keeps the brand's geometry in its own coordinates: these
 * are the drawing's dimensions, not the app's spacing scale. The mockup that
 * fixes them is `design/share-workout-mockup.html`.
 */
import { memo, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';
import type { BodyPart } from 'react-native-body-highlighter';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop, Text, TSpan } from 'react-native-svg';

import { ART, CROP, heatRamp } from '@/components/body-heat';
import { ellipsize, textWidth, wrapRuns, type Run, type Weight } from '@/data/card-layout';
import { INERT_SLUGS } from '@/data/body-map';
import type { CardExercise, CardModel, CardShape, CardType } from '@/data/share-card';
import type { Sex } from '@/data/strength';
import { font, radius, tracking, type Palette } from '@/design/tokens';

/** The card's width in its own units; the export is three of these per unit. */
export const CARD_W = 360;
export const CARD_H: Record<CardShape, number> = { story: 640, post: 450 };
/** 1080 × 1920 and 1080 × 1350 — a story, and the tallest a feed shows uncropped. */
export const EXPORT_W = 1080;

/**
 * Where content may go. A story's `bottom` is the band Instagram and WhatsApp
 * draw their reply bar over, and its `top` clears the progress bar and avatar;
 * only the mark sits in a band, and a mark can survive being covered.
 */
const FRAME: Record<CardShape, { x: number; top: number; bottom: number; mark: number }> = {
  story: { x: 28, top: 64, bottom: 88, mark: 26 },
  post: { x: 26, top: 28, bottom: 44, mark: 20 },
};

/** The card's type scale: size, line box, weight. */
const TYPE = {
  kicker: { size: 10, line: 14, spacing: 0.12 },
  title: { story: 34, post: 28 },
  sub: { size: 12.5, line: 17 },
  tileKey: { size: 8.5, spacing: 0.1 },
  tileValue: 17,
  tileUnit: 11,
  line: { size: 12, line: 19 },
  tag: { size: 8, spacing: 0.1 },
  more: 11,
  logName: { story: { size: 13.5, line: 18 }, post: { size: 12.5, line: 16 } },
  logSets: { story: { size: 12, line: 17 }, post: { size: 11.5, line: 15 } },
  mark: 12,
} as const;

const TILE_H = 46;
const TILE_GAP = 7;
/** Hung in the margin like Today's hero bracket: 1px of rule and 9 of gap. */
const BRACKET = 10;
const SEP = ' · ';
const MARK = 'Spotter';

const familyOf = (w: Weight) => (w === 'heading' ? font.heading : font.regular);
const weightOf = (w: Weight) => (w === 'heading' ? '500' : '400');

/** The baseline that centres a line of caps and x-height in a line box. */
const baseline = (top: number, line: number, size: number) => top + line / 2 + size * 0.36;

function Line({
  x,
  y,
  size,
  weight = 'regular',
  fill,
  anchor,
  spacing,
  children,
}: {
  x: number;
  y: number;
  size: number;
  weight?: Weight;
  fill: string;
  anchor?: 'start' | 'end';
  spacing?: number;
  children: string;
}) {
  return (
    <Text
      x={x}
      y={y}
      fontSize={size}
      fontFamily={familyOf(weight)}
      fontWeight={weightOf(weight)}
      fill={fill}
      textAnchor={anchor}
      letterSpacing={spacing}
    >
      {children}
    </Text>
  );
}

/** A line of runs, each in its own weight and tone. */
function Runs({
  x,
  y,
  size,
  runs,
  fill,
}: {
  x: number;
  y: number;
  size: number;
  runs: Run[];
  fill: string;
}) {
  return (
    <Text x={x} y={y} fontSize={size} fontFamily={font.regular} fill={fill}>
      {runs.map((r, i) => (
        <TSpan
          key={i}
          fontFamily={familyOf(r.weight ?? 'regular')}
          fontWeight={weightOf(r.weight ?? 'regular')}
          fill={r.tone ?? fill}
        >
          {r.text}
        </TSpan>
      ))}
    </Text>
  );
}

/** One figure, scaled into place — the Insights artwork, not a second drawing. */
function Figure({
  side,
  x,
  y,
  w,
  sex,
  heat,
  c,
}: {
  side: 'front' | 'back';
  x: number;
  y: number;
  w: number;
  sex: Sex | undefined;
  heat: Map<string, number>;
  c: Palette;
}) {
  const g = sex === 'female' ? 'female' : 'male';
  const box = CROP[g];
  const [bx, by] = box[side].split(' ').map(Number);
  const s = w / box.units;
  const ramp = heatRamp(c);
  const inert = new Set<string>(INERT_SLUGS);
  return (
    <G transform={`translate(${x} ${y}) scale(${s}) translate(${-bx} ${-by})`}>
      {ART[g][side].map((part: BodyPart) => {
        const step = part.slug && !inert.has(part.slug) ? heat.get(part.slug) : undefined;
        const fill = step === undefined ? c.neutral800 : ramp[step];
        const d = [
          ...(part.path?.common ?? []),
          ...(part.path?.left ?? []),
          ...(part.path?.right ?? []),
        ];
        return d.map((one) => (
          <Path key={one} d={one} fill={fill} stroke={c.wash.scrim(50)} strokeWidth={0.6 / s} />
        ));
      })}
    </G>
  );
}

/**
 * A name and, if it earned one, its *best yet* tag — the tag only while the
 * whole name still fits beside it. A cut name is the worse loss: the figure
 * after it is already drawn in accent, so the best set is still marked, where
 * "Bankdrück… BESTWERT" says less than "Bankdrücken" did.
 */
const nameAndTag = (
  name: string,
  best: boolean,
  tag: string,
  size: number,
  max: number,
  weight: Weight
): { name: string; tag: string } => {
  const tagSpace = tracking(TYPE.tag.size, TYPE.tag.spacing);
  const tagW = textWidth(tag, TYPE.tag.size, 'regular', tagSpace) + 7;
  if (best && textWidth(name, size, weight) <= max - tagW) return { name, tag };
  return { name: ellipsize(name, size, max, weight), tag: '' };
};

export const figureHeight = (w: number, sex: Sex | undefined) =>
  w * CROP[sex === 'female' ? 'female' : 'male'].ratio;

/**
 * How many exercises fit in `rows` slots without splitting a pair — and when
 * not all do, one slot goes to the line that says how many were left out. A
 * short list has to read as narrowed rather than as all there was.
 */
const fitRows = (exercises: readonly CardExercise[], rows: number): number => {
  if (exercises.length <= rows) return exercises.length;
  let n = Math.max(0, rows - 1);
  // A pair is one thing; half of it is a different workout.
  if (n > 0 && exercises[n - 1].pairNext) n -= 1;
  return n;
};

export const ShareCard = memo(function ShareCard({
  model,
  type,
  shape,
  exercises,
  body,
  sex,
  c,
  width,
  svgRef,
}: {
  model: CardModel;
  type: CardType;
  shape: CardShape;
  /** Highlights' list switch. */
  exercises: boolean;
  /** Highlights' muscle-map switch. */
  body: boolean;
  sex: Sex | undefined;
  /** The card's palette — its own look, not necessarily the app's. */
  c: Palette;
  /** Width on screen, in dp. */
  width: number;
  svgRef?: Ref<Svg>;
}) {
  const H = CARD_H[shape];
  const f = FRAME[shape];
  const innerW = CARD_W - f.x * 2;
  const limit = H - f.bottom;
  const out: ReactNode[] = [];
  let y = f.top;

  /* — the head: date, name, who and which — */
  const kicker = model.date.toUpperCase();
  const kSpace = tracking(TYPE.kicker.size, TYPE.kicker.spacing);
  out.push(
    <Line
      key="date"
      x={f.x}
      y={baseline(y, TYPE.kicker.line, TYPE.kicker.size)}
      size={TYPE.kicker.size}
      fill={c.accent}
      spacing={kSpace}
    >
      {ellipsize(kicker, TYPE.kicker.size, innerW, 'regular', kSpace)}
    </Line>
  );
  y += TYPE.kicker.line + 6;

  const tSize = TYPE.title[shape];
  const tLine = tSize * 1.12;
  out.push(
    <Line
      key="title"
      x={f.x}
      y={y + tSize * 0.86}
      size={tSize}
      weight="heading"
      fill={c.text}
      spacing={tracking(tSize, -0.02)}
    >
      {ellipsize(model.title, tSize, innerW, 'heading', tracking(tSize, -0.02))}
    </Line>
  );
  y += tLine + 4;

  const sub: Run[] = [];
  if (model.buddy) {
    const [before, after = ''] = model.labels.withBuddy.split('{name}');
    if (before) sub.push({ text: before });
    sub.push({ text: model.buddy, weight: 'heading', tone: c.accent300 });
    if (after) sub.push({ text: after });
    sub.push({ text: SEP });
  }
  sub.push({ text: model.week });
  out.push(
    <Runs
      key="sub"
      x={f.x}
      y={baseline(y, TYPE.sub.line, TYPE.sub.size)}
      size={TYPE.sub.size}
      runs={sub}
      fill={c.neutral400}
    />
  );
  y += TYPE.sub.line;

  if (type === 'highlights') {
    /* — three tiles — */
    y += shape === 'story' ? 18 : 14;
    const n = model.stats.length;
    const tileW = (innerW - TILE_GAP * (n - 1)) / n;
    const keySpace = tracking(TYPE.tileKey.size, TYPE.tileKey.spacing);
    model.stats.forEach((st, i) => {
      const x = f.x + i * (tileW + TILE_GAP);
      out.push(
        <G key={`tile${i}`}>
          <Rect
            x={x}
            y={y}
            width={tileW}
            height={TILE_H}
            rx={radius.md - 1}
            fill={c.surface}
            fillOpacity={0.85}
          />
          <Line
            x={x + 10}
            y={y + 16}
            size={TYPE.tileKey.size}
            fill={c.neutral600}
            spacing={keySpace}
          >
            {ellipsize(st.label.toUpperCase(), TYPE.tileKey.size, tileW - 20, 'regular', keySpace)}
          </Line>
          <Runs
            x={x + 10}
            y={y + 36}
            size={TYPE.tileValue}
            fill={c.text}
            runs={[
              { text: st.value },
              // A count's noun is the tile's own heading; a measure keeps its unit.
              ...(st.count ? [] : [{ text: ` ${st.unit}`, tone: c.neutral500 }]),
            ]}
          />
        </G>
      );
    });
    y += TILE_H + (shape === 'story' ? 20 : 16);

    /* — the figure and the list — */
    const heat = new Map(model.heat.map((h) => [h.slug, h.step]));
    let listX = f.x;
    let listW = innerW;
    let figBottom = y;
    if (body) {
      if (shape === 'story') {
        const w = 80;
        const gap = 14;
        const x0 = (CARD_W - (w * 2 + gap)) / 2;
        const fh = figureHeight(w, sex);
        out.push(
          <Figure key="front" side="front" x={x0} y={y} w={w} sex={sex} heat={heat} c={c} />
        );
        out.push(
          <Figure key="back" side="back" x={x0 + w + gap} y={y} w={w} sex={sex} heat={heat} c={c} />
        );
        y += fh + 16;
        figBottom = y;
      } else {
        const w = exercises ? 56 : 84;
        const gap = 6;
        const fh = figureHeight(w, sex);
        out.push(
          <Figure key="front" side="front" x={f.x} y={y} w={w} sex={sex} heat={heat} c={c} />
        );
        out.push(
          <Figure
            key="back"
            side="back"
            x={f.x + w + gap}
            y={y}
            w={w}
            sex={sex}
            heat={heat}
            c={c}
          />
        );
        figBottom = y + fh;
        listX = f.x + w * 2 + gap + 16;
        listW = innerW - (listX - f.x);
      }
    }

    const factLines = model.fact
      ? wrapRuns(
          model.fact.split(' ').map((w) => [{ text: w }]),
          { text: ' ' },
          TYPE.sub.size,
          innerW
        ).slice(0, 2)
      : [];
    const factH = factLines.length ? 14 + factLines.length * TYPE.sub.line : 0;
    let listBottom = y;

    if (exercises && model.exercises.length) {
      const rows = Math.max(1, Math.floor((limit - factH - y) / TYPE.line.line));
      const shown = fitRows(model.exercises, rows);
      const tagSpace = tracking(TYPE.tag.size, TYPE.tag.spacing);
      model.exercises.slice(0, shown).forEach((e, k) => {
        const top = y + k * TYPE.line.line;
        const b = baseline(top, TYPE.line.line, TYPE.line.size);
        const valueW = textWidth(e.top, TYPE.line.size);
        const { name, tag } = nameAndTag(
          e.name,
          e.best,
          model.labels.tag.toUpperCase(),
          TYPE.line.size,
          Math.max(0, listW - valueW - 10),
          'regular'
        );
        out.push(
          <Line
            key={`n${k}`}
            x={listX}
            y={b}
            size={TYPE.line.size}
            fill={e.best ? c.text : c.neutral400}
          >
            {name}
          </Line>
        );
        if (tag)
          out.push(
            <Line
              key={`t${k}`}
              x={listX + textWidth(name, TYPE.line.size) + 7}
              y={b - 1}
              size={TYPE.tag.size}
              fill={c.accent}
              spacing={tagSpace}
            >
              {tag}
            </Line>
          );
        out.push(
          <Line
            key={`v${k}`}
            x={listX + listW}
            y={b}
            size={TYPE.line.size}
            fill={e.best ? c.accent300 : c.neutral500}
            anchor="end"
          >
            {e.top}
          </Line>
        );
        if (e.pairNext && k + 1 < shown)
          out.push(
            <Rect
              key={`p${k}`}
              x={listX - BRACKET}
              y={top + 3}
              width={1}
              height={TYPE.line.line * 2 - 6}
              rx={0.5}
              fill={c.accent700}
            />
          );
      });
      let used = shown;
      if (shown < model.exercises.length) {
        out.push(
          <Line
            key="more"
            x={listX}
            y={baseline(y + shown * TYPE.line.line, TYPE.line.line, TYPE.more)}
            size={TYPE.more}
            fill={c.neutral600}
          >
            {model.labels.more.replace('{n}', String(model.exercises.length - shown))}
          </Line>
        );
        used += 1;
      }
      listBottom = y + used * TYPE.line.line;
    } else if (model.best) {
      // The list is off, so the headline best stands on its own.
      const tagSpace = tracking(TYPE.tileKey.size, TYPE.tileKey.spacing);
      out.push(
        <Line
          key="bk"
          x={listX}
          y={y + 9}
          size={TYPE.tileKey.size}
          fill={c.accent}
          spacing={tagSpace}
        >
          {model.labels.bestLine.toUpperCase()}
        </Line>
      );
      const setW = model.best.set ? textWidth(model.best.set, 14) : 0;
      out.push(
        <Line key="bn" x={listX} y={y + 28} size={14} fill={c.text}>
          {ellipsize(model.best.name, 14, listW - setW - 10)}
        </Line>
      );
      if (model.best.set)
        out.push(
          <Line key="bs" x={listX + listW} y={y + 28} size={14} fill={c.accent300} anchor="end">
            {model.best.set}
          </Line>
        );
      listBottom = y + 34;
    }

    y = Math.max(listBottom, figBottom);
    if (factLines.length) {
      y += 14;
      factLines.forEach((ln, i) =>
        out.push(
          <Runs
            key={`f${i}`}
            x={f.x}
            y={baseline(y + i * TYPE.sub.line, TYPE.sub.line, TYPE.sub.size)}
            size={TYPE.sub.size}
            runs={ln}
            fill={c.neutral400}
          />
        )
      );
    }
  } else {
    /* — Log: a stat line, a rule, and the day set by set — */
    y += 12;
    const statRuns: Run[] = [];
    model.stats.forEach((st, i) => {
      if (i) statRuns.push({ text: SEP, tone: c.neutral700 });
      statRuns.push({ text: st.value, weight: 'heading', tone: c.text });
      statRuns.push({ text: ` ${st.unit}` });
    });
    out.push(
      <Runs
        key="stats"
        x={f.x}
        y={baseline(y, TYPE.sub.line, TYPE.sub.size)}
        size={TYPE.sub.size}
        runs={statRuns}
        fill={c.neutral500}
      />
    );
    y += TYPE.sub.line + (shape === 'story' ? 16 : 12);
    out.push(<Rect key="rule" x={f.x} y={y} width={innerW} height={1} fill={c.neutral800} />);
    y += 1 + (shape === 'story' ? 14 : 11);

    const nm = TYPE.logName[shape];
    const st = TYPE.logSets[shape];
    const gap = shape === 'story' ? 9 : 6;
    const tagSpace = tracking(TYPE.tag.size, TYPE.tag.spacing);
    // Lay every block out first, so the fit can be decided on real heights.
    const blocks = model.exercises.map((e) => {
      const tokens: Run[][] = e.chains.map((chain) =>
        chain.map((set, j) => ({
          text: j === 0 ? set.text : ` ↳ ${set.text}`,
          weight: set.best ? ('heading' as const) : ('regular' as const),
          tone: set.best ? c.accent300 : j === 0 ? undefined : c.neutral500,
        }))
      );
      const lines = wrapRuns(tokens, { text: SEP, tone: c.neutral700 }, st.size, innerW);
      return { e, lines, h: nm.line + lines.length * st.line };
    });

    const moreH = TYPE.sub.line;
    let shown = 0;
    let at = y;
    while (shown < blocks.length) {
      const pair = blocks[shown].e.pairNext && shown + 1 < blocks.length ? 2 : 1;
      const need = blocks.slice(shown, shown + pair).reduce((n, b) => n + b.h + gap, 0) - gap;
      const tail = shown + pair < blocks.length ? moreH + gap : 0;
      if (at + need + tail > limit) break;
      at += need + gap;
      shown += pair;
    }
    if (shown === 0) shown = Math.min(1, blocks.length);

    blocks.slice(0, shown).forEach((b, k) => {
      const { name, tag } = nameAndTag(
        b.e.name,
        b.e.best,
        model.labels.tag.toUpperCase(),
        nm.size,
        innerW,
        'heading'
      );
      out.push(
        <Line
          key={`ln${k}`}
          x={f.x}
          y={baseline(y, nm.line, nm.size)}
          size={nm.size}
          weight="heading"
          fill={c.text}
        >
          {name}
        </Line>
      );
      if (tag)
        out.push(
          <Line
            key={`lt${k}`}
            x={f.x + textWidth(name, nm.size, 'heading') + 7}
            y={baseline(y, nm.line, nm.size) - 1}
            size={TYPE.tag.size}
            fill={c.accent}
            spacing={tagSpace}
          >
            {tag}
          </Line>
        );
      b.lines.forEach((ln, li) =>
        out.push(
          <Runs
            key={`ls${k}.${li}`}
            x={f.x}
            y={baseline(y + nm.line + li * st.line, st.line, st.size)}
            size={st.size}
            runs={ln}
            fill={c.neutral400}
          />
        )
      );
      if (b.e.pairNext && k + 1 < shown) {
        const h = b.h + gap + blocks[k + 1].h;
        out.push(
          <Rect
            key={`lp${k}`}
            x={f.x - BRACKET}
            y={y + 3}
            width={1}
            height={h - 6}
            rx={0.5}
            fill={c.accent700}
          />
        );
      }
      y += b.h + gap;
    });
    if (shown < blocks.length)
      out.push(
        <Line
          key="more"
          x={f.x}
          y={baseline(y, moreH, TYPE.more)}
          size={TYPE.more}
          fill={c.neutral600}
        >
          {model.labels.more.replace('{n}', String(blocks.length - shown))}
        </Line>
      );
  }

  /* — the mark, bottom right — */
  const markY = H - f.mark - 2;
  const markW = textWidth(MARK, TYPE.mark, 'heading');
  out.push(
    <G key="mark">
      <Rect
        x={CARD_W - f.x - markW - 18}
        y={markY - 10.5}
        width={12}
        height={12}
        rx={radius.sm}
        fill={c.accent}
      />
      <Line
        x={CARD_W - f.x}
        y={markY}
        size={TYPE.mark}
        weight="heading"
        fill={c.neutral400}
        anchor="end"
      >
        {MARK}
      </Line>
    </G>
  );

  // Sized by the wrapper and filled at 100%, never by the Svg's own `width`:
  // react-native-svg `parseInt`s a numeric width, so the export's 392.7 dp
  // (1080 px at 2.75×) came out 392 dp — a 1078-pixel card. A percentage is
  // passed through untouched, and the wrapper keeps the fraction.
  return (
    <View style={{ width, height: (width * H) / CARD_W }}>
      <Svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${CARD_W} ${H}`}>
        <Defs>
          {/* The hero card's grammar: the theme's darkest accent seeping in
            from one corner, over the page. */}
          <RadialGradient
            id="glow"
            cx={0}
            cy={0}
            rx={CARD_W * 1.2}
            ry={H * 0.6}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset={0} stopColor={c.accent900} stopOpacity={1} />
            <Stop offset={0.7} stopColor={c.accent900} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={CARD_W} height={H} fill={c.bg} />
        <Rect x={0} y={0} width={CARD_W} height={H} fill="url(#glow)" />
        {out}
      </Svg>
    </View>
  );
});
