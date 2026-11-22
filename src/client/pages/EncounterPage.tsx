import React, { useState, useEffect } from 'react';
import {
  FileText,
  Activity,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Heart,
  Thermometer,
  Wind,
  ShieldAlert,
  FileCheck,
  Send,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  fetchEncounters,
  fetchDoctors,
  createEncounter,
  signEncounter,
  addEncounterAddendum,
} from '../services/api';
import {
  calculateBmi,
  getBmiCategory,
  getAbnormalVitalsFlags,
} from '../../server/utils/vitalsCalculator';

export const EncounterPage: React.FC = () => {
  const [encounters, setEncounters] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedEncounter, setSelectedEncounter] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for New Encounter
  const [doctorId, setDoctorId] = useState<string>('');
  const [patientId, setPatientId] = useState<string>('');
  const [chiefComplaint, setChiefComplaint] = useState<string>('');
  const [hpi, setHpi] = useState<string>('');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [assessment, setAssessment] = useState<string>('');

  // Vitals inputs
  const [systolicBp, setSystolicBp] = useState<number>(120);
  const [diastolicBp, setDiastolicBp] = useState<number>(80);
  const [pulseRate, setPulseRate] = useState<number>(72);
  const [temperatureF, setTemperatureF] = useState<number>(98.6);
  const [respiratoryRate, setRespiratoryRate] = useState<number>(16);
  const [oxygenSaturation, setOxygenSaturation] = useState<number>(98);
  const [heightCm, setHeightCm] = useState<number>(170);
  const [weightKg, setWeightKg] = useState<number>(70);

  // Symptoms input list
  const [symptoms, setSymptoms] = useState<
    Array<{ name: string; severity: 'MILD' | 'MODERATE' | 'SEVERE'; duration?: string }>
  >([{ name: '', severity: 'MODERATE', duration: '' }]);

  // Addendum Form State
  const [amendmentReason, setAmendmentReason] = useState<string>('');
  const [addendumNotes, setAddendumNotes] = useState<string>('');
  const [isSubmittingAddendum, setIsSubmittingAddendum] = useState<boolean>(false);

  // Real-time calculations
  const liveBmi = calculateBmi(weightKg, heightCm);
  const liveBmiCategory = getBmiCategory(liveBmi);
  const liveAbnormalFlags = getAbnormalVitalsFlags({
    systolicBp,
    diastolicBp,
    pulseRate,
    temperatureF,
    respiratoryRate,
    oxygenSaturation,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [encs, docs] = await Promise.all([fetchEncounters(), fetchDoctors()]);
      setEncounters(encs);
      setDoctors(docs);
      if (docs.length > 0 && !doctorId) {
        setDoctorId(docs[0]._id);
      }
      if (encs.length > 0 && !selectedEncounter) {
        setSelectedEncounter(encs[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load EMR records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddSymptom = () => {
    setSymptoms([...symptoms, { name: '', severity: 'MODERATE', duration: '' }]);
  };

  const handleRemoveSymptom = (index: number) => {
    setSymptoms(symptoms.filter((_, i) => i !== index));
  };

  const handleSymptomChange = (index: number, field: string, value: string) => {
    const updated = [...symptoms];
    updated[index] = { ...updated[index], [field]: value };
    setSymptoms(updated);
  };

  const handleCreateEncounter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId.trim() || !chiefComplaint.trim() || !doctorId) {
      setError('Doctor, Patient ID and Chief Complaint are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const validSymptoms = symptoms.filter((s) => s.name.trim().length > 0);
      const payload = {
        hospitalId: 'default', // handled by tenant middleware if non-superadmin
        patientId,
        doctorId,
        chiefComplaint,
        historyOfPresentIllness: hpi,
        clinicalNotes,
        assessment,
        vitals: {
          systolicBp: Number(systolicBp),
          diastolicBp: Number(diastolicBp),
          pulseRate: Number(pulseRate),
          temperatureF: Number(temperatureF),
          respiratoryRate: Number(respiratoryRate),
          oxygenSaturation: Number(oxygenSaturation),
          heightCm: Number(heightCm),
          weightKg: Number(weightKg),
        },
        symptoms: validSymptoms,
      };

      const created = await createEncounter(payload);
      setSuccess('Clinical encounter created successfully in draft status.');
      setChiefComplaint('');
      setHpi('');
      setClinicalNotes('');
      setAssessment('');
      setSelectedEncounter(created);
      setActiveTab('list');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignEncounter = async (id: string) => {
    if (
      !window.confirm(
        'Are you sure you want to finalize and SIGN this clinical encounter? It will become IMMUTABLE.',
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await signEncounter(id);
      setSelectedEncounter(updated);
      setSuccess('Clinical encounter has been officially finalized and signed.');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAddendum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEncounter || !amendmentReason.trim() || !addendumNotes.trim()) {
      setError('Amendment reason and notes are required.');
      return;
    }

    setIsSubmittingAddendum(true);
    setError(null);
    try {
      const updated = await addEncounterAddendum(selectedEncounter._id, {
        amendmentReason,
        notes: addendumNotes,
      });
      setSelectedEncounter(updated);
      setSuccess('Amendment addendum appended successfully.');
      setAmendmentReason('');
      setAddendumNotes('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmittingAddendum(false);
    }
  };

  const getBmiBadgeColor = (cat: string) => {
    switch (cat) {
      case 'UNDERWEIGHT':
        return 'bg-blue-100 text-blue-800';
      case 'NORMAL':
        return 'bg-green-100 text-green-800';
      case 'OVERWEIGHT':
        return 'bg-yellow-100 text-yellow-800';
      case 'OBESE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1" /> DRAFT / OPEN
          </span>
        );
      case 'SIGNED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
            <FileCheck className="w-3 h-3 mr-1" /> FINALIZED & SIGNED
          </span>
        );
      case 'AMENDED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800">
            <ShieldAlert className="w-3 h-3 mr-1" /> AMENDED (ADDENDUM)
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center">
              <FileText className="h-6 w-6 text-teal-600 mr-2" />
              EMR Clinical Encounters & Vitals
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Append-only medical records with automatic BMI categorization, abnormal vital flags,
              and addendum tracking.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors ${
                activeTab === 'list'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Encounter Records
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'new'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              New Clinical Encounter
            </button>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-md flex items-center text-red-700 text-sm">
          <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border-l-4 border-green-500 rounded-md flex items-center text-green-700 text-sm">
          <CheckCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* New Encounter Form */}
      {activeTab === 'new' && (
        <form onSubmit={handleCreateEncounter} className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 border-b pb-3">
              1. Patient & Attending Physician
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Attending Doctor
                </label>
                <select
                  value={doctorId}
                  onChange={(e) => setDoctorId(e.target.value)}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                  required
                >
                  <option value="">Select Doctor</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      Dr. {d.userId?.firstName || ''} {d.userId?.lastName || ''} ({d.specialization}
                      )
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patient Profile ID / MRN
                </label>
                <input
                  type="text"
                  placeholder="e.g. 6b02fb0f171afbe526fce7eb"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                  required
                />
              </div>
            </div>

            <h2 className="text-lg font-semibold text-slate-900 border-b pb-3 pt-2">
              2. Vital Signs & Live BMI Engine
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Systolic BP (mmHg)
                </label>
                <input
                  type="number"
                  value={systolicBp}
                  onChange={(e) => setSystolicBp(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Diastolic BP (mmHg)
                </label>
                <input
                  type="number"
                  value={diastolicBp}
                  onChange={(e) => setDiastolicBp(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pulse Rate (bpm)
                </label>
                <input
                  type="number"
                  value={pulseRate}
                  onChange={(e) => setPulseRate(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Temperature (°F)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={temperatureF}
                  onChange={(e) => setTemperatureF(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Resp Rate (breaths/min)
                </label>
                <input
                  type="number"
                  value={respiratoryRate}
                  onChange={(e) => setRespiratoryRate(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  SpO2 Oxygen (%)
                </label>
                <input
                  type="number"
                  value={oxygenSaturation}
                  onChange={(e) => setOxygenSaturation(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Height (cm)</label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                />
              </div>
            </div>

            {/* Live Calculation Preview Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-teal-100 rounded-full text-teal-700">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    Calculated Body Mass Index (BMI)
                  </div>
                  <div className="text-xl font-bold text-slate-900 flex items-center space-x-2">
                    <span>{liveBmi} kg/m²</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${getBmiBadgeColor(liveBmiCategory)}`}
                    >
                      {liveBmiCategory}
                    </span>
                  </div>
                </div>
              </div>

              {liveAbnormalFlags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-red-600 flex items-center mr-1">
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Abnormal Flags:
                  </span>
                  {liveAbnormalFlags.map((flag) => (
                    <span
                      key={flag}
                      className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-800 border border-red-200"
                    >
                      {flag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-xs font-medium text-green-700 flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1 text-green-600" /> All vitals within normal
                  clinical range
                </div>
              )}
            </div>

            <h2 className="text-lg font-semibold text-slate-900 border-b pb-3 pt-2">
              3. Clinical Presentation & Symptoms
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Chief Complaint *
              </label>
              <input
                type="text"
                placeholder="e.g. Acute chest discomfort with shortness of breath for 2 days"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-700">Symptoms</label>
                <button
                  type="button"
                  onClick={handleAddSymptom}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Symptom
                </button>
              </div>
              <div className="space-y-2">
                {symptoms.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Symptom name (e.g. Cough)"
                      value={s.name}
                      onChange={(e) => handleSymptomChange(idx, 'name', e.target.value)}
                      className="flex-1 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <select
                      value={s.severity}
                      onChange={(e) => handleSymptomChange(idx, 'severity', e.target.value)}
                      className="text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    >
                      <option value="MILD">Mild</option>
                      <option value="MODERATE">Moderate</option>
                      <option value="SEVERE">Severe</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Duration (e.g. 3 days)"
                      value={s.duration || ''}
                      onChange={(e) => handleSymptomChange(idx, 'duration', e.target.value)}
                      className="w-32 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    {symptoms.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSymptom(idx)}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                History of Present Illness (HPI)
              </label>
              <textarea
                rows={3}
                placeholder="Detailed progression of the present condition..."
                value={hpi}
                onChange={(e) => setHpi(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Doctor Assessment & Plan
              </label>
              <textarea
                rows={3}
                placeholder="Clinical assessment and diagnostic considerations..."
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
              />
            </div>

            <div className="flex justify-end pt-4 border-t">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-teal-600 text-white rounded-lg font-medium text-xs shadow-sm hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? 'Creating Encounter...' : 'Create Draft Clinical Encounter'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Encounter Records List & Detail View */}
      {activeTab === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Encounters sidebar */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Encounter Records ({encounters.length})
              </h2>
              <button onClick={loadData} className="text-xs text-teal-600 hover:text-teal-700">
                Refresh
              </button>
            </div>
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {encounters.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No clinical encounters found.
                </div>
              ) : (
                encounters.map((enc) => (
                  <div
                    key={enc._id}
                    onClick={() => setSelectedEncounter(enc)}
                    className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                      selectedEncounter?._id === enc._id
                        ? 'bg-teal-50/60 border-l-4 border-teal-600'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {enc.chiefComplaint || 'Consultation'}
                      </span>
                      {getStatusBadge(enc.status)}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between mt-1">
                      <span>Date: {new Date(enc.createdAt).toLocaleDateString()}</span>
                      <span>BMI: {enc.vitals?.bmi || 'N/A'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Encounter Detail & Addendum Pane */}
          <div className="lg:col-span-2">
            {selectedEncounter ? (
              <div className="space-y-6">
                {/* Header Card */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 mb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-lg font-bold text-slate-900">
                          {selectedEncounter.chiefComplaint}
                        </h2>
                        {getStatusBadge(selectedEncounter.status)}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Encounter ID:{' '}
                        <span className="font-mono text-slate-700">{selectedEncounter._id}</span> •
                        Created: {new Date(selectedEncounter.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {selectedEncounter.status === 'OPEN' && (
                      <button
                        onClick={() => handleSignEncounter(selectedEncounter._id)}
                        disabled={loading}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-semibold shadow-sm flex items-center"
                      >
                        <FileCheck className="w-3.5 h-3.5 mr-1.5" />
                        Finalize & Sign Encounter
                      </button>
                    )}
                  </div>

                  {/* Vitals Summary Grid */}
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Recorded Vitals & Measurements
                  </h3>
                  {selectedEncounter.vitals ? (
                    <div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-[10px] text-slate-500 flex items-center">
                            <Heart className="w-3 h-3 mr-1 text-red-500" /> Blood Pressure
                          </div>
                          <div className="text-sm font-bold text-slate-800 mt-1">
                            {selectedEncounter.vitals.systolicBp}/
                            {selectedEncounter.vitals.diastolicBp} mmHg
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-[10px] text-slate-500 flex items-center">
                            <Activity className="w-3 h-3 mr-1 text-teal-500" /> Pulse Rate
                          </div>
                          <div className="text-sm font-bold text-slate-800 mt-1">
                            {selectedEncounter.vitals.pulseRate} bpm
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-[10px] text-slate-500 flex items-center">
                            <Thermometer className="w-3 h-3 mr-1 text-amber-500" /> Temperature
                          </div>
                          <div className="text-sm font-bold text-slate-800 mt-1">
                            {selectedEncounter.vitals.temperatureF} °F
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <div className="text-[10px] text-slate-500 flex items-center">
                            <Wind className="w-3 h-3 mr-1 text-blue-500" /> SpO2 Oxygen
                          </div>
                          <div className="text-sm font-bold text-slate-800 mt-1">
                            {selectedEncounter.vitals.oxygenSaturation} %
                          </div>
                        </div>
                      </div>

                      {/* BMI & Alerts */}
                      <div className="flex flex-wrap items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-slate-600">
                            Height: <strong>{selectedEncounter.vitals.heightCm} cm</strong> •
                            Weight: <strong>{selectedEncounter.vitals.weightKg} kg</strong>
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded font-semibold ${getBmiBadgeColor(
                              selectedEncounter.vitals.bmiCategory,
                            )}`}
                          >
                            BMI: {selectedEncounter.vitals.bmi} (
                            {selectedEncounter.vitals.bmiCategory})
                          </span>
                        </div>

                        {selectedEncounter.vitals.abnormalFlags &&
                          selectedEncounter.vitals.abnormalFlags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2 sm:mt-0">
                              {selectedEncounter.vitals.abnormalFlags.map((flag: string) => (
                                <span
                                  key={flag}
                                  className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-800"
                                >
                                  {flag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic">
                      No vitals recorded for this encounter.
                    </div>
                  )}

                  {/* Presentation details */}
                  <div className="mt-6 space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700">Symptoms</h4>
                      {selectedEncounter.symptoms && selectedEncounter.symptoms.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedEncounter.symptoms.map((s: any, idx: number) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 text-xs rounded-md bg-slate-100 border text-slate-800"
                            >
                              {s.name}{' '}
                              <span className="text-[10px] text-slate-500">({s.severity})</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-0.5">None listed</p>
                      )}
                    </div>

                    {selectedEncounter.historyOfPresentIllness && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700">
                          History of Present Illness (HPI)
                        </h4>
                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border mt-1">
                          {selectedEncounter.historyOfPresentIllness}
                        </p>
                      </div>
                    )}

                    {selectedEncounter.assessment && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700">
                          Clinical Assessment
                        </h4>
                        <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border mt-1">
                          {selectedEncounter.assessment}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Amendments & Addenda Card */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center">
                      <ShieldAlert className="w-4 h-4 text-indigo-600 mr-2" />
                      Addenda & Amendments History ({selectedEncounter.addenda?.length || 0})
                    </h3>
                    <span className="text-[11px] text-slate-500">
                      Append-Only Legal Audit Trail
                    </span>
                  </div>

                  {selectedEncounter.addenda && selectedEncounter.addenda.length > 0 ? (
                    <div className="space-y-3">
                      {selectedEncounter.addenda.map((ad: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs"
                        >
                          <div className="flex items-center justify-between text-indigo-900 font-semibold mb-1">
                            <span>Reason: {ad.amendmentReason}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {new Date(ad.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-700 mt-1">{ad.notes}</p>
                          <div className="text-[10px] text-slate-500 mt-2">
                            Author: {ad.authorName} ({ad.authorRole})
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      No addenda recorded for this encounter.
                    </p>
                  )}

                  {/* Add Addendum Form (Active for SIGNED or AMENDED records) */}
                  {(selectedEncounter.status === 'SIGNED' ||
                    selectedEncounter.status === 'AMENDED') && (
                    <form onSubmit={handleAddAddendum} className="pt-4 border-t space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Append Legal Addendum
                      </h4>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Reason for Amendment *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Lab results follow-up or updated differential diagnosis"
                          value={amendmentReason}
                          onChange={(e) => setAmendmentReason(e.target.value)}
                          className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Addendum Notes *
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Enter amendment details..."
                          value={addendumNotes}
                          onChange={(e) => setAddendumNotes(e.target.value)}
                          className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                          required
                        />
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSubmittingAddendum}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 shadow-sm flex items-center disabled:opacity-50"
                        >
                          <Send className="w-3 h-3 mr-1.5" />
                          {isSubmittingAddendum ? 'Appending...' : 'Append Addendum'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center text-slate-400 text-xs">
                Select an encounter from the left panel to review details, vitals, and addenda.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
