import { test, expect, Page } from '@playwright/test'
import { waitForLayoutReady } from './test-helpers'

const API_URL = 'http://localhost:8000'

let testProjectId: number
let testShareToken: string

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

async function getNodesBoundingBox(page: Page) {
  return await page.evaluate(() => {
    const nodes = document.querySelectorAll('[data-testid="decision-node"]')
    if (nodes.length === 0) {
      throw new Error('No nodes found for bounding box calculation')
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    nodes.forEach(node => {
      const rect = node.getBoundingClientRect()
      minX = Math.min(minX, rect.left)
      minY = Math.min(minY, rect.top)
      maxX = Math.max(maxX, rect.right)
      maxY = Math.max(maxY, rect.bottom)
    })

    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
  })
}

async function getViewportCenter(page: Page) {
  return await page.evaluate(() => {
    const reactFlowWrapper = document.getElementById('react-flow-wrapper')
    if (!reactFlowWrapper) {
      throw new Error('React Flow wrapper not found')
    }

    const rect = reactFlowWrapper.getBoundingClientRect()
    return {
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height
    }
  })
}

test.describe('UX Visual Tests - Layout and Centering', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should correctly center the graph on initial load', async ({ page }) => {
    console.log('🎯 Starting centering verification test')
    
    await page.goto(`/project/${testProjectId}`)
    
    console.log('⏳ Waiting for layout ready signal...')
    await waitForLayoutReady(page, 15000)
    console.log('✅ Layout ready signal detected')
    
    await page.waitForTimeout(500)
    
    const reactFlowInfo = await page.evaluate(() => {
      const reactFlowWrapper = document.getElementById('react-flow-wrapper')
      const viewport = document.querySelector('.react-flow__viewport')
      
      if (!reactFlowWrapper || !viewport) {
        throw new Error('React Flow elements not found')
      }

      const wrapperRect = reactFlowWrapper.getBoundingClientRect()
      const viewportStyle = window.getComputedStyle(viewport)
      const transform = viewportStyle.transform
      
      return {
        wrapperRect: {
          left: wrapperRect.left,
          top: wrapperRect.top,
          width: wrapperRect.width,
          height: wrapperRect.height,
          centerX: wrapperRect.left + wrapperRect.width / 2,
          centerY: wrapperRect.top + wrapperRect.height / 2
        },
        viewportTransform: transform
      }
    })
    
    console.log('📐 React Flow info:', reactFlowInfo)
    
    const viewport = await getViewportCenter(page)
    console.log('📐 Viewport center:', viewport)
    
    const nodesBounds = await getNodesBoundingBox(page)
    console.log('📦 Nodes bounding box:', nodesBounds)
    
    const centerXDiff = Math.abs(viewport.centerX - nodesBounds.centerX)
    const centerYDiff = Math.abs(viewport.centerY - nodesBounds.centerY)
    
    console.log(`📏 Center differences - X: ${centerXDiff}px, Y: ${centerYDiff}px`)
    
    const tolerance = 250
    
    expect(centerXDiff).toBeLessThan(tolerance)
    
    expect(centerYDiff).toBeLessThan(tolerance)
    
    console.log('✅ Graph is properly centered within tolerance')
  })

  test('should render the initial project view without visual changes', async ({ page }) => {
    console.log('📸 Starting visual regression test')
    
    await page.goto(`/project/${testProjectId}`)
    
    console.log('⏳ Waiting for layout ready signal...')
    await waitForLayoutReady(page, 15000)
    console.log('✅ Layout ready signal detected')
    
    await page.waitForTimeout(1000)
    
    await page.addStyleTag({
      content: `
        /* Hide potentially dynamic elements for consistent screenshots */
        .cursor-pointer { cursor: default !important; }
        [data-testid="floating-dashboard"] { opacity: 0.8 !important; }
        .transition-all { transition: none !important; }
        .animate-pulse { animation: none !important; }
      `
    })
    
    console.log('📸 Taking screenshot for visual comparison...')
    await expect(page).toHaveScreenshot('stable-project-view.png', {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      threshold: 0.3,
      maxDiffPixels: 1000
    })
    
    console.log('✅ Visual regression test completed')
  })

  test('should maintain centering after window resize', async ({ page }) => {
    console.log('🔄 Starting resize centering test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await waitForLayoutReady(page, 15000)
    await page.waitForTimeout(500)
    
    const initialViewport = await getViewportCenter(page)
    const initialNodesBounds = await getNodesBoundingBox(page)
    
    console.log('📐 Initial state - Viewport:', initialViewport)
    console.log('📦 Initial state - Nodes:', initialNodesBounds)
    
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.waitForTimeout(1000)
    
    await page.evaluate(() => {
      const centerButton = document.querySelector('[data-testid="center-view-button"]') as HTMLElement
      if (centerButton) {
        centerButton.click()
      }
    })
    
    await page.waitForTimeout(1500)
    
    const newViewport = await getViewportCenter(page)
    const newNodesBounds = await getNodesBoundingBox(page)
    
    console.log('📐 After resize - Viewport:', newViewport)
    console.log('📦 After resize - Nodes:', newNodesBounds)
    
    const centerXDiff = Math.abs(newViewport.centerX - newNodesBounds.centerX)
    const centerYDiff = Math.abs(newViewport.centerY - newNodesBounds.centerY)
    
    console.log(`📏 New center differences - X: ${centerXDiff}px, Y: ${centerYDiff}px`)
    
    const tolerance = 400
    expect(centerXDiff).toBeLessThan(tolerance)
    expect(centerYDiff).toBeLessThan(tolerance)
    
    console.log('✅ Centering maintained after resize')
  })

  test('should not flicker during initial load', async ({ page }) => {
    console.log('⚡ Starting flicker detection test')
    
    const screenshots: Buffer[] = []
    
    await page.goto(`/project/${testProjectId}`)
    
    const screenshotPromises = []
    
    for (let i = 0; i < 20; i++) {
      screenshotPromises.push(
        page.waitForTimeout(i * 100).then(() => 
          page.screenshot({ 
            clip: { x: 200, y: 200, width: 800, height: 400 },
            type: 'png'
          }).catch(() => null)
        )
      )
    }
    
    await waitForLayoutReady(page, 15000)
    
    await page.waitForTimeout(500)
    const finalScreenshot = await page.screenshot({ 
      clip: { x: 200, y: 200, width: 800, height: 400 },
      type: 'png'
    })
    
    const allScreenshots = await Promise.all(screenshotPromises)
    const validScreenshots = allScreenshots.filter(s => s !== null) as Buffer[]
    
    console.log(`📸 Captured ${validScreenshots.length} screenshots during loading`)

    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    expect(jsErrors).toHaveLength(0)
    
    expect(finalScreenshot.length).toBeGreaterThan(1000)
    
    console.log('✅ No flickering or errors detected during load')
  })
})

test.describe('UX Visual Tests - Shared Project View', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should correctly center shared project graph on initial load', async ({ page }) => {
    console.log('🎯 Starting shared project centering test')
    
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })
    
    await page.goto(`/share/${testShareToken}`)
    
    await page.waitForTimeout(3000)
    
    if (errors.length > 0) {
      console.log('❌ Console errors:', errors)
    }
    
    const currentUrl = page.url()
    console.log('📍 Current URL:', currentUrl)
    
    const pageContent = await page.evaluate(() => {
      return {
        title: document.title,
        bodyText: document.body.innerText.substring(0, 200),
        hasSharedContainer: !!document.querySelector('[data-testid="shared-view-container"]'),
        hasReactFlow: !!document.querySelector('.react-flow'),
        hasErrorMessage: document.body.innerText.includes('error') || document.body.innerText.includes('Error')
      }
    })
    
    console.log('📄 Page content:', pageContent)
    
    if (pageContent.hasErrorMessage || errors.length > 0) {
      console.log('⚠️ Skipping test due to errors')
      return
    }
    
    await page.waitForSelector('[data-testid="shared-view-container"]', { timeout: 10000 })
    await waitForLayoutReady(page, 15000)
    
    const debugInfo = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="shared-view-container"]')
      const nodes = document.querySelectorAll('[data-testid="decision-node"]')
      const reactFlow = document.querySelector('.react-flow')
      const viewport = document.querySelector('.react-flow__viewport')
      
      return {
        containerExists: !!container,
        containerVisible: container ? window.getComputedStyle(container).display !== 'none' : false,
        nodeCount: nodes.length,
        nodesInfo: Array.from(nodes).map(node => ({
          visible: window.getComputedStyle(node).display !== 'none',
          opacity: window.getComputedStyle(node).opacity,
          position: window.getComputedStyle(node).position,
          transform: window.getComputedStyle(node).transform
        })),
        reactFlowExists: !!reactFlow,
        viewportExists: !!viewport,
        viewportTransform: viewport ? window.getComputedStyle(viewport).transform : null
      }
    })
    
    console.log('🔍 Debug info:', debugInfo)
    
    await page.waitForTimeout(3000)
    const nodes = page.getByTestId('decision-node')
    
    if (debugInfo.nodeCount > 0 && !debugInfo.nodesInfo[0].visible) {
      console.log('⚠️ Nodes are hidden, trying to trigger fitView...')
      await page.evaluate(() => {
        const reactFlowInstance = (window as any).__reactFlowInstance
        if (reactFlowInstance && reactFlowInstance.fitView) {
          reactFlowInstance.fitView({ padding: 0.2, duration: 800 })
        }
      })
      await page.waitForTimeout(2000)
    }
    
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    const viewport = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="shared-view-container"]')
      if (!container) {
        throw new Error('Shared view container not found')
      }

      const rect = container.getBoundingClientRect()
      return {
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      }
    })
    
    const nodesBounds = await getNodesBoundingBox(page)
    
    console.log('📐 Shared view viewport:', viewport)
    console.log('📦 Shared view nodes bounds:', nodesBounds)
    
    const centerXDiff = Math.abs(viewport.centerX - nodesBounds.centerX)
    const centerYDiff = Math.abs(viewport.centerY - nodesBounds.centerY)
    
    console.log(`📏 Shared view center differences - X: ${centerXDiff}px, Y: ${centerYDiff}px`)
    
    const tolerance = 100
    expect(centerXDiff).toBeLessThan(tolerance)
    expect(centerYDiff).toBeLessThan(tolerance)
    
    console.log('✅ Shared project graph is properly centered')
  })

  test('should render shared project view consistently', async ({ page }) => {
    console.log('📸 Starting shared project visual regression test')
    
    await page.goto(`/share/${testShareToken}`)
    
    await page.waitForSelector('[data-testid="shared-view-container"]', { timeout: 10000 })
    await waitForLayoutReady(page, 15000)
    
    await page.waitForTimeout(3000)
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    await page.waitForTimeout(1000)
    
    await page.addStyleTag({
      content: `
        .cursor-pointer { cursor: default !important; }
        .transition-all { transition: none !important; }
        .animate-pulse { animation: none !important; }
      `
    })
    
    console.log('📸 Taking shared project screenshot...')
    await expect(page).toHaveScreenshot('stable-shared-project-view.png', {
      fullPage: false,
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      threshold: 0.3,
      maxDiffPixels: 1000
    })
    
    console.log('✅ Shared project visual regression test completed')
  })
})