import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, MessageCircle, Printer } from 'lucide-react';
import { get } from '../api';
import { useAsync } from '../hooks';
import { useAuth } from '../auth';
import { Button, ErrorBox, Spinner } from '../components/ui';
import { amountInWords, fmtDate, inr, waLink } from '../utils';

function ReceiptCopy({ r, meta, label, showLabel }) {
  const a = r.academy;
  const mode = meta.payment_modes.find((m) => m.value === r.payment_mode)?.label || r.payment_mode;
  const paidTillNow = r.net_fee - r.balance_after;
  return (
    <div className="copy">
      {r.status === 'void' && <div className="watermark">VOID</div>}
      <div className="rc-head">
        <img src="./logo.png" alt="" />
        <div>
          <div className="name">{a.name}</div>
          {a.tagline && <div className="tag">{a.tagline}</div>}
          <div className="addr">{[a.address, a.phone && `Ph: ${a.phone}`, a.email, a.website].filter(Boolean).join('  |  ')}{a.gstin ? `  |  GSTIN: ${a.gstin}` : ''}</div>
        </div>
        {showLabel && <div className="copy-label">{label}</div>}
      </div>
      <div className="rc-title">
        <h2>FEE RECEIPT</h2>
        <div className="meta">Receipt No: <b>{r.receipt_no}</b><br />Date: <b>{fmtDate(r.payment_date)}</b></div>
      </div>
      <div className="rc-grid">
        <div><span>Received with thanks from</span><b>{r.student_name}</b></div>
        <div><span>Admission No.</span><b>{r.admission_no}</b></div>
        <div><span>Parent / Guardian</span><b>{r.parent_name || '-'}</b></div>
        <div><span>Mobile</span><b>{r.phone}</b></div>
        <div><span>Course</span><b>{r.course_name}</b></div>
        <div><span>Batch / Timing</span><b>{r.batch_timing || '-'}</b></div>
      </div>
      <table className="rc-table">
        <thead><tr><th>Particulars</th><th>Mode</th><th>Reference</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
        <tbody><tr><td>{r.towards}</td><td>{mode}</td><td>{r.reference_no || '-'}</td><td className="amt">{inr(r.amount)}</td></tr></tbody>
      </table>
      <div className="rc-words"><b>Amount in words:</b> {amountInWords(r.amount)}</div>
      <div className="rc-bottom">
        <div className="rc-terms"><b>Terms &amp; conditions</b>{'\n'}{a.terms}</div>
        <div className="rc-fee">
          <div><span>Total course fee</span><span>{inr(r.total_fee)}</span></div>
          {r.discount > 0 && <div><span>Discount</span><span>- {inr(r.discount)}</span></div>}
          <div><span>Net fee</span><span>{inr(r.net_fee)}</span></div>
          <div className="paid"><span>Paid till this receipt</span><span>{inr(paidTillNow)}</span></div>
          <div><span>Balance due</span><span>{inr(r.balance_after)}</span></div>
        </div>
      </div>
      {r.balance_after > 0 && r.next_due_date && <div className="rc-foot" style={{ textAlign: 'left', color: '#14202e', fontSize: '8.5pt' }}>Next instalment due on: <b>{fmtDate(r.next_due_date)}</b></div>}
      <div className="rc-sign"><div>Received by: {r.received_by_name || ''}</div><div>Authorised signatory</div></div>
      <div className="rc-foot">This is a computer-generated receipt{r.status === 'void' ? ` - VOID (${r.void_reason})` : ''}.</div>
    </div>
  );
}

export default function ReceiptView() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const { meta } = useAuth();
  const [copies, setCopies] = useState(2);
  const { data, error, loading, reload } = useAsync(() => get(`/receipts/${id}`), [id]);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const r = data.data;
  const wa = `Namaste ${r.parent_name || r.student_name} ji, ${r.academy.name} ki taraf se fee receipt:\nReceipt No: ${r.receipt_no}\nStudent: ${r.student_name}\nCourse: ${r.course_name}\nAmount received: ${inr(r.amount)} (${fmtDate(r.payment_date)})\nBalance: ${inr(r.balance_after)}${r.balance_after > 0 && r.next_due_date ? `\nNext due date: ${fmtDate(r.next_due_date)}` : ''}\nDhanyavaad!`;

  return (
    <>
      <div className="no-print">
        {sp.get('new') && <div className="notice ok" style={{ marginBottom: 12 }}>Saved successfully. Receipt <b>{r.receipt_no}</b> has been created - print it or share it on WhatsApp.</div>}
        <div className="receipt-tools">
          <Link to={`/admissions/${r.admission_id}`} className="btn btn-secondary"><ArrowLeft size={16} />Student account</Link>
          <Button variant="primary" icon={Printer} onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button icon={Copy} onClick={() => setCopies(copies === 2 ? 1 : 2)}>{copies === 2 ? 'Single copy' : 'Student + Office copy'}</Button>
          <a className="btn btn-wa" href={waLink(r.phone, wa)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} />Send on WhatsApp</a>
          <span className="muted small">Tip: in the print window choose "Save as PDF" and turn off "Headers and footers".</span>
        </div>
      </div>
      <div className="receipt-stage">
        <div className={`sheet ${copies === 2 ? 'two' : 'single'}`}>
          <ReceiptCopy r={r} meta={meta} label="Student copy" showLabel={copies === 2} />
          {copies === 2 && <><hr className="cutline" /><ReceiptCopy r={r} meta={meta} label="Office copy" showLabel /></>}
        </div>
      </div>
    </>
  );
}
