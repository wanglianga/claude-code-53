'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead } from '@/components/ui';
import { api, fmtDate, getUser, LAB_STATUS, LAB_TYPE, PLAN_TYPE } from '@/lib/api';

const LAB_COLOR: Record<string, string> = { REQUESTED: 'amber', IN_PRODUCTION: 'blue', SHIPPED: 'violet', RECEIVED: 'green', CANCELLED: 'gray' };
const NEXT_ACTION: Record<string, { to: string; label: string }[]> = {
  REQUESTED: [{ to: 'IN_PRODUCTION', label: '接单制作' }, { to: 'CANCELLED', label: '取消' }],
  IN_PRODUCTION: [{ to: 'SHIPPED', label: '发货' }, { to: 'CANCELLED', label: '取消' }],
  SHIPPED: [{ to: 'RECEIVED', label: '到件签收' }],
};

export default function LabPage() {
  const user = getUser();
  const [status, setStatus] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [shipTarget, setShipTarget] = useState<any>(null);
  const [trackingNo, setTrackingNo] = useState('');
  const [labName, setLabName] = useState('');
  const [createModal, setCreateModal] = useState(false);

  async function load(s = status) {
    try {
      setList(await api.get(`/lab-orders${s ? `?status=${s}` : ''}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function transition(order: any, to: string) {
    if (to === 'SHIPPED') {
      setShipTarget(order);
      setLabName(order.labName || '精工齿科技工所');
      setTrackingNo('');
      return;
    }
    await api.patch(`/lab-orders/${order.id}`, { status: to });
    load();
  }

  const canOperate = ['LAB', 'NURSE', 'RECEPTION', 'ADMIN'].includes(user?.role);

  return (
    <div>
      <PageHead
        title="技工所协同"
        sub="矫治器批次 / 重启制作 / 补制 / 保持器，全流转回到患者档案"
        actions={<button className="btn primary" onClick={() => setCreateModal(true)}>+ 新建技工单</button>}
      />
      <div className="row mb16">
        {[{ k: '', v: '全部' }, { k: 'REQUESTED', v: '已申请' }, { k: 'IN_PRODUCTION', v: '制作中' }, { k: 'SHIPPED', v: '已发货' }, { k: 'RECEIVED', v: '已签收' }].map((x) => (
          <button key={x.k} className={`btn sm ${status === x.k ? 'primary' : ''}`} onClick={() => { setStatus(x.k); load(x.k); }}>{x.v}</button>
        ))}
      </div>
      {error ? <ErrorBox error={error} onRetry={() => load()} /> : null}
      {!list ? <Loading /> : list.length === 0 ? <Empty text="暂无技工单" /> : (
        <Card>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>患者</th><th>类型</th><th>内容</th><th>阶段</th><th>技工所/单号</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/patients/${o.patient.id}`}>{o.patient.name}</Link></td>
                    <td><Badge text={LAB_TYPE[o.type]} color="teal" /></td>
                    <td className="small">
                      {o.alignerFrom != null ? `第 ${o.alignerFrom}${o.alignerTo !== o.alignerFrom ? `-${o.alignerTo}` : ''} 副 ` : ''}
                      {o.note || ''}
                    </td>
                    <td className="small">{o.stage?.name || '—'}</td>
                    <td className="small">{o.labName || '—'}{o.trackingNo ? ` · ${o.trackingNo}` : ''}</td>
                    <td><Badge text={LAB_STATUS[o.status]} color={LAB_COLOR[o.status]} /></td>
                    <td className="small muted">{fmtDate(o.requestedAt)}</td>
                    <td>
                      {canOperate ? (
                        <div className="row" style={{ gap: 4 }}>
                          {(NEXT_ACTION[o.status] || []).map((a) => (
                            <button key={a.to} className={`btn sm ${a.to === 'CANCELLED' ? 'danger' : 'primary'}`} onClick={() => transition(o, a.to)}>
                              {a.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {shipTarget ? (
        <Modal
          title={`发货：${LAB_TYPE[shipTarget.type]}`}
          onClose={() => setShipTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setShipTarget(null)}>取消</button>
              <button
                className="btn primary"
                onClick={async () => {
                  await api.patch(`/lab-orders/${shipTarget.id}`, { status: 'SHIPPED', trackingNo, labName });
                  setShipTarget(null);
                  load();
                }}
              >确认发货</button>
            </>
          }
        >
          <Field label="技工所">
            <input className="input" value={labName} onChange={(e) => setLabName(e.target.value)} />
          </Field>
          <Field label="快递单号">
            <input className="input" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
          </Field>
        </Modal>
      ) : null}

      {createModal ? <CreateOrderModal onClose={() => setCreateModal(false)} onDone={() => { setCreateModal(false); load(); }} /> : null}
    </div>
  );
}

function CreateOrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [patients, setPatients] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ type: 'ALIGNER_BATCH' });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get('/patients').then((l) => setPatients(l.filter((p: any) => p.activePlan))).catch(() => {});
  }, []);
  return (
    <Modal
      title="新建技工单"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={busy || !form.patientId}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.post('/lab-orders', form);
                onDone();
              } catch (e) {
                setError(e);
                setBusy(false);
              }
            }}
          >开立</button>
        </>
      }
    >
      <ErrorBox error={error} />
      <Field label="患者" required>
        <select className="select" value={form.patientId || ''} onChange={(e) => setForm({ ...form, patientId: e.target.value })}>
          <option value="">请选择</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}（{PLAN_TYPE[p.activePlan.type]}）</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="类型" required>
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(LAB_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="技工所">
          <input className="input" value={form.labName || ''} onChange={(e) => setForm({ ...form, labName: e.target.value })} placeholder="精工齿科技工所" />
        </Field>
        <Field label="副数从">
          <input className="input" type="number" value={form.alignerFrom || ''} onChange={(e) => setForm({ ...form, alignerFrom: Number(e.target.value) })} />
        </Field>
        <Field label="副数到">
          <input className="input" type="number" value={form.alignerTo || ''} onChange={(e) => setForm({ ...form, alignerTo: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="备注">
        <textarea className="textarea" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
    </Modal>
  );
}
