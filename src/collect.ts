// Fetches an account snapshot from the GitHub GraphQL API.

import type { Day, Language, Snapshot } from './city.ts'

type CalendarCollection = { contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] } }

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'git-lofi' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (body.errors?.length || !body.data) throw new Error(`GitHub API: ${body.errors?.map((e) => e.message).join('; ') ?? 'no data'}`)
  return body.data
}

/** Days end yesterday (UTC), so a nightly run judges the day that just ended. */
export async function collect(login: string, token: string, today = new Date().toISOString().slice(0, 10)): Promise<Snapshot> {
  // ponytail: languages from the 100 most recently pushed public repos; paginate if that skews results
  const { user } = await graphql<{
    user: {
      databaseId: number
      contributionsCollection: { contributionYears: number[] }
      repositories: { nodes: { primaryLanguage: { name: string; color: string | null } | null }[] }
    }
  }>(
    token,
    `query($login: String!) { user(login: $login) {
      databaseId
      contributionsCollection { contributionYears }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes { primaryLanguage { name color } }
      }
    } }`,
    { login },
  )

  const years = user.contributionsCollection.contributionYears
  const fields = years
    .map((y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { weeks { contributionDays { date contributionCount } } } }`)
    .join('\n')
  const calendars = years.length
    ? (await graphql<{ user: Record<string, CalendarCollection> }>(token, `query($login: String!) { user(login: $login) { ${fields} } }`, { login })).user
    : {}
  const days: Day[] = Object.values(calendars)
    .flatMap((c) => c.contributionCalendar.weeks.flatMap((w) => w.contributionDays))
    .filter((d) => d.date < today)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const languages = new Map<string, Language>()
  for (const { primaryLanguage: l } of user.repositories.nodes) {
    if (!l) continue
    const entry = languages.get(l.name) ?? { name: l.name, color: l.color, repos: 0 }
    entry.repos++
    languages.set(l.name, entry)
  }
  return { id: user.databaseId, languages: [...languages.values()], days }
}
