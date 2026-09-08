#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

/**
 * Build (o anteprima) della versione dimostrativa del portale.
 *
 * Perche' uno script invece di `MOCK=1 astro build` nel package.json: quella
 * sintassi e' propria delle shell POSIX e su PowerShell non funziona. Lo
 * sviluppo di questo progetto avviene su Windows, e un comando documentato che
 * fallisce sulla macchina di chi legge e' peggio di uno script in piu'.
 *
 *   pnpm --filter @esperia/portal build:demo
 *   pnpm --filter @esperia/portal preview:demo
 */

const comando = process.argv[2] === 'preview' ? 'preview' : 'build'

const esito = spawnSync('astro', [comando], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, MOCK: '1' },
})

if (esito.error) {
  console.error(esito.error.message)
  process.exit(1)
}

process.exit(esito.status ?? 1)
