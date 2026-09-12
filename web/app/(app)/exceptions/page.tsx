'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead } from '@/components/ui';
import { api, EXC_STATUS, EXC_TYPE, fmtTime, getUser, ROLE_NAME } from '@/lib/api';

const EXC_COLOR: Record<string, string> = { OPEN: 'red', PROCESSING: 'amber', RESOLVED: 'green' };

export default function ExceptionsPage() {
  const user = getUser();
  const [status, setStatus] = useState('');
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [resolveTarget, setResolveTarget] = useState<any>(null);
  const [resolution, setResolution] = useState('');
  const [impactDays, setImpactDays] = useState(0);

  async function load(s = status) {
    try {
      setList(await api.get(`/exceptions${s ? `?status=${s}` : ''}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filter = (s: string) => {
    setStatus(s);
    load(s);
  };

  return (
    <div>
      <PageHead title="异常协同" sub="患者、医生、护士、技工所、财务在同一治疗计划里协同处理异常" />
      <div className="row mb16">
        {[{ k: '', v: '全部' }, { k: 'OPEN', v: '未处理' }, { k: 'PROCESSING', v: '处理中' }, { k: 'RESOLVED', v: '已解决' }].map((x) => (
          <button key={x.k} className={`btn sm ${status === x.k ? 'primary' : ''}`} onClick={() => filter(x.k)}>{x.v}</button>
        ))}
      </div>
      {error ? <ErrorBox error={error} onRetry={() => load()} /> : null}
      {!list ? <Loading /> : list.length === 0 ? <Empty text="暂无异常" /> : (
        list.map((e) => (
          <Card
            key={e.id}
            title={<span><Badge text={EXC_TYPE[e.type]} color="red" /> {e.title}</span> as any}
            extra={<Badge text={EXC_STATUS[e.status]} color={EXC_COLOR[e.status]} />}
          >
            <div className="small muted mb8">
              患者 <Link href={`/patients/${e.patient.id}`}><b>{e.patient.name}</b></Link>（{e.patient.mrn}）
              {e.plan ? ` · ${e.plan.type} v${e.plan.version}` : ''}{e.stage ? ` · ${e.stage.name}` : ''}
              · {fmtTime(e.createdAt)} 立案 · 疗程影响 {e.impactDays || 0} 天
            </div>
            {e.detail ? <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.detail}</p> : null}
            <div className="mb8">
              {e.tasks.map((t: any) => (
                <div className="checkline" key={t.id}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={t.done || e.status === 'RESOLVED' || (t.assigneeRole !== user?.role && user?.role !== 'ADMIN')}
                    onChange={async () => {
                      await api.post(`/exceptions/${e.id}/tasks/${t.id}/done`);
                      load();
                    }}
                  />
                  <span className="small">
                    <Badge text={ROLE_NAME[t.assigneeRole] || t.assigneeRole} color="blue" /> {t.note}
                    {t.done ? <span className="muted">（已完成 {fmtTime(t.doneAt)}）</span> : null}
                  </span>
                </div>
              ))}
            </div>
            {e.resolution ? <div className="alert ok small">处理结论：{e.resolution}（{fmtTime(e.resolvedAt)}）</div> : null}
            {e.status !== 'RESOLVED' ? (
              <button className="btn sm primary" onClick={() => { setResolveTarget(e); setImpactDays(e.impactDays || 0); setResolution(''); }}>结案</button>
            ) : null}
          </Card>
        ))
      )}
      {resolveTarget ? (
        <Modal
          title={`结案：${resolveTarget.title}`}
          onClose={() => setResolveTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setResolveTarget(null)}>取消</button>
              <button
                className="btn primary"
                disabled={!resolution}
                onClick={async () => {
                  await api.post(`/exceptions/${resolveTarget.id}/resolve`, { resolution, impactDays });
                  setResolveTarget(null);
                  load();
                }}
              >确认结案</button>
            </>
          }
        >
          <Field label="处理结论" required>
            <textarea className="textarea" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          <Field label="疗程影响（天，计入疗程延误评估）">
            <input className="input" type="number" value={impactDays} onChange={(e) => setImpactDays(Number(e.target.value))} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
