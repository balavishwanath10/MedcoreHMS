import React, { useState, useEffect } from 'react';
import {
  FlaskConical,
  PlusCircle,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  User,
  Activity,
  Layers,
  FileText,
} from 'lucide-react';
import {
  fetchLabTests,
  fetchLabOrders,
  createLabOrder,
  markLabSampleCollected,
  fetchDoctors,
  fetchEncounters,
} from '../services/api';

export const LabPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'queue' | 'order' | 'catalogue'>('queue');
  const [orders, setOrders] = useState<any[]>([]);
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [catalogueCategoryFilter, setCatalogueCategoryFilter] = useState<string>('ALL');
  const [catalogueSearch, setCatalogueSearch] = useState<string>('');

  // Order Form State
  const [hospitalId, setHospitalId] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [encounterId, setEncounterId] = useState<string>('');
  const [priority, setPriority] = useState<'ROUTINE' | 'URGENT' | 'STAT'>('ROUTINE');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadInitialData();
  }, [statusFilter]);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderData, testData, docData, encData] = await Promise.all([
        fetchLabOrders(statusFilter !== 'ALL' ? { status: statusFilter } : undefined),
        fetchLabTests(),
        fetchDoctors().catch(() => []),
        fetchEncounters().catch(() => []),
      ]);

      setOrders(orderData || []);
      setCatalogue(testData || []);
      setDoctors(docData || []);
      setEncounters(encData || []);

      if (encData && encData.length > 0) {
        setHospitalId(encData[0].hospitalId || '');
        setPatientId(encData[0].patientId || '');
        setDoctorId(encData[0].doctorId || '');
        setEncounterId(encData[0]._id || '');
      } else if (docData && docData.length > 0) {
        setHospitalId(docData[0].hospitalId || '');
        setDoctorId(docData[0]._id || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load laboratory data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !doctorId || selectedTestIds.length === 0) {
      setError('Patient ID, Doctor ID, and at least one diagnostic test are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const payload: any = {
        hospitalId:
          hospitalId || encounters[0]?.hospitalId || doctors[0]?.hospitalId || 'HOSP-DEFAULT',
        patientId,
        doctorId,
        testIds: selectedTestIds,
        priority,
        clinicalNotes,
      };
      if (encounterId) payload.encounterId = encounterId;

      const order = await createLabOrder(payload);
      setSuccess(`Lab order ${order.orderNumber} placed successfully.`);
      setSelectedTestIds([]);
      setClinicalNotes('');
      setActiveTab('queue');
      loadInitialData();
    } catch (err: any) {
      setError(err.message || 'Failed to place lab order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkSampleCollected = async (orderId: string) => {
    try {
      setLoading(true);
      setError(null);
      await markLabSampleCollected(orderId);
      setSuccess('Specimen sample marked as collected successfully.');
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || 'Failed to update sample status');
    } finally {
      setLoading(false);
    }
  };

  const toggleTestSelection = (testId: string) => {
    if (selectedTestIds.includes(testId)) {
      setSelectedTestIds(selectedTestIds.filter((id) => id !== testId));
    } else {
      setSelectedTestIds([...selectedTestIds, testId]);
    }
  };

  const filteredCatalogue = catalogue.filter((t) => {
    const matchesCategory =
      catalogueCategoryFilter === 'ALL' || t.category === catalogueCategoryFilter;
    const matchesSearch =
      !catalogueSearch.trim() ||
      t.name.toLowerCase().includes(catalogueSearch.toLowerCase()) ||
      t.code.toLowerCase().includes(catalogueSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="h-7 w-7 text-teal-600" />
            Laboratory & Diagnostics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Diagnostic test catalogues, clinical encounter lab ordering, and specimen tracking.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('order')}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors flex items-center gap-2 shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            Order Lab Tests
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl gap-2">
        <button
          onClick={() => setActiveTab('queue')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'queue'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          Order Queue & Specimen Collection ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('order')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'order'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <PlusCircle className="h-4 w-4" />
          Order Diagnostic Tests
        </button>
        <button
          onClick={() => setActiveTab('catalogue')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'catalogue'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="h-4 w-4" />
          Test Catalogue ({catalogue.length})
        </button>
      </div>

      {/* TAB 1: ORDER QUEUE */}
      {activeTab === 'queue' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-4">
          {/* Status Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-xs font-semibold text-slate-500 mr-2">Status:</span>
            {['ALL', 'ORDERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'COMPLETED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
              Loading lab orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No diagnostic orders found in this filter view.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orders.map((o) => (
                <div
                  key={o._id}
                  className="p-5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white transition-all space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-teal-50 text-teal-700 rounded-lg font-mono text-xs font-bold">
                        {o.orderNumber}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          Patient: {o.patientId}
                          <span className="text-slate-300">|</span>
                          Doctor: {o.doctorId}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Ordered: {new Date(o.orderedAt || o.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          o.priority === 'STAT'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : o.priority === 'URGENT'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {o.priority}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === 'SAMPLE_COLLECTED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : o.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}
                      >
                        {o.status.replace('_', ' ')}
                      </span>

                      {o.status === 'ORDERED' && (
                        <button
                          onClick={() => handleMarkSampleCollected(o._id)}
                          className="px-3 py-1 bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Collect Sample
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ordered Tests List */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-700 mb-2">
                      Ordered Diagnostic Tests ({o.tests?.length || 0})
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {o.tests?.map((t: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2 bg-white rounded border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-teal-700 mr-2">
                              {t.testCode}
                            </span>
                            <span className="text-slate-800">{t.testName}</span>
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {t.sampleType}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {o.clinicalNotes && (
                    <div className="text-xs text-slate-600 bg-amber-50/50 p-2.5 rounded border border-amber-200/50">
                      <span className="font-semibold text-amber-800">Clinical Notes: </span>
                      {o.clinicalNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORDER LAB TESTS FORM */}
      {activeTab === 'order' && (
        <form
          onSubmit={handleCreateOrder}
          className="bg-white rounded-b-xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Patient Profile ID *
              </label>
              <input
                type="text"
                placeholder="e.g. 64b8a..."
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attending Doctor ID *
              </label>
              <input
                type="text"
                placeholder="e.g. 64b8b..."
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Encounter ID (Optional)
              </label>
              <input
                type="text"
                placeholder="Linked Encounter"
                value={encounterId}
                onChange={(e) => setEncounterId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="ROUTINE">Routine (Standard Turnaround)</option>
                <option value="URGENT">Urgent (Priority Processing)</option>
                <option value="STAT">STAT (Immediate Clinical Emergency)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Clinical Indications & Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Rule out anemia, evaluate suspected acute infection"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Test Catalogue Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Select Diagnostic Tests ({selectedTestIds.length} Selected) *
              </label>
              <span className="text-[11px] text-slate-500">
                Click any test below to add to order
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1 border border-slate-200 rounded-lg">
              {catalogue.map((test) => {
                const isSelected = selectedTestIds.includes(test._id);
                return (
                  <div
                    key={test._id}
                    onClick={() => toggleTestSelection(test._id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start justify-between ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/70 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-teal-700">
                          {test.code}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">{test.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        {test.category} | Sample: {test.sampleType} | TAT:{' '}
                        {test.turnaroundTimeHours}h
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-700">
                      ${test.price}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Placing Order...
                </>
              ) : (
                <>
                  <PlusCircle className="h-4 w-4" />
                  Submit Diagnostic Order
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: TEST CATALOGUE */}
      {activeTab === 'catalogue' && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-semibold text-slate-500">Category:</span>
              {['ALL', 'Hematology', 'Biochemistry', 'Pathology', 'Microbiology', 'Radiology'].map(
                (cat) => (
                  <button
                    key={cat}
                    onClick={() => setCatalogueCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      catalogueCategoryFilter === cat
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ),
              )}
            </div>

            <div className="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Search catalogue..."
                value={catalogueSearch}
                onChange={(e) => setCatalogueSearch(e.target.value)}
                className="w-full text-xs p-2 pl-8 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="min-w-full text-left text-xs divide-y divide-slate-200">
              <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px] uppercase">
                <tr>
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-4">Test Name</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Sample Type</th>
                  <th className="py-2.5 px-4">Turnaround</th>
                  <th className="py-2.5 px-4">Price</th>
                  <th className="py-2.5 px-4">Reference Ranges</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCatalogue.map((test) => (
                  <tr key={test._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-teal-700">{test.code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">{test.name}</td>
                    <td className="py-2.5 px-4 text-slate-600">{test.category}</td>
                    <td className="py-2.5 px-4 text-slate-600">{test.sampleType}</td>
                    <td className="py-2.5 px-4 text-slate-600">{test.turnaroundTimeHours} hrs</td>
                    <td className="py-2.5 px-4 font-mono text-slate-800 font-bold">
                      ${test.price}
                    </td>
                    <td className="py-2.5 px-4 text-[11px] text-slate-500">
                      {test.referenceRanges && test.referenceRanges.length > 0
                        ? test.referenceRanges
                            .map((r: any) =>
                              r.textRange
                                ? `${r.parameterName}: ${r.textRange}`
                                : `${r.parameterName}: ${r.minNormal}-${r.maxNormal} ${r.unit}`,
                            )
                            .join('; ')
                        : 'Standard range'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
