'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, ErrorBox, Field, PageHead } from '@/components/ui';
import { api } from '@/lib/api';

export default function NewPatientPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ gender: '女' });
  const [error, setError] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/users/doctors').then(setDoctors).catch(() => {});
  }, []);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const p = await api.post('/patients', form);
      router.push(`/patients/${p.id}/plan/new`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead title="新患者建档" sub="第一步：基础档案与牙周情况；第二步：制定治疗方案" />
      <Card title="基础档案">
        <ErrorBox error={error} />
        <div className="form-row">
          <Field label="姓名" required>
            <input className="input" value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="性别" required>
            <select className="select" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option>女</option><option>男</option>
            </select>
          </Field>
          <Field label="出生日期">
            <input className="input" type="date" value={form.birthDate || ''} onChange={(e) => set('birthDate', e.target.value)} />
          </Field>
          <Field label="手机号">
            <input className="input" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="负责医生">
            <select className="select" value={form.primaryDoctorId || ''} onChange={(e) => set('primaryDoctorId', e.target.value)}>
              <option value="">暂不指定</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="过敏史">
            <input className="input" value={form.allergy || ''} onChange={(e) => set('allergy', e.target.value)} />
          </Field>
        </div>
        <Field label="牙周情况">
          <textarea className="textarea" placeholder="牙龈状况、探诊出血、牙结石、牙周治疗史等" value={form.perioStatus || ''} onChange={(e) => set('perioStatus', e.target.value)} />
        </Field>
        <Field label="备注（患者时间偏好、主诉等）">
          <textarea className="textarea" value={form.note || ''} onChange={(e) => set('note', e.target.value)} />
        </Field>
        <div className="row mt8">
          <button className="btn primary" onClick={submit} disabled={busy || !form.name}>保存并制定方案 →</button>
          <button className="btn" onClick={() => router.back()}>取消</button>
        </div>
        <p className="small muted mt8">保存后进入方案制定页；口扫、面像、X 光片可在患者档案中随时上传归档。</p>
      </Card>
    </div>
  );
}
