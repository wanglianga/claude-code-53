'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, ErrorBox, Field, PageHead } from '@/components/ui';
import { api, PLAN_TYPE } from '@/lib/api';

const DEFAULT_RULES: Record<string, { revisitWeeks: number; alignerDays?: number }> = {
  INVISIBLE: { revisitWeeks: 10, alignerDays: 10 },
  FIXED: { revisitWeeks: 5 },
  PEDIATRIC: { revisitWeeks: 6 },
};

function KVEditor({ items, onChange, fields }: { items: any[]; onChange: (v: any[]) => void; fields: { key: string; label: string; type?: string }[] }) {
  return (
    <div>
      {items.map((it, i) => (
        <div className="row mb8" key={i}>
          {fields.map((f) => (
            <input
              key={f.key}
              className="input"
              style={{ width: 130 }}
              type={f.type || 'text'}
              placeholder={f.label}
              value={it[f.key] ?? ''}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...next[i], [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value };
                onChange(next);
              }}
            />
          ))}
          <button className="btn sm danger" onClick={() => onChange(items.filter((_, j) => j !== i))}>删除</button>
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...items, {}])}>+ 添加</button>
    </div>
  );
}

export default function NewPlanPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;
  const [patient, setPatient] = useState<any>(null);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ type: 'INVISIBLE', revisitWeeks: 10, alignerDays: 10, expectedMonths: 18 });
  const [attachments, setAttachments] = useState<any[]>([]);
  const [extractions, setExtractions] = useState<any[]>([]);
  const [ipr, setIpr] = useState<any[]>([]);
  const [payStages, setPayStages] = useState<any[]>([]);
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/patients/${patientId}`).then(setPatient).catch(setError);
    api.get('/users/doctors').then(setDoctors).catch(() => {});
  }, [patientId]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const hasActive = !!patient?.activePlan;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/patients/${patientId}/plans`, {
        ...form,
        attachments,
        extractions,
        ipr,
        paymentStages: payStages.filter((p) => p.name && p.amount && p.dueDate),
      });
      router.push(`/patients/${patientId}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead
        title={hasActive ? '换方案（历史方案保留）' : '制定治疗方案'}
        sub={patient ? `患者：${patient.name}（${patient.mrn}）` : ''}
      />
      {hasActive ? (
        <div className="alert warn">
          该患者已有在治方案（{PLAN_TYPE[patient.activePlan.type]} v{patient.activePlan.version}）。提交后旧方案将标记为「已换方案」并完整保留历史，新方案版本号 +1。
        </div>
      ) : null}
      <Card title="方案信息">
        <ErrorBox error={error} />
        <div className="form-row-3">
          <Field label="方案类型" required>
            <select
              className="select"
              value={form.type}
              onChange={(e) => {
                const t = e.target.value;
                set('type', t);
                set('revisitWeeks', DEFAULT_RULES[t]?.revisitWeeks || 6);
                if (t === 'INVISIBLE') set('alignerDays', 10);
              }}
            >
              {Object.entries(PLAN_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="负责医生" required>
            <select className="select" value={form.doctorId || ''} onChange={(e) => set('doctorId', e.target.value)}>
              <option value="">请选择</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="预计周期（月）" required>
            <input className="input" type="number" value={form.expectedMonths || ''} onChange={(e) => set('expectedMonths', Number(e.target.value))} />
          </Field>
          {form.type === 'INVISIBLE' ? (
            <>
              <Field label="矫治器总副数" required>
                <input className="input" type="number" value={form.totalAligners || ''} onChange={(e) => set('totalAligners', Number(e.target.value))} />
              </Field>
              <Field label="每副佩戴天数">
                <input className="input" type="number" value={form.alignerDays || ''} onChange={(e) => set('alignerDays', Number(e.target.value))} />
              </Field>
            </>
          ) : null}
          <Field label="复诊节奏（周/次）" required>
            <input className="input" type="number" value={form.revisitWeeks || ''} onChange={(e) => set('revisitWeeks', Number(e.target.value))} />
          </Field>
          <Field label="总费用（元）">
            <input className="input" type="number" value={form.totalFee || ''} onChange={(e) => set('totalFee', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="方案说明">
          <textarea className="textarea" placeholder="诊断、矫治目标、关键步骤" value={form.note || ''} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {hasActive ? (
          <Field label="换方案原因" required>
            <textarea className="textarea" placeholder="例如：托槽反复脱落且患者美观需求高，转入隐形矫治" value={form.switchReason || ''} onChange={(e) => set('switchReason', e.target.value)} />
          </Field>
        ) : null}
      </Card>

      <div className="grid cols-3 mt16">
        <Card title="附件粘接计划">
          <KVEditor items={attachments} onChange={setAttachments} fields={[{ key: 'tooth', label: '牙位' }, { key: 'note', label: '附件类型' }]} />
        </Card>
        <Card title="拔牙计划">
          <KVEditor items={extractions} onChange={setExtractions} fields={[{ key: 'tooth', label: '牙位' }, { key: 'note', label: '备注' }]} />
        </Card>
        <Card title="片切（IPR）计划">
          <KVEditor items={ipr} onChange={setIpr} fields={[{ key: 'tooth', label: '牙位' }, { key: 'mm', label: '毫米', type: 'number' }]} />
        </Card>
      </div>

      <Card title="收费阶段" >
        <div className="mt8">
          {payStages.map((ps, i) => (
            <div className="row mb8" key={i}>
              <input className="input" style={{ width: 180 }} placeholder="阶段名称（如首期）" value={ps.name || ''} onChange={(e) => { const n = [...payStages]; n[i] = { ...n[i], name: e.target.value }; setPayStages(n); }} />
              <input className="input" style={{ width: 120 }} type="number" placeholder="金额" value={ps.amount || ''} onChange={(e) => { const n = [...payStages]; n[i] = { ...n[i], amount: Number(e.target.value) }; setPayStages(n); }} />
              <input className="input" style={{ width: 160 }} type="date" value={ps.dueDate || ''} onChange={(e) => { const n = [...payStages]; n[i] = { ...n[i], dueDate: e.target.value }; setPayStages(n); }} />
              <button className="btn sm danger" onClick={() => setPayStages(payStages.filter((_, j) => j !== i))}>删除</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setPayStages([...payStages, {}])}>+ 添加收费阶段</button>
        </div>
      </Card>

      <div className="row mt16">
        <button className="btn primary" onClick={submit} disabled={busy || !form.doctorId || !form.expectedMonths}>
          {busy ? '提交中…' : hasActive ? '确认换方案' : '创建方案'}
        </button>
        <button className="btn" onClick={() => router.back()}>取消</button>
      </div>
    </div>
  );
}
