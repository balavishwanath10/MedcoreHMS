import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { HospitalAdminPage } from './pages/HospitalAdminPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { EncounterPage } from './pages/EncounterPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { LabPage } from './pages/LabPage';
import { PharmacyPage } from './pages/PharmacyPage';
import { BillingPage } from './pages/BillingPage';

export const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/hospitals" element={<HospitalAdminPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="/emr" element={<EncounterPage />} />
        <Route path="/encounters" element={<EncounterPage />} />
        <Route path="/prescriptions" element={<PrescriptionsPage />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/pharmacy" element={<PharmacyPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};
