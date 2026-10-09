import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IndianRupee, MessageCircle } from 'lucide-react';
import { get } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner, Tabs } from '../components/ui';
import PaymentModal from '../components/PaymentModal';
import { fmtDate, inr, waLink } from '../utils';

export default function FeesDue() {
  const { meta } = useAuth();
  const nav = useNavigate();
  const [filter, setFilter] = useState('all');
  const [pay, setPay] = useState(null);
  const { data, error, loading, reload } = useAsync(() => get(`/fees/due?filter=${filter}`), [filter]);
  const c = data?.counts;
  const tabs = [
    { value: 'all', label: 'All pending', count: c?.pending },
    { value: 'overdue', label: 'Overdue', count: c?.overdue, tone: 'danger' },
    { value: 'today', label: 'Due today', count: c?.today },
    { value: 'upcoming', label: 'Next 7 days', count: c?.upcoming },
  ];
  return (
    <>
      <PageHeader title="Fees due" subtitle={c ? `${inr(c.pending_amount)} pending from ${c.pending} student${c.pending === 1 ? '' : 's'} - ${inr(c.overdue_amount)} overdue` : ' '} />
      <Tabs tabs={tabs} value={filter} onChange={setFilter} />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && data.data.length === 0 && <Empty title="No pending fees here">All instalments in this view are collected.</Empty>}
      {data && data.data.length > 0 && (
        <Card pad={false}>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Student</th><th>Course</th><th className="num">Balance</th><th>Due date</th><th /></tr></thead>
            <tbody>{data.data.map((a) => {
              const msg = `Namaste ${a.parent_name || a.student_name} ji, ${meta.academy.name} se reminder: ${a.student_name} ki ${a.course_name} ki fees ${inr(a.balance)} baaki hai${a.next_due_date ? ` (due date ${fmtDate(a.next_due_date)})` : ''}. Kripya jald jama karein. Dhanyavaad!`;
              return (
                <tr key={a.id}>
                  <td><Link to={`/admissions/${a.id}`} className="cell-title">{a.student_name}</Link><div className="cell-sub"><span className="mono">{a.phone}</span> - {a.admission_no}</div></td>
                  <td>{a.course_name}<div className="cell-sub">Paid {inr(a.paid_amount)} of {inr(a.net_fee)}</div></td>
                  <td className="num"><b>{inr(a.balance)}</b></td>
                  <td><Badge tone={a.fee_state === 'overdue' ? 'red' : 'amber'}>{fmtDate(a.next_due_date)}</Badge></td>
                  <td className="right nowrap">
                    <a className="btn btn-sm btn-wa" href={waLink(a.phone, msg)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />Remind</a>{' '}
                    <Button size="sm" variant="gold" icon={IndianRupee} onClick={() => setPay(a)}>Collect</Button>
                  </td>
                </tr>);
            })}</tbody>
          </table></div>
        </Card>
      )}
      <PaymentModal admission={pay} open={!!pay} onClose={() => setPay(null)} onDone={(r) => { setPay(null); nav(`/receipts/${r.id}?new=1`); }} />
    </>
  );
}
