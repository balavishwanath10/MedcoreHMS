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
