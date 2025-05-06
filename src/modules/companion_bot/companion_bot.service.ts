

import type {
  SimulatedFaceDetectionResult,
  SimulatedEmotionAnalysisResult,
  DialogueResponse,
  CompanionBotMessage,
} from './companion_bot.model';

export class CompanionBotService {
  private dialogueResponses: Record<string, DialogueResponse> = {
    hello: { text: 'Hello there!', visualFeedback: 'smile' },
    how_are_you: { text: "I'm doing well, thank you for asking.", visualFeedback: 'neutral' },
    goodbye: { text: 'Goodbye! It was nice talking to you.', visualFeedback: 'frown' },
    default: { text: 'That is interesting.', visualFeedback: 'blink' },
  };

  public simulateFaceDetection(): SimulatedFaceDetectionResult {
    
    const faceDetected = true;
    const position = {
      x: Math.random() * 600,
      y: Math.random() * 400,
      width: 100 + Math.random() * 50,
      height: 100 + Math.random() * 50,
    };
    return { faceDetected, position };
  }

  public simulateEmotionAnalysis(): SimulatedEmotionAnalysisResult {
    
    const emotions: ('happy' | 'sad' | 'neutral' | 'angry' | 'surprised')[] = [
      'happy',
      'sad',
      'neutral',
      'angry',
      'surprised',
    ];
    const emotion = emotions[Math.floor(Math.random() * emotions.length)]!;
    const confidence = Math.random(); 
    return { emotion, confidence };
  }

  public getDialogueResponse(input: string): DialogueResponse {
    
    const lowerInput = input.toLowerCase();
    if (lowerInput.includes('hello')) {
      return this.dialogueResponses['hello']!;
    } else if (lowerInput.includes('how are you')) {
      return this.dialogueResponses['how_are_you']!;
    } else if (lowerInput.includes('bye') || lowerInput.includes('goodbye')) {
      return this.dialogueResponses['goodbye']!;
    } else {
      return this.dialogueResponses['default']!;
    }
  }

  public simulateVisualFeedback(): DialogueResponse['visualFeedback'] {
    
    const feedbacks: DialogueResponse['visualFeedback'][] = ['smile', 'frown', 'neutral', 'blink'];
    return feedbacks[Math.floor(Math.random() * feedbacks.length)]!;
  }

  public processMessage(message: CompanionBotMessage): CompanionBotMessage | null {
    
    switch (message.type) {
      case 'dialogue':
        const dialogueInput = (message.payload as any).text; 
        const dialogueResponse = this.getDialogueResponse(dialogueInput);
        return { type: 'dialogue', payload: dialogueResponse };
      default:
        
        return null;
    }
  }

  public simulateComplexInteraction(message: CompanionBotMessage): DialogueResponse {
    
    let response: DialogueResponse;
    switch (message.type) {
      case 'dialogue':
        const text = (message.payload as any).text;
        if (text.toLowerCase().includes('weather')) {
          response = { text: 'Simulating weather report: It is sunny with a chance of simulated rain.', visualFeedback: 'neutral' };
        } else if (text.toLowerCase().includes('time')) {
          response = { text: `Simulating current time: The simulated time is ${new Date().toLocaleTimeString()}.`, visualFeedback: 'blink' };
        } else {
          response = { text: 'Simulating a complex response to your input.', visualFeedback: 'smile' };
        }
        break;
      case 'data':
        
        const value = (message.payload as any).value;
        response = { text: `Simulating processing data with value: ${value}.`, visualFeedback: 'neutral' };
        break;
      default:
        response = { text: 'Simulating a generic complex interaction.', visualFeedback: 'neutral' };
    }
    return response;
  }

  public simulateDataProcessing(data: any): { processed: boolean; result: any } {
    
    console.log('Simulating data processing for:', data);
    const processedResult = {
      original: data,
      processed: true,
      timestamp: new Date().toISOString(),
      simulatedAnalysis: 'This is a simulated analysis of the data.',
    };
    return { processed: true, result: processedResult };
  }
}