export interface ProcessedClip {
  id: string;
  startTime: number;
  endTime: number;
  description: string;
  containsProduct: boolean;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedVideoUrl?: string;
  thumbnail?: string;
  // NEW: Store the URL of the cut video clip here
  sourceVideoUrl?: string; 
}

export interface WorkflowState {
  step: 'upload' | 'analyze' | 'review' | 'generate';
  originalVideo: File | null;
  avatarImage: File | null;
  productImage: File | null;
  geminiKey: string;
  falKey: string;
  clips: ProcessedClip[];
  isAnalyzing: boolean;
  analysisProgress: string;
}

export enum ModelType {
  ANALYSIS = 'gemini-2.5-flash',
  EDITING = 'gemini-3-pro-image-preview', 
  // CORRECT MODEL for Video-to-Video
  WAN = 'fal-ai/wan/v2.2-14b/animate/move' 
}

export interface AnalysisResult {
  segments: {
    start_time_seconds: number;
    end_time_seconds: number;
    description: string;
    product_visible: boolean;
  }[];
}