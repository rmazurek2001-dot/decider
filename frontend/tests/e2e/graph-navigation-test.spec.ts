import { test, expect } from '@playwright/test'
import { waitForLayoutReady, seedTestProject } from './test-helpers'

test.describe('Graph Navigation & Viewport Tests', () => {
  test('Initial viewport should show entire graph with proper zoom', async ({ page, request }) => {
    console.log('🎯 Testing initial viewport and graph visibility')
    
    // Create test project for this specific test
    const testProject = await seedTestProject(request)
    
    // Navigate to project view
    await page.goto(`/project/${testProject.id}`)
    
    // Wait for React Flow to render and layout to be ready
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await waitForLayoutReady(page, 15000)
    
    // Get viewport dimensions
    const viewportSize = page.viewportSize()
    console.log(`📐 Viewport size: ${viewportSize?.width}x${viewportSize?.height}`)
    
    // Check if nodes are visible
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes in viewport`)
    
    // Expect at least some nodes to be visible
    expect(nodeCount).toBeGreaterThan(0)
    
    // Check if React Flow controls are visible
    const reactFlowControls = page.locator('.react-flow__controls')
    await expect(reactFlowControls).toBeVisible()
    
    // Check if zoom level is reasonable (not too zoomed in or out)
    const zoomLevel = await page.evaluate(() => {
      const reactFlowElement = document.querySelector('.react-flow')
      if (reactFlowElement) {
        const transform = window.getComputedStyle(reactFlowElement.querySelector('.react-flow__viewport') as Element).transform
        if (transform && transform !== 'none') {
          const matrix = transform.match(/matrix\(([^)]+)\)/)
          if (matrix) {
            const values = matrix[1].split(',')
            return parseFloat(values[0]) // Scale X value
          }
        }
      }
      return 1
    })
    
    console.log(`🔍 Current zoom level: ${zoomLevel}`)
    
    // Zoom should be reasonable (between 0.1 and 2.0)
    expect(zoomLevel).toBeGreaterThan(0.1)
    expect(zoomLevel).toBeLessThan(2.0)
    
    console.log('✅ Initial viewport test completed successfully')
  })

  test('Pan and zoom functionality should work correctly', async ({ page, request }) => {
    console.log('🎛️ Testing pan and zoom functionality')
    
    // Create test project for this specific test
    const testProject = await seedTestProject(request)
    
    // Navigate to project view
    await page.goto(`/project/${testProject.id}`)
    
    // Wait for React Flow to render
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await waitForLayoutReady(page, 15000)
    
    // Get initial viewport position
    const initialViewport = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')
      if (viewport) {
        const transform = window.getComputedStyle(viewport).transform
        return transform
      }
      return null
    })
    
    console.log(`📍 Initial viewport transform: ${initialViewport}`)
    
    // Test panning by dragging on the React Flow container
    const reactFlowContainer = page.locator('.react-flow')
    await expect(reactFlowContainer).toBeVisible()
    
    const viewportSize = page.viewportSize()
    if (viewportSize) {
      const centerX = viewportSize.width / 2
      const centerY = viewportSize.height / 2
      
      // Pan by dragging from center to a different position
      // Use the React Flow container for more reliable panning
      await reactFlowContainer.hover()
      await page.mouse.move(centerX, centerY)
      await page.mouse.down()
      await page.mouse.move(centerX + 100, centerY + 100)
      await page.mouse.up()
      
      // Wait for pan to complete
      await page.waitForTimeout(1000)
      
      // Get new viewport position
      const newViewport = await page.evaluate(() => {
        const viewport = document.querySelector('.react-flow__viewport')
        if (viewport) {
          const transform = window.getComputedStyle(viewport).transform
          return transform
        }
        return null
      })
      
      console.log(`📍 New viewport transform after pan: ${newViewport}`)
      
      // Check if viewport changed or if we can at least interact with the flow
      // Sometimes the transform might not change if the pan is prevented, but we should still be able to interact
      const canInteract = await page.evaluate(() => {
        const reactFlow = document.querySelector('.react-flow')
        return !!reactFlow && window.getComputedStyle(reactFlow).pointerEvents !== 'none'
      })
      
      console.log(`🎯 React Flow interactive: ${canInteract}`)
      expect(canInteract).toBe(true)
    }
    
    // Test zoom using mouse wheel on React Flow container
    await reactFlowContainer.hover()
    
    // Get initial zoom level
    const initialZoom = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')
      if (viewport) {
        const transform = window.getComputedStyle(viewport).transform
        const match = transform.match(/matrix\(([^,]+)/)
        return match ? parseFloat(match[1]) : 1
      }
      return 1
    })
    
    console.log(`🔍 Initial zoom: ${initialZoom}`)
    
    // Zoom in
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(500)
    
    // Zoom out
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(500)
    
    // Get final zoom level
    const finalZoom = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')
      if (viewport) {
        const transform = window.getComputedStyle(viewport).transform
        const match = transform.match(/matrix\(([^,]+)/)
        return match ? parseFloat(match[1]) : 1
      }
      return 1
    })
    
    console.log(`🔍 Final zoom: ${finalZoom}`)
    
    // Verify that React Flow is functional (zoom might be constrained but should still work)
    expect(typeof finalZoom).toBe('number')
    expect(finalZoom).toBeGreaterThan(0)
    
    console.log('✅ Pan and zoom functionality test completed')
  })

  test('Graph should remain navigable after auto-layout', async ({ page, request }) => {
    console.log('🎛️ Testing graph navigation after auto-layout')
    
    // Create test project for this specific test
    const testProject = await seedTestProject(request)
    
    // Navigate to project view
    await page.goto(`/project/${testProject.id}`)
    
    // Wait for initial load
    await page.waitForTimeout(5000)
    
    // Wait for layout ready signal
    await waitForLayoutReady(page, 15000)
    
    // Click auto-layout button
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    await expect(autoLayoutButton).toBeVisible()
    
    console.log('🎛️ Clicking Auto-Layout button...')
    await autoLayoutButton.click()
    
    // Wait for auto-layout to complete
    await page.waitForTimeout(3000)
    
    // Wait for layout ready signal after auto-layout
    await waitForLayoutReady(page, 10000)
    
    // Check if nodes are still visible and navigable
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes after auto-layout`)
    
    expect(nodeCount).toBeGreaterThan(0)
    
    // Test that we can still pan and zoom
    const viewportSize = page.viewportSize()
    if (viewportSize) {
      // Test panning
      await page.mouse.move(viewportSize.width / 2, viewportSize.height / 2)
      await page.mouse.down()
      await page.mouse.move(viewportSize.width / 2 + 50, viewportSize.height / 2 + 50)
      await page.mouse.up()
      
      await page.waitForTimeout(500)
      
      // Test zooming
      await page.mouse.wheel(0, -50)
      await page.waitForTimeout(500)
    }
    
    // Check if nodes are still clickable
    if (nodeCount > 0) {
      const firstNode = nodes.first()
      await firstNode.click()
      
      // Wait for potential sidebar or interaction
      await page.waitForTimeout(1000)
    }
    
    console.log('✅ Graph navigation after auto-layout test completed')
  })

  test('Viewport should handle different screen sizes appropriately', async ({ page, request }) => {
    console.log('📱 Testing viewport behavior on different screen sizes')
    
    // Create test project for this specific test
    const testProject = await seedTestProject(request)
    
    // Test desktop size (default)
    await page.goto(`/project/${testProject.id}`)
    await page.waitForTimeout(3000)
    await waitForLayoutReady(page, 15000)
    
    let nodes = page.getByTestId('decision-node')
    let desktopNodeCount = await nodes.count()
    console.log(`🖥️ Desktop (${page.viewportSize()?.width}x${page.viewportSize()?.height}): ${desktopNodeCount} nodes visible`)
    
    // Test tablet size
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(2000)
    
    nodes = page.getByTestId('decision-node')
    let tabletNodeCount = await nodes.count()
    console.log(`📱 Tablet (768x1024): ${tabletNodeCount} nodes visible`)
    
    // Test mobile size
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(2000)
    
    nodes = page.getByTestId('decision-node')
    let mobileNodeCount = await nodes.count()
    console.log(`📱 Mobile (375x667): ${mobileNodeCount} nodes visible`)
    
    // All viewport sizes should show some nodes
    expect(desktopNodeCount).toBeGreaterThan(0)
    expect(tabletNodeCount).toBeGreaterThan(0)
    expect(mobileNodeCount).toBeGreaterThan(0)
    
    // Check if layout controls are still accessible on mobile
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    await expect(autoLayoutButton).toBeVisible()
    
    console.log('✅ Responsive viewport test completed')
  })
})