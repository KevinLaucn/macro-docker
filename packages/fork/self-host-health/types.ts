export type HealthStatus = 'ok' | 'warning' | 'critical' | 'disabled';

export type CheckCategory =
  | 'auth'
  | 'database'
  | 'storage'
  | 'queues'
  | 'gmail'
  | 'read_receipts'
  | 'dss'
  | 'services';

export interface HealthCheckItem {
  id: string;
  name: string;
  category: CheckCategory;
  status: HealthStatus;
  message: string;
  details?: string;
  remediation_hint?: string;
  duration_ms: number;
}

export interface SelfHostHealthReport {
  overall_status: HealthStatus;
  environment: string;
  is_production: boolean;
  last_checked_at: string;
  failure_since?: string;
  consecutive_failures: number;
  duration_ms: number;
  checks: HealthCheckItem[];
}
