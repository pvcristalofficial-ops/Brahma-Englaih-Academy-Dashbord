import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, FileText, IndianRupee, Pencil, Scale } from 'lucide-react';
import { get, post, put, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Confirm, ErrorBox, Field, Input, Modal, PageHeader, Progress, Spinner, Textarea, LinkButton } from '../components/ui';
import PaymentModal from '../components/PaymentModal';
import { CallButtons } from '../components/LeadActions';
import { feeBadge } from './Admissions';
import { fmtDate, fmtDateTime, inr, todayISO } from '../utils';

export default function AdmissionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { meta, isAdmin } = useAuth();
  const { data, error, loading, reload } = useAsync(() => get(`/admissions/${id}`), [id]);
  const [pay, setPay] = useState(false);
  const [edit, setEdit] = useState(false);
  const [fix, setFix] = useState(false);
  const [voidFor, setVoidFor] = useState(null);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const { admission: a, receipts, enquiry } = data.data;

  const run = async (fn, ok, done) => {
    setBusy(true); setErrors({}); setMsg('');
    try { await fn(); toast(ok); window.dispatchEvent(new Event('bea:refresh')); done(); reload(); } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); setMsg(Object.keys(e.fields).length ? '' : e.message); } else setMsg(e.message); }
    setBusy(false);
  };
  const openEdit = () => { setForm({ parent_name: a.parent_name || '', email: a.email || '', address: a.address || '', batch_timing: a.batch_timing || '', start_date: a.start_date || '', next_due_date: a.next_due_date || '', notes: a.notes || '' }); setErrors({}); setMsg(''); setEdit(true); };
  const openFix = () => { setForm({ total_fee: String(a.total_fee), discount: String(a.discount || ''), reason: '' }); setErrors({}); setMsg(''); setFix(true); };
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const reminder = `Namaste ${a.parent_name || a.student_name} ji, ${meta.academy.name} se reminder: ${a.student_name} ki ${a.course_name} ki fees ${inr(a.balance)} baaki hai${a.next_due_date ? ` (due date ${fmtDate(a.next_due_date)})` : ''}. Kripya jald jama karein. Dhanyavaad!`;

  return (
    <>
      <div style={{ marginBottom: 10 }}><Link to="/admissions" className="row small"><ArrowLeft size={14} />All admitted students</Link></div>
      <PageHeader title={a.student_name} subtitle={`${a.admission_no} - joined ${fmtDate(a.admission_date)} - ${a.course_name}`}>{feeBadge(a)}</PageHeader>
      <div className="row" style={{ marginBottom: 14 }}>
        <CallButtons phone={a.phone} name={a.student_name} size="md" text={a.balance > 0 ? reminder : `Namaste ${a.parent_name || a.student_name} ji, ${meta.academy.name} mein ${a.student_name} ka swagat hai!`} />
        {a.balance > 0 && <Button variant="gold" icon={IndianRupee} onClick={() => setPay(true)}>Collect fees</Button>}
        <Button icon={Pencil} onClick={openEdit}>Edit details</Button>
        {isAdmin && <Button variant="ghost" icon={Scale} onClick={openFix}>Correct fee</Button>}
        {enquiry && <LinkButton as={Link} to={`/enquiries/${enquiry.id}`} variant="ghost" icon={FileText}>Enquiry history</LinkButton>}
      </div>

      <div className="two-col">
        <Card title="Fee account">
          <div className="summary-box" style={{ marginBottom: 12 }}>
            <div className="line"><span>Total fee</span><b>{inr(a.total_fee)}</b></div>
            {a.discount > 0 && <div className="line"><span>Discount</span><b>- {inr(a.discount)}</b></div>}
            <div className="line"><span>Net fee</span><b>{inr(a.net_fee)}</b></div>
            <div className="line"><span>Paid</span><b style={{ color: 'var(--green)' }}>{inr(a.paid_amount)}</b></div>
            <div className="line total"><span>Balance</span><span style={{ color: a.balance > 0 ? 'var(--red)' : 'var(--green)' }}>{inr(a.balance)}</span></div>
          </div>
          <Progress value={a.paid_amount} max={a.net_fee} tone={a.fee_state === 'clear' ? 'green' : 'blue'} />
          {a.balance > 0 && <p className="small" style={{ marginBottom: 0 }}>Next instalment due: <b>{fmtDate(a.next_due_date)}</b></p>}
        </Card>
        <Card title="Student">
          <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="kv"><span>Mobile</span><b className="mono">{a.phone}</b></div>
            <div className="kv"><span>Parent</span><b>{a.parent_name || '-'}</b></div>
            <div className="kv"><span>Batch / timing</span><b>{a.batch_timing || '-'}</b></div>
            <div className="kv"><span>Course start</span><b>{fmtDate(a.start_date)}</b></div>
            <div className="kv"><span>Email</span><b>{a.email || '-'}</b></div>
            <div className="kv"><span>Address</span><b>{a.address || '-'}</b></div>
          </div>
          {a.notes && <p className="muted small" style={{ marginBottom: 0 }}>{a.notes}</p>}
        </Card>
      </div>

      <Card title={`Receipts (${receipts.length})`} pad={false}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Receipt no.</th><th>Date</th><th>Mode</th><th className="num">Amount</th><th className="num">Balance after</th><th>Received by</th><th /></tr></thead>
          <tbody>{receipts.map((r) => (
            <tr key={r.id} style={r.status === 'void' ? { opacity: .6 } : undefined}>
              <td className="cell-title">{r.receipt_no}{r.status === 'void' && <> <Badge tone="red">VOID</Badge></>}<div className="cell-sub">{r.towards}</div>{r.status === 'void' && <div className="cell-sub">Reason: {r.void_reason} ({fmtDateTime(r.voided_at)})</div>}</td>
              <td>{fmtDate(r.payment_date)}</td>
              <td>{meta.payment_modes.find((m) => m.value === r.payment_mode)?.label}{r.reference_no && <div className="cell-sub">{r.reference_no}</div>}</td>
              <td className="num"><b>{inr(r.amount)}</b></td>
              <td className="num">{inr(r.balance_after)}</td>
              <td>{r.received_by_name}</td>
              <td className="right nowrap">
                <LinkButton as={Link} to={`/receipts/${r.id}`} size="sm">View / Print</LinkButton>{' '}
                {isAdmin && r.status === 'valid' && <Button size="sm" variant="ghost" icon={Ban} onClick={() => { setReason(''); setMsg(''); setVoidFor(r); }}>Void</Button>}
              </td>
            </tr>))}</tbody>
        </table></div>
      </Card>

      <PaymentModal admission={a} open={pay} onClose={() => setPay(false)} onDone={(r) => { setPay(false); nav(`/receipts/${r.id}?new=1`); }} />

      <Modal open={edit} onClose={() => setEdit(false)} locked={busy} title="Edit student details"
        footer={<><Button onClick={() => setEdit(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => run(() => put(`/admissions/${a.id}`, { ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])), version: a.version }), 'Details updated.', () => setEdit(false))}>Save</Button></>}>
        <div className="stack">{msg && <div className="error-box"><div>{msg}</div></div>}
          <div className="form-grid">
            <Field label="Parent name" error={errors.parent_name}><Input value={form.parent_name || ''} onChange={(e) => setF('parent_name', e.target.value)} /></Field>
            <Field label="Email" error={errors.email}><Input type="email" value={form.email || ''} onChange={(e) => setF('email', e.target.value)} /></Field>
            <Field label="Batch / timing" error={errors.batch_timing}><Input value={form.batch_timing || ''} onChange={(e) => setF('batch_timing', e.target.value)} /></Field>
            <Field label="Course start date" error={errors.start_date}><Input type="date" value={form.start_date || ''} onChange={(e) => setF('start_date', e.target.value)} /></Field>
            {a.balance > 0 && <Field label="Next instalment due" error={errors.next_due_date}><Input type="date" value={form.next_due_date || ''} onChange={(e) => setF('next_due_date', e.target.value)} /></Field>}
            <Field label="Address" className="full" error={errors.address}><Input value={form.address || ''} onChange={(e) => setF('address', e.target.value)} /></Field>
            <Field label="Notes" className="full" error={errors.notes}><Textarea rows={2} value={form.notes || ''} onChange={(e) => setF('notes', e.target.value)} /></Field>
          </div></div>
      </Modal>

      <Modal open={fix} onClose={() => setFix(false)} locked={busy} size="sm" title="Correct course fee (admin)"
        footer={<><Button onClick={() => setFix(false)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => run(() => post(`/admissions/${a.id}/adjust-fee`, form), 'Fee corrected and logged.', () => setFix(false))}>Save correction</Button></>}>
        <div className="stack">{msg && <div className="error-box"><div>{msg}</div></div>}
          <div className="notice info">Already paid: <b>{inr(a.paid_amount)}</b>. Existing receipts are not changed. This correction is recorded in the activity log.</div>
          <Field label="Total fee (₹)" required error={errors.total_fee}><Input inputMode="decimal" value={form.total_fee || ''} onChange={(e) => setF('total_fee', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Discount (₹)" error={errors.discount}><Input inputMode="decimal" value={form.discount || ''} onChange={(e) => setF('discount', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Reason" required error={errors.reason}><Textarea rows={2} value={form.reason || ''} onChange={(e) => setF('reason', e.target.value)} /></Field>
        </div>
      </Modal>

      <Confirm open={!!voidFor} danger loading={busy} title={`Void receipt ${voidFor?.receipt_no || ''}?`} confirmLabel="Void receipt" onClose={() => setVoidFor(null)}
        onConfirm={() => { if (reason.trim().length < 5) { setMsg('Please write a reason (min 5 characters).'); return; } run(() => post(`/receipts/${voidFor.id}/void`, { reason }), 'Receipt voided. The record is kept.', () => setVoidFor(null)); }}>
        <p style={{ marginTop: 0 }}>The receipt stays on record marked <b>VOID</b>, and {inr(voidFor?.amount)} is added back to the student's balance.</p>
        <Field label="Reason" required><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        {msg && <div className="field-error" style={{ marginTop: 6 }}>{msg}</div>}
      </Confirm>
    </>
  );
}
