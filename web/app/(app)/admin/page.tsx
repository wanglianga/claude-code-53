'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, ErrorBox, Field, Loading, Modal, PageHead, Tabs } from '@/components/ui';
import { api, ROLE_NAME } from '@/lib/api';

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<any[] | null>(null);
  const [chairs, setChairs] = useState<any[]>([]);
  const [error, setError] = useState<any>(null);
  const [userModal, setUserModal] = useState(false);
  const [chairName, setChairName] = useState('');

  async function load() {
    try {
      const [u, c] = await Promise.all([api.get('/users'), api.get('/chairs')]);
      setUsers(u);
      setChairs(c);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHead title="系统管理" sub="账号、椅位资源（医生排班见「预约排期 → 医生排班」）" />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'users', label: '账号管理' }, { key: 'chairs', label: '椅位资源' }]} />
      {error ? <ErrorBox error={error} onRetry={load} /> : null}

      {tab === 'users' ? (
        <Card
          title="账号"
          extra={<button className="btn primary sm" onClick={() => setUserModal(true)}>+ 新建账号</button>}
        >
          {!users ? <Loading /> : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="mono">{u.username}</td>
                      <td>{u.name}</td>
                      <td><Badge text={ROLE_NAME[u.role] || u.role} color="blue" /></td>
                      <td><Badge text={u.active ? '启用' : '停用'} color={u.active ? 'green' : 'gray'} /></td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={async () => {
                            await api.patch(`/users/${u.id}`, { active: !u.active });
                            load();
                          }}
                        >{u.active ? '停用' : '启用'}</button>
                        <button
                          className="btn sm"
                          style={{ marginLeft: 6 }}
                          onClick={async () => {
                            const pwd = prompt(`为 ${u.name} 设置新密码：`);
                            if (pwd) {
                              await api.patch(`/users/${u.id}`, { password: pwd });
                              alert('密码已重置');
                            }
                          }}
                        >重置密码</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'chairs' ? (
        <Card title="椅位资源">
          <div className="row mb16">
            {chairs.map((c) => (
              <Badge key={c.id} text={`${c.name}${c.active ? '' : '（停用）'}`} color={c.active ? 'teal' : 'gray'} />
            ))}
          </div>
          <div className="row">
            <input className="input" style={{ width: 200 }} placeholder="新椅位名称，如 椅位 C1" value={chairName} onChange={(e) => setChairName(e.target.value)} />
            <button
              className="btn primary"
              disabled={!chairName}
              onClick={async () => {
                await api.post('/chairs', { name: chairName });
                setChairName('');
                load();
              }}
            >+ 添加椅位</button>
          </div>
        </Card>
      ) : null}

      {userModal ? <UserModal onClose={() => setUserModal(false)} onDone={() => { setUserModal(false); load(); }} /> : null}
    </div>
  );
}

function UserModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<any>({ role: 'NURSE' });
  const [error, setError] = useState<any>(null);
  return (
    <Modal
      title="新建账号"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={!form.username || !form.password || !form.name}
            onClick={async () => {
              try {
                await api.post('/users', form);
                onDone();
              } catch (e) {
                setError(e);
              }
            }}
          >创建</button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="form-row">
        <Field label="用户名" required><input className="input" value={form.username || ''} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
        <Field label="姓名" required><input className="input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="密码" required><input className="input" value={form.password || ''} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        <Field label="角色" required>
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
