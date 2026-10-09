import { useAuth } from '../auth';
import { Field, Input, Select, Textarea } from './ui';
import { addDays, todayISO } from '../utils';

const QUICK = [['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['In 1 week', 7], ['In 2 weeks', 14]];

/** Shared by "New enquiry" and "Edit enquiry". */
export default function EnquiryFields({ f, set, errors, mode = 'create', phoneSlot, altSlot }) {
  const { meta } = useAuth();
  const today = todayISO();
  return (
    <div className="form-grid">
      <Field label="Student name" required error={errors.student_name}>
        <Input value={f.student_name || ''} onChange={(e) => set('student_name', e.target.value)} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="Parent / guardian name" error={errors.parent_name}>
        <Input value={f.parent_name || ''} onChange={(e) => set('parent_name', e.target.value)} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="Mobile number" required error={errors.phone} hint="10-digit number. Duplicates are blocked automatically.">
        <Input type="tel" inputMode="numeric" value={f.phone || ''} onChange={(e) => set('phone', e.target.value)} maxLength={16} placeholder="98765 43210" autoComplete="off" />
      </Field>
      <Field label="Alternate mobile" error={errors.alt_phone}>
        <Input type="tel" inputMode="numeric" value={f.alt_phone || ''} onChange={(e) => set('alt_phone', e.target.value)} maxLength={16} autoComplete="off" />
      </Field>
      {phoneSlot && <div className="full">{phoneSlot}</div>}
      {altSlot && <div className="full">{altSlot}</div>}
      <Field label="Email" error={errors.email}>
        <Input type="email" value={f.email || ''} onChange={(e) => set('email', e.target.value)} maxLength={150} autoComplete="off" />
      </Field>
      <Field label="City / area" error={errors.city}>
        <Input value={f.city || ''} onChange={(e) => set('city', e.target.value)} maxLength={80} />
      </Field>
      <Field label="Course interested in" error={errors.course_id}>
        <Select value={f.course_id || ''} onChange={(e) => set('course_id', e.target.value)} placeholder="Not decided yet" options={meta.courses.map((c) => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label="School / college / occupation" error={errors.qualification}>
        <Input value={f.qualification || ''} onChange={(e) => set('qualification', e.target.value)} maxLength={100} />
      </Field>
      <Field label="How did they find us? (Source)" required error={errors.source}>
        <Select value={f.source || ''} onChange={(e) => set('source', e.target.value)} placeholder="Select source..." options={meta.sources} />
      </Field>
      <Field label="Campaign / ad name" error={errors.campaign} hint="e.g. your Meta campaign or ad-set name">
        <Input value={f.campaign || ''} onChange={(e) => set('campaign', e.target.value)} maxLength={120} />
      </Field>
      <div>
        <span className="field-label">Interest level</span>
        <div className="chips" style={{ marginTop: 6 }}>
          {meta.interest.map((o) => <button type="button" key={o.value} className={`chip ${f.interest_level === o.value ? 'on' : ''}`} onClick={() => set('interest_level', o.value)}>{o.label}</button>)}
        </div>
      </div>
      <Field label="Assigned to" error={errors.assigned_to}>
        <Select value={f.assigned_to || ''} onChange={(e) => set('assigned_to', e.target.value)} placeholder="Unassigned" options={meta.users.map((u) => ({ value: u.id, label: u.name }))} />
      </Field>
      {mode === 'create' && (
        <>
          <div className="full">
            <span className="field-label">First follow-up on *</span>
            <div className="chips" style={{ margin: '6px 0' }}>
              {QUICK.map(([label, n]) => <button type="button" key={n} className={`chip ${f.next_follow_up_date === addDays(today, n) ? 'on' : ''}`} onClick={() => set('next_follow_up_date', addDays(today, n))}>{label}</button>)}
            </div>
          </div>
          <Field label="Follow-up date" required error={errors.next_follow_up_date}>
            <Input type="date" min={today} value={f.next_follow_up_date || ''} onChange={(e) => set('next_follow_up_date', e.target.value)} />
          </Field>
          <Field label="Follow-up time (optional)" error={errors.next_follow_up_time}>
            <Input type="time" value={f.next_follow_up_time || ''} onChange={(e) => set('next_follow_up_time', e.target.value)} />
          </Field>
          <Field label="Enquiry date" error={errors.enquiry_date}>
            <Input type="date" max={today} value={f.enquiry_date || ''} onChange={(e) => set('enquiry_date', e.target.value)} />
          </Field>
        </>
      )}
      <Field label="Notes" className="full" error={errors.notes}>
        <Textarea value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} maxLength={2000} placeholder="Budget, preferred timing, what they asked for..." />
      </Field>
    </div>
  );
}
