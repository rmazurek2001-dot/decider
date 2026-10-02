import { test, expect } from '@playwright/test'

const API_URL = 'http://localhost:8000'

// Helper function to seed test data
async function seedTestProject(request: any) {
  const response = await request.post(`${API_URL}/api/testing/seed-project/`)
  
  if (!response.ok()) {
    const errorText = await response.text()
    throw new Error(`Failed to seed test project: ${response.status()}`)
  }
  
  const data = await response.json()
  console.log(`✅ Test project created: ID=${data.id}`)
  
  return data
}

test.describe('Position Validation Tests', () => {
  test('should ensure new projects have reasonable node positions', async ({ page, request }) => {
    console.log('🔍 Testing new project node positions')
    
    // Create a fresh test project
    const testProject = await seedTestProject(request)
    
    // Navigate to the new project
    await page.goto(`/project/${testProject.id}`)
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 20000 })
    
    // Check viewport scale
    const viewportInfo = await page.evaluate(() => {
      const viewport = document.querySelector('.react-flow__viewport') as HTMLElement
      const viewportTransform = viewport?.style.transform || 'none'
      
      // Extract scale from transform
      const scaleMatch = viewportTransform.match(/scale\(([^)]+)\)/)
      const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 1
      
      // Get node positions
      const nodes = document.querySelectorAll('.react-flow__node')
      const nodePositions = Array.from(nodes).map(node => {
        const element = node as HTMLElement
        const transform = element.style.transform
        
        // Extract x, y from translate
        const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
        const x = translateMatch ? parseFloat(translateMatch[1].replace('px', '')) : 0
        const y = translateMatch ? parseFloat(translateMatch[2].replace('px', '')) : 0
        
        return { x, y, transform }
      })
      
      return {
        scale,
        nodeCount: nodes.length,
        nodePositions: nodePositions.slice(0, 3), // First 3 nodes
        minX: Math.min(...nodePositions.map(n => n.x)),
        maxX: Math.max(...nodePositions.map(n => n.x)),
        minY: Math.min(...nodePositions.map(n => n.y)),
        maxY: Math.max(...nodePositions.map(n => n.y)),
        rangeX: Math.max(...nodePositions.map(n => n.x)) - Math.min(...nodePositions.map(n => n.x)),
        rangeY: Math.max(...nodePositions.map(n => n.y)) - Math.min(...nodePositions.map(n => n.y))
      }
    })
    
    console.log('📊 New project viewport info:', JSON.stringify(viewportInfo, null, 2))
    
    // Assertions for healthy project
    expect(viewportInfo.scale).toBeGreaterThan(0.1) // At least 10% scale
    expect(viewportInfo.nodeCount).toBeGreaterThan(0) // Should have nodes
    
    // Node positions should be reasonable (not spread over huge area)
    expect(viewportInfo.rangeX).toBeLessThan(5000) // X range should be < 5000px
    expect(viewportInfo.rangeY).toBeLessThan(5000) // Y range should be < 5000px
    
    // Positions should be positive or small negative (not huge negative values)
    expect(viewportInfo.minX).toBeGreaterThan(-1000) // No nodes at -3500px etc
    expect(viewportInfo.minY).toBeGreaterThan(-1000)
    
    console.log(`✅ Scale: ${(viewportInfo.scale * 100).toFixed(1)}%`)
    console.log(`✅ Position range: X=${viewportInfo.rangeX}px, Y=${viewportInfo.rangeY}px`)
    console.log(`✅ Position bounds: X=[${viewportInfo.minX}, ${viewportInfo.maxX}], Y=[${viewportInfo.minY}, ${viewportInfo.maxY}]`)
    
    // Test interactivity
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible()
    
    // Should be able to click
    await page.evaluate(() => {
      const element = document.querySelector('[data-testid="decision-node"]') as HTMLElement
      if (element) {
        element.click()
      }
    })
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    console.log('✅ New project positions are healthy and interactive')
  })

  test('should detect and warn about problematic node positions', async ({ page }) => {
    console.log('🚨 Testing position problem detection')
    
    // This test would check existing projects for position problems
    // For now, we'll just test the fixed project 3
    await page.goto('/project/3')
    await page.waitForSelector('[data-layout-ready="true"]', { timeout: 20000 })
    
    const positionAnalysis = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.react-flow__node')
      const positions = Array.from(nodes).map(node => {
        const element = node as HTMLElement
        const transform = element.style.transform
        
        const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/)
        const x = translateMatch ? parseFloat(translateMatch[1].replace('px', '')) : 0
        const y = translateMatch ? parseFloat(translateMatch[2].replace('px', '')) : 0
        
        return { x, y }
      })
      
      const rangeX = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))
      const rangeY = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))
      const minX = Math.min(...positions.map(p => p.x))
      const minY = Math.min(...positions.map(p => p.y))
      const maxX = Math.max(...positions.map(p => p.x))
      const maxY = Math.max(...positions.map(p => p.y))
      
      // Check for problematic patterns
      const hasHugeRange = rangeX > 10000 || rangeY > 10000
      const hasNegativeExtremes = minX < -2000 || minY < -2000
      const hasPositiveExtremes = maxX > 10000 || maxY > 10000
      
      return {
        nodeCount: nodes.length,
        rangeX,
        rangeY,
        minX,
        maxX,
        minY,
        maxY,
        hasHugeRange,
        hasNegativeExtremes,
        hasPositiveExtremes,
        isProblematic: hasHugeRange || hasNegativeExtremes || hasPositiveExtremes
      }
    })
    
    console.log('🔍 Position analysis:', positionAnalysis)
    
    // After our fix, project 3 should not be problematic
    expect(positionAnalysis.isProblematic).toBe(false)
    expect(positionAnalysis.hasHugeRange).toBe(false)
    expect(positionAnalysis.hasNegativeExtremes).toBe(false)
    expect(positionAnalysis.hasPositiveExtremes).toBe(false)
    
    console.log('✅ Project 3 positions are now healthy after fix')
  })
})