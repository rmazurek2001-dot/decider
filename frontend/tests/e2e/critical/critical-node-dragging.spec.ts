import { test, expect } from '@playwright/test'

const API_URL = 'http://localhost:8000'

async function seedHierarchicalProject(request: any) {
  const response = await request.post(`${API_URL}/api/testing/seed-project/`)
  
  if (!response.ok()) {
    const errorText = await response.text()
    console.error(`❌ Failed to seed test project: ${response.status()} ${response.statusText()}`)
    throw new Error(`Failed to seed test project: ${response.status()}`)
  }
  
  const data = await response.json()
  console.log(`✅ Test project created: ID=${data.id}, Token=${data.share_token}`)
  return data
}

test.describe('CRITICAL: Node Dragging', () => {
  let testProjectId: number
  let testShareToken: string

  test.beforeAll(async ({ request }) => {
    const projectData = await seedHierarchicalProject(request)
    testProjectId = projectData.id
    testShareToken = projectData.share_token
  })

  test('should allow physical node dragging with mouse', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Fizyczne przeciąganie węzłów w EDYTORZE')
    
    page.on('console', msg => {
      if (msg.text().includes('🔥') || msg.text().includes('TreeVisualizer') || msg.text().includes('onNodesChange')) {
        console.log('BROWSER LOG:', msg.text())
      }
    })
    
    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(2000)
    
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com')
      const passwordInput = page.locator('input[type="password"]')
      await passwordInput.fill('password123')
      const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Zaloguj")')
      await loginButton.click()
      await page.waitForTimeout(2000)
    }
    
    await page.goto(`http://localhost:5173/project/${testProjectId}`)
    await page.waitForTimeout(5000)
    
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    const autoLayoutButton = page.locator('[data-testid="auto-layout-button"]')
    if (await autoLayoutButton.isVisible()) {
      console.log('🎛️ Applying Auto-Layout with new DAGRE spacing...')
      await autoLayoutButton.click()
      await page.waitForTimeout(4000)
    }
    
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes`)
    expect(nodeCount).toBeGreaterThan(0)
    
    const firstNode = nodes.first()
    
    const initialStyle = await firstNode.getAttribute('style')
    console.log('📍 Initial node style:', initialStyle)
    
    const initialTransform = initialStyle?.match(/translate\(([^,]+),\s*([^)]+)\)/)
    if (!initialTransform) {
      throw new Error('❌ Cannot find initial transform in node style')
    }
    
    const initialX = parseFloat(initialTransform[1].replace('px', ''))
    const initialY = parseFloat(initialTransform[2].replace('px', ''))
    console.log(`📍 Initial position: (${initialX}, ${initialY})`)
    
    const nodeBox = await firstNode.boundingBox()
    if (!nodeBox) {
      throw new Error('❌ Cannot get node bounding box')
    }
    
    console.log('📐 Node bounding box:', nodeBox)
    
    const centerX = nodeBox.x + nodeBox.width / 2
    const centerY = nodeBox.y + nodeBox.height / 2
    
    console.log(`🎯 Starting drag from node center: (${centerX}, ${centerY})`)
    
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    
    const targetX = centerX + 150
    const targetY = centerY + 50
    
    console.log(`🖱️ Dragging node to: (${targetX}, ${targetY})`)
    await page.mouse.move(targetX, targetY, { steps: 10 })
    await page.mouse.up()
    
    await page.waitForTimeout(1000)
    
    const newStyle = await firstNode.getAttribute('style')
    console.log('📍 New node style:', newStyle)
    
    const newTransform = newStyle?.match(/translate\(([^,]+),\s*([^)]+)\)/)
    if (!newTransform) {
      throw new Error('❌ Cannot find new transform in node style')
    }
    
    const newX = parseFloat(newTransform[1].replace('px', ''))
    const newY = parseFloat(newTransform[2].replace('px', ''))
    console.log(`📍 New position: (${newX}, ${newY})`)
    
    const deltaX = Math.abs(newX - initialX)
    const deltaY = Math.abs(newY - initialY)
    
    console.log(`📏 Position change: ΔX=${deltaX}px, ΔY=${deltaY}px`)
    
    const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    expect(totalMovement).toBeGreaterThan(50)
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Węzeł reaguje na przeciąganie myszą')
  })

  test('should detect if nodes are draggable', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Sprawdzanie czy węzły są draggable w EDYTORZE')
    
    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(2000)
    
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com')
      const passwordInput = page.locator('input[type="password"]')
      await passwordInput.fill('password123')
      const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Zaloguj")')
      await loginButton.click()
      await page.waitForTimeout(2000)
    }
    
    await page.goto(`http://localhost:5173/project/${testProjectId}`)
    await page.waitForTimeout(5000)
    
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible()
    
    const reactFlow = page.locator('.react-flow')
    await expect(reactFlow).toBeVisible()
    
    const firstNode = nodes.first()
    const nodeClasses = await firstNode.getAttribute('class')
    const nodeStyle = await firstNode.getAttribute('style')
    
    console.log('🔍 Node classes:', nodeClasses)
    console.log('🔍 Node style:', nodeStyle)
    
    const computedStyle = await firstNode.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        cursor: style.cursor,
        pointerEvents: style.pointerEvents,
        position: style.position
      }
    })
    
    console.log('🔍 Computed style:', computedStyle)
    
    expect(computedStyle.pointerEvents).not.toBe('none')
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Węzły mają właściwe ustawienia draggable')
  })
})