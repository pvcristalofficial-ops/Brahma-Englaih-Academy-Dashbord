import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Plus, Search } from 'lucide-react';
import { get, qs, downloadUrl } from '../api';
import { useAsync, useDebounced } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Button, Card, Empty, ErrorBox, Input, InterestBadge, LinkButton, PageHeader, Pagination, Select, Spinner, StatusBadge } from '../components/ui';
import { CallButtons } from '../components/LeadActions';
import { dueText, fmtDate } from '../utils';

export default function Enquiries() {
  const { meta, isAdmin } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const get_ = (k) => sp.get(k) || '';
  const [q, setQ] = useState(get_('q'));
  const dq = useDebounced(q, 350);

  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    if (k !== 'page') n.delete('page');
    setSp(n, { replace: true });
  };
  useEffect(() => { if (dq !== get_('q')) setParam('q', dq); }, [dq]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setQ(get_('q')); }, [sp.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = { q: get_('q'), status: get_('status'), source: get_('source'), course_id: get_('course_id'), assigned_to: get_('assigned_to'), interest: get_('interest'), from: get_('from'), to: get_('to'), sort: get_('sort'), archived: get_('archived'), page: get_('page') || 1, per_page: 25 };
  const { data, error, loading, reload } = useAsync(() => get(`/enquiries${qs(params)}`), [sp.toString()]);
  const exportHref = downloadUrl(`/enquiries/export${qs({ ...params, page: '', per_page: '' })}`);

  return (
    <>
      <PageHeader title="Enquiries" subtitle="Every student enquiry, safely stored. Search by name, mobile number or ENQ number.">
        {isAdmin && <LinkButton href={exportHref} icon={Download}>Export CSV</LinkButton>}
        <Button variant="gold" icon={Plus} onClick={() => nav('/enquiries/new')}>New Enquiry</Button>
      </PageHeader>
      <Card pad={false} className="">
        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 13, color: 'var(--muted)' }} />
              <Input style={{ paddingLeft: 34 }} placeholder="Name / mobile / ENQ-00012" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </div>
            <Select value={get_('status')} onChange={(e) => setParam('status', e.target.value)} placeholder="All statuses" options={meta.statuses} aria-label="Status" />
            <Select value={get_('source')} onChange={(e) => setParam('source', e.target.value)} placeholder="All sources" options={meta.sources} aria-label="Source" />
            <Select value={get_('course_id')} onChange={(e) => setParam('course_id', e.target.value)} placeholder="All courses" options={meta.courses.map((c) => ({ value: c.id, label: c.name }))} aria-label="Course" />
            <Select value={get_('interest')} onChange={(e) => setParam('interest', e.target.value)} placeholder="Any interest" options={meta.interest} aria-label="Interest" />
            <Select value={get_('assigned_to')} onChange={(e) => setParam('assigned_to', e.target.value)} placeholder="Anyone" options={[{ value: 'me', label: 'Assigned to me' }, { value: 'none', label: 'Unassigned' }, ...meta.users.map((u) => ({ value: u.id, label: u.name }))]} aria-label="Assigned to" />
            <Input type="date" value={get_('from')} onChange={(e) => setParam('from', e.target.value)} aria-label="From date" title="Enquiry date from" />
            <Input type="date" value={get_('to')} onChange={(e) => setParam('to', e.target.value)} aria-label="To date" title="Enquiry date to" />
            <Select value={get_('sort')} onChange={(e) => setParam('sort', e.target.value)} placeholder="Newest first" options={[{ value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A-Z' }, { value: 'recent_contact', label: 'Recently contacted' }]} aria-label="Sort" />
            {isAdmin && <Select value={get_('archived')} onChange={(e) => setParam('archived', e.target.value)} placeholder="Active enquiries" options={[{ value: '1', label: 'Archived only' }]} aria-label="Archived" />}
          </div>
          {sp.toString() && <div style={{ marginTop: 10 }}><Button size="sm" variant="ghost" onClick={() => { setSp({}, { replace: true }); setQ(''); }}>Clear filters</Button></div>}
        </div>
        <ErrorBox error={error} onRetry={reload} />
        {loading && !data && <Spinner />}
        {data && data.data.length === 0 && <Empty title="No enquiries found">Try clearing the filters, or add a new enquiry.</Empty>}
        {data && data.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Course / Source</th><th>Status</th><th>Next follow-up</th><th className="hide-sm">Assigned</th><th /></tr></thead>
              <tbody>
                {data.data.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/enquiries/${e.id}`} className="cell-title">{e.student_name}</Link>
                      <div className="cell-sub"><span className="mono">{e.phone}</span> - {e.enquiry_no} - {fmtDate(e.enquiry_date)}</div></td>
                    <td>{e.course_name || <span className="muted">Not decided</span>}<div className="cell-sub">{meta.sources.find((s) => s.value === e.source)?.label}{e.campaign ? ` - ${e.campaign}` : ''}</div></td>
                    <td><div className="row" style={{ gap: 6 }}><StatusBadge status={e.status} meta={meta} />{['new', 'follow_up', 'demo_scheduled'].includes(e.status) && <InterestBadge level={e.interest_level} />}</div></td>
                    <td>{e.due_state ? <><Badge tone={e.due_state === 'overdue' ? 'red' : e.due_state === 'today' ? 'green' : 'blue'}>{dueText(e)}</Badge><div className="cell-sub">{e.auto_added ? 'Auto-added (no date set)' : fmtDate(e.next_follow_up_date)}</div></> : <span className="muted">-</span>}</td>
                    <td className="hide-sm">{e.assigned_name || <span className="muted">Unassigned</span>}</td>
                    <td className="right nowrap"><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}><CallButtons phone={e.phone} name={e.student_name} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="card-body"><Pagination meta={data?.meta} onPage={(p) => setParam('page', String(p))} /></div>
      </Card>
    </>
  );
}
