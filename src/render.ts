// Draws the city as RGBA frames: sky, mountain, skyline, town, shops, trains on a bridge, and a
// river that reflects it all. Everything static is drawn once; each frame only adds what moves.
// Deterministic per seed, and every motion completes whole cycles so the GIF loops cleanly.

import type { Behavior, City } from './city.ts'

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

// ponytail: northern-hemisphere seasons; add a hemisphere flag if someone south asks
const seasonOf = (month: number): Season => (month >= 3 && month <= 5 ? 'spring' : month <= 8 && month >= 6 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter')
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

export function renderCity(city: City, time = 'night'): Uint8Array[] {
  const p = PALETTES[time]
  if (!p) throw new Error(`unknown time "${time}", use one of: ${Object.keys(PALETTES).join(', ')}`)
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
  if (p.moon) {
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
      base.glowAt(sx + 25, STREET - 2, 30, mix(WHITE, glow, 0.4), 0.22)
    } else {
      const top = STREET - 20
      base.rect(sx, top, 32, 20, mix(hex('#5a3a28'), near, 0.4))
      base.rect(sx - 3, top - 2, 38, 2, roof)
      base.rect(sx + 8, top + 3, 16, 5, mix(WHITE, glow, 0.4))
      for (let x = sx + 8; x < sx + 24; x += 4) base.rect(x, top + 9, 3, 6, hex('#26305e'))
      base.rect(sx + 8, top + 15, 16, 5, mix(glow, near, 0.3))
      for (const lx of [sx + 1, sx + 28]) {
        base.glowAt(lx + 1, top + 6, 9, lantern, 0.35)
        base.rect(lx, top + 3, 3, 6, lantern)
        base.rect(lx, top + 5, 3, 1, mix(lantern, BLACK, 0.3))
      }
    }
  }

  // Street trees dressed for the season.
  const season: Season = time === 'sakura' ? 'spring' : time === 'snow' ? 'winter' : seasonOf(city.month)
  for (let k = 0; k < 4; k++) {
    const tx = 10 + k * (W / 4) + 88 + int(16)
    base.rect(tx, STREET - 16, 3, 16, ink)
    const crown = TREE[season].map((c) => mix(hex(c), near, 0.35))
    if (!crown.length) {
      for (const [dx, len] of [[-1, 9], [1, 8], [-1, 5], [1, 6]]) for (let i = 0; i < len; i++) base.set(tx + 1 + dx * i * 0.8, STREET - 14 - i - len, ink)
      for (let i = 0; i < 6; i++) base.rect(tx - 6 + int(15), STREET - 30 + int(12), 2, 1, WHITE)
      continue
    }
    for (const [cx, cy, rad] of [[0, -24, 9], [-6, -19, 6], [7, -19, 6]])
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++)
          if (dx * dx + dy * dy <= rad * rad) base.set(tx + 1 + cx + dx, STREET + cy + dy, crown[r() < 0.3 && dy < 0 ? 1 : 0])
  }

  // Street: lamps, vending machines, and utility poles with sagging wires.
  base.rect(0, STREET, W, TRAIN_TOP - STREET, ground)
  for (let x = 30; x < W; x += 84) {
    base.rect(x, 186, 1, STREET - 186, ink)
    base.rect(x - 2, 185, 5, 1, glow)
    base.glowAt(x, 187, 11, glow, 0.25)
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
  for (let x = station; x < station + 120; x += 12) base.glowAt(x, 193, 4, glow, 0.5)
  for (const x of [station, station + 60, station + 119]) base.rect(x, 192, 2, RAIL - 192, ink)
  base.rect(station + 48, 177, 24, 9, hex('#f2f2f2'))
  base.rect(station + 51, 180, 18, 3, livery)
  base.rect(station + 50, 186, 1, 3, ink)
  base.rect(station + 69, 186, 1, 3, ink)
  for (let x = 45; x < W; x += 72) {
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

  const stars = p.stars
    ? Array.from({ length: 30 + Math.round(city.record * 150) }, () => ({ x: int(W), y: int(HORIZON), speed: 1 + int(2), phase: r(), big: r() < 0.08 })).filter((s) =>
        base.is(s.x, s.y, skyAt(s.y)),
      )
    : []
  const shimmer = Array.from({ length: 110 }, () => ({ x: int(W), y: RIVER + 3 + int(H - RIVER - 3), w: 3 + int(6), phase: r() }))
  const weather: Weather = city.behavior === 'snowed-in' ? 'snow' : city.behavior === 'last-train' ? 'rain' : (p.weather ?? SEASON_WEATHER[season])
  const particles = Array.from({ length: weather === 'fireflies' ? 40 : weather === 'petals' || weather === 'leaves' ? 75 : 240 }, () => ({
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
    for (let i = 3; i < 24; i++) for (let y = 216; y <= 221; y++) blend(tip + i, y, headlight, 0.35 * (1 - i / 24))
    rect(0, 218, 1, 2, hex('#ff4040'))
  }

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
        for (let k = 0; k < 8; k++) c.blend(q.x - k * 0.3, y - k, mix(skyBottom, WHITE, 0.5), 0.55)
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
    frames.push(c.buf)
  }
  return frames
}
