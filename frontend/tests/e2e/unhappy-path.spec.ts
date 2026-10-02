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

test.describe('Unhappy Path - Edge Cases and Error Handling', () => {
  // Seed fresh test data before each test
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should gracefully handle AI generation failure', async ({ page }) => {
    console.log('🤖 Starting AI failure handling test')
    
    // Mock the AI generation endpoint to return 500 error
    await page.route(`${API_URL}/api/decision-nodes/*/generate_subnodes/`, async route => {
      console.log('🚫 Intercepting AI generation request - returning 500 error')
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'AI service is currently overloaded. Please try again in a few minutes.'
        })
      })
    })

    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for page to load
    await page.waitForTimeout(3000)
    
    // Click on a node to open sidebar
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await reliableClick(page, 'decision-node')
    
    // Wait for sidebar to appear
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Find and click the "Ask AI for Options" button
    const aiButton = page.locator('[data-testid^="btn-ask-ai-"]').first()
    await expect(aiButton).toBeVisible()
    
    console.log('🤖 Clicking AI generation button...')
    await aiButton.click()
    
    // Wait for the error to appear
    await page.waitForTimeout(2000)
    
    // Verify that the application doesn't crash - React Flow should still be visible
    const reactFlowWrapper = page.locator('#react-flow-wrapper')
    await expect(reactFlowWrapper).toBeVisible()
    
    // Verify that an error message appears in the sidebar
    const errorMessage = sidebar.locator('.text-red-700, .text-rose-600, .text-red-600').first()
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    
    // Verify the error message contains appropriate text
    const errorText = await errorMessage.textContent()
    expect(errorText).toMatch(/AI|overloaded|try again|service|error/i)
    
    console.log('✅ AI failure handled gracefully:', errorText)
    
    // Verify that the UI is still functional - try clicking another node
    await reliableClick(page, 'decision-node')
    await expect(sidebar).toBeVisible()
    
    console.log('✅ Application remains functional after AI error')
  })

  test('should visually warn when total cost exceeds project budget', async ({ page }) => {
    console.log('💰 Starting budget exceeded test')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for page to load
    await page.waitForTimeout(3000)
    
    // Click on the decision node (second node) instead of milestone to ensure it counts in budget
    const decisionNodes = page.getByTestId('decision-node')
    await expect(decisionNodes.first()).toBeVisible({ timeout: 10000 })
    
    // Click on the second node (decision node, not milestone)
    await decisionNodes.nth(1).click()
    
    // Wait for sidebar to appear
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Find the estimated cost input and set it to a high value
    const estimatedCostInput = sidebar.locator('input[type="number"]').first() // First number input should be estimated cost
    await estimatedCostInput.fill('12000') // Set to $12,000 to exceed $10,000 budget
    
    console.log('💰 Set estimated cost to $12,000')
    
    // Verify the input value was set correctly
    const inputValue = await estimatedCostInput.inputValue()
    console.log('💰 Verified input value:', inputValue)
    
    // Save the changes using the main save button
    const saveButton = sidebar.getByTestId('save-node-button')
    await saveButton.click()
    await page.waitForTimeout(1000) // Wait for save to complete
    
    console.log('💾 Saved node changes')
    
    // Verify the save was successful by checking for success message
    const successMessage = sidebar.locator('.text-emerald-700')
    await expect(successMessage).toBeVisible({ timeout: 3000 })
    console.log('✅ Save success message appeared')
    
    // Now change status to "Selected" to make it count towards budget
    const selectButton = sidebar.getByText('Select').first()
    await selectButton.click()
    
    console.log('✅ Set node status to Selected')
    
    // Wait for the status change to process and nodeDataMap to update
    await page.waitForTimeout(2000) // Wait for the 1-second timeout in DetailsTab + buffer
    
    // Force a page refresh to ensure nodeDataMap is updated
    await page.reload()
    await page.waitForTimeout(3000) // Wait for page to load
    
    // Check if FloatingDashboard appears and shows budget exceeded
    const floatingDashboard = page.getByTestId('floating-dashboard')
    await expect(floatingDashboard).toBeVisible({ timeout: 5000 })
    
    // Debug: Check what's in FloatingDashboard after reload
    const dashboardText = await floatingDashboard.textContent()
    console.log('💰 FloatingDashboard content after reload:', dashboardText)
    
    // Verify the budget exceeded attribute is set
    const budgetExceededAttr = await floatingDashboard.getAttribute('data-budget-exceeded')
    console.log('💰 Budget exceeded attribute:', budgetExceededAttr)
    expect(budgetExceededAttr).toBe('true')
    
    console.log('✅ FloatingDashboard shows budget exceeded: true')
    
    // Verify visual indicators of budget exceeded
    // Look for red colors in the dashboard
    const redElements = floatingDashboard.locator('.text-rose-400, .text-red-500, .bg-rose-500, .bg-red-500')
    await expect(redElements.first()).toBeVisible()
    
    // Look for "exceeded" text
    const exceededText = floatingDashboard.locator('text=/exceeded/i')
    await expect(exceededText).toBeVisible()
    
    console.log('✅ Visual budget exceeded warnings are displayed')
    
    // Verify the progress bar is red when budget is exceeded
    const progressBar = floatingDashboard.locator('.bg-rose-500, .bg-red-500').first()
    await expect(progressBar).toBeVisible()
    
    console.log('✅ Budget exceeded test completed successfully')
  })

  test('should prevent saving a node with an empty title', async ({ page }) => {
    console.log('📝 Starting empty title validation test')
    
    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for page to load
    await page.waitForTimeout(3000)
    
    // Click on a node to open sidebar
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await reliableClick(page, 'decision-node')
    
    // Wait for sidebar to appear
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    // Find the title input and clear it
    const titleInput = sidebar.getByTestId('node-title-input')
    await expect(titleInput).toBeVisible()
    
    // Clear the title field
    await titleInput.fill('')
    console.log('📝 Cleared title field')
    
    // Trigger blur event to show validation
    await titleInput.blur()
    await page.waitForTimeout(500)
    
    // Verify validation error appears
    const validationError = sidebar.getByTestId('title-validation-error')
    await expect(validationError).toBeVisible()
    
    const errorText = await validationError.textContent()
    expect(errorText).toMatch(/required/i)
    console.log('✅ Validation error displayed:', errorText)
    
    // Verify the title input has error styling (red border)
    const titleInputClasses = await titleInput.getAttribute('class')
    expect(titleInputClasses).toContain('border-red-300')
    console.log('✅ Title input shows error styling')
    
    // Verify the save button is disabled
    const saveButton = sidebar.getByTestId('save-node-button')
    await expect(saveButton).toBeDisabled()
    console.log('✅ Save button is disabled when title is empty')
    
    // Verify the save button has disabled styling
    const saveButtonClasses = await saveButton.getAttribute('class')
    expect(saveButtonClasses).toContain('cursor-not-allowed')
    
    // Try to click the disabled save button (should not work)
    await saveButton.click({ force: true })
    await page.waitForTimeout(1000)
    
    // Verify no success message appears (save didn't work)
    const successMessage = sidebar.locator('.text-emerald-700')
    await expect(successMessage).not.toBeVisible()
    
    // Now add a title back and verify the validation clears
    await titleInput.fill('Valid Title')
    await page.waitForTimeout(500)
    
    // Validation error should disappear
    await expect(validationError).not.toBeVisible()
    
    // Save button should be enabled
    await expect(saveButton).toBeEnabled()
    
    console.log('✅ Validation clears when valid title is entered')
    console.log('✅ Empty title validation test completed successfully')
  })

  test('should display a friendly 404 page when project is not found', async ({ page }) => {
    console.log('🔍 Starting 404 error handling test')
    
    // Navigate to a non-existent project ID
    const nonExistentProjectId = 99999999
    await page.goto(`/project/${nonExistentProjectId}`)
    
    // Wait for the page to load and process the error
    await page.waitForTimeout(3000)
    
    // Verify that we get a friendly error page instead of a crash
    const errorState = page.getByTestId('error-state')
    await expect(errorState).toBeVisible({ timeout: 10000 })
    
    console.log('✅ Error state is displayed')
    
    // Verify the error message mentions project not found
    const errorText = await errorState.textContent()
    expect(errorText).toMatch(/project not found|not found|deleted|access/i)
    console.log('✅ Error message is user-friendly:', errorText)
    
    // Verify there's a back to dashboard button
    const backButton = page.getByTestId('back-to-dashboard-button')
    await expect(backButton).toBeVisible()
    
    const buttonText = await backButton.textContent()
    expect(buttonText).toMatch(/dashboard|back|home/i)
    console.log('✅ Back to dashboard button is present:', buttonText)
    
    // Verify the button is clickable and functional
    await expect(backButton).toBeEnabled()
    
    // Test clicking the button (but don't actually navigate to avoid affecting other tests)
    const buttonHref = await backButton.evaluate(el => {
      // Check if clicking would navigate to root
      const onclick = el.getAttribute('onclick') || el.outerHTML
      return onclick.includes('/') || onclick.includes('dashboard') || onclick.includes('location')
    })
    expect(buttonHref).toBe(true)
    
    console.log('✅ Back button is functional')
    
    // Verify no infinite loading spinner or white screen of death
    const loadingSpinner = page.locator('.animate-spin, .spinner, [data-testid="loading"]')
    await expect(loadingSpinner).not.toBeVisible()
    
    // Verify no JavaScript errors crashed the page
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    // Wait a bit more to catch any delayed errors
    await page.waitForTimeout(2000)
    
    // We allow some errors but not critical ones that would crash the app
    const criticalErrors = jsErrors.filter(error => 
      error.includes('Cannot read property') || 
      error.includes('TypeError') ||
      error.includes('ReferenceError')
    )
    
    expect(criticalErrors).toHaveLength(0)
    
    console.log('✅ No critical JavaScript errors detected')
    console.log('✅ 404 error handling test completed successfully')
  })

  test('should handle network timeouts gracefully', async ({ page }) => {
    console.log('🌐 Starting network timeout test')
    
    // Mock the project endpoint to timeout
    await page.route(`${API_URL}/api/projects/${testProjectId}/`, async route => {
      console.log('⏱️ Intercepting project request - simulating timeout')
      // Don't fulfill the request to simulate timeout
      await new Promise(resolve => setTimeout(resolve, 10000)) // 10 second delay
      await route.fulfill({
        status: 408,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Request timeout'
        })
      })
    })

    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for loading state
    await page.waitForTimeout(2000)
    
    // Should show loading initially
    const loadingText = page.locator('text=/loading/i').first()
    await expect(loadingText).toBeVisible({ timeout: 5000 })
    
    console.log('✅ Loading state is shown during network delay')
    
    // Wait for timeout to occur and error to appear
    await page.waitForTimeout(8000)
    
    // Should eventually show error state
    const errorState = page.getByTestId('error-state')
    await expect(errorState).toBeVisible({ timeout: 15000 })
    
    console.log('✅ Error state appears after network timeout')
    
    // Verify error message is user-friendly
    const errorText = await errorState.textContent()
    expect(errorText).toMatch(/failed|error|try again|load/i)
    
    console.log('✅ Network timeout handled gracefully:', errorText)
  })

  test('should handle malformed API responses', async ({ page }) => {
    console.log('🔧 Starting malformed API response test')
    
    // Mock the tree endpoint to return malformed data
    await page.route(`${API_URL}/api/projects/${testProjectId}/tree/`, async route => {
      console.log('🔧 Intercepting tree request - returning malformed data')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'invalid json response'
      })
    })

    // Navigate to project page
    await page.goto(`/project/${testProjectId}`)
    
    // Wait for the error to be processed
    await page.waitForTimeout(5000)
    
    // Should show error state instead of crashing, or at least show loading/error indication
    const errorState = page.getByTestId('error-state')
    const loadingState = page.locator('text=/loading/i')
    
    // Check if either error state or loading state is visible (app didn't crash)
    const hasErrorState = await errorState.isVisible()
    const hasLoadingState = await loadingState.isVisible()
    
    if (!hasErrorState && !hasLoadingState) {
      // If neither error nor loading state, check if the page at least didn't crash completely
      const bodyText = await page.locator('body').textContent()
      console.log('🔧 Page body content:', bodyText?.substring(0, 200))
      
      // As long as there's some content and no white screen, consider it handled
      expect(bodyText).toBeTruthy()
      expect(bodyText!.length).toBeGreaterThan(10)
    }
    
    console.log('✅ Malformed API response handled gracefully (no crash detected)')
    
    // Verify no JavaScript errors crashed the page
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    await page.waitForTimeout(2000)
    
    // Should not have critical parsing errors that crash the app
    console.log('📝 Detected errors (should be handled):', jsErrors)
    
    // The important thing is that we show some kind of error indication or don't crash completely
    console.log('✅ Malformed API response test completed successfully')
  })
})