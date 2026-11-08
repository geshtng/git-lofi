// Turns an account snapshot into the numbers the scene is drawn from. No I/O, no clock.

export type Day = { date: string; count: number }
export type Language = { name: string; color: string | null; repos: number }
export type Snapshot = { id: number; languages: Language[]; days: Day[] }

/** The day's train, chosen from recent activity. */
export type Behavior =
  | 'snowed-in' // 60+ quiet days: snow, no train
  | 'last-train' // 14+ quiet days: rain, one slow late train
  | 'station-stop' // first contribution of the week: the train stops, doors open
  | 'shinkansen' // crossed a milestone, or finished a busy week: two fast passes
  | 'local' // everything else: one local pass

export type City = {
  seed: number
  /** Top language colors with their share of public repos, largest first. */
  languages: { color: string; share: number }[]
  /** 0..1 from total contributions: a village grows into a city. */
  growth: number
  /** 0..1 share of lit windows, from the current weekly streak; fades after it ends. */
  lit: number
  /** 0..1 from the longest weekly streak: snowcap and stars. */
  record: number
  behavior: Behavior
  /** Month of the observation date, 1..12; picks the season. */
  month: number
  /** Contributions on the observation date; fills the train with passengers. */
  today: number
}

const DAY_MS = 86_400_000
const MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000]
const MAX_GROWTH = 100_000
const STREAK_FULL_WEEKS = 13
const FADE_RATE = 0.5
const FADE_WEEKS = 6.5
const RECORD_CURVE_WEEKS = 0.6
const RECORD_FULL_WEEKS = 208

type Week = { monday: number; counts: number[] }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Days must be contiguous and ascending, ending on the observation date. */
export function deriveCity(snapshot: Snapshot): City {
  const counts = snapshot.days.map((d) => d.count)
  const total = sum(counts)
  const weeks = groupWeeks(snapshot.days)
  const active = weeks.map((w) => w.counts.some((c) => c > 0))
  const observedOn = snapshot.days.length ? Date.parse(snapshot.days.at(-1)!.date + 'T00:00:00Z') : 0
  const repos = sum(snapshot.languages.map((l) => l.repos))
  const languages = snapshot.languages
    .toSorted((a, b) => b.repos - a.repos)
    .slice(0, 5)
    .map((l) => ({ color: l.color ?? '#9a9a9a', share: l.repos / repos }))
  if (!languages.length) languages.push({ color: '#ff7eb6', share: 1 })
  return {
    seed: snapshot.id >>> 0,
    languages,
    growth: Math.log2(1 + Math.min(total, MAX_GROWTH) / 50) / Math.log2(1 + MAX_GROWTH / 50),
    lit: 0.15 + 0.85 * streakStrength(weeks, active, observedOn),
    record: Math.min(
      Math.log(1 + longestRun(active) / RECORD_CURVE_WEEKS) / Math.log(1 + RECORD_FULL_WEEKS / RECORD_CURVE_WEEKS),
      1,
    ),
    behavior: selectBehavior(counts, weeks, total),
    month: snapshot.days.length ? Number(snapshot.days.at(-1)!.date.slice(5, 7)) : 1,
    today: counts.at(-1) ?? 0,
  }
}

function groupWeeks(days: Day[]): Week[] {
  const weeks: Week[] = []
  for (const d of days) {
    const t = Date.parse(d.date + 'T00:00:00Z')
    const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY_MS
    if (weeks.at(-1)?.monday !== monday) weeks.push({ monday, counts: [] })
    weeks.at(-1)!.counts.push(d.count)
  }
  return weeks
}

const runEndingAt = (active: boolean[], i: number) => {
  let n = 0
  while (i - n >= 0 && active[i - n]) n++
  return n
}

function longestRun(active: boolean[]) {
  let best = 0
  for (let i = 0; i < active.length; i++) best = Math.max(best, runEndingAt(active, i))
  return best
}

/** Builds over STREAK_FULL_WEEKS; once ended, fades to zero FADE_WEEKS after the end. */
function streakStrength(weeks: Week[], active: boolean[], observedOn: number) {
  const build = (n: number) => Math.min(n / STREAK_FULL_WEEKS, 1)
  let i = active.length - 1
  if (i >= 0 && !active[i]) i-- // the week in progress cannot end a streak
  if (i >= 0 && active[i]) return build(runEndingAt(active, i))
  const last = active.lastIndexOf(true)
  if (last < 0) return 0
  const endedOn = weeks[last].monday + 14 * DAY_MS // Monday after the first idle week completes
  const weeksSince = Math.max(0, observedOn - endedOn) / (7 * DAY_MS)
  const floor = Math.exp(-FADE_RATE * FADE_WEEKS)
  const fade = Math.max(0, (Math.exp(-FADE_RATE * weeksSince) - floor) / (1 - floor))
  return build(runEndingAt(active, last)) * fade
}

function selectBehavior(counts: number[], weeks: Week[], total: number): Behavior {
  const quiet = counts.length - 1 - counts.findLastIndex((c) => c > 0)
  if (quiet >= 60) return 'snowed-in'
  if (quiet >= 14) return 'last-train'
  const week = weeks.at(-1)?.counts ?? []
  if ((week.at(-1) ?? 0) > 0 && week.slice(0, -1).every((c) => c === 0)) return 'station-stop'
  const earlier = total - sum(counts.slice(-7))
  if (MILESTONES.some((m) => earlier < m && m <= total)) return 'shinkansen'
  // A finished week is busy when at most 1 in 10 of the last 52 complete weeks matched it.
  const compared = weeks.slice(0, -1).slice(-52).map((w) => sum(w.counts))
  const weekTotal = sum(week)
  const matched = compared.filter((t) => t >= weekTotal).length
  if (week.length === 7 && compared.length >= 10 && matched * 10 <= compared.length) return 'shinkansen'
  return 'local'
}
