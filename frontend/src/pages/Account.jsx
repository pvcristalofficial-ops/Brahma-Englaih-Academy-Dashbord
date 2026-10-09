import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { post, ApiError } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Button, Card, Field, Input, PageHeader } from '../components/ui';

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ current_password: '', new_password: '' });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setMsg('');
    try { await post('/auth/change-password', f); toast('Password changed.'); setF({ current_password: '', new_password: '' }); } catch (err) { if (err instanceof ApiError) { setErrors(err.fields); setMsg(Object.keys(err.fields).length ? '' : err.message); } else setMsg(err.message); }
    setBusy(false);
  };
  return (
    <>
      <PageHeader title="My account" subtitle={`${user.name} - ${user.email} - ${user.role}`} />
      <Card title="Change password">
        <form className="stack" style={{ maxWidth: 420 }} onSubmit={save}>
          {msg && <div className="error-box"><div>{msg}</div></div>}
          <Field label="Current password" error={errors.current_password}><Input type="password" autoComplete="current-password" value={f.current_password} onChange={(e) => setF({ ...f, current_password: e.target.value })} required /></Field>
          <Field label="New password" error={errors.new_password} hint="At least 8 characters with letters and numbers"><Input type="password" autoComplete="new-password" value={f.new_password} onChange={(e) => setF({ ...f, new_password: e.target.value })} required /></Field>
          <div><Button variant="primary" type="submit" icon={KeyRound} loading={busy}>Update password</Button></div>
        </form>
      </Card>
    </>
  );
}
