import { useEffect, useMemo, useRef, useState } from 'react';
import { post, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from './Toast';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { addDays, inr, todayISO, uuid } from '../utils';

/** Confirm admission = create admission + collect first payment + generate receipt (all-or-nothing on the server). */
export default function AdmitModal({ enquiry, open, onClose, onDone }) {
  const { meta } = useAuth();
  const toast = useToast();
  const today = todayISO();
  const idem = useRef(uuid());
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open || !enquiry) return;
    idem.current = uuid();
    const course = meta.courses.find((c) => c.id === enquiry.course_id);
    setF({
      course_id: enquiry.course_id ? String(enquiry.course_id) : '', total_fee: course?.fee ? String(course.fee) : '', discount: '', amount: '',
      payment_mode: 'cash', reference_no: '', payment_date: today, next_due_date: addDays(today, 30),
      batch_timing: '', start_date: '', parent_name: enquiry.parent_name || '', address: enquiry.city || '', notes: '',
    });
    setErrors({});
    setFormError('');
  }, [open, enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const calc = useMemo(() => {
    const total = Number(f.total_fee) || 0;
    const disc = Number(f.discount) || 0;
    const net = Math.max(0, total - disc);
    const paid = Number(f.amount) || 0;
    return { total, disc, net, paid, balance: Math.round((net - paid) * 100) / 100 };
  }, [f.total_fee, f.discount, f.amount]);

  if (!enquiry) return null;

  const onCourse = (id) => {
    const c = meta.courses.find((x) => String(x.id) === id);
    setF((p) => ({ ...p, course_id: id, total_fee: c?.fee ? String(c.fee) : p.total_fee }));
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      const body = { ...f, idempotency_key: idem.current };
      if (calc.balance <= 0) body.next_due_date = '';
      const r = await post(`/enquiries/${enquiry.id}/admit`, body);
      toast(`Admission confirmed. Receipt ${r.data.receipt.receipt_no} created.`);
      window.dispatchEvent(new Event('bea:refresh'));
      onDone?.(r.data);
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please check the highlighted fields.' : e.message); } else setFormError(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} locked={busy} size="lg" title={`Confirm admission - ${enquiry.student_name}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Confirm admission & create receipt</Button></>}>
      <div className="stack">
        {formError && <div className="error-box" role="alert"><div>{formError}</div></div>}
        <div className="form-grid">
          <Field label="Course" required error={errors.course_id}>
            <Select value={f.course_id || ''} onChange={(e) => onCourse(e.target.value)} placeholder="Select course..." options={meta.courses.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="Batch / timing" error={errors.batch_timing}><Input value={f.batch_timing || ''} onChange={(e) => set('batch_timing', e.target.value)} placeholder="e.g. 6:00-7:00 PM" maxLength={80} /></Field>
          <Field label="Total course fee (₹)" required error={errors.total_fee}><Input inputMode="decimal" value={f.total_fee || ''} onChange={(e) => set('total_fee', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Discount (₹)" error={errors.discount}><Input inputMode="decimal" value={f.discount || ''} onChange={(e) => set('discount', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Parent / guardian name" error={errors.parent_name}><Input value={f.parent_name || ''} onChange={(e) => set('parent_name', e.target.value)} maxLength={100} /></Field>
          <Field label="Course start date" error={errors.start_date}><Input type="date" value={f.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="Address" className="full" error={errors.address}><Input value={f.address || ''} onChange={(e) => set('address', e.target.value)} maxLength={255} /></Field>
        </div>

        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="card-body stack">
            <strong>Payment received now</strong>
            <div className="form-grid">
              <Field label="Amount received (₹)" required error={errors.amount} hint={calc.net ? `Net fee ${inr(calc.net)}` : ''}>
                <Input inputMode="decimal" value={f.amount || ''} onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              <Field label="Payment mode" required error={errors.payment_mode}><Select value={f.payment_mode} onChange={(e) => set('payment_mode', e.target.value)} options={meta.payment_modes} /></Field>
              <Field label={f.payment_mode === 'cash' ? 'Reference (optional)' : 'UPI / Txn / Cheque no.'} required={f.payment_mode !== 'cash'} error={errors.reference_no}>
                <Input value={f.reference_no || ''} onChange={(e) => set('reference_no', e.target.value)} maxLength={80} />
              </Field>
              <Field label="Payment date" error={errors.payment_date}><Input type="date" max={today} value={f.payment_date || ''} onChange={(e) => set('payment_date', e.target.value)} /></Field>
              {calc.balance > 0 && (
                <Field label="Next instalment due on" required error={errors.next_due_date} hint="You will see this in Fees Due">
                  <Input type="date" min={today} value={f.next_due_date || ''} onChange={(e) => set('next_due_date', e.target.value)} />
                </Field>
              )}
            </div>
            <div className="summary-box">
              <div className="line"><span>Total fee</span><b>{inr(calc.total)}</b></div>
              {calc.disc > 0 && <div className="line"><span>Discount</span><b>- {inr(calc.disc)}</b></div>}
              <div className="line"><span>Net fee</span><b>{inr(calc.net)}</b></div>
              <div className="line"><span>Paid now</span><b>{inr(calc.paid)}</b></div>
              <div className="line total"><span>Balance after this payment</span><span style={{ color: calc.balance < 0 ? 'var(--red)' : undefined }}>{inr(calc.balance)}</span></div>
            </div>
          </div>
        </div>
        <Field label="Internal notes" error={errors.notes}><Textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} maxLength={500} rows={2} /></Field>
      </div>
    </Modal>
  );
}
