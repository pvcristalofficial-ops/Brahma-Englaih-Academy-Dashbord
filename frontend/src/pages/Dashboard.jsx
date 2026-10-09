import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Flame, IndianRupee, Percent, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { get } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Select, Spinner } from '../components/ui';
import { ComboChart, HBars } from '../components/Charts';
import { fmtDate, inr, inrCompact, todayISO } from '../utils';

const RANGES = [{ value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last 12 months' }];

function Kpi({ icon: Icon, label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="label"><Icon size={15} />{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user, meta } = useAuth();
  const nav = useNavigate();
  const [days, setDays] = useState('30');
  const { data, error, loading, reload } = useAsync(() => get(`/dashboard?days=${days}`), [days]);
  const [showTable, setShowTable] = useState(false);

  const d = data?.data;
  const f = d?.followups;
  const k = d?.kpi;
  const pipe = d?.pipeline;
  const statusLabel = (v) => meta.statuses.find((s) => s.value === v)?.label || v;

  return (
    <>
      <PageHeader title={`Namaste, ${user.name.split(' ')[0]}`} subtitle={`${fmtDate(todayISO())} - here is how ${meta.academy.name || 'the academy'} is doing`}>
        <Select value={days} onChange={(e) => setDays(e.target.value)} options={RANGES} aria-label="Date range" />
      </PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !d && <Spinner />}
      {d && (
        <>
          <div className="hero">
            <div className="hero-card">
              <h2>Today's follow-ups</h2>
              <div className="big">{f.due_total}</div>
              <div className="legend">
                <span><b>{f.today}</b> due today</span>
                <span><b>{f.overdue}</b> missed (carried forward)</span>
                <span><b>{f.auto}</b> auto-added after {meta.academy.stale_days}+ days</span>
              </div>
              <div style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
                <Button variant="gold" icon={ArrowRight} onClick={() => nav('/followups')}>{f.due_total ? 'Start follow-ups' : 'View follow-ups'}</Button>
              </div>
            </div>
            <Card title="Fees to collect" action={<Link to="/fees" className="small">View all</Link>}>
              <div className="row between">
                <div><div className="muted small">Overdue instalments</div><div className="kpi"><div className="value" style={{ color: k.fees_overdue_count ? 'var(--red)' : undefined }}>{inr(k.fees_overdue)}</div></div></div>
                <div className="right"><div className="muted small">Total pending</div><b style={{ fontSize: 20 }}>{inr(k.fees_pending)}</b><div className="cell-sub">{k.fees_pending_count} student{k.fees_pending_count === 1 ? '' : 's'}</div></div>
              </div>
              {k.fees_overdue_count > 0 && <div className="notice bad" style={{ marginTop: 8 }}><Wallet size={16} />{k.fees_overdue_count} student{k.fees_overdue_count === 1 ? ' has' : 's have'} missed the instalment due date.</div>}
            </Card>
          </div>

          <div className="kpis">
            <Kpi icon={UserPlus} label="Enquiries today" value={k.enquiries_today} sub={`${k.admissions_today} admission${k.admissions_today === 1 ? '' : 's'} today`} />
            <Kpi icon={TrendingUp} label={`Enquiries (${d.range.days}d)`} value={k.enquiries_period} sub={`${k.admissions_period} admitted in this period`} />
            <Kpi icon={Percent} label="Enquiry to admission" value={`${k.conversion}%`} sub="of enquiries received in this period" />
            <Kpi icon={Flame} label="Hot leads open" value={k.hot_leads} sub="marked hot, not yet admitted" />
            <Kpi icon={IndianRupee} label="Collected this month" value={inrCompact(k.revenue_month)} sub={`Today ${inr(k.revenue_today)}`} />
            <Kpi icon={IndianRupee} label={`Collected (${d.range.days}d)`} value={inrCompact(k.revenue_period)} />
          </div>

          <div className="two-col">
            <Card title="Enquiries & admissions per day" action={<Button size="sm" variant="ghost" onClick={() => setShowTable((s) => !s)}>{showTable ? 'Show chart' : 'Show table'}</Button>}>
              <div className="legend-row" style={{ marginBottom: 8 }}>
                <span><i className="swatch" style={{ background: 'var(--series-1)' }} />Enquiries</span>
                <span><i className="swatch" style={{ background: 'var(--series-2)', borderRadius: 99 }} />Admissions (dots)</span>
              </div>
              {showTable ? (
                <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  <table className="table"><thead><tr><th>Date</th><th className="num">Enquiries</th><th className="num">Admissions</th><th className="num">Collected</th></tr></thead>
                    <tbody>{[...d.trend].reverse().map((t) => <tr key={t.date}><td>{fmtDate(t.date)}</td><td className="num">{t.enquiries}</td><td className="num">{t.admissions}</td><td className="num">{inr(t.revenue)}</td></tr>)}</tbody></table>
                </div>
              ) : <ComboChart data={d.trend} />}
            </Card>
            <Card title="Enquiry pipeline" action={<Link to="/enquiries" className="small">All enquiries</Link>}>
              <div className="pipeline">
                {Object.keys(pipe).map((s) => (
                  <Link key={s} to={`/enquiries?status=${s}`} className="pipe" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <b>{pipe[s]}</b><span>{statusLabel(s)}</span>
                  </Link>
                ))}
              </div>
              <p className="muted small" style={{ margin: '12px 0 0' }}>
                Every open enquiry always has a next follow-up date. If one is missed it appears in today's list automatically, and an enquiry nobody touched for {meta.academy.stale_days} days comes back on its own.
              </p>
            </Card>
          </div>

          <Card title="Marketing performance - which source brings admissions?" className="" pad={false}>
            {d.by_source.length === 0 ? <Empty title="No enquiries in this period" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Source</th><th style={{ minWidth: 180 }}>Enquiries</th><th className="num">Admissions</th><th className="num">Conversion</th><th className="num">Fees collected</th></tr></thead>
                  <tbody>
                    {d.by_source.map((s) => (
                      <tr key={s.source}>
                        <td className="cell-title">{s.label}</td>
                        <td><div className="inline-bar"><div className="track"><div className="fill" style={{ width: `${(s.enquiries / Math.max(...d.by_source.map((x) => x.enquiries))) * 100}%` }} /></div><b className="mono small">{s.enquiries}</b></div></td>
                        <td className="num">{s.admissions}</td>
                        <td className="num"><Badge tone={s.conversion >= 15 ? 'green' : s.conversion > 0 ? 'amber' : 'neutral'}>{s.conversion}%</Badge></td>
                        <td className="num">{inr(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="two-col" style={{ marginTop: 14 }}>
            <Card title="Top campaigns (from the Campaign field)" pad={false}>
              {d.by_campaign.length === 0 ? <Empty title="No campaign names yet">Type your Meta campaign / ad-set name in the "Campaign" box while saving an enquiry to see which ad brings admissions.</Empty> : (
                <div className="table-wrap"><table className="table"><thead><tr><th>Campaign</th><th className="num">Enquiries</th><th className="num">Admitted</th><th className="num">Conv.</th></tr></thead>
                  <tbody>{d.by_campaign.map((c) => <tr key={c.campaign}><td className="cell-title">{c.campaign}</td><td className="num">{c.enquiries}</td><td className="num">{c.admissions}</td><td className="num">{c.conversion}%</td></tr>)}</tbody></table></div>
              )}
            </Card>
            <Card title="Recent admissions" action={<Link to="/admissions" className="small">View all</Link>} pad={false}>
              {d.recent_admissions.length === 0 ? <Empty title="No admissions yet" /> : (
                <div className="table-wrap"><table className="table"><tbody>
                  {d.recent_admissions.map((a) => (
                    <tr key={a.id}><td><Link to={`/admissions/${a.id}`} className="cell-title">{a.student_name}</Link><div className="cell-sub">{a.course_name} - {fmtDate(a.admission_date)}</div></td>
                      <td className="num">{inr(a.paid_amount)}<div className="cell-sub">{a.balance > 0 ? `${inr(a.balance)} due` : 'Fully paid'}</div></td></tr>
                  ))}</tbody></table></div>
              )}
            </Card>
          </div>

          {d.by_course.length > 0 && (
            <Card title="Admissions by course" className="" >
              <HBars rows={d.by_course} labelKey="course" valueKey="admissions" />
            </Card>
          )}

          {d.team.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <Card title={`Team activity (last ${d.range.days} days)`} pad={false}>
                <div className="table-wrap"><table className="table"><thead><tr><th>Counsellor</th><th className="num">Follow-ups logged</th><th className="num">Admissions</th><th className="num">Open leads assigned</th></tr></thead>
                  <tbody>{d.team.map((t) => <tr key={t.id}><td className="cell-title">{t.name}</td><td className="num">{t.followups}</td><td className="num">{t.admissions}</td><td className="num">{t.open_leads}</td></tr>)}</tbody></table></div>
              </Card>
            </div>
          )}
        </>
      )}
    </>
  );
}
