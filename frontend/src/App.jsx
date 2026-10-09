import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import FollowUps from './pages/FollowUps';
import Enquiries from './pages/Enquiries';
import EnquiryForm from './pages/EnquiryForm';
import EnquiryDetail from './pages/EnquiryDetail';
import Admissions from './pages/Admissions';
import AdmissionDetail from './pages/AdmissionDetail';
import FeesDue from './pages/FeesDue';
import Receipts from './pages/Receipts';
import ReceiptView from './pages/ReceiptView';
import Courses from './pages/Courses';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';
import Account from './pages/Account';

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { user, meta, booting } = useAuth();
  if (booting) return <Spinner label="Starting..." />;
  if (!user) return <Login />;
  if (!meta) return <Spinner label="Loading..." />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="followups" element={<FollowUps />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="enquiries/new" element={<EnquiryForm />} />
        <Route path="enquiries/:id" element={<EnquiryDetail />} />
        <Route path="admissions" element={<Admissions />} />
        <Route path="admissions/:id" element={<AdmissionDetail />} />
        <Route path="fees" element={<FeesDue />} />
        <Route path="receipts" element={<Receipts />} />
        <Route path="receipts/:id" element={<ReceiptView />} />
        <Route path="account" element={<Account />} />
        <Route path="courses" element={<AdminOnly><Courses /></AdminOnly>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
        <Route path="audit" element={<AdminOnly><AuditLog /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
