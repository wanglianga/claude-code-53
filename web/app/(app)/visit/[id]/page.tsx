'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHead } from '@/components/ui';
import { api, APPT_STATUS, fmtDate, fmtMoney, fmtTime, getUser, PAY_STATUS, PLAN_TYPE } from '@/lib/api';

const PAY_COLOR: Record<string, string> = { PENDING: 'amber', PAID: 'green', OVERDUE: 'red', WAIVED: 'gray' };

export default function VisitPage() {
  const params = useParams();
  const id = params.id as string;
  const user = getUser();
  const [a, setA] = useState<any>(null);
  const [error, setError] = useState<any>(null);

  async function load() {
    try {
      setA(await api.get(`/appointments/${id}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!a) return <Loading />;

  const plan = a.plan;
  const visit = a.visit;
  const nurseDone = !!visit?.nurseAt;
  const doctorDone = !!visit?.doctorAt;
  const canNurse = ['NURSE', 'ADMIN'].includes(user?.role) && ['SCHEDULED', 'ARRIVED'].includes(a.status);
  const canDoctor = ['DOCTOR', 'ADMIN'].includes(user?.role) && a.status === 'NURSE_DONE';

  return (
    <div>
      <PageHead
        title={`复诊工作台：${a.patient.name}`}
        sub={`${fmtTime(a.startAt)} · ${a.type} · ${a.doctor.name} · ${a.chair?.name || '未分配椅位'}`}
        actions={<Link className="btn" href={`/patients/${a.patient.id}`}>患者档案 →</Link>}
      />

      <div className="step-bar">
        <div className={`step ${a.status === 'SCHEDULED' ? 'on' : 'done'}`}>1 预约到诊（{APPT_STATUS[a.status]}）</div>
        <div className={`step ${a.status === 'ARRIVED' ? 'on' : nurseDone ? 'done' : ''}`}>2 护士核验</div>
        <div className={`step ${a.status === 'NURSE_DONE' ? 'on' : doctorDone ? 'done' : ''}`}>3 医生结论</div>
        <div className={`step ${a.status === 'COMPLETED' ? 'done' : ''}`}>4 完成 · 自动约下次</div>
      </div>

      <div className="grid cols-3 mb16">
        <Card title="方案上下文">
          <dl className="kv">
            <dt>方案</dt><dd><Badge text={PLAN_TYPE[plan.type]} color="teal" /> v{plan.version}</dd>
            {plan.totalAligners ? (<><dt>矫治器</dt><dd>第 {plan.currentAligner}/{plan.totalAligners} 副（每副 {plan.alignerDays} 天）</dd></>) : null}
            <dt>当前阶段</dt><dd className="small">{a.stage?.name || '—'}</dd>
            <dt>附件计划</dt><dd className="small">{plan.attachments?.length ? plan.attachments.map((x: any) => x.tooth).join('、') : '无'}</dd>
            <dt>拔牙/片切</dt><dd className="small">
              {plan.extractions?.length ? `拔牙 ${plan.extractions.map((x: any) => x.tooth).join('、')}` : '无拔牙'}
              {plan.ipr?.length ? `；片切 ${plan.ipr.map((x: any) => `${x.tooth} ${x.mm}mm`).join('、')}` : ''}
            </dd>
            <dt>复诊节奏</dt><dd>每 {plan.revisitWeeks} 周</dd>
          </dl>
        </Card>
        <Card title="牙周与备注">
          <p className="small">{a.patient.perioStatus || '无牙周记录'}</p>
          <p className="small muted">{a.patient.note || ''}</p>
          {a.patient.allergy ? <div className="alert warn small">过敏史：{a.patient.allergy}</div> : null}
        </Card>
        <Card title="待付费用（护士核验付款阶段）">
          {a.duePayments.length === 0 ? <div className="small muted">无待付费用</div> : (
            a.duePayments.map((p: any) => (
              <div key={p.id} className="spread" style={{ padding: '4px 0' }}>
                <span className="small">{p.name} · 应缴 {fmtDate(p.dueDate)}</span>
                <Badge text={`${fmtMoney(p.amount)} ${PAY_STATUS[p.status]}`} color={PAY_COLOR[p.status]} />
              </div>
            ))
          )}
        </Card>
      </div>

      {/* 护士核验区 */}
      {nurseDone ? <NurseResult visit={visit} /> : canNurse ? <NurseForm appointmentId={id} onDone={load} /> : (
        <Card title="② 护士核验"><Empty text={a.status === 'SCHEDULED' || a.status === 'ARRIVED' ? '等待护士核验（护士账号操作）' : '未进行护士核验'} /></Card>
      )}

      {/* 医生结论区 */}
      <div className="mt16">
        {doctorDone ? (
          <DoctorResult visit={visit} appointment={a} />
        ) : canDoctor ? (
          <DoctorForm appointmentId={id} plan={plan} onDone={load} />
        ) : (
          <Card title="③ 医生结论">
            <Empty text={nurseDone ? '等待医生填写结论（医生账号操作）' : '完成护士核验后，医生在此填写结论'} />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ---------------- 护士核验表单 ---------------- */
function NurseForm({ appointmentId, onDone }: { appointmentId: string; onDone: () => void }) {
  const [form, setForm] = useState<any>({ wearHours: 20, hygiene: 'GOOD', attachmentLost: 0, alignerLost: false, painLevel: 0, paymentChecked: false });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/appointments/${appointmentId}/nurse-check`, form);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Card title="② 护士核验">
      <ErrorBox error={error} />
      <div className="form-row-3">
        <Field label="佩戴时长（小时/天）">
          <input className="input" type="number" value={form.wearHours} onChange={(e) => set('wearHours', Number(e.target.value))} />
        </Field>
        <Field label="口腔卫生">
          <select className="select" value={form.hygiene} onChange={(e) => set('hygiene', e.target.value)}>
            <option value="GOOD">良好</option><option value="FAIR">一般</option><option value="POOR">差</option>
          </select>
        </Field>
        <Field label="附件脱落（颗）">
          <input className="input" type="number" value={form.attachmentLost} onChange={(e) => set('attachmentLost', Number(e.target.value))} />
        </Field>
        <Field label="疼痛（0-10）">
          <input className="input" type="number" min={0} max={10} value={form.painLevel} onChange={(e) => set('painLevel', Number(e.target.value))} />
        </Field>
        <Field label="牙套丢失">
          <label className="checkline">
            <input type="checkbox" checked={form.alignerLost} onChange={(e) => set('alignerLost', e.target.checked)} />
            患者牙套丢失（将自动立案并补制）
          </label>
        </Field>
        <Field label="付款阶段核验">
          <label className="checkline">
            <input type="checkbox" checked={form.paymentChecked} onChange={(e) => set('paymentChecked', e.target.checked)} />
            已核对当前付款阶段（逾期将自动立案）
          </label>
        </Field>
      </div>
      <Field label="疼痛不适 / 患者自述">
        <textarea className="textarea" value={form.discomfort || ''} onChange={(e) => set('discomfort', e.target.value)} placeholder="患者主诉：酸胀、磨嘴、附件刮蹭等" />
      </Field>
      <Field label="护士备注">
        <input className="input" value={form.nurseNote || ''} onChange={(e) => set('nurseNote', e.target.value)} />
      </Field>
      <button className="btn primary" onClick={submit} disabled={busy}>{busy ? '提交中…' : '提交护士核验'}</button>
    </Card>
  );
}

function NurseResult({ visit }: { visit: any }) {
  return (
    <Card title="② 护士核验（已完成）">
      <div className="grid cols-3">
        <dl className="kv">
          <dt>佩戴时长</dt><dd>{visit.wearHours != null ? `${visit.wearHours} 小时/天` : '—'}</dd>
          <dt>口腔卫生</dt><dd>{{ GOOD: '良好', FAIR: '一般', POOR: '差' }[visit.hygiene as string] || '—'}</dd>
        </dl>
        <dl className="kv">
          <dt>附件脱落</dt><dd>{visit.attachmentLost} 颗</dd>
          <dt>牙套丢失</dt><dd>{visit.alignerLost ? <Badge text="是" color="red" /> : '否'}</dd>
          <dt>疼痛</dt><dd>{visit.painLevel != null ? `${visit.painLevel}/10` : '—'}</dd>
        </dl>
        <dl className="kv">
          <dt>付款核验</dt><dd>{visit.paymentChecked ? '已核验' : '未核验'}</dd>
          <dt>患者自述</dt><dd className="small">{visit.discomfort || '—'}</dd>
          {visit.nurseNote ? (<><dt>备注</dt><dd className="small">{visit.nurseNote}</dd></>) : null}
        </dl>
      </div>
    </Card>
  );
}

/* ---------------- 医生结论表单 ---------------- */
function DoctorForm({ appointmentId, plan, onDone }: { appointmentId: string; plan: any; onDone: () => void }) {
  const [form, setForm] = useState<any>({ movementOk: true, advanceAligner: plan.type === 'INVISIBLE', restart: false, needImaging: false, completePlan: false });
  const [materials, setMaterials] = useState<any[]>([]);
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/appointments/${appointmentId}/doctor-conclusion`, { ...form, materials });
      const next = res.nextAppointment ? `\n下次复诊已自动预约：${fmtTime(res.nextAppointment.startAt)}` : '';
      const exc = res.exceptions?.length ? `\n联动立案 ${res.exceptions.length} 项异常` : '';
      alert(`结论已提交。${next}${exc}`);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Card title="③ 医生结论">
      <ErrorBox error={error} />
      <div className="form-row-3">
        <Field label="牙齿移动是否达标">
          <select className="select" value={form.movementOk ? '1' : '0'} onChange={(e) => set('movementOk', e.target.value === '1')}>
            <option value="1">达标</option><option value="0">不达标（将立案评估）</option>
          </select>
        </Field>
        {plan.type === 'INVISIBLE' ? (
          <Field label={`进入下一副（当前第 ${plan.currentAligner}/${plan.totalAligners} 副）`}>
            <label className="checkline">
              <input type="checkbox" checked={form.advanceAligner} disabled={form.restart || form.completePlan} onChange={(e) => set('advanceAligner', e.target.checked)} />
              进入第 {Math.min(plan.currentAligner + 1, plan.totalAligners)} 副
            </label>
          </Field>
        ) : null}
        <Field label="追加拍片 / 取模">
          <label className="checkline">
            <input type="checkbox" checked={form.needImaging} onChange={(e) => set('needImaging', e.target.checked)} />
            需要追加拍片（记入医嘱）
          </label>
        </Field>
      </div>
      <div className="row mb16">
        <label className="checkline">
          <input type="checkbox" checked={form.restart} onChange={(e) => set('restart', e.target.checked)} />
          <span style={{ color: 'var(--red)' }}>重启方案（新取模制作，技工所联动）</span>
        </label>
        {form.restart ? (
          <input className="input" style={{ width: 180 }} type="number" placeholder="新方案总副数" value={form.newTotalAligners || ''} onChange={(e) => set('newTotalAligners', Number(e.target.value))} />
        ) : null}
        <label className="checkline">
          <input type="checkbox" checked={form.completePlan} onChange={(e) => set('completePlan', e.target.checked)} />
          <span style={{ color: 'var(--green)' }}>治疗完成（进入保持器交付）</span>
        </label>
      </div>
      <Field label="复诊结论 / 病历" required>
        <textarea className="textarea" value={form.conclusion || ''} onChange={(e) => set('conclusion', e.target.value)} placeholder="牙列移动情况、附件状态、下一步计划" />
      </Field>
      <Field label="医嘱">
        <textarea className="textarea" value={form.doctorAdvice || ''} onChange={(e) => set('doctorAdvice', e.target.value)} placeholder="佩戴时长、清洁、饮食注意等" />
      </Field>
      <Field label="本次材料使用">
        <div>
          {materials.map((m, i) => (
            <div className="row mb8" key={i}>
              <input className="input" style={{ width: 200 }} placeholder="材料名称" value={m.name || ''} onChange={(e) => { const n = [...materials]; n[i] = { ...n[i], name: e.target.value }; setMaterials(n); }} />
              <input className="input" style={{ width: 90 }} type="number" placeholder="数量" value={m.qty || ''} onChange={(e) => { const n = [...materials]; n[i] = { ...n[i], qty: Number(e.target.value) }; setMaterials(n); }} />
              <input className="input" style={{ width: 90 }} placeholder="单位" value={m.unit || '件'} onChange={(e) => { const n = [...materials]; n[i] = { ...n[i], unit: e.target.value }; setMaterials(n); }} />
              <button className="btn sm danger" onClick={() => setMaterials(materials.filter((_, j) => j !== i))}>删除</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setMaterials([...materials, { unit: '件' }])}>+ 添加材料</button>
        </div>
      </Field>
      <button className="btn primary" onClick={submit} disabled={busy || !form.conclusion}>
        {busy ? '提交中…' : '提交结论并完成复诊'}
      </button>
      <span className="small muted" style={{ marginLeft: 10 }}>提交后自动按复诊节奏预约下次（重启/完成除外）</span>
    </Card>
  );
}

function DoctorResult({ visit, appointment }: { visit: any; appointment: any }) {
  return (
    <Card title="③ 医生结论（已完成）">
      <dl className="kv">
        <dt>移动达标</dt><dd>{visit.movementOk == null ? '—' : visit.movementOk ? <Badge text="达标" color="green" /> : <Badge text="不达标" color="red" />}</dd>
        <dt>复诊结论</dt><dd>{visit.conclusion || '—'}</dd>
        <dt>处置</dt>
        <dd className="row">
          {visit.advanceAligner ? <Badge text="进入下一副" color="teal" /> : null}
          {visit.restart ? <Badge text="重启方案" color="red" /> : null}
          {visit.needImaging ? <Badge text="追加拍片" color="amber" /> : null}
          {visit.completePlan ? <Badge text="治疗完成" color="green" /> : null}
        </dd>
        <dt>医嘱</dt><dd>{visit.doctorAdvice || '—'}</dd>
        {visit.materials?.length ? (<><dt>材料</dt><dd>{visit.materials.map((m: any) => `${m.name}×${m.qty}${m.unit}`).join('、')}</dd></>) : null}
      </dl>
      {appointment.status === 'COMPLETED' ? <div className="alert ok mt8">本次复诊已完成，相关记录已归档至患者长期档案。</div> : null}
    </Card>
  );
}
