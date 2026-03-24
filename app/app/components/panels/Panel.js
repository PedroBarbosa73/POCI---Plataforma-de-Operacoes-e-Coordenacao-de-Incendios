'use client';

import { useState } from 'react';

export default function Panel({ title, icon, badge, badgeClass, defaultExpanded = true, children }) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <div className={`panel ${open ? 'expanded' : ''}`}>
      <div className="panel-header" onClick={() => setOpen(!open)}>
        <div className="panel-title">
          <span className="panel-title-icon">{icon}</span>
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {typeof badge !== 'undefined' ? (
            <span className={`panel-badge ${badgeClass || ''}`}>{badge}</span>
          ) : null}
          <span className="panel-chevron">v</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="panel-content">{children}</div>
      </div>
    </div>
  );
}
