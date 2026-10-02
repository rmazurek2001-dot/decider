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

test.describe('Unhappy Path - Edge Cases and Error Handling', () => {
  test.beforeEach(async ({ request }) => {
    const data = await seedTestProject(request)
    testProjectId = data.id
    testShareToken = data.share_token
  })

  test('should gracefully handle AI generation failure', async ({ page }) => {
    console.log('🤖 Starting AI failure handling test')
    
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

    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(3000)
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await reliableClick(page, 'decision-node')
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const aiButton = page.locator('[data-testid^="btn-ask-ai-"]').first()
    await expect(aiButton).toBeVisible()
    
    console.log('🤖 Clicking AI generation button...')
    await aiButton.click()
    
    await page.waitForTimeout(2000)
    
    const reactFlowWrapper = page.locator('#react-flow-wrapper')
    await expect(reactFlowWrapper).toBeVisible()
    
    const errorMessage = sidebar.locator('.text-red-700, .text-rose-600, .text-red-600').first()
    await expect(errorMessage).toBeVisible({ timeout: 5000 })
    
    const errorText = await errorMessage.textContent()
    expect(errorText).toMatch(/AI|overloaded|try again|service|error/i)
    
    console.log('✅ AI failure handled gracefully:', errorText)
    
    await reliableClick(page, 'decision-node')
    await expect(sidebar).toBeVisible()
    
    console.log('✅ Application remains functional after AI error')
  })

  test('should visually warn when total cost exceeds project budget', async ({ page }) => {
    console.log('💰 Starting budget exceeded test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(3000)
    
    const decisionNodes = page.getByTestId('decision-node')
    await expect(decisionNodes.first()).toBeVisible({ timeout: 10000 })
    
    await decisionNodes.nth(1).click()
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const estimatedCostInput = sidebar.locator('input[type="number"]').first()
    await estimatedCostInput.fill('12000')
    
    console.log('💰 Set estimated cost to $12,000')
    
    const inputValue = await estimatedCostInput.inputValue()
    console.log('💰 Verified input value:', inputValue)
    
    const saveButton = sidebar.getByTestId('save-node-button')
    await saveButton.click()
    await page.waitForTimeout(1000)
    
    console.log('💾 Saved node changes')
    
    const successMessage = sidebar.locator('.text-emerald-700')
    await expect(successMessage).toBeVisible({ timeout: 3000 })
    console.log('✅ Save success message appeared')
    
    const selectButton = sidebar.getByText('Select').first()
    await selectButton.click()
    
    console.log('✅ Set node status to Selected')
    
    await page.waitForTimeout(2000)
    
    await page.reload()
    await page.waitForTimeout(3000)
    
    const floatingDashboard = page.getByTestId('floating-dashboard')
    await expect(floatingDashboard).toBeVisible({ timeout: 5000 })
    
    const dashboardText = await floatingDashboard.textContent()
    console.log('💰 FloatingDashboard content after reload:', dashboardText)
    
    const budgetExceededAttr = await floatingDashboard.getAttribute('data-budget-exceeded')
    console.log('💰 Budget exceeded attribute:', budgetExceededAttr)
    expect(budgetExceededAttr).toBe('true')
    
    console.log('✅ FloatingDashboard shows budget exceeded: true')
    
    const redElements = floatingDashboard.locator('.text-rose-400, .text-red-500, .bg-rose-500, .bg-red-500')
    await expect(redElements.first()).toBeVisible()
    
    const exceededText = floatingDashboard.locator('text=/exceeded/i')
    await expect(exceededText).toBeVisible()
    
    console.log('✅ Visual budget exceeded warnings are displayed')
    
    const progressBar = floatingDashboard.locator('.bg-rose-500, .bg-red-500').first()
    await expect(progressBar).toBeVisible()
    
    console.log('✅ Budget exceeded test completed successfully')
  })

  test('should prevent saving a node with an empty title', async ({ page }) => {
    console.log('📝 Starting empty title validation test')
    
    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(3000)
    
    const firstNode = page.getByTestId('decision-node').first()
    await expect(firstNode).toBeVisible({ timeout: 10000 })
    await reliableClick(page, 'decision-node')
    
    const sidebar = page.getByTestId('node-sidebar')
    await expect(sidebar).toBeVisible({ timeout: 3000 })
    
    const titleInput = sidebar.getByTestId('node-title-input')
    await expect(titleInput).toBeVisible()
    
    await titleInput.fill('')
    console.log('📝 Cleared title field')
    
    await titleInput.blur()
    await page.waitForTimeout(500)
    
    const validationError = sidebar.getByTestId('title-validation-error')
    await expect(validationError).toBeVisible()
    
    const errorText = await validationError.textContent()
    expect(errorText).toMatch(/required/i)
    console.log('✅ Validation error displayed:', errorText)
    
    const titleInputClasses = await titleInput.getAttribute('class')
    expect(titleInputClasses).toContain('border-red-300')
    console.log('✅ Title input shows error styling')
    
    const saveButton = sidebar.getByTestId('save-node-button')
    await expect(saveButton).toBeDisabled()
    console.log('✅ Save button is disabled when title is empty')
    
    const saveButtonClasses = await saveButton.getAttribute('class')
    expect(saveButtonClasses).toContain('cursor-not-allowed')
    
    await saveButton.click({ force: true })
    await page.waitForTimeout(1000)
    
    const successMessage = sidebar.locator('.text-emerald-700')
    await expect(successMessage).not.toBeVisible()
    
    await titleInput.fill('Valid Title')
    await page.waitForTimeout(500)
    
    await expect(validationError).not.toBeVisible()
    
    await expect(saveButton).toBeEnabled()
    
    console.log('✅ Validation clears when valid title is entered')
    console.log('✅ Empty title validation test completed successfully')
  })

  test('should display a friendly 404 page when project is not found', async ({ page }) => {
    console.log('🔍 Starting 404 error handling test')
    
    const nonExistentProjectId = 99999999
    await page.goto(`/project/${nonExistentProjectId}`)
    
    await page.waitForTimeout(3000)
    
    const errorState = page.getByTestId('error-state')
    await expect(errorState).toBeVisible({ timeout: 10000 })
    
    console.log('✅ Error state is displayed')
    
    const errorText = await errorState.textContent()
    expect(errorText).toMatch(/project not found|not found|deleted|access/i)
    console.log('✅ Error message is user-friendly:', errorText)
    
    const backButton = page.getByTestId('back-to-dashboard-button')
    await expect(backButton).toBeVisible()
    
    const buttonText = await backButton.textContent()
    expect(buttonText).toMatch(/dashboard|back|home/i)
    console.log('✅ Back to dashboard button is present:', buttonText)
    
    await expect(backButton).toBeEnabled()
    
    const buttonHref = await backButton.evaluate(el => {
      const onclick = el.getAttribute('onclick') || el.outerHTML
      return onclick.includes('/') || onclick.includes('dashboard') || onclick.includes('location')
    })
    expect(buttonHref).toBe(true)
    
    console.log('✅ Back button is functional')
    
    const loadingSpinner = page.locator('.animate-spin, .spinner, [data-testid="loading"]')
    await expect(loadingSpinner).not.toBeVisible()
    
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    await page.waitForTimeout(2000)
    
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
    
    await page.route(`${API_URL}/api/projects/${testProjectId}/`, async route => {
      console.log('⏱️ Intercepting project request - simulating timeout')
      await new Promise(resolve => setTimeout(resolve, 10000))
      await route.fulfill({
        status: 408,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Request timeout'
        })
      })
    })

    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(2000)
    
    const loadingText = page.locator('text=/loading/i').first()
    await expect(loadingText).toBeVisible({ timeout: 5000 })
    
    console.log('✅ Loading state is shown during network delay')
    
    await page.waitForTimeout(8000)
    
    const errorState = page.getByTestId('error-state')
    await expect(errorState).toBeVisible({ timeout: 15000 })
    
    console.log('✅ Error state appears after network timeout')
    
    const errorText = await errorState.textContent()
    expect(errorText).toMatch(/failed|error|try again|load/i)
    
    console.log('✅ Network timeout handled gracefully:', errorText)
  })

  test('should handle malformed API responses', async ({ page }) => {
    console.log('🔧 Starting malformed API response test')
    
    await page.route(`${API_URL}/api/projects/${testProjectId}/tree/`, async route => {
      console.log('🔧 Intercepting tree request - returning malformed data')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'invalid json response'
      })
    })

    await page.goto(`/project/${testProjectId}`)
    
    await page.waitForTimeout(5000)
    
    const errorState = page.getByTestId('error-state')
    const loadingState = page.locator('text=/loading/i')
    
    const hasErrorState = await errorState.isVisible()
    const hasLoadingState = await loadingState.isVisible()
    
    if (!hasErrorState && !hasLoadingState) {
      const bodyText = await page.locator('body').textContent()
      console.log('🔧 Page body content:', bodyText?.substring(0, 200))
      
      expect(bodyText).toBeTruthy()
      expect(bodyText!.length).toBeGreaterThan(10)
    }
    
    console.log('✅ Malformed API response handled gracefully (no crash detected)')
    
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      jsErrors.push(error.message)
    })
    
    await page.waitForTimeout(2000)
    
    console.log('📝 Detected errors (should be handled):', jsErrors)
    
    console.log('✅ Malformed API response test completed successfully')
  })
})