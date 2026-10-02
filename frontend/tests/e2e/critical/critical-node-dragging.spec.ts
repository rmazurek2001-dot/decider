import { test, expect } from '@playwright/test'

const API_URL = 'http://localhost:8000'

// Helper function to seed test data
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

/**
 * 🚨 KRYTYCZNY TEST: PRZECIĄGANIE WĘZŁÓW
 * 
 * Ten test sprawdza czy użytkownik może FIZYCZNIE przeciągać węzły myszką.
 * Używa page.mouse API do symulacji prawdziwych ruchów myszy.
 * 
 * ZAKAZ: force: true, evaluate, click()
 * WYMAGANE: Fizyczne ruchy myszy, sprawdzenie pozycji węzła w DOM
 */

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
    
    // Listen to console logs from browser
    page.on('console', msg => {
      if (msg.text().includes('🔥') || msg.text().includes('TreeVisualizer') || msg.text().includes('onNodesChange')) {
        console.log('BROWSER LOG:', msg.text())
      }
    })
    
    // Go to dashboard first
    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(2000)
    
    // Login if needed
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com')
      const passwordInput = page.locator('input[type="password"]')
      await passwordInput.fill('password123')
      const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Zaloguj")')
      await loginButton.click()
      await page.waitForTimeout(2000)
    }
    
    // Go to project EDITOR (NOT SharedProjectView!)
    await page.goto(`http://localhost:5173/project/${testProjectId}`)
    await page.waitForTimeout(5000)
    
    // Wait for nodes to load
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    // CRITICAL: Click Auto-Layout to apply new DAGRE spacing
    const autoLayoutButton = page.locator('[data-testid="auto-layout-button"]')
    if (await autoLayoutButton.isVisible()) {
      console.log('🎛️ Applying Auto-Layout with new DAGRE spacing...')
      await autoLayoutButton.click()
      await page.waitForTimeout(4000) // Wait for layout to complete
    }
    
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes`)
    expect(nodeCount).toBeGreaterThan(0)
    
    // Get first node
    const firstNode = nodes.first()
    
    // Get initial position from style attribute
    const initialStyle = await firstNode.getAttribute('style')
    console.log('📍 Initial node style:', initialStyle)
    
    // Extract initial position from transform
    const initialTransform = initialStyle?.match(/translate\(([^,]+),\s*([^)]+)\)/)
    if (!initialTransform) {
      throw new Error('❌ Cannot find initial transform in node style')
    }
    
    const initialX = parseFloat(initialTransform[1].replace('px', ''))
    const initialY = parseFloat(initialTransform[2].replace('px', ''))
    console.log(`📍 Initial position: (${initialX}, ${initialY})`)
    
    // Get node bounding box for mouse positioning
    const nodeBox = await firstNode.boundingBox()
    if (!nodeBox) {
      throw new Error('❌ Cannot get node bounding box')
    }
    
    console.log('📐 Node bounding box:', nodeBox)
    
    // Calculate center of node
    const centerX = nodeBox.x + nodeBox.width / 2
    const centerY = nodeBox.y + nodeBox.height / 2
    
    console.log(`🎯 Starting drag from node center: (${centerX}, ${centerY})`)
    
    // PHYSICAL MOUSE DRAG - NO FORCE, NO SHORTCUTS
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    
    // Drag 150px to the right
    const targetX = centerX + 150
    const targetY = centerY + 50
    
    console.log(`🖱️ Dragging node to: (${targetX}, ${targetY})`)
    await page.mouse.move(targetX, targetY, { steps: 10 })
    await page.mouse.up()
    
    // Wait for position to update
    await page.waitForTimeout(1000)
    
    // Get new position from style attribute
    const newStyle = await firstNode.getAttribute('style')
    console.log('📍 New node style:', newStyle)
    
    // Extract new position from transform
    const newTransform = newStyle?.match(/translate\(([^,]+),\s*([^)]+)\)/)
    if (!newTransform) {
      throw new Error('❌ Cannot find new transform in node style')
    }
    
    const newX = parseFloat(newTransform[1].replace('px', ''))
    const newY = parseFloat(newTransform[2].replace('px', ''))
    console.log(`📍 New position: (${newX}, ${newY})`)
    
    // CRITICAL ASSERTION: Node position MUST have changed significantly
    const deltaX = Math.abs(newX - initialX)
    const deltaY = Math.abs(newY - initialY)
    
    console.log(`📏 Position change: ΔX=${deltaX}px, ΔY=${deltaY}px`)
    
    // Node must have moved at least 50px in any direction
    const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    expect(totalMovement).toBeGreaterThan(50)
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Węzeł reaguje na przeciąganie myszą')
  })

  test('should detect if nodes are draggable', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Sprawdzanie czy węzły są draggable w EDYTORZE')
    
    // Go to dashboard first
    await page.goto('http://localhost:5173/')
    await page.waitForTimeout(2000)
    
    // Login if needed
    const emailInput = page.locator('input[type="email"]')
    if (await emailInput.isVisible()) {
      await emailInput.fill('test@example.com')
      const passwordInput = page.locator('input[type="password"]')
      await passwordInput.fill('password123')
      const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Zaloguj")')
      await loginButton.click()
      await page.waitForTimeout(2000)
    }
    
    // Go to project EDITOR (NOT SharedProjectView!)
    await page.goto(`http://localhost:5173/project/${testProjectId}`)
    await page.waitForTimeout(5000)
    
    const nodes = page.locator('.react-flow__node')
    await expect(nodes.first()).toBeVisible()
    
    // Check if React Flow has nodesDraggable enabled
    const reactFlow = page.locator('.react-flow')
    await expect(reactFlow).toBeVisible()
    
    // Try to get draggable attribute or class
    const firstNode = nodes.first()
    const nodeClasses = await firstNode.getAttribute('class')
    const nodeStyle = await firstNode.getAttribute('style')
    
    console.log('🔍 Node classes:', nodeClasses)
    console.log('🔍 Node style:', nodeStyle)
    
    // Check if node has draggable styling (cursor should be grab or move)
    const computedStyle = await firstNode.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        cursor: style.cursor,
        pointerEvents: style.pointerEvents,
        position: style.position
      }
    })
    
    console.log('🔍 Computed style:', computedStyle)
    
    // Node should not have pointer-events: none (which would block dragging)
    expect(computedStyle.pointerEvents).not.toBe('none')
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Węzły mają właściwe ustawienia draggable')
  })
})