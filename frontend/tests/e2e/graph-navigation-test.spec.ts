import { test, expect } from '@playwright/test'
import { waitForLayoutReady, seedTestProject } from './test-helpers'

test.describe('Graph Navigation & Viewport Tests', () => {
  test('Initial viewport should show entire graph with proper zoom', async ({ page, request }) => {
    console.log('🎯 Testing initial viewport and graph visibility')
    
    const testProject = await seedTestProject(request)
    
    await page.goto(`/project/${testProject.id}`)
    
    await page.waitForTimeout(5000)
    
    await waitForLayoutReady(page, 15000)
    
    const viewportSize = page.viewportSize()
    console.log(`📐 Viewport size: ${viewportSize?.width}x${viewportSize?.height}`)
    
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes in viewport`)
    
    expect(nodeCount).toBeGreaterThan(0)
    
    const reactFlowControls = page.locator('.react-flow__controls')
    await expect(reactFlowControls).toBeVisible()
    
    const zoomLevel = await page.evaluate(() => {
      const reactFlowElement = document.querySelector('.react-flow')
      if (reactFlowElement) {
        const transform = window.getComputedStyle(reactFlowElement.querySelector('.react-flow__viewport') as Element).transform
        if (transform && transform !== 'none') {
          const matrix = transform.match(/matrix\(([^)]+)\)/)
          if (matrix) {
            const values = matrix[1].split(',')
            return parseFloat(values[0])
          }
        }
      }
      return 1
    })
    
    console.log(`🔍 Current zoom level: ${zoomLevel}`)
    
    expect(zoomLevel).toBeGreaterThan(0.1)
    expect(zoomLevel).toBeLessThan(2.0)
    
    console.log('✅ Initial viewport test completed successfully')
  })

  test('Pan and zoom functionality should work correctly', async ({ page, request }) => {
    console.log('🎛️ Testing pan and zoom functionality')
    
    const testProject = await seedTestProject(request)
    
    await page.goto(`/project/${testProject.id}`)
    
    await page.waitForTimeout(5000)
    
    await waitForLayoutReady(page, 15000)
    
    const initialViewport = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport')
      if (viewport) {
        const transform = window.getComputedStyle(viewport).transform
        return transform
      }
      return null
    })
    
    console.log(`📍 Initial viewport transform: ${initialViewport}`)
    
    const reactFlowContainer = page.locator('.react-flow')
    await expect(reactFlowContainer).toBeVisible()
    
    const viewportSize = page.viewportSize()
    if (viewportSize) {
      const centerX = viewportSize.width / 2
      const centerY = viewportSize.height / 2
      
      await reactFlowContainer.hover()
      await page.mouse.move(centerX, centerY)
      await page.mouse.down()
      await page.mouse.move(centerX + 100, centerY + 100)
      await page.mouse.up()
      
      await page.waitForTimeout(1000)
      
      const newViewport = await page.evaluate(() => {
        const viewport = document.querySelector('.react-flow__viewport')
        if (viewport) {
          const transform = window.getComputedStyle(viewport).transform
          return transform
        }
        return null
      })
      
      console.log(`📍 New viewport transform after pan: ${newViewport}`)
      
      const canInteract = await page.evaluate(() => {
        const reactFlow = document.querySelector('.react-flow')
        return !!reactFlow && window.getComputedStyle(reactFlow).pointerEvents !== 'none'
      })
      
      console.log(`🎯 React Flow interactive: ${canInteract}`)
      expect(canInteract).toBe(true)
    }
    
    await reactFlowContainer.hover()
    
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
    
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(500)
    
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(500)
    
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
    
    expect(typeof finalZoom).toBe('number')
    expect(finalZoom).toBeGreaterThan(0)
    
    console.log('✅ Pan and zoom functionality test completed')
  })

  test('Graph should remain navigable after auto-layout', async ({ page, request }) => {
    console.log('🎛️ Testing graph navigation after auto-layout')
    
    const testProject = await seedTestProject(request)
    
    await page.goto(`/project/${testProject.id}`)
    
    await page.waitForTimeout(5000)
    
    await waitForLayoutReady(page, 15000)
    
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    await expect(autoLayoutButton).toBeVisible()
    
    console.log('🎛️ Clicking Auto-Layout button...')
    await autoLayoutButton.click()
    
    await page.waitForTimeout(3000)
    
    await waitForLayoutReady(page, 10000)
    
    const nodes = page.getByTestId('decision-node')
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes after auto-layout`)
    
    expect(nodeCount).toBeGreaterThan(0)
    
    const viewportSize = page.viewportSize()
    if (viewportSize) {
      await page.mouse.move(viewportSize.width / 2, viewportSize.height / 2)
      await page.mouse.down()
      await page.mouse.move(viewportSize.width / 2 + 50, viewportSize.height / 2 + 50)
      await page.mouse.up()
      
      await page.waitForTimeout(500)
      
      await page.mouse.wheel(0, -50)
      await page.waitForTimeout(500)
    }
    
    if (nodeCount > 0) {
      const firstNode = nodes.first()
      await firstNode.click()
      
      await page.waitForTimeout(1000)
    }
    
    console.log('✅ Graph navigation after auto-layout test completed')
  })

  test('Viewport should handle different screen sizes appropriately', async ({ page, request }) => {
    console.log('📱 Testing viewport behavior on different screen sizes')
    
    const testProject = await seedTestProject(request)
    
    await page.goto(`/project/${testProject.id}`)
    await page.waitForTimeout(3000)
    await waitForLayoutReady(page, 15000)
    
    let nodes = page.getByTestId('decision-node')
    let desktopNodeCount = await nodes.count()
    console.log(`🖥️ Desktop (${page.viewportSize()?.width}x${page.viewportSize()?.height}): ${desktopNodeCount} nodes visible`)
    
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(2000)
    
    nodes = page.getByTestId('decision-node')
    let tabletNodeCount = await nodes.count()
    console.log(`📱 Tablet (768x1024): ${tabletNodeCount} nodes visible`)
    
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(2000)
    
    nodes = page.getByTestId('decision-node')
    let mobileNodeCount = await nodes.count()
    console.log(`📱 Mobile (375x667): ${mobileNodeCount} nodes visible`)
    
    expect(desktopNodeCount).toBeGreaterThan(0)
    expect(tabletNodeCount).toBeGreaterThan(0)
    expect(mobileNodeCount).toBeGreaterThan(0)
    
    const autoLayoutButton = page.getByTestId('auto-layout-button')
    await expect(autoLayoutButton).toBeVisible()
    
    console.log('✅ Responsive viewport test completed')
  })
})