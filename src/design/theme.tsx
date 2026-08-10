/**
 * What lets the palette change at runtime.
 *
 * `StyleSheet.create` reads its colours the moment it is called, and every
 * screen calls it once at module scope. That is the right shape — the styles
 * are constants — but it means a palette swap can't reach them. `themed()`
 * keeps the shape and defers the call: the sheet is a thunk, rebuilt the
 * first time it is asked for under a new palette generation.
 *
 *   const sheet = themed(() => ({ row: { color: color.text } }));
 *   function Row() {
 *     const styles = useThemed(sheet);   // ← rebuilds when the theme changes
 *   }
 *
 * `useThemed` is not optional sugar: it is the subscription. Reading a themed
 * sheet without it leaves a component holding last theme's colours, because
 * the React Compiler will happily skip re-rendering a child whose props did
 * not change. The rule is therefore flat — **themed styles are read through
 * `useThemed`, always** — and it is why this is a hook rather than a getter.
 *
 * Inline colour reads in JSX (`{ color: color.accent }`) need nothing extra:
 * a component that renders at all reads the live token.
 */
import { createContext, ReactNode, useContext, useMemo } from 'react';
import { ImageStyle, StyleSheet, TextStyle, useColorScheme, ViewStyle } from 'react-native';

import { applyTheme, palette, Palette, ThemeMode, ThemeName } from './tokens';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/** A sheet that knows how to rebuild itself; call it with a generation. */
export type ThemedSheet<T> = (gen: number) => T;

/**
 * The signature mirrors `StyleSheet.create`'s on purpose. Intersecting the
 * thunk's return with `NamedStyles<any>` is what gives the object literal a
 * contextual type, so `flexDirection: 'row'` stays the literal instead of
 * widening to `string` — without it every converted sheet would need `as
 * const` on half its properties.
 */
export function themed<T extends NamedStyles<T> | NamedStyles<any>>(
  make: () => T & NamedStyles<any>
): ThemedSheet<T> {
  let built = -1;
  let cache: T;
  return (gen) => {
    if (gen !== built) {
      cache = StyleSheet.create(make());
      built = gen;
    }
    return cache;
  };
}

/**
 * The palette travels *in* the context rather than being fetched from the
 * module alongside it. That is not tidiness: a hook that reads module state
 * and ignores its own `useContext` result has no reactive input, so the React
 * Compiler is free to cache the return value once and hand back the first
 * theme for the rest of the session. Everything a component can read here has
 * to arrive through this value.
 */
const ThemeContext = createContext<{ gen: number; dark: boolean; colors: Palette }>({
  gen: 0,
  dark: true,
  colors: palette(),
});

/** The current build of a themed sheet, and a subscription to the next one. */
export function useThemed<T>(sheet: ThemedSheet<T>): T {
  return sheet(useContext(ThemeContext).gen);
}

/**
 * The palette, for the colours a sheet can't hold: a conditional style, an
 * `Icon`'s `color` prop, a gradient's stops, a `placeholderTextColor`.
 *
 * It has to be a hook, and it has to hand back a value. Reading the `color`
 * import during render looks equivalent and is not — the React Compiler treats
 * module bindings as constants, so `{ color: color.accent }` in JSX gets
 * hoisted to a single object built on whichever palette was loaded first, and
 * then never changes again. Threading the colours through a hook is what makes
 * the dependency visible to it.
 */
export const useColors = (): Palette => useContext(ThemeContext).colors;

/** Whether the resolved theme is the dark one — for status bars and the like. */
export const useDark = () => useContext(ThemeContext).dark;

/**
 * Resolves mode → palette and publishes the generation.
 *
 * `applyTheme` runs during render rather than in an effect, and deliberately:
 * children read the tokens as they render, so the swap has to have happened
 * before they do. It is safe to do here because it is idempotent — the same
 * (name, dark) always yields the same generation and mutates nothing new.
 */
export function ThemeProvider({
  mode,
  name,
  children,
}: {
  mode: ThemeMode;
  name: ThemeName;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  // Written the long way round so anything that isn't one of the three modes
  // lands on "ask the OS" rather than silently on light. Dark is the fallback
  // when the OS won't say either — this app was dark first.
  const dark = mode === 'dark' ? true : mode === 'light' ? false : scheme !== 'light';
  const value = useMemo(() => {
    const { gen, colors } = applyTheme(name, dark);
    return { gen, dark, colors };
  }, [name, dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
