#!/usr/bin/env -S npx tsx
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { deriveCity, type Snapshot } from './city.ts'
import { collect } from './collect.ts'
import { encodeGif } from './gif.ts'
import { H, PALETTES, W, renderCity, timeOfDay } from './render.ts'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    time: { type: 'string', default: 'auto' },
    tz: { type: 'string', default: process.env.TZ || 'UTC' },
    out: { type: 'string', default: 'lofi' },
    from: { type: 'string' },
    save: { type: 'string' },
  },
})

const usage = `usage: git-lofi <login> [--time auto|${Object.keys(PALETTES).join('|')}] [--tz Asia/Jakarta] [--out dir] [--save snapshot.json]
       git-lofi --from snapshot.json [--time ...] [--out dir]
Reads GITHUB_TOKEN or GH_TOKEN when fetching.`

async function main() {
  let snapshot: Snapshot
  if (values.from) {
    snapshot = JSON.parse(readFileSync(values.from, 'utf8'))
  } else {
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
    if (!positionals[0] || !token) throw new Error(usage)
    snapshot = await collect(positionals[0], token)
    if (values.save) writeFileSync(values.save, JSON.stringify(snapshot))
  }
  const city = deriveCity(snapshot)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: values.tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
  const time = values.time === 'auto' ? timeOfDay(hour) : values.time
  const gif = encodeGif(renderCity(city, time), W, H)
  mkdirSync(values.out, { recursive: true })
  writeFileSync(join(values.out, 'lofi.gif'), gif)
  console.log(`${join(values.out, 'lofi.gif')}: ${time}, ${city.behavior}, growth ${city.growth.toFixed(2)}, lit ${city.lit.toFixed(2)}, record ${city.record.toFixed(2)}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
