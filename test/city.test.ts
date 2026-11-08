import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deriveCity, type Snapshot } from '../src/city.ts'
import { FRAMES, H, W, renderCity, timeOfDay } from '../src/render.ts'

/** `n` days ending on `end`, with counts from `count(daysAgo)`. */
function snapshot(n: number, count: (daysAgo: number) => number, end = '2026-11-04'): Snapshot {
  const endMs = Date.parse(end + 'T00:00:00Z')
  const days = Array.from({ length: n }, (_, i) => {
    const daysAgo = n - 1 - i
    return { date: new Date(endMs - daysAgo * 86_400_000).toISOString().slice(0, 10), count: count(daysAgo) }
  })
  return { id: 42, languages: [{ name: 'TypeScript', color: '#3178c6', repos: 3 }], days }
}

// 2026-11-04 is a Wednesday, 2026-11-08 a Sunday.
test('behavior follows recent activity', () => {
  assert.equal(deriveCity(snapshot(400, (d) => (d >= 60 ? 1 : 0))).behavior, 'snowed-in')
  assert.equal(deriveCity(snapshot(400, (d) => (d >= 14 ? 1 : 0))).behavior, 'last-train')
  assert.equal(deriveCity(snapshot(400, (d) => (d === 0 || d >= 3 ? 1 : 0))).behavior, 'station-stop')
  assert.equal(deriveCity(snapshot(400, (d) => (d < 3 ? 1 : 0) + (d === 5 ? 1 : 0) + (d === 6 ? 997 : 0))).behavior, 'shinkansen')
  assert.equal(deriveCity(snapshot(400, () => 1, '2026-11-08')).behavior, 'local')
  assert.equal(deriveCity(snapshot(400, (d) => (d < 7 ? 9 : 1), '2026-11-08')).behavior, 'shinkansen')
})

test('streaks light windows and fade after they end', () => {
  const steady = deriveCity(snapshot(400, () => 1))
  assert.equal(steady.lit, 1)
  const ended = deriveCity(snapshot(400, (d) => (d >= 21 ? 1 : 0)))
  assert.ok(ended.lit > 0.15 && ended.lit < 1)
  assert.equal(deriveCity(snapshot(400, (d) => (d >= 120 ? 1 : 0))).lit, 0.15)
  assert.equal(deriveCity(snapshot(400, () => 0)).growth, 0)
})

test('season month and passengers come from the observation date', () => {
  const city = deriveCity(snapshot(400, (d) => (d === 0 ? 5 : 1)))
  assert.equal(city.month, 11)
  assert.equal(city.today, 5)
})

test('the hour picks the look', () => {
  assert.deepEqual([3, 4, 6, 15, 16, 19, 23].map(timeOfDay), ['night', 'dawn', 'day', 'day', 'dusk', 'night', 'night'])
})

test('render is deterministic and loops at a fixed length', () => {
  const city = deriveCity(snapshot(400, () => 3))
  const a = renderCity(city, 'sakura')
  assert.equal(a.length, FRAMES)
  assert.equal(a[0].length, W * H * 4)
  assert.deepEqual(a, renderCity(city, 'sakura'))
  assert.throws(() => renderCity(city, 'noon'))
})

test('the first frame shows the train, even on a snowed-in day', () => {
  const cream = [217, 212, 197] // local train body
  for (const quiet of [0, 90]) {
    const [first] = renderCity(deriveCity(snapshot(400, (d) => (d >= quiet ? 1 : 0))), 'night')
    let pixels = 0
    for (let i = 0; i < first.length; i += 4) if (cream.every((v, k) => first[i + k] === v)) pixels++
    assert.ok(pixels > 100, `train missing with ${quiet} quiet days`)
  }
})

test('weather codes fold into what the scene draws', async () => {
  const { weatherFromCode } = await import('../src/weather.ts')
  assert.deepEqual([0, 3, 45, 51, 63, 81, 71, 86, 95, 99].map(weatherFromCode), ['clear', 'clear', 'clear', 'rain', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm'])
})

test('live weather and darkness change the scene', () => {
  const city = deriveCity(snapshot(400, () => 3))
  const brightness = (frame: Uint8Array) => frame.reduce((sum, v, i) => (i % 4 === 3 ? sum : sum + v), 0)
  const storm = renderCity(city, 'night', { weather: 'storm', dark: true }).map(brightness)
  assert.ok(Math.max(...storm) > storm[0] * 1.2, 'a storm flashes')
  assert.ok(storm[0] === Math.min(storm[0], storm[1]) || Math.abs(storm[0] - storm[1]) < storm[0] * 0.05, 'the first frame is not a flash')
  const lit = renderCity(city, 'day', { dark: true })[0]
  const unlit = renderCity(city, 'day', { dark: false })[0]
  assert.notDeepEqual(lit, unlit, 'street lights follow the dark')
  assert.deepEqual(renderCity(city, 'day')[0], unlit, 'without a hint, day means lights off')
})

test('locations: coordinates, city qualifiers, and southern seasons', async () => {
  const { parseCoordinates, pickPlace } = await import('../src/location.ts')
  const { seasonOf } = await import('../src/render.ts')
  assert.deepEqual(parseCoordinates('-6.21, 106.85'), { latitude: -6.21, longitude: 106.85, label: '-6.21,106.85' })
  assert.equal(parseCoordinates('Jakarta'), undefined)
  assert.throws(() => parseCoordinates('95,10'))
  const results = [
    { name: 'Bandung', latitude: 1, longitude: 1, country: 'Philippines', country_code: 'PH' },
    { name: 'Bandung', latitude: -6.9, longitude: 107.6, country: 'Indonesia', country_code: 'ID', admin1: 'West Java' },
  ]
  assert.equal(pickPlace(results)?.country, 'Philippines')
  assert.equal(pickPlace(results, 'indonesia')?.latitude, -6.9)
  assert.equal(pickPlace(results, 'West Java')?.country_code, 'ID')
  assert.equal(pickPlace(results, 'Japan'), undefined)
  assert.deepEqual([1, 4, 7, 10].map((m) => seasonOf(m)), ['winter', 'spring', 'summer', 'autumn'])
  assert.deepEqual([1, 4, 7, 10].map((m) => seasonOf(m, true)), ['summer', 'autumn', 'winter', 'spring'])
})
