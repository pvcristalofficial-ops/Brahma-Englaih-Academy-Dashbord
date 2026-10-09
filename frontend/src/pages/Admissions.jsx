import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { get, qs } from '../api';
import { useAsync, useDebounced } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Input, PageHeader, Pagination, Progress, Select, Spinner } from '../components/ui';
import { fmtDate, inr } from '../utils';

export const feeBadge = (a) => (a.fee_state === 'clear' ? <Badge tone="green">Fully paid</Badge> : a.fee_state === 'overdue' ? <Badge tone="red">Overdue {fmtDate(a.next_due_date, false)}</Badge> : <Badge tone="amber">Due {fmtDate(a.next_due_date, false)}</Badge>);

export default function Admissions() {
  const { meta } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const dq = useDebounced(q, 350);
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  useEffect(() => { if (dq !== (sp.get('q') || '')) setParam('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { q: sp.get('q'), course_id: sp.get('course_id'), fees: sp.get('fees'), page: sp.get('page') || 1, per_page: 25 };
  const { data, error, loading, reload } = useAsync(() => get(`/admissions${qs(params)}`), [sp.toString()]);

  return (
    <>
      <PageHeader title="Admitted students" subtitle="Everyone who has joined, with their fee account." />
      <Card pad={false}>
        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <div style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--muted)' }} />
              <Input style={{ paddingLeft: 34 }} placeholder="Name / mobile / admission no." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
            <Select value={sp.get('course_id') || ''} onChange={(e) => setParam('course_id', e.target.value)} placeholder="All courses" options={meta.courses.map((c) => ({ value: c.id, label: c.name }))} aria-label="Course" />
            <Select value={sp.get('fees') || ''} onChange={(e) => setParam('fees', e.target.value)} placeholder="All fee status" options={[{ value: 'pending', label: 'Balance pending' }, { value: 'overdue', label: 'Overdue' }, { value: 'clear', label: 'Fully paid' }]} aria-label="Fee status" />
          </div>
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data && <Spinner />}
        {data && data.data.length === 0 && <Empty title="No admitted students found" />}
        {data && data.data.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Student</th><th>Course</th><th style={{ minWidth: 150 }}>Fees</th><th>Status</th></tr></thead>
            <tbody>{data.data.map((a) => (
              <tr key={a.id}>
                <td><Link to={`/admissions/${a.id}`} className="cell-title">{a.student_name}</Link><div className="cell-sub"><span className="mono">{a.phone}</span> - {a.admission_no}</div></td>
                <td>{a.course_name}<div className="cell-sub">{a.batch_timing || 'Batch not set'} - joined {fmtDate(a.admission_date)}</div></td>
                <td><div className="small mono">{inr(a.paid_amount)} / {inr(a.net_fee)}</div><Progress value={a.paid_amount} max={a.net_fee} tone={a.fee_state === 'clear' ? 'green' : 'blue'} /></td>
                <td>{feeBadge(a)}{a.balance > 0 && <div className="cell-sub">Balance {inr(a.balance)}</div>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="card-body"><Pagination meta={data?.meta} onPage={(p) => setParam('page', String(p))} /></div>
      </Card>
    </>
  );
}
