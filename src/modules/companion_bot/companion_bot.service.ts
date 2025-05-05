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
}