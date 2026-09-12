'use client';

import React from 'react';

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, extra, children }: { title?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card">
      {title ? (
        <div className="card-head">
          <span>{title}</span>
          {extra}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </div>
  );
}

const BADGE_COLORS: Record<string, string> = {
  gray: 'gray', teal: 'teal', blue: 'blue', amber: 'amber', red: 'red', green: 'green', violet: 'violet',
};

export function Badge({ text, color }: { text: string; color?: string }) {
  return <span className={`badge ${BADGE_COLORS[color || 'gray'] || 'gray'}`}>{text}</span>;
}

/** 状态 → 徽章颜色映射 */
export function StatusBadge({ text, map }: { text: string; map: Record<string, string> }) {
  const color = map[text] || 'gray';
  return <Badge text={text} color={color} />;
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-mask" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>
        {label} {required ? <b>*</b> : null}
      </label>
      {children}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={t.key === active ? 'active' : ''} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ text }: { text?: string }) {
  return <div className="empty">{text || '暂无数据'}</div>;
}

export function Loading() {
  return <div className="loading">加载中…</div>;
}

export function ErrorBox({ error, onRetry }: { error: any; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="alert error">
      {String(error.message || error)}
      {onRetry ? (
        <button className="btn sm" style={{ marginLeft: 10 }} onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
