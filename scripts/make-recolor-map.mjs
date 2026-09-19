/** 把 recolor.mjs 的颜色映射表换成「Weave（land-book #99993）」的色系，其余逻辑不变 */
import fs from 'node:fs'

const MAP = {
  /* — 底色与中性：暖米白 → Weave 的冷浅灰阶 — */
  '#fbfaf7': '#fdfdfd',   // 页面底（米白 → 卡片白）
  '#f1eee7': '#f3f2f0',   // 页面灰（实测 43.1% 的主底）
  '#f7f4ee': '#f7f6f5',
  '#f7f7f7': '#f7f7f7',
  '#f8f8f8': '#f8f8f8',
  '#f6f6f6': '#f6f6f6',
  '#fdfdfd': '#fdfdfd',
  '#ece8df': '#ebe9e7',   // 面板灰（实测 27.5%）
  '#e2ded4': '#e2dfdc',
  '#dedad0': '#e2dfdc',   // 线
  '#d9d4ca': '#d9d6d3',
  '#d5d5d6': '#d5d5d6',
  '#dfdfdf': '#dfdfdf',
  '#dedede': '#dedede',
  '#e5e5e5': '#e5e5e5',
  '#e1e1e1': '#e1e1e1',
  '#eee': '#eee',
  '#d1d1d1': '#d1d1d1',
  '#adadad': '#a8a29e',
  '#a9a294': '#b9a9a4',   // 次级暖灰（实测 2.6%）
  '#a5a29a': '#b3a9a5',
  '#999': '#9a9490',
  '#888': '#8a8583',
  '#6e6c66': '#6b6560',   // 次要字
  '#57544e': '#4a4543',
  '#4c4c4c': '#4a4543',
  '#555': '#57514e',
  '#353535': '#2a2523',
  '#1b1a18': '#191413',   // 墨（实测 14.9%）
  '#12110f': '#0e0b0a',
  '#000': '#000',
  '#fff': '#fff',
  '#ffffff': '#ffffff',
  /* — 印红一族 → Weave 的赭红一族（色相 7°→13°，浓淡顺序不变）— */
  '#9c3b2e': '#9c4c3b',   // 主色（= 模版 accent，实测 2.6%）
  '#7f2519': '#7a3a2c',
  '#a52121': '#8f4133',
  '#a8482f': '#a45341',
  '#983826': '#944534',
  '#b04d33': '#ab5a46',
  '#c46346': '#b96b56',
  '#d47c60': '#c4826e',
  '#e0987e': '#d09a86',
  '#eab6a2': '#dcb1a1',
  '#f2d3c6': '#e8cec5',
  '#f8e7e1': '#f0e0da',
  '#f6ece9': '#ebe9e7',   // 淡档底色 → 面板灰
  '#fdefef': '#f3e6e2',
  '#a4470f': '#a45341',
  '#ec8b89': '#d9958c',
  '#e64340': '#b0453f',
  '#ce3c39': '#a6453c',
  '#f43530': '#b04a42',
  '#ff4d6d': '#9c4c3b',
  /* — 系统色归到 Weave 的两档 — */
  '#007aff': '#9c4c3b',
  '#0062cc': '#7a3a2c',
  '#3cc51f': '#9c4c3b',
  '#0f7a54': '#7a3a2c',
  '#eaf6f0': '#efedeb',
  '#b06bff': '#b96b56',
  '#6f8bff': '#7a3a2c',
  '#35e2c4': '#b9a9a4',
  '#ffd166': '#b96b56',
  '#f7f4fa': '#f7f7f7',
  '#eef4fb': '#f0f0f0',
}

const P = process.argv[2]
const src = fs.readFileSync(P, 'utf8')
const body = 'export const MAP = {\n' +
  Object.entries(MAP).map(([k, v]) => `  '${k}': '${v}',`).join('\n') + '\n}\n'
const out = src.replace(/export const MAP = \{[\s\S]*?\n\}\n/, body)
if (out === src) { console.error('没找到 MAP 块，替换失败'); process.exit(1) }
fs.writeFileSync(P, out)
console.log('已替换 MAP：', Object.keys(MAP).length, '条')
