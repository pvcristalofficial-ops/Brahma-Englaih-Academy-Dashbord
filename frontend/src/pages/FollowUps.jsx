import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, GraduationCap, PhoneCall } from 'lucide-react';
import { get, qs } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Button, Empty, ErrorBox, InterestBadge, PageHeader, Select, Spinner, Tabs } from '../components/ui';
import { CallButtons } from '../components/LeadActions';
import FollowUpModal from '../components/FollowUpModal';
import AdmitModal from '../components/AdmitModal';
import { dueText, fmtDate, fmtDateTime, fmtTime } from '../utils';

export default function FollowUps() {
  const { meta, isAdmin } = useAuth();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState(isAdmin ? 'all' : 'mine');
  const [logFor, setLogFor] = useState(null);
  const [admitFor, setAdmitFor] = useState(null);
  const { data, error, loading, reload } = useAsync(() => get(`/followups${qs({ filter, scope })}`), [filter, scope]);

  const c = data?.counts;
  const tabs = [
    { value: 'all', label: 'All due', count: c?.due_total },
    { value: 'today', label: 'Due today', count: c?.today },
    { value: 'overdue', label: 'Missed / carried forward', count: c?.overdue, tone: 'danger' },
    { value: 'auto', label: `Auto-added (${meta.academy.stale_days}+ days)`, count: c?.auto },
    { value: 'upcoming', label: 'Next 7 days', count: c?.upcoming },
  ];
  const scopeOptions = [{ value: 'mine', label: 'My leads (+ unassigned)' }, { value: 'all', label: 'Everyone' }, ...meta.users.map((u) => ({ value: String(u.id), label: u.name }))];

  return (
    <>
      <PageHeader title="Today's follow-ups" subtitle="Missed follow-ups are carried forward automatically, so no enquiry is forgotten.">
        <Select value={scope} onChange={(e) => setScope(e.target.value)} options={scopeOptions} aria-label="Whose leads" />
      </PageHeader>
      <Tabs tabs={tabs} value={filter} onChange={setFilter} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && (
        <Empty icon={CheckCircle2} title={filter === 'upcoming' ? 'Nothing scheduled in the next 7 days' : 'All caught up!'}>
          {filter === 'upcoming' ? 'New enquiries and follow-ups you schedule will show up here.' : 'No pending follow-ups right now. Great job.'}
        </Empty>
      )}
      <div className="lead-list">
        {data?.data.map((e) => (
          <article key={e.id} className={`lead ${e.due_state || ''}`}>
            <div>
              <h4>
                <Link to={`/enquiries/${e.id}`}>{e.student_name}</Link>
                {e.due_state === 'overdue' && <Badge tone="red">{dueText(e)}</Badge>}
                {e.due_state === 'today' && <Badge tone="green">Due today{e.next_follow_up_time ? ` at ${fmtTime(e.next_follow_up_time)}` : ''}</Badge>}
                {e.due_state === 'upcoming' && <Badge tone="blue">{fmtDate(e.due_date, false)}{e.next_follow_up_time ? ` ${fmtTime(e.next_follow_up_time)}` : ''}</Badge>}
                {e.auto_added && <Badge tone="violet" title={`No follow-up was scheduled and ${meta.academy.stale_days} days passed`}>Auto-added</Badge>}
                <InterestBadge level={e.interest_level} />
              </h4>
              <div className="meta">
                <span><b className="mono">{e.phone}</b></span>
                {e.parent_name && <span>Parent: {e.parent_name}</span>}
                <span>{e.course_name || 'Course not decided'}</span>
                <span>{meta.sources.find((s) => s.value === e.source)?.label}</span>
                <span>{e.follow_up_count} follow-up{e.follow_up_count === 1 ? '' : 's'}{e.last_contact_at ? ` - last ${fmtDateTime(e.last_contact_at)}` : ''}</span>
                {e.assigned_name && <span>Assigned: {e.assigned_name}</span>}
              </div>
              {e.notes && <div className="note">{e.notes}</div>}
            </div>
            <div className="actions">
              <CallButtons phone={e.phone} name={e.student_name} />
              <Button size="sm" variant="primary" icon={PhoneCall} onClick={() => setLogFor(e)}>Log follow-up</Button>
              <Button size="sm" variant="gold" icon={GraduationCap} onClick={() => setAdmitFor(e)}>Admit</Button>
            </div>
          </article>
        ))}
      </div>
      {data && data.meta.total > data.data.length && <p className="muted small">Showing first {data.data.length} of {data.meta.total}. Complete some to see the rest.</p>}
      <FollowUpModal enquiry={logFor} open={!!logFor} onClose={() => setLogFor(null)} onDone={() => { setLogFor(null); reload(); }} />
      <AdmitModal enquiry={admitFor} open={!!admitFor} onClose={() => setAdmitFor(null)} onDone={(r) => { setAdmitFor(null); nav(`/receipts/${r.receipt.id}?new=1`); }} />
    </>
  );
}
