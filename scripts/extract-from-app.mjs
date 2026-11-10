#!/usr/bin/env node
/**
 * Maintainer tool: rebuild locale/zh-tw.json from the dictionaries that ship
 * inside the DeepSeek Harness desktop app.
 *
 *   node scripts/extract-from-app.mjs [--asar <app.asar>] [--out locale/zh-tw.json]
 *
 * Requires devDependencies (`pnpm install` / `npm install`).
 *
 * How it works:
 *  1. list every `<package>/lib/client.js` in app.asar;
 *  2. evaluate the object literals that each bundle passes to `locale.register`
 *     (the shipped `zh` dictionary of that namespace);
 *  3. convert every string with OpenCC s2twp (Taiwan phrases) and then apply a
 *     small Taiwan UI glossary for terms OpenCC leaves in mainland usage;
 *  4. write one `{ namespace: { key: "繁體文字" } }` JSON document.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { listPackage, extractFile } from '@electron/asar'

const require = createRequire(import.meta.url)
const OpenCC = require('opencc-js')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : fallback
}

const asar = resolve(arg('--asar', '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'))
const outFile = resolve(root, arg('--out', 'locale/zh-tw.json'))

/** Taiwan UI wording that OpenCC deliberately does not rewrite. */
const GLOSSARY = [
  ['會話', '對話'],
  ['審批', '核准'],
  ['賬號', '帳號'],
  ['許可權', '權限'],
  ['智慧體', '智慧代理'],
  ['終端', '終端機'],
  ['反饋', '回饋'],
  ['後臺', '後台'],
  ['自定義', '自訂'],
  ['鑑權', '驗證'],
  ['影象', '影像'],
  ['質量', '品質'],
  ['彈窗', '彈出視窗'],
  ['對話方塊', '對話框'],
  ['字號', '字級'],
  ['頁籤', '分頁'],
  ['缺省', '預設'],
  ['定製', '自訂'],
  ['設定文件', '設定檔'],
]

const convert = OpenCC.Converter({ from: 'cn', to: 'twp' })
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

/** Return the balanced `{ ... }` literal that starts at `start`. */
function balanced(code, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return code.slice(start, i + 1)
  }
  return null
}

/** Split `register(...)` argument text on top-level commas. */
function splitArgs(text) {
  const args = []
  let depth = 0
  let quote = null
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      cur += ch
      if (ch === '\\') { cur += text[++i]; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue }
    if ('([{'.includes(ch)) depth++
    if (')]}'.includes(ch)) depth--
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) args.push(cur.trim())
  return args
}

/** Collect `const name = ...` object and string literals for one bundle. */
function collectEnv(code) {
  const env = Object.create(null)
  const defs = [...code.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*/g)]
  for (let pass = 0; pass < 2; pass++) {
    for (const def of defs) {
      const name = def[1]
      if (env[name] !== undefined) continue
      const at = def.index + def[0].length
      let value
      if (code[at] === '{') {
        const literal = balanced(code, at)
        if (!literal) continue
        const fixed = literal.replace(/\.\.\.\s*([A-Za-z_$][\w$]*)/g, (_, ref) => {
          const spread = env[ref]
          return spread && typeof spread === 'object' ? '...' + JSON.stringify(spread) : '...{}'
        })
        try { value = vm.runInNewContext('(' + fixed + ')', env) } catch {}
      } else {
        const str = code.slice(at).match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
        if (str) value = str[1].slice(1, -1)
      }
      if (value !== undefined) env[name] = value
    }
  }
  return env
}

/** Locale map -> its `zh` dictionary, or a plain string dictionary. */
function zhDictionary(value) {
  if (!value || typeof value !== 'object') return null
  const source = value.zh && typeof value.zh === 'object' ? value.zh : value
  const out = {}
  for (const [key, text] of Object.entries(source)) if (typeof text === 'string') out[key] = text
  return Object.keys(out).length ? out : null
}

const work = mkdtempSync(join(tmpdir(), 'dsh-locale-'))
const entries = listPackage(asar).filter((p) => p.endsWith('/lib/client.js'))
console.log(`scanning ${entries.length} client bundles from ${asar}`)

const dictionaries = new Map()

for (const entry of entries) {
  const code = extractFile(asar, entry.replace(/^\//, '')).toString('utf8')
  const env = collectEnv(code)
  const consts = Object.fromEntries(
    Object.entries(env).filter(([, v]) => typeof v === 'string'),
  )

  const call = /(?:ctx\.)?locale\.register\s*\(/g
  let match
  while ((match = call.exec(code))) {
    // Read the balanced argument list.
    let depth = 1
    let quote = null
    let text = ''
    for (let i = match.index + match[0].length; i < code.length && depth > 0; i++) {
      const ch = code[i]
      if (quote) {
        text += ch
        if (ch === '\\') { text += code[++i]; continue }
        if (ch === quote) quote = null
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; text += ch; continue }
      if ('([{'.includes(ch)) depth++
      if (')]}'.includes(ch)) { depth--; if (!depth) break }
      text += ch
    }

    const args = splitArgs(text)
    if (args.length < 2) continue

    let ns = args[0]
    if (!/^["']/.test(ns)) ns = consts[ns]
    ns = String(ns ?? '').replace(/^["']|["']$/g, '')
    if (!/^[A-Za-z][\w.-]*$/.test(ns)) continue

    let dict = null
    if (/^["']/.test(args[1])) {
      if (args[1].replace(/^["']|["']$/g, '') === 'zh') dict = zhDictionary(env[args[2]?.trim()])
    } else if (args[1].startsWith('{')) {
      const head = args[1].match(/(?:^|[{,\s])zh\s*(:|,)/)
      if (head) {
        if (head[1] === ',') dict = zhDictionary(env.zh)
        else {
          const after = args[1].slice(head.index + head[0].length)
          const token = after.match(/^\s*([A-Za-z_$][\w$]*|\{)/)
          if (token && token[1] === '{') {
            const literal = balanced(args[1], head.index + head[0].length + token[0].length - 1)
            if (literal) dict = zhDictionary(vm.runInNewContext('(' + literal + ')'))
          } else if (token) {
            dict = zhDictionary(env[token[1]])
          }
        }
      }
    } else {
      dict = zhDictionary(env[args[1]])
    }

    if (!dict) continue
    dictionaries.set(ns, { ...(dictionaries.get(ns) ?? {}), ...dict })
  }
}

if (!dictionaries.size) throw new Error('no dictionaries found — unsupported app build?')

const result = {}
let count = 0
let mismatched = 0
for (const [ns, dict] of dictionaries) {
  const translated = {}
  for (const [key, source] of Object.entries(dict)) {
    let text = convert(source)
    for (const [from, to] of GLOSSARY) text = text.split(from).join(to)
    if (placeholders(source) !== placeholders(text)) mismatched++
    translated[key] = text
    count++
  }
  result[ns] = translated
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n')
console.log(`wrote ${outFile}: ${Object.keys(result).length} namespaces, ${count} strings`)
if (mismatched) console.warn(`warning: ${mismatched} strings changed their {placeholder} set`)
console.log(`(bundle cache: ${work})`)
try { execFileSync('rm', ['-rf', work]) } catch {}
