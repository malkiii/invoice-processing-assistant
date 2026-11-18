import { expect, test } from '@playwright/test'

// Assumes an instance with an open sign-up policy and no SMTP (no email verification).
test('a new User signs up and lands on /app', async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

  await page.goto('/auth/sign-up')
  await page.getByLabel('Name').fill('E2E User')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery')
  await page.getByLabel('Confirm password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/app$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('user-email')).toHaveText(email)
})

test('/app redirects signed-out visitors to sign-in', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/auth\/sign-in\?redirect=(%2F|\/)app$/)
})
