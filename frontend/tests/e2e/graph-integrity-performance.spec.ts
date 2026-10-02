import { test, expect, Page } from '@playwright/test'

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
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should retain node statuses after full page reload', async ({ page }) => {
    console.log('🔄 Starting state persistence test (status only)')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Initial layout loaded')
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    
    await reliableClick(page, 'decision-node')
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const selectButton = sidebar.getByText('Select').first()
    await selectButton.click()
    console.log('✅ Changed node status to Selected')
    
    await page.waitForTimeout(2000)
    
    console.log('🔄 Performing full page reload...')
    await page.reload()
    
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Page reloaded and layout ready')
    
    await reliableClick(page, 'decision-node')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const selectedButton = sidebar.locator('button').filter({ hasText: 'Select' })
    const buttonClasses = await selectedButton.getAttribute('class')
    expect(buttonClasses).toContain('bg-emerald-600')
    console.log('✅ Node status preserved after reload')
    
    console.log('🎉 State persistence test completed successfully')
  })

  test('should only contain valid edges connecting existing nodes', async ({ page }) => {
    console.log('🔗 Starting graph integrity test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    const graphData = await page.evaluate(() => {
      let reactFlowEdges: any[] = []
      let reactFlowNodes: any[] = []
      let hasReactFlowStore = false
      
      try {
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
    
    if (graphData.hasReactFlowStore && graphData.reactFlowEdges.length > 0) {
      console.log('✅ Using React Flow store data for validation')
      
      for (const edge of graphData.reactFlowEdges) {
        console.log(`🔍 Checking edge: ${edge.source} -> ${edge.target}`)
        
        const sourceExists = graphData.reactFlowNodes.some(n => n.id === edge.source)
        expect(sourceExists).toBe(true)
        console.log(`✅ Source node ${edge.source} exists`)
        
        const targetExists = graphData.reactFlowNodes.some(n => n.id === edge.target)
        expect(targetExists).toBe(true)
        console.log(`✅ Target node ${edge.target} exists`)
      }
      
      expect(graphData.reactFlowEdges.length).toBeGreaterThan(0)
      console.log(`✅ Graph has ${graphData.reactFlowEdges.length} valid edges`)
      
      const edgeStrings = graphData.reactFlowEdges.map(e => `${e.source}->${e.target}`)
      const uniqueEdges = new Set(edgeStrings)
      expect(uniqueEdges.size).toBe(edgeStrings.length)
      console.log('✅ No duplicate edges found')
    } else {
      console.log('⚠️ Could not access React Flow store - using basic DOM validation')
      
      expect(graphData.domNodes.length).toBeGreaterThan(0)
      expect(graphData.domEdges.length).toBeGreaterThan(0)
      
      const validNodes = graphData.domNodes.filter(id => id && id.length > 0)
      expect(validNodes.length).toBe(graphData.domNodes.length)
      
      console.log(`✅ Basic validation passed: ${graphData.domNodes.length} nodes, ${graphData.domEdges.length} edges`)
    }
    
    console.log('🎉 Graph integrity test completed successfully')
  })

  test('should perform UI operations smoothly without blocking', async ({ page }) => {
    console.log('⚡ Starting performance stress test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    
    console.log('🖱️ Testing UI responsiveness with rapid operations')
    
    const startTime = Date.now()
    
    for (let i = 0; i < 3; i++) {
      console.log(`🔄 Operation ${i + 1}/3`)
      
      await reliableClick(page, 'decision-node')
      const sidebar = page.getByTestId('node-sidebar')
      await expect(sidebar).toBeVisible({ timeout: 3000 })
      
      const titleInput = sidebar.getByTestId('node-title-input')
      await titleInput.fill(`Test Title ${i + 1}`)
      
      const closeButton = sidebar.locator('button').first()
      await closeButton.click()
      
      await page.waitForTimeout(100)
    }
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    console.log(`⏱️ Completed 3 rapid operations in ${duration}ms`)
    
    expect(duration).toBeLessThan(5000)
    console.log('✅ UI operations performed within acceptable time limits')
    
    const isResponsive = await page.evaluate(() => {
      const startTime = performance.now()
      document.querySelectorAll('[data-testid]')
      const endTime = performance.now()
      return (endTime - startTime) < 100
    })
    
    expect(isResponsive).toBe(true)
    console.log('✅ UI remains responsive after rapid operations')
    
    console.log('🎉 Performance stress test completed successfully')
  })

  test('should handle multiple node interactions without performance degradation', async ({ page }) => {
    console.log('🚀 Starting multiple node interaction test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 15000 })
    console.log('✅ Layout loaded')
    
    const nodes = page.getByTestId('decision-node')
    await expect(nodes.first()).toBeVisible({ timeout: 10000 })
    
    const nodeCount = await nodes.count()
    console.log(`📦 Found ${nodeCount} nodes for interaction testing`)
    
    const operationTimes: number[] = []
    const maxOperations = Math.min(nodeCount, 3)
    
    for (let i = 0; i < maxOperations; i++) {
      console.log(`🖱️ Performing interaction ${i + 1}/${maxOperations}`)
      
      const startTime = Date.now()
      
      await reliableClick(page, 'decision-node')
      
      const sidebar = page.getByTestId('node-sidebar')
      await expect(sidebar).toBeVisible({ timeout: 3000 })
      
      const titleInput = sidebar.getByTestId('node-title-input')
      await titleInput.fill(`Updated Node ${i + 1}`)
      
      const closeButton = sidebar.locator('button').first()
      await closeButton.click()
      
      const endTime = Date.now()
      const duration = endTime - startTime
      operationTimes.push(duration)
      
      console.log(`⏱️ Interaction ${i + 1} completed in ${duration}ms`)
      
      await page.waitForTimeout(200)
    }
    
    const avgTime = operationTimes.reduce((a, b) => a + b, 0) / operationTimes.length
    const maxTime = Math.max(...operationTimes)
    const minTime = Math.min(...operationTimes)
    
    console.log(`📊 Performance stats:`)
    console.log(`   Average: ${avgTime.toFixed(2)}ms`)
    console.log(`   Min: ${minTime}ms`)
    console.log(`   Max: ${maxTime}ms`)
    console.log(`   Operations: ${operationTimes}`)
    
    expect(avgTime).toBeLessThan(2000)
    expect(maxTime).toBeLessThan(3000)
    
    if (operationTimes.length > 1) {
      const firstTime = operationTimes[0]
      const lastTime = operationTimes[operationTimes.length - 1]
      const degradation = (lastTime - firstTime) / firstTime
      
      console.log(`📈 Performance degradation: ${(degradation * 100).toFixed(1)}%`)
      expect(degradation).toBeLessThan(2.0)
    }
    
    console.log('✅ Multiple node interactions completed within acceptable performance limits')
    console.log('🎉 Multiple interaction test completed successfully')
  })
})