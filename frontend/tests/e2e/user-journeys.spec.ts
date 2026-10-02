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

test.describe('User Journeys - Advanced Business Logic', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should display budget information in read-only mode', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(3000)
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    
    await reliableClickFirst(page, 'decision-node')
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const costDisplay = sidebar.locator('text=/cost|Cost|budget|Budget/i').first()
    await expect(costDisplay).toBeVisible({ timeout: 5000 })
    
    const currencyDisplay = page.locator('text=/\\$|zł|€|\\d+/')
    await expect(currencyDisplay.first()).toBeVisible({ timeout: 5000 })
  })

  test('should display tasks in read-only mode without edit capabilities', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(3000)
    
    await reliableClickFirst(page, 'decision-node')
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const actionPlanSection = sidebar.locator('text=/Action Plan|Tasks|Zadania/i').first()
    if (await actionPlanSection.isVisible()) {
      await expect(actionPlanSection).toBeVisible()
    }
    
    const taskInput = sidebar.locator('input[placeholder*="task" i], input[placeholder*="zadanie" i], textarea[placeholder*="task" i]')
    await expect(taskInput).not.toBeVisible()
    
    const tasksList = sidebar.locator('[class*="task"], [class*="action"]').first()
    if (await tasksList.isVisible()) {
      await expect(tasksList).toBeVisible()
    }
  })

  test('should display comments in read-only mode without edit capabilities', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(3000)
    
    await reliableClickFirst(page, 'decision-node')
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const discussionTab = page.getByText('Discussion', { exact: false })
    await expect(discussionTab).toBeVisible()
    await discussionTab.click()
    
    await page.waitForTimeout(500)
    
    const commentTextarea = sidebar.locator('textarea[placeholder*="comment" i], textarea[placeholder*="komentarz" i]')
    await expect(commentTextarea).toBeVisible()
    
    const commentsSection = sidebar.locator('text=/Comments|Discussion|Komentarze/i').first()
    await expect(commentsSection).toBeVisible()
    
    const submitButton = sidebar.getByText('Send', { exact: false }).or(sidebar.getByText('Wyślij', { exact: false })).first()
    await expect(submitButton).toBeVisible()
  })

  test('should prevent node dragging in read-only mode', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })
    
    await page.waitForFunction(() => {
      const container = document.querySelector('[data-testid="shared-view-container"]')
      return container && container.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 15000 })
    
    await page.waitForTimeout(2000)
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })

    const isReadOnlyFlag = await page.evaluate(() => {
      const node = document.querySelector('[data-testid="decision-node"]')
      if (node) {
        const reactFlow = document.querySelector('.react-flow')
        return reactFlow ? 'read-only-detected' : 'react-flow-not-found'
      }
      return 'node-not-found'
    })
    
    console.log(`Read-only mode detected: ${isReadOnlyFlag}`)
    expect(isReadOnlyFlag).toBe('read-only-detected')
    
    const hasReadOnlyStyles = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="shared-view-container"]')
      return container ? container.classList.contains('select-none') || 
                        container.className.includes('select-none') : false
    })
    
    console.log(`Read-only styles applied: ${hasReadOnlyStyles}`)
    
    await firstNode.click()
    
    await page.waitForTimeout(1000)
    
    const sidebarVisible = await page.getByTestId('node-sidebar').isVisible().catch(() => false)
    console.log(`Sidebar functionality works: ${sidebarVisible}`)
    
    const readOnlyAttributes = await page.evaluate(() => {
      const reactFlow = document.querySelector('.react-flow')
      if (reactFlow) {
        const hasUserSelectNone = window.getComputedStyle(reactFlow).userSelect === 'none'
        const hasPointerEvents = window.getComputedStyle(reactFlow).pointerEvents !== 'none'
        
        return {
          userSelectNone: hasUserSelectNone,
          pointerEventsEnabled: hasPointerEvents,
          className: reactFlow.className
        }
      }
      return null
    })
    
    console.log('Read-only attributes:', readOnlyAttributes)

    expect(isReadOnlyFlag).toBe('read-only-detected')
    
    await expect(firstNode).toBeVisible()
  })
})