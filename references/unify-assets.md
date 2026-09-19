# 素材统一（把上传图形收进风格）

目标：把用户上传的任何图形（照片、产品图、手绘、旧物料、二维码、第三方插图）收进模板的**同一视觉世界**，**同时不改变它是什么**。

红线先写在前面：**不重绘、不换脸、不变形内容、不 AI"美化"成另一个东西。** 只处理风格层——色调、质感、边缘、形状、合成方式。

## 处理链（五步，顺序固定）

### 1 · 去背景 / 取边界
- 优先用原图的透明通道。
- 没有通道时：用视觉模型判断主体边界，或按源模板的容器形状裁切（圆角矩形 / 圆形 / 胶囊）。
- **不要**为了抠干净而过度羽化，边缘发虚比留一点背景更伤质感。

### 2 · 色调映射（按源饱和度三选一）

| 源的饱和特征 | 配方 | 强度上限 |
| --- | --- | --- |
| 近乎单色（sat ≤ 0.25） | 灰度 + 双色调（`bg` → `accent`） | 全量，但保留层次 |
| 中低饱和（0.25–0.55） | `luminosity` 叠一层 accent，或 CSS `filter: grayscale(.6)` | accent 不透明度 ≤ 25% |
| 高饱和（> 0.55） | 只做轻度统一色温 + 同一背景色，不压饱和 | 别调色，改了就不像原品牌 |

```css
/* 双色调：先灰度，再按亮度映射到源的两个色 */
.unified-duotone { filter: grayscale(1) contrast(1.05); }
.unified-duotone::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(160deg, var(--accent), var(--bg));
  mix-blend-mode: color; opacity: .45;   /* 超过 .5 会吃掉层次 */
}
/* 轻量统一：保住原色，只统一到源背景 */
.unified-tint { background: var(--bg-alt); mix-blend-mode: luminosity; opacity: .88; }
```

人物照片、产品照片**优先用轻量配方**；插画、图标类可以上双色调。

### 3 · 质感统一
- 源的 `filter` / `blend_modes` 里有颗粒、模糊、位移时，才给素材加对应质感；源干净就别加。
- 颗粒用一层 SVG 噪声，全组素材**同一个种子**，别一张一个样：

```css
.grain::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity: .06; mix-blend-mode: overlay;
}
```

### 4 · 形状与比例
- 圆角一律 `var(--radius)`；胶囊只给按钮/头像。
- 裁切比按源的 `media.aspect_ratios` 主值（如 `16/9`），用 `aspect-ratio` + `object-fit: cover`。
- **`object-fit: fill` 只在源本身就是设计好的插画/图形时用**；照片用 `fill` 会拉伸，属变形，禁止。
- 描边 `1px solid var(--line)`，与模板其余元素同一套。

### 5 · 合成与层次
- 贴到 `--bg` 或 `--bg-alt` 上；源用了叠加模式就用同样的（`overlay` / `soft-light`）。
- 阴影用源的 `box-shadow` 配方，别自造。
- 组内素材的**光照方向**要一致（要么全都亮面朝左上），方向打架比色调不齐更显眼。

## 一致性检查清单（并排看，逐条打勾）

- [ ] 同组素材：同一底色、同一配方、同一颗粒量、同一光照方向
- [ ] 与源模板并排：色彩分布不跳、明度节奏一致
- [ ] 主体可识别性：缩小到 25% 仍认得出是什么
- [ ] 没有拉伸变形（照片的圆变成了椭圆 = 失败）
- [ ] 人脸 / Logo / 品牌色未被改到认不出（这条是硬红线）

## 批量处理与可复现

1. 每张素材记录配方：`{ file, recipe, strength, radius, aspect, seed }`。
2. 同组素材只用一张配方表；换配方要全组换。
3. 交付时附配方表，别人能照着复现同样的结果。
4. 用脚本批处理时（如 canvas / sharp / ComfyUI），先跑 2 张验收，再跑全量。

## 与出图产线的分工

- **统一已有图形**（色调/质感/形状）→ 本流程，用 CSS 或图片处理完成，可复现、零成本。
- **需要新图形**（补插画、补背景）→ 走本机出图产线（ComfyUI 可复现；即梦好看但不可复现、每张花钱），生成后仍要回到本流程做统一。
- 无论哪条产线，**风格门禁照跑**：产出截图与源指纹比对，别让新图形把整体色相/明度带偏。
