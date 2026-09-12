'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Loading, PageHead } from '@/components/ui';
import { api, fmtTime, PLAN_TYPE } from '@/lib/api';

export default function PatientsPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<any>(null);

  async function load(kw = q) {
    try {
      setList(await api.get(`/patients${kw ? `?q=${encodeURIComponent(kw)}` : ''}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHead
        title="患者档案"
        sub="建档、方案、影像、复诊、收费、异常与长期时间轴"
        actions={
          <Link className="btn primary" href="/patients/new">+ 新患者建档</Link>
        }
      />
      <div className="row mb16">
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="搜索姓名 / 病历号 / 手机号"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button className="btn" onClick={() => load()}>搜索</button>
      </div>
      {error ? <ErrorBox error={error} onRetry={() => load()} /> : null}
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty text="没有匹配的患者" />
      ) : (
        <Card>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>病历号</th><th>姓名</th><th>性别/年龄</th><th>在治方案</th><th>负责医生</th><th>进度</th><th>下次复诊</th><th>异常</th><th></th></tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.mrn}</td>
                    <td><Link href={`/patients/${p.id}`}><b>{p.name}</b></Link></td>
                    <td className="small">
                      {p.gender}
                      {p.birthDate ? ` / ${Math.floor((Date.now() - new Date(p.birthDate).getTime()) / 31557600000)}岁` : ''}
                    </td>
                    <td>{p.activePlan ? <Badge text={PLAN_TYPE[p.activePlan.type]} color="teal" /> : <span className="muted small">未建方案</span>}</td>
                    <td className="small">{p.primaryDoctor?.name || '—'}</td>
                    <td className="small">
                      {p.activePlan?.totalAligners ? `第 ${p.activePlan.currentAligner}/${p.activePlan.totalAligners} 副` : p.activePlan ? '治疗中' : '—'}
                    </td>
                    <td className="small">{p.nextAppointment ? fmtTime(p.nextAppointment.startAt) : '—'}</td>
                    <td>{p.openExceptions > 0 ? <Badge text={`${p.openExceptions} 未结`} color="red" /> : <span className="muted small">无</span>}</td>
                    <td><Link className="btn sm" href={`/patients/${p.id}`}>档案</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
