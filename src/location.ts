// Turns `Jakarta`, `Bandung, Indonesia` or `-6.21,106.85` into coordinates and, for names, an
// IANA timezone, using Open-Meteo's geocoding (free, no key).

export type Place = { latitude: number; longitude: number; timezone?: string; label: string }

type Result = { name: string; latitude: number; longitude: number; timezone?: string; country?: string; country_code?: string; admin1?: string }

/** `lat,lon` as numbers, or undefined when the text isn't coordinates. */
export function parseCoordinates(text: string): Place | undefined {
  const parts = text.split(',').map((s) => s.trim())
  if (parts.length !== 2 || parts.some((s) => s === '' || Number.isNaN(Number(s)))) return undefined
  const [latitude, longitude] = parts.map(Number)
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error(`location "${text}" is not a valid latitude,longitude`)
  return { latitude, longitude, label: `${latitude},${longitude}` }
}

/** The best match for `City` or `City, Region or Country`, the qualifier matching country, code or region. */
export function pickPlace(results: Result[], qualifier?: string): Result | undefined {
  if (!qualifier) return results[0]
  const q = qualifier.toLowerCase()
  return results.find((r) => [r.country, r.country_code, r.admin1].some((v) => v?.toLowerCase() === q))
}

export async function resolveLocation(text: string): Promise<Place | undefined> {
  const coordinates = parseCoordinates(text)
  if (coordinates) return coordinates
  const [name, qualifier] = text.split(',').map((s) => s.trim())
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=en&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Open-Meteo geocoding ${res.status}`)
    const place = pickPlace(((await res.json()) as { results?: Result[] }).results ?? [], qualifier)
    if (!place) throw new Error(`no place called "${text}"`)
    return { latitude: place.latitude, longitude: place.longitude, timezone: place.timezone, label: [place.name, place.admin1, place.country].filter(Boolean).join(', ') }
  } catch (e) {
    console.error(`location unavailable, using defaults: ${e instanceof Error ? e.message : e}`)
    return undefined
  }
}
