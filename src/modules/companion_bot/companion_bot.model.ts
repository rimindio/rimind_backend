

export interface SimulatedFaceDetectionResult {
  faceDetected: boolean;
  position?: { x: number; y: number; width: number; height: number };
}

export interface SimulatedEmotionAnalysisResult {
  emotion: 'happy' | 'sad' | 'neutral' | 'angry' | 'surprised';
  confidence: number;
}

export interface DialogueResponse {
  text: string;
  visualFeedback: 'smile' | 'frown' | 'neutral' | 'blink';
}

export interface SimulatedDataPayload {
  value: any; 
}

export interface CompanionBotMessage {
  type: 'face_detection' | 'emotion_analysis' | 'dialogue' | 'visual_feedback' | 'data';
  payload: SimulatedFaceDetectionResult | SimulatedEmotionAnalysisResult | DialogueResponse | SimulatedDataPayload;
}