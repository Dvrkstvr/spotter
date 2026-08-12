/**
 * Plan a workout on a day — which routine, and how often it comes back.
 *
 * Replaces the v3 `ScheduleSheet`, which picked a routine for a *weekday* and
 * committed on the tap that picked it. Two things changed and each forced a
 * piece of this shape:
 *
 * - **It is opened on a date** (`dayPlan.iso`), because a rule needs an anchor
 *   and a weekday has none. The routine list is the old sheet's, minus the Rest
 *   row: with several workouts to a day, rest stopped being a thing you pick
 *   and became what is left when the rows are gone — so removing lives on the
 *   held button at the foot.
 * - **Save is explicit.** Two fields depend on each other now; committing on
 *   the routine tap would write "Legs A, once" before you reached the part
 *   where you said weekly.
 *
 * Editing an existing rule (`dayPlan.entry`) adds the scope question, and the
 * scope governs everything under it: *Just this day* never touches the rule, so
 * the Repeats field steps aside — there is no repeat being written.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { HoldBtn } from '@/components/hold-btn';
import { CHECK_D, Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { dowOfISO, fromISO } from '@/data/date';
import { countN, fmtDayShort, repeatLabel, repeatSentence, repeatUnit, DAYS_SHORT } from '@/data/i18n';
import { anchorFor, type Repeat } from '@/data/plan';
import { useBackClose } from '@/hooks/use-back-close';
import { themed, useColors, useThemed } from '@/design/theme';
import { color, font, radius, slop, wash } from '@/design/tokens';
import { Btn, Chip, H4, H6, missingName, Seg } from '@/design/ui';
import { useStore } from '@/store/workout-store';

/** How far the stepper goes. Past a quarter it isn't a repeat, it's a day. */
const MAX_N = 12;

type Unit = 'once' | 'day' | 'week';
type Scope = 'day' | 'rule';

export function PlanSheet() {
  const styles = useThemed(sheet);
  const c = useColors();
  const {
    s, L, patch, ex, rInfo, exInfo, addPlan, editPlan, swapPlanDay, skipPlanDay, dropPlan,
  } = useStore();

  const open = s.dayPlan;
  const held = open?.entry ? s.plan.entries.find((e) => e.id === open.entry) ?? null : null;

  // Seeded once from what was tapped: an existing rule opens on its own
  // values, a fresh one on weekly-on-this-weekday — which is what the retired
  // weekday rows could express, and still the common case.
  const [rid, setRid] = useState<string | null>(held?.rid ?? null);
  const [unit, setUnit] = useState<Unit>(held?.repeat.unit ?? 'week');
  const [n, setN] = useState(held && held.repeat.unit !== 'once' ? held.repeat.n : 1);
  const [dows, setDows] = useState<number[]>(
    held?.repeat.unit === 'week'
      ? [...held.repeat.dows]
      : open
        ? [dowOfISO(open.iso)]
        : []
  );
  /**
   * Defaulting to the narrower scope: a sheet opened by tapping one day should
   * not rewrite three months of Wednesdays because the question was skimmed.
   */
  const [scope, setScope] = useState<Scope>('day');

  const close = () => patch({ dayPlan: null });
  useBackClose(close);

  if (!open) return null;
  const iso = open.iso;

  /** The scope question only exists where a change has two readings. */
  const asks = !!held && held.repeat.unit !== 'once';
  const perDay = asks && scope === 'day';

  const repeat: Repeat =
    unit === 'once'
      ? { unit: 'once' }
      : unit === 'day'
        ? { unit: 'day', n }
        : { unit: 'week', n, dows: dows.length ? dows : [dowOfISO(iso)] };

  const options = s.routines.map((r) => ({
    id: r.id,
    ...rInfo(r),
    meta: countN(r.items.length, L.exCountOne, L.exCount),
    detail: r.items
      .map((i) => {
        const e = ex(i.ex);
        return e ? exInfo(e).text : null;
      })
      .filter(Boolean)
      .join(' · '),
  }));

  const dayName = fmtDayShort(s.lang, fromISO(iso));
  /** A rule can outlive the routine it names; the sheet still has to open. */
  const heldRoutine = held ? s.routines.find((r) => r.id === held.rid) : undefined;

  const save = () => {
    if (!rid) return;
    if (!held) addPlan(iso, rid, repeat);
    else if (perDay) swapPlanDay(iso, held.id, rid);
    else editPlan(held.id, rid, repeat);
  };

  return (
    <Sheet zIndex={83} maxHeight="88%" onClose={close}>
      <H4>{heldRoutine ? rInfo(heldRoutine).text : L.planTitle}</H4>
      {/* The day, and — when editing — the rule as it stands, so the scope
          chips below have something concrete to be about. */}
      <Text style={styles.kicker}>
        {held ? `${dayName} · ${repeatLabel(held.repeat, L, s.lang)}` : dayName}
      </Text>

      {asks && (
        <>
          <H6 style={styles.field}>{L.planScope}</H6>
          <View style={styles.chips}>
            <Chip label={L.planScopeDay} on={scope === 'day'} onPress={() => setScope('day')} />
            <Chip label={L.planScopeRule} on={scope === 'rule'} onPress={() => setScope('rule')} />
          </View>
        </>
      )}

      <H6 style={styles.field}>{L.planWorkoutField}</H6>
      <View style={styles.list}>
        {options.map((o) => {
          const on = o.id === rid;
          return (
            <Pressable key={o.id} onPress={() => setRid(o.id)} style={styles.row}>
              <View style={styles.text}>
                <Text
                  style={[styles.name, on && { color: c.accent }, o.missing && missingName(c)]}
                >
                  {o.text}
                </Text>
                {!!o.detail && (
                  <Text style={styles.detail} numberOfLines={1}>
                    {o.detail}
                  </Text>
                )}
              </View>
              <Text style={styles.meta}>{o.meta}</Text>
              {on && <Icon d={CHECK_D} size={14} strokeWidth={2.2} color={c.accent400} />}
            </Pressable>
          );
        })}
      </View>

      {/* Under "just this day" there is no repeat being written, so the whole
          field steps aside rather than sitting there inert. */}
      {!perDay && (
        <>
          <H6 style={styles.field}>{L.planRepeats}</H6>
          <Seg
            style={styles.seg}
            options={[
              { key: 'once', label: L.repOnce, on: unit === 'once', pick: () => setUnit('once') },
              { key: 'day', label: L.repDays, on: unit === 'day', pick: () => setUnit('day') },
              { key: 'week', label: L.repWeeks, on: unit === 'week', pick: () => setUnit('week') },
            ]}
          />

          {unit !== 'once' && (
            <View style={styles.stepRow}>
              <Stepper n={n} onChange={setN} />
              <Text style={styles.unitWord}>{repeatUnit(L, unit, n)}</Text>
            </View>
          )}

          {/* Weekly only: an interval counted from the anchor has no weekday to
              pick. Emptying the strip falls back to the anchor's own day rather
              than to a rule that lands nowhere. */}
          {unit === 'week' && (
            <View style={styles.dowBar}>
              {DAYS_SHORT[s.lang].map((d, i) => {
                const on = dows.includes(i);
                return (
                  <Chip
                    key={i}
                    style={styles.dowChip}
                    textStyle={styles.dowLabel}
                    label={d}
                    on={on}
                    onPress={() =>
                      setDows((cur) =>
                        cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]
                      )
                    }
                  />
                );
              })}
            </View>
          )}

          <Text style={styles.sentence}>
            {repeatSentence(repeat, anchorFor(held?.from ?? iso, repeat), L, s.lang)}
          </Text>
        </>
      )}

      {/* Which reading is being saved, spelled out — two chips with a label
          each is where calendar apps lose people. */}
      {asks && (
        <Text style={styles.scopeNote}>
          {(perDay ? L.planScopeDayNote : L.planScopeRuleNote).replace('{date}', dayName)}
        </Text>
      )}

      <Btn
        variant="primary"
        block
        disabled={!rid}
        label={rid ? L.save : L.planPickFirst}
        style={styles.saveBtn}
        onPress={save}
      />

      {/* Held, like every destructive act here, and the label says which one it
          means: one occurrence, or the rule. */}
      {held && (
        <HoldBtn
          dashed
          destructive
          // A one-off has one occurrence, so "every repeat" would be a
          // distinction about nothing — it says plainly what it does instead.
          label={!asks ? L.planHoldRemove : perDay ? L.planHoldRemoveDay : L.planHoldRemoveRule}
          labelStyle={styles.removeLabel}
          style={styles.removeBtn}
          onConfirm={() => (perDay ? skipPlanDay(iso, held.id) : dropPlan(held.id))}
        />
      )}
    </Sheet>
  );
}

/** ‹ n › — the numbers gesture reduced to two buttons, where a drag would fight
    the sheet's own scroll. */
function Stepper({ n, onChange }: { n: number; onChange: (n: number) => void }) {
  const styles = useThemed(sheet);
  const { L } = useStore();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L.repOnce} −`}
        hitSlop={slop}
        disabled={n <= 1}
        onPress={() => onChange(Math.max(1, n - 1))}
        style={styles.stepBtn}
      >
        <Text style={[styles.stepGlyph, n <= 1 && styles.stepOff]}>‹</Text>
      </Pressable>
      <Text style={styles.stepValue}>{n}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L.repOnce} +`}
        hitSlop={slop}
        disabled={n >= MAX_N}
        onPress={() => onChange(Math.min(MAX_N, n + 1))}
        style={styles.stepBtn}
      >
        <Text style={[styles.stepGlyph, n >= MAX_N && styles.stepOff]}>›</Text>
      </Pressable>
    </View>
  );
}

const sheet = themed(() => ({
  kicker: {
    fontFamily: font.regular,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: color.accent,
    marginTop: 3,
  },
  field: { marginTop: 16, color: color.neutral500 },
  chips: { flexDirection: 'row', gap: 6, marginTop: 8 },

  list: { marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: wash.text(8),
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.regular, fontSize: 14.5, color: color.text },
  detail: { fontFamily: font.regular, fontSize: 11, color: color.neutral600 },
  meta: { fontFamily: font.regular, fontSize: 11.5, color: color.neutral600 },

  seg: { marginTop: 8, alignSelf: 'flex-start' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  stepBtn: { paddingVertical: 4, paddingHorizontal: 12 },
  stepGlyph: { fontFamily: font.regular, fontSize: 17, color: color.accent },
  stepOff: { color: color.neutral700 },
  stepValue: {
    fontFamily: font.regular,
    fontSize: 14,
    color: color.text,
    minWidth: 26,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  unitWord: { fontFamily: font.regular, fontSize: 13.5, color: color.neutral400 },

  dowBar: { flexDirection: 'row', gap: 4, marginTop: 10 },
  dowChip: { flex: 1, paddingHorizontal: 0 },
  dowLabel: { fontSize: 11.5, textAlign: 'center' },

  sentence: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: color.accent300,
    backgroundColor: wash.accent(10),
    borderRadius: radius.md,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 11,
  },
  scopeNote: {
    fontFamily: font.regular,
    fontSize: 11.5,
    color: color.neutral500,
    marginTop: 12,
  },
  saveBtn: { marginTop: 14, height: 42 },
  removeBtn: { marginTop: 7, height: 38 },
  removeLabel: { fontSize: 12.5 },
}));
