import React, { useState, useEffect } from 'react';
import {
  FileText,
  PlusCircle,
  Trash2,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  User,
  History,
  Pill,
  Download,
  PenTool,
  FileCheck,
} from 'lucide-react';
import {
  searchMedicines,
  fetchPrescriptions,
  createPrescription,
  amendPrescription,
  signPrescription,
  getPrescriptionPdfUrl,
  fetchEncounters,
  fetchDoctors,
} from '../services/api';

interface MedicineItem {
  medicineId?: string;
  medicineName: string;
  form: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'topical';
  dosage: string;
  frequency: 'OD' | 'BD' | 'TDS' | 'QID' | 'SOS';
  durationDays: number;
  specialInstructions: string;
}

export const PrescriptionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'list' | 'issue'>('list');
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [encounters, setEncounters] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form State for New Prescription
  const [hospitalId, setHospitalId] = useState<string>('');
  const [selectedEncounterId, setSelectedEncounterId] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [doctorId, setDoctorId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Multiple Medicine Items
  const [items, setItems] = useState<MedicineItem[]>([
    {
      medicineName: '',
      form: 'tablet',
      dosage: '500mg',
      frequency: 'BD',
      durationDays: 5,
      specialInstructions: 'Take after meals with warm water',
    },
  ]);

  // Medicine Search & Suggestions
  const [catalogueResults, setCatalogueResults] = useState<any[]>([]);
  const [searchingCatalogue, setSearchingCatalogue] = useState<boolean>(false);
  const [activeItemIndexForSearch, setActiveItemIndexForSearch] = useState<number | null>(null);

  // Amendment Modal State
  const [amendingPrescription, setAmendingPrescription] = useState<any | null>(null);
  const [amendmentReason, setAmendmentReason] = useState<string>('');
  const [amendedItems, setAmendedItems] = useState<MedicineItem[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prescData, encData, docData] = await Promise.all([
        fetchPrescriptions().catch(() => []),
        fetchEncounters().catch(() => []),
        fetchDoctors().catch(() => []),
      ]);
      setPrescriptions(prescData || []);
      setEncounters(encData || []);
      setDoctors(docData || []);

      if (encData && encData.length > 0) {
        setHospitalId(encData[0].hospitalId || '');
        setSelectedEncounterId(encData[0]._id || '');
        setPatientId(encData[0].patientId || '');
        setDoctorId(encData[0].doctorId || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load prescription data');
    } finally {
      setLoading(false);
    }
  };

  const handleEncounterChange = (encId: string) => {
    setSelectedEncounterId(encId);
    const enc = encounters.find((e) => e._id === encId);
    if (enc) {
      setPatientId(enc.patientId || '');
      setDoctorId(enc.doctorId || '');
      setHospitalId(enc.hospitalId || '');
    }
  };

  const handleMedicineSearch = async (term: string, itemIndex: number) => {
    setActiveItemIndexForSearch(itemIndex);
    if (!term || term.trim().length < 2) {
      setCatalogueResults([]);
      return;
    }
    setSearchingCatalogue(true);
    try {
      const results = await searchMedicines(term);
      setCatalogueResults(results || []);
    } catch {
      setCatalogueResults([]);
    } finally {
      setSearchingCatalogue(false);
    }
  };

  const selectCatalogueMedicine = (itemIndex: number, med: any) => {
    const updated = [...items];
    updated[itemIndex] = {
      ...updated[itemIndex],
      medicineId: med._id,
      medicineName: med.name,
      form: med.dosageForm || 'tablet',
      dosage: med.strength || '500mg',
    };
    setItems(updated);
    setCatalogueResults([]);
    setActiveItemIndexForSearch(null);
  };

  const addMedicineItem = () => {
    setItems([
      ...items,
      {
        medicineName: '',
        form: 'tablet',
        dosage: '1 tablet',
        frequency: 'BD',
        durationDays: 5,
        specialInstructions: '',
      },
    ]);
  };

  const removeMedicineItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const updateMedicineItem = (index: number, field: keyof MedicineItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSubmitPrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!selectedEncounterId || !patientId || !doctorId || !hospitalId) {
      setError('Please select an active clinical encounter linked to a valid patient and doctor.');
      return;
    }

    const invalidItem = items.find((i) => !i.medicineName.trim() || i.durationDays < 1);
    if (invalidItem) {
      setError('Every medicine entry must have a valid name and positive duration (days).');
      return;
    }

    setSubmitting(true);
    try {
      await createPrescription({
        hospitalId,
        patientId,
        doctorId,
        encounterId: selectedEncounterId,
        items,
        notes,
      });

      setSuccess('Prescription issued successfully with immutable medical audit record.');
      setActiveTab('list');
      loadInitialData();
    } catch (err: any) {
      setError(err.message || 'Failed to issue prescription');
    } finally {
      setSubmitting(false);
    }
  };

  const openAmendmentModal = (presc: any) => {
    setAmendingPrescription(presc);
    setAmendmentReason('');
    setAmendedItems(JSON.parse(JSON.stringify(presc.items)));
  };

  const handleAmendSubmit = async () => {
    if (!amendingPrescription || !amendmentReason.trim()) {
      setError('A mandatory reason is required to amend an issued prescription.');
      return;
    }

    setSubmitting(true);
    try {
      await amendPrescription(amendingPrescription._id, {
        items: amendedItems,
        reason: amendmentReason,
      });

      setSuccess('Prescription amended successfully; original historical items safely preserved.');
      setAmendingPrescription(null);
      loadInitialData();
    } catch (err: any) {
      setError(err.message || 'Failed to amend prescription');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignPrescription = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await signPrescription(id);
      setSuccess('Prescription digitally signed and sealed successfully.');
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || 'Failed to sign prescription');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = (id: string) => {
    const url = getPrescriptionPdfUrl(id);
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Pill className="h-7 w-7 text-teal-600" />
            Prescriptions & Formularies
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Day 13 — Foundation for multi-drug medical prescriptions, formulary lookup, and
            append-only amendment audit trails.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="h-4 w-4" />
            Prescription Records
          </button>
          <button
            onClick={() => setActiveTab('issue')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'issue'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            Issue Prescription
          </button>
          <button
            onClick={loadInitialData}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* TAB 1: LIST PRESCRIPTIONS */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText className="h-4 w-4 text-teal-600" />
              Issued Prescriptions ({prescriptions.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-teal-600" />
              Loading prescriptions...
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              No prescriptions found in this hospital tenant. Click "Issue Prescription" to create
              one.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {prescriptions.map((p) => (
                <div key={p._id} className="p-5 hover:bg-slate-50 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-teal-50 text-teal-700 rounded-lg font-mono text-xs font-bold">
                        RX-{p._id.slice(-6).toUpperCase()}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          Patient ID: {p.patientId}
                          <span className="text-slate-300">|</span>
                          Doctor ID: {p.doctorId}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          Issued: {new Date(p.issuedAt || p.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'ISSUED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : p.status === 'AMENDED'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {p.status}
                      </span>

                      {p.signedAt ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <FileCheck className="h-3 w-3" />
                          Signed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSignPrescription(p._id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors flex items-center gap-1"
                        >
                          <PenTool className="h-3 w-3" />
                          Sign
                        </button>
                      )}

                      <button
                        onClick={() => handleDownloadPdf(p._id)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded border border-slate-200 transition-colors flex items-center gap-1"
                      >
                        <Download className="h-3 w-3 text-teal-600" />
                        PDF
                      </button>

                      <button
                        onClick={() => openAmendmentModal(p)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors flex items-center gap-1"
                      >
                        <History className="h-3 w-3" />
                        Amend
                      </button>
                    </div>
                  </div>

                  {/* Medicines Table */}
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mt-3">
                    <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Pill className="h-3.5 w-3.5 text-teal-600" />
                      Prescribed Medicines ({p.items?.length || 0})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500 font-semibold text-[10px] uppercase">
                            <th className="pb-1.5">Medicine</th>
                            <th className="pb-1.5">Form</th>
                            <th className="pb-1.5">Dosage</th>
                            <th className="pb-1.5">Frequency</th>
                            <th className="pb-1.5">Duration</th>
                            <th className="pb-1.5">Instructions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {p.items?.map((it: any, idx: number) => (
                            <tr key={idx} className="text-slate-800 text-[11px]">
                              <td className="py-1.5 font-medium">{it.medicineName}</td>
                              <td className="py-1.5 capitalize text-slate-600">{it.form}</td>
                              <td className="py-1.5 font-mono text-slate-600">{it.dosage}</td>
                              <td className="py-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-teal-700 font-semibold text-[10px]">
                                  {it.frequency}
                                </span>
                              </td>
                              <td className="py-1.5 text-slate-600">{it.durationDays} days</td>
                              <td className="py-1.5 text-slate-500">
                                {it.specialInstructions || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Amendments History if any */}
                  {p.amendments && p.amendments.length > 0 && (
                    <div className="mt-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100 text-xs">
                      <div className="font-semibold text-purple-900 text-[11px] flex items-center gap-1 mb-1">
                        <History className="h-3.5 w-3.5 text-purple-600" />
                        Audit History: {p.amendments.length} Amendment(s)
                      </div>
                      {p.amendments.map((am: any, aIdx: number) => (
                        <div
                          key={aIdx}
                          className="text-[11px] text-purple-800 mt-1 pl-4 border-l-2 border-purple-300"
                        >
                          <span className="font-bold">Rev #{am.amendmentNumber}:</span> {am.reason}{' '}
                          — by {am.authorName} ({am.authorRole}) at{' '}
                          {new Date(am.amendedAt).toLocaleString()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ISSUE PRESCRIPTION */}
      {activeTab === 'issue' && (
        <form
          onSubmit={handleSubmitPrescription}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6"
        >
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Pill className="h-5 w-5 text-teal-600" />
              New Clinical Prescription
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Select an authorized patient clinical encounter and specify medication entries with
              precise frequency and duration.
            </p>
          </div>

          {/* Context Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Link to Clinical Encounter *
              </label>
              <select
                value={selectedEncounterId}
                onChange={(e) => handleEncounterChange(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">-- Select Active Encounter --</option>
                {encounters.map((enc) => (
                  <option key={enc._id} value={enc._id}>
                    ENC-{enc._id.slice(-6).toUpperCase()} — {enc.chiefComplaint} (Patient:{' '}
                    {enc.patientId})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Attending Doctor Profile *
              </label>
              <select
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">-- Select Doctor --</option>
                {doctors.map((doc) => (
                  <option key={doc._id} value={doc._id}>
                    Dr. {doc.specialization} (License: {doc.licenseNumber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Medication Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="h-4 w-4 text-teal-600" />
                Medication Entries ({items.length})
              </h3>
              <button
                type="button"
                onClick={addMedicineItem}
                className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-100 transition-colors flex items-center gap-1 border border-teal-200"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Add Medicine
              </button>
            </div>

            {items.map((it, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Medicine #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMedicineItem(idx)}
                      className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Medicine Name with Searchable Catalogue */}
                  <div className="relative">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Medicine Name *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search formulary or type name..."
                        value={it.medicineName}
                        onChange={(e) => {
                          updateMedicineItem(idx, 'medicineName', e.target.value);
                          handleMedicineSearch(e.target.value, idx);
                        }}
                        className="w-full text-xs p-2 pl-7 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        required
                      />
                      {searchingCatalogue && activeItemIndexForSearch === idx ? (
                        <RefreshCw className="h-3.5 w-3.5 text-teal-600 animate-spin absolute left-2 top-2.5" />
                      ) : (
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-2.5" />
                      )}
                    </div>

                    {/* Autocomplete dropdown */}
                    {activeItemIndexForSearch === idx && catalogueResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-200 z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {catalogueResults.map((med) => (
                          <div
                            key={med._id}
                            onClick={() => selectCatalogueMedicine(idx, med)}
                            className="p-2 hover:bg-teal-50 cursor-pointer text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-semibold text-slate-800">{med.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {med.genericName} ({med.category})
                              </div>
                            </div>
                            <span className="text-[10px] uppercase font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">
                              {med.dosageForm}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dosage Form *
                    </label>
                    <select
                      value={it.form}
                      onChange={(e) => updateMedicineItem(idx, 'form', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 capitalize"
                    >
                      <option value="tablet">Tablet</option>
                      <option value="capsule">Capsule</option>
                      <option value="syrup">Syrup</option>
                      <option value="injection">Injection</option>
                      <option value="topical">Topical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Dosage Strength *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 500mg, 1 puff, 5ml"
                      value={it.dosage}
                      onChange={(e) => updateMedicineItem(idx, 'dosage', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Frequency *
                    </label>
                    <select
                      value={it.frequency}
                      onChange={(e) => updateMedicineItem(idx, 'frequency', e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500 font-semibold"
                    >
                      <option value="OD">OD — Once Daily</option>
                      <option value="BD">BD — Twice Daily</option>
                      <option value="TDS">TDS — Three Times Daily</option>
                      <option value="QID">QID — Four Times Daily</option>
                      <option value="SOS">SOS — As Needed (Emergency)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Duration (Days) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={it.durationDays}
                      onChange={(e) =>
                        updateMedicineItem(idx, 'durationDays', Number(e.target.value))
                      }
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Special Instructions
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. After meals, avoid dairy"
                      value={it.specialInstructions}
                      onChange={(e) =>
                        updateMedicineItem(idx, 'specialInstructions', e.target.value)
                      }
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              General Prescription Notes
            </label>
            <textarea
              rows={2}
              placeholder="Advice to patient, dietary restrictions, follow-up timeline..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle className="h-4 w-4" />
              {submitting ? 'Issuing Prescription...' : 'Issue Prescription'}
            </button>
          </div>
        </form>
      )}

      {/* AMENDMENT MODAL */}
      {amendingPrescription && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <History className="h-4 w-4 text-purple-600" />
                Amend Prescription RX-{amendingPrescription._id.slice(-6).toUpperCase()}
              </h3>
              <button
                onClick={() => setAmendingPrescription(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mandatory Reason for Amendment *
              </label>
              <input
                type="text"
                placeholder="e.g. Dose adjusted following renal panel review"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>

            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-700">Modify Prescribed Items</div>
              {amendedItems.map((it, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2"
                >
                  <div className="font-bold text-xs text-slate-800">{it.medicineName}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={it.dosage}
                      onChange={(e) => {
                        const copy = [...amendedItems];
                        copy[idx].dosage = e.target.value;
                        setAmendedItems(copy);
                      }}
                      className="text-xs p-1.5 border rounded"
                      placeholder="Dosage"
                    />
                    <select
                      value={it.frequency}
                      onChange={(e) => {
                        const copy = [...amendedItems];
                        copy[idx].frequency = e.target.value as any;
                        setAmendedItems(copy);
                      }}
                      className="text-xs p-1.5 border rounded"
                    >
                      <option value="OD">OD</option>
                      <option value="BD">BD</option>
                      <option value="TDS">TDS</option>
                      <option value="QID">QID</option>
                      <option value="SOS">SOS</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={it.durationDays}
                      onChange={(e) => {
                        const copy = [...amendedItems];
                        copy[idx].durationDays = Number(e.target.value);
                        setAmendedItems(copy);
                      }}
                      className="text-xs p-1.5 border rounded"
                      placeholder="Days"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAmendingPrescription(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAmendSubmit}
                disabled={submitting}
                className="px-4 py-1.5 text-xs bg-purple-600 text-white font-semibold rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {submitting ? 'Amending...' : 'Confirm Amendment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
