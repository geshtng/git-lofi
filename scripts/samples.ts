// Renders the README samples into docs/ from made-up cities. Run: npm run samples
import { writeFileSync } from 'node:fs'

import type { City } from '../src/city.ts'
import { encodeGif } from '../src/gif.ts'
import { H, W, renderCity } from '../src/render.ts'

const city = (over: Partial<City>): City => ({
  seed: 20261108,
  languages: [{ color: '#00ADD8', share: 0.5 }, { color: '#3178c6', share: 0.3 }, { color: '#f1e05a', share: 0.2 }],
  growth: 0.55,
  lit: 0.85,
  record: 0.75,
  behavior: 'local',
  month: 10,
  today: 6,
  ...over,
})

writeFileSync('docs/night.gif', encodeGif(renderCity(city({}), 'night'), W, H))
// The grid samples animate too, at half size and every other frame (still a seamless loop),
// so four of them stay light.
const grid: [string, City, string][] = [
  ['dawn-spring', city({ month: 4, behavior: 'station-stop', growth: 0.3 }), 'dawn'],
  ['day-summer', city({ month: 7, seed: 7, today: 12 }), 'day'],
  ['dusk-autumn', city({ month: 10, seed: 42, behavior: 'shinkansen', growth: 0.8 }), 'dusk'],
  ['night-winter', city({ month: 1, seed: 99, behavior: 'snowed-in', lit: 0.3 }), 'night'],
]
for (const [name, c, time] of grid) {
  const frames = renderCity(c, time).filter((_, i) => i % 2 === 0)
  writeFileSync(`docs/${name}.gif`, encodeGif(frames, W, H, 1, 120))
}
