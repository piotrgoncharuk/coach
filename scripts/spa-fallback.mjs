#!/usr/bin/env node
/**
 * GitHub Pages не умеет правила переадресации: по адресу /coach/profile он ищет
 * файл и, не найдя, отдаёт 404.html. Кладём туда копию оболочки — приложение
 * поднимется и само разберёт адрес. Для Netlify ту же роль играет _redirects.
 */
import { copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
await copyFile(resolve(dist, 'index.html'), resolve(dist, '404.html'))
console.log('404.html создан как копия оболочки')
