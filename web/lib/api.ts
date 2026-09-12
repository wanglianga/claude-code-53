const TOKEN_KEY = 'ortho_token';
const USER_KEY = 'ortho_user';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): any {
  if (typeof window === 'undefined') return null;
  const s = localStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}

export function setAuth(token: string, user: any) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = { ...(options.headers as any) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearAuth();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('登录已过期', 401);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = data?.message
      ? Array.isArray(data.message)
        ? data.message.join('；')
        : data.message
      : `请求失败（${res.status}）`;
    throw new ApiError(msg, res.status);
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: any) => request(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: any) => request(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: (path: string) => request(path, { method: 'DELETE' }),
  upload: (path: string, formData: FormData) => request(path, { method: 'POST', body: formData }),
};

// ---------- 展示辅助 ----------
export const PLAN_TYPE: Record<string, string> = { INVISIBLE: '隐形矫治', FIXED: '固定托槽', PEDIATRIC: '儿童早矫' };
export const APPT_STATUS: Record<string, string> = {
  SCHEDULED: '已预约', ARRIVED: '已到诊', NURSE_DONE: '待医生结论', COMPLETED: '已完成', CANCELLED: '已取消', NO_SHOW: '爽约',
};
export const EXC_TYPE: Record<string, string> = {
  PATIENT_DELAY: '患者临时延期', ALIGNER_BROKEN: '矫治器断裂', ALIGNER_LOST: '牙套丢失',
  ATTACHMENT_REPEATED: '附件多次脱落', MOVEMENT_OFF_TRACK: '牙齿移动不达标', DOCTOR_LEAVE: '医生请假',
  PAYMENT_OVERDUE: '付款逾期', PLAN_RESTART: '重启方案', OTHER: '其他',
};
export const EXC_STATUS: Record<string, string> = { OPEN: '未处理', PROCESSING: '处理中', RESOLVED: '已解决' };
export const PAY_STATUS: Record<string, string> = { PENDING: '待支付', PAID: '已支付', OVERDUE: '已逾期', WAIVED: '已减免' };
export const LAB_STATUS: Record<string, string> = { REQUESTED: '已申请', IN_PRODUCTION: '制作中', SHIPPED: '已发货', RECEIVED: '已签收', CANCELLED: '已取消' };
export const LAB_TYPE: Record<string, string> = { ALIGNER_BATCH: '矫治器批次', RESTART_MAKE: '重启制作', RETAINER: '保持器', REPAIR: '补制/修理' };
export const IMG_TYPE: Record<string, string> = {
  ORAL_SCAN: '口扫', FACIAL_PHOTO: '面像', XRAY_PANO: '全景片', XRAY_CEPH: '头颅侧位片', CBCT: 'CBCT', INTRAORAL_PHOTO: '口内照',
};
export const ROLE_NAME: Record<string, string> = {
  ADMIN: '管理员', DOCTOR: '医生', NURSE: '护士', RECEPTION: '前台', FINANCE: '财务', LAB: '技工所',
};

export function fmtTime(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function fmtMoney(n?: number | null): string {
  if (n == null) return '—';
  return `¥${Number(n).toLocaleString('zh-CN')}`;
}
