


export interface RobotSocketMessage<T = any> {
  type: string; 
  timestamp: number;
  robotId: string;
  payload?: T; 
}


export interface RobotStatus {
  id: string;
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
  batteryLevel: number;
  isCharging: boolean;
  status: 'idle' | 'executing' | 'error' | 'active' | 'inactive';
  task: string | null;
  firmwareVersion?: string;
  lastMaintenanceDate?: string;
}


export interface RoboticsMetric {
  timestamp: number;
  robotId: string;
  metricName: string;
  value: number;
}


export interface CommandRequestPayload {
  command: 'move_forward' | 'turn_left' | 'turn_right' | 'stop' | string; 
  parameters?: any; 
}


export interface CommandResponsePayload {
  status: 'success' | 'error';
  message?: string;
  details?: any; 
}


export interface SensorDataPayload {
  temperature?: number;
  humidity?: number;
  distance?: number;
  [key: string]: any; 
}


export type RobotStatusMessage = RobotSocketMessage<RobotStatus>;
export type RoboticsMetricMessage = RobotSocketMessage<RoboticsMetric>;
export type CommandRequestMessage = RobotSocketMessage<CommandRequestPayload>;
export type CommandResponseMessage = RobotSocketMessage<CommandResponsePayload>;
export type SensorDataMessage = RobotSocketMessage<SensorDataPayload>;
export type ErrorMessage = RobotSocketMessage<{ code: number; message: string }>;


export type RobotMessage =
  | RobotStatusMessage
  | RoboticsMetricMessage
  | CommandRequestMessage
  | CommandResponseMessage
  | SensorDataMessage
  | ErrorMessage;