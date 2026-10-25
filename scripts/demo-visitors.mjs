// Visitors for the demo: people using the production site the ordinary way, in a real browser, so Spectra has
// visits to turn into journeys. Each round is a new visitor who signs up, then comes back a number of times, one
// visit per tab: reads, favorites, comments, follows, filters by tag, pages the feed, edits their settings, writes
// an article, signs out and in again.
//
//   pnpm exec playwright install chromium
//   node scripts/demo-visitors.mjs https://<owner>.github.io/<repo>/ [rounds=2]
//
// Accounts are made on the public RealWorld API the app talks to, with example.com addresses.
import { chromium } from '@playwright/test'

const [site, roundsArg] = process.argv.slice(2)
if (!site) {
  console.error('usage: node scripts/demo-visitors.mjs <production URL> [rounds]')
  process.exit(2)
}
const rounds = Number(roundsArg) || 2
const base = site.replace(/\/?$/, '/')
const to = path => `${base}#${path}`
const sleep = ms => new Promise(r => setTimeout(r, ms))
// A person looks at the page before doing anything with it.
const look = page => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}).then(() => sleep(800))
const firstPreview = page => page.locator('.article-preview').first()
const globalFeed = async (page) => {
  await page.getByText(/global feed/i).first().click()
  await firstPreview(page).waitFor({ timeout: 15000 })
  await look(page)
}
const openFirstArticle = async (page) => {
  await globalFeed(page)
  await firstPreview(page).locator('h1').click()
  await page.locator('.article-page').waitFor({ timeout: 15000 })
  await look(page)
}

const VISITS = {
  'read an article': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await openFirstArticle(page)
  },
  'favorite from the feed': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await globalFeed(page)
    await firstPreview(page).locator('button').first().click()
    await look(page)
  },
  'comment on an article': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await openFirstArticle(page)
    await page.getByPlaceholder(/write a comment/i).fill('Great read, thanks for writing it up.')
    await page.locator('button', { hasText: /post comment/i }).click()
    await look(page)
  },
  'follow an author': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await openFirstArticle(page)
    await page.getByRole('button', { name: /follow/i }).first().click()
    await look(page)
  },
  'filter by tag': async (page) => {
    await page.goto(to('/'))
    await page.locator('.sidebar .tag-pill').first().waitFor({ timeout: 15000 })
    await look(page)
    await page.locator('.sidebar .tag-pill').first().click()
    await look(page)
  },
  'next page of the feed': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await globalFeed(page)
    await page.locator('.pagination .page-link').nth(1).click()
    await look(page)
  },
  'edit settings': async (page) => {
    await page.goto(to('/settings'))
    const bio = page.getByPlaceholder(/short bio/i)
    await bio.waitFor({ timeout: 15000 })
    await look(page)
    await bio.fill(`Reading about frontends, ${new Date().toDateString()}`)
    await page.getByRole('button', { name: /update settings/i }).click()
    await look(page)
  },
  'write an article': async (page) => {
    await page.goto(to('/'))
    await look(page)
    await page.getByRole('link', { name: /new (article|post)/i }).click()
    await page.getByPlaceholder(/article title/i).fill(`Notes from today ${Date.now().toString(36)}`)
    await page.getByPlaceholder(/what's this article about/i).fill('A short note')
    await page.getByPlaceholder(/write your article/i).fill('Tried the app today. It works well.')
    await page.getByRole('button', { name: /publish/i }).click()
    await page.locator('.article-page').waitFor({ timeout: 15000 }).catch(() => {})
    await look(page)
  },
}

const browser = await chromium.launch()
let done = 0
let failed = 0
for (let round = 0; round < rounds; round++) {
  const context = await browser.newContext()
  const name = `visitor${Date.now().toString(36)}`
  const password = `pw-${Math.random().toString(36).slice(2)}-A1`
  const visit = async (what, fn) => {
    const page = await context.newPage()
    try {
      await fn(page)
      done++
      console.log(`  ${what}: ok`)
    }
    catch (error) {
      failed++
      console.log(`  ${what}: ${String(error.message).split('\n')[0]}`)
    }
    // The visit ends when the tab closes, as when a person leaves.
    await sleep(1500)
    await page.close()
  }
  console.log(`visitor ${round + 1}: ${name}`)
  await visit('sign up', async (page) => {
    await page.goto(to('/register'))
    await look(page)
    await page.getByPlaceholder(/your name|username/i).fill(name)
    await page.getByPlaceholder('Email').fill(`${name}@example.com`)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: /sign up/i }).click()
    await page.getByRole('link', { name: /new (article|post)/i }).waitFor({ timeout: 15000 })
    await look(page)
  })
  for (const [what, fn] of Object.entries(VISITS)) await visit(what, fn)
  await visit('sign out', async (page) => {
    await page.goto(to('/settings'))
    await page.getByRole('button', { name: /logout/i }).waitFor({ timeout: 15000 })
    await look(page)
    await page.getByRole('button', { name: /logout/i }).click()
    await page.getByRole('link', { name: /sign in/i }).waitFor({ timeout: 15000 })
    await look(page)
  })
  await visit('sign in', async (page) => {
    await page.goto(to('/login'))
    await look(page)
    await page.getByPlaceholder('Email').fill(`${name}@example.com`)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.getByRole('link', { name: /new (article|post)/i }).waitFor({ timeout: 15000 })
    await look(page)
  })
  await context.close()
}
await browser.close()
console.log(`${done} visits made${failed ? `, ${failed} did not finish` : ''}`)
process.exit(failed ? 1 : 0)
