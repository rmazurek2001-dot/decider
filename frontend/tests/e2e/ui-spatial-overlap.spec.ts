import { test, expect } from '@playwright/test'
import { waitForLayoutReady } from './test-helpers'

const API_URL = 'http://localhost:8000'

// Test data - will be populated by beforeEach
let testProjectId: number

// Helper function to seed test data
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
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
  })

  // 🚨 BŁĄD 5 FIX: Prawdziwy Visual Regression Test zamiast bezużytecznych testów matematycznych
  test('Visual Regression - Project view should match expected layout', async ({ page }) => {
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render and layout to be ready
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    // Wait for nodes to be visible
    await expect(page.getByTestId('decision-node').first()).toBeVisible({ timeout: 10000 })
    
    // Additional wait for animations to complete
    await page.waitForTimeout(2000)
    
    // Take screenshot and compare with baseline
    await expect(page).toHaveScreenshot('project-view-desktop.png', { 
      maxDiffPixelRatio: 0.05, // 5% tolerance for minor differences
      threshold: 0.2, // Color threshold
      animations: 'disabled' // Disable animations for consistent screenshots
    })
    
    console.log('✅ Visual regression test completed - Layout matches expected baseline')
  })

  test('Visual Regression - Mobile responsive layout', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render and layout to be ready
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    // Wait for nodes to be visible
    await expect(page.getByTestId('decision-node').first()).toBeVisible({ timeout: 10000 })
    
    // Additional wait for animations to complete
    await page.waitForTimeout(2000)
    
    // Take screenshot and compare with baseline
    await expect(page).toHaveScreenshot('project-view-mobile.png', { 
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
      animations: 'disabled'
    })
    
    console.log('✅ Mobile visual regression test completed')
  })

  test('Visual Regression - Sidebar open state', async ({ page }) => {
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 10000 })
    
    // Click on first node to open sidebar
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await firstNode.click()
    
    // Wait for sidebar to open and Smart Auto-Pan to complete
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Wait for auto-pan animation to complete
    await page.waitForTimeout(1000)
    
    // Take screenshot with sidebar open
    await expect(page).toHaveScreenshot('project-view-sidebar-open.png', { 
      maxDiffPixelRatio: 0.05,
      threshold: 0.2,
      animations: 'disabled'
    })
    
    console.log('✅ Sidebar visual regression test completed')
  })
})