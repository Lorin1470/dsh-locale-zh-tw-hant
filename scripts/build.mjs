#!/usr/bin/env node
/**
 * Build lib/client.js from locale/zh-tw.json.
 *
 * The bundle is a `window.__ModuleLoader__.load({...})` factory, the format the
 * DSH Web client module loader expects. It is committed so that installing the
 * package needs no build step.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dicts = JSON.parse(readFileSync(resolve(root, 'locale/zh-tw.json'), 'utf8'))

const total = Object.values(dicts).reduce((n, dict) => n + Object.keys(dict).length, 0)
if (!Object.keys(dicts).length) throw new Error('locale/zh-tw.json is empty')

const bundle = `window.__ModuleLoader__.load({
\tid: "dsh-locale-zh-tw-hant",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
\t\t/** zh-TW dictionaries converted from the shipped zh dictionaries. */
\t\tconst DICTS = ${JSON.stringify(dicts)};
\t\tconst inject = ["locale"];
\t\t/**
\t\t * Register the Traditional Chinese language and its namespace dictionaries.
\t\t * @param ctx - browser-side cordis context.
\t\t */
\t\tfunction apply(ctx) {
\t\t\tconst locale = ctx.get("locale");
\t\t\tif (!locale || typeof locale.addLanguage !== "function") return;
\t\t\tconst has = locale.getLocale().locales.some((entry) => entry.id === "zh-TW");
\t\t\tif (!has) ctx.effect(() => locale.addLanguage({ id: "zh-TW", label: "繁體中文", fallback: "zh" }), "zh-tw: language");
\t\t\tfor (const [ns, dict] of Object.entries(DICTS)) {
\t\t\t\tctx.effect(() => {
\t\t\t\t\ttry { return locale.register(ns, "zh-TW", dict); }
\t\t\t\t\tcatch (error) { console.warn("zh-tw: dictionary skipped", ns, error); }
\t\t\t\t}, "zh-tw: " + ns);
\t\t\t}
\t\t}
\t\texports.apply = apply;
\t\texports.inject = inject;
\t\treturn module.exports;
\t}
});
`

mkdirSync(resolve(root, 'lib'), { recursive: true })
writeFileSync(resolve(root, 'lib/client.js'), bundle)
console.log(`lib/client.js: ${Object.keys(dicts).length} namespaces, ${total} strings, ${bundle.length} bytes`)
