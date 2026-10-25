// Adds the Spectra Reproduce script tag to a built site, first in <head>, the way a site's edge or template adds it.
//   SPECTRA_SITE=... SPECTRA_KEY=... node scripts/add-spectra-tag.mjs dist [https://api.spectra-trace.com]
// Without SPECTRA_SITE it leaves the build as it is (a fork without a Spectra site still builds and deploys).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dir = 'dist', server = process.env.SPECTRA_SERVER || 'https://api.spectra-trace.com'] = process.argv.slice(2)
const site = process.env.SPECTRA_SITE
const key = process.env.SPECTRA_KEY
if (!site || !key) {
  console.log('add-spectra-tag: no SPECTRA_SITE/SPECTRA_KEY, build left as it is')
  process.exit(0)
}
const file = join(dir, 'index.html')
const html = readFileSync(file, 'utf8')
const tag = `<script src="${server}/v1/sr.js" data-site-id="${site}" data-api-key="${key}" data-endpoint="${server}/v1/ingest"></script>`
writeFileSync(file, html.replace(/<head>/i, `<head>\n    ${tag}`))
console.log(`add-spectra-tag: Spectra Reproduce installed in ${file}`)
