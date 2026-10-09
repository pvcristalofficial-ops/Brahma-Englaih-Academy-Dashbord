import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, BellRing, BookOpen, FileText, GraduationCap, History, KeyRound, LogOut, Menu, Moon, Plus, Receipt, Search, Settings, Sun, Users, UserCog, Wallet } from 'lucide-react';
import { useAuth } from '../auth';
import { get } from '../api';
import { initials } from '../utils';
import { Button } from './ui';

export default function Layout() {
  const { user, meta, logout, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({ due: 0, fees: 0 });
  const [q, setQ] = useState('');
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || '');
  const loc = useLocation();
  const nav = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([get('/followups?per_page=5'), get('/fees/due?limit=0')]);
      setBadges({ due: f.counts.due_total, fees: d.counts.overdue });
    } catch { /* badge is optional */ }
  }, []);

  useEffect(() => { refresh(); setOpen(false); }, [loc.pathname, refresh]);
  useEffect(() => {
    window.addEventListener('bea:refresh', refresh);
    const t = setInterval(refresh, 120000);
    return () => { window.removeEventListener('bea:refresh', refresh); clearInterval(t); };
  }, [refresh]);

  const toggleTheme = () => {
    const dark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem('bea.theme', next); } catch { /* ignore */ }
  };
  const isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const link = (to, Icon, label, count, danger) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon size={18} />{label}
      {count > 0 && <span className={`count ${danger ? 'danger' : ''}`}>{count}</span>}
    </NavLink>
  );

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="./logo.png" alt="" />
          <div><b>{meta.academy.name || 'Brahma English Academy'}</b><span>Admin Dashboard</span></div>
        </div>
        <nav className="nav" aria-label="Main">
          {link('/', BarChart3, 'Dashboard')}
          {link('/followups', BellRing, "Today's Follow-ups", badges.due, true)}
          {link('/enquiries', FileText, 'Enquiries')}
          <div className="nav-label">Students & Fees</div>
          {link('/admissions', GraduationCap, 'Admitted Students')}
          {link('/fees', Wallet, 'Fees Due', badges.fees, true)}
          {link('/receipts', Receipt, 'Receipts')}
          {isAdmin && <>
            <div className="nav-label">Admin</div>
            {link('/courses', BookOpen, 'Courses & Fees')}
            {link('/users', Users, 'Team / Users')}
            {link('/settings', Settings, 'Settings & Backup')}
            {link('/audit', History, 'Activity Log')}
          </>}
        </nav>
        <div className="side-foot">Signed in as<br /><b>{user.name}</b> ({user.role})</div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar no-print">
          <button className="icon-btn menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
          <form className="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { nav(`/enquiries?q=${encodeURIComponent(q.trim())}`); setQ(''); } }}>
            <Search size={16} />
            <input className="input" placeholder="Search name / mobile / ENQ no..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search enquiries" />
          </form>
          <div className="grow" />
          <Button variant="gold" icon={Plus} onClick={() => nav('/enquiries/new')}>New Enquiry</Button>
          <button className="icon-btn" aria-label="Toggle dark mode" onClick={toggleTheme}>{isDark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <div className="user-chip hide-sm">
            <span className="avatar">{initials(user.name)}</span>
          </div>
          <button className="icon-btn" aria-label="Change password" title="Change password" onClick={() => nav('/account')}><KeyRound size={18} /></button>
          <button className="icon-btn" aria-label="Log out" title="Log out" onClick={logout}><LogOut size={18} /></button>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  );
}
