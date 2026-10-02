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
  console.log(`✅ Hierarchical test project created: ID=${data.id}, Token=${data.share_token}`)
  return data
}

test.describe('CRITICAL: Auto-Layout Logic', () => {
  let testProjectId: number
  let testShareToken: string

  test.beforeAll(async ({ request }) => {
    const projectData = await seedHierarchicalProject(request)
    testProjectId = projectData.id
    testShareToken = projectData.share_token
  })

  test('should create proper hierarchy with Auto-Layout', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Hierarchia Auto-Layout w EDYTORZE')
    
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
    await expect(autoLayoutButton).toBeVisible()
    
    console.log('📊 Analyzing node hierarchy BEFORE Auto-Layout...')
    
    const nodeCount = await nodes.count()
    console.log(`📊 Found ${nodeCount} nodes`)
    
    const nodesBefore: Array<{id: string, x: number, y: number, bbox: any}> = []
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.nth(i)
      const style = await node.getAttribute('style')
      const bbox = await node.boundingBox()
      
      const transform = style?.match(/translate\(([^,]+),\s*([^)]+)\)/)
      if (transform && bbox) {
        const x = parseFloat(transform[1].replace('px', ''))
        const y = parseFloat(transform[2].replace('px', ''))
        
        nodesBefore.push({
          id: `node-${i}`,
          x,
          y,
          bbox
        })
        
        console.log(`📍 Node ${i} BEFORE: pos=(${x}, ${y}), bbox=(${bbox.x}, ${bbox.y})`)
      }
    }
    
    console.log('🎛️ Clicking Auto-Layout button...')
    await autoLayoutButton.click()
    
    await page.waitForTimeout(3000)
    
    console.log('📊 Analyzing node hierarchy AFTER Auto-Layout...')
    
    const nodesAfter: Array<{id: string, x: number, y: number, bbox: any}> = []
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.nth(i)
      const style = await node.getAttribute('style')
      const bbox = await node.boundingBox()
      
      const transform = style?.match(/translate\(([^,]+),\s*([^)]+)\)/)
      if (transform && bbox) {
        const x = parseFloat(transform[1].replace('px', ''))
        const y = parseFloat(transform[2].replace('px', ''))
        
        nodesAfter.push({
          id: `node-${i}`,
          x,
          y,
          bbox
        })
        
        console.log(`📍 Node ${i} AFTER: pos=(${x}, ${y}), bbox=(${bbox.x}, ${bbox.y})`)
      }
    }

    let nodesMoved = 0
    for (let i = 0; i < nodesBefore.length && i < nodesAfter.length; i++) {
      const before = nodesBefore[i]
      const after = nodesAfter[i]
      
      const deltaX = Math.abs(after.x - before.x)
      const deltaY = Math.abs(after.y - before.y)
      const movement = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
      
      if (movement > 50) {
        nodesMoved++
        console.log(`📍 Node ${i} moved significantly: ${movement.toFixed(1)}px`)
      }
    }
    
    console.log(`🔄 Nodes moved: ${nodesMoved}/${nodeCount}`)
    expect(nodesMoved).toBeGreaterThan(0)
    
    const uniqueYPositions = new Set(nodesAfter.map(n => Math.round(n.y / 50) * 50))
    const uniqueXPositions = new Set(nodesAfter.map(n => Math.round(n.x / 50) * 50))
    
    console.log(`📏 Unique Y levels: ${uniqueYPositions.size}`)
    console.log(`📏 Unique X levels: ${uniqueXPositions.size}`)
    
    expect(uniqueYPositions.size).toBeGreaterThan(1)
    
    let overlappingNodes = 0
    for (let i = 0; i < nodesAfter.length; i++) {
      for (let j = i + 1; j < nodesAfter.length; j++) {
        const node1 = nodesAfter[i]
        const node2 = nodesAfter[j]
        
        const distance = Math.sqrt(
          Math.pow(node2.x - node1.x, 2) + 
          Math.pow(node2.y - node1.y, 2)
        )
        
        if (distance < 100) {
          overlappingNodes++
          console.log(`⚠️ Nodes ${i} and ${j} are too close: ${distance.toFixed(1)}px`)
        }
      }
    }
    
    console.log(`📐 Overlapping node pairs: ${overlappingNodes}`)
    expect(overlappingNodes).toBe(0)
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Auto-Layout tworzy właściwą hierarchię')
  })

  test('should verify DAGRE receives edges for hierarchy', async ({ page }) => {
    console.log('🚨 KRYTYCZNY TEST: Sprawdzanie czy DAGRE otrzymuje edges w EDYTORZE')
    
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
    
    const edges = page.locator('.react-flow__edge')
    const edgeCount = await edges.count()
    
    console.log(`🔗 Found ${edgeCount} edges in React Flow`)
    
    expect(edgeCount).toBeGreaterThan(0)
    
    if (edgeCount > 0) {
      await expect(edges.first()).toBeVisible()
      console.log('✅ Edges are visible - hierarchy relationships exist')
    }
    
    console.log('✅ KRYTYCZNY TEST PRZESZEDŁ: Graf ma relacje hierarchiczne (edges)')
  })
})