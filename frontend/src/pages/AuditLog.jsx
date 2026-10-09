import { useState } from 'react';
import { get, qs } from '../api';
import { useAsync } from '../hooks';
import { Button, Card, Empty, ErrorBox, Input, PageHeader, Pagination, Select, Spinner } from '../components/ui';
import { fmtDateTime } from '../utils';

const ENTITIES = ['enquiry', 'admission', 'receipt', 'course', 'user', 'settings', 'system'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }));

export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, error, loading, reload } = useAsync(() => get(`/audit-logs${qs({ entity, q, page })}`), [entity, q, page]);
  return (
    <>
      <PageHeader title="Activity log" subtitle="Who did what and when. Entries cannot be edited or deleted from the dashboard." />
      <Card pad={false}>
        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid">
            <Input placeholder="Search in description..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search" />
            <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} placeholder="Everything" options={ENTITIES} aria-label="Type" />
          </div>
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data && <Spinner />}
        {data && data.data.length === 0 && <Empty title="No activity found" />}
        {data && data.data.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th /></tr></thead>
            <tbody>{data.data.map((l) => (
              <>
                <tr key={l.id}>
                  <td className="nowrap">{fmtDateTime(l.created_at)}</td><td>{l.user_name || <span className="muted">Website / system</span>}</td>
                  <td>{l.summary}<div className="cell-sub">{l.action} - {l.entity_type}{l.entity_id ? ` #${l.entity_id}` : ''} {l.ip ? `- ${l.ip}` : ''}</div></td>
                  <td className="right">{(l.old_values || l.new_values) && <Button size="sm" variant="ghost" onClick={() => setOpen(open === l.id ? null : l.id)}>{open === l.id ? 'Hide' : 'Details'}</Button>}</td>
                </tr>
                {open === l.id && <tr key={`${l.id}d`}><td colSpan={4} style={{ background: 'var(--surface-2)' }}><div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><b className="small muted">BEFORE</b><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(l.old_values, null, 2) || '-'}</pre></div>
                  <div><b className="small muted">AFTER</b><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(l.new_values, null, 2) || '-'}</pre></div></div></td></tr>}
              </>))}</tbody>
          </table></div>
        )}
        <div className="card-body"><Pagination meta={data?.meta} onPage={setPage} /></div>
      </Card>
    </>
  );
}
