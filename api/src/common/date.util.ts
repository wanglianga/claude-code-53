// 日期工具：全部基于服务器本地时区（容器 TZ=Asia/Shanghai）
export function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseDay(s: string): Date {
  // 'YYYY-MM-DD' → 本地零点
  const [y, m, dd] = s.split('-').map(Number);
  const d = new Date();
  d.setFullYear(y, m - 1, dd);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function overlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function fmtHM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
