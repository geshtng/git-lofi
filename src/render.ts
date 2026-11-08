// Draws the city as RGBA frames: sky, mountain, skyline, town, shops, trains on a bridge, and a
// river that reflects it all. Everything static is drawn once; each frame only adds what moves.
// Deterministic per seed, and every motion completes whole cycles so the GIF loops cleanly.

import type { Behavior, City } from './city.ts'
import type { LiveWeather } from './weather.ts'

export const W = 480
export const H = 270
const HORIZON = 162 // mountain and far skyline base
const STREET = 201 // near buildings base
const WIRE = 204 // overhead line the pantograph touches
const FAR_TRACK = -7 // the far track of the double line sits this much higher
const TRAIN_TOP = 209
const RAIL = 228
const DECK = 229
const RIVER = 237

type RGB = [number, number, number]
type Weather = 'rain' | 'snow' | 'petals' | 'leaves' | 'fireflies'
type Season = 'spring' | 'summer' | 'autumn' | 'winter'
type Palette = {
  sky: [string, string]
  mountain: string
  snow: string
  far: string
  near: string
  roof: string
  ground: string
  glow: string
  stars?: boolean
  moon?: boolean
  weather?: Weather
}

export const PALETTES: Record<string, Palette> = {
  day: { sky: ['#4a90d9', '#bfe3f5'], mountain: '#5b6f9e', snow: '#ffffff', far: '#7d8fb3', near: '#4a5677', roof: '#2f3654', ground: '#3a4058', glow: '#fff2c4' },
  night: { sky: ['#060a1c', '#23305e'], mountain: '#222c52', snow: '#c6d0ee', far: '#141b3a', near: '#0b102b', roof: '#060a1d', ground: '#04071a', glow: '#ffcc66', stars: true, moon: true },
  dusk: { sky: ['#2a1f4f', '#f29e6d'], mountain: '#4d3f6e', snow: '#f3dfe8', far: '#3a2c58', near: '#211836', roof: '#160f26', ground: '#120c1f', glow: '#ffd37a', stars: true },
  dawn: { sky: ['#34426e', '#f6c39f'], mountain: '#5f6c98', snow: '#ffffff', far: '#465180', near: '#28305a', roof: '#1b2246', ground: '#161b38', glow: '#ffe3a3' },
  rain: { sky: ['#161d27', '#3a4757'], mountain: '#344050', snow: '#93a1b2', far: '#222b37', near: '#121821', roof: '#0b1016', ground: '#0a0e13', glow: '#ffbf66', weather: 'rain' },
  snow: { sky: ['#27304c', '#8693b4'], mountain: '#4d5776', snow: '#ffffff', far: '#3a4363', near: '#232a44', roof: '#e6ebfa', ground: '#c9d0e6', glow: '#ffd58a', weather: 'snow' },
  sakura: { sky: ['#33275a', '#f3b2c6'], mountain: '#6c5d92', snow: '#fff0f6', far: '#4b3c72', near: '#2a2148', roof: '#1d1633', ground: '#191230', glow: '#ffe0a8', weather: 'petals' },
}

/** Every loop is the same length; the behavior sets how many trains pass in it. */
export const FRAMES = 240

/** The look for a local hour: dawn 4-5, day 6-15, dusk 16-18, night 19-3. */
export const timeOfDay = (hour: number) => (hour >= 4 && hour < 6 ? 'dawn' : hour >= 6 && hour < 16 ? 'day' : hour >= 16 && hour < 19 ? 'dusk' : 'night')
const PASSES: Record<Behavior, number> = { 'snowed-in': 2, 'last-train': 2, 'station-stop': 2, shinkansen: 6, local: 3 }

/** Meteorological seasons; south of the equator they run six months apart. */
export const seasonOf = (month: number, southern = false): Season => {
  const m = southern ? ((month + 5) % 12) + 1 : month
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}
const SEASON_WEATHER: Record<Season, Weather> = { spring: 'petals', summer: 'fireflies', autumn: 'leaves', winter: 'snow' }
const TREE: Record<Season, string[]> = { spring: ['#f7b6c8', '#ffd3e0'], summer: ['#3f7d4a', '#5a9a52'], autumn: ['#d9622b', '#e8a33d'], winter: [] }
const LEAVES = ['#e0712c', '#c9452b', '#f0a640']
/** Contributions on the day that fill every seat. */
const FULL_TRAIN = 8

/** Konbini sign stripes, top to bottom: green-white-blue, blue-white, orange-green-red. */
const KONBINI: string[][] = [
  ['#0a9a4a', '#ffffff', '#1e64c8'],
  ['#1e5aa8', '#ffffff', '#1e5aa8'],
  ['#f58220', '#00843d', '#e2231a'],
]

const COATS = ['#3a4a6b', '#7a3b3b', '#2f5d50', '#5b4a7a', '#8a6d3b', '#444b55']
const UMBRELLAS = ['#e2231a', '#1e64c8', '#f2c230', '#0a9a4a', '#f1f3f5', '#8e5bd8', '#ff7eb6']
const CAR_COLORS = ['#c0392b', '#2c3e50', '#ecf0f1', '#2e86de', '#7f8c8d', '#16a085', '#8e44ad']

/** Street traffic, drawn facing right in a box `w` wide whose bottom row sits on the road. */
type Sprite = [number, number, (rect: (x: number, y: number, w: number, h: number, c: string) => void, body: string, lamp: string) => void]
const VEHICLES: Record<string, Sprite> = {
  car: [14, 6, (rect, c, lamp) => {
    rect(4, 0, 6, 2, c)
    rect(5, 0, 2, 2, '#bcd3e8')
    rect(8, 0, 2, 2, '#bcd3e8')
    rect(1, 2, 13, 3, c)
    rect(13, 3, 1, 1, lamp)
  }],
  taxi: [14, 7, (rect, c, lamp) => {
    rect(6, 0, 2, 1, '#ffffff')
    rect(4, 1, 6, 2, '#f2c230')
    rect(5, 1, 2, 2, '#bcd3e8')
    rect(8, 1, 2, 2, '#bcd3e8')
    rect(1, 3, 13, 3, '#f2c230')
    rect(13, 4, 1, 1, lamp)
  }],
  kei: [11, 7, (rect, c, lamp) => {
    rect(1, 0, 9, 6, c)
    rect(7, 1, 3, 2, '#bcd3e8')
    rect(2, 1, 4, 2, '#bcd3e8')
    rect(10, 4, 1, 1, lamp)
  }],
  bus: [30, 9, (rect, c, lamp) => {
    rect(0, 0, 30, 8, '#f1f3f5')
    rect(0, 5, 30, 2, '#0a9a4a')
    for (let x = 2; x < 26; x += 4) rect(x, 1, 3, 3, '#bcd3e8')
    rect(27, 1, 3, 3, '#bcd3e8')
    rect(29, 6, 1, 1, lamp)
  }],
  truck: [22, 9, (rect, c, lamp) => {
    rect(0, 0, 15, 8, '#e8e4da')
    rect(2, 2, 10, 2, c)
    rect(16, 2, 6, 6, c)
    rect(18, 3, 3, 2, '#bcd3e8')
    rect(21, 6, 1, 1, lamp)
  }],
  scooter: [9, 8, (rect, c, lamp) => {
    rect(3, 0, 3, 2, c)
    rect(3, 2, 2, 3, '#2a2f3a')
    rect(1, 5, 7, 2, c)
    rect(8, 4, 1, 1, lamp)
  }],
  delivery: [10, 8, (rect, c, lamp) => {
    rect(0, 1, 4, 4, '#e2231a')
    rect(0, 2, 4, 1, '#ffffff')
    rect(4, 0, 3, 2, '#e9c9a8')
    rect(4, 2, 2, 3, '#2a2f3a')
    rect(1, 5, 8, 2, '#d0d0d0')
    rect(9, 4, 1, 1, lamp)
  }],
}

/** Screen blend: brightens what's underneath, so light reads as light over any color. */
const screen = (a: RGB, b: RGB, alpha: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (255 - a[i]) * (b[i] / 255) * alpha)) as RGB

/**
 * A leafy crown as a few overlapping clumps with ragged edges, split into light (upper left),
 * mid and dark (lower right) pixels, with speckles so it reads as foliage, not a ball.
 */
function makeCrown(size: number, r: () => number): [number, number][][] {
  const clumps = [[0, -0.25, 0.75], [-0.55, 0.15, 0.6], [0.6, 0.2, 0.55], [0.15, -0.8, 0.45], [-0.3, -0.65, 0.4]]
  const shades: [number, number][][] = [[], [], []]
  const reach = Math.ceil(size * 1.3)
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const inside = clumps.some(([cx, cy, cr]) => Math.hypot(dx - cx * size, dy - cy * size) <= cr * size * (1 + (r() - 0.5) * 0.3))
      if (!inside || r() < 0.04) continue
      const light = (-dx - dy * 1.2) / size + (r() - 0.5) * 0.9
      shades[light > 0.6 ? 0 : light < -0.5 ? 2 : 1].push([dx, dy])
    }
  return shades
}

const WHITE: RGB = [255, 255, 255]
const BLACK: RGB = [0, 0, 0]
const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB
const wave = (u: number) => 0.5 + 0.5 * Math.sin(2 * Math.PI * u)

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(buf = new Uint8Array(W * H * 4)) {
  const set = (x: number, y: number, c: RGB) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 4
    buf[i] = c[0]
    buf[i + 1] = c[1]
    buf[i + 2] = c[2]
    buf[i + 3] = 255
  }
  const get = (x: number, y: number): RGB => {
    const i = (Math.min(Math.max(Math.round(y), 0), H - 1) * W + Math.min(Math.max(Math.round(x), 0), W - 1)) * 4
    return [buf[i], buf[i + 1], buf[i + 2]]
  }
  const rect = (x: number, y: number, w: number, h: number, c: RGB) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c)
  }
  const blend = (x: number, y: number, c: RGB, a: number) => set(x, y, mix(get(x, y), c, a))
  const glowAt = (x: number, y: number, radius: number, c: RGB, a: number) => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d = Math.hypot(dx, dy)
        if (d <= radius) blend(x + dx, y + dy, c, a * (1 - d / radius))
      }
  }
  const is = (x: number, y: number, c: RGB) => get(x, y).every((v, i) => v === c[i])
  return { buf, set, get, rect, blend, glowAt, is }
}
type Canvas = ReturnType<typeof canvas>

/**
 * `sky.weather` is the live weather where the account lives; `sky.dark` says whether street
 * lights should be on (without it, lights are on for anything but day); `sky.southern` flips
 * the seasons for the southern hemisphere.
 */
export function renderCity(city: City, time = 'night', sky: { weather?: LiveWeather; dark?: boolean; southern?: boolean } = {}): Uint8Array[] {
  if (!PALETTES[time]) throw new Error(`unknown time "${time}", use one of: ${Object.keys(PALETTES).join(', ')}`)
  const live = sky.weather ?? 'clear'
  const wet = live === 'rain' || live === 'storm'
  // Daytime rain turns the whole sky grey; evening rain keeps its colors under a darker veil.
  const look = wet && time === 'day' ? 'rain' : time
  const p = PALETTES[look]
  const dark = sky.dark ?? time !== 'day'
  const r = rng(city.seed)
  const int = (n: number) => (r() * n) | 0
  const [skyTop, skyBottom] = p.sky.map(hex)
  const skyAt = (y: number) => mix(skyTop, skyBottom, Math.min(y / HORIZON, 1))
  const [mountain, snow, far, near, roof, ground, glow] = [p.mountain, p.snow, p.far, p.near, p.roof, p.ground, p.glow].map(hex)
  const ink = mix(near, BLACK, 0.4)
  const deck = mix(near, ground, 0.5)
  const river = mix(skyBottom, ground, 0.65)
  const windowOff = mix(near, skyBottom, 0.2)
  const lantern = hex('#ff4a3a')
  const livery = hex(city.languages[0].color)
  const shareSum = city.languages.reduce((a, l) => a + l.share, 0)
  const pickLanguage = () => {
    let x = r() * shareSum
    for (const l of city.languages) if ((x -= l.share) <= 0) return hex(l.color)
    return livery
  }

  const base = canvas()
  for (let y = 0; y < H; y++) base.rect(0, y, W, 1, skyAt(y))
  if (p.moon && !wet) {
    const mx = 40 + int(400)
    const moon = hex('#f6efcf')
    base.glowAt(mx, 40, 28, moon, 0.18)
    for (let dy = -13; dy <= 13; dy++) for (let dx = -13; dx <= 13; dx++) if (dx * dx + dy * dy <= 170) base.set(mx + dx, 40 + dy, moon)
    for (const [dx, dy, s] of [[-5, -3, 3], [3, 4, 4], [-2, 7, 2], [6, -5, 2]]) base.rect(mx + dx, 40 + dy, s, s - 1, hex('#e2d9b4'))
  }

  // The mountain: a Fuji silhouette, lit on the left, whose snowcap grows with the longest streak.
  const peak = 100 + int(280)
  const summit = 45
  const snowLine = summit + 9 + Math.round(city.record * 40)
  for (let y = summit; y < HORIZON; y++) {
    // Concave slopes, steep at the flat crater and flaring at the base, with uneven ridges.
    const d = y - summit
    const half = 16 + d + 0.008 * d * d
    const rough = Math.min(d / 50, 1) // edges smooth near the crater, rougher toward the base
    const left = Math.round(peak - half + rough * (Math.sin(d * 0.21) * 1.5 + Math.sin(d * 0.07) * 3))
    const right = Math.round(peak + half + rough * (Math.sin(d * 0.17 + 2) * 1.5 + Math.sin(d * 0.05 + 1) * 3))
    for (let x = left; x <= right; x++) {
      if (d === 0 && Math.abs(x - peak) % 9 < 2) continue // notches in the crater rim
      const streak = Math.max(0, Math.sin(x * 0.31) * Math.sin(x * 0.13)) * 8
      const capped = y < snowLine + Math.round(Math.sin(x * 0.6) * 2 + Math.sin(x * 0.23) * 2 + streak)
      const shaded = x > peak + 4 + d * 0.15
      base.set(x, y, mix(capped ? snow : mountain, capped ? mountain : BLACK, shaded ? 0.25 : 0))
    }
  }
  // Long thin clouds veil the mountain.
  for (let k = 0; k < 5; k++) {
    const cx = int(W)
    const cy = 60 + int(75)
    const len = 60 + int(90)
    for (let row = 0; row < 6; row++) {
      const inset = Math.abs(row - 2.5) * 10
      for (let x = cx - len / 2 + inset; x < cx + len / 2 - inset; x++) base.blend(x, cy + row, mix(skyBottom, WHITE, 0.5), 0.2)
    }
  }
  const hill = mix(mountain, far, 0.5)
  const hillPhase = r() * 6
  for (let x = 0; x < W; x++) {
    const top = Math.round(147 + Math.sin(x / 42 + hillPhase) * 8 + Math.sin(x / 13) * 3)
    base.rect(x, top, 1, HORIZON - top, hill)
  }

  // Far skyline, filled down to the street so the near town stands in front of it.
  for (let x = 0; x < W; ) {
    const w = 9 + int(19)
    const h = 9 + int(15 + 48 * city.growth)
    base.rect(x, HORIZON - h, w, STREET - HORIZON + h, far)
    for (let k = 0; k < (w * h) / 40; k++) if (r() < city.lit) base.rect(x + 2 + int(w - 4), HORIZON - h + 3 + int(h), 2, 1, mix(far, glow, 0.5))
    x += w
  }

  // Near town: tiled-roof houses grow into towers with neon signs as contributions add up.
  const flickers: { x: number; y: number; w: number; h: number; phase: number }[] = []
  const signs: { x: number; y: number; h: number; c: RGB; phase: number }[] = []
  const beacons: { x: number; y: number }[] = []
  const window = (x: number, y: number, w: number, h: number) => {
    const lit = r() < city.lit
    base.rect(x, y, w, h, lit ? (r() < 0.2 ? mix(pickLanguage(), WHITE, 0.3) : glow) : windowOff)
    if (lit && r() < 0.05) flickers.push({ x, y, w, h, phase: r() })
    return lit
  }
  const perches: { x: number; y: number; h: number }[] = []
  for (let x = -int(15); x < W; ) {
    const tower = r() < 0.15 + city.growth * 0.85
    const w = tower ? 24 + int(30) : 22 + int(17)
    const h = tower ? 42 + int(24 + 108 * city.growth) : 21 + int(11)
    const top = STREET - h
    base.rect(x, top, w, h, near)
    perches.push(tower ? { x: x + w - 10, y: top, h } : { x: x + (w >> 1) - 2, y: top - 7, h })
    if (tower) {
      base.rect(x, top, w, 2, mix(near, glow, 0.12))
      base.rect(x + w - 3, top + 2, 3, h - 2, mix(near, BLACK, 0.25))
      for (let wy = top + 6; wy < STREET - 6; wy += 6) for (let wx = x + 4; wx + 4 <= x + w - 4; wx += 7) window(wx, wy, 4, 3)
      if (r() < 0.45) signs.push({ x: x - 5, y: top + 9, h: 18 + int(19), c: mix(pickLanguage(), WHITE, 0.25), phase: r() })
      if (r() < 0.3) {
        base.rect(x + 4, top - 8, 11, 6, near)
        base.rect(x + 5, top - 2, 1, 2, near)
        base.rect(x + 13, top - 2, 1, 2, near)
      }
      if (h > 90) {
        base.rect(x + (w >> 1), top - 10, 1, 10, near)
        beacons.push({ x: x + (w >> 1), y: top - 11 })
      }
    } else {
      for (let k = 0; k < 7; k++) {
        const inset = k < 2 ? -4 + k : (k - 2) * 2
        base.rect(x + inset, top - 1 - k, w - 2 * inset, 1, k === 0 ? mix(roof, glow, 0.1) : roof)
      }
      for (const wx of w > 30 ? [x + 4, x + w - 12] : [x + (w >> 1) - 4]) {
        if (window(wx, top + 7, 8, 6)) {
          base.rect(wx + 4, top + 7, 1, 6, mix(glow, near, 0.4))
          base.rect(wx, top + 10, 8, 1, mix(glow, near, 0.4))
        }
      }
    }
    x += w + int(3 + (1 - city.growth) * 30)
  }

  // Shops on the street: konbini with striped signs and bright glass fronts, ramen stands with lanterns.
  const konbini: number[] = []
  const stalls: { x: number; y: number }[] = []
  for (let k = 0; k < 4; k++) {
    const sx = 10 + Math.round((k + r() * 0.5) * (W / 4))
    if (k % 2 === 0) {
      const stripes = KONBINI[int(KONBINI.length)].map(hex)
      const top = STREET - 26
      base.rect(sx, top, 50, 26, mix(WHITE, near, 0.3))
      stripes.forEach((c, i) => base.rect(sx, top + i * 2, 50, 2, c))
      base.rect(sx + 2, top + 8, 46, 18, mix(WHITE, glow, 0.25))
      for (let y = top + 12; y < STREET; y += 4) base.rect(sx + 2, y, 46, 1, mix(WHITE, near, 0.35))
      for (let x = sx + 2; x < sx + 50; x += 12) base.rect(x, top + 8, 1, 18, mix(WHITE, near, 0.5))
      if (dark) base.glowAt(sx + 25, STREET - 2, 30, mix(WHITE, glow, 0.4), 0.22)
      konbini.push(sx + 25)
    } else {
      const top = STREET - 20
      base.rect(sx, top, 32, 20, mix(hex('#5a3a28'), near, 0.4))
      base.rect(sx - 3, top - 2, 38, 2, roof)
      base.rect(sx + 8, top + 3, 16, 5, mix(WHITE, glow, 0.4))
      for (let x = sx + 8; x < sx + 24; x += 4) base.rect(x, top + 9, 3, 6, hex('#26305e'))
      base.rect(sx + 8, top + 15, 16, 5, mix(glow, near, 0.3))
      const paper = dark ? lantern : mix(lantern, near, 0.3)
      stalls.push({ x: sx + 16, y: top - 3 })
      for (const lx of [sx + 1, sx + 28]) {
        if (dark) base.glowAt(lx + 1, top + 6, 9, lantern, 0.35)
        base.rect(lx, top + 3, 3, 6, paper)
        base.rect(lx, top + 5, 3, 1, mix(paper, BLACK, 0.3))
      }
    }
  }

  // Street trees dressed for the season.
  const season: Season = time === 'sakura' ? 'spring' : time === 'snow' ? 'winter' : seasonOf(city.month, sky.southern)
  const leaves = TREE[season].length ? [mix(hex(TREE[season][1]), near, 0.2), mix(hex(TREE[season][0]), near, 0.3), mix(hex(TREE[season][0]), near, 0.55)] : []
  const trees: { x: number; y: number; size: number; crown: [number, number][][]; phase: number }[] = []
  for (let k = 0; k < 4; k++) {
    const tx = 10 + k * (W / 4) + 88 + int(16)
    base.rect(tx, STREET - 16, 3, 16, ink)
    if (!leaves.length) {
      for (const [dx, len] of [[-1, 9], [1, 8], [-1, 5], [1, 6]]) for (let i = 0; i < len; i++) base.set(tx + 1 + dx * i * 0.8, STREET - 14 - i - len, ink)
      for (let i = 0; i < 6; i++) base.rect(tx - 6 + int(15), STREET - 30 + int(12), 2, 1, WHITE)
      continue
    }
    trees.push({ x: tx + 1, y: STREET - 20, size: 10, crown: makeCrown(10, r), phase: r() })
  }

  // Street: lamps, vending machines, and utility poles with sagging wires.
  base.rect(0, STREET, W, TRAIN_TOP - STREET, ground)
  for (let x = 0; x < W; x += 12) base.rect(x, STREET + 5, 6, 1, mix(ground, glow, 0.12))
  const fronts: [number, number, number, number, RGB][] = []
  for (let x = 30; x < W; x += 84) {
    base.rect(x, 186, 1, STREET - 186, ink)
    base.rect(x - 2, 185, 5, 1, dark ? glow : mix(ink, WHITE, 0.3))
    if (dark) base.glowAt(x, 187, 11, glow, 0.25)
  }
  for (let k = 0; k < 3; k++) {
    const vx = 15 + int(W - 30)
    base.rect(vx, 189, 7, 12, mix(WHITE, near, 0.2))
    base.rect(vx + 1, 190, 5, 5, hex('#7fd3ff'))
    base.glowAt(vx + 3, 194, 9, hex('#7fd3ff'), 0.15)
  }
  const poles: number[] = []
  for (let x = int(60); x < W + 105; x += 105) poles.push(x)
  for (const x of poles) {
    base.rect(x, 156, 3, STREET - 156, ink)
    base.rect(x - 6, 160, 15, 1, ink)
  }
  for (let i = 0; i + 1 < poles.length; i++)
    for (const [wy, sag] of [[160, 9], [165, 7]])
      for (let x = poles[i]; x < poles[i + 1]; x++) {
        const u = (x - poles[i]) / (poles[i + 1] - poles[i])
        base.set(x, wy + sag * 4 * u * (1 - u), ink)
      }

  // The station, the overhead line, and the rail bridge.
  const station = 165 + int(135)
  base.rect(0, TRAIN_TOP, W, RAIL - TRAIN_TOP, river)
  base.rect(station - 6, 189, 132, 3, roof)
  for (let x = station; x < station + 120; x += 12) {
    if (dark) base.glowAt(x, 193, 4, glow, 0.5)
    else base.rect(x - 1, 192, 2, 1, mix(roof, WHITE, 0.3))
  }
  for (const x of [station, station + 60, station + 119]) {
    base.rect(x, 192, 2, RAIL - 192, ink)
    fronts.push([x, STREET, 2, TRAIN_TOP - STREET, ink])
  }
  base.rect(station + 48, 177, 24, 9, hex('#f2f2f2'))
  base.rect(station + 51, 180, 18, 3, livery)
  base.rect(station + 50, 186, 1, 3, ink)
  base.rect(station + 69, 186, 1, 3, ink)
  for (let x = 45; x < W; x += 72) {
    fronts.push([x, STREET, 3, TRAIN_TOP - STREET, deck])
    base.rect(x, WIRE + FAR_TRACK - 2, 3, RAIL - WIRE - FAR_TRACK + 2, deck)
    base.rect(x - 5, WIRE + FAR_TRACK - 2, 13, 1, deck)
    base.rect(x - 5, WIRE - 2, 13, 1, deck)
  }
  for (const dy of [FAR_TRACK, 0]) {
    base.rect(0, WIRE + dy, W, 1, mix(deck, WHITE, 0.15))
    base.rect(0, RAIL + dy, W, 1, mix(deck, WHITE, dy ? 0.18 : 0.3))
  }
  for (let y = DECK; y < RIVER; y++)
    for (let x = 0; x < W; x++) {
      const row = (y - DECK) * 2
      const truss = x % 16 === row || 16 - (x % 16) === row
      base.set(x, y, y === DECK ? mix(deck, WHITE, 0.2) : truss ? mix(deck, WHITE, 0.1) : deck)
    }
  base.rect(station - 6, DECK, 132, 3, mix(deck, glow, 0.3))
  base.rect(0, RIVER, W, H - RIVER, river)

  const stars = p.stars && !wet
    ? Array.from({ length: 30 + Math.round(city.record * 150) }, () => ({ x: int(W), y: int(HORIZON), speed: 1 + int(2), phase: r(), big: r() < 0.08 })).filter((s) =>
        base.is(s.x, s.y, skyAt(s.y)),
      )
    : []
  const shimmer = Array.from({ length: 110 }, () => ({ x: int(W), y: RIVER + 3 + int(H - RIVER - 3), w: 3 + int(6), phase: r() }))
  const weather: Weather =
    city.behavior === 'snowed-in' ? 'snow'
    : city.behavior === 'last-train' || wet ? 'rain'
    : live === 'snow' ? 'snow'
    : (p.weather ?? SEASON_WEATHER[season])
  // ponytail: 140 short solid raindrops keep a rainy GIF near 3 MB; more drops look denser but every one changes pixels in every frame
  const particles = Array.from({ length: weather === 'fireflies' ? 40 : weather === 'petals' || weather === 'leaves' ? 75 : weather === 'rain' ? 140 : 240 }, () => ({
    x: r() * W,
    y: weather === 'fireflies' ? 175 + r() * 60 : r() * H,
    phase: r(),
    laps: 1 + int(2),
  }))
  // A cat on the tallest roof against the sky, blinking and swishing its tail.
  const cat = perches.filter((q) => q.x >= 2 && q.x <= W - 12).sort((a, b) => b.h - a.h)[0]
  const catInk = mix(near, BLACK, 0.6)
  const catPhase = r()
  const full = Math.min(city.today / FULL_TRAIN, 1)
  const seat = (n: number) => (Math.imul(n ^ city.seed, 2654435761) >>> 0) / 4294967296

  const raining = weather === 'rain'
  const span = W + 80
  const kinds = ['car', 'car', 'car', 'taxi', 'kei', 'bus', 'truck', 'scooter']
  // Each vehicle crosses a whole number of times per loop, so the GIF restarts seamlessly.
  // ponytail: 6 vehicles keep rainy GIFs near 3 MB; every moving thing costs pixels in every frame
  const traffic = Array.from({ length: 6 }, () => {
    const kind = kinds[int(kinds.length)]
    return { kind, x: r() * span, dir: r() < 0.5 ? 1 : -1, laps: kind === 'bus' || kind === 'truck' ? 1 : 1 + int(2), color: CAR_COLORS[int(CAR_COLORS.length)] }
  })
  // Walkers come in steady streams that move exactly one gap per loop: at the restart everyone
  // stands where the person ahead stood, so nobody jumps.
  const crowds = Array.from({ length: 4 }, (_, g) => {
    const gap = 110 + int(60)
    return { dir: g % 2 ? -1 : 1, gap, count: Math.ceil((W + 20) / gap) + 1, offset: r() * gap, coat: hex(COATS[int(COATS.length)]), umbrella: hex(UMBRELLAS[int(UMBRELLAS.length)]), step: int(2) }
  })
  const puddles = Array.from({ length: 6 }, () => ({ x: int(W), w: 10 + int(12), phase: r() }))
  const flocks = Array.from({ length: 2 }, () => ({
    x: r() * (W + 60),
    y: 30 + int(70),
    birds: Array.from({ length: 3 + int(3) }, (_, k) => ({ dx: -k * 7 + int(3), dy: Math.abs(k - 2) * 3 + int(2), flap: int(2) })),
  }))
  const plane = { x: r() * (W + 60), y: 22 + int(30) }
  const [shopA, shopB] = [...konbini].sort((a, b) => a - b)

  const drawVehicle = (c: Canvas, kind: string, body: string, dir: number, x: number, y: number) => {
    const [w, h, draw] = VEHICLES[kind]
    const shade = (col: RGB) => (dark ? mix(col, near, 0.25) : col)
    const rect = (dx: number, dy: number, rw: number, rh: number, col: string) =>
      c.rect(Math.round(dir > 0 ? x + dx : x + w - dx - rw), y - h + dy, rw, rh, col === lamp ? hex(col) : shade(hex(col)))
    const lamp = dark ? '#fff4c2' : '#d8d2b8'
    for (let i = 1; i < w - 1; i++) c.blend(Math.round(x) + i, y, BLACK, 0.35)
    draw(rect, body, lamp)
    if (!['scooter', 'delivery'].includes(kind)) {
      rect(2, h - 1, 3, 1, '#14141c')
      rect(w - 5, h - 1, 3, 1, '#14141c')
      rect(0, h - 3, 1, 1, '#ff4040')
    }
    if (dark) for (let i = 0; i < 12; i++) for (const yy of [y - 3, y - 2]) {
      const xx = Math.round(dir > 0 ? x + w + i : x - 1 - i)
      c.set(xx, yy, screen(c.get(xx, yy), hex('#fff4c2'), 0.3 * (1 - i / 12)))
    }
  }
  const drawWalker = (c: Canvas, crowd: (typeof crowds)[number], x: number, y: number, stride: number) => {
    const shade = (col: RGB) => (dark ? mix(col, near, 0.35) : col)
    const px = Math.round(x)
    c.rect(px + 1, y - 7, 2, 2, shade(hex('#e9c9a8')))
    c.rect(px, y - 5, 4, 3, shade(crowd.coat))
    c.rect(px + (stride ? 0 : 1), y - 2, 1, 2, shade(hex('#1a1a20')))
    c.rect(px + (stride ? 3 : 2), y - 2, 1, 2, shade(hex('#1a1a20')))
    if (raining) {
      c.rect(px - 1, y - 10, 6, 1, shade(crowd.umbrella))
      c.rect(px - 2, y - 9, 8, 1, shade(crowd.umbrella))
      c.rect(px + 2, y - 8, 1, 2, shade(hex('#2a2f3a')))
    }
  }

  // The train, drawn in its own coordinates from tail (0) to head (length), facing either way.
  const local = city.behavior !== 'shinkansen'
  const cars = local ? 3 : 4
  const carW = local ? 66 : 75
  const nose = local ? 0 : 36
  const length = cars * (carW + 3) + nose
  const stopX = station + 60 - (length >> 1)
  const passes = PASSES[city.behavior]
  const headlight = hex('#fff4c2')
  const wheel = hex('#14141c')
  // Rightbound trains run on the near track; leftbound ones on the far track, higher and dimmer.
  const drawTrain = (c: Canvas, t: number, reverse: boolean) => {
    // Phase-shifted so the first frame, which some viewers show alone, has a train in it.
    const u = (passes * t + (reverse ? 0.8 : 0.5)) % 1
    const dy = reverse ? FAR_TRACK : 0
    const tint = (col: RGB) => (reverse ? mix(col, far, 0.3) : col)
    const [from, to] = reverse ? [W, -length] : [-length, W]
    const x =
      city.behavior === 'station-stop'
        ? u < 0.4
          ? from + (stopX - from) * (1 - (1 - u / 0.4) ** 2)
          : u < 0.7
            ? stopX
            : stopX + (to - stopX) * ((u - 0.7) / 0.3) ** 2
        : from + (to - from) * u
    const at = (ox: number, w = 1) => Math.round(reverse ? x + length - ox - w : x + ox)
    const rect = (ox: number, y: number, w: number, h: number, col: RGB) => c.rect(at(ox, w), y + dy, w, h, tint(col))
    const set = (ox: number, y: number, col: RGB) => c.set(at(ox), y + dy, tint(col))
    const blend = (ox: number, y: number, col: RGB, a: number) => c.blend(at(ox), y + dy, tint(col), a)

    const body = hex(local ? '#d9d4c5' : '#eef0f2')
    const skirt = mix(body, BLACK, 0.45)
    const dim = city.behavior === 'snowed-in' || city.behavior === 'last-train'
    const lights = mix(dim ? mix(glow, body, 0.45) : glow, body, 0.35 * (1 - full))
    const passenger = mix(near, lights, 0.25)
    const doorsOpen = city.behavior === 'station-stop' && u >= 0.4 && u < 0.7
    const bodyTop = local ? 212 : 214
    for (let k = 0; k < cars; k++) {
      const cx = k * (carW + 3)
      if (local) {
        rect(cx + 3, TRAIN_TOP, carW - 6, 1, mix(body, BLACK, 0.3))
        rect(cx, TRAIN_TOP + 1, carW, 2, mix(body, BLACK, 0.2))
      }
      rect(cx, bodyTop, carW, RAIL - 2 - bodyTop, body)
      rect(cx, RAIL - 2, carW, 1, skirt)
      for (let wx = cx + 4, i = 0; wx + 6 <= cx + carW - 4; wx += local ? 10 : 6, i++) {
        rect(wx, bodyTop + 2, local ? 6 : 3, local ? 5 : 3, lights)
        if (seat(k * 64 + i + (reverse ? 1000 : 0)) >= full) continue
        if (local) {
          rect(wx + 2, bodyTop + 3, 2, 2, passenger)
          rect(wx + 1, bodyTop + 5, 4, 2, passenger)
        } else {
          set(wx + 1, bodyTop + 3, passenger)
          rect(wx, bodyTop + 4, 3, 1, passenger)
        }
      }
      const doors = local ? [cx + 15, cx + carW - 23] : [cx + 6]
      for (const dx of doors) {
        rect(dx, bodyTop + 1, 8, RAIL - 3 - bodyTop, mix(body, BLACK, 0.12))
        rect(dx + 2, bodyTop + 2, 4, 4, lights)
      }
      rect(cx, 221, carW, 2, livery)
      rect(cx, 223, carW, 1, mix(livery, WHITE, 0.5))
      if (doorsOpen) for (const dx of doors) rect(dx, bodyTop + 1, 8, RAIL - 3 - bodyTop, mix(glow, WHITE, 0.5))
      if (k + 1 < cars) rect(cx + carW, bodyTop + 3, 3, 9, skirt)
      for (const bx of [cx + 6, cx + carW - 20]) {
        rect(bx, RAIL - 1, 14, 1, wheel)
        for (const wx of [bx + 2, bx + 9]) rect(wx, RAIL - 1, 3, 2, mix(wheel, WHITE, 0.15))
      }
    }
    if (local) {
      // Pantograph on the middle car, reaching up to the overhead line.
      const px = carW + 3 + (carW >> 1)
      rect(px - 6, WIRE + 1, 13, 1, ink)
      for (const [dx, y] of [[-3, 206], [3, 206], [-2, 207], [2, 207], [-1, 208], [1, 208]]) set(px + dx, y, ink)
    }
    const front = cars * (carW + 3) - 3
    for (let i = 0; i < nose; i++) {
      const s = i / (nose - 1)
      const top = bodyTop + Math.round(s * s * 10)
      rect(front + i, top, 1, RAIL - 2 - top, body)
      if (top <= 221) rect(front + i, 221, 1, 2, livery)
      if (top <= 216 && i > 3 && i < 15) rect(front + i, 216, 1, 2, mix(skyTop, body, 0.2))
      if (s < 0.9) set(front + i, RAIL - 2, skirt)
    }
    const tip = front + Math.max(nose - 4, 0)
    rect(tip, 218, 3, 2, headlight)
    rect(0, 218, 1, 2, hex('#ff4040'))
    if (dark) {
      // A tapered headlight cone fading ahead, a streak on the rail, and a soft red tail glow.
      // Light keeps its own color (no far-track tint), and the far train's is dimmer.
      const strength = reverse ? 0.55 : 1
      const lite = (ox: number, y: number, col: RGB, a: number) => {
        const X = at(ox)
        c.set(X, y + dy, screen(c.get(X, y + dy), col, a * strength))
      }
      for (let i = 1; i < 60; i++) {
        const half = 0.5 + i * 0.06
        for (let y = Math.round(219 - half); y <= Math.round(219 + half * 0.5); y++) lite(tip + 2 + i, y, headlight, 0.45 * (1 - i / 60) ** 1.6)
      }
      for (let i = 0; i < 45; i++) lite(tip + 2 + i, RAIL, headlight, 0.5 * (1 - i / 45))
      for (let ddy = -3; ddy <= 3; ddy++)
        for (let ddx = -6; ddx <= 0; ddx++) {
          const d = Math.hypot(ddx, ddy)
          if (d <= 6) lite(ddx, 219 + ddy, hex('#ff4040'), 0.45 * (1 - d / 6))
        }
    }
  }

  if (wet && look !== 'rain') {
    const veil = hex('#1a2030')
    for (let i = 0; i < base.buf.length; i += 4) {
      const [r0, g0, b0] = mix([base.buf[i], base.buf[i + 1], base.buf[i + 2]], veil, 0.25)
      base.buf[i] = r0
      base.buf[i + 1] = g0
      base.buf[i + 2] = b0
    }
  }

  const rainColor = mix(mix(skyBottom, WHITE, 0.45), skyTop, 0.2)
  const frames: Uint8Array[] = []
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FRAMES
    const c = canvas(base.buf.slice())
    for (const s of stars) {
      const tw = mix(skyAt(s.y), WHITE, 0.3 + 0.7 * wave(t * s.speed * 2 + s.phase))
      c.set(s.x, s.y, tw)
      if (s.big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.blend(s.x + dx, s.y + dy, tw, 0.5)
    }
    for (const w of flickers) if ((t * 4 + w.phase) % 1 < 0.06) c.rect(w.x, w.y, w.w, w.h, windowOff)
    for (const s of signs) {
      const off = (t * 5 + s.phase) % 1 < 0.04
      for (let y = 0; y < s.h; y++) if (y % 6 !== 5) c.rect(s.x, s.y + y, 5, 1, off ? near : s.c)
      if (!off) c.glowAt(s.x + 2, s.y + (s.h >> 1), 8, s.c, 0.15)
    }
    for (const b of beacons) if ((t * 8) % 1 < 0.5) c.glowAt(b.x, b.y, 3, hex('#ff3b3b'), 1)
    if (cat) {
      const { x, y } = cat
      c.set(x, y - 8, catInk)
      c.set(x + 4, y - 8, catInk)
      c.rect(x, y - 7, 5, 3, catInk)
      c.rect(x + 1, y - 4, 3, 1, catInk)
      c.rect(x - 1, y - 3, 7, 3, catInk)
      if ((t * 3 + catPhase) % 1 > 0.04) for (const ex of [x + 1, x + 3]) c.set(ex, y - 6, hex('#c8f56a'))
      const swish = Math.round(Math.sin(2 * Math.PI * (t * 4 + catPhase)))
      for (const [dx, dy] of [[6, -1], [7, -2], [7 + swish, -3], [7 + swish * 2, -4]]) c.set(x + dx, y + dy, catInk)
    }

    // Birds glide across by day; at night a plane blinks its way over.
    if (!wet && !p.stars) {
      for (const flock of flocks) {
        const fx = ((flock.x + (W + 60) * t) % (W + 60)) - 30
        for (const b of flock.birds) {
          const up = (Math.floor(t * 48) + b.flap) % 2 === 0
          const bx = Math.round(fx + b.dx)
          const by = flock.y + b.dy
          for (const [dx, lift] of [[-1, 1], [0, 0], [1, 1]]) c.set(bx + dx, by - (up ? lift : 0), mix(near, BLACK, 0.3))
        }
      }
    } else if (!wet) {
      const x = Math.round(((plane.x + (W + 60) * t) % (W + 60)) - 30)
      c.rect(x, plane.y, 5, 1, mix(skyTop, WHITE, 0.35))
      c.rect(x + 2, plane.y - 1, 1, 3, mix(skyTop, WHITE, 0.35))
      if (Math.floor(t * 20) % 2) c.set(x + 4, plane.y, hex('#ff3b3b'))
    }

    // Street trees sway in gusts, the tops further than the bottoms.
    for (const tree of trees) {
      const gust = 0.9 + 0.6 * Math.sin(2 * Math.PI * (t * 2 + tree.phase)) + 0.3 * Math.sin(2 * Math.PI * (t * 5 + tree.phase * 2))
      tree.crown.forEach((pixels, shade) => {
        for (const [dx, dy] of pixels) {
          const lean = Math.round(-gust * 3.5 * Math.max(0, (tree.size - dy) / (2 * tree.size)) ** 1.3)
          c.set(tree.x + dx + lean, tree.y + dy, leaves[shade])
        }
      })
    }

    // Steam rising from the ramen stalls, thicker in winter.
    for (const st of stalls)
      for (let k = 0; k < 4; k++) {
        const rise = ((t * 3 + k / 4) % 1) * 14
        c.blend(st.x + Math.round(Math.sin(2 * Math.PI * (t * 2 + k / 4)) * 2), Math.round(st.y - rise), hex('#e8e8f0'), (season === 'winter' ? 0.6 : 0.35) * (1 - rise / 14))
      }

    // Puddles on a wet street, catching the sky by day and the lamps by night.
    if (raining)
      for (const pd of puddles) {
        c.rect(pd.x, STREET + 6, pd.w, 1, mix(ground, dark ? glow : skyBottom, 0.3))
        c.rect(pd.x + 2, STREET + 7, pd.w - 4, 1, mix(ground, dark ? glow : skyBottom, 0.3))
        c.set(pd.x + Math.round(wave(t * 3 + pd.phase) * (pd.w - 2)), STREET + 6, mix(ground, WHITE, 0.45))
      }

    // People on the pavement, under umbrellas when it rains.
    for (const crowd of crowds)
      for (let i = 0; i < crowd.count; i++) {
        const loop = crowd.count * crowd.gap
        const x = ((((crowd.offset + i * crowd.gap + crowd.dir * crowd.gap * t) % loop) + loop) % loop) - 10
        if (x < W + 10) drawWalker(c, crowd, x, STREET + 1, (Math.floor(t * 24) + crowd.step + i) % 2)
      }

    // Traffic in two lanes: oncoming further back, the near lane in front.
    for (const v of traffic) {
      const x = ((((v.x + v.dir * v.laps * span * t) % span) + span) % span) - 40
      drawVehicle(c, v.kind, v.color, v.dir, x, v.dir > 0 ? STREET + 8 : STREET + 4)
    }
    // A delivery scooter rides in, stops at each konbini, and rides off within every loop.
    if (shopA !== undefined) {
      const stopsAt: [number, number][] = [[0, -30], [0.22, shopA], [0.38, shopA], [0.6, shopB ?? shopA], [0.76, shopB ?? shopA], [1, W + 30]]
      const i = stopsAt.findIndex(([at], k) => k > 0 && t <= at)
      const [t0, x0] = stopsAt[i - 1]
      const [t1, x1] = stopsAt[i]
      drawVehicle(c, 'delivery', '#e2231a', 1, x0 + (x1 - x0) * ((t - t0) / (t1 - t0)) - 5, STREET + 4)
    }
    for (const [x, y, w, h, col] of fronts) c.rect(x, y, w, h, col)

    drawTrain(c, t, true)
    drawTrain(c, t, false)

    // The river mirrors everything just above it, rippling.
    for (let y = RIVER; y < H; y++) {
      const d = y - RIVER
      const xo = Math.round(Math.sin(2 * Math.PI * (t * 4 + d / 9)) * (1 + d / 10))
      const fade = Math.min(0.5 + d * 0.014, 0.9)
      for (let x = 0; x < W; x++) c.set(x, y, mix(c.get(x + xo, RIVER - 1 - d), river, fade))
    }
    for (const s of shimmer) if (wave(t * 4 + s.phase) > 0.7) c.rect(s.x, s.y, s.w, 1, mix(river, glow, 0.35))
    for (let x = 24; x < W; x += 120) c.rect(x, DECK + 8, 12, H - DECK - 8, mix(deck, BLACK, 0.2))

    for (const q of particles) {
      const y = (q.y + t * H * (weather === 'rain' ? q.laps * 3 + 6 : q.laps * 2)) % H
      if (weather === 'rain') {
        for (let k = 0; k < 5; k++) c.set(q.x - k * 0.3, y - k, rainColor)
      } else if (weather === 'snow') {
        const x = q.x + Math.sin(2 * Math.PI * (2 * t + q.phase)) * 4
        if (q.laps > 1) c.rect(x, y, 2, 2, WHITE)
        else c.set(x, y, mix(WHITE, skyAt(y), 0.4))
      } else if (weather === 'fireflies') {
        const x = q.x + Math.sin(2 * Math.PI * (2 * t + q.phase)) * 8
        if (wave(4 * t + q.phase) > 0.55) c.glowAt(x, q.y + Math.cos(2 * Math.PI * (3 * t + q.phase)) * 5, 2, hex('#d8ff6a'), 0.9)
      } else {
        const x = ((q.x + t * W * 2) % W) + Math.sin(2 * Math.PI * (4 * t + q.phase)) * 4
        const [a, b] = weather === 'leaves' ? [hex(LEAVES[q.laps]), hex(LEAVES[0])] : [hex('#ffb7c9'), hex('#ff9fb8')]
        c.rect(x, y, 3, 2, a)
        c.set(x + (q.laps > 1 ? 3 : -1), y + 1, b)
      }
    }
    if (live === 'storm' && ((t >= 0.6 && t < 0.608) || (t >= 0.63 && t < 0.635))) {
      for (let i = 0; i < c.buf.length; i += 4) {
        const [r0, g0, b0] = mix([c.buf[i], c.buf[i + 1], c.buf[i + 2]], WHITE, 0.35)
        c.buf[i] = r0
        c.buf[i + 1] = g0
        c.buf[i + 2] = b0
      }
    }
    frames.push(c.buf)
  }
  return frames
}
