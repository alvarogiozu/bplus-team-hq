import { expect, type Page } from '@playwright/test'

export const PASS = 'qa-pass-1234'

export async function login(page: Page, username = 'qa.alvaro', theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('hq.theme', t), theme)
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(PASS)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/hoy/)
  await expect(page.getByText(/Buen(os|as) (días|tardes|noches)/)).toBeVisible()
}
