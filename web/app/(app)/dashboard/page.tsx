'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Loading, PageHead } from '@/components/ui';
import { api, APPT_STATUS, EXC_TYPE, fmtMoney, fmtTime, getUser, LAB_STATUS, LAB_TYPE, PLAN_TYPE } from '@/lib/api';

const APPT_COLOR: Record<string, string> = {
  SCHEDULED: 'blue', ARRIVED: 'amber', NURSE_DONE: 'violet', COMPLETED: 'green', CANCELLED: 'gray', NO_SHOW: 'red',
};

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const user = getUser();

  async function load() {
    try {
      setData(await api.get('/dashboard'));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const openExc = data.openExceptions || [];
  const myTasks = data.myTasks || [];

  return (
    <div>
      <PageHead title="工作台" sub={`${new Date().toLocaleDateString('zh-CN')} · ${user?.name || ''}`} />
      <div className="grid cols-4 mb16">
        <div className="stat">
          <div className="label">今日预约</div>
          <div className="num">{data.todayAppointments.length}</div>
        </div>
        <div className="stat warn">
          <div className="label">待护士核验 / 待医生结论</div>
          <div className="num">
            {data.pendingNurse} / {data.pendingDoctor}
          </div>
        </div>
        <div className="stat bad">
          <div className="label">未结异常</div>
          <div className="num">{openExc.length}</div>
        </div>
        <div className="stat warn">
          <div className="label">逾期未收款</div>
          <div className="num">{data.overduePayments.length}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <Card
          title="今日预约"
          extra={<Link href="/schedule">排期管理 →</Link>}
        >
          {data.todayAppointments.length === 0 ? (
            <Empty text="今日暂无预约" />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>时间</th><th>患者</th><th>方案</th><th>医生/椅位</th><th>状态</th><th></th></tr>
                </thead>
                <tbody>
                  {data.todayAppointments.map((a: any) => (
                    <tr key={a.id}>
                      <td className="mono">{fmtTime(a.startAt)}</td>
                      <td><Link href={`/patients/${a.patient.id}`}>{a.patient.name}</Link></td>
                      <td>
                        <Badge text={PLAN_TYPE[a.plan.type]} color="teal" />
                        {a.plan.totalAligners ? <span className="small muted"> 第{a.plan.currentAligner}/{a.plan.totalAligners}副</span> : null}
                      </td>
                      <td className="small">{a.doctor.name} · {a.chair?.name || '—'}</td>
                      <td><Badge text={APPT_STATUS[a.status]} color={APPT_COLOR[a.status]} /></td>
                      <td>
                        {['ARRIVED', 'NURSE_DONE', 'SCHEDULED'].includes(a.status) ? (
                          <Link className="btn sm" href={`/visit/${a.id}`}>复诊台</Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={`我的待办任务（${myTasks.length}）`} extra={<Link href="/exceptions">异常协同 →</Link>}>
          {myTasks.length === 0 ? (
            <Empty text="暂无待办任务" />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>异常</th><th>患者</th><th>任务</th><th>立案时间</th></tr></thead>
                <tbody>
                  {myTasks.map((t: any) => (
                    <tr key={t.id}>
                      <td><Badge text={EXC_TYPE[t.exception.type]} color="red" /></td>
                      <td><Link href={`/patients/${t.exception.patient.id}`}>{t.exception.patient.name}</Link></td>
                      <td className="small">{t.note}</td>
                      <td className="small muted">{fmtTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="未结异常">
          {openExc.length === 0 ? (
            <Empty text="暂无未结异常" />
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>类型</th><th>患者</th><th>标题</th><th>影响(天)</th></tr></thead>
                <tbody>
                  {openExc.slice(0, 8).map((e: any) => (
                    <tr key={e.id}>
                      <td><Badge text={EXC_TYPE[e.type]} color="amber" /></td>
                      <td>{e.patient.name}</td>
                      <td className="small">{e.title}</td>
                      <td>{e.impactDays || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="技工所在途 & 逾期费用">
          <div className="mb8 small muted">在途技工单（{data.labInTransit.length}）</div>
          {data.labInTransit.slice(0, 4).map((o: any) => (
            <div key={o.id} className="spread" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
              <span className="small">{o.patient.name} · {LAB_TYPE[o.type]}{o.alignerFrom ? `（${o.alignerFrom}-${o.alignerTo}副）` : ''}</span>
              <Badge text={LAB_STATUS[o.status]} color="blue" />
            </div>
          ))}
          <div className="mb8 mt16 small muted">逾期未收款（{data.overduePayments.length}）</div>
          {data.overduePayments.length === 0 ? <div className="small muted">无</div> : null}
          {data.overduePayments.slice(0, 4).map((p: any) => (
            <div key={p.id} className="spread" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line)' }}>
              <span className="small">{p.patient.name} · {p.name}</span>
              <span className="small" style={{ color: 'var(--red)' }}>{fmtMoney(p.amount)}</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="card mt16">
        <div className="card-head">最新动态</div>
        <div className="card-body">
          <div className="timeline">
            {data.recentTimeline.map((t: any) => (
              <div className="tl-item" key={t.id}>
                <div className="tl-title">
                  <Badge text={t.kind} color="teal" /> <Link href={`/patients/${t.patient.id}`}>{t.patient.name}</Link> · {t.title}
                </div>
                <div className="tl-meta">{fmtTime(t.createdAt)}{t.actor ? ` · ${t.actor.name}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
