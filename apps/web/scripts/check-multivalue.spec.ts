/**
 * 多值问题诊断 - Playwright 测试
 */
import { test, expect } from '@playwright/test'

test.describe('多值问题诊断', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await page.goto('http://localhost:5173')
    
    // 等待页面加载
    await page.waitForTimeout(2000)
    
    // 检查是否需要登录
    const loginButton = page.locator('button:has-text("登录"), button:has-text("Login")')
    if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginButton.click()
      
      // 填写登录表单
      await page.fill('input[name="email"], input[type="email"]', '63005737@qq.com')
      await page.fill('input[name="password"], input[type="password"]', 'ganlu1988')
      await page.click('button[type="submit"]')
      
      // 等待登录完成
      await page.waitForTimeout(3000)
    }
  })

  test('检查 SPARQL 查询返回的多值情况', async ({ page }) => {
    // 等待数据库初始化
    await page.waitForTimeout(3000)
    
    // 在页面中执行诊断
    const result = await page.evaluate(async () => {
      const db = (window as any).__SOLID_DB__
      if (!db) {
        return { error: '数据库未初始化' }
      }

      const resources = ['chatResource', 'threadResource', 'messageResource']
      const results: any = {}

      for (const resourceName of resources) {
        try {
          // 动态获取 resource
          const resource = (window as any)[resourceName]
          if (!resource) {
            results[resourceName] = { error: `找不到 ${resourceName}` }
            continue
          }

          const rows = await db.select().from(resource).execute()
          
          // 统计
          const bySubject = new Map<string, any[]>()
          for (const row of rows) {
            const subject = row['@id'] || row.subject || row.id || 'unknown'
            if (!bySubject.has(subject)) {
              bySubject.set(subject, [])
            }
            bySubject.get(subject)!.push(row)
          }

          const duplicates: any[] = []
          for (const [subject, subjectRows] of bySubject.entries()) {
            if (subjectRows.length > 1) {
              const diffFields: any = {}
              const fields = Object.keys(subjectRows[0])
              for (const field of fields) {
                const values = subjectRows.map(r => JSON.stringify(r[field]))
                const uniqueValues = [...new Set(values)]
                if (uniqueValues.length > 1) {
                  diffFields[field] = uniqueValues.slice(0, 3)
                }
              }
              duplicates.push({ subject, count: subjectRows.length, diffFields })
            }
          }

          results[resourceName] = {
            totalRows: rows.length,
            uniqueSubjects: bySubject.size,
            hasMultiValue: rows.length !== bySubject.size,
            duplicates: duplicates.slice(0, 5)
          }
        } catch (err: any) {
          results[resourceName] = { error: err.message }
        }
      }

      return results
    })

    console.log('='.repeat(60))
    console.log('多值问题诊断结果')
    console.log('='.repeat(60))
    console.log(JSON.stringify(result, null, 2))

    // 断言检查
    if (result.error) {
      console.error('诊断失败:', result.error)
    } else {
      for (const [resourceName, data] of Object.entries(result)) {
        const resourceData = data as any
        if (resourceData.hasMultiValue) {
          console.warn(`⚠️ ${resourceName} 存在多值问题!`)
          console.warn(`   行数: ${resourceData.totalRows}, 唯一主体: ${resourceData.uniqueSubjects}`)
          console.warn('   重复主体:', resourceData.duplicates)
        } else if (resourceData.error) {
          console.log(`✗ ${resourceName}: ${resourceData.error}`)
        } else {
          console.log(`✓ ${resourceName}: 行数=${resourceData.totalRows}, 无多值问题`)
        }
      }
    }
  })
})
