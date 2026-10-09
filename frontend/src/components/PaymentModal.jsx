import { useEffect, useRef, useState } from 'react';
import { post, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from './Toast';
import { Button, Field, Input, Modal, Select } from './ui';
import { addDays, inr, todayISO, uuid } from '../utils';

/** Collect an instalment: creates the payment + next receipt number in one safe server transaction. */
export default function PaymentModal({ admission, open, onClose, onDone }) {
  const { meta } = useAuth();
  const toast = useToast();
  const today = todayISO();
  const idem = useRef(uuid());
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open && admission) {
      idem.current = uuid();
      setF({ amount: String(admission.balance), payment_mode: 'cash', reference_no: '', payment_date: today, next_due_date: addDays(today, 30), towards: '' });
      setErrors({}); setFormError('');
    }
  }, [open, admission?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!admission) return null;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const amt = Number(f.amount) || 0;
  const after = Math.round((admission.balance - amt) * 100) / 100;

  const submit = async () => {
    setBusy(true); setErrors({}); setFormError('');
    try {
      const body = { ...f, idempotency_key: idem.current };
      if (after <= 0) body.next_due_date = '';
      const r = await post(`/admissions/${admission.id}/payments`, body);
      toast(`Payment saved. Receipt ${r.data.receipt_no} created.`);
      window.dispatchEvent(new Event('bea:refresh'));
      onDone?.(r.data);
    } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please check the highlighted fields.' : e.message); } else setFormError(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} locked={busy} title={`Collect fees - ${admission.student_name}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save payment & create receipt</Button></>}>
      <div className="stack">
        {formError && <div className="error-box" role="alert"><div>{formError}</div></div>}
        <div className="summary-box">
          <div className="line"><span>Net fee</span><b>{inr(admission.net_fee)}</b></div>
          <div className="line"><span>Paid so far</span><b>{inr(admission.paid_amount)}</b></div>
          <div className="line total"><span>Balance</span><span>{inr(admission.balance)}</span></div>
        </div>
        <div className="form-grid">
          <Field label="Amount received (₹)" required error={errors.amount} hint={`Maximum ${inr(admission.balance)}`}>
            <Input inputMode="decimal" value={f.amount || ''} onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))} />
          </Field>
          <Field label="Payment mode" required error={errors.payment_mode}><Select value={f.payment_mode || 'cash'} onChange={(e) => set('payment_mode', e.target.value)} options={meta.payment_modes} /></Field>
          <Field label={f.payment_mode === 'cash' ? 'Reference (optional)' : 'UPI / Txn / Cheque no.'} required={f.payment_mode !== 'cash'} error={errors.reference_no}>
            <Input value={f.reference_no || ''} onChange={(e) => set('reference_no', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Payment date" error={errors.payment_date}><Input type="date" max={today} value={f.payment_date || ''} onChange={(e) => set('payment_date', e.target.value)} /></Field>
          <Field label="Towards (shown on receipt)" className="full" error={errors.towards}><Input value={f.towards || ''} onChange={(e) => set('towards', e.target.value)} maxLength={160} placeholder={`Course Fee - ${admission.course_name}`} /></Field>
          {after > 0 && <Field label="Next instalment due on" required error={errors.next_due_date}><Input type="date" min={today} value={f.next_due_date || ''} onChange={(e) => set('next_due_date', e.target.value)} /></Field>}
        </div>
        <div className="notice info">Balance after this payment: <b>{inr(Math.max(0, after))}</b>{after < 0 && <span style={{ color: 'var(--red)' }}> - amount is more than the balance</span>}</div>
      </div>
    </Modal>
  );
}
