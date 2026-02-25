import { SessionProvider, LoginButton, useSession } from '@inrupt/solid-ui-react'

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
      <LoginButton
        oidcIssuer="http://localhost:3000"
        redirectUrl={window.location.href}
        authOptions={{ clientName: 'solid-ui-react-test' }}
      >
        <button>使用 CSS v8 登录</button>
      </LoginButton>
    </div>
  )
}

export default function SolidUiReactTest() {
  return (
    <SessionProvider sessionId="solid-ui-react-test">
      <div style={{ fontFamily: 'system-ui', maxWidth: 600, margin: '0 auto' }}>
        <h1>@inrupt/solid-ui-react 测试</h1>
        <p>测试 patch 后的库是否能登录 CSS v8</p>
        <hr />
        <LoginStatus />
      </div>
    </SessionProvider>
  )
}
