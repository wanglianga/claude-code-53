'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Badge, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, Tabs } from '@/components/ui';
import { api, APPT_STATUS, fmtDate, fmtTime, getUser, PLAN_TYPE } from '@/lib/api';

const APPT_COLOR: Record<string, string> = { SCHEDULED: 'blue', ARRIVED: 'amber', NURSE_DONE: 'violet', COMPLETED: 'green', CANCELLED: 'gray', NO_SHOW: 'red' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function SchedulePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = getUser();
  const [tab, setTab] = useState('list');
  const [date, setDate] = useState(todayStr());
  const [appointments, setAppointments] = useState<any[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);

  async function load() {
    try {
      setAppointments(await api.get(`/appointments?from=${todayStr(-7)}&to=${todayStr(14)}`));
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    load();
    if (searchParams.get('patientId')) setTab('suggest');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayList = (appointments || []).filter((a) => a.startAt.startsWith(date));

  return (
    <div>
      <PageHead title="预约排期" sub="智能槽位 = 医生出诊 × 椅位资源 × 患者时间；同一患者固定由方案负责医生接诊" />
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'list', label: '预约列表' },
          { key: 'suggest', label: '智能排期' },
          { key: 'shifts', label: '医生排班' },
          { key: 'leaves', label: '请假管理' },
        ]}
      />
      {error ? <ErrorBox error={error} onRetry={load} /> : null}

      {tab === 'list' ? (
        <>
          <div className="row mb16">
            <input className="input" style={{ width: 170 }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="btn sm" onClick={() => setDate(todayStr())}>今天</button>
            <button className="btn sm" onClick={() => setDate(todayStr(1))}>明天</button>
            <span className="small muted">当日 {dayList.length} 个预约</span>
          </div>
          {!appointments ? <Loading /> : dayList.length === 0 ? (
            <Empty text="当日暂无预约" />
          ) : (
            <Card>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>时间</th><th>患者</th><th>方案</th><th>医生</th><th>椅位</th><th>类型</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {dayList.map((a) => (
                      <tr key={a.id}>
                        <td className="mono">{fmtTime(a.startAt)}</td>
                        <td><Link href={`/patients/${a.patient.id}`}>{a.patient.name}</Link></td>
                        <td>
                          <Badge text={PLAN_TYPE[a.plan.type]} color="teal" />
                          {a.plan.totalAligners ? <span className="small muted"> {a.plan.currentAligner}/{a.plan.totalAligners}副</span> : null}
                        </td>
                        <td className="small">{a.doctor.name}</td>
                        <td className="small">{a.chair?.name || '—'}</td>
                        <td className="small">{a.type}</td>
                        <td><Badge text={APPT_STATUS[a.status]} color={APPT_COLOR[a.status]} /></td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            {a.status === 'SCHEDULED' ? (
                              <>
                                <button className="btn sm" onClick={async () => { await api.post(`/appointments/${a.id}/arrive`); load(); }}>到诊</button>
                                <button className="btn sm" onClick={() => setRescheduleTarget(a)}>改期</button>
                                <button className="btn sm danger" onClick={() => setCancelTarget(a)}>取消</button>
                              </>
                            ) : null}
                            {['ARRIVED', 'NURSE_DONE'].includes(a.status) ? (
                              <Link className="btn sm primary" href={`/visit/${a.id}`}>复诊台</Link>
                            ) : null}
                            {a.status === 'COMPLETED' && a.visit ? <Link className="btn sm" href={`/visit/${a.id}`}>查看</Link> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}

      {tab === 'suggest' ? <SuggestPanel presetPatientId={searchParams.get('patientId') || ''} onBooked={() => { setTab('list'); load(); }} /> : null}
      {tab === 'shifts' ? <ShiftsPanel user={user} /> : null}
      {tab === 'leaves' ? <LeavesPanel user={user} onChanged={load} /> : null}

      {rescheduleTarget ? (
        <RescheduleModal
          appt={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onDone={() => { setRescheduleTarget(null); load(); }}
        />
      ) : null}
      {cancelTarget ? (
        <Modal
          title={`取消预约：${cancelTarget.patient.name} ${fmtTime(cancelTarget.startAt)}`}
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setCancelTarget(null)}>返回</button>
              <button
                className="btn danger"
                onClick={async () => {
                  await api.post(`/appointments/${cancelTarget.id}/cancel`, { reason: (document.getElementById('cancel-reason') as HTMLInputElement).value });
                  setCancelTarget(null);
                  load();
                }}
              >确认取消</button>
            </>
          }
        >
          <Field label="取消原因">
            <input className="input" id="cancel-reason" placeholder="如：患者临时有事" />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}

/* ---------------- 智能排期 ---------------- */
function SuggestPanel({ presetPatientId, onBooked }: { presetPatientId: string; onBooked: () => void }) {
  const [patientId, setPatientId] = useState(presetPatientId);
  const [patientOptions, setPatientOptions] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [period, setPeriod] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [type, setType] = useState('复诊');
  const [note, setNote] = useState('');
  const [slots, setSlots] = useState<any[] | null>(null);
  const [clinical, setClinical] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/patients').then((list) => setPatientOptions(list.filter((p: any) => p.activePlan))).catch(() => {});
    if (presetPatientId) suggest(presetPatientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function suggest(pid = patientId, override = false) {
    setError(null);
    setOk('');
    setBusy(true);
    try {
      // 默认完全按临床规则（节点/类型/时长）；用户手工调整后才带覆盖参数
      const body: any = { patientId: pid, days: 14 };
      if (override) {
        if (fromDate) body.fromDate = fromDate;
        if (durationMin) body.durationMin = durationMin;
        if (type) body.type = type;
        if (period) body.period = period;
      }
      const res = await api.post('/appointments/suggest', body);
      setSlots(res.slots);
      setClinical(res.clinical);
      // 采用临床建议值填充表单（可再手工调整）
      setType(res.applied.type);
      setDurationMin(res.applied.durationMin);
      setFromDate(String(res.applied.fromDate).slice(0, 10));
    } catch (e) {
      setError(e);
      setSlots(null);
      setClinical(null);
    } finally {
      setBusy(false);
    }
  }

  async function book(slot: any) {
    setError(null);
    try {
      await api.post('/appointments', { patientId, startAt: slot.startAt, durationMin, type, note });
      setOk(`已预约 ${fmtTime(slot.startAt)}（${slot.chairName} · ${type} ${durationMin}分钟）`);
      setSlots(null);
      onBooked();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Card title="智能槽位建议">
      <ErrorBox error={error} />
      {ok ? <div className="alert ok">{ok}</div> : null}
      <div className="form-row-3">
        <Field label="患者（仅显示已建方案）" required>
          <select
            className="select"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setClinical(null);
              setSlots(null);
              if (e.target.value) suggest(e.target.value);
            }}
          >
            <option value="">请选择</option>
            {patientOptions.map((p) => <option key={p.id} value={p.id}>{p.name}（{PLAN_TYPE[p.activePlan.type]}）</option>)}
          </select>
        </Field>
        <Field label="起始日期（默认按临床节点）">
          <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="患者时间偏好">
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="">不限</option><option value="AM">仅上午</option><option value="PM">仅下午</option>
          </select>
        </Field>
        <Field label="预约类型（默认按临床建议）">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {['复诊', '粘附件', '拔牙', '片切', '重启取模', '保持器交付', '急诊'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="占用时长（分钟，默认按类型建议）">
          <select className="select" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
            <option value={30}>30</option><option value={45}>45</option><option value={60}>60</option><option value={90}>90</option>
          </select>
        </Field>
        <Field label="备注（患者时间要求）">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!patientId || busy} onClick={() => suggest(patientId, true)}>
          {busy ? '计算中…' : '按当前条件重新计算'}
        </button>
        <button className="btn" disabled={!patientId || busy} onClick={() => suggest(patientId, false)}>
          恢复临床建议值
        </button>
      </div>

      {clinical ? (
        <div className="alert info mt16" style={{ lineHeight: 1.8 }}>
          <b>临床建议</b>：{clinical.type} · 占用 {clinical.durationMin} 分钟 · 建议节点 {fmtDate(clinical.targetDate)}
          <br />
          <span className="small">依据：{clinical.reason}</span>
          {clinical.pendingItems?.length ? (
            <div className="mt8">
              {clinical.pendingItems.map((p: any, i: number) => (
                <Badge key={i} text={p.label} color="amber" />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {slots ? (
        slots.length === 0 ? (
          <div className="alert warn mt16">该医生在建议节点后 14 天内无可用槽位，可调整起始日期或检查排班/请假。</div>
        ) : (
          <div className="mt16">
            <div className="small muted mb8">点击槽位直接预约（{type} · {durationMin} 分钟 · 锁定方案负责医生 · 自动分配椅位）：</div>
            <div className="slot-grid">
              {slots.map((s, i) => (
                <div className="slot" key={i} onClick={() => book(s)}>
                  <b>{fmtDate(s.startAt)} {WEEKDAYS[new Date(s.startAt).getDay()]}</b>
                  {fmtTime(s.startAt)} · {s.chairName}
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}
    </Card>
  );
}

/* ---------------- 医生排班 ---------------- */
function ShiftsPanel({ user }: { user: any }) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ weekday: 1, startMin: 540, endMin: 720 });
  const [error, setError] = useState<any>(null);
  const canEdit = ['ADMIN', 'DOCTOR'].includes(user?.role);

  async function load() {
    const [ds, ss] = await Promise.all([api.get('/users/doctors'), api.get('/schedules')]);
    setDoctors(ds);
    setSchedules(ss);
    if (!form.doctorId && ds.length) setForm((f: any) => ({ ...f, doctorId: ds[0].id }));
  }
  useEffect(() => {
    load().catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minToStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  return (
    <Card title="医生出诊排班">
      <ErrorBox error={error} />
      <div className="tbl-wrap mb16">
        <table className="tbl">
          <thead><tr><th>医生</th>{WEEKDAYS.map((w) => <th key={w}>{w}</th>)}</tr></thead>
          <tbody>
            {doctors.map((d) => (
              <tr key={d.id}>
                <td><b>{d.name}</b></td>
                {WEEKDAYS.map((_, wd) => (
                  <td key={wd} className="small">
                    {schedules.filter((s) => s.doctorId === d.id && s.weekday === wd).map((s) => (
                      <div key={s.id} className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                        <span className="mono">{minToStr(s.startMin)}-{minToStr(s.endMin)}</span>
                        {canEdit ? (
                          <button className="btn ghost sm" style={{ padding: '0 4px' }} onClick={async () => { await api.del(`/schedules/${s.id}`); load(); }}>✕</button>
                        ) : null}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="row">
          {user?.role === 'ADMIN' ? (
            <select className="select" style={{ width: 140 }} value={form.doctorId || ''} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : null}
          <select className="select" style={{ width: 110 }} value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
            {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
          </select>
          <input className="input" style={{ width: 110 }} type="time" value={minToStr(form.startMin)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setForm({ ...form, startMin: h * 60 + m }); }} />
          <span>至</span>
          <input className="input" style={{ width: 110 }} type="time" value={minToStr(form.endMin)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); setForm({ ...form, endMin: h * 60 + m }); }} />
          <button
            className="btn primary"
            onClick={async () => {
              try {
                await api.post('/schedules', form);
                load();
              } catch (e: any) {
                setError(e);
              }
            }}
          >+ 添加排班</button>
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------- 请假 ---------------- */
function LeavesPanel({ user, onChanged }: { user: any; onChanged: () => void }) {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ startDate: todayStr(), endDate: todayStr() });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const canCreate = ['ADMIN', 'DOCTOR'].includes(user?.role);

  async function load() {
    const [ls, ds] = await Promise.all([api.get('/leaves'), api.get('/users/doctors')]);
    setLeaves(ls);
    setDoctors(ds);
    if (!form.doctorId && ds.length) setForm((f: any) => ({ ...f, doctorId: ds[0].id }));
  }
  useEffect(() => {
    load().catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {canCreate ? (
        <Card title="登记请假（自动检出受影响预约并立案）">
          <ErrorBox error={error} />
          {result ? (
            <div className="alert warn">
              请假已登记，影响 {result.affected.length} 个预约
              {result.affected.length > 0 ? '，已逐一立案（异常协同 → 医生请假），可在下方一键改期。' : '。'}
            </div>
          ) : null}
          <div className="row">
            {user?.role === 'ADMIN' ? (
              <select className="select" style={{ width: 140 }} value={form.doctorId || ''} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : null}
            <input className="input" style={{ width: 150 }} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <span>至</span>
            <input className="input" style={{ width: 150 }} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            <input className="input" style={{ width: 220 }} placeholder="请假原因" value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <button
              className="btn primary"
              onClick={async () => {
                setError(null);
                try {
                  const res = await api.post('/leaves', form);
                  setResult(res);
                  load();
                  onChanged();
                } catch (e: any) {
                  setError(e);
                }
              }}
            >登记请假</button>
          </div>
        </Card>
      ) : null}
      <Card title="请假记录">
        {leaves.length === 0 ? <Empty text="暂无请假记录" /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>医生</th><th>起止</th><th>原因</th><th>操作</th></tr></thead>
              <tbody>
                {leaves.map((l) => (
                  <tr key={l.id}>
                    <td>{l.doctor.name}</td>
                    <td className="mono">{fmtDate(l.startDate)} ~ {fmtDate(l.endDate)}</td>
                    <td className="small">{l.reason || '—'}</td>
                    <td>
                      {['RECEPTION', 'ADMIN'].includes(user?.role) ? (
                        <button
                          className="btn sm primary"
                          onClick={async () => {
                            const res = await api.post(`/leaves/${l.id}/auto-reschedule`);
                            alert(`改期完成：\n${res.map((r: any) => `${r.patient}：${fmtTime(r.from)} → ${r.to ? fmtTime(r.to) : r.error}`).join('\n')}`);
                            onChanged();
                          }}
                        >一键改期受影响预约</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- 改期弹窗 ---------------- */
function RescheduleModal({ appt, onClose, onDone }: { appt: any; onClose: () => void; onDone: () => void }) {
  const [slots, setSlots] = useState<any[] | null>(null);
  const [reason, setReason] = useState('患者临时延期');
  const [byPatient, setByPatient] = useState(true);
  const [error, setError] = useState<any>(null);
  // 槽位时长必须与原预约一致，否则临床处置类预约（45/60 分钟）会约不进
  const durationMin = Math.max(15, Math.round((new Date(appt.endAt).getTime() - new Date(appt.startAt).getTime()) / 60000));

  useEffect(() => {
    api
      .post('/appointments/suggest', { patientId: appt.patient.id, fromDate: todayStr(), days: 14, durationMin })
      .then((r) => setSlots(r.slots))
      .catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doReschedule(slot: any) {
    try {
      await api.post(`/appointments/${appt.id}/reschedule`, { startAt: slot.startAt, reason, byPatient });
      onDone();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <Modal
      title={`改期：${appt.patient.name}（原 ${fmtTime(appt.startAt)}）`}
      onClose={onClose}
      wide
    >
      <ErrorBox error={error} />
      <div className="form-row">
        <Field label="改期原因">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="是否患者原因（计入疗程延误）">
          <label className="checkline">
            <input type="checkbox" checked={byPatient} onChange={(e) => setByPatient(e.target.checked)} />
            患者临时延期，立案并评估疗程影响
          </label>
        </Field>
      </div>
      <div className="small muted mb8">选择新时间（同一负责医生，自动分配椅位）：</div>
      {!slots ? <Loading /> : slots.length === 0 ? (
        <div className="alert warn">未来 14 天无可用槽位</div>
      ) : (
        <div className="slot-grid">
          {slots.map((s, i) => (
            <div className="slot" key={i} onClick={() => doReschedule(s)}>
              <b>{fmtDate(s.startAt)} {WEEKDAYS[new Date(s.startAt).getDay()]}</b>
              {fmtTime(s.startAt)} · {s.chairName}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<Loading />}>
      <SchedulePageInner />
    </Suspense>
  );
}
