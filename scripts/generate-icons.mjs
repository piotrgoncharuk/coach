#!/usr/bin/env node
/**
 * Иконки, apple-touch-icon и splash-экраны для iPhone.
 * Запуск: npm run icons
 *
 * Splash-экраны в Safari задаются только разметкой apple-touch-startup-image
 * с точным совпадением размеров устройства, поэтому список явный.
 */
import sharp from 'sharp'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BG = '#0B0D10'
const ACCENT = '#FF6A2B'

/** Знак приложения: штанга в скобке буквы C. */
const logo = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g stroke="${ACCENT}" stroke-width="26" stroke-linecap="round" fill="none">
    <path d="M330 150a118 118 0 1 0 0 212"/>
    <path d="M150 256h212M150 214v84M362 214v84"/>
  </g>
  <g stroke="${ACCENT}" stroke-width="26" stroke-linecap="round" opacity="0.55">
    <path d="M112 228v56M400 228v56"/>
  </g>
</svg>`

/** Для maskable-иконки знак уменьшен: системы Android обрезают края по кругу. */
const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(102 102) scale(0.6)" stroke="${ACCENT}" stroke-width="30" stroke-linecap="round" fill="none">
    <path d="M330 150a118 118 0 1 0 0 212"/>
    <path d="M150 256h212M150 214v84M362 214v84"/>
  </g>
</svg>`

const SPLASH = [
  { w: 1320, h: 2868, dw: 440, dh: 956, r: 3, name: 'iphone-16-pro-max' },
  { w: 1206, h: 2622, dw: 402, dh: 874, r: 3, name: 'iphone-16-pro' },
  { w: 1290, h: 2796, dw: 430, dh: 932, r: 3, name: 'iphone-15-pro-max' },
  { w: 1179, h: 2556, dw: 393, dh: 852, r: 3, name: 'iphone-15-pro' },
  { w: 1284, h: 2778, dw: 428, dh: 926, r: 3, name: 'iphone-13-pro-max' },
  { w: 1170, h: 2532, dw: 390, dh: 844, r: 3, name: 'iphone-13' },
  { w: 1242, h: 2688, dw: 414, dh: 896, r: 3, name: 'iphone-11-pro-max' },
  { w: 1125, h: 2436, dw: 375, dh: 812, r: 3, name: 'iphone-x' },
  { w: 828, h: 1792, dw: 414, dh: 896, r: 2, name: 'iphone-11' },
  { w: 750, h: 1334, dw: 375, dh: 667, r: 2, name: 'iphone-se' },
]

async function png(svg, size, out) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
}

async function splash({ w, h, name }) {
  const mark = Math.round(Math.min(w, h) * 0.28)
  const base = sharp({ create: { width: w, height: h, channels: 4, background: BG } })
  const overlay = await sharp(Buffer.from(logo(mark))).resize(mark, mark).png().toBuffer()
  await base
    .composite([{ input: overlay, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(root, `public/splash/${name}.png`))
}

async function main() {
  await mkdir(resolve(root, 'public/icons'), { recursive: true })
  await mkdir(resolve(root, 'public/splash'), { recursive: true })

  for (const size of [32, 180, 192, 512]) {
    const out = size === 180 ? 'public/apple-touch-icon.png' : `public/icons/icon-${size}.png`
    await png(logo(size), size, resolve(root, out))
  }
  await png(maskable, 512, resolve(root, 'public/icons/icon-maskable-512.png'))
  await writeFile(resolve(root, 'public/favicon.svg'), logo(512).trim())

  const links = []
  for (const s of SPLASH) {
    await splash(s)
    links.push(
      `    <link rel="apple-touch-startup-image" href="/splash/${s.name}.png" ` +
        `media="(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and (-webkit-device-pixel-ratio: ${s.r}) and (orientation: portrait)" />`,
    )
  }

  const htmlPath = resolve(root, 'index.html')
  const html = await readFile(htmlPath, 'utf8')
  const next = html.replace(
    /(<!--SPLASH-->)[\s\S]*?(?=\n\s*<\/head>)|<!--SPLASH-->/,
    `<!--SPLASH-->\n${links.join('\n')}`,
  )
  await writeFile(htmlPath, next)

  console.log(`готово: иконки, apple-touch-icon 180×180, ${SPLASH.length} splash-экранов`)
}

await main()
