import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { get, qs } from '../api';
import { useAsync, useDebounced } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Card, Empty, ErrorBox, Input, PageHeader, Pagination, Select, Spinner } from '../components/ui';
import { fmtDate, inr } from '../utils';

export default function Receipts() {
  const { meta } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const dq = useDebounced(q, 350);
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  useEffect(() => { if (dq !== (sp.get('q') || '')) setParam('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { q: sp.get('q'), mode: sp.get('mode'), status: sp.get('status'), from: sp.get('from'), to: sp.get('to'), page: sp.get('page') || 1, per_page: 25 };
  const { data, error, loading, reload } = useAsync(() => get(`/receipts${qs(params)}`), [sp.toString()]);
  return (
    <>
      <PageHeader title="Receipts" subtitle={data ? `Collected in this view: ${inr(data.meta.valid_total)} (void receipts excluded)` : ' '} />
      <Card pad={false}>
        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <div style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--muted)' }} />
              <Input style={{ paddingLeft: 34 }} placeholder="Receipt no / student / mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
            <Select value={sp.get('mode') || ''} onChange={(e) => setParam('mode', e.target.value)} placeholder="All modes" options={meta.payment_modes} aria-label="Payment mode" />
            <Select value={sp.get('status') || ''} onChange={(e) => setParam('status', e.target.value)} placeholder="Valid + void" options={[{ value: 'valid', label: 'Valid only' }, { value: 'void', label: 'Void only' }]} aria-label="Status" />
            <Input type="date" value={sp.get('from') || ''} onChange={(e) => setParam('from', e.target.value)} aria-label="From" title="Payment date from" />
            <Input type="date" value={sp.get('to') || ''} onChange={(e) => setParam('to', e.target.value)} aria-label="To" title="Payment date to" />
          </div>
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data && <Spinner />}
        {data && data.data.length === 0 && <Empty title="No receipts found" />}
        {data && data.data.length > 0 && (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Receipt no.</th><th>Date</th><th>Student</th><th>Mode</th><th className="num">Amount</th></tr></thead>
            <tbody>{data.data.map((r) => (
              <tr key={r.id} style={r.status === 'void' ? { opacity: .6 } : undefined}>
                <td><Link to={`/receipts/${r.id}`} className="cell-title">{r.receipt_no}</Link>{r.status === 'void' && <> <Badge tone="red">VOID</Badge></>}</td>
                <td>{fmtDate(r.payment_date)}</td>
                <td>{r.student_name}<div className="cell-sub">{r.course_name} - {r.admission_no}</div></td>
                <td>{meta.payment_modes.find((m) => m.value === r.payment_mode)?.label}{r.reference_no && <div className="cell-sub">{r.reference_no}</div>}</td>
                <td className="num"><b>{inr(r.amount)}</b></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="card-body"><Pagination meta={data?.meta} onPage={(p) => setParam('page', String(p))} /></div>
      </Card>
    </>
  );
}
