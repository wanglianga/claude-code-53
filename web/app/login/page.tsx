'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, setAuth } from '@/lib/api';

const DEMO_ACCOUNTS = [
  { u: 'admin', p: 'admin123', label: '管理员' },
  { u: 'dr.wang', p: 'doctor123', label: '医生·王正畸' },
  { u: 'dr.li', p: 'doctor123', label: '医生·李早矫' },
  { u: 'nurse.chen', p: 'nurse123', label: '护士·陈' },
  { u: 'front.zhao', p: 'recept123', label: '前台·赵' },
  { u: 'fin.sun', p: 'finance123', label: '财务·孙' },
  { u: 'lab.zhou', p: 'lab123', label: '技工所·周' },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { username, password });
      setAuth(res.token, res.user);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f2b33 0%, #0e8a8a 140%)' }}>
      <div className="card" style={{ width: 400, maxWidth: '92vw' }}>
        <div className="card-body" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>正畸复诊排期与矫治器异常平台</h1>
          <p className="muted small" style={{ marginTop: 0, marginBottom: 20 }}>口腔诊所 · 复诊排期 / 异常协同 / 长期档案</p>
          {error ? <div className="alert error">{error}</div> : null}
          <form onSubmit={submit}>
            <div className="field">
              <label>用户名</label>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label>密码</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn primary" style={{ width: '100%', marginTop: 6 }} disabled={busy} type="submit">
              {busy ? '登录中…' : '登 录'}
            </button>
          </form>
          <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div className="small muted mb8">演示账号（点击填充）：</div>
            <div className="row" style={{ gap: 6 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.u}
                  className="btn sm"
                  onClick={() => {
                    setUsername(a.u);
                    setPassword(a.p);
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
