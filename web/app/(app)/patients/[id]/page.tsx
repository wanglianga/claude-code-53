'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, Tabs } from '@/components/ui';
import {
  api, APPT_STATUS, EXC_STATUS, EXC_TYPE, fmtDate, fmtMoney, fmtTime, getUser,
  IMG_TYPE, LAB_STATUS, LAB_TYPE, PAY_STATUS, PLAN_TYPE,
} from '@/lib/api';

const APPT_COLOR: Record<string, string> = { SCHEDULED: 'blue', ARRIVED: 'amber', NURSE_DONE: 'violet', COMPLETED: 'green', CANCELLED: 'gray', NO_SHOW: 'red' };
const PAY_COLOR: Record<string, string> = { PENDING: 'amber', PAID: 'green', OVERDUE: 'red', WAIVED: 'gray' };
const EXC_COLOR: Record<string, string> = { OPEN: 'red', PROCESSING: 'amber', RESOLVED: 'green' };
const PLAN_STATUS_CN: Record<string, string> = { ACTIVE: '在治', COMPLETED: '已完成', SWITCHED: '已换方案', TERMINATED: '已终止' };

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const user = getUser();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [imgModal, setImgModal] = useState(false);
  const [excModal, setExcModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);

  async function load() {
    try {
      setP(await api.get(`/patients/${id}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!p) return <Loading />;

  const plan = p.activePlan;
  const age = p.birthDate ? Math.floor((Date.now() - new Date(p.birthDate).getTime()) / 31557600000) : null;

  return (
    <div>
      <PageHead
        title={`${p.name}（${p.mrn}）`}
        sub={`${p.gender}${age != null ? ` · ${age}岁` : ''} · 负责医生：${p.primaryDoctor?.name || '未指定'}${p.phone ? ` · ${p.phone}` : ''}`}
        actions={
          <>
            {plan ? (
              <>
                <Link className="btn primary" href={`/schedule?patientId=${p.id}`}>预约复诊</Link>
                <Link className="btn" href={`/patients/${p.id}/plan/new`}>换方案</Link>
                {user?.role === 'DOCTOR' || user?.role === 'ADMIN' ? (
                  <button className="btn" onClick={() => setTransferModal(true)}>转诊</button>
                ) : null}
              </>
            ) : (
              <Link className="btn primary" href={`/patients/${p.id}/plan/new`}>制定方案</Link>
            )}
            <button className="btn" onClick={() => setImgModal(true)}>上传影像</button>
            <button className="btn danger" onClick={() => setExcModal(true)}>登记异常</button>
          </>
        }
      />

      {plan ? (
        <div className="grid cols-4 mb16">
          <div className="stat">
            <div className="label">当前方案</div>
            <div style={{ marginTop: 4 }}>
              <Badge text={PLAN_TYPE[plan.type]} color="teal" /> <span className="small muted">v{plan.version}{plan.restartCount ? ` · 重启${plan.restartCount}次` : ''}</span>
            </div>
          </div>
          <div className="stat">
            <div className="label">矫治进度</div>
            <div className="num" style={{ fontSize: 20 }}>
              {plan.totalAligners ? `${plan.currentAligner}/${plan.totalAligners} 副` : '治疗中'}
            </div>
          </div>
          <div className={`stat ${p.delay?.delayed ? 'bad' : 'good'}`}>
            <div className="label">疗程延误评估</div>
            <div className="num" style={{ fontSize: 20 }}>
              {p.delay?.delayed ? `+${(p.delay.impactDays || 0) + (p.delay.overdueDays || 0)} 天` : '正常'}
            </div>
          </div>
          <div className="stat">
            <div className="label">当前阶段</div>
            <div style={{ marginTop: 4 }} className="small">{p.currentStage?.name || '—'}</div>
          </div>
        </div>
      ) : (
        <div className="alert info">该患者尚未制定治疗方案，请先建档制定方案。</div>
      )}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: '概览' },
          { key: 'plans', label: `方案（${p.plans.length}）` },
          { key: 'imaging', label: `影像（${p.imaging.length}）` },
          { key: 'visits', label: `复诊记录（${p.visits.length}）` },
          { key: 'payments', label: `收费（${p.plans.flatMap((x: any) => x.payments).length}）` },
          { key: 'lab', label: `技工所（${p.labOrders.length}）` },
          { key: 'exceptions', label: `异常（${p.exceptions.length}）` },
          { key: 'timeline', label: '时间轴' },
        ]}
      />

      {tab === 'overview' && <Overview p={p} />}
      {tab === 'plans' && <PlansTab p={p} router={router} />}
      {tab === 'imaging' && <ImagingTab p={p} onUpload={() => setImgModal(true)} />}
      {tab === 'visits' && <VisitsTab p={p} />}
      {tab === 'payments' && <PaymentsTab p={p} reload={load} user={user} />}
      {tab === 'lab' && <LabTab p={p} />}
      {tab === 'exceptions' && <ExceptionsTab p={p} reload={load} />}
      {tab === 'timeline' && <TimelineTab p={p} />}

      {imgModal ? <ImagingModal patientId={p.id} onClose={() => setImgModal(false)} onDone={() => { setImgModal(false); load(); }} /> : null}
      {excModal ? <ExceptionModal patientId={p.id} onClose={() => setExcModal(false)} onDone={() => { setExcModal(false); load(); }} /> : null}
      {transferModal && plan ? <TransferModal planId={plan.id} onClose={() => setTransferModal(false)} onDone={() => { setTransferModal(false); load(); }} /> : null}
    </div>
  );
}

/* ---------------- 概览 ---------------- */
function Overview({ p }: { p: any }) {
  const plan = p.activePlan;
  const upcoming = p.appointments.filter((a: any) => ['SCHEDULED', 'ARRIVED', 'NURSE_DONE'].includes(a.status));
  const openExc = p.exceptions.filter((e: any) => e.status !== 'RESOLVED');
  const unpaid = p.plans.flatMap((x: any) => x.payments).filter((x: any) => x.status !== 'PAID' && x.status !== 'WAIVED');
  return (
    <div className="grid cols-2">
      <Card title="基础档案">
        <dl className="kv">
          <dt>病历号</dt><dd className="mono">{p.mrn}</dd>
          <dt>出生日期</dt><dd>{fmtDate(p.birthDate)}</dd>
          <dt>联系方式</dt><dd>{p.phone || '—'}</dd>
          <dt>过敏史</dt><dd>{p.allergy || '—'}</dd>
          <dt>牙周情况</dt><dd>{p.perioStatus || '—'}</dd>
          <dt>备注</dt><dd>{p.note || '—'}</dd>
        </dl>
      </Card>
      <Card title="当前方案要点">
        {plan ? (
          <dl className="kv">
            <dt>方案类型</dt><dd><Badge text={PLAN_TYPE[plan.type]} color="teal" /> v{plan.version}</dd>
            <dt>负责医生</dt><dd>{plan.doctor.name}</dd>
            <dt>复诊节奏</dt><dd>每 {plan.revisitWeeks} 周一次</dd>
            {plan.totalAligners ? (<><dt>矫治器</dt><dd>共 {plan.totalAligners} 副，每副 {plan.alignerDays} 天，当前第 {plan.currentAligner} 副</dd></>) : null}
            <dt>附件粘接</dt><dd>{plan.attachments?.length ? plan.attachments.map((a: any) => `${a.tooth}${a.note ? `(${a.note})` : ''}`).join('、') : '无'}</dd>
            <dt>拔牙计划</dt><dd>{plan.extractions?.length ? plan.extractions.map((a: any) => `${a.tooth}${a.done ? '(已拔)' : ''}`).join('、') : '无'}</dd>
            <dt>片切计划</dt><dd>{plan.ipr?.length ? plan.ipr.map((a: any) => `${a.tooth} ${a.mm}mm`).join('、') : '无'}</dd>
            <dt>预计周期</dt><dd>{plan.expectedMonths} 个月（至 {fmtDate(plan.expectedEnd)}）</dd>
            <dt>总费用</dt><dd>{fmtMoney(plan.totalFee)}</dd>
          </dl>
        ) : <Empty text="未建方案" />}
      </Card>
      <Card title=" upcoming 预约">
        {upcoming.length === 0 ? <Empty text="暂无待复诊预约" /> : (
          <table className="tbl">
            <thead><tr><th>时间</th><th>类型</th><th>医生/椅位</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {upcoming.map((a: any) => (
                <tr key={a.id}>
                  <td className="mono">{fmtTime(a.startAt)}</td>
                  <td>{a.type}</td>
                  <td className="small">{a.doctor.name} · {a.chair?.name || '—'}</td>
                  <td><Badge text={APPT_STATUS[a.status]} color={APPT_COLOR[a.status]} /></td>
                  <td><Link className="btn sm" href={`/visit/${a.id}`}>复诊台</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="待处理事项">
        <div className="mb8 small muted">未结异常（{openExc.length}）</div>
        {openExc.slice(0, 3).map((e: any) => (
          <div key={e.id} className="spread" style={{ padding: '4px 0' }}>
            <span className="small"><Badge text={EXC_TYPE[e.type]} color="red" /> {e.title}</span>
          </div>
        ))}
        {openExc.length === 0 ? <div className="small muted">无</div> : null}
        <div className="mb8 mt16 small muted">未付费用（{unpaid.length}）</div>
        {unpaid.slice(0, 3).map((x: any) => (
          <div key={x.id} className="spread" style={{ padding: '4px 0' }}>
            <span className="small">{x.name} · 应缴 {fmtDate(x.dueDate)}</span>
            <Badge text={`${fmtMoney(x.amount)} ${PAY_STATUS[x.status]}`} color={PAY_COLOR[x.status]} />
          </div>
        ))}
        {unpaid.length === 0 ? <div className="small muted">无</div> : null}
      </Card>
    </div>
  );
}

/* ---------------- 方案 ---------------- */
function PlansTab({ p, router }: { p: any; router: any }) {
  return (
    <div>
      {p.plans.map((pl: any) => (
        <Card
          key={pl.id}
          title={`v${pl.version} · ${PLAN_TYPE[pl.type]} · ${PLAN_STATUS_CN[pl.status]}`}
          extra={<span className="small muted">{fmtDate(pl.startDate)} 开始 · 预计 {pl.expectedMonths} 个月 · {fmtMoney(pl.totalFee)}</span>}
        >
          {pl.switchReason ? <div className="alert warn small">换方案原因：{pl.switchReason}</div> : null}
          {pl.note ? <p className="small muted">{pl.note}</p> : null}
          <div className="row mb8">
            {pl.stages.map((s: any) => (
              <Badge key={s.id} text={`${s.name}${s.status === 'DONE' ? ' ✓' : ''}`} color={s.status === 'DONE' ? 'green' : 'blue'} />
            ))}
          </div>
          <div className="small muted">
            负责医生：{pl.doctor.name} · 复诊节奏：每 {pl.revisitWeeks} 周
            {pl.totalAligners ? ` · ${pl.currentAligner}/${pl.totalAligners} 副` : ''}
            {pl.restartCount ? ` · 重启 ${pl.restartCount} 次` : ''}
          </div>
        </Card>
      ))}
      <Link className="btn primary" href={`/patients/${p.id}/plan/new`}>{p.activePlan ? '换方案（保留历史）' : '制定方案'}</Link>
    </div>
  );
}

/* ---------------- 影像 ---------------- */
function ImagingTab({ p, onUpload }: { p: any; onUpload: () => void }) {
  const byStage: Record<string, any[]> = {};
  for (const img of p.imaging) {
    const key = img.stage?.name || '未锚定阶段';
    byStage[key] = byStage[key] || [];
    byStage[key].push(img);
  }
  return (
    <div>
      <div className="spread mb16">
        <span className="small muted">影像按治疗阶段归档，同类型自动递增版本号</span>
        <button className="btn primary" onClick={onUpload}>上传影像</button>
      </div>
      {p.imaging.length === 0 ? <Empty text="暂无影像" /> : null}
      {Object.entries(byStage).map(([stage, imgs]) => (
        <Card key={stage} title={stage}>
          <div className="img-grid">
            {imgs.map((img: any) => (
              <div className="img-card" key={img.id}>
                <div className="thumb">
                  {img.filePath && /\.(png|jpe?g|gif|webp)$/i.test(img.filePath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${img.filePath}`} alt={IMG_TYPE[img.type]} />
                  ) : img.filePath ? (
                    <a href={`/api/files/${img.filePath}`} target="_blank">查看文件</a>
                  ) : (
                    '仅登记（无文件）'
                  )}
                </div>
                <div className="meta">
                  <Badge text={IMG_TYPE[img.type]} color="teal" /> <Badge text={`v${img.version}`} color="blue" />
                  <div className="small muted mt8">{fmtDate(img.takenAt)}{img.note ? ` · ${img.note}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- 复诊记录 ---------------- */
function VisitsTab({ p }: { p: any }) {
  if (!p.visits.length) return <Empty text="暂无复诊记录" />;
  return (
    <div>
      {p.visits.map((v: any) => (
        <Card
          key={v.id}
          title={`${fmtTime(v.appointment.startAt)} · ${v.appointment.type}`}
          extra={<Badge text={v.stage?.name || '未锚定阶段'} color="blue" />}
        >
          <div className="grid cols-2">
            <div>
              <div className="small muted mb8">护士核验{v.nurse ? `（${v.nurse.name}）` : ''}</div>
              {v.nurseAt ? (
                <dl className="kv">
                  <dt>佩戴时长</dt><dd>{v.wearHours != null ? `${v.wearHours} 小时/天` : '—'}</dd>
                  <dt>口腔卫生</dt><dd>{{ GOOD: '良好', FAIR: '一般', POOR: '差' }[v.hygiene as string] || '—'}</dd>
                  <dt>附件脱落</dt><dd>{v.attachmentLost} 颗{v.attachmentLost >= 2 ? <Badge text="多次" color="red" /> : null}</dd>
                  <dt>牙套丢失</dt><dd>{v.alignerLost ? <Badge text="是" color="red" /> : '否'}</dd>
                  <dt>疼痛</dt><dd>{v.painLevel != null ? `${v.painLevel}/10` : '—'}</dd>
                  <dt>患者自述</dt><dd>{v.discomfort || '—'}</dd>
                  <dt>付款核验</dt><dd>{v.paymentChecked ? '已核验' : '未核验'}</dd>
                  {v.nurseNote ? (<><dt>护士备注</dt><dd>{v.nurseNote}</dd></>) : null}
                </dl>
              ) : <div className="small muted">未核验</div>}
            </div>
            <div>
              <div className="small muted mb8">医生结论{v.doctor ? `（${v.doctor.name}）` : ''}</div>
              {v.doctorAt ? (
                <dl className="kv">
                  <dt>移动达标</dt><dd>{v.movementOk == null ? '—' : v.movementOk ? <Badge text="达标" color="green" /> : <Badge text="不达标" color="red" />}</dd>
                  <dt>复诊结论</dt><dd>{v.conclusion || '—'}</dd>
                  <dt>处置</dt>
                  <dd className="row">
                    {v.advanceAligner ? <Badge text="进入下一副" color="teal" /> : null}
                    {v.restart ? <Badge text="重启方案" color="red" /> : null}
                    {v.needImaging ? <Badge text="追加拍片" color="amber" /> : null}
                    {v.completePlan ? <Badge text="治疗完成" color="green" /> : null}
                    {!v.advanceAligner && !v.restart && !v.needImaging && !v.completePlan ? '维持观察' : null}
                  </dd>
                  <dt>医嘱</dt><dd>{v.doctorAdvice || '—'}</dd>
                  {v.materials.length ? (<><dt>材料</dt><dd>{v.materials.map((m: any) => `${m.name}×${m.qty}${m.unit}`).join('、')}</dd></>) : null}
                </dl>
              ) : <div className="small muted">待医生结论</div>}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ---------------- 收费 ---------------- */
function PaymentsTab({ p, reload, user }: { p: any; reload: () => void; user: any }) {
  const [payTarget, setPayTarget] = useState<any>(null);
  const payments = p.plans.flatMap((x: any) => x.payments.map((y: any) => ({ ...y, planType: x.type, planVersion: x.version })));
  const canPay = ['FINANCE', 'RECEPTION', 'ADMIN'].includes(user?.role);
  return (
    <div>
      <Card title="收费阶段（锚定治疗阶段）">
        {payments.length === 0 ? <Empty text="暂无收费阶段" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>方案</th><th>阶段</th><th>金额</th><th>应缴日期</th><th>状态</th><th>实缴/方式</th><th></th></tr></thead>
              <tbody>
                {payments.map((x: any) => (
                  <tr key={x.id}>
                    <td className="small">{PLAN_TYPE[x.planType]} v{x.planVersion}</td>
                    <td>{x.name}</td>
                    <td>{fmtMoney(x.amount)}</td>
                    <td className="mono">{fmtDate(x.dueDate)}</td>
                    <td><Badge text={PAY_STATUS[x.status]} color={PAY_COLOR[x.status]} /></td>
                    <td className="small">{x.paidAt ? `${fmtDate(x.paidAt)} · ${x.method || ''}` : '—'}</td>
                    <td>{canPay && x.status !== 'PAID' && x.status !== 'WAIVED' ? <button className="btn sm primary" onClick={() => setPayTarget(x)}>收款</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {payTarget ? (
        <Modal
          title={`收款：${payTarget.name}（${fmtMoney(payTarget.amount)}）`}
          onClose={() => setPayTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setPayTarget(null)}>取消</button>
              <button
                className="btn primary"
                onClick={async () => {
                  await api.post(`/payments/${payTarget.id}/pay`, { method: (document.getElementById('pay-method') as HTMLSelectElement).value });
                  setPayTarget(null);
                  reload();
                }}
              >确认收款</button>
            </>
          }
        >
          <Field label="支付方式">
            <select className="select" id="pay-method">
              <option>扫码</option><option>刷卡</option><option>现金</option><option>转账</option>
            </select>
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- 技工所 ---------------- */
function LabTab({ p }: { p: any }) {
  if (!p.labOrders.length) return <Empty text="暂无技工单" />;
  const LAB_COLOR: Record<string, string> = { REQUESTED: 'amber', IN_PRODUCTION: 'blue', SHIPPED: 'violet', RECEIVED: 'green', CANCELLED: 'gray' };
  return (
    <Card title="技工所单据">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>类型</th><th>内容</th><th>阶段</th><th>技工所/单号</th><th>状态</th><th>申请/发货/签收</th></tr></thead>
          <tbody>
            {p.labOrders.map((o: any) => (
              <tr key={o.id}>
                <td><Badge text={LAB_TYPE[o.type]} color="teal" /></td>
                <td className="small">{o.alignerFrom != null ? `第 ${o.alignerFrom}${o.alignerTo !== o.alignerFrom ? `-${o.alignerTo}` : ''} 副` : ''}{o.note ? ` ${o.note}` : ''}</td>
                <td className="small">{o.stage?.name || '—'}</td>
                <td className="small">{o.labName || '—'}{o.trackingNo ? ` · ${o.trackingNo}` : ''}</td>
                <td><Badge text={LAB_STATUS[o.status]} color={LAB_COLOR[o.status]} /></td>
                <td className="small muted">{fmtDate(o.requestedAt)} / {fmtDate(o.shippedAt)} / {fmtDate(o.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- 异常 ---------------- */
function ExceptionsTab({ p, reload }: { p: any; reload: () => void }) {
  const [resolveTarget, setResolveTarget] = useState<any>(null);
  const [resolution, setResolution] = useState('');
  const [impactDays, setImpactDays] = useState(0);
  if (!p.exceptions.length) return <Empty text="暂无异常记录" />;
  return (
    <div>
      {p.exceptions.map((e: any) => (
        <Card
          key={e.id}
          title={<span><Badge text={EXC_TYPE[e.type]} color="red" /> {e.title}</span> as any}
          extra={<Badge text={EXC_STATUS[e.status]} color={EXC_COLOR[e.status]} />}
        >
          <div className="small muted mb8">
            {fmtTime(e.createdAt)} · 阶段：{e.stage?.name || '—'} · 疗程影响 {e.impactDays || 0} 天
          </div>
          {e.detail ? <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{e.detail}</p> : null}
          <div className="mb8">
            {e.tasks.map((t: any) => (
              <div className="checkline" key={t.id}>
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={t.done || e.status === 'RESOLVED'}
                  onChange={async () => {
                    await api.post(`/exceptions/${e.id}/tasks/${t.id}/done`);
                    reload();
                  }}
                />
                <span className="small">
                  <Badge text={t.assigneeRole} color="blue" /> {t.note}
                  {t.done ? <span className="muted">（已完成）</span> : null}
                </span>
              </div>
            ))}
          </div>
          {e.resolution ? <div className="alert ok small">处理结论：{e.resolution}</div> : null}
          {e.status !== 'RESOLVED' ? (
            <button className="btn sm primary" onClick={() => { setResolveTarget(e); setImpactDays(e.impactDays || 0); }}>结案</button>
          ) : null}
        </Card>
      ))}
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
                  setResolution('');
                  reload();
                }}
              >确认结案</button>
            </>
          }
        >
          <Field label="处理结论" required>
            <textarea className="textarea" value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </Field>
          <Field label="疗程影响（天）">
            <input className="input" type="number" value={impactDays} onChange={(e) => setImpactDays(Number(e.target.value))} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- 时间轴 ---------------- */
function TimelineTab({ p }: { p: any }) {
  if (!p.timeline.length) return <Empty text="暂无动态" />;
  return (
    <Card title="长期档案时间轴（所有事件锚定治疗阶段）">
      <div className="timeline">
        {p.timeline.map((t: any) => (
          <div className="tl-item" key={t.id}>
            <div className="tl-title">
              <Badge text={t.kind} color="teal" /> {t.title}
            </div>
            <div className="tl-meta">
              {fmtTime(t.createdAt)}{t.actor ? ` · ${t.actor.name}` : ''}{t.stage ? ` · ${t.stage.name}` : ''}
            </div>
            {t.detail ? <div className="tl-detail">{t.detail}</div> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- 弹窗：上传影像 ---------------- */
function ImagingModal({ patientId, onClose, onDone }: { patientId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('ORAL_SCAN');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Modal
      title="上传影像"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const fd = new FormData();
                fd.append('patientId', patientId);
                fd.append('type', type);
                fd.append('note', note);
                if (file) fd.append('file', file);
                await api.upload('/imaging', fd);
                onDone();
              } catch (e) {
                setError(e);
                setBusy(false);
              }
            }}
          >{busy ? '上传中…' : '上传归档'}</button>
        </>
      }
    >
      <ErrorBox error={error} />
      <Field label="影像类型" required>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(IMG_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="文件（口扫 STL/照片/影像；可不选仅登记）">
        <input ref={fileRef} className="input" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <Field label="备注">
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：阶段复核口扫（第 10 副结束）" />
      </Field>
    </Modal>
  );
}

/* ---------------- 弹窗：登记异常 ---------------- */
function ExceptionModal({ patientId, onClose, onDone }: { patientId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('ALIGNER_BROKEN');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [impactDays, setImpactDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  return (
    <Modal
      title="登记异常"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={busy || !title}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.post('/exceptions', { patientId, type, title, detail, impactDays });
                onDone();
              } catch (e) {
                setError(e);
                setBusy(false);
              }
            }}
          >立案</button>
        </>
      }
    >
      <ErrorBox error={error} />
      <Field label="异常类型" required>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(EXC_TYPE).filter(([k]) => k !== 'DOCTOR_LEAVE').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="标题" required>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：矫治器断裂（第 5 副）" />
      </Field>
      <Field label="详情">
        <textarea className="textarea" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <Field label="预估疗程影响（天）">
        <input className="input" type="number" value={impactDays} onChange={(e) => setImpactDays(Number(e.target.value))} />
      </Field>
    </Modal>
  );
}

/* ---------------- 弹窗：转诊 ---------------- */
function TransferModal({ planId, onClose, onDone }: { planId: string; onClose: () => void; onDone: () => void }) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<any>(null);
  useEffect(() => {
    api.get('/users/doctors').then(setDoctors).catch(() => {});
  }, []);
  return (
    <Modal
      title="转诊（更换负责医生，全程留痕）"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={!doctorId || !reason}
            onClick={async () => {
              try {
                await api.post(`/plans/${planId}/transfer`, { doctorId, reason });
                onDone();
              } catch (e) {
                setError(e);
              }
            }}
          >确认转诊</button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="alert info small">转诊后新预约将由新医生接诊；历史复诊记录仍归属原医生，方案链完整保留。</div>
      <Field label="新负责医生" required>
        <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
          <option value="">请选择</option>
          {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field label="转诊原因" required>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}
