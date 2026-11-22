import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { HospitalAdminPage } from './pages/HospitalAdminPage';
import { AppointmentsPage } from './pages/AppointmentsPage';

export const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/hospitals" element={<HospitalAdminPage />} />
        <Route path="/appointments" element={<AppointmentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
};
