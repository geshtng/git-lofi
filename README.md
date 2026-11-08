# git-lofi

A lofi Japanese city drawn from a GitHub account's public activity: a mountain,
a town that grows into a city, and a train on a bridge over the river. A scheduled
workflow puts it on a profile README as a looping GIF.

Inspired by [git-koi](https://github.com/yalongwastaken/git-koi) by Anthony Yalong.

<p align="center">
  <img src="docs/night.gif" width="960" alt="An animated lofi city at night: trains cross a bridge under Mount Fuji, lights reflected in the river" />
</p>

| | |
| --- | --- |
| <img src="docs/dawn-spring.gif" alt="Spring dawn, sakura petals, a train stopping at the station" /> | <img src="docs/day-summer.gif" alt="Summer day, green trees, a full train" /> |
| Spring dawn: sakura, a station stop | Summer day: green trees, fireflies, a full train |
| <img src="docs/dusk-autumn.gif" alt="Autumn dusk, maples, a shinkansen passing a grown city" /> | <img src="docs/night-winter.gif" alt="Winter night, snow, dim windows after a quiet spell" /> |
| Autumn dusk: maples, a shinkansen after a milestone | Winter night: snowed in after 60 quiet days |

Samples are made-up cities; regenerate them with `npm run samples`.

## What drives the scene

| Activity | Scene |
| --- | --- |
| Account ID | Layout: where the mountain, buildings, and station sit |
| Languages of public repos | Neon signs, some lit windows, the train's stripe |
| Total contributions | A village of tiled roofs grows into towers with rooftop beacons |
| Current weekly streak | Share of lit windows; fades over ~6 weeks once the streak ends |
| Longest weekly streak | Snowcap on the mountain and stars in the sky |
| Month of the day just ended | Season: sakura and petals, green trees and fireflies, red maples and falling leaves, or bare trees and snow |
| Contributions on that day | Passengers: from an empty train to every seat taken at 8+ |

A cat sits on the tallest roof, blinking and swishing its tail.

The day that just ended picks the train:

| When | Train |
| --- | --- |
| 60+ quiet days | Snowed in, no train |
| 14+ quiet days | Rain, the last train passes slowly |
| First contribution of the week | Stops at the station, doors open |
| Crossed 1k/5k/10k/25k/50k/100k in the last 7 days, or a Sunday ending a top-10% week | Shinkansen, two fast passes |
| Anything else | One local train |

## Profile README

In your `<login>/<login>` repository, add `.github/workflows/lofi.yml`:

```yaml
name: lofi
on:
  schedule:
    - cron: "5 */2 * * *" # every 2 hours, so the sky follows the clock
  workflow_dispatch:
permissions:
  contents: write
jobs:
  draw:
    runs-on: ubuntu-latest
    steps:
      - uses: geshtng/git-lofi@main
        with:
          time: auto # follows the hour in timezone; or day, night, dusk, dawn, rain, snow, sakura
          timezone: Asia/Jakarta
          output-dir: lofi
      # Force-push only the latest GIF to its own branch, so history never piles up.
      - env:
          GH_TOKEN: ${{ github.token }}
        run: |
          cd lofi
          git init -q -b lofi
          git config user.name github-actions
          git config user.email github-actions@users.noreply.github.com
          git add lofi.gif
          git commit -qm "Redraw lofi city"
          git push -fq "https://x-access-token:${GH_TOKEN}@github.com/${{ github.repository }}.git" lofi
```

Then put this in the README:

```html
<img src="https://raw.githubusercontent.com/<login>/<login>/lofi/lofi.gif" width="960" alt="My lofi city" />
```

## Command line

Node 20+:

```sh
npm install
GITHUB_TOKEN=... npm start -- <login> --time dusk --out lofi --save snapshot.json
npm start -- --from snapshot.json --time sakura   # redraw offline
npm test
```
