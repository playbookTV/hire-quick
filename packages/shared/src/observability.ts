/** Admin monitoring contract. Provider secrets and raw event payloads never cross this boundary. */
export type MonitorStatus =
  | 'up'
  | 'down'
  | 'paused'
  | 'pending'
  | 'maintenance'
  | 'unknown'
  | 'unavailable'
  | 'not_configured';

export interface MonitorCheck {
  key: string;
  name: string;
  status: MonitorStatus;
  detail: string;
  checkedAt: string | null;
  lastSignalAt: string | null;
  intervalSeconds: number | null;
  graceSeconds: number | null;
}

export interface MonitoringSnapshot {
  observedAt: string;
  refreshAfterSeconds: number;
  environment: string;
  release: string | null;
  services: MonitorCheck[];
  betterStack: {
    checks: MonitorCheck[];
    dashboardUrl: string;
  };
  sentry: {
    status: 'connected' | 'not_configured' | 'unavailable';
    detail: string;
    checkedAt: string | null;
    dashboardUrl: string;
    projects: string[];
    issues: Array<{
      id: string;
      reference: string;
      project: string;
      level: string;
      events: number;
      lastSeen: string | null;
      url: string;
    }>;
  };
  logsUrl: string;
}
