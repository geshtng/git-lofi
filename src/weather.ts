// Live weather at a place, from Open-Meteo (free, no key). Any failure means clear skies, so a
// flaky network never stops the city from being drawn.

export type LiveWeather = 'clear' | 'rain' | 'storm' | 'snow'

/** WMO weather codes as Open-Meteo reports them, folded into what the scene can draw. */
export function weatherFromCode(code: number): LiveWeather {
  if (code >= 95) return 'storm'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain'
  return 'clear'
}

/** The weather there now, and the place's IANA timezone when Open-Meteo knows it. */
export async function fetchWeather(latitude: number, longitude: number): Promise<{ weather: LiveWeather; timezone?: string }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code&timezone=auto`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    const body = (await res.json()) as { timezone?: string; current?: { weather_code?: number } }
    if (typeof body.current?.weather_code !== 'number') throw new Error('Open-Meteo: no weather_code')
    return { weather: weatherFromCode(body.current.weather_code), timezone: body.timezone }
  } catch (e) {
    console.error(`weather unavailable, drawing clear skies: ${e instanceof Error ? e.message : e}`)
    return { weather: 'clear' }
  }
}
