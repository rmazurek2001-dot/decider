import { test, expect, Page } from '@playwright/test'

const API_URL = 'http://localhost:8000'

let testProjectId: number
let testShareToken: string

async function reliableClick(page: Page, testId: string) {
  await page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
    if (element) {
      element.click()
    } else {
      throw new Error(`Element with data-testid "${id}" not found`)
    }
  }, testId)
}

async function reliableClickFirst(page: Page, testId: string) {
  await page.evaluate((id) => {
    const elements = document.querySelectorAll(`[data-testid="${id}"]`)
    if (elements.length > 0) {
      (elements[0] as HTMLElement).click()
    } else {
      throw new Error(`No elements with data-testid "${id}" found`)
    }
  }, testId)
}

async function seedTestProject(request: any) {
  const response = await request.post(`${API_URL}/api/testing/seed-project/`)
  
  if (!response.ok()) {
    const errorText = await response.text()
    console.error(`❌ Failed to seed test project: ${response.status()} ${response.statusText()}`)
    console.error(`Response: ${errorText}`)
    throw new Error(`Failed to seed test project: ${response.status()}`)
  }
  
  const data = await response.json()
  console.log(`✅ Test project created: ID=${data.id}, Token=${data.share_token}`)
  
  return data
}

test.describe('Public Shared Project View', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('Should load public shared project and display nodes', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)

    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })

    await expect(page.locator('h1, h2').first()).toBeVisible()

    const ctaButton = page.getByTestId('cta-build-plan')
    await expect(ctaButton).toBeVisible()

    await page.waitForTimeout(2000)
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 5000 })

    const nodeCount = await nodes.count()
    expect(nodeCount).toBeGreaterThanOrEqual(2)
  })

  test('Should open sidebar when clicking a node in read-only mode', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)

    await page.waitForTimeout(2000)
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 5000 })

    await expect(page.getByTestId('node-sidebar')).not.toBeVisible()

    await reliableClickFirst(page, 'decision-node')

    await expect(page.getByTestId('node-sidebar')).toBeVisible({ timeout: 3000 })

    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible()

    const aiButton = page.getByText('Ask AI for Options')
    await expect(aiButton).not.toBeVisible()

    const generateButton = page.getByText('Generate Steps')
    await expect(generateButton).not.toBeVisible()
  })

  test('Should display FloatingDashboard with budget info', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)

    await page.waitForTimeout(2000)

    const currencyDisplay = page.locator('text=/\\$|zł|€|\\d+/')
    await expect(currencyDisplay.first()).toBeVisible({ timeout: 5000 })
  })

  test('Should be responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto(`/share/${testShareToken}`)

    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })

    const ctaButton = page.getByTestId('cta-build-plan')
    await expect(ctaButton).toBeVisible()

    await page.waitForTimeout(2000)
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 5000 })

    await reliableClickFirst(page, 'decision-node')

    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    const sidebarClasses = await sidebar.getAttribute('class')
    expect(sidebarClasses).toContain('bottom-0')
    expect(sidebarClasses).toContain('rounded-t-3xl')
  })
})

test.describe('NodeSidebar Refactoring Validation', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('Should display Details tab with all sections', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await page.waitForTimeout(3000)

    const node = page.getByTestId('decision-node').first()
    await expect(node).toBeVisible({ timeout: 10000 })
    
    await reliableClickFirst(page, 'decision-node')

    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    const detailsTab = page.getByText('Details').first()
    await expect(detailsTab).toBeVisible()

    await expect(sidebar.locator('input[type="text"], textarea').first()).toBeVisible()

    await expect(sidebar.getByText(/Comfort|Risk|Time|Pleasure/i).first()).toBeVisible()

    const taskCheckbox = sidebar.locator('input[type="checkbox"]').first()
    if (await taskCheckbox.isVisible()) {
      await expect(taskCheckbox).toBeDisabled()
    }
  })

  test('Should switch to Discussion tab and display comments', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await page.waitForTimeout(3000)

    const node = page.getByTestId('decision-node').first()
    await expect(node).toBeVisible({ timeout: 10000 })
    
    await reliableClickFirst(page, 'decision-node')

    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    const discussionTab = page.getByText('Discussion')
    await expect(discussionTab).toBeVisible()
    await discussionTab.click()

    await page.waitForTimeout(500)

    const commentForm = sidebar.locator('textarea, input[placeholder*="comment" i]').first()
    await expect(commentForm).toBeVisible()

    const commentContent = sidebar.locator('text=/Test User|comment/i').first()
    await expect(commentContent).toBeVisible()
  })
})
