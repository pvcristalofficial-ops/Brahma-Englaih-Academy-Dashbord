// Small, dependency-free helpers shared by all pages.

const TZ = 'Asia/Kolkata';

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso, toIso) {
  return Math.round((new Date(`${toIso}T00:00:00Z`) - new Date(`${fromIso}T00:00:00Z`)) / 86400000);
}

export function fmtDate(iso, withYear = true) {
  if (!iso) return '-';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(d);
}

export function fmtDateTime(s) {
  if (!s) return '-';
  const d = new Date(String(s).replace(' ', 'T') + '+05:30');
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }).format(d);
}

export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
export function inr(n) {
  const v = Number(n || 0);
  return `₹${inrFmt.format(v)}`;
}
export function inrCompact(n) {
  const v = Number(n || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr(v);
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** "98765-43210", "+91 98765 43210" -> "9876543210" (or '' when not a valid Indian mobile) */
export function cleanPhone(raw) {
  let d = String(raw || '').replace(/\D+/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

export const telLink = (phone) => `tel:+91${cleanPhone(phone) || phone}`;
export function waLink(phone, text = '') {
  const p = cleanPhone(phone) || phone;
  return `https://wa.me/91${p}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
function words(n) {
  const parts = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (crore) parts.push(`${words(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(below100(rest));
  return parts.join(' ');
}
/** Indian numbering: 125000 -> "Rupees One Lakh Twenty Five Thousand Only" */
export function amountInWords(amount) {
  const paise = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let s = `Rupees ${rupees ? words(rupees) : 'Zero'}`;
  if (p) s += ` and ${below100(p)} Paise`;
  return `${s} Only`;
}

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function dueText(item) {
  if (!item.due_state) return '';
  if (item.due_state === 'today') return 'Due today';
  if (item.due_state === 'overdue') return item.days_overdue === 1 ? 'Overdue 1 day' : `Overdue ${item.days_overdue} days`;
  return `Due ${fmtDate(item.due_date, false)}`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
