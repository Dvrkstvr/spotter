/**
 * Tests run in plain Node, not in a React Native harness.
 *
 * Everything under test is a pure module — `data/` takes values in and hands
 * answers back, with no store and no hooks — so the runner has to know two
 * things: what `@/` means, and the one place a value module reaches a native
 * one. `data/migrate` asks `design/tokens` whether a stored theme name is
 * real, and `tokens` reads `Easing` at module scope; `test/react-native-stub`
 * answers that and nothing else.
 *
 * The alias is anchored (`/^react-native$/`) so it cannot also swallow
 * react-native-gesture-handler and friends. Keeping this list at one entry is
 * the property worth defending: a setup that needs a stub per native import
 * rots the first time the code gains one.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      {
        find: /^react-native$/,
        replacement: fileURLToPath(new URL('./test/react-native-stub.ts', import.meta.url)),
      },
    ],
  },
  // React Native's own global. `tokens` reads it to guard a drift check that
  // asserts `buildPalette('blurple', true)` still equals the ported Nocturne
  // palette byte for byte — so defining it `true` means every test run also
  // answers the one design invariant `scripts/` has no check for.
  define: { __DEV__: 'true' },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
