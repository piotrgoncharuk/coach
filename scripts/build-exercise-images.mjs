#!/usr/bin/env node
/**
 * Фото упражнений: скачиваем архив базы на закреплённом коммите, сжимаем
 * в WebP и кладём в public/exercise-img/. Это наша копия — приложение не
 * обращается к GitHub, а service worker кэширует фото для работы офлайн.
 *
 * В git фото не хранятся (≈1700 файлов): их собирает CI, результат кэшируется
 * по коммиту базы. Локально: npm run exercises:images
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { UPSTREAM_SHA } from './build-exercise-data.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public/exercise-img')
const WIDTH = 480
const QUALITY = 68

/** Архив с GitHub, а если он недоступен — git на том же коммите. */
function fetchSource(tmp) {
  const tarball = join(tmp, 'src.tar.gz')
  const url = `https://codeload.github.com/yuhonas/free-exercise-db/tar.gz/${UPSTREAM_SHA}`
  try {
    console.log('скачиваю архив базы…')
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', tarball, url], { stdio: 'inherit' })
    execFileSync('tar', ['-xzf', tarball, '-C', tmp, '--wildcards', '*/exercises/*'], { stdio: 'inherit' })
    return join(tmp, `free-exercise-db-${UPSTREAM_SHA}`, 'exercises')
  } catch {
    console.log('архив недоступен, беру через git…')
    const dir = join(tmp, 'repo')
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'inherit' })
    execFileSync('mkdir', ['-p', dir])
    git('init', '-q')
    git('remote', 'add', 'origin', 'https://github.com/yuhonas/free-exercise-db.git')
    git('fetch', '-q', '--depth', '1', 'origin', UPSTREAM_SHA)
    git('checkout', '-q', 'FETCH_HEAD')
    return join(dir, 'exercises')
  }
}

async function main() {
  const marker = join(out, `.source-${UPSTREAM_SHA}`)
  if (existsSync(marker)) {
    console.log('фото уже собраны для этого коммита базы')
    return
  }

  const tmp = await mkdtemp(join(tmpdir(), 'fedb-'))
  const srcRoot = process.env.FEDB_DIR ? join(process.env.FEDB_DIR, 'exercises') : fetchSource(tmp)
  const dirs = await readdir(srcRoot)
  await rm(out, { recursive: true, force: true })
  let count = 0
  let bytes = 0

  for (const id of dirs) {
    const dir = join(srcRoot, id)
    if (!(await stat(dir)).isDirectory()) continue
    await mkdir(join(out, id), { recursive: true })
    for (const n of ['0', '1']) {
      const src = join(dir, `${n}.jpg`)
      if (!existsSync(src)) continue
      const dst = join(out, id, `${n}.webp`)
      const info = await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(dst)
      count++
      bytes += info.size
    }
  }

  await rm(tmp, { recursive: true, force: true })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(marker, '')
  console.log(`фото: ${count} файлов, ${(bytes / 1024 / 1024).toFixed(1)} МБ, в среднем ${Math.round(bytes / count / 1024)} КБ`)
}

await main()
