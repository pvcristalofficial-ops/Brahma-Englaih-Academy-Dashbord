import { useState } from 'react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { get, post, put, ApiError } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { fmtDateTime } from '../utils';

export default function Users() {
  const { meta, user: me, reloadMeta } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => get('/users'), []);
  const [mode, setMode] = useState(null); // 'add' | 'edit' | 'pw'
  const [target, setTarget] = useState(null);
  const [f, setF] = useState({});
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (m, u) => { setMode(m); setTarget(u || null); setF(u ? { name: u.name, phone: u.phone || '', role: u.role } : { role: 'counsellor' }); setErrors({}); setMsg(''); };
  const close = () => setMode(null);

  const save = async () => {
    setBusy(true); setErrors({}); setMsg('');
    try {
      if (mode === 'add') await post('/users', f);
      else if (mode === 'edit') await put(`/users/${target.id}`, { name: f.name, phone: f.phone || null, role: f.role });
      else await post(`/users/${target.id}/reset-password`, { password: f.password });
      toast(mode === 'pw' ? 'Password updated.' : 'User saved.');
      close(); await reload(); reloadMeta();
    } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); setMsg(Object.keys(e.fields).length ? '' : e.message); } else setMsg(e.message); }
    setBusy(false);
  };
  const toggle = async (u) => {
    try { await put(`/users/${u.id}`, { is_active: u.is_active ? 0 : 1 }); toast(u.is_active ? 'User deactivated (their records are kept).' : 'User re-activated.'); await reload(); reloadMeta(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHeader title="Team / users" subtitle="Give every counsellor their own login. Users are never deleted - only deactivated - so history stays intact."><Button variant="primary" icon={Plus} onClick={() => open('add')}>Add user</Button></PageHeader>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data && <Spinner />}
      {data && (
        <Card pad={false}><div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Last login</th><th>Status</th><th /></tr></thead>
          <tbody>{data.data.map((u) => (
            <tr key={u.id} style={u.is_active ? undefined : { opacity: .6 }}>
              <td><span className="cell-title">{u.name}</span>{u.id === me.id && <> <Badge tone="blue">You</Badge></>}<div className="cell-sub">{u.email}{u.phone ? ` - ${u.phone}` : ''}</div></td>
              <td>{meta.roles.find((r) => r.value === u.role)?.label}</td>
              <td>{u.last_login_at ? fmtDateTime(u.last_login_at) : 'Never'}</td>
              <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
              <td className="right nowrap"><Button size="sm" icon={Pencil} onClick={() => open('edit', u)}>Edit</Button>{' '}<Button size="sm" icon={KeyRound} onClick={() => open('pw', u)}>Password</Button>{' '}
                {u.id !== me.id && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>}</td>
            </tr>))}</tbody>
        </table></div></Card>
      )}
      <Modal open={!!mode} onClose={close} locked={busy} size="sm" title={mode === 'add' ? 'Add user' : mode === 'edit' ? `Edit ${target?.name}` : `New password for ${target?.name}`}
        footer={<><Button onClick={close} disabled={busy}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
        <div className="stack">{msg && <div className="error-box"><div>{msg}</div></div>}
          {mode !== 'pw' && <>
            <Field label="Full name" required error={errors.name}><Input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            {mode === 'add' && <Field label="Email (login)" required error={errors.email}><Input type="email" value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="off" /></Field>}
            <Field label="Mobile" error={errors.phone}><Input value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Role" required error={errors.role} hint="Admin can see everything. Counsellor works with enquiries, follow-ups, admissions and receipts."><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} options={meta.roles} /></Field>
          </>}
          {(mode === 'add' || mode === 'pw') && <Field label="Password" required error={errors.password} hint="At least 8 characters with letters and numbers"><Input type="text" value={f.password || ''} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Field>}
        </div>
      </Modal>
    </>
  );
}
