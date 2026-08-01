import { SolidSessionProvider, useSession } from '@/providers/solid-session-provider'

function LoginStatus() {
  const { session } = useSession()

  if (session.info.isLoggedIn) {
    return (
      <div style={{ padding: 20 }}>
        <h2>✅ 登录成功！</h2>
        <p><strong>WebID:</strong> {session.info.webId}</p>
        <button onClick={() => session.logout()}>登出</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>未登录</h2>
      <button
        onClick={() => void session.login({
          oidcIssuer: 'http://localhost:3000',
          redirectUrl: window.location.href,
          clientName: 'solid-session-test',
        })}
      >
        使用 CSS v8 登录
      </button>
    </div>
  )
}

export default function SolidUiReactTest() {
  return (
    <SolidSessionProvider sessionId="solid-session-test">
      <div style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto' }}>
        <h1>Solid session 测试</h1>
        <p>测试本地 session provider 是否能登录 CSS v8</p>
        <hr />
        <LoginStatus />
      </div>
    </SolidSessionProvider>
  )
}
