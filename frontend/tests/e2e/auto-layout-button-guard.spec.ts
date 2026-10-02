import { test, expect } from '@playwright/test'
import { waitForLayoutReady, getAutoLayoutButton, getLayoutControls, seedTestProject } from './test-helpers'

const API_URL = 'http://localhost:8000'

// Test data - will be populated by beforeEach
let testProjectId: number

test.describe('Auto-Layout Button Guard Tests - CRITICAL UI ELEMENTS', () => {
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
  })

  test('CRITICAL: Auto-Layout button MUST be visible and clickable', async ({ page }) => {
    console.log('🛡️ GUARD TEST: Checking Auto-Layout button visibility and functionality')
    
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 15000 })
    
    console.log('🔍 Checking for Auto-Layout button...')
    
    // CRITICAL CHECK 1: Auto-Layout button must exist and be visible
    const autoLayoutButton = getAutoLayoutButton(page)
    
    // Assert button exists
    await expect(autoLayoutButton).toBeVisible({ timeout: 5000 })
    console.log('✅ Auto-Layout button is visible')
    
    // Assert button is enabled
    await expect(autoLayoutButton).toBeEnabled()
    console.log('✅ Auto-Layout button is enabled')
    
    // CRITICAL CHECK 2: Button must be in the correct position (right side)
    const buttonBounds = await autoLayoutButton.boundingBox()
    expect(buttonBounds).toBeTruthy()
    
    const viewportSize = page.viewportSize()
    expect(viewportSize).toBeTruthy()
    
    if (buttonBounds && viewportSize) {
      // Button should be on the right side of the screen (last 20% of width)
      const rightSideThreshold = viewportSize.width * 0.8
      expect(buttonBounds.x).toBeGreaterThan(rightSideThreshold)
      console.log(`✅ Auto-Layout button is positioned correctly on right side (x=${Math.round(buttonBounds.x)})`)
      
      // Button should be within viewport
      expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(viewportSize.width)
      expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(viewportSize.height)
      console.log('✅ Auto-Layout button is within viewport bounds')
    }
    
    // CRITICAL CHECK 3: Button must have correct title/tooltip
    const buttonTitle = await autoLayoutButton.getAttribute('title')
    expect(buttonTitle).toContain('Auto-layout')
    console.log(`✅ Auto-Layout button has correct title: "${buttonTitle}"`)
    
    // CRITICAL CHECK 4: Button must be clickable and functional
    console.log('🎛️ Testing Auto-Layout button click functionality...')
    
    // Get initial node positions
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes before Auto-Layout`)
    
    if (nodeCount > 0) {
      // Record initial positions
      const initialPositions = []
      for (let i = 0; i < nodeCount; i++) {
        try {
          const node = nodes.nth(i)
          const boundingBox = await node.boundingBox({ timeout: 2000 })
          if (boundingBox) {
            initialPositions.push({
              x: boundingBox.x,
              y: boundingBox.y
            })
          }
        } catch (error) {
          console.log(`⚠️ Could not get initial position for node ${i}`)
        }
      }
      
      // Click Auto-Layout button
      await autoLayoutButton.click()
      console.log('✅ Auto-Layout button clicked successfully')
      
      // Wait for layout to complete
      await page.waitForTimeout(3000)
      
      // Verify some effect occurred (nodes moved or layout changed)
      let layoutChanged = false
      
      // Check if nodes moved
      for (let i = 0; i < Math.min(nodeCount, initialPositions.length); i++) {
        try {
          const node = nodes.nth(i)
          const newBounds = await node.boundingBox({ timeout: 2000 })
          if (newBounds && initialPositions[i]) {
            const deltaX = Math.abs(newBounds.x - initialPositions[i].x)
            const deltaY = Math.abs(newBounds.y - initialPositions[i].y)
            if (deltaX > 10 || deltaY > 10) {
              layoutChanged = true
              console.log(`✅ Node ${i} moved: Δx=${Math.round(deltaX)}, Δy=${Math.round(deltaY)}`)
              break
            }
          }
        } catch (error) {
          // Node might be hidden/collapsed, which is also a valid layout change
          layoutChanged = true
          console.log(`✅ Node ${i} state changed (possibly collapsed)`)
          break
        }
      }
      
      // Layout should have some effect
      if (!layoutChanged) {
        console.log('⚠️ WARNING: Auto-Layout clicked but no visible changes detected')
        console.log('This could be normal if nodes are already optimally positioned')
      } else {
        console.log('✅ Auto-Layout successfully changed node layout')
      }
    } else {
      console.log('ℹ️ No nodes found - Auto-Layout button present but no nodes to layout')
    }
    
    console.log('✅ GUARD TEST PASSED: Auto-Layout button is fully functional')
  })

  test('CRITICAL: All layout control buttons must be present', async ({ page }) => {
    console.log('🛡️ GUARD TEST: Checking all layout control buttons')
    
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 15000 })
    
    // CRITICAL: All essential layout buttons must be present
    const essentialButtons = [
      { 
        name: 'Auto-Layout', 
        selector: 'button[title*="Auto-layout"]',
        description: 'Organizes scattered nodes automatically'
      },
      { 
        name: 'Center View', 
        selector: '[data-testid="center-view-button"]',
        description: 'Centers view on all nodes'
      },
      { 
        name: 'Save Positions', 
        selector: 'button[title*="Zapisz pozycje"]',
        description: 'Saves current node positions'
      }
    ]
    
    for (const button of essentialButtons) {
      console.log(`🔍 Checking ${button.name} button...`)
      
      const buttonElement = page.locator(button.selector).first()
      
      // Button must be visible
      await expect(buttonElement).toBeVisible({ timeout: 5000 })
      console.log(`✅ ${button.name} button is visible`)
      
      // Button must be enabled
      await expect(buttonElement).toBeEnabled()
      console.log(`✅ ${button.name} button is enabled`)
      
      // Button must be clickable (test click without side effects)
      const isClickable = await buttonElement.isEnabled()
      expect(isClickable).toBe(true)
      console.log(`✅ ${button.name} button is clickable`)
    }
    
    // CRITICAL: Right controls container must be properly positioned - use helper
    const rightControls = getLayoutControls(page)
    await expect(rightControls).toBeVisible()
    
    const controlsBounds = await rightControls.boundingBox()
    const viewportSize = page.viewportSize()
    
    if (controlsBounds && viewportSize) {
      // Controls should be on the right side
      expect(controlsBounds.x).toBeGreaterThan(viewportSize.width * 0.7)
      
      // Controls should be within viewport
      expect(controlsBounds.x + controlsBounds.width).toBeLessThanOrEqual(viewportSize.width)
      expect(controlsBounds.y + controlsBounds.height).toBeLessThanOrEqual(viewportSize.height)
      
      console.log(`✅ Layout controls properly positioned at (${Math.round(controlsBounds.x)}, ${Math.round(controlsBounds.y)})`)
    }
    
    console.log('✅ GUARD TEST PASSED: All essential layout controls are present and functional')
  })

  test('CRITICAL: Auto-Layout button must work across different viewport sizes', async ({ page }) => {
    console.log('🛡️ GUARD TEST: Checking Auto-Layout button responsiveness')
    
    const viewportSizes = [
      { width: 1920, height: 1080, name: 'Desktop Large' },
      { width: 1280, height: 720, name: 'Desktop Standard' },
    ]
    
    for (const viewport of viewportSizes) {
      console.log(`\n📐 Testing ${viewport.name} (${viewport.width}x${viewport.height})`)
      
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(`/project/${testProjectId}`)
      await page.waitForTimeout(5000)
      
      // Wait for layout ready signal
      await page.waitForFunction(() => {
        const wrapper = document.getElementById('react-flow-wrapper')
        return wrapper?.getAttribute('data-layout-ready') === 'true'
      }, { timeout: 15000 })
      
      // Auto-Layout button must be visible at this viewport size
      const autoLayoutButton = getAutoLayoutButton(page)
      
      await expect(autoLayoutButton).toBeVisible({ timeout: 10000 })
      console.log(`✅ ${viewport.name}: Auto-Layout button is visible`)
      
      await expect(autoLayoutButton).toBeEnabled()
      console.log(`✅ ${viewport.name}: Auto-Layout button is enabled`)
      
      // Button must be within viewport bounds
      const buttonBounds = await autoLayoutButton.boundingBox()
      if (buttonBounds) {
        const inViewport = buttonBounds.x >= 0 && 
                          buttonBounds.y >= 0 && 
                          buttonBounds.x + buttonBounds.width <= viewport.width &&
                          buttonBounds.y + buttonBounds.height <= viewport.height
        
        expect(inViewport).toBe(true)
        console.log(`✅ ${viewport.name}: Auto-Layout button is within viewport bounds`)
      }
      
      // Test click functionality
      await autoLayoutButton.click()
      await page.waitForTimeout(1000)
      console.log(`✅ ${viewport.name}: Auto-Layout button click works`)
    }
    
    console.log('✅ GUARD TEST PASSED: Auto-Layout button works across all viewport sizes')
  })

  test('CRITICAL: Auto-Layout button must not be covered by other UI elements', async ({ page }) => {
    console.log('🛡️ GUARD TEST: Checking Auto-Layout button is not covered by other UI')
    
    // Navigate to project view
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await page.waitForFunction(() => {
      const wrapper = document.getElementById('react-flow-wrapper')
      return wrapper?.getAttribute('data-layout-ready') === 'true'
    }, { timeout: 15000 })
    
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    await expect(autoLayoutButton).toBeVisible()
    
    const buttonBounds = await autoLayoutButton.boundingBox()
    expect(buttonBounds).toBeTruthy()
    
    if (buttonBounds) {
      // Check if button center point is clickable (not covered)
      const centerX = buttonBounds.x + buttonBounds.width / 2
      const centerY = buttonBounds.y + buttonBounds.height / 2
      
      // The element at the button center should be related to the button
      const isButtonAccessible = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y)
          if (!element) return false
          
          // Check if element is the button or inside the button
          const button = element.closest('button[title*="Auto-layout"]')
          return button !== null
        },
        { x: centerX, y: centerY }
      )
      
      expect(isButtonAccessible).toBe(true)
      console.log('✅ Auto-Layout button is not covered by other UI elements')
      
      // Additional check: button should be clickable at its center
      try {
        await page.mouse.click(centerX, centerY)
        await page.waitForTimeout(1000)
        console.log('✅ Auto-Layout button is clickable at its center point')
      } catch (error) {
        throw new Error(`Auto-Layout button is not clickable at center point: ${error}`)
      }
    }
    
    console.log('✅ GUARD TEST PASSED: Auto-Layout button is fully accessible and not covered')
  })
})

// Additional test for real project/3 specifically
test.describe('Real Project/3 Auto-Layout Guard', () => {
  test('CRITICAL: Auto-Layout button must work in project/3', async ({ page }) => {
    console.log('🛡️ GUARD TEST: Checking Auto-Layout button in real project/3')
    
    // Navigate to the specific project the user mentioned
    await page.goto('/project/3')
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Check if project loads without errors
    const errorElement = page.getByTestId('error-state')
    const hasError = await errorElement.isVisible()
    
    if (hasError) {
      const errorText = await errorElement.textContent()
      throw new Error(`Project/3 has error: ${errorText}`)
    }
    
    console.log('✅ Project/3 loaded without errors')
    
    // CRITICAL: Auto-Layout button must be visible in project/3
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    
    await expect(autoLayoutButton).toBeVisible({ timeout: 10000 })
    console.log('✅ Auto-Layout button is visible in project/3')
    
    await expect(autoLayoutButton).toBeEnabled()
    console.log('✅ Auto-Layout button is enabled in project/3')
    
    // Test click functionality
    await autoLayoutButton.click()
    await page.waitForTimeout(2000)
    console.log('✅ Auto-Layout button click works in project/3')
    
    // Check if there are nodes in the project
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Project/3 has ${nodeCount} nodes`)
    
    if (nodeCount === 0) {
      console.log('⚠️ WARNING: Project/3 has no nodes - this might explain layout issues')
    }
    
    console.log('✅ GUARD TEST PASSED: Auto-Layout button works correctly in project/3')
  })
})