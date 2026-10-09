import { useEffect, useRef, useState } from 'react';
import { post, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from './Toast';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';
import { addDays, fmtDate, todayISO, uuid } from '../utils';

const QUICK = [['Tomorrow', 1], ['In 2 days', 2], ['In 3 days', 3], ['In 1 week', 7], ['In 2 weeks', 14], ['In 1 month', 30]];
const DEFAULT_DAYS = { interested: 3, demo_scheduled: 2, callback_requested: 2, thinking: 3, not_picked: 1, busy: 1, rescheduled: 1 };

export default function FollowUpModal({ enquiry, open, onClose, onDone }) {
  const { meta } = useAuth();
  const toast = useToast();
  const today = todayISO();
  const idem = useRef(uuid());
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open) {
      idem.current = uuid();
      setF({ type: 'call', outcome: 'interested', note: '', next_follow_up_date: addDays(today, 3), next_follow_up_time: '', interest_level: enquiry?.interest_level || 'warm', lost_reason: '' });
      setErrors({});
      setFormError('');
    }
  }, [open, enquiry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enquiry) return null;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const outcome = meta.outcomes.find((o) => o.value === f.outcome);
  const terminal = !!outcome?.terminal;

  const pickOutcome = (v) => {
    setF((p) => ({ ...p, outcome: v, next_follow_up_date: DEFAULT_DAYS[v] ? addDays(today, DEFAULT_DAYS[v]) : p.next_follow_up_date }));
  };

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      const body = { ...f, version: enquiry.version, idempotency_key: idem.current };
      if (terminal) { delete body.next_follow_up_date; delete body.next_follow_up_time; }
      const r = await post(`/enquiries/${enquiry.id}/followups`, body);
      toast(terminal ? 'Enquiry closed as lost. Record is kept.' : `Follow-up saved. Next: ${fmtDate(r.data.next_follow_up_date)}`);
      window.dispatchEvent(new Event('bea:refresh'));
      onDone?.(r);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        setFormError(Object.keys(e.fields).length ? '' : e.message);
        if (e.code === 'version_conflict') setFormError(`${e.message}`);
      } else setFormError(e.message);
    }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} locked={busy} title={`Log follow-up - ${enquiry.student_name}`}
      footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save follow-up</Button></>}>
      <div className="stack">
        {formError && <div className="error-box" role="alert"><div>{formError}</div></div>}
        <div className="form-grid">
          <Field label="How did you contact?" error={errors.type}>
            <Select value={f.type || ''} onChange={(e) => set('type', e.target.value)} options={meta.followup_types} />
          </Field>
          <Field label="What happened?" error={errors.outcome} required>
            <Select value={f.outcome || ''} onChange={(e) => pickOutcome(e.target.value)} options={meta.outcomes} />
          </Field>
          {terminal && f.outcome !== 'wrong_number' && (
            <Field label="Why not joining?" error={errors.lost_reason} required className="full">
              <Select value={f.lost_reason || ''} onChange={(e) => set('lost_reason', e.target.value)} options={meta.lost_reasons} placeholder="Select reason..." />
            </Field>
          )}
          <Field label="Notes (what did the student/parent say?)" error={errors.note} className="full">
            <Textarea value={f.note || ''} onChange={(e) => set('note', e.target.value)} maxLength={2000} placeholder="e.g. Wants evening batch, will visit Saturday with father" />
          </Field>
          {!terminal && (
            <>
              <div className="full">
                <span className="field-label">Next follow-up *</span>
                <div className="chips" style={{ margin: '6px 0' }}>
                  {QUICK.map(([label, n]) => (
                    <button type="button" key={n} className={`chip ${f.next_follow_up_date === addDays(today, n) ? 'on' : ''}`} onClick={() => set('next_follow_up_date', addDays(today, n))}>{label}</button>
                  ))}
                </div>
              </div>
              <Field label="Date" error={errors.next_follow_up_date} required>
                <Input type="date" min={today} value={f.next_follow_up_date || ''} onChange={(e) => set('next_follow_up_date', e.target.value)} />
              </Field>
              <Field label="Time (optional)" error={errors.next_follow_up_time}>
                <Input type="time" value={f.next_follow_up_time || ''} onChange={(e) => set('next_follow_up_time', e.target.value)} />
              </Field>
              <Field label="Interest level" error={errors.interest_level}>
                <Select value={f.interest_level || ''} onChange={(e) => set('interest_level', e.target.value)} options={meta.interest} />
              </Field>
            </>
          )}
        </div>
        {terminal && <div className="notice info">The enquiry will be marked <b>Lost</b> and removed from follow-ups. Nothing is deleted - you can re-open it any time.</div>}
      </div>
    </Modal>
  );
}
