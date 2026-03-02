import { expect, test } from '@playwright/test'

const WEB_URL = process.env.PASEO_WEB_E2E_URL ?? 'http://localhost:44285'

test.describe('thread sidebar regressions', () => {
  test('shows active highlight, unread indicator, and status metadata', async ({ page }) => {
    await page.goto(WEB_URL)

    await expect(page.getByText('Configured Projects')).toBeVisible()
    await expect(page.locator("[data-sidebar='menu-button'][data-active='true']")).toHaveCount(1)

    const unreadBadges = page.locator("[data-sidebar='menu-button'] .bg-primary")
    expect(await unreadBadges.count()).toBeGreaterThan(0)

    await expect(page.locator("[data-sidebar='menu-button']").first()).toContainText(
      /running|idle|error|closed|unknown/i,
    )
  })

  test('Cmd+Arrow thread navigation wraps', async ({ page }) => {
    await page.goto(WEB_URL)

    const activeBefore = page.locator("[data-sidebar='menu-button'][data-active='true']").first()
    const beforeText = await activeBefore.innerText()

    await page.keyboard.press('Meta+ArrowDown')
    const activeAfterDown = page.locator("[data-sidebar='menu-button'][data-active='true']").first()
    await expect(activeAfterDown).not.toHaveText(beforeText)

    await page.keyboard.press('Meta+ArrowUp')
    await page.keyboard.press('Meta+ArrowUp')
    const activeAfterWrap = page.locator("[data-sidebar='menu-button'][data-active='true']").first()
    await expect(activeAfterWrap).not.toHaveText(beforeText)
  })
})
