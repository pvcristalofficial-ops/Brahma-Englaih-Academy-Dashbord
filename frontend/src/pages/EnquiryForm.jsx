import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Save, SaveAll, Undo2 } from 'lucide-react';
import { get, post, ApiError } from '../api';
import { useAuth } from '../auth';
import { useDebounced, useDraft } from '../hooks';
import { useToast } from '../components/Toast';
import { Button, Card, PageHeader } from '../components/ui';
import EnquiryFields from '../components/EnquiryFields';
import { addDays, cleanPhone, todayISO, uuid } from '../utils';

const blank = (me) => ({
  student_name: '', parent_name: '', phone: '', alt_phone: '', email: '', city: '', qualification: '', course_id: '', source: '', campaign: '',
  interest_level: 'warm', assigned_to: me ? String(me) : '', notes: '', enquiry_date: todayISO(), next_follow_up_date: addDays(todayISO(), 1), next_follow_up_time: '',
});

export default function EnquiryForm() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const draft = useDraft(`bea.draft.enquiry.${user.id}`);
  const idem = useRef(uuid());
  const [f, setF] = useState(() => ({ ...blank(user.id) }));
  const [restored, setRestored] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState(null);
  const [altDup, setAltDup] = useState(null);

  useEffect(() => {
    const d = draft.read();
    if (d?.values && (d.values.student_name || d.values.phone)) {
      setF({ ...blank(user.id), ...d.values, enquiry_date: todayISO() });
      if (d.key) idem.current = d.key;
      setRestored(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setF((p) => {
    const n = { ...p, [k]: v };
    draft.write({ values: n, key: idem.current });
    return n;
  });

  const phone = cleanPhone(f.phone);
  const alt = cleanPhone(f.alt_phone);
  const dPhone = useDebounced(phone, 300);
  const dAlt = useDebounced(alt, 300);
  useEffect(() => {
    let live = true;
    if (!dPhone) { setDup(null); return undefined; }
    get(`/enquiries/check-duplicate?phone=${dPhone}`).then((r) => live && setDup(r.data.exists ? r.data.existing : null)).catch(() => {});
    return () => { live = false; };
  }, [dPhone]);
  useEffect(() => {
    let live = true;
    if (!dAlt) { setAltDup(null); return undefined; }
    get(`/enquiries/check-duplicate?phone=${dAlt}`).then((r) => live && setAltDup(r.data.exists ? r.data.existing : null)).catch(() => {});
    return () => { live = false; };
  }, [dAlt]);

  const dupCard = (d, label) => d && (
    <div className="dup-card" role="alert">
      <b><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> {label} already exists as {d.enquiry_no} - {d.student_name}</b>
      <div className="small">Status: {d.status}{d.assigned_name ? ` - assigned to ${d.assigned_name}` : ''}. <Link to={`/enquiries/${d.id}`}>Open existing enquiry</Link> and log a follow-up instead of saving again.</div>
    </div>
  );

  const reset = () => {
    draft.clear();
    idem.current = uuid();
    setF(blank(user.id));
    setErrors({});
    setFormError('');
    setRestored(false);
    setDup(null);
    setAltDup(null);
  };

  const submit = async (another) => {
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      const body = { ...f, idempotency_key: idem.current };
      Object.keys(body).forEach((k) => { if (body[k] === '') body[k] = null; });
      const r = await post('/enquiries', body);
      toast(r.replayed ? 'This enquiry was already saved.' : `Enquiry saved (${r.data.enquiry_no}).`);
      window.dispatchEvent(new Event('bea:refresh'));
      if (another) { reset(); window.scrollTo({ top: 0 }); } else { draft.clear(); nav(`/enquiries/${r.data.id}`); }
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        if (e.code === 'duplicate') { setDup(e.existing); setFormError(e.message); } else setFormError(Object.keys(e.fields).length ? 'Please correct the highlighted fields.' : e.message);
      } else setFormError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="New enquiry" subtitle="Saved securely. Your typing is auto-saved on this device until the enquiry is stored on the server." />
      <Card>
        <div className="stack">
          {restored && (
            <div className="notice info"><span className="grow">Your unsaved draft was restored.</span>
              <Button size="sm" icon={Undo2} onClick={reset}>Discard draft</Button></div>
          )}
          {formError && <div className="error-box" role="alert"><div>{formError}</div></div>}
          <EnquiryFields f={f} set={set} errors={errors} phoneSlot={dupCard(dup, 'This mobile number')} altSlot={dupCard(altDup, 'Alternate number')} />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button onClick={() => nav(-1)} disabled={busy}>Cancel</Button>
            <Button icon={SaveAll} onClick={() => submit(true)} loading={busy} disabled={!!dup || !!altDup}>Save & add another</Button>
            <Button variant="primary" icon={Save} onClick={() => submit(false)} loading={busy} disabled={!!dup || !!altDup}>Save enquiry</Button>
          </div>
        </div>
      </Card>
    </>
  );
}
