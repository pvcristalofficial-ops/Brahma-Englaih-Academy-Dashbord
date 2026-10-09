import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, GraduationCap, Pencil, PhoneCall, RotateCcw, Undo2 } from 'lucide-react';
import { get, post, put, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Confirm, ErrorBox, Field, Input, InterestBadge, Modal, PageHeader, Spinner, StatusBadge, Textarea } from '../components/ui';
import { CallButtons } from '../components/LeadActions';
import EnquiryFields from '../components/EnquiryFields';
import FollowUpModal from '../components/FollowUpModal';
import AdmitModal from '../components/AdmitModal';
import { addDays, dueText, fmtDate, fmtDateTime, fmtTime, todayISO } from '../utils';

const dotTone = (o) => (o === 'admitted' ? 'green' : ['not_interested', 'wrong_number'].includes(o) ? 'red' : ['reenquiry', 'reopened', 'rescheduled'].includes(o) ? 'gray' : '');

function EditModal({ enquiry, open, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const form = f ?? Object.fromEntries(['student_name', 'parent_name', 'phone', 'alt_phone', 'email', 'city', 'qualification', 'campaign', 'notes', 'source', 'interest_level'].map((k) => [k, enquiry[k] || '']).concat([['course_id', enquiry.course_id ? String(enquiry.course_id) : ''], ['assigned_to', enquiry.assigned_to ? String(enquiry.assigned_to) : '']]));
  const set = (k, v) => setF({ ...form, [k]: v });
  const save = async () => {
    setBusy(true); setErrors({}); setFormError('');
    try {
      const body = { ...form, version: enquiry.version };
      Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
      const r = await put(`/enquiries/${enquiry.id}`, body);
      toast('Enquiry updated.');
      setF(null);
      onSaved(r.data);
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please correct the highlighted fields.' : e.message); } else setFormError(e.message);
    }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={() => { setF(null); onClose(); }} size="lg" locked={busy} title={`Edit enquiry - ${enquiry.enquiry_no}`}
      footer={<><Button onClick={() => { setF(null); onClose(); }} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save changes</Button></>}>
      <div className="stack">{formError && <div className="error-box" role="alert"><div>{formError}</div></div>}
        <EnquiryFields f={form} set={set} errors={errors} mode="edit" /></div>
    </Modal>
  );
}

export default function EnquiryDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { meta, isAdmin } = useAuth();
  const { data, error, loading, reload } = useAsync(() => get(`/enquiries/${id}`), [id]);
  const [log, setLog] = useState(false);
  const [admit, setAdmit] = useState(false);
  const [edit, setEdit] = useState(false);
  const [archive, setArchive] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState('');
  const [reopenDate, setReopenDate] = useState(addDays(todayISO(), 1));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { enquiry: e, timeline, admission } = data.data;
  const open = ['new', 'follow_up', 'demo_scheduled'].includes(e.status);
  const label = (list, v) => list.find((x) => x.value === v)?.label || v || '-';

  const act = async (fn, okMsg, close) => {
    setBusy(true); setActionError('');
    try { await fn(); toast(okMsg); window.dispatchEvent(new Event('bea:refresh')); close(); reload(); } catch (err) { setActionError(err.message); }
    setBusy(false);
  };

  return (
    <>
      <div className="no-print" style={{ marginBottom: 10 }}><Link to="/enquiries" className="row small"><ArrowLeft size={14} />All enquiries</Link></div>
      <PageHeader title={e.student_name} subtitle={`${e.enquiry_no} - enquired on ${fmtDate(e.enquiry_date)}${e.created_by ? '' : ' (via website form)'}`}>
        <StatusBadge status={e.status} meta={meta} />{open && <InterestBadge level={e.interest_level} />}
        {e.is_archived ? <Badge tone="neutral">Archived</Badge> : null}
      </PageHeader>

      <div className="row" style={{ marginBottom: 14 }}>
        <CallButtons phone={e.phone} name={e.student_name} size="md" />
        {open && !e.is_archived && <Button variant="primary" icon={PhoneCall} onClick={() => setLog(true)}>Log follow-up</Button>}
        {e.status !== 'admitted' && !e.is_archived && <Button variant="gold" icon={GraduationCap} onClick={() => setAdmit(true)}>Confirm admission</Button>}
        {!e.is_archived && <Button icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>}
        {e.status === 'lost' && !e.is_archived && <Button icon={RotateCcw} onClick={() => { setActionError(''); setReopen(true); }}>Re-open</Button>}
        {isAdmin && !e.is_archived && e.status !== 'admitted' && <Button variant="ghost" icon={Archive} onClick={() => { setReason(''); setActionError(''); setArchive(true); }}>Archive</Button>}
        {isAdmin && e.is_archived ? <Button icon={Undo2} onClick={() => act(() => post(`/enquiries/${e.id}/restore`), 'Enquiry restored.', () => {})}>Restore</Button> : null}
      </div>
      {actionError && <div className="error-box"><div>{actionError}</div></div>}

      {e.status === 'admitted' && admission && (
        <div className="notice ok" style={{ marginBottom: 14 }}><GraduationCap size={18} /><span>Admitted - admission no. <b>{admission.admission_no}</b>. <Link to={`/admissions/${admission.id}`}>Open student fee account &amp; receipts</Link></span></div>
      )}
      {e.status === 'lost' && <div className="notice bad" style={{ marginBottom: 14 }}>Marked lost: <b>{label(meta.lost_reasons, e.lost_reason)}</b>. The record is kept - use Re-open if the student comes back.</div>}

      <div className="two-col">
        <div className="stack">
          <Card title="Details">
            <div className="detail-grid">
              <div className="kv"><span>Mobile</span><b className="mono">{e.phone}</b></div>
              <div className="kv"><span>Alternate mobile</span><b className="mono">{e.alt_phone || '-'}</b></div>
              <div className="kv"><span>Email</span><b>{e.email || '-'}</b></div>
              <div className="kv"><span>Parent / guardian</span><b>{e.parent_name || '-'}</b></div>
              <div className="kv"><span>City / area</span><b>{e.city || '-'}</b></div>
              <div className="kv"><span>School / occupation</span><b>{e.qualification || '-'}</b></div>
              <div className="kv"><span>Course interested</span><b>{e.course_name || 'Not decided'}</b></div>
              <div className="kv"><span>Source</span><b>{label(meta.sources, e.source)}</b></div>
              <div className="kv"><span>Campaign / ad</span><b>{e.campaign || '-'}</b></div>
              <div className="kv"><span>Assigned to</span><b>{e.assigned_name || 'Unassigned'}</b></div>
              <div className="kv"><span>Follow-ups done</span><b>{e.follow_up_count}</b></div>
              <div className="kv"><span>Last contact</span><b>{e.last_contact_at ? fmtDateTime(e.last_contact_at) : 'Not yet'}</b></div>
            </div>
            {e.notes && <div className="note" style={{ marginTop: 14, background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 10 }}><span className="muted small">NOTES</span><br />{e.notes}</div>}
          </Card>
          <Card title={`Follow-up history (${timeline.length})`}>
            {timeline.length === 0 ? <p className="muted">No follow-up logged yet.</p> : (
              <ul className="timeline">
                {timeline.map((t) => (
                  <li key={t.id}>
                    <span className={`dot ${dotTone(t.outcome)}`} />
                    <div className="row" style={{ gap: 8 }}>
                      <b>{meta.outcomes.find((o) => o.value === t.outcome)?.label || (t.outcome === 'admitted' ? 'Admission confirmed' : t.outcome === 'reenquiry' ? 'Enquired again (website)' : t.outcome === 'reopened' ? 'Re-opened' : t.outcome)}</b>
                      {t.type !== 'other' && <Badge>{label(meta.followup_types, t.type)}</Badge>}
                    </div>
                    <div className="cell-sub">{fmtDateTime(t.followed_at)}{t.by_name ? ` - ${t.by_name}` : ''}{t.next_follow_up_date ? ` - next: ${fmtDate(t.next_follow_up_date)}` : ''}</div>
                    {t.note && <div style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{t.note}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Next follow-up">
          {open ? (
            <div className="stack">
              <div className="row">
                <Badge tone={e.due_state === 'overdue' ? 'red' : e.due_state === 'today' ? 'green' : 'blue'}>{dueText(e)}</Badge>
                {e.auto_added && <Badge tone="violet">Auto-added</Badge>}
              </div>
              <div className="kv"><span>Date</span><b>{e.next_follow_up_date ? `${fmtDate(e.next_follow_up_date)}${e.next_follow_up_time ? `, ${fmtTime(e.next_follow_up_time)}` : ''}` : `None set - resurfaces ${fmtDate(e.due_date)}`}</b></div>
              <Button variant="primary" icon={PhoneCall} onClick={() => setLog(true)}>Log follow-up now</Button>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>{e.status === 'admitted' ? 'Student is admitted. No further follow-up needed.' : 'No follow-up scheduled while the enquiry is closed.'}</p>}
        </Card>
      </div>

      <FollowUpModal enquiry={e} open={log} onClose={() => setLog(false)} onDone={() => { setLog(false); reload(); }} />
      <AdmitModal enquiry={e} open={admit} onClose={() => setAdmit(false)} onDone={(r) => nav(`/receipts/${r.receipt.id}?new=1`)} />
      {edit && <EditModal enquiry={e} open={edit} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      <Confirm open={archive} danger loading={busy} title="Archive this enquiry?" confirmLabel="Archive" onClose={() => setArchive(false)}
        onConfirm={() => { if (reason.trim().length < 5) { setActionError('Please write a reason (min 5 characters).'); return; } act(() => post(`/enquiries/${e.id}/archive`, { reason }), 'Enquiry archived. It can be restored any time.', () => setArchive(false)); }}>
        <p style={{ marginTop: 0 }}>It will be hidden from lists but <b>never deleted</b>, and its mobile number stays protected from duplicates.</p>
        <Field label="Reason" required><Textarea value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} /></Field>
        {actionError && <div className="field-error" style={{ marginTop: 6 }}>{actionError}</div>}
      </Confirm>
      <Confirm open={reopen} loading={busy} title="Re-open enquiry" confirmLabel="Re-open" onClose={() => setReopen(false)}
        onConfirm={() => act(() => post(`/enquiries/${e.id}/reopen`, { next_follow_up_date: reopenDate }), 'Enquiry re-opened.', () => setReopen(false))}>
        <Field label="Follow up again on" required><Input type="date" min={todayISO()} value={reopenDate} onChange={(ev) => setReopenDate(ev.target.value)} /></Field>
        {actionError && <div className="field-error" style={{ marginTop: 6 }}>{actionError}</div>}
      </Confirm>
    </>
  );
}
