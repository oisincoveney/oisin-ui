import { expect, test, type Page } from '@playwright/test'

const WEB_URL = process.env.PASEO_WEB_E2E_URL ?? 'http://localhost:44285'
const E2E_DIFF_FILE = '.paseo-diff-panel-e2e.txt'

async function runTerminalCommand(page: Page, command: string) {
  const input = page.locator('.xterm-helper-textarea').first()
  await input.focus()
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

test.describe('diff panel regressions', () => {
  test('renders collapsed metadata rows, refreshes from terminal edits, and stays read-only', async ({ page }) => {
    await page.goto(WEB_URL)

    const openPanelButton = page.getByRole('button', { name: 'Open diff panel' })
    if (!(await openPanelButton.isEnabled())) {
      test.skip(true, 'No active thread available for diff panel regression flow')
    }

    await openPanelButton.click()

    const panel = page.getByTestId('diff-panel')
    await expect(panel).toBeVisible()

    await runTerminalCommand(page, `printf "diff-panel-e2e\\n" >> ${E2E_DIFF_FILE}`)
    await page.waitForTimeout(750)

    const refreshButton = panel.getByTestId('diff-refresh-button')
    await refreshButton.click()

    const createdRowPath = panel.getByTestId('diff-file-path').filter({ hasText: E2E_DIFF_FILE })
    await expect(createdRowPath).toBeVisible()

    const allPaths = await panel.getByTestId('diff-file-path').allTextContents()
    expect(allPaths.every((path) => path.trim().length > 0)).toBeTruthy()

    const createdSection = panel.getByTestId('diff-file-section').filter({ has: createdRowPath })
    await expect(createdSection.getByTestId('diff-file-content')).toBeHidden()

    await runTerminalCommand(page, `rm -f ${E2E_DIFF_FILE}`)
    await page.waitForTimeout(300)
    await refreshButton.click()

    await expect(panel.locator('textarea, [contenteditable="true"], button:has-text("Edit"), button:has-text("Save")')).toHaveCount(0)
  })
})
