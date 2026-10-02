import { Page } from '@playwright/test'

const API_URL = 'http://localhost:8000'

/**
 * Helper function to seed test data with retry logic
 */
export async function seedTestProject(request: any, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await request.post(`${API_URL}/api/testing/seed-project/`)
      
      if (!response.ok()) {
        const errorText = await response.text()
        console.error(`❌ Failed to seed test project (attempt ${attempt}/${retries}): ${response.status()} ${response.statusText()}`)
        console.error(`Response: ${errorText}`)
        
        if (attempt === retries) {
          throw new Error(`Failed to seed test project after ${retries} attempts: ${response.status()}`)
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        continue
      }
      
      const data = await response.json()
      console.log(`✅ Test project created: ID=${data.id}, Token=${data.share_token}`)
      
      return data
    } catch (error) {
      console.error(`❌ Error seeding test project (attempt ${attempt}/${retries}):`, error)
      
      if (attempt === retries) {
        throw error
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}

/**
 * Wait for layout ready signal - updated for new TreeVisualizer and SharedProjectView
 */
export async function waitForLayoutReady(page: Page, timeout = 15000) {
  try {
    console.log('🔄 Waiting for components to exist...')
    
    // First wait for either component to exist
    await page.waitForFunction(() => {
      const treeVisualizer = document.querySelector('[data-component="new-tree-visualizer"]')
      const sharedView = document.querySelector('[data-testid="shared-view-container"]')
      return !!(treeVisualizer || sharedView)
    }, { timeout: 5000 })
    
    console.log('✅ Components found, waiting for layout ready signal...')
    
    // Then wait for layout ready signal
    await page.waitForFunction(() => {
      const treeVisualizer = document.querySelector('[data-component="new-tree-visualizer"]')
      const sharedView = document.querySelector('[data-testid="shared-view-container"]')
      
      if (treeVisualizer) {
        return treeVisualizer.getAttribute('data-layout-ready') === 'true'
      } else if (sharedView) {
        return sharedView.getAttribute('data-layout-ready') === 'true'
      }
      return false
    }, { timeout })
    
    console.log('✅ Layout ready signal detected')
  } catch (error) {
    console.log('⚠️ Layout ready timeout, checking current state...')
    
    try {
      // Log current page URL and state
      const currentUrl = page.url()
      console.log(`📍 Current URL: ${currentUrl}`)
      
      // Log current state for debugging
      const currentState = await page.evaluate(() => {
        const treeVisualizer = document.querySelector('[data-component="new-tree-visualizer"]')
        const sharedView = document.querySelector('[data-testid="shared-view-container"]')
        const nodes = document.querySelectorAll('[data-testid="decision-node"]')
        const body = document.body.textContent || ''
        
        return {
          url: window.location.href,
          treeVisualizerExists: !!treeVisualizer,
          treeVisualizerReady: treeVisualizer?.getAttribute('data-layout-ready'),
          sharedViewExists: !!sharedView,
          sharedViewReady: sharedView?.getAttribute('data-layout-ready'),
          nodeCount: nodes.length,
          bodyText: body.substring(0, 200) + (body.length > 200 ? '...' : ''),
          hasErrorMessage: body.includes('error') || body.includes('Error') || body.includes('404')
        }
      })
      
      console.log('Current state:', currentState)
      
      // If we have nodes, consider it ready even without the signal
      if (currentState.nodeCount > 0) {
        console.log('✅ Nodes are present, considering layout ready')
        return
      }
      
      // If there's an error message, throw a more specific error
      if (currentState.hasErrorMessage) {
        throw new Error(`Page shows error content: ${currentState.bodyText}`)
      }
      
    } catch (evalError) {
      console.log('⚠️ Could not evaluate page state, page may be closed')
    }
    
    throw error
  }
}

/**
 * Get layout ready status - updated for new TreeVisualizer
 */
export async function getLayoutReadyStatus(page: Page) {
  return await page.evaluate(() => {
    const wrapper = document.querySelector('[data-component="new-tree-visualizer"]')
    return wrapper?.getAttribute('data-layout-ready')
  })
}

/**
 * Get auto layout button with responsive selector
 */
export function getAutoLayoutButton(page: Page) {
  return page.getByTestId('auto-layout-button')
}

/**
 * Get layout controls container with responsive selector
 */
export function getLayoutControls(page: Page) {
  return page.locator('.fixed.right-2, .fixed.right-4').first()
}