

import type { CompanionBotMessage } from './companion_bot.model';
import { CompanionBotService } from './companion_bot.service';
import { WebSocketServer, WebSocket } from 'ws';

export class CompanionBotController {
  private companionBotService: CompanionBotService;
  private wss: WebSocketServer;
  private connectedClients: WebSocket[] = [];

  constructor(port: number = 8080) {
    this.companionBotService = new CompanionBotService();
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('WebSocket client connected.');
      this.connectedClients.push(ws);

      ws.on('message', (message: string) => {
        console.log('WebSocket message received:', message);
        try {
          const parsedMessage: CompanionBotMessage = JSON.parse(message);
          const response = this.companionBotService.processMessage(parsedMessage);
          if (response) {
            this.sendMessage(ws, response);
          }
        } catch (error) {
          console.error('Failed to parse message or process:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected.');
        this.connectedClients = this.connectedClients.filter(client => client !== ws);
      });

      ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.connectedClients = this.connectedClients.filter(client => client !== ws);
      });

      
      
    });

    console.log(`WebSocket server started on port ${port}`);
  }

  private sendMessage(client: WebSocket, message: CompanionBotMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      console.log('WebSocket sending message:', message);
      client.send(JSON.stringify(message));
    }
  }

  private broadcast(message: CompanionBotMessage): void {
    console.log('WebSocket broadcasting message:', message);
    this.connectedClients.forEach((client) => {
      this.sendMessage(client, message);
    });
  }

  
  
  
  
  

  
  
  

  public simulateComplexInteractionTrigger(message: CompanionBotMessage): void {
    console.log('Triggering simulated complex interaction.');
    const response = this.companionBotService.simulateComplexInteraction(message);
    this.broadcast({ type: 'dialogue', payload: response }); 
  }

  public simulateDataProcessingTrigger(data: any): void {
    console.log('Triggering simulated data processing.');
    const result = this.companionBotService.simulateDataProcessing(data);
    
    
    console.log('Simulated data processing result:', result);
    this.broadcast({ type: 'dialogue', payload: { text: 'Simulated data processing complete.', visualFeedback: 'neutral' } });
  }
}