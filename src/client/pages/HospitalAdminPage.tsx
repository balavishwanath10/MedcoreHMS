import React, { useState, useEffect } from 'react';
import {
  Building2,
  Layers,
  UserCheck,
  PlusCircle,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  fetchHospitals,
  createHospital,
  updateHospitalStatus,
  fetchDepartments,
  createDepartment,
  fetchDoctors,
  createDoctor,
} from '../services/api';
import { IHospital, IDepartment } from '@shared/types';

export const HospitalAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'onboarding' | 'departments' | 'doctors'>(
    'overview',
  );
  const [hospitals, setHospitals] = useState<IHospital[]>([]);
  const [departments, setDepartments] = useState<IDepartment[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Hospital Form State
  const [hospitalForm, setHospitalForm] = useState({
    name: '',
    code: '',
    email: '',
    phone: '',
    licenseNumber: '',
    taxId: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'USA',
    slotDuration: 30,
  });

  // Department Form State
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    description: '',
    hospitalId: '',
  });

  // Doctor Form State
  const [doctorForm, setDoctorForm] = useState({
    hospitalId: '',
    userId: '',
    departmentId: '',
    licenseNumber: '',
    specialization: '',
    qualifications: '',
    experienceYears: 5,
    consultationFee: 100,
    bio: '',
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [hospList, deptList, docList] = await Promise.allSettled([
        fetchHospitals(),
        fetchDepartments(),
        fetchDoctors(),
      ]);

      if (hospList.status === 'fulfilled') setHospitals(hospList.value);
      if (deptList.status === 'fulfilled') setDepartments(deptList.value);
      if (docList.status === 'fulfilled') setDoctors(docList.value);
    } catch (err: any) {
      setError(err.message || 'Error loading hospital data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleHospitalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await createHospital({
        name: hospitalForm.name,
        code: hospitalForm.code,
        email: hospitalForm.email,
        phone: hospitalForm.phone,
        licenseNumber: hospitalForm.licenseNumber,
        taxId: hospitalForm.taxId || undefined,
        address: {
          street: hospitalForm.street,
          city: hospitalForm.city,
          state: hospitalForm.state,
          postalCode: hospitalForm.postalCode,
          country: hospitalForm.country,
        },
        settings: {
          appointmentSlotDurationMinutes: Number(hospitalForm.slotDuration),
        },
      });
      setSuccess(`Hospital '${hospitalForm.name}' onboarded successfully!`);
      setHospitalForm({
        name: '',
        code: '',
        email: '',
        phone: '',
        licenseNumber: '',
        taxId: '',
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'USA',
        slotDuration: 30,
      });
      loadData();
      setActiveTab('overview');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleStatusChange = async (hospitalId: string, newStatus: string) => {
    try {
      await updateHospitalStatus(hospitalId, newStatus);
      setSuccess(`Hospital status changed to ${newStatus}`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const targetHospitalId = deptForm.hospitalId || (hospitals[0]?._id as string);
      if (!targetHospitalId) {
        throw new Error('Please select or specify a hospital.');
      }
      await createDepartment({
        hospitalId: targetHospitalId,
        name: deptForm.name,
        code: deptForm.code,
        description: deptForm.description,
      });
      setSuccess(`Department '${deptForm.name}' created successfully!`);
      setDeptForm({ name: '', code: '', description: '', hospitalId: '' });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const targetHospitalId = doctorForm.hospitalId || (hospitals[0]?._id as string);
      if (!targetHospitalId) {
        throw new Error('Please select a hospital.');
      }
      await createDoctor({
        hospitalId: targetHospitalId,
        userId: doctorForm.userId,
        departmentId: doctorForm.departmentId,
        licenseNumber: doctorForm.licenseNumber,
        specialization: doctorForm.specialization,
        qualifications: doctorForm.qualifications.split(',').map((q) => q.trim()),
        experienceYears: Number(doctorForm.experienceYears),
        consultationFee: Number(doctorForm.consultationFee),
        bio: doctorForm.bio || undefined,
      });
      setSuccess(`Doctor profile created successfully!`);
      setDoctorForm({
        hospitalId: '',
        userId: '',
        departmentId: '',
        licenseNumber: '',
        specialization: '',
        qualifications: '',
        experienceYears: 5,
        consultationFee: 100,
        bio: '',
      });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hospital Administration & Governance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Super Admin onboarding, tenant verification, clinical departments, and doctor
            registries.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-slate-300 shadow-sm text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start space-x-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-rose-500" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start space-x-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-emerald-500" />
          <span>{success}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 space-x-8">
        {[
          { id: 'overview', label: 'Administration Dashboard', icon: Building2 },
          { id: 'onboarding', label: 'Hospital Onboarding', icon: PlusCircle },
          { id: 'departments', label: 'Departments', icon: Layers },
          { id: 'doctors', label: 'Doctor Profiles', icon: UserCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview Dashboard */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-lg">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Hospitals
                </p>
                <p className="text-2xl font-bold text-slate-900">{hospitals.length}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Departments
                </p>
                <p className="text-2xl font-bold text-slate-900">{departments.length}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center space-x-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <UserCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Registered Doctors
                </p>
                <p className="text-2xl font-bold text-slate-900">{doctors.length}</p>
              </div>
            </div>
          </div>

          {/* Hospitals List */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
              <h2 className="text-base font-semibold text-slate-900 flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2 text-teal-600" />
                Managed Hospital Tenants
              </h2>
            </div>

            {hospitals.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Building2 className="h-10 w-10 mx-auto text-slate-400 mb-2" />
                <p className="font-medium">No hospitals registered yet</p>
                <p className="text-xs mt-1">
                  Use the Hospital Onboarding tab to create the first tenant.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-6 py-3 text-left font-medium">Hospital Name</th>
                      <th className="px-6 py-3 text-left font-medium">Code</th>
                      <th className="px-6 py-3 text-left font-medium">License</th>
                      <th className="px-6 py-3 text-left font-medium">Status</th>
                      <th className="px-6 py-3 text-left font-medium">Slot Duration</th>
                      <th className="px-6 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {hospitals.map((hosp) => (
                      <tr key={hosp._id || hosp.code} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-medium text-slate-900">{hosp.name}</td>
                        <td className="px-6 py-4 text-slate-600 font-mono text-xs">{hosp.code}</td>
                        <td className="px-6 py-4 text-slate-600">{hosp.licenseNumber}</td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              hosp.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : hosp.status === 'ONBOARDING'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {hosp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {hosp.settings?.appointmentSlotDurationMinutes || 30} mins
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {hosp.status !== 'ACTIVE' && (
                            <button
                              onClick={() => handleStatusChange(hosp._id as string, 'ACTIVE')}
                              className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1 rounded font-medium border border-emerald-200"
                            >
                              Activate
                            </button>
                          )}
                          {hosp.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleStatusChange(hosp._id as string, 'SUSPENDED')}
                              className="text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 px-2.5 py-1 rounded font-medium border border-rose-200"
                            >
                              Suspend
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Hospital Onboarding Form */}
      {activeTab === 'onboarding' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm max-w-3xl">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
            <PlusCircle className="h-5 w-5 mr-2 text-teal-600" />
            Super Admin Hospital Onboarding
          </h2>
          <form onSubmit={handleHospitalSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hospital Name *
                </label>
                <input
                  type="text"
                  required
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })}
                  placeholder="e.g. Apex Memorial Hospital"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Hospital Code * (2-10 chars uppercase)
                </label>
                <input
                  type="text"
                  required
                  value={hospitalForm.code}
                  onChange={(e) =>
                    setHospitalForm({ ...hospitalForm, code: e.target.value.toUpperCase() })
                  }
                  placeholder="e.g. APEX01"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md uppercase font-mono focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Official Email *
                </label>
                <input
                  type="email"
                  required
                  value={hospitalForm.email}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, email: e.target.value })}
                  placeholder="admin@apex-hospital.org"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={hospitalForm.phone}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, phone: e.target.value })}
                  placeholder="+1-800-555-0199"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Medical License Number *
                </label>
                <input
                  type="text"
                  required
                  value={hospitalForm.licenseNumber}
                  onChange={(e) =>
                    setHospitalForm({ ...hospitalForm, licenseNumber: e.target.value })
                  }
                  placeholder="LIC-MED-99482"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tax ID / EIN
                </label>
                <input
                  type="text"
                  value={hospitalForm.taxId}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, taxId: e.target.value })}
                  placeholder="XX-XXXXXXX"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Address & Physical Facility
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  required
                  value={hospitalForm.street}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, street: e.target.value })}
                  placeholder="Street Address"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    value={hospitalForm.city}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, city: e.target.value })}
                    placeholder="City"
                    className="text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    required
                    value={hospitalForm.state}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, state: e.target.value })}
                    placeholder="State"
                    className="text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    required
                    value={hospitalForm.postalCode}
                    onChange={(e) =>
                      setHospitalForm({ ...hospitalForm, postalCode: e.target.value })
                    }
                    placeholder="Postal Code"
                    className="text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                  <input
                    type="text"
                    required
                    value={hospitalForm.country}
                    onChange={(e) => setHospitalForm({ ...hospitalForm, country: e.target.value })}
                    placeholder="Country"
                    className="text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Appointment Slot Duration (minutes)
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={hospitalForm.slotDuration}
                onChange={(e) =>
                  setHospitalForm({ ...hospitalForm, slotDuration: Number(e.target.value) })
                }
                className="w-32 text-sm px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>

            <button
              type="submit"
              className="mt-4 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 shadow-sm"
            >
              Submit Hospital Onboarding
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Department Management */}
      {activeTab === 'departments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">
                  Hospital Clinical Departments
                </h3>
              </div>
              {departments.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <Layers className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p>No departments configured for this tenant.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {departments.map((dept) => (
                    <div
                      key={dept._id || dept.code}
                      className="p-4 flex items-center justify-between hover:bg-slate-50"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-900">{dept.name}</span>
                          <span className="text-xs bg-slate-100 text-slate-700 font-mono px-2 py-0.5 rounded">
                            {dept.code}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              dept.isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {dept.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {dept.description && (
                          <p className="text-xs text-slate-500 mt-1">{dept.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Add New Department</h3>
              <form onSubmit={handleDeptSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={deptForm.name}
                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                    placeholder="e.g. Cardiology"
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Code * (uppercase)
                  </label>
                  <input
                    type="text"
                    required
                    value={deptForm.code}
                    onChange={(e) =>
                      setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. CARD"
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={deptForm.description}
                    onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                    placeholder="Clinical care and diagnostics..."
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 shadow-sm"
                >
                  Create Department
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Doctor Profile Management */}
      {activeTab === 'doctors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="text-base font-semibold text-slate-900">Medical Doctor Registry</h3>
              </div>
              {doctors.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <UserCheck className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                  <p>No doctor profiles created yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {doctors.map((doc) => (
                    <div
                      key={doc._id}
                      className="p-4 flex items-center justify-between hover:bg-slate-50"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-900">
                            Dr. {doc.userId?.firstName} {doc.userId?.lastName}
                          </span>
                          <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-medium border border-teal-200">
                            {doc.specialization}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          License: <span className="font-mono">{doc.licenseNumber}</span> | Exp:{' '}
                          {doc.experienceYears} yrs | Fee: ${doc.consultationFee}
                        </p>
                        <p className="text-xs text-slate-400">
                          Qualifications:{' '}
                          {Array.isArray(doc.qualifications)
                            ? doc.qualifications.join(', ')
                            : doc.qualifications}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Register Doctor Profile</h3>
              <form onSubmit={handleDoctorSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    User ID * (Doctor Account)
                  </label>
                  <input
                    type="text"
                    required
                    value={doctorForm.userId}
                    onChange={(e) => setDoctorForm({ ...doctorForm, userId: e.target.value })}
                    placeholder="Mongoose User ObjectId"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Department *
                  </label>
                  <select
                    required
                    value={doctorForm.departmentId}
                    onChange={(e) => setDoctorForm({ ...doctorForm, departmentId: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                  >
                    <option value="">Select Department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Medical License Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={doctorForm.licenseNumber}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, licenseNumber: e.target.value })
                    }
                    placeholder="e.g. MD-LIC-55992"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Specialization *
                  </label>
                  <input
                    type="text"
                    required
                    value={doctorForm.specialization}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, specialization: e.target.value })
                    }
                    placeholder="e.g. Cardiologist"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Qualifications (comma separated) *
                  </label>
                  <input
                    type="text"
                    required
                    value={doctorForm.qualifications}
                    onChange={(e) =>
                      setDoctorForm({ ...doctorForm, qualifications: e.target.value })
                    }
                    placeholder="MBBS, MD Cardiology"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Exp (Years)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={doctorForm.experienceYears}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, experienceYears: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fee ($)</label>
                    <input
                      type="number"
                      min={0}
                      value={doctorForm.consultationFee}
                      onChange={(e) =>
                        setDoctorForm({ ...doctorForm, consultationFee: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-teal-600 text-white text-xs font-semibold rounded-md hover:bg-teal-700 shadow-sm"
                >
                  Save Doctor Profile
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
