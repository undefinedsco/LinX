import { Session } from '@inrupt/solid-client-authn-browser'
import { useEffect, useState } from 'react'

export default function InruptSimpleTest() {
  const [logs, setLogs] = useState<string[]>([])
  const [session] = useState(() => new Session({}, 'inrupt-simple-test'))

  const log = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, msg])
  }

  useEffect(() => {
    log('Session created: ' + session.info.sessionId)
    log('URL: ' + location.href)
    log('Has code: ' + location.search.includes('code='))

    session.events.on('error', (code, err) => log('ERROR: ' + code + ' ' + err))

    const handleAuth = async () => {
      if (location.search.includes('code=')) {
        log('Handling callback...')
        try {
          const info = await session.handleIncomingRedirect(location.href)
          log('Result: ' + JSON.stringify(info))
          if (info?.isLoggedIn) {
            log('✅ SUCCESS! WebID: ' + info.webId)
          }
        } catch (e: any) {
          log('❌ Error: ' + e.message)
        }
      } else {
        log('Click button to login...')
      }
    }

    handleAuth()
  }, [session])

  const handleLogin = () => {
    log('Starting login...')
    session.login({
      oidcIssuer: 'http://localhost:3000',
      redirectUrl: window.location.origin + '/test/inrupt-simple',
      clientName: 'InruptSimpleTest',
    })
  }

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Inrupt Simple Test (本地模块)</h1>
      <button onClick={handleLogin} style={{ padding: '10px 20px', fontSize: 16 }}>
        登录 CSS v8
      </button>
      <pre style={{ background: '#f0f0f0', padding: 10, marginTop: 20 }}>
        {logs.join('\n')}
      </pre>
    </div>
  )
}
