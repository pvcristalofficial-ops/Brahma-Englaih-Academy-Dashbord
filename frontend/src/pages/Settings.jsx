import { useEffect, useState } from 'react';
import { Database, Save } from 'lucide-react';
import { get, put, ApiError, downloadUrl } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { useToast } from '../components/Toast';
import { Button, Card, ErrorBox, Field, Input, LinkButton, PageHeader, Spinner, Textarea } from '../components/ui';

export default function Settings() {
  const { reloadMeta } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => get('/settings'), []);
  const [f, setF] = useState(null);
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data.data); }, [data]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true); setErrors({}); setMsg('');
    try { await put('/settings', f); toast('Settings saved.'); await reload(); reloadMeta(); } catch (e) { if (e instanceof ApiError) { setErrors(e.fields); setMsg(Object.keys(e.fields).length ? 'Please check the highlighted fields.' : e.message); } else setMsg(e.message); }
    setBusy(false);
  };

  return (
    <>
      <PageHeader title="Settings & backup" subtitle="Academy details printed on every receipt, follow-up rules and data backup." />
      <ErrorBox error={error} onRetry={reload} />
      {loading && !f && <Spinner />}
      {f && (
        <div className="stack">
          <Card title="Academy details (shown on receipts)">
            <div className="stack">
              {msg && <div className="error-box"><div>{msg}</div></div>}
              <div className="form-grid">
                <Field label="Academy name" error={errors.academy_name}><Input value={f.academy_name} onChange={(e) => set('academy_name', e.target.value)} /></Field>
                <Field label="Tagline" error={errors.academy_tagline}><Input value={f.academy_tagline} onChange={(e) => set('academy_tagline', e.target.value)} /></Field>
                <Field label="Address" className="full" error={errors.academy_address}><Input value={f.academy_address} onChange={(e) => set('academy_address', e.target.value)} placeholder="Shop / building, area, city - PIN" /></Field>
                <Field label="Phone" error={errors.academy_phone}><Input value={f.academy_phone} onChange={(e) => set('academy_phone', e.target.value)} /></Field>
                <Field label="Email" error={errors.academy_email}><Input value={f.academy_email} onChange={(e) => set('academy_email', e.target.value)} /></Field>
                <Field label="Website" error={errors.academy_website}><Input value={f.academy_website} onChange={(e) => set('academy_website', e.target.value)} /></Field>
                <Field label="GSTIN (optional)" error={errors.academy_gstin}><Input value={f.academy_gstin} onChange={(e) => set('academy_gstin', e.target.value)} /></Field>
                <Field label="Receipt number prefix" error={errors.receipt_prefix} hint="Receipts look like BEA/2026-27/0001 (financial year Apr-Mar)"><Input value={f.receipt_prefix} onChange={(e) => set('receipt_prefix', e.target.value.toUpperCase())} maxLength={10} /></Field>
                <Field label="Re-surface untouched enquiries after (days)" error={errors.stale_days} hint="If an enquiry has no follow-up date and nobody contacts it for this many days it returns to Today's follow-ups"><Input inputMode="numeric" value={f.stale_days} onChange={(e) => set('stale_days', e.target.value.replace(/\D/g, ''))} maxLength={2} /></Field>
                <Field label="Receipt terms & conditions" className="full" error={errors.receipt_terms}><Textarea rows={4} value={f.receipt_terms} onChange={(e) => set('receipt_terms', e.target.value)} maxLength={1000} /></Field>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}><Button variant="primary" icon={Save} loading={busy} onClick={save}>Save settings</Button></div>
            </div>
          </Card>
          <Card title="Backup your data">
            <p style={{ marginTop: 0 }}>Download a complete copy of all enquiries, follow-ups, admissions, receipts and users. Keep it on your computer or Google Drive. We recommend downloading once a week - and also enabling the automatic daily backup (see README).</p>
            <LinkButton href={downloadUrl('/backup/download')} variant="primary" icon={Database}>Download full backup (.sql.gz)</LinkButton>
          </Card>
        </div>
      )}
    </>
  );
}
