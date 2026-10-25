// Visitors for the demo: people using the production site the ordinary way, in a real browser, so Spectra has
// visits to turn into journeys. Each round is a new visitor who signs up, then comes back a number of times, one
// visit per tab: reads, favorites, follows, filters by tag, edits their settings, writes an article, signs out and
// in again.
//
//   pnpm exec playwright install chromium
//   node scripts/demo-visitors.mjs https://<owner>.github.io/<repo>/ [rounds=2]
//
// Accounts are made on the public RealWorld API the app talks to, with example.com addresses. That API is a sandbox:
// a new account has no profile (so no comment box), there are only a few articles (so no second page), and a
// browser's token stops being accepted for writes after a few minutes. So each signed-in visit starts with a fresh
// sign-in, as a returning visitor's stored login (Spectra records that starting state, and replays it), and the
// visits the sandbox cannot support are left out.
import process from 'node:process'
import { chromium } from '@playwright/test'

const [site, roundsArg] = process.argv.slice(2)
if (!site)
  throw new Error('usage: node scripts/demo-visitors.mjs <production URL> [rounds]')
const rounds = Number(roundsArg) || 2
const base = site.replace(/\/?$/, '/')
const to = path => `${base}#${path}`
const sleep = ms => new Promise(r => setTimeout(r, ms))
const API = (process.env.REALWORLD_API || 'https://api.realworld.show').replace(/\/$/, '')
// Fonts and icons come from other hosts; a visit starts when the page's own HTML has arrived.
const go = (page, path) => page.goto(to(path), { waitUntil: 'domcontentloaded', timeout: 60_000 })
// A person looks at the page before doing anything with it.
const look = page => page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}).then(() => sleep(800))
const firstPreview = page => page.locator('.article-preview').first()
async function globalFeed(page) {
  await page.getByText(/global feed/i).first().click()
  await firstPreview(page).waitFor({ timeout: 15_000 })
  await look(page)
}
async function openFirstArticle(page) {
  await globalFeed(page)
  await firstPreview(page).locator('h1').click()
  await page.locator('.article-page').waitFor({ timeout: 15_000 })
  await look(page)
}

const VISITS = {
  'read an article': async page => {
    await go(page, '/')
    await look(page)
    await openFirstArticle(page)
  },
  'favorite from the feed': async page => {
    await go(page, '/')
    await look(page)
    await globalFeed(page)
    await firstPreview(page).locator('button').first().click()
    await look(page)
  },
  'follow an author': async page => {
    await go(page, '/')
    await look(page)
    await openFirstArticle(page)
    await page.getByRole('button', { name: /follow/i }).first().click()
    await look(page)
  },
  'filter by tag': async page => {
    await go(page, '/')
    await page.locator('.sidebar .tag-pill').first().waitFor({ timeout: 15_000 })
    await look(page)
    await page.locator('.sidebar .tag-pill').first().click()
    await look(page)
  },
  'edit settings': async page => {
    await go(page, '/settings')
    const bio = page.getByPlaceholder(/short bio/i)
    await bio.waitFor({ timeout: 15_000 })
    await look(page)
    await bio.fill(`Reading about frontends, ${new Date().toDateString()}`)
    await page.getByRole('button', { name: /update settings/i }).click()
    await look(page)
  },
  'write an article': async page => {
    await go(page, '/')
    await look(page)
    await page.getByRole('link', { name: /new (article|post)/i }).click()
    await page.getByPlaceholder(/article title/i).fill(`Notes from today ${Date.now().toString(36)}`)
    await page.getByPlaceholder(/what's this article about/i).fill('A short note')
    await page.getByPlaceholder(/write your article/i).fill('Tried the app today. It works well.')
    await page.getByRole('button', { name: /publish/i }).click()
    await page.locator('.article-page').waitFor({ timeout: 15_000 }).catch(() => {})
    await look(page)
  },
}

// A fresh sign-in through the API, put where the app keeps it before the page's scripts run: once per tab, so a
// visit that signs out stays signed out.
async function signIn({ name, password }) {
  const res = await fetch(`${API}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: { email: `${name}@example.com`, password } }),
  })
  if (!res.ok)
    throw new Error(`sign-in refused: ${res.status}`)
  const { user } = await res.json()
  return user
}

const tally = { done: 0, failed: 0 }

async function visit(context, account, what, fn, { signedIn = true } = {}) {
  const page = await context.newPage()
  try {
    if (signedIn) {
      const user = await signIn(account)
      await page.addInitScript(u => {
        if (sessionStorage.getItem('demo-signed-in'))
          return
        sessionStorage.setItem('demo-signed-in', '1')
        localStorage.setItem('user', JSON.stringify(u))
      }, user)
    }
    await fn(page)
    tally.done++
    console.log(`  ${what}: ok`)
  }
  catch (error) {
    tally.failed++
    console.log(`  ${what}: ${String(error.message).split('\n')[0]}`)
  }
  // The visit ends when the tab closes, as when a person leaves.
  await sleep(1500)
  await page.close()
}

// Spectra does not record automated browsers (navigator.webdriver, a "HeadlessChrome" user agent), so these demo
// visitors present themselves as an ordinary Chrome: they are the site owner's own traffic, made to be recorded.
const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] })
const probe = await browser.newPage()
const headlessAgent = await probe.evaluate(() => navigator.userAgent)
await probe.close()
const userAgent = headlessAgent.replace('HeadlessChrome', 'Chrome')
for (let round = 0; round < rounds; round++) {
  const context = await browser.newContext({ userAgent, viewport: { width: 1280, height: 800 } })
  const name = `visitor${Date.now().toString(36)}`
  const password = `pw-${Math.random().toString(36).slice(2)}-A1`
  const account = { name, password }
  console.log(`visitor ${round + 1}: ${name}`)
  await visit(context, account, 'sign up', async page => {
    await go(page, '/register')
    await look(page)
    await page.getByPlaceholder(/your name|username/i).fill(name)
    await page.getByPlaceholder('Email').fill(`${name}@example.com`)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: /sign up/i }).click()
    await page.getByRole('link', { name: /new (article|post)/i }).waitFor({ timeout: 15_000 })
    await look(page)
  }, { signedIn: false })
  for (const [what, fn] of Object.entries(VISITS)) await visit(context, account, what, fn)
  await visit(context, account, 'sign out', async page => {
    await go(page, '/settings')
    await page.getByRole('button', { name: /logout/i }).waitFor({ timeout: 15_000 })
    await look(page)
    await page.getByRole('button', { name: /logout/i }).click()
    await page.getByRole('link', { name: /sign in/i }).waitFor({ timeout: 15_000 })
    await look(page)
  })
  await visit(context, account, 'sign in', async page => {
    await go(page, '/login')
    await look(page)
    await page.getByPlaceholder('Email').fill(`${name}@example.com`)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.getByRole('link', { name: /new (article|post)/i }).waitFor({ timeout: 15_000 })
    await look(page)
  }, { signedIn: false })
  await context.close()
}
await browser.close()
console.log(`${tally.done} visits made${tally.failed ? `, ${tally.failed} did not finish` : ''}`)
process.exitCode = tally.failed ? 1 : 0
