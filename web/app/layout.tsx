import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '正畸复诊排期与矫治器异常平台',
  description: '口腔诊所正畸复诊排期、矫治器异常协同与患者长期档案管理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
