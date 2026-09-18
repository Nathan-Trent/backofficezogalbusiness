import { defineConfig } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import uncheckedRead from './eslint-rules/unchecked-read.mjs'

/* Every `{ data }` read must take `error` — the rule from zogal.app. Here it
   applies everywhere: every read in a back office is a money or a people read. */
export default defineConfig([
  ...nextVitals, ...nextTs,
  { files: ['**/*.ts', '**/*.tsx'], plugins: { local: { rules: { 'unchecked-read': uncheckedRead } } }, rules: { 'local/unchecked-read': 'error', 'react-hooks/purity': 'off', 'react-hooks/set-state-in-effect': 'off' } },
  /* Server pages read the clock per request on purpose; the purity rule is written for client components. */
  { ignores: ['.next/**', 'node_modules/**'] },
])
