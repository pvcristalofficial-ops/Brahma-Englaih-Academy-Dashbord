import { MessageCircle, Phone } from 'lucide-react';
import { telLink, waLink } from '../utils';
import { useAuth } from '../auth';

export function enquiryWhatsAppText(name, academy) {
  return `Namaste ${name} ji, ${academy} se message kar rahe hain. Aapne English course ke liye enquiry ki thi. Kya hum aapko course details, batch timing aur fees bhej sakte hain?`;
}

export function CallButtons({ phone, name, size = 'sm', text }) {
  const { meta } = useAuth();
  const msg = text ?? enquiryWhatsAppText(name, meta.academy.name || 'Brahma English Academy');
  const cls = `btn btn-${size}`;
  return (
    <>
      <a className={`${cls} btn-secondary`} href={telLink(phone)}><Phone size={14} />Call</a>
      <a className={`${cls} btn-wa`} href={waLink(phone, msg)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} />WhatsApp</a>
    </>
  );
}
