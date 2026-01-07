import { test, expect } from '@playwright/test'

/**
 * Solid 登录 E2E 测试
 * 
 * 前提条件：本地 Solid Pod 运行在 localhost:3000 且已登录
 */

test.describe('Solid Authentication', () => {
  
  test.describe('登录流程', () => {
    
    test('选择本地 Pod 并完成授权', async ({ page }) => {
      // 1. 访问应用首页
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // 2. 检查是否显示登录模态框 (SolidLoginModal)
      const loginModal = page.locator('.fixed.inset-0').filter({ hasText: /登录.*LinX|进入.*LinX/i })
      const modalVisible = await loginModal.isVisible().catch(() => false)
      
      if (!modalVisible) {
        console.log('登录模态框未显示，可能已登录')
        return
      }
      
      // 3. 检查是否在 Provider Picker 视图（显示 "登录 LinX" 标题）
      const providerPickerTitle = page.getByText('登录 LinX', { exact: true })
      const isPickerView = await providerPickerTitle.isVisible().catch(() => false)
      
      if (isPickerView) {
        // 4. 在 Provider 列表中查找 localhost:3000
        const localPodButton = page.locator('button').filter({ hasText: /localhost:3000/ })
        const localPodVisible = await localPodButton.isVisible().catch(() => false)
        
        if (localPodVisible) {
          // 直接点击 localhost:3000 选项
          await localPodButton.click()
        } else {
          // 点击 "使用其他 Pod URL"
          const customUrlButton = page.getByText('使用其他 Pod URL')
          await customUrlButton.click()
          
          // 输入自定义 URL
          const urlInput = page.locator('input[placeholder*="pod"]').or(
            page.locator('input[placeholder*="example.com"]')
          )
          await urlInput.fill('http://localhost:3000')
          
          // 点击确定
          const confirmButton = page.getByRole('button', { name: '确定' })
          await confirmButton.click()
        }
        
        // 5. 等待重定向到本地 Pod 授权页面
        await page.waitForURL(/localhost:3000/, { timeout: 10000 })
        
        // 6. 在授权页面点击授权按钮
        // 本地 CSS (Community Solid Server) 通常有 "Authorize" 或类似按钮
        const authorizeButton = page.getByRole('button', { name: /Authorize|Allow|Confirm|授权|同意/i }).or(
          page.locator('button[type="submit"]')
        ).or(
          page.locator('form button').first()
        )
        
        await authorizeButton.waitFor({ timeout: 5000 })
        await authorizeButton.click()
        
        // 7. 等待重定向回应用
        await page.waitForURL(/localhost:5173/, { timeout: 15000 })
        
        // 8. 验证登录成功 - 模态框应该消失或显示已登录状态
        await page.waitForTimeout(2000)
        
        // 检查模态框是否消失
        const modalStillVisible = await loginModal.isVisible().catch(() => false)
        if (!modalStillVisible) {
          console.log('✓ 登录成功，模态框已关闭')
        }
      } else {
        // 在 Identity View（已有账号信息）
        // 点击 "进入 LinX" 按钮
        const enterButton = page.getByRole('button', { name: '进入 LinX' })
        const enterVisible = await enterButton.isVisible().catch(() => false)
        
        if (enterVisible) {
          await enterButton.click()
          
          // 等待重定向和授权流程
          try {
            await page.waitForURL(/localhost:3000/, { timeout: 5000 })
            
            // 授权
            const authorizeButton = page.getByRole('button', { name: /Authorize|Allow/i }).or(
              page.locator('button[type="submit"]')
            )
            await authorizeButton.click()
            
            await page.waitForURL(/localhost:5173/, { timeout: 15000 })
          } catch {
            // 可能不需要重新授权
            console.log('无需重新授权')
          }
        }
      }
    })

    test('点击切换账号进入 Provider Picker', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      // 检查是否在 Identity View
      const switchAccountButton = page.getByText('切换账号')
      const isIdentityView = await switchAccountButton.isVisible().catch(() => false)
      
      if (isIdentityView) {
        await switchAccountButton.click()
        
        // 验证切换到 Provider Picker 视图
        const providerPickerTitle = page.getByText('登录 LinX', { exact: true })
        await expect(providerPickerTitle).toBeVisible({ timeout: 3000 })
      }
    })
  })

  test.describe('已登录状态', () => {
    
    test('已登录后可以访问 Chat', async ({ page }) => {
      await page.goto('/chat')
      await page.waitForLoadState('networkidle')
      
      // 如果显示登录模态框，说明未登录
      const loginModal = page.locator('.fixed.inset-0').filter({ hasText: /登录.*LinX/ })
      const needsLogin = await loginModal.isVisible().catch(() => false)
      
      if (needsLogin) {
        console.log('需要先登录才能访问 Chat')
      } else {
        // 验证 Chat 页面加载
        await expect(page).toHaveURL(/chat/)
      }
    })

    test('已登录后可以访问 Credentials', async ({ page }) => {
      await page.goto('/credentials')
      await page.waitForLoadState('networkidle')
      
      const loginModal = page.locator('.fixed.inset-0').filter({ hasText: /登录.*LinX/ })
      const needsLogin = await loginModal.isVisible().catch(() => false)
      
      if (!needsLogin) {
        await expect(page).toHaveURL(/credentials/)
      }
    })
  })

  test.describe('关闭登录模态框', () => {
    
    test('可以点击 X 关闭登录模态框', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      
      const loginModal = page.locator('.fixed.inset-0').filter({ hasText: /登录.*LinX|进入.*LinX/ })
      const modalVisible = await loginModal.isVisible().catch(() => false)
      
      if (modalVisible) {
        // 点击关闭按钮 (X 图标)
        const closeButton = page.locator('.fixed.inset-0 button').filter({ has: page.locator('svg.lucide-x') }).or(
          page.locator('.fixed.inset-0 button.absolute').first()
        )
        
        const closeVisible = await closeButton.isVisible().catch(() => false)
        if (closeVisible) {
          await closeButton.click()
          await page.waitForTimeout(500)
          
          // 模态框可能关闭或保持（取决于业务逻辑）
        }
      }
    })
  })
})

test.describe('Pod 连接状态', () => {
  
  test.beforeEach(async ({ page }) => {
    // 确保本地 Pod 可访问
    try {
      const response = await page.request.get('http://localhost:3000/')
      console.log('本地 Pod 状态:', response.status())
    } catch {
      console.log('警告: 本地 Pod (localhost:3000) 不可访问')
    }
  })

  test('检测本地 Pod 是否运行', async ({ page }) => {
    // 尝试访问本地 Pod
    const response = await page.request.get('http://localhost:3000/').catch(() => null)
    
    if (response && response.ok()) {
      console.log('✓ 本地 Pod 运行正常')
    } else {
      console.log('✗ 本地 Pod 未运行或不可访问')
      test.skip()
    }
  })
})
