#!/usr/bin/env -S npx tsx
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { deriveCity, type Snapshot } from './city.ts'
import { collect } from './collect.ts'
import { encodeGif } from './gif.ts'
import { H, PALETTES, W, renderCity, timeOfDay } from './render.ts'
import { parseCoordinates, resolveLocation, type Place } from './location.ts'
import { fetchWeather, type LiveWeather } from './weather.ts'

// Node gives IPv6 and IPv4 only 250ms each before giving up; slow or IPv6-less networks need longer.
setDefaultAutoSelectFamilyAttemptTimeout(2000)

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    time: { type: 'string', default: 'auto' },
    tz: { type: 'string' },
    location: { type: 'string' },
    out: { type: 'string', default: 'lofi' },
    from: { type: 'string' },
    save: { type: 'string' },
    weather: { type: 'string' },
  },
})

const usage = `usage: git-lofi <login> [--location "Jakarta"] [--time auto|${Object.keys(PALETTES).join('|')}] [--tz Asia/Jakarta] [--weather=lat,lon|off] [--out dir] [--save snapshot.json]
       git-lofi --from snapshot.json [--location ...] [--time ...] [--weather clear|rain|storm|snow] [--out dir]
--location takes a city ("Bandung, Indonesia") or --location=-6.21,106.85, and sets the weather,
timezone and hemisphere; --tz and --weather override it.
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
  const place = values.location ? await resolveLocation(values.location) : undefined
  const { weather, timezone, at } = await liveWeather(values.weather, place)
  const tz = values.tz || place?.timezone || timezone || process.env.TZ || 'UTC'
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(new Date())
    .split(':')
    .map(Number)
  const time = values.time === 'auto' ? timeOfDay(hour) : values.time
  const southern = (place ?? at)?.latitude !== undefined && (place ?? at)!.latitude < 0
  // Street lights come on when it actually gets dark (17:30 to 06:00) or when it rains.
  const clock = hour + minute / 60
  const dark = values.time === 'auto' ? clock >= 17.5 || clock < 6 || weather === 'rain' || weather === 'storm' : time !== 'day'
  const gif = encodeGif(renderCity(city, time, { weather, dark, southern }), W, H)
  mkdirSync(values.out, { recursive: true })
  writeFileSync(join(values.out, 'lofi.gif'), gif)
  console.log(`${join(values.out, 'lofi.gif')}: ${place ? `${place.label} (${tz}), ` : ''}${time}, ${weather}${dark ? ', lights on' : ''}, ${city.behavior}, growth ${city.growth.toFixed(2)}, lit ${city.lit.toFixed(2)}, record ${city.record.toFixed(2)}`)
}

/**
 * The weather to draw. `--weather` wins when given: `off`, a fixed `clear|rain|storm|snow`, or
 * `lat,lon` to look it up there. Otherwise the weather comes from `--location`, if any.
 */
async function liveWeather(option: string | undefined, place: Place | undefined): Promise<{ weather: LiveWeather; timezone?: string; at?: Place }> {
  if (option === 'off') return { weather: 'clear' }
  if (option && ['clear', 'rain', 'storm', 'snow'].includes(option)) return { weather: option as LiveWeather }
  const at = option ? parseCoordinates(option) : place
  if (option && !at) throw new Error(`--weather wants lat,lon (like --weather=-6.21,106.85), off, or clear|rain|storm|snow; got "${option}"`)
  if (!at) return { weather: 'clear' }
  return { ...(await fetchWeather(at.latitude, at.longitude)), at }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
