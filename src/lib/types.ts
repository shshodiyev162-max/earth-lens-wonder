export type User = {
  id: string;
  email: string;
  name?: string | null;
  createdAt?: string;
};

export type MissionProgress = {
  missionId: string;
  completed: boolean;
  updatedAt?: string;
};

export type AnalysisRecord = {
  id: string;
  createdAt: string;
  region: string;
  startDate: string;
  endDate: string;
  layerIds: string[];
  metricName: string;
  summary: string;
  riskLevel: string;
};

