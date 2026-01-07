/**
 * 多值问题诊断工具
 * 
 * 在浏览器控制台中运行: import('/src/debug/multivalue-check.ts').then(m => m.checkMultiValue())
 * 
 * 或在组件中调用: import { checkMultiValue } from '@/debug/multivalue-check'
 */

import { chatTable, threadTable, messageTable } from '@linx/models'

export async function checkMultiValue() {
  console.log('='.repeat(60))
  console.log('drizzle-solid 多值问题诊断')
  console.log('='.repeat(60))
  
  // @ts-ignore - 从全局获取 db 实例
  const db = (window as any).__SOLID_DB__ || (window as any).db
  
  if (!db) {
    console.error('错误: 找不到数据库实例')
    console.log('提示: 请确保已登录并初始化数据库')
    console.log('可以尝试: window.__SOLID_DB__ = db (在 SolidDatabaseProvider 中设置)')
    return
  }

  const tables = [
    { name: 'chats', table: chatTable },
    { name: 'threads', table: threadTable },
    { name: 'messages', table: messageTable },
  ]

  for (const { name, table } of tables) {
    console.log(`\n--- 检查 ${name} 表 ---`)
    
    try {
      const rows = await db.select().from(table).execute()
      
      console.log(`  返回行数: ${rows.length}`)
      
      if (rows.length === 0) {
        console.log(`  ✓ 表为空`)
        continue
      }

      // 按 subject/id 分组
      const bySubject = new Map<string, any[]>()
      for (const row of rows) {
        const subject = row['@id'] || row.subject || row.id || 'unknown'
        if (!bySubject.has(subject)) {
          bySubject.set(subject, [])
        }
        bySubject.get(subject)!.push(row)
      }
      
      console.log(`  唯一主体数: ${bySubject.size}`)
      
      if (rows.length !== bySubject.size) {
        console.warn(`  ⚠️  多值问题检测到！行数(${rows.length}) > 唯一主体数(${bySubject.size})`)
        
        // 找出重复的主体
        for (const [subject, subjectRows] of bySubject.entries()) {
          if (subjectRows.length > 1) {
            console.log(`\n  重复主体: ${subject} (${subjectRows.length} 行)`)
            
            // 分析哪些字段有不同值
            const fields = Object.keys(subjectRows[0])
            for (const field of fields) {
              const values = subjectRows.map(r => JSON.stringify(r[field]))
              const uniqueValues = new Set(values)
              
              if (uniqueValues.size > 1) {
                console.log(`    字段 "${field}" 有 ${uniqueValues.size} 个不同值:`)
                Array.from(uniqueValues).slice(0, 3).forEach(v => {
                  console.log(`      - ${v}`)
                })
                if (uniqueValues.size > 3) {
                  console.log(`      ... 还有 ${uniqueValues.size - 3} 个值`)
                }
              }
            }
          }
        }
      } else {
        console.log(`  ✓ 未检测到多值问题`)
      }
      
    } catch (err: any) {
      console.error(`  ✗ 查询失败: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('诊断完成')
  console.log('='.repeat(60))
}

// 挂载到全局方便调试
if (typeof window !== 'undefined') {
  (window as any).checkMultiValue = checkMultiValue
}

export default checkMultiValue
