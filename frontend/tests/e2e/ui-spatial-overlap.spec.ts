import { test, expect } from '@playwright/test'
import { waitForLayoutReady } from './test-helpers'

const API_URL = 'http://localhost:8000'

let testProjectId: number

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

test.describe('Spatial Overlap Tests - Professional Layout Quality', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
  })

  test('Visual Regression - Project view should match expected layout', async ({ page }) => {
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(5000)
    
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    await expect(page.getByTestId('decision-node').first()).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(2000)
    
    await expect(page).toHaveScreenshot('project-view-desktop.png', { 
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
      animations: 'disabled'
    })
    
    console.log('✅ Visual regression test completed - Layout matches expected baseline')
  })

  test('Visual Regression - Mobile responsive layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(5000)
    
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    await expect(page.getByTestId('decision-node').first()).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(2000)
    
    await expect(page).toHaveScreenshot('project-view-mobile.png', { 
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
      animations: 'disabled'
    })
    
    console.log('✅ Mobile visual regression test completed')
  })

  test('Visual Regression - Sidebar open state', async ({ page }) => {
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(5000)
    
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await firstNode.click()
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    await page.waitForTimeout(1000)
    
    await expect(page).toHaveScreenshot('project-view-sidebar-open.png', { 
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
      animations: 'disabled'
    })
    
    console.log('✅ Sidebar visual regression test completed')
  })
})