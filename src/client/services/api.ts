import { ApiResponse, HealthCheckData, IHospital, IDepartment } from '@shared/types';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('medcore_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchHealth(): Promise<HealthCheckData> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  const result: ApiResponse<HealthCheckData> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to parse health response');
  }
  return result.data;
}

export async function fetchHospitals(): Promise<IHospital[]> {
  const response = await fetch('/api/hospitals', {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<IHospital[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch hospitals');
  }
  return result.data;
}

export async function createHospital(data: any): Promise<IHospital> {
  const response = await fetch('/api/hospitals', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<IHospital> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create hospital');
  }
  return result.data;
}

export async function updateHospitalStatus(id: string, status: string): Promise<IHospital> {
  const response = await fetch(`/api/hospitals/${id}/status`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const result: ApiResponse<IHospital> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to update hospital status');
  }
  return result.data;
}

export async function fetchDepartments(hospitalId?: string): Promise<IDepartment[]> {
  const url = hospitalId ? `/api/departments?hospitalId=${hospitalId}` : '/api/departments';
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<IDepartment[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch departments');
  }
  return result.data;
}

export async function createDepartment(data: any): Promise<IDepartment> {
  const response = await fetch('/api/departments', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<IDepartment> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create department');
  }
  return result.data;
}

export async function fetchDoctors(departmentId?: string): Promise<any[]> {
  const url = departmentId ? `/api/doctors?departmentId=${departmentId}` : '/api/doctors';
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch doctors');
  }
  return result.data;
}

export async function createDoctor(data: any): Promise<any> {
  const response = await fetch('/api/doctors', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create doctor');
  }
  return result.data;
}

export async function fetchAvailability(doctorId?: string, dayOfWeek?: number): Promise<any[]> {
  const params = new URLSearchParams();
  if (doctorId) params.set('doctorId', doctorId);
  if (dayOfWeek !== undefined) params.set('dayOfWeek', String(dayOfWeek));

  const url = `/api/availability${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch availability schedules');
  }
  return result.data;
}

export async function createAvailability(data: any): Promise<any> {
  const response = await fetch('/api/availability', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create availability schedule');
  }
  return result.data;
}

export async function fetchAvailableSlots(doctorId: string, date: string): Promise<any> {
  const response = await fetch(`/api/availability/slots?doctorId=${doctorId}&date=${date}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to generate time slots');
  }
  return result.data;
}

export async function fetchAppointments(params?: Record<string, string>): Promise<any[]> {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const response = await fetch(`/api/appointments${query}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch appointments');
  }
  return result.data;
}

export async function createAppointment(data: any): Promise<any> {
  const response = await fetch('/api/appointments', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to book appointment');
  }
  return result.data;
}

export async function updateAppointmentStatus(
  id: string,
  status: string,
  reason?: string,
): Promise<any> {
  const response = await fetch(`/api/appointments/${id}/status`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, reason }),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to update appointment status');
  }
  return result.data;
}

// Day 11 EMR Encounter APIs
export async function calculateVitals(vitals: any): Promise<any> {
  const response = await fetch('/api/encounters/calculate-vitals', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(vitals),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to calculate vitals');
  }
  return result.data;
}

export async function fetchEncounters(params?: {
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
  status?: string;
}): Promise<any[]> {
  const query = new URLSearchParams();
  if (params?.patientId) query.append('patientId', params.patientId);
  if (params?.doctorId) query.append('doctorId', params.doctorId);
  if (params?.appointmentId) query.append('appointmentId', params.appointmentId);
  if (params?.status) query.append('status', params.status);

  const url = `/api/encounters${query.toString() ? `?${query.toString()}` : ''}`;
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch encounters');
  }
  return result.data;
}

export async function fetchEncounterById(id: string): Promise<any> {
  const response = await fetch(`/api/encounters/${id}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch encounter');
  }
  return result.data;
}

export async function createEncounter(data: any): Promise<any> {
  const response = await fetch('/api/encounters', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create encounter');
  }
  return result.data;
}

export async function updateEncounter(id: string, data: any): Promise<any> {
  const response = await fetch(`/api/encounters/${id}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to update encounter');
  }
  return result.data;
}

export async function signEncounter(id: string): Promise<any> {
  const response = await fetch(`/api/encounters/${id}/sign`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: true }),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to sign encounter');
  }
  return result.data;
}

export async function addEncounterAddendum(
  id: string,
  addendum: { amendmentReason: string; notes: string },
): Promise<any> {
  const response = await fetch(`/api/encounters/${id}/addendum`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(addendum),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to add addendum');
  }
  return result.data;
}

// Day 12 EMR Clinical History APIs (Allergies, Vaccinations, Family History, Timeline)
export async function createAllergy(data: any): Promise<any> {
  const response = await fetch('/api/emr/allergies', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to record allergy');
  }
  return result.data;
}

export async function fetchAllergies(patientId?: string): Promise<any[]> {
  const url = patientId ? `/api/emr/allergies?patientId=${patientId}` : '/api/emr/allergies';
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch allergies');
  }
  return result.data;
}

export async function createVaccination(data: any): Promise<any> {
  const response = await fetch('/api/emr/vaccinations', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to record vaccination');
  }
  return result.data;
}

export async function fetchVaccinations(patientId?: string): Promise<any[]> {
  const url = patientId ? `/api/emr/vaccinations?patientId=${patientId}` : '/api/emr/vaccinations';
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch vaccinations');
  }
  return result.data;
}

export async function createFamilyHistory(data: any): Promise<any> {
  const response = await fetch('/api/emr/family-history', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to record family history');
  }
  return result.data;
}

export async function fetchFamilyHistories(patientId?: string): Promise<any[]> {
  const url = patientId
    ? `/api/emr/family-history?patientId=${patientId}`
    : '/api/emr/family-history';
  const response = await fetch(url, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch family histories');
  }
  return result.data;
}

export async function fetchPatientTimeline(patientId: string): Promise<any> {
  const response = await fetch(`/api/emr/patients/${patientId}/timeline`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch patient timeline');
  }
  return result.data;
}

// =========================================================================
// Day 13: Prescription & Medicine APIs
// =========================================================================
export async function searchMedicines(
  searchTerm?: string,
  category?: string,
  form?: string,
): Promise<any[]> {
  const params = new URLSearchParams();
  if (searchTerm) params.append('search', searchTerm);
  if (category) params.append('category', category);
  if (form) params.append('form', form);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/medicines${query}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to search medicine formulary');
  }
  return result.data;
}

export async function fetchPrescriptions(patientId?: string, encounterId?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (patientId) params.append('patientId', patientId);
  if (encounterId) params.append('encounterId', encounterId);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/prescriptions${query}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch prescriptions');
  }
  return result.data;
}

export async function fetchPrescriptionById(id: string): Promise<any> {
  const response = await fetch(`/api/prescriptions/${id}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch prescription details');
  }
  return result.data;
}

export async function createPrescription(data: any): Promise<any> {
  const response = await fetch('/api/prescriptions', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to issue prescription');
  }
  return result.data;
}

export async function amendPrescription(id: string, data: any): Promise<any> {
  const response = await fetch(`/api/prescriptions/${id}/amend`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to amend prescription');
  }
  return result.data;
}

export async function signPrescription(id: string, signatureData?: string): Promise<any> {
  const response = await fetch(`/api/prescriptions/${id}/sign`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureData }),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to sign prescription');
  }
  return result.data;
}

export async function uploadDoctorSignature(
  doctorId: string,
  data: { signatureData: string; mimeType: string },
): Promise<any> {
  const response = await fetch(`/api/doctors/${doctorId}/signature`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to upload doctor signature');
  }
  return result.data;
}

export function getPrescriptionPdfUrl(id: string): string {
  return `/api/prescriptions/${id}/pdf`;
}

// Day 15 Laboratory Diagnostic APIs
export async function fetchLabTests(query?: string, category?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (category) params.append('category', category);

  const q = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/lab/tests${q}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch lab tests catalogue');
  }
  return result.data;
}

export async function createLabTest(data: any): Promise<any> {
  const response = await fetch('/api/lab/tests', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to create lab test');
  }
  return result.data;
}

export async function createLabOrder(data: any): Promise<any> {
  const response = await fetch('/api/lab/orders', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to place lab order');
  }
  return result.data;
}

export async function fetchLabOrders(params?: {
  status?: string;
  priority?: string;
  patientId?: string;
}): Promise<any[]> {
  const urlParams = new URLSearchParams();
  if (params?.status) urlParams.append('status', params.status);
  if (params?.priority) urlParams.append('priority', params.priority);
  if (params?.patientId) urlParams.append('patientId', params.patientId);

  const q = urlParams.toString() ? `?${urlParams.toString()}` : '';
  const response = await fetch(`/api/lab/orders${q}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch lab orders');
  }
  return result.data;
}

export async function fetchLabOrderById(id: string): Promise<any> {
  const response = await fetch(`/api/lab/orders/${id}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch lab order details');
  }
  return result.data;
}

export async function markLabSampleCollected(id: string, notes?: string): Promise<any> {
  const response = await fetch(`/api/lab/orders/${id}/sample-collected`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to update sample collection');
  }
  return result.data;
}

// Day 16 Structured Results & Clinical Review APIs
export async function submitLabResult(orderId: string, data: any): Promise<any> {
  const response = await fetch(`/api/lab/orders/${orderId}/results`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to submit lab results');
  }
  return result.data;
}

export async function reviewLabResult(
  id: string,
  data: { action: 'APPROVE' | 'REJECT'; notes?: string; reason?: string },
): Promise<any> {
  const response = await fetch(`/api/lab/results/${id}/review`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to process lab result review');
  }
  return result.data;
}

export async function fetchLabResults(params?: {
  orderId?: string;
  testId?: string;
  status?: string;
}): Promise<any[]> {
  const urlParams = new URLSearchParams();
  if (params?.orderId) urlParams.append('orderId', params.orderId);
  if (params?.testId) urlParams.append('testId', params.testId);
  if (params?.status) urlParams.append('status', params.status);

  const q = urlParams.toString() ? `?${urlParams.toString()}` : '';
  const response = await fetch(`/api/lab/results${q}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch lab results');
  }
  return result.data;
}

export async function fetchLabResultById(id: string): Promise<any> {
  const response = await fetch(`/api/lab/results/${id}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch lab result details');
  }
  return result.data;
}

// =========================================================================
// Day 17: Pharmacy Inventory & FIFO Dispensing APIs
// =========================================================================

export async function fetchBatches(params?: {
  medicineId?: string;
  status?: string;
  expiringWithinDays?: number;
}): Promise<any[]> {
  const urlParams = new URLSearchParams();
  if (params?.medicineId) urlParams.append('medicineId', params.medicineId);
  if (params?.status) urlParams.append('status', params.status);
  if (params?.expiringWithinDays)
    urlParams.append('expiringWithinDays', String(params.expiringWithinDays));

  const q = urlParams.toString() ? `?${urlParams.toString()}` : '';
  const response = await fetch(`/api/pharmacy/batches${q}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch inventory batches');
  }
  return result.data;
}

export async function fetchExpiringBatches(days: number = 30): Promise<any[]> {
  const response = await fetch(`/api/pharmacy/batches/expiring?days=${days}`, {
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  });
  const result: ApiResponse<any[]> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch expiring batches');
  }
  return result.data;
}

export async function addInventoryBatch(data: any): Promise<any> {
  const response = await fetch('/api/pharmacy/batches', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to add inventory batch');
  }
  return result.data;
}

export async function updateInventoryBatch(id: string, data: any): Promise<any> {
  const response = await fetch(`/api/pharmacy/batches/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to update inventory batch');
  }
  return result.data;
}

export async function quarantineBatch(id: string, reason: string): Promise<any> {
  const response = await fetch(`/api/pharmacy/batches/${id}/quarantine`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to quarantine batch');
  }
  return result.data;
}

export async function scanAndExpireBatches(): Promise<any> {
  const response = await fetch('/api/pharmacy/batches/scan-expired', {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to scan and expire batches');
  }
  return result.data;
}

export async function dispensePrescription(
  prescriptionId: string,
  data?: { items?: any[]; notes?: string },
): Promise<any> {
  const response = await fetch(`/api/pharmacy/dispense/${prescriptionId}`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
  const result: ApiResponse<any> = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to dispense prescription');
  }
  return result.data;
}
