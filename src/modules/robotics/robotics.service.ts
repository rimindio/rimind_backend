import type {
  RobotStatus,
  RoboticsMetric,
  RobotSocketMessage,
  CommandRequestPayload,
  CommandResponsePayload,
  SensorDataPayload,
  ErrorMessage,
  RobotStatusMessage,
  RoboticsMetricMessage,
  CommandRequestMessage,
  CommandResponseMessage,
  SensorDataMessage,
} from './robotics.model';

class SimulatedRobotConnection {
  private status: RobotStatus;
  private messageHandlers: Map<string, (payload: any) => Promise<void> | void> = new Map();

  constructor(initialStatus: RobotStatus) {
    this.status = initialStatus;
    
    this.emitStatusUpdate();
  }

  public getStatus(): RobotStatus {
    return this.status;
  }

  
  public async receiveMessage(message: RobotSocketMessage): Promise<void> {
    console.log(`SimulatedRobotConnection (${this.status.id}) received message:`, message);
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      try {
        await handler(message.payload);
      } catch (error: any) {
        console.error(`Error handling message type ${message.type} for robot ${this.status.id}:`, error);
        this.sendError(`Error processing message: ${error.message}`);
      }
    } else {
      console.warn(`No handler for message type ${message.type} for robot ${this.status.id}`);
      this.sendError(`Unknown message type: ${message.type}`);
    }
  }

  
  public sendMessage(message: RobotSocketMessage): void {
    console.log(`SimulatedRobotConnection (${this.status.id}) sending message:`, message);
    
    
    if (message.type === 'command') {
      const commandPayload = message.payload as CommandRequestPayload;
      this.handleSimulatedCommand(commandPayload);
    }
  }

  
  public onMessage(type: string, handler: (payload: any) => Promise<void> | void): void {
    this.messageHandlers.set(type, handler);
  }

  
  private emitStatusUpdate(): void {
    const statusMessage: RobotSocketMessage<RobotStatus> = {
      type: 'status_update',
      timestamp: Date.now(),
      robotId: this.status.id,
      payload: this.status,
    };
    
    
    console.log(`SimulatedRobotConnection (${this.status.id}) emitting status update:`, statusMessage);
    
    roboticsServiceInstance?.handleRobotMessage(statusMessage);
  }

  
  private emitMetricUpdate(metric: RoboticsMetric): void {
    const metricMessage: RobotSocketMessage<RoboticsMetric> = {
      type: 'metric_update',
      timestamp: Date.now(),
      robotId: this.status.id,
      payload: metric,
    };
    console.log(`SimulatedRobotConnection (${this.status.id}) emitting metric update:`, metricMessage);
    
    roboticsServiceInstance?.handleRobotMessage(metricMessage);
  }

  
  private emitSensorData(sensorData: SensorDataPayload): void {
    const sensorMessage: RobotSocketMessage<SensorDataPayload> = {
      type: 'sensor_data',
      timestamp: Date.now(),
      robotId: this.status.id,
      payload: sensorData,
    };
    console.log(`SimulatedRobotConnection (${this.status.id}) emitting sensor data:`, sensorMessage);
    
    roboticsServiceInstance?.handleRobotMessage(sensorMessage);
  }

  
  private sendError(message: string, code: number = 500): void {
    const errorMessage: RobotSocketMessage<{ code: number; message: string }> = {
      type: 'error',
      timestamp: Date.now(),
      robotId: this.status.id,
      payload: { code, message },
    };
    console.error(`SimulatedRobotConnection (${this.status.id}) sending error:`, errorMessage);
    
    roboticsServiceInstance?.handleRobotMessage(errorMessage);
  }


  

  private handleSimulatedCommand(commandPayload: CommandRequestPayload): void {
    console.log(`Robot ${this.status.id} received command: ${commandPayload.command}`);
    let responseStatus: 'success' | 'error' = 'success';
    let responseMessage: string | undefined = undefined;

    switch (commandPayload.command) {
      case 'move_forward':
        
        this.status.position.x += 1;
        this.status.status = 'executing';
        this.status.task = 'Moving Forward';
        responseMessage = 'Moving forward.';
        break;
      case 'turn_left':
        
        this.status.orientation.z += 0.1; 
        this.status.status = 'executing';
        this.status.task = 'Turning Left';
        responseMessage = 'Turning left.';
        break;
      case 'turn_right':
        
        this.status.orientation.z -= 0.1; 
        this.status.status = 'executing';
        this.status.task = 'Turning Right';
        responseMessage = 'Turning right.';
        break;
      case 'stop':
        
        this.status.status = 'idle';
        this.status.task = null;
        responseMessage = 'Stopping.';
        break;
      default:
        responseStatus = 'error';
        responseMessage = `Unknown command: ${commandPayload.command}`;
        this.sendError(responseMessage, 400);
        return; 
    }

    
    setTimeout(() => {
      if (this.status.status === 'executing') {
         this.status.status = 'idle'; 
         this.status.task = null;
      }
      this.emitStatusUpdate(); 
      this.sendSimulatedCommandResponse(responseStatus, responseMessage);
    }, 1000); 

    
     if (this.status.status === 'executing') {
        const updateInterval = setInterval(() => {
            if (this.status.status !== 'executing') {
                clearInterval(updateInterval);
                return;
            }
            this.emitStatusUpdate();
            this.emitMetricUpdate({
                timestamp: Date.now(),
                robotId: this.status.id,
                metricName: 'motor_load',
                value: Math.random() * 0.8 + 0.2, 
            });
            this.emitSensorData({
                temperature: 20 + Math.random() * 5,
            });
        }, 500); 
     }
  }

  private sendSimulatedCommandResponse(status: 'success' | 'error', message?: string): void {
    const responseMessage: RobotSocketMessage<CommandResponsePayload> = {
      type: 'command_response',
      timestamp: Date.now(),
      robotId: this.status.id,
      payload: { status, message },
    };
    console.log(`SimulatedRobotConnection (${this.status.id}) sending command response:`, responseMessage);
    
    roboticsServiceInstance?.handleRobotMessage(responseMessage);
  }

  
  private simulateBattery(): void {
    setInterval(() => {
      if (this.status.isCharging) {
        this.status.batteryLevel = Math.min(100, this.status.batteryLevel + Math.random() * 1);
        if (this.status.batteryLevel >= 100) {
          this.status.isCharging = false;
          this.emitStatusUpdate();
        }
      } else {
        this.status.batteryLevel = Math.max(0, this.status.batteryLevel - Math.random() * 0.1);
        if (this.status.batteryLevel <= 10 && !this.status.isCharging) {
          this.status.isCharging = true;
          this.status.status = 'idle';
          this.status.task = 'Returning to Charge';
          this.emitStatusUpdate();
        }
      }
    }, 5000); 
  }

  
  private simulateRandomData(): void {
    setInterval(() => {
      this.emitMetricUpdate({
        timestamp: Date.now(),
        robotId: this.status.id,
        metricName: Math.random() > 0.5 ? 'cpu_usage' : 'memory_usage',
        value: Math.random() * 100,
      });
      this.emitSensorData({
        temperature: 20 + Math.random() * 10,
        humidity: 30 + Math.random() * 40,
        distance: Math.random() * 5,
      });
    }, 10000); 
  }

  public startSimulation(): void {
    this.simulateBattery();
    this.simulateRandomData();
  }
}


export class RoboticsServiceImpl {
  private simulatedRobotConnections: Map<string, SimulatedRobotConnection> = new Map();
  private messageListeners: Map<string, ((message: RobotSocketMessage) => void)[]> = new Map();

  constructor() {
    
    this.generateSimulatedRobots(3);
  }

  private generateSimulatedRobots(count: number): void {
    for (let i = 1; i <= count; i++) {
      const robotId = `robot-${i}`;
      const initialStatus: RobotStatus = {
        id: robotId,
        position: { x: Math.random() * 10, y: Math.random() * 10, z: Math.random() * 10 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        batteryLevel: Math.random() * 100,
        isCharging: false,
        status: 'idle',
        task: null,
        firmwareVersion: '1.0.' + Math.floor(Math.random() * 10),
        lastMaintenanceDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const connection = new SimulatedRobotConnection(initialStatus);
      this.simulatedRobotConnections.set(robotId, connection);
      connection.startSimulation(); 
    }
  }

  
  public handleRobotMessage(message: RobotSocketMessage): void {
    console.log('RoboticsService received message from robot:', message);
    
    const listeners = this.messageListeners.get(message.type) || [];
    listeners.forEach(listener => listener(message));
    
    const genericListeners = this.messageListeners.get('message') || [];
    genericListeners.forEach(listener => listener(message));
  }

  
  public onMessage(type: string, listener: (message: RobotSocketMessage) => void): void {
    if (!this.messageListeners.has(type)) {
      this.messageListeners.set(type, []);
    }
    this.messageListeners.get(type)?.push(listener);
  }

  
  public sendCommandToRobot(robotId: string, commandPayload: CommandRequestPayload): CommandResponsePayload {
    const connection = this.simulatedRobotConnections.get(robotId);
    if (connection) {
      const commandMessage: RobotSocketMessage<CommandRequestPayload> = {
        type: 'command',
        timestamp: Date.now(),
        robotId: robotId,
        payload: commandPayload,
      };
      connection.sendMessage(commandMessage);
      
      
      
      return { status: 'success', message: `Command "${commandPayload.command}" sent to robot ${robotId}.` };
    } else {
      return { status: 'error', message: `Robot with ID ${robotId} not found.` };
    }
  }

  
  public getRobotStatus(robotId: string): RobotStatus | undefined {
    
    
    return this.simulatedRobotConnections.get(robotId)?.getStatus();
  }

  
  public getAllRobotStatuses(): RobotStatus[] {
    return Array.from(this.simulatedRobotConnections.values()).map(conn => conn.getStatus());
  }

  
  public getSensorData(robotId: string): SensorDataPayload | undefined {
     
     console.warn(`getSensorData for robot ${robotId} is simulated.`);
     return {
        temperature: 20 + Math.random() * 10,
        humidity: 30 + Math.random() * 40,
        distance: Math.random() * 5,
     };
  }

  
  public stopSimulations(): void {
    
    console.log('Stopping robot simulations.');
  }
}


const roboticsServiceInstance = new RoboticsServiceImpl();
export { roboticsServiceInstance as RoboticsService };