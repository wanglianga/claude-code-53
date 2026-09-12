'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead } from '@/components/ui';
import { api, fmtDate, fmtMoney, getUser, PAY_STATUS, PLAN_TYPE } from '@/lib/api';

const PAY_COLOR: Record<string, string> = { PENDING: 'amber', PAID: 'green', OVERDUE: 'red', WAIVED: 'gray' };

export default function PaymentsPage() {
  const user = getUser();
  const [summary, setSummary] = useState<any>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [method, setMethod] = useState('扫码');

  async function load(s = status) {
    try {
      const [sum, items] = await Promise.all([
        api.get('/payments/summary'),
        api.get(`/payments${s ? `?status=${s}` : ''}`),
      ]);
      setSummary(sum);
      setList(items);
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPay = ['FINANCE', 'RECEPTION', 'ADMIN'].includes(user?.role);

  return (
    <div>
      <PageHead title="收费管理" sub="收费阶段锚定治疗阶段；到期未付自动标记逾期并立案催收" />
      {summary ? (
        <div className="grid cols-3 mb16">
          <div className="stat good"><div className="label">已收（{summary.paid.count} 笔）</div><div className="num">{fmtMoney(summary.paid.amount)}</div></div>
          <div className="stat warn"><div className="label">待收（{summary.pending.count} 笔）</div><div className="num">{fmtMoney(summary.pending.amount)}</div></div>
          <div className="stat bad"><div className="label">逾期（{summary.overdue.count} 笔）</div><div className="num">{fmtMoney(summary.overdue.amount)}</div></div>
        </div>
      ) : null}
      <div className="row mb16">
        {[{ k: '', v: '全部' }, { k: 'OVERDUE', v: '已逾期' }, { k: 'PENDING', v: '待支付' }, { k: 'PAID', v: '已支付' }].map((x) => (
          <button key={x.k} className={`btn sm ${status === x.k ? 'primary' : ''}`} onClick={() => { setStatus(x.k); load(x.k); }}>{x.v}</button>
        ))}
      </div>
      {error ? <ErrorBox error={error} onRetry={() => load()} /> : null}
      {!list ? <Loading /> : list.length === 0 ? <Empty text="暂无收费记录" /> : (
        <Card>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>患者</th><th>方案</th><th>收费阶段</th><th>金额</th><th>应缴日期</th><th>状态</th><th>实缴/方式</th><th></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/patients/${p.patient.id}`}>{p.patient.name}</Link> <span className="small muted mono">{p.patient.mrn}</span></td>
                    <td className="small">{PLAN_TYPE[p.plan.type]} v{p.plan.version}</td>
                    <td>{p.name}{p.stage ? <div className="small muted">{p.stage.name}</div> : null}</td>
                    <td>{fmtMoney(p.amount)}</td>
                    <td className="mono">{fmtDate(p.dueDate)}</td>
                    <td><Badge text={PAY_STATUS[p.status]} color={PAY_COLOR[p.status]} /></td>
                    <td className="small">{p.paidAt ? `${fmtDate(p.paidAt)} · ${p.method || ''}` : '—'}</td>
                    <td>
                      {canPay && !['PAID', 'WAIVED'].includes(p.status) ? (
                        <button className="btn sm primary" onClick={() => setPayTarget(p)}>收款</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {payTarget ? (
        <Modal
          title={`收款：${payTarget.patient.name} · ${payTarget.name}（${fmtMoney(payTarget.amount)}）`}
          onClose={() => setPayTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPayTarget(null)}>取消</button>
              <button
                className="btn primary"
                onClick={async () => {
                  await api.post(`/payments/${payTarget.id}/pay`, { method });
                  setPayTarget(null);
                  load();
                }}
              >确认收款</button>
            </>
          }
        >
          <Field label="支付方式">
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>扫码</option><option>刷卡</option><option>现金</option><option>转账</option>
            </select>
          </Field>
          {payTarget.status === 'OVERDUE' ? <div className="alert warn small">该笔已逾期，收款后对应「付款逾期」异常将自动结案。</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}
