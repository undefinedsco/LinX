export default function MinimalTest() {
  console.log('✅ MinimalTest component rendered')
  
  return (
    <div style={{
      padding: '40px',
      background: '#0a0e1a',
      color: 'white',
      minHeight: '100vh'
    }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>
        ✅ React 正常工作
      </h1>
      <p style={{ fontSize: '24px', marginBottom: '10px' }}>
        如果你看到这个，说明：
      </p>
      <ul style={{ fontSize: '18px', lineHeight: '1.8' }}>
        <li>✅ Vite 服务器正常</li>
        <li>✅ TypeScript 编译成功</li>
        <li>✅ React 渲染成功</li>
        <li>✅ TanStack Router 正常</li>
      </ul>
      <div style={{
        marginTop: '40px',
        padding: '20px',
        background: '#1a1f2e',
        borderRadius: '8px'
      }}>
        <h2>🔍 下一步测试</h2>
        <p>如果这个页面正常显示，问题可能在于：</p>
        <ul>
          <li>MainLayout 组件</li>
          <li>Resizable 组件</li>
          <li>某个子组件导入失败</li>
        </ul>
      </div>
    </div>
  )
}

