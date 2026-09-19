/** 从长截图里量出真正的强调色与次要色：按饱和度分组求均值 + 高频非灰色统计 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const src = process.argv[2]
const W = 1000
const raw = '/tmp/weave-px.raw'
execFileSync('/Users/michelleoyang/.local/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale=${W}:-1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', raw])
const buf = fs.readFileSync(raw)
const n = buf.length / 3
const H = Math.round(n / W)
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

const sat = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  return mx === 0 ? 0 : (mx - mn) / mx
}
const buckets = new Map()
let satPixels = 0
let sr = 0, sg = 0, sb = 0
const freq = new Map()
for (let i = 0; i < n; i++) {
  const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2]
  const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3)
  freq.set(key, (freq.get(key) || 0) + 1)
  const s = sat(r, g, b)
  if (s > 0.35) { satPixels++; sr += r; sg += g; sb += b; buckets.set(hex(r, g, b).slice(0, 5), (buckets.get(hex(r, g, b).slice(0, 5)) || 0) + 1) }
}
console.log('尺寸', W + 'x' + H, '像素', n)
console.log('饱和像素(>0.35)占比', (satPixels / n * 100).toFixed(2) + '%', '均值色', hex(sr / satPixels, sg / satPixels, sb / satPixels))
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
console.log('高频色（按 5bit 量化桶）:')
for (const [k, c] of top) {
  const r = ((k >> 10) & 31) << 3, g = ((k >> 5) & 31) << 3, b = (k & 31) << 3
  console.log(' ', hex(r, g, b), (c / n * 100).toFixed(2) + '%', 'sat=' + sat(r, g, b).toFixed(2))
}
const satTop = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
console.log('最饱和的色簇:')
for (const [h, c] of satTop) console.log(' ', h, (c / n * 100).toFixed(3) + '%')
