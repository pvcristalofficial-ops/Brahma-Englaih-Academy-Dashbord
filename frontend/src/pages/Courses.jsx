import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { get, post, put, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Spinner } from '../components/ui';
import { inr } from '../utils';

export default function Courses() {
  const { reloadMeta } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => get('/courses'), []);
  const [edit, setEdit] = useState(null);
  const [f, setF] = useState({});
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (c) => { setEdit(c || {}); setF({ name: c?.name || '', fee: c ? String(c.fee) : '', duration: c?.duration || '' }); setErrors({}); setMsg(''); };

  const save = async (patch) => {
    setBusy(true); setErrors({}); setMsg('');
    try {
      const body = patch || { ...f, duration: f.duration || null };
      if (edit?.id) await put(`/courses/${edit.id}`, body); else await post('/courses', body);
      toast('Course saved.');
      setEdit(null); await reload(); reloadMeta();
    } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); setMsg(Object.keys(e.fields).length ? '' : e.message); } else setMsg(e.message); }
    setBusy(false);
  };
  const toggle = async (c) => {
    try { await put(`/courses/${c.id}`, { is_active: c.is_active ? 0 : 1 }); await reload(); reloadMeta(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Courses & fees" subtitle="Fees set here auto-fill at admission time (you can still change them per student)."><Button variant="primary" icon={Plus} onClick={() => open(null)}>Add course</Button></PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && (
        <Card pad={false}><div className="table-wrap"><table className="table">
          <thead><tr><th>Course</th><th>Duration</th><th className="num">Standard fee</th><th>Status</th><th /></tr></thead>
          <tbody>{data.data.map((c) => (
            <tr key={c.id} style={c.is_active ? undefined : { opacity: .6 }}>
              <td className="cell-title">{c.name}</td><td>{c.duration || '-'}</td>
              <td className="num">{c.fee > 0 ? inr(c.fee) : <Badge tone="amber">Set fee</Badge>}</td>
              <td>{c.is_active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</td>
              <td className="right nowrap"><Button size="sm" icon={Pencil} onClick={() => open(c)}>Edit</Button>{' '}<Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.is_active ? 'Hide' : 'Show'}</Button></td>
            </tr>))}</tbody>
        </table></div></Card>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} locked={busy} size="sm" title={edit?.id ? 'Edit course' : 'Add course'}
        footer={<><Button onClick={() => setEdit(null)} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={() => save()}>Save</Button></>}>
        <div className="stack">{msg && <div className="error-box"><div>{msg}</div></div>}
          <Field label="Course name" required error={errors.name}><Input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} /></Field>
          <Field label="Standard fee (₹)" required error={errors.fee}><Input inputMode="decimal" value={f.fee || ''} onChange={(e) => setF({ ...f, fee: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
          <Field label="Duration" error={errors.duration}><Input value={f.duration || ''} onChange={(e) => setF({ ...f, duration: e.target.value })} placeholder="e.g. 3 months" maxLength={60} /></Field>
        </div>
      </Modal>
    </>
  );
}
