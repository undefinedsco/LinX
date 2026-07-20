import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const screenshotDir = resolve(__dirname, '../../../.gstack/qa-reports/screenshots')

test.describe('Pi message format matrix', () => {
  test('renders and exposes every supported format on desktop and mobile', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto('/debug/message-blocks')
    await expect(page.getByRole('heading', { name: 'Pi 消息格式矩阵' })).toBeVisible()

    const piNative = page.getByTestId('format-pi-native')
    const markdown = page.getByTestId('format-markdown')
    const runtime = page.getByTestId('format-runtime-states')
    const artifacts = page.getByTestId('format-artifacts')

    for (const section of [piNative, markdown, runtime, artifacts]) {
      await expect(section).toBeVisible()
    }

    await expect(piNative.getByText(/深度思考/)).toBeVisible()
    await expect(piNative.getByText('我会先检查消息组件，再读取相关文件。')).toBeVisible()
    await expect(piNative.getByText('read_file').first()).toBeVisible()
    await piNative.getByText(/深度思考/).click()
    await expect(piNative.getByText('先读取项目结构，再对消息渲染边界进行归纳。')).toBeVisible()
    await piNative.getByText('read_file').last().click()
    await expect(piNative.getByText('已读取 Chat 模块，共 14 个文件。')).toBeVisible()

    await expect(markdown.getByRole('heading', { name: 'Markdown 格式矩阵' })).toBeVisible()
    await expect(markdown.getByText('粗体')).toBeVisible()
    await expect(markdown.getByText('Markdown', { exact: true })).toBeVisible()
    await expect(markdown.getByText('const format: string = "pi-message"')).toBeVisible()
    const safeLink = markdown.getByRole('link', { name: '安全链接' })
    await expect(safeLink).toHaveAttribute('target', '_blank')
    await expect(safeLink).toHaveAttribute('rel', /noopener/)

    await expect(runtime.getByText(/思考中/)).toBeVisible()
    await expect(runtime.getByText('运行中...')).toBeVisible()
    await expect(runtime.getByText('失败', { exact: true })).toBeVisible()
    await expect(runtime.getByText('等待审批', { exact: true })).toBeVisible()
    await expect(runtime.getByText('验证 Pi 消息格式')).toBeVisible()
    await expect(runtime.getByText('模型服务暂时不可用。')).toBeVisible()

    await expect(artifacts.getByRole('img', { name: '消息图片' })).toBeVisible()
    await expect(artifacts.getByText('architecture-notes.pdf')).toBeVisible()
    await expect(artifacts.getByText('Pi source repository')).toBeVisible()
    await expect(artifacts.getByText('LinX Agent Guide')).toBeVisible()

    const hasHorizontalOverflow = () => page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )

    await expect.poll(hasHorizontalOverflow).toBe(false)
    await mkdir(screenshotDir, { recursive: true })
    await page.screenshot({ path: resolve(screenshotDir, 'pi-message-formats-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByTestId('format-artifacts')).toBeVisible()
    await expect.poll(hasHorizontalOverflow).toBe(false)
    await page.screenshot({ path: resolve(screenshotDir, 'pi-message-formats-mobile.png'), fullPage: true })

    expect(consoleErrors).toEqual([])
  })
})
