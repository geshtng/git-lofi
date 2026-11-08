import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc

const TRANSPARENT = 255

/**
 * One shared palette for every frame, each pixel scaled up to a `scale`-sized block.
 * After the first frame, unchanged pixels are written transparent over the kept previous
 * frame, which keeps a mostly static scene small.
 */
export function encodeGif(frames: Uint8Array[], w: number, h: number, scale = 2, delay = 60): Uint8Array {
  // ponytail: palette from every 4th frame; quantize all of them if colors ever go missing
  const sample = frames.filter((_, i) => i % 4 === 0)
  const all = new Uint8Array(sample.length * frames[0].length)
  sample.forEach((f, i) => all.set(f, i * f.length))
  const colors = quantize(all, TRANSPARENT) // indices 0..254; 255 stays free for transparency
  const palette = [...colors, ...Array.from({ length: 256 - colors.length }, () => [0, 0, 0])]
  const gif = GIFEncoder()
  let previous: Uint8Array | undefined
  for (const frame of frames) {
    const index = applyPalette(frame, colors)
    const big = new Uint8Array(w * scale * h * scale)
    for (let y = 0; y < h * scale; y++)
      for (let x = 0; x < w * scale; x++) {
        const i = ((y / scale) | 0) * w + ((x / scale) | 0)
        big[y * w * scale + x] = previous && previous[i] === index[i] ? TRANSPARENT : index[i]
      }
    gif.writeFrame(big, w * scale, h * scale, previous ? { delay, dispose: 1, transparent: true, transparentIndex: TRANSPARENT } : { palette, delay, dispose: 1 })
    previous = index
  }
  gif.finish()
  return gif.bytes()
}
