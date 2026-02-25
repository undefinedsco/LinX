/**
 * Inrupt 库最简测试页面
 */
import { useState, useEffect, useRef } from 'react';
import { Session } from '@inrupt/solid-client-authn-browser';

const CSS_ISSUER = 'http://localhost:3000';
const REDIRECT_URI = 'http://localhost:5173/inrupt-test';
const SESSION_ID = 'inrupt-test-session';

export default function InruptTest() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState('初始化中...');
  const sessionRef = useRef<Session | null>(null);

  const log = (msg: string) => {
    console.log(msg);
    setLogs(prev => [...prev, msg]);
  };

  useEffect(() => {
    // 创建 Session（单例）
    if (!sessionRef.current) {
      sessionRef.current = new Session({}, SESSION_ID);
      log('Session created: ' + sessionRef.current.info.sessionId);
    }
    const session = sessionRef.current;

    // 监听事件
    const onLogin = () => {
      log('Event: login - ' + session.info.webId);
      setStatus('✅ 已登录: ' + session.info.webId);
    };
    const onLogout = () => {
      log('Event: logout');
      setStatus('未登录');
    };
    const onError = (err: unknown) => {
      log('Event: error - ' + String(err));
    };

    session.events.on('login', onLogin);
    session.events.on('logout', onLogout);
    session.events.on('error', onError);

    // 检查是否有回调参数
    const url = window.location.href;
    const hasAuthParams = url.includes('code=') || url.includes('error=');

    log('URL: ' + url.substring(0, 80) + '...');
    log('hasAuthParams: ' + hasAuthParams);
    log('isLoggedIn: ' + session.info.isLoggedIn);

    if (session.info.isLoggedIn) {
      setStatus('✅ 已登录: ' + session.info.webId);
      return;
    }

    // 处理回调或恢复会话
    log('Calling handleIncomingRedirect...');
    session.handleIncomingRedirect({
      url,
      restorePreviousSession: true,
    }).then(info => {
      log('handleIncomingRedirect result: ' + JSON.stringify(info));
      if (info?.isLoggedIn) {
        setStatus('✅ 登录成功: ' + info.webId);
        // 清理 URL
        window.history.replaceState({}, '', '/inrupt-test');
      } else {
        setStatus('未登录');
      }
    }).catch(err => {
      log('handleIncomingRedirect error: ' + err.message);
      console.error(err);
      setStatus('❌ 错误: ' + err.message);
    });

    return () => {
      session.events.off('login', onLogin);
      session.events.off('logout', onLogout);
      session.events.off('error', onError);
    };
  }, []);

  const handleLogin = async () => {
    const session = sessionRef.current;
    if (!session) return;

    log('=== 开始登录 ===');
    log('oidcIssuer: ' + CSS_ISSUER);
    log('redirectUrl: ' + REDIRECT_URI);
    
    setStatus('登录中...');

    try {
      await session.login({
        oidcIssuer: CSS_ISSUER,
        redirectUrl: REDIRECT_URI,
        clientName: 'Inrupt-Test',
      });
    } catch (err) {
      log('Login error: ' + (err as Error).message);
      console.error(err);
      setStatus('❌ 登录失败');
    }
  };

  const handleLogout = async () => {
    const session = sessionRef.current;
    if (!session) return;

    log('登出...');
    await session.logout();
    localStorage.clear();
    log('已登出，localStorage 已清除');
    setStatus('未登录');
  };

  const handleCheckStorage = () => {
    log('=== localStorage ===');
    Object.keys(localStorage).forEach(k => {
      const v = localStorage.getItem(k) || '';
      log(`${k} = ${v.length > 80 ? v.substring(0, 80) + '...' : v}`);
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Inrupt 库测试</h1>
      <div style={{ marginBottom: 10, fontSize: 18 }}>{status}</div>
      <div style={{ marginBottom: 20 }}>
        <button onClick={handleLogin} style={{ marginRight: 10 }}>登录</button>
        <button onClick={handleLogout} style={{ marginRight: 10 }}>登出</button>
        <button onClick={handleCheckStorage}>检查 localStorage</button>
      </div>
      <pre style={{ 
        background: '#f5f5f5', 
        padding: 10, 
        maxHeight: 400, 
        overflow: 'auto',
        fontSize: 12,
      }}>
        {logs.join('\n')}
      </pre>
    </div>
  );
}
