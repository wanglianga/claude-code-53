'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearAuth, getUser, ROLE_NAME } from '@/lib/api';

const NAV = [
  { href: '/dashboard', label: '工作台', icon: '▣', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION', 'FINANCE', 'LAB'] },
  { href: '/patients', label: '患者档案', icon: '👤', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION', 'FINANCE'] },
  { href: '/schedule', label: '预约排期', icon: '📅', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION'] },
  { href: '/exceptions', label: '异常协同', icon: '⚠️', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION', 'FINANCE', 'LAB'] },
  { href: '/lab', label: '技工所', icon: '🦷', roles: ['ADMIN', 'DOCTOR', 'NURSE', 'RECEPTION', 'LAB'] },
  { href: '/payments', label: '收费管理', icon: '💳', roles: ['ADMIN', 'FINANCE', 'RECEPTION', 'DOCTOR'] },
  { href: '/admin', label: '系统管理', icon: '⚙️', roles: ['ADMIN'] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  if (!ready || !user) return <div className="loading">加载中…</div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          正畸管理平台
          <small>复诊排期 · 异常协同 · 长期档案</small>
        </div>
        <nav>
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? 'active' : ''}>
              <span>{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="who">
          <b>{user.name}</b>
          {ROLE_NAME[user.role] || user.role}
          <button
            className="btn sm dark"
            onClick={() => {
              clearAuth();
              router.replace('/login');
            }}
          >
            退出登录
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
