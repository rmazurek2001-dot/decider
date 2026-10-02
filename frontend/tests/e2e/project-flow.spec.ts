import { test, expect, Page } from '@playwright/test'

const API_URL = 'http://localhost:8000'

// Test data - will be populated by beforeEach
let testProjectId: number
let testShareToken: string

/**
 * Reliable click function that bypasses React Flow edge overlays
 * Uses JavaScript evaluation to programmatically trigger click events
 */
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

/**
 * Reliable click for first matching element (when multiple nodes exist)
 */
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

test.describe('Public Shared Project View', () => {
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('Should load public shared project and display nodes', async ({ page }) => {
    // Navigate to shared project view
    await page.goto(`/share/${testShareToken}`)

    // Wait for the container to load
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })

    // Check if project title is displayed (data-agnostic - just check it exists)
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // Check if CTA button is visible
    const ctaButton = page.getByTestId('cta-build-plan')
    await expect(ctaButton).toBeVisible()

    // Check if at least one decision node is rendered
    await page.waitForTimeout(2000) // Wait for React Flow to render
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 5000 })

    // Verify we have at least 2 nodes (milestone + decision)
    const nodeCount = await nodes.count()
    expect(nodeCount).toBeGreaterThanOrEqual(2)
  })

  test('Should open sidebar when clicking a node in read-only mode', async ({ page }) => {
    // Navigate to shared project view
    await page.goto(`/share/${testShareToken}`)

    // Wait for nodes to load
    await page.waitForTimeout(2000)
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 5000 })

    // Sidebar should not be visible initially
    await expect(page.getByTestId('node-sidebar')).not.toBeVisible()

    // Click on the node using reliable click (bypasses React Flow edges)
    await reliableClickFirst(page, 'decision-node')

    // Wait for sidebar to appear
    await expect(page.getByTestId('node-sidebar')).toBeVisible({ timeout: 3000 })

    // Verify sidebar shows node details (data-agnostic)
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible()

    // Verify read-only mode: "Ask AI for Options" button should NOT be present
    const aiButton = page.getByText('Ask AI for Options')
    await expect(aiButton).not.toBeVisible()

    // Verify read-only mode: "Generate Steps" button should NOT be present
    const generateButton = page.getByText('Generate Steps')
    await expect(generateButton).not.toBeVisible()
  })

  test('Should display FloatingDashboard with budget info', async ({ page }) => {
    // Navigate to shared project view
    await page.goto(`/share/${testShareToken}`)

    // Wait for page to load
    await page.waitForTimeout(2000)

    // Check if FloatingDashboard is visible (data-agnostic)
    // Just check for any currency display or numeric values
    const currencyDisplay = page.locator('text=/\\$|zł|€|\\d+/')
    await expect(currencyDisplay.first()).toBeVisible({ timeout: 5000 })
  })

  test('Should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    // Navigate to shared project view
    await page.goto(`/share/${testShareToken}`)

    // Wait for container to load
    await expect(page.getByTestId('shared-view-container')).toBeVisible({ timeout: 10000 })

    // Check if CTA button is visible on mobile
    const ctaButton = page.getByTestId('cta-build-plan')
    await expect(ctaButton).toBeVisible()

    // Check if nodes are still visible on mobile
    await page.waitForTimeout(2000)
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 5000 })

    // Click a node using reliable click (bypasses React Flow edges)
    await reliableClickFirst(page, 'decision-node')

    // Sidebar should appear as bottom sheet on mobile
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    // Verify sidebar has mobile-specific classes (bottom sheet)
    const sidebarClasses = await sidebar.getAttribute('class')
    expect(sidebarClasses).toContain('bottom-0')
    expect(sidebarClasses).toContain('rounded-t-3xl')
  })
})

test.describe('NodeSidebar Refactoring Validation', () => {
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('Should display Details tab with all sections', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    // Wait longer for React Flow to render nodes
    await page.waitForTimeout(3000)

    // Wait for nodes to be visible
    const node = page.getByTestId('decision-node').first()
    await expect(node).toBeVisible({ timeout: 10000 })
    
    // Click on node to open sidebar using reliable click
    await reliableClickFirst(page, 'decision-node')

    // Wait for sidebar
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    // Verify Details tab is active by default
    const detailsTab = page.getByText('Details').first()
    await expect(detailsTab).toBeVisible()

    // Check for key sections in Details tab (data-agnostic)
    // Just verify the structure exists, not specific text
    await expect(sidebar.locator('input[type="text"], textarea').first()).toBeVisible()

    // Check for scores section (sliders or score displays)
    await expect(sidebar.getByText(/Comfort|Risk|Time|Pleasure/i).first()).toBeVisible()

    // Check for tasks section (node is selected, so tasks should be visible)
    // Data-agnostic: just check if task checkbox exists
    const taskCheckbox = sidebar.locator('input[type="checkbox"]').first()
    if (await taskCheckbox.isVisible()) {
      // Verify task checkbox is disabled in read-only mode
      await expect(taskCheckbox).toBeDisabled()
    }
  })

  test('Should switch to Discussion tab and display comments', async ({ page }) => {
    await page.goto(`/share/${testShareToken}`)
    
    // Wait longer for React Flow to render nodes
    await page.waitForTimeout(3000)

    // Wait for nodes to be visible
    const node = page.getByTestId('decision-node').first()
    await expect(node).toBeVisible({ timeout: 10000 })
    
    // Click on node to open sidebar using reliable click
    await reliableClickFirst(page, 'decision-node')

    // Wait for sidebar
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })

    // Click on Discussion tab
    const discussionTab = page.getByText('Discussion')
    await expect(discussionTab).toBeVisible()
    await discussionTab.click()

    // Wait for Discussion tab content to load
    await page.waitForTimeout(500)

    // Verify comment form is visible (read-only mode should still show form)
    const commentForm = sidebar.locator('textarea, input[placeholder*="comment" i]').first()
    await expect(commentForm).toBeVisible()

    // Verify existing comment is displayed (data-agnostic)
    // Just check if there's any comment content
    const commentContent = sidebar.locator('text=/Test User|comment/i').first()
    await expect(commentContent).toBeVisible()
  })
})
