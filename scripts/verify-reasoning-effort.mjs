import { chromium } from 'playwright'

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e.message).slice(0, 300)))

await page.goto('http://127.0.0.1:3080', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(7000)

const conv = page.locator('text=DeepSeek插件实现思考强度滑块').first()
if (await conv.count()) {
  await conv.click()
  await page.waitForTimeout(6000)
}

const seat = page.locator('text=/DeepSeek-V4-Flash/').last()
if (await seat.count()) {
  await seat.click()
  await page.waitForTimeout(2000)
}

// slider details
const sliderBox = await page.locator('.re-effort-slider').boundingBox().catch(() => null)
const sliderAttrs = await page.locator('.re-effort-slider').getAttribute('class').catch(() => null)
const effortClass = await page.locator('.re-effort').getAttribute('class').catch(() => null)
const allEffortText = await page.locator('.re-effort').innerText().catch(() => null)
const rowText = await page.locator('.re-model-row').innerText().catch(() => null)
const levelLabels = await page.locator('.re-effort-track *, .re-effort-levels *, .re-level *').allTextContents().catch(() => [])

await page.screenshot({ path: 'verify-reasoning-effort.png' })
console.log(JSON.stringify({ sliderBox, sliderAttrs, effortClass, allEffortText, rowText, levelLabels: levelLabels.slice(0, 12), errors: errors.slice(0, 10) }, null, 2))
await browser.close()
