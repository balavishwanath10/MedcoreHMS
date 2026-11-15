import { ApiResponse, HealthCheckData } from '@shared/types';

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
