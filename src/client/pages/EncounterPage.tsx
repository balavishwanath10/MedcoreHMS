import React, { useState, useEffect } from 'react';
import {
  FileText,
  Activity,
  PlusCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  ShieldAlert,
  FileCheck,
  Send,
  Plus,
  Trash2,
  Syringe,
  AlertCircle,
  Users,
  History,
  Pill,
} from 'lucide-react';
import {
  fetchEncounters,
  fetchDoctors,
  createEncounter,
  signEncounter,
  addEncounterAddendum,
  createAllergy,
  fetchAllergies,
  createVaccination,
  fetchVaccinations,
  createFamilyHistory,
  fetchFamilyHistories,
  fetchPatientTimeline,
} from '../services/api';
import {
  calculateBmi,
  getBmiCategory,
  getAbnormalVitalsFlags,
} from '../../server/utils/vitalsCalculator';

export const EncounterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'encounters' | 'newEncounter' | 'allergies' | 'vaccinations' | 'familyHistory' | 'timeline'
  >('encounters');

  const [encounters, setEncounters] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [allergies, setAllergies] = useState<any[]>([]);
  const [vaccinations, setVaccinations] = useState<any[]>([]);
  const [familyHistories, setFamilyHistories] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any | null>(null);

  const [selectedEncounter, setSelectedEncounter] = useState<any | null>(null);
  const [filterPatientId, setFilterPatientId] = useState<string>('');
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

  // Diagnoses input list (ICD-10)
  const [diagnoses, setDiagnoses] = useState<
    Array<{ code: string; description: string; type: 'DIFFERENTIAL' | 'CONFIRMED'; notes?: string }>
  >([{ code: 'I10', description: 'Essential (primary) hypertension', type: 'CONFIRMED' }]);

  // Treatment Plan
  const [treatmentInstructions, setTreatmentInstructions] = useState<string>('');
  const [prescriptions, setPrescriptions] = useState<
    Array<{ medicationName: string; dosage: string; frequency: string; duration: string }>
  >([]);

  // Addendum Form State
  const [amendmentReason, setAmendmentReason] = useState<string>('');
  const [addendumNotes, setAddendumNotes] = useState<string>('');
  const [isSubmittingAddendum, setIsSubmittingAddendum] = useState<boolean>(false);

  // Allergy Form State
  const [allergyPatientId, setAllergyPatientId] = useState<string>('');
  const [allergen, setAllergen] = useState<string>('');
  const [allergyReaction, setAllergyReaction] = useState<string>('');
  const [allergySeverity, setAllergySeverity] = useState<
    'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING'
  >('MODERATE');
  const [isAdverseDrugReaction, setIsAdverseDrugReaction] = useState<boolean>(false);

  // Vaccination Form State
  const [vaxPatientId, setVaxPatientId] = useState<string>('');
  const [vaccineName, setVaccineName] = useState<string>('');
  const [vaxBatch, setVaxBatch] = useState<string>('');
  const [vaxDate, setVaxDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [vaxNextDue, setVaxNextDue] = useState<string>('');

  // Family History Form State
  const [famPatientId, setFamPatientId] = useState<string>('');
  const [relationship, setRelationship] = useState<string>('FATHER');
  const [condition, setCondition] = useState<string>('');
  const [hasDiabetes, setHasDiabetes] = useState<boolean>(false);
  const [hasHypertension, setHasHypertension] = useState<boolean>(false);
  const [hasCancer, setHasCancer] = useState<boolean>(false);
  const [hasCardiacDisease, setHasCardiacDisease] = useState<boolean>(false);

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
      const [encs, docs, alls, vaxs, fams] = await Promise.all([
        fetchEncounters(),
        fetchDoctors(),
        fetchAllergies(),
        fetchVaccinations(),
        fetchFamilyHistories(),
      ]);
      setEncounters(encs);
      setDoctors(docs);
      setAllergies(alls);
      setVaccinations(vaxs);
      setFamilyHistories(fams);
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

  const handleAddDiagnosis = () => {
    setDiagnoses([...diagnoses, { code: '', description: '', type: 'CONFIRMED' }]);
  };

  const handleAddPrescription = () => {
    setPrescriptions([
      ...prescriptions,
      { medicationName: '', dosage: '500mg', frequency: 'Twice daily', duration: '5 days' },
    ]);
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
      const validDiagnoses = diagnoses.filter(
        (d) => d.code.trim().length > 0 && d.description.trim().length > 0,
      );

      const payload = {
        hospitalId: 'default',
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
        diagnoses: validDiagnoses,
        treatmentPlan: treatmentInstructions.trim()
          ? {
              instructions: treatmentInstructions,
              prescriptions,
            }
          : undefined,
      };

      const created = await createEncounter(payload);
      setSuccess('Clinical encounter created successfully in draft status.');
      setChiefComplaint('');
      setHpi('');
      setClinicalNotes('');
      setAssessment('');
      setSelectedEncounter(created);
      setActiveTab('encounters');
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
        'Are you sure you want to finalize and SIGN this clinical encounter? It will become strictly IMMUTABLE.',
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

  const handleCreateAllergy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allergyPatientId || !allergen || !allergyReaction) {
      setError('Patient ID, Allergen and Reaction are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createAllergy({
        hospitalId: 'default',
        patientId: allergyPatientId,
        allergen,
        reaction: allergyReaction,
        severity: allergySeverity,
        isAdverseDrugReaction,
      });
      setSuccess('Patient allergy record added.');
      setAllergen('');
      setAllergyReaction('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVaccination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaxPatientId || !vaccineName) {
      setError('Patient ID and Vaccine Name are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createVaccination({
        hospitalId: 'default',
        patientId: vaxPatientId,
        vaccineName,
        batchNumber: vaxBatch,
        administeredDate: vaxDate,
        nextDueDate: vaxNextDue || undefined,
      });
      setSuccess('Vaccination record created.');
      setVaccineName('');
      setVaxBatch('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFamilyHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!famPatientId || !condition) {
      setError('Patient ID and Condition are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createFamilyHistory({
        hospitalId: 'default',
        patientId: famPatientId,
        relationship,
        condition,
        hasDiabetes,
        hasHypertension,
        hasCancer,
        hasCardiacDisease,
      });
      setSuccess('Family medical history record created.');
      setCondition('');
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadTimeline = async () => {
    if (!filterPatientId.trim()) {
      setError('Please enter a Patient Profile ID to load longitudinal timeline.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPatientTimeline(filterPatientId.trim());
      setTimelineData(res);
      setSuccess('Longitudinal patient clinical timeline loaded.');
    } catch (err: any) {
      setError(err.message);
      setTimelineData(null);
    } finally {
      setLoading(false);
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
              EMR Clinical Records & Longitudinal Patient History
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Encounters, ICD-10 Diagnoses, Treatment Plans, Allergies, Immunizations, and
              Hereditary Risk Profiles.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setActiveTab('encounters')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                activeTab === 'encounters'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Encounters ({encounters.length})
            </button>
            <button
              onClick={() => setActiveTab('newEncounter')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'newEncounter'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1" />
              New Encounter
            </button>
            <button
              onClick={() => setActiveTab('allergies')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'allergies'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5 mr-1" />
              Allergies ({allergies.length})
            </button>
            <button
              onClick={() => setActiveTab('vaccinations')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'vaccinations'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Syringe className="w-3.5 h-3.5 mr-1" />
              Immunizations ({vaccinations.length})
            </button>
            <button
              onClick={() => setActiveTab('familyHistory')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'familyHistory'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              Family History ({familyHistories.length})
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center transition-colors ${
                activeTab === 'timeline'
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <History className="w-3.5 h-3.5 mr-1" />
              Patient Timeline
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

      {/* =========================================================================
          TAB 1: NEW ENCOUNTER FORM
          ========================================================================= */}
      {activeTab === 'newEncounter' && (
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
                  placeholder="e.g. 6b02fe37fd3ffcc4f35ad75a"
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
                      className={`text-xs px-2 py-0.5 rounded font-medium ${getBmiBadgeColor(
                        liveBmiCategory,
                      )}`}
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
                      onChange={(e) => {
                        const updated = [...symptoms];
                        updated[idx].name = e.target.value;
                        setSymptoms(updated);
                      }}
                      className="flex-1 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <select
                      value={s.severity}
                      onChange={(e) => {
                        const updated = [...symptoms];
                        updated[idx].severity = e.target.value as any;
                        setSymptoms(updated);
                      }}
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
                      onChange={(e) => {
                        const updated = [...symptoms];
                        updated[idx].duration = e.target.value;
                        setSymptoms(updated);
                      }}
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

            <h2 className="text-lg font-semibold text-slate-900 border-b pb-3 pt-2">
              4. ICD-10 Diagnoses & Treatment Plan
            </h2>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-700">
                  Clinical Diagnoses
                </label>
                <button
                  type="button"
                  onClick={handleAddDiagnosis}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Diagnosis
                </button>
              </div>
              <div className="space-y-2">
                {diagnoses.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="ICD-10 (e.g. I10)"
                      value={d.code}
                      onChange={(e) => {
                        const updated = [...diagnoses];
                        updated[idx].code = e.target.value;
                        setDiagnoses(updated);
                      }}
                      className="w-24 text-xs font-mono uppercase rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <input
                      type="text"
                      placeholder="Diagnosis Description"
                      value={d.description}
                      onChange={(e) => {
                        const updated = [...diagnoses];
                        updated[idx].description = e.target.value;
                        setDiagnoses(updated);
                      }}
                      className="flex-1 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <select
                      value={d.type}
                      onChange={(e) => {
                        const updated = [...diagnoses];
                        updated[idx].type = e.target.value as any;
                        setDiagnoses(updated);
                      }}
                      className="text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    >
                      <option value="CONFIRMED">Confirmed</option>
                      <option value="DIFFERENTIAL">Differential</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Treatment Instructions
              </label>
              <textarea
                rows={2}
                placeholder="Prescribed clinical instructions, therapy, or dietary guidelines..."
                value={treatmentInstructions}
                onChange={(e) => setTreatmentInstructions(e.target.value)}
                className="w-full text-xs rounded-md border-slate-300 shadow-sm p-2 border"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-slate-700">Prescriptions</label>
                <button
                  type="button"
                  onClick={handleAddPrescription}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add Medication
                </button>
              </div>
              <div className="space-y-2">
                {prescriptions.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Medication name"
                      value={p.medicationName}
                      onChange={(e) => {
                        const updated = [...prescriptions];
                        updated[idx].medicationName = e.target.value;
                        setPrescriptions(updated);
                      }}
                      className="flex-1 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <input
                      type="text"
                      placeholder="Dosage"
                      value={p.dosage}
                      onChange={(e) => {
                        const updated = [...prescriptions];
                        updated[idx].dosage = e.target.value;
                        setPrescriptions(updated);
                      }}
                      className="w-24 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <input
                      type="text"
                      placeholder="Frequency"
                      value={p.frequency}
                      onChange={(e) => {
                        const updated = [...prescriptions];
                        updated[idx].frequency = e.target.value;
                        setPrescriptions(updated);
                      }}
                      className="w-28 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                    <input
                      type="text"
                      placeholder="Duration"
                      value={p.duration}
                      onChange={(e) => {
                        const updated = [...prescriptions];
                        updated[idx].duration = e.target.value;
                        setPrescriptions(updated);
                      }}
                      className="w-24 text-xs rounded-md border-slate-300 shadow-sm p-2 border"
                    />
                  </div>
                ))}
              </div>
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

      {/* =========================================================================
          TAB 2: ENCOUNTERS LIST & VIEWER
          ========================================================================= */}
      {activeTab === 'encounters' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          <div className="lg:col-span-2">
            {selectedEncounter ? (
              <div className="space-y-6">
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

                  {/* Vitals Summary */}
                  {selectedEncounter.vitals && (
                    <div className="mb-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Vital Signs
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="p-2.5 bg-slate-50 rounded border">
                          <span className="text-[10px] text-slate-500">Blood Pressure</span>
                          <div className="text-xs font-bold text-slate-800">
                            {selectedEncounter.vitals.systolicBp}/
                            {selectedEncounter.vitals.diastolicBp} mmHg
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded border">
                          <span className="text-[10px] text-slate-500">Pulse</span>
                          <div className="text-xs font-bold text-slate-800">
                            {selectedEncounter.vitals.pulseRate} bpm
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded border">
                          <span className="text-[10px] text-slate-500">Temp / SpO2</span>
                          <div className="text-xs font-bold text-slate-800">
                            {selectedEncounter.vitals.temperatureF}°F •{' '}
                            {selectedEncounter.vitals.oxygenSaturation}%
                          </div>
                        </div>
                        <div className="p-2.5 bg-slate-50 rounded border">
                          <span className="text-[10px] text-slate-500">BMI</span>
                          <div className="text-xs font-bold text-slate-800">
                            {selectedEncounter.vitals.bmi} ({selectedEncounter.vitals.bmiCategory})
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Diagnoses Section */}
                  {selectedEncounter.diagnoses && selectedEncounter.diagnoses.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Diagnoses (ICD-10)
                      </h3>
                      <div className="space-y-1.5">
                        {selectedEncounter.diagnoses.map((d: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 rounded bg-slate-50 border text-xs"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                                {d.code}
                              </span>
                              <span className="text-slate-800 font-medium">{d.description}</span>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                d.type === 'CONFIRMED'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {d.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Treatment Plan Section */}
                  {selectedEncounter.treatmentPlan && (
                    <div className="mb-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Treatment Plan & Prescriptions
                      </h3>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded border mb-2">
                        {selectedEncounter.treatmentPlan.instructions}
                      </p>
                      {selectedEncounter.treatmentPlan.prescriptions &&
                        selectedEncounter.treatmentPlan.prescriptions.length > 0 && (
                          <div className="space-y-1">
                            {selectedEncounter.treatmentPlan.prescriptions.map(
                              (p: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 rounded bg-blue-50/50 border border-blue-100 text-xs"
                                >
                                  <span className="font-semibold text-slate-800 flex items-center">
                                    <Pill className="w-3.5 h-3.5 text-blue-600 mr-1.5" />
                                    {p.medicationName} ({p.dosage})
                                  </span>
                                  <span className="text-[11px] text-slate-600">
                                    {p.frequency} • {p.duration}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Addenda Card */}
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center">
                      <ShieldAlert className="w-4 h-4 text-indigo-600 mr-2" />
                      Addenda & Amendments ({selectedEncounter.addenda?.length || 0})
                    </h3>
                    <span className="text-[11px] text-slate-500">Append-Only Legal Trail</span>
                  </div>

                  {selectedEncounter.addenda?.map((ad: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs"
                    >
                      <div className="flex items-center justify-between text-indigo-900 font-semibold mb-1">
                        <span>Reason: {ad.amendmentReason}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(ad.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-700">{ad.notes}</p>
                    </div>
                  ))}

                  {(selectedEncounter.status === 'SIGNED' ||
                    selectedEncounter.status === 'AMENDED') && (
                    <form onSubmit={handleAddAddendum} className="pt-3 border-t space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase">
                        Append Legal Addendum
                      </h4>
                      <input
                        type="text"
                        placeholder="Amendment reason..."
                        value={amendmentReason}
                        onChange={(e) => setAmendmentReason(e.target.value)}
                        className="w-full text-xs rounded-md border-slate-300 p-2 border"
                        required
                      />
                      <textarea
                        rows={2}
                        placeholder="Addendum notes..."
                        value={addendumNotes}
                        onChange={(e) => setAddendumNotes(e.target.value)}
                        className="w-full text-xs rounded-md border-slate-300 p-2 border"
                        required
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSubmittingAddendum}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-medium flex items-center"
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Append Addendum
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-12 bg-white rounded-lg border text-center text-xs text-slate-400">
                Select an encounter from the left to inspect records.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: ALLERGIES & ADVERSE DRUG REACTIONS
          ========================================================================= */}
      {activeTab === 'allergies' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center">
              <AlertCircle className="w-4 h-4 text-red-600 mr-2" /> Record Patient Allergy
            </h2>
            <form onSubmit={handleCreateAllergy} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patient Profile ID
                </label>
                <input
                  type="text"
                  value={allergyPatientId}
                  onChange={(e) => setAllergyPatientId(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="Patient ID..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Allergen Name
                </label>
                <input
                  type="text"
                  value={allergen}
                  onChange={(e) => setAllergen(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="e.g. Penicillin, Peanuts, Latex"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Reaction Description
                </label>
                <input
                  type="text"
                  value={allergyReaction}
                  onChange={(e) => setAllergyReaction(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="e.g. Anaphylaxis, Rash, Angioedema"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Clinical Severity
                </label>
                <select
                  value={allergySeverity}
                  onChange={(e) => setAllergySeverity(e.target.value as any)}
                  className="w-full text-xs rounded border p-2"
                >
                  <option value="MILD">Mild</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                  <option value="LIFE_THREATENING">Life-Threatening (Critical)</option>
                </select>
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="adr"
                  checked={isAdverseDrugReaction}
                  onChange={(e) => setIsAdverseDrugReaction(e.target.checked)}
                  className="rounded text-teal-600"
                />
                <label htmlFor="adr" className="text-xs text-slate-700 font-medium">
                  Adverse Drug Reaction (ADR)
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm"
              >
                Record Allergy
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Patient Allergy & ADR Registry ({allergies.length})
              </h2>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {allergies.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No allergies recorded.</div>
              ) : (
                allergies.map((a) => (
                  <div
                    key={a._id}
                    className={`p-4 flex items-center justify-between ${
                      a.severity === 'LIFE_THREATENING'
                        ? 'bg-red-50/70 border-l-4 border-red-600'
                        : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900">{a.allergen}</span>
                        {a.isAdverseDrugReaction && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 font-semibold px-2 py-0.5 rounded">
                            DRUG ALLERGY
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            a.severity === 'LIFE_THREATENING'
                              ? 'bg-red-600 text-white animate-pulse'
                              : a.severity === 'SEVERE'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {a.severity.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-1">Reaction: {a.reaction}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Patient ID: {a.patientId}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: VACCINATIONS & IMMUNIZATION TRACKER
          ========================================================================= */}
      {activeTab === 'vaccinations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center">
              <Syringe className="w-4 h-4 text-teal-600 mr-2" /> Record Immunization
            </h2>
            <form onSubmit={handleCreateVaccination} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patient Profile ID
                </label>
                <input
                  type="text"
                  value={vaxPatientId}
                  onChange={(e) => setVaxPatientId(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="Patient ID..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Vaccine Name
                </label>
                <input
                  type="text"
                  value={vaccineName}
                  onChange={(e) => setVaccineName(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="e.g. Hepatitis B, MMR, COVID-19 mRNA"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Batch / Lot Number
                </label>
                <input
                  type="text"
                  value={vaxBatch}
                  onChange={(e) => setVaxBatch(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="Batch #..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Administered Date
                </label>
                <input
                  type="date"
                  value={vaxDate}
                  onChange={(e) => setVaxDate(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Next Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={vaxNextDue}
                  onChange={(e) => setVaxNextDue(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-sm"
              >
                Record Immunization
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Immunization Records ({vaccinations.length})
              </h2>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {vaccinations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No vaccinations recorded.
                </div>
              ) : (
                vaccinations.map((v) => (
                  <div key={v._id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900">{v.vaccineName}</span>
                        {v.batchNumber && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                            Lot: {v.batchNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Administered: {new Date(v.administeredDate).toLocaleDateString()}
                      </div>
                      {v.nextDueDate && (
                        <div className="text-[11px] text-teal-700 font-medium mt-0.5">
                          Next Booster Due: {new Date(v.nextDueDate).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: FAMILY MEDICAL HISTORY
          ========================================================================= */}
      {activeTab === 'familyHistory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 border-b pb-2 flex items-center">
              <Users className="w-4 h-4 text-teal-600 mr-2" /> Add Family Medical History
            </h2>
            <form onSubmit={handleCreateFamilyHistory} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patient Profile ID
                </label>
                <input
                  type="text"
                  value={famPatientId}
                  onChange={(e) => setFamPatientId(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="Patient ID..."
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Relationship
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                >
                  <option value="FATHER">Father</option>
                  <option value="MOTHER">Mother</option>
                  <option value="BROTHER">Brother</option>
                  <option value="SISTER">Sister</option>
                  <option value="PATERNAL_GRANDFATHER">Paternal Grandfather</option>
                  <option value="MATERNAL_GRANDMOTHER">Maternal Grandmother</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Medical Condition
                </label>
                <input
                  type="text"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full text-xs rounded border p-2"
                  placeholder="e.g. Type 2 Diabetes, Coronary Artery Disease"
                  required
                />
              </div>
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-semibold text-slate-700">Hereditary Risk Flags:</span>
                <div className="grid grid-cols-2 gap-1 text-xs text-slate-600">
                  <label className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={hasDiabetes}
                      onChange={(e) => setHasDiabetes(e.target.checked)}
                    />
                    <span>Diabetes</span>
                  </label>
                  <label className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={hasHypertension}
                      onChange={(e) => setHasHypertension(e.target.checked)}
                    />
                    <span>Hypertension</span>
                  </label>
                  <label className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={hasCancer}
                      onChange={(e) => setHasCancer(e.target.checked)}
                    />
                    <span>Cancer</span>
                  </label>
                  <label className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={hasCardiacDisease}
                      onChange={(e) => setHasCardiacDisease(e.target.checked)}
                    />
                    <span>Cardiac Disease</span>
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-semibold shadow-sm"
              >
                Save Family Record
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Hereditary Family History ({familyHistories.length})
              </h2>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {familyHistories.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No family records found.
                </div>
              ) : (
                familyHistories.map((f) => (
                  <div key={f._id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900">{f.condition}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                          {f.relationship}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        {f.hasDiabetes && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">
                            Diabetes
                          </span>
                        )}
                        {f.hasHypertension && (
                          <span className="text-[9px] bg-red-100 text-red-800 px-1.5 py-0.2 rounded font-semibold">
                            Hypertension
                          </span>
                        )}
                        {f.hasCardiacDisease && (
                          <span className="text-[9px] bg-purple-100 text-purple-800 px-1.5 py-0.2 rounded font-semibold">
                            Cardiac
                          </span>
                        )}
                        {f.hasCancer && (
                          <span className="text-[9px] bg-pink-100 text-pink-800 px-1.5 py-0.2 rounded font-semibold">
                            Cancer
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: LONGITUDINAL PATIENT TIMELINE
          ========================================================================= */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex items-center gap-4">
            <input
              type="text"
              placeholder="Enter Patient Profile ID..."
              value={filterPatientId}
              onChange={(e) => setFilterPatientId(e.target.value)}
              className="flex-1 text-xs rounded border p-2"
            />
            <button
              onClick={handleLoadTimeline}
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded text-xs font-semibold shadow-sm hover:bg-teal-700"
            >
              {loading ? 'Aggregating Timeline...' : 'Load Patient EMR Timeline'}
            </button>
          </div>

          {timelineData && (
            <div className="space-y-6">
              {/* Summary Dashboard */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-lg border shadow-sm">
                  <div className="text-[11px] text-slate-500 font-semibold">Total Encounters</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1">
                    {timelineData.summary.totalEncounters}
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg border shadow-sm">
                  <div className="text-[11px] text-slate-500 font-semibold">Active Diagnoses</div>
                  <div className="text-2xl font-bold text-teal-600 mt-1">
                    {timelineData.summary.activeDiagnosesCount}
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg border shadow-sm">
                  <div className="text-[11px] text-slate-500 font-semibold">Recorded Allergies</div>
                  <div className="text-2xl font-bold text-red-600 mt-1">
                    {timelineData.summary.activeAllergiesCount}
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg border shadow-sm">
                  <div className="text-[11px] text-slate-500 font-semibold">
                    Life-Threatening Alerts
                  </div>
                  <div className="text-2xl font-bold text-purple-600 mt-1">
                    {timelineData.summary.hasLifeThreateningAllergies ? 'YES (CRITICAL)' : 'NONE'}
                  </div>
                </div>
              </div>

              {/* Hereditary Risk Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Hereditary Disease Risk Assessment
                    </h4>
                    <p className="text-[11px] text-amber-700">
                      Based on recorded immediate family medical history.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {timelineData.summary.hereditaryRisks.hasDiabetesRisk && (
                    <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-semibold">
                      Elevated Diabetes Risk
                    </span>
                  )}
                  {timelineData.summary.hereditaryRisks.hasCardiacRisk && (
                    <span className="px-2 py-0.5 rounded bg-red-200 text-red-900 font-semibold">
                      Elevated Cardiac Risk
                    </span>
                  )}
                  {timelineData.summary.hereditaryRisks.hasHypertensionRisk && (
                    <span className="px-2 py-0.5 rounded bg-orange-200 text-orange-900 font-semibold">
                      Elevated Hypertension Risk
                    </span>
                  )}
                  {timelineData.summary.hereditaryRisks.hasCancerRisk && (
                    <span className="px-2 py-0.5 rounded bg-pink-200 text-pink-900 font-semibold">
                      Elevated Cancer Risk
                    </span>
                  )}
                </div>
              </div>

              {/* Chronological Encounter Timeline */}
              <div className="bg-white rounded-lg border shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-900 border-b pb-3 mb-4 flex items-center">
                  <History className="w-4 h-4 text-teal-600 mr-2" /> Chronological Clinical Events
                </h3>
                <div className="space-y-4">
                  {timelineData.encounters.map((enc: any) => (
                    <div
                      key={enc._id}
                      className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-900">
                            {enc.chiefComplaint}
                          </span>
                          {getStatusBadge(enc.status)}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Date: {new Date(enc.createdAt).toLocaleString()} • Attending Doctor ID:{' '}
                          {enc.doctorId}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600">
                        {enc.vitals && (
                          <span>
                            BP: {enc.vitals.systolicBp}/{enc.vitals.diastolicBp} | Pulse:{' '}
                            {enc.vitals.pulseRate} | BMI: {enc.vitals.bmi}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
