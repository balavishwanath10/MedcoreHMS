import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Shield, Server, Building2, Calendar, FileText, Home, Pill } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'System Overview', icon: Home },
    { to: '/admin/hospitals', label: 'Hospital Governance', icon: Building2 },
    { to: '/appointments', label: 'Appointments & Schedules', icon: Calendar },
    { to: '/emr', label: 'EMR & Clinical Records', icon: FileText },
    { to: '/prescriptions', label: 'Prescriptions & Rx', icon: Pill },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-3">
              <div className="p-2 bg-teal-600 text-white rounded-lg shadow-sm">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-slate-900">MedCore</span>
                <span className="text-xl font-semibold text-teal-600">HMS</span>
              </div>
            </Link>

            <nav className="hidden md:flex space-x-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`flex items-center px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-700 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 mr-1.5" />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 border border-teal-200">
              <Shield className="h-3 w-3 mr-1" /> Multi-Tenant System
            </span>
            <span className="inline-flex items-center text-xs text-slate-500">
              <Server className="h-3 w-3 mr-1" /> v0.1.0-alpha
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          MedCoreHMS &copy; {new Date().getFullYear()} — Enterprise Multi-Tenant Hospital Management
          Platform
        </div>
      </footer>
    </div>
  );
};
