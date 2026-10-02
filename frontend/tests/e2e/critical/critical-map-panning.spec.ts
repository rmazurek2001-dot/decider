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
 * 🚨 KRYTYCZNY TEST: PRZECIĄGANIE MAPY
 * 
 * Ten test sprawdza czy użytkownik może FIZYCZNIE przeciągać mapę myszką.
 * Używa page.mouse API do symulacji prawdziwych ruchów myszy.
 * 
 * ZAKAZ: force: true, evaluate, click()
 * WYMAGANE: Fizyczne ruchy myszy, sprawdzenie transform w DOM
 */

test.describe('CRITICAL: Map Panning', () => {
  let testProjectId: number
  let testShareToken: string

  test.beforeAll(async ({ request }) => {
    const projectData = await seedHierarchicalProject(request)
    testProjectId = projectData.id
    testShareToken = projectData.share_token
  })

  test('should allow physical map panning with mouse', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Fizyczne przeciąganie mapy w EDYTORZE')
    
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
    
    // Wait for React Flow to load
    const reactFlowPane = page.locator('.react-flow__pane')
    await expect(reactFlowPane).toBeVisible({ timeout: 10000 })
    
    // CRITICAL: Click Auto-Layout to apply new DAGRE spacing
    const autoLayoutButton = page.locator('[data-testid="auto-layout-button"]')
    await expect(autoLayoutButton).toBeVisible()
    console.log('🎛️ Applying Auto-Layout with new DAGRE spacing...')
    await autoLayoutButton.click()
    await page.waitForTimeout(4000) // Wait for layout to complete
    
    const viewport = page.locator('.react-flow__viewport')
    await expect(viewport).toBeVisible()
    
    // Get initial transform
    const initialTransform = await viewport.getAttribute('style')
    console.log('📍 Initial viewport transform:', initialTransform)
    
    // Get pane bounding box for mouse positioning
    const paneBox = await reactFlowPane.boundingBox()
    if (!paneBox) {
      throw new Error('❌ Cannot get React Flow pane bounding box')
    }
    
    console.log('📐 Pane bounding box:', paneBox)
    
    // Calculate center of pane
    const centerX = paneBox.x + paneBox.width / 2
    const centerY = paneBox.y + paneBox.height / 2
    
    console.log(`🎯 Starting drag from center: (${centerX}, ${centerY})`)
    
    // PHYSICAL MOUSE DRAG - NO FORCE, NO SHORTCUTS
    await page.mouse.move(centerX, centerY)
    await page.mouse.down()
    
    // Drag 200px down and right
    const targetX = centerX + 200
    const targetY = centerY + 200
    
    console.log(`🖱️ Dragging to: (${targetX}, ${targetY})`)
    await page.mouse.move(targetX, targetY, { steps: 10 })
    await page.mouse.up()
    
    // Wait for transform to update
    await page.waitForTimeout(1000)
    
    // Get new transform
    const newTransform = await viewport.getAttribute('style')
    console.log('📍 New viewport transform:', newTransform)
    
    // Debug: Check what element is at center after drag
    const elementAfterDrag = await page.evaluate(([x, y]) => {
      const element = document.elementFromPoint(x, y)
      return {
        tagName: element?.tagName,
        className: element?.className,
        id: element?.id
      }
    }, [centerX, centerY])
    console.log('🔍 Element at center after drag:', elementAfterDrag)
    
    // Debug: Check React Flow state
    const reactFlowState = await page.evaluate(() => {
      const reactFlowElement = document.querySelector('.react-flow')
      return {
        panOnDrag: reactFlowElement?.getAttribute('data-pan-on-drag'),
        nodesDraggable: reactFlowElement?.getAttribute('data-nodes-draggable'),
        elementsSelectable: reactFlowElement?.getAttribute('data-elements-selectable')
      }
    })
    console.log('🔍 React Flow state:', reactFlowState)
    
    // CRITICAL ASSERTION: Transform MUST have changed
    expect(newTransform).not.toBe(initialTransform)
    
    // Additional check: new transform should contain translate values
    expect(newTransform).toContain('translate')
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Mapa reaguje na przeciąganie myszą w EDYTORZE')
  })

  test('should detect if pane is blocked by overlay', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Wykrywanie blokujących nakładek w EDYTORZE')
    
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
    
    const reactFlowPane = page.locator('.react-flow__pane')
    await expect(reactFlowPane).toBeVisible()
    
    // CRITICAL: Click Auto-Layout to apply new DAGRE spacing
    const autoLayoutButton = page.locator('[data-testid="auto-layout-button"]')
    await expect(autoLayoutButton).toBeVisible()
    console.log('🎛️ Applying Auto-Layout with new DAGRE spacing...')
    await autoLayoutButton.click()
    await page.waitForTimeout(4000) // Wait for layout to complete
    
    // Check if pane is actually clickable (not covered by overlay)
    const paneBox = await reactFlowPane.boundingBox()
    if (!paneBox) {
      throw new Error('❌ Cannot get pane bounding box')
    }
    
    const centerX = paneBox.x + paneBox.width / 2
    const centerY = paneBox.y + paneBox.height / 2
    
    // Try to hover over center - should work if not blocked
    await page.mouse.move(centerX, centerY)
    
    // Check what element is actually at this position
    const elementAtPosition = await page.evaluate(([x, y]) => {
      const element = document.elementFromPoint(x, y)
      return {
        tagName: element?.tagName,
        className: element?.className,
        id: element?.id
      }
    }, [centerX, centerY])
    
    console.log('🔍 Element at pane center:', elementAtPosition)
    
    // The element should be part of React Flow (pane or viewport)
    const className = typeof elementAtPosition.className === 'string' 
      ? elementAtPosition.className 
      : elementAtPosition.className?.toString() || ''
    
    const isReactFlowElement = 
      className.includes('react-flow') ||
      className.includes('pane') ||
      className.includes('viewport') ||
      elementAtPosition.tagName === 'path' || // SVG elements in React Flow
      elementAtPosition.tagName === 'svg'
    
    if (!isReactFlowElement) {
      console.error('❌ OVERLAY BLOCKING DETECTED:', elementAtPosition)
      throw new Error(`Pane is blocked by: ${elementAtPosition.tagName}.${className}`)
    }
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Pane nie jest blokowany przez nakładki')
  })
})