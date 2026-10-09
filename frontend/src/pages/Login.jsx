import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(email, password); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit}>
        <img className="logo" src="./logo.png" alt="Brahma English Academy" />
        <h1>Brahma English Academy</h1>
        <p>Enquiry, follow-up & fee dashboard</p>
        <div className="stack">
          {error && <div className="error-box" role="alert"><div>{error}</div></div>}
          <Field label="Email"><Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
          <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button variant="primary" type="submit" loading={busy} icon={LogIn}>Log in</Button>
        </div>
      </form>
    </div>
  );
}
