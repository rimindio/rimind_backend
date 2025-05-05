import { Router } from 'express';
import type { Request, Response } from 'express';
import { RoboticsService } from './robotics.service'; 
import type { RoboticsServiceImpl } from './robotics.service'; 
import type { CommandRequestPayload, CommandResponsePayload, SensorDataPayload, RobotStatus } from './robotics.model';

export class RoboticsController {
  public router = Router();
  private roboticsService: RoboticsServiceImpl;

  constructor(roboticsService: RoboticsServiceImpl) {
    this.roboticsService = roboticsService;
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.get('/status', this.getStatus.bind(this));
    this.router.post('/command', this.sendCommand.bind(this));
    this.router.get('/sensor/:robotId', this.getSensors.bind(this)); 
  }

  public getStatus(req: Request, res: Response<RobotStatus[]>): void {
    const statuses = this.roboticsService.getAllRobotStatuses();
    res.status(200).json(statuses);
  }

  public sendCommand(req: Request<any, any, { robotId: string; command: CommandRequestPayload }>, res: Response<CommandResponsePayload>): void {
    const { robotId, command } = req.body;
    if (!robotId || !command) {
      res.status(400).json({ status: 'error', message: 'Robot ID and command must be provided.' });
      return;
    }
    const result = this.roboticsService.sendCommandToRobot(robotId, command);
    res.status(result.status === 'success' ? 200 : 400).json(result);
  }

  public getSensors(req: Request<{ robotId: string }>, res: Response<SensorDataPayload | { status: string; message: string }>): void {
    const { robotId } = req.params; 
    if (!robotId) {
       res.status(400).json({ status: 'error', message: 'Robot ID must be provided in route parameters.' });
       return;
    }
    const sensors = this.roboticsService.getSensorData(robotId);
    if (sensors) {
      res.status(200).json(sensors);
    } else {
      res.status(404).json({ status: 'error', message: `Sensor data for robot ${robotId} not found.` });
    }
  }
}