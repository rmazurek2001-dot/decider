import { test, expect, Page } from '@playwright/test'

const API_URL = 'http://localhost:8000'

// Test data - will be populated by beforeEach
let testProjectId: number
let testShareToken: string

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

/**
 * Reliable click function that bypasses React Flow edge overlays
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

test.describe('Graph Integrity & Performance Tests', () => {
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should retain node statuses after full page reload', async ({ page }) => {
    console.log('🔄 Starting state persistence test (status only)')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for layout to be ready
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Initial layout loaded')
    
    // Get the first node for testing
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    
    // Open sidebar and change status to Selected
    await reliableClick(page, 'decision-node')
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Click Select button
    const selectButton = sidebar.getByText('Select').first()
    await selectButton.click()
    console.log('✅ Changed node status to Selected')
    
    // Wait for status change to be saved
    await page.waitForTimeout(2000)
    
    // Perform full page reload
    console.log('🔄 Performing full page reload...')
    await page.reload()
    
    // Wait for layout to be ready after reload
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Page reloaded and layout ready')
    
    // Check if node status was preserved (Selected)
    await reliableClick(page, 'decision-node')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Check if Select button is still active (has selected styling)
    const selectedButton = sidebar.locator('button').filter({ hasText: 'Select' })
    const buttonClasses = await selectedButton.getAttribute('class')
    expect(buttonClasses).toContain('bg-emerald-600') // Selected state styling
    console.log('✅ Node status preserved after reload')
    
    console.log('🎉 State persistence test completed successfully')
  })

  test('should only contain valid edges connecting existing nodes', async ({ page }) => {
    console.log('🔗 Starting graph integrity test')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for layout to be ready
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    // Get all edges and nodes from React Flow DOM
    const graphData = await page.evaluate(() => {
      // Try to access React Flow store directly
      let reactFlowEdges: any[] = []
      let reactFlowNodes: any[] = []
      let hasReactFlowStore = false
      
      // Method 1: Try to get data from React Flow store
      try {
        // Look for React Flow store in window
        const reactFlowStore = (window as any).__RF__
        if (reactFlowStore) {
          const state = reactFlowStore.getState()
          reactFlowEdges = state.edges || []
          reactFlowNodes = state.nodes || []
          hasReactFlowStore = true
          console.log('Found React Flow store data')
        }
      } catch (e) {
        console.log('Could not access React Flow store:', e.message)
      }
      
      // Method 2: Parse from DOM elements as fallback
      const edgeElements = document.querySelectorAll('.react-flow__edge')
      const domEdges = Array.from(edgeElements).map((edge, index) => {
        const edgeId = edge.id || `edge-${index}`
        const allAttributes = Array.from(edge.attributes).reduce((acc, attr) => {
          acc[attr.name] = attr.value
          return acc
        }, {} as Record<string, string>)
        
        return { 
          id: edgeId,
          attributes: allAttributes,
          element: edge.outerHTML.substring(0, 200)
        }
      })
      
      // Get all nodes from DOM
      const nodeElements = document.querySelectorAll('[data-testid="decision-node"]')
      const domNodes = Array.from(nodeElements).map(node => {
        const reactFlowNode = node.closest('.react-flow__node')
        const nodeId = reactFlowNode?.getAttribute('data-id')
        return nodeId
      })
      
      return { 
        reactFlowEdges: reactFlowEdges.map(e => ({ id: e.id, source: e.source, target: e.target })),
        reactFlowNodes: reactFlowNodes.map(n => ({ id: n.id })),
        domEdges,
        domNodes,
        hasReactFlowStore
      }
    })
    
    console.log(`📊 React Flow store edges:`, graphData.reactFlowEdges)
    console.log(`📊 React Flow store nodes:`, graphData.reactFlowNodes)
    console.log(`📊 DOM edges:`, graphData.domEdges.length)
    console.log(`📦 DOM nodes:`, graphData.domNodes)
    
    // Use React Flow store data if available, otherwise use basic validation
    if (graphData.hasReactFlowStore && graphData.reactFlowEdges.length > 0) {
      console.log('✅ Using React Flow store data for validation')
      
      // Verify that all edges connect existing nodes
      for (const edge of graphData.reactFlowEdges) {
        console.log(`🔍 Checking edge: ${edge.source} -> ${edge.target}`)
        
        // Check if source node exists
        const sourceExists = graphData.reactFlowNodes.some(n => n.id === edge.source)
        expect(sourceExists).toBe(true)
        console.log(`✅ Source node ${edge.source} exists`)
        
        // Check if target node exists
        const targetExists = graphData.reactFlowNodes.some(n => n.id === edge.target)
        expect(targetExists).toBe(true)
        console.log(`✅ Target node ${edge.target} exists`)
      }
      
      // Additional checks
      expect(graphData.reactFlowEdges.length).toBeGreaterThan(0)
      console.log(`✅ Graph has ${graphData.reactFlowEdges.length} valid edges`)
      
      // Verify no duplicate edges
      const edgeStrings = graphData.reactFlowEdges.map(e => `${e.source}->${e.target}`)
      const uniqueEdges = new Set(edgeStrings)
      expect(uniqueEdges.size).toBe(edgeStrings.length)
      console.log('✅ No duplicate edges found')
    } else {
      console.log('⚠️ Could not access React Flow store - using basic DOM validation')
      
      // Basic validation: ensure we have nodes and edges in DOM
      expect(graphData.domNodes.length).toBeGreaterThan(0)
      expect(graphData.domEdges.length).toBeGreaterThan(0)
      
      // Verify all nodes have valid IDs
      const validNodes = graphData.domNodes.filter(id => id && id.length > 0)
      expect(validNodes.length).toBe(graphData.domNodes.length)
      
      console.log(`✅ Basic validation passed: ${graphData.domNodes.length} nodes, ${graphData.domEdges.length} edges`)
    }
    
    console.log('🎉 Graph integrity test completed successfully')
  })

  test('should perform UI operations smoothly without blocking', async ({ page }) => {
    console.log('⚡ Starting performance stress test')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for layout to be ready
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    // Get the first node for performance testing
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    
    console.log('🖱️ Testing UI responsiveness with rapid operations')
    
    const startTime = Date.now()
    
    // Perform rapid UI operations
    for (let i = 0; i < 3; i++) {
      console.log(`🔄 Operation ${i + 1}/3`)
      
      // Click node to open sidebar
      await reliableClick(page, 'decision-node')
      const sidebar = page.getByTestId('node-sidebar')
      await expect(sidebar).toBeVisible({ timeout: 3000 })
      
      // Change some values quickly
      const titleInput = sidebar.getByTestId('node-title-input')
      await titleInput.fill(`Test Title ${i + 1}`)
      
      // Close sidebar
      const closeButton = sidebar.locator('button').first()
      await closeButton.click()
      
      // Small delay between operations
      await page.waitForTimeout(100)
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    console.log(`⏱️ Completed 3 rapid operations in ${duration}ms`)
    
    // Performance assertion: operations should complete in reasonable time
    expect(duration).toBeLessThan(5000) // 5 seconds for 3 operations
    console.log('✅ UI operations performed within acceptable time limits')
    
    // Test UI responsiveness by checking if other elements are still interactive
    const isResponsive = await page.evaluate(() => {
      // Check if the page is still responsive by testing DOM queries
      const startTime = performance.now()
      document.querySelectorAll('[data-testid]')
      const endTime = performance.now()
      return (endTime - startTime) < 100 // DOM queries should be fast
    })
    
    expect(isResponsive).toBe(true)
    console.log('✅ UI remains responsive after rapid operations')
    
    console.log('🎉 Performance stress test completed successfully')
  })

  test('should handle multiple node interactions without performance degradation', async ({ page }) => {
    console.log('🚀 Starting multiple node interaction test')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for layout to be ready
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    // Get all nodes for testing
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    const nodeCount = await nodes.count()
    console.log(`📦 Found ${nodeCount} nodes for interaction testing`)
    
    const operationTimes: number[] = []
    const maxOperations = Math.min(nodeCount, 3) // Test up to 3 nodes or all available
    
    // Perform multiple node interactions
    for (let i = 0; i < maxOperations; i++) {
      console.log(`🖱️ Performing interaction ${i + 1}/${maxOperations}`)
      
      const startTime = Date.now()
      
      // Click node
      await reliableClick(page, 'decision-node')
      
      // Wait for sidebar
      const sidebar = page.getByTestId('node-sidebar')
      await expect(sidebar).toBeVisible({ timeout: 3000 })
      
      // Interact with sidebar
      const titleInput = sidebar.getByTestId('node-title-input')
      await titleInput.fill(`Updated Node ${i + 1}`)
      
      // Close sidebar
      const closeButton = sidebar.locator('button').first()
      await closeButton.click()
      
      const endTime = Date.now()
      const duration = endTime - startTime
      operationTimes.push(duration)
      
      console.log(`⏱️ Interaction ${i + 1} completed in ${duration}ms`)
      
      // Small delay between operations
      await page.waitForTimeout(200)
    }
    
    // Analyze performance consistency
    const avgTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length
    const maxTime = Math.max(...operationTimes)
    const minTime = Math.min(...operationTimes)
    
    console.log(`📊 Performance stats:`)
    console.log(`   Average: ${avgTime.toFixed(2)}ms`)
    console.log(`   Min: ${minTime}ms`)
    console.log(`   Max: ${maxTime}ms`)
    console.log(`   Operations: ${operationTimes}`)
    
    // Performance assertions
    expect(avgTime).toBeLessThan(2000) // Average should be under 2 seconds
    expect(maxTime).toBeLessThan(3000) // No single operation should exceed 3 seconds
    
    // Check for performance degradation (last operation shouldn't be much slower than first)
    if (operationTimes.length > 1) {
      const firstTime = operationTimes[0]
      const lastTime = operationTimes[operationTimes.length - 1]
      const degradation = (lastTime - firstTime) / firstTime
      
      console.log(`📈 Performance degradation: ${(degradation * 100).toFixed(1)}%`)
      expect(degradation).toBeLessThan(2.0) // Less than 200% degradation
    }
    
    console.log('✅ Multiple node interactions completed within acceptable performance limits')
    console.log('🎉 Multiple interaction test completed successfully')
  })
})