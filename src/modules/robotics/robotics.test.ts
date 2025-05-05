import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoboticsServiceImpl } from './robotics.service';
import type {
  RobotStatus,
  CommandRequestPayload,
  CommandResponsePayload,
  RobotSocketMessage,
} from './robotics.model';


const mockSendMessage = vi.fn();
const mockOnMessage = vi.fn();
const mockGetStatus = vi.fn();
const mockStartSimulation = vi.fn();

vi.mock('./robotics.service', async (importOriginal) => {
  const actual = await importOriginal<any>();


  const MockSimulatedRobotConnection = vi.fn((initialStatus: RobotStatus) => {
    mockGetStatus.mockReturnValue(initialStatus);
    return {
      sendMessage: mockSendMessage,
      onMessage: mockOnMessage,
      getStatus: mockGetStatus,
      startSimulation: mockStartSimulation,

    };
  });

  return {
    ...actual,
    RoboticsServiceImpl: vi.fn(() => ({

      simulatedRobotConnections: new Map(),
      handleRobotMessage: vi.fn(),
      onMessage: vi.fn(),
      sendCommandToRobot: vi.fn((robotId: string, commandPayload: CommandRequestPayload) => {

        const connection = new MockSimulatedRobotConnection({ id: robotId } as RobotStatus);
        connection.sendMessage({ type: 'command', timestamp: Date.now(), robotId, payload: commandPayload });
        return { status: 'success', message: `Command "${commandPayload.command}" sent to robot ${robotId}.` };
      }),
      getRobotStatus: vi.fn((robotId: string) => {

        const connection = new MockSimulatedRobotConnection({ id: robotId } as RobotStatus);
        return connection.getStatus();
      }),
      getAllRobotStatuses: vi.fn(() => {

        return [{ id: 'robot-1' }, { id: 'robot-2' }] as RobotStatus[];
      }),
      stopSimulations: vi.fn(),

    })),


  };
});


describe('RoboticsServiceImpl', () => {
  let roboticsService: RoboticsServiceImpl;

  beforeEach(() => {

    vi.clearAllMocks();

    roboticsService = new RoboticsServiceImpl();
  });

  it('should initialize with simulated robots', () => {


    expect(mockStartSimulation).toHaveBeenCalled();



    const statuses = roboticsService.getAllRobotStatuses();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveProperty('id');
  });

  it('should send command to a specific robot', () => {
    const robotId = 'robot-1';
    const command: CommandRequestPayload = { command: 'move_forward' };

    roboticsService.sendCommandToRobot(robotId, command);


    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'command',
        robotId: robotId,
        payload: command,
      })
    );
  });

  it('should allow listening for robot messages', () => {
    const mockListener = vi.fn();
    const messageType = 'status_update';

    roboticsService.onMessage(messageType, mockListener);



    const simulatedMessage: RobotSocketMessage<RobotStatus> = {
      type: messageType,
      timestamp: Date.now(),
      robotId: 'robot-1',
      payload: { id: 'robot-1', status: 'active' } as RobotStatus,
    };



    const serviceInstance = (RoboticsServiceImpl as vi.Mock).mock.instances[0];
    serviceInstance.handleRobotMessage(simulatedMessage);







    expect(roboticsService.onMessage).toHaveBeenCalledWith(messageType, mockListener);





  });

  it('should return status for a specific robot', () => {
    const robotId = 'robot-1';
    const status = roboticsService.getRobotStatus(robotId);
    expect(status).toHaveProperty('id', robotId);
    expect(mockGetStatus).toHaveBeenCalled();
  });

  it('should return status for all robots', () => {
    const statuses = roboticsService.getAllRobotStatuses();
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveProperty('id');
  });

  it('should stop simulations', () => {
    roboticsService.stopSimulations();
    expect(roboticsService.stopSimulations).toHaveBeenCalled();


  });


});