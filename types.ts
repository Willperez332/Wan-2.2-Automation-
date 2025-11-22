export interface ProcessedClip {
  id: string;
  startTime: number;
  endTime: number;
  description: string;
  containsProduct: boolean;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  generatedVideoUrl?: string;
  thumbnail?: string; // Base64 or URL
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
  EDITING = 'gemini-3-pro-image-preview', // Nano Banana Pro equivalent
  WAN = 'fal-ai/wan/v2.1-14b' // Wan 2.1 14B endpoint
}

export interface AnalysisResult {
  segments: {
    start_time_seconds: number;
    end_time_seconds: number;
    description: string;
    product_visible: boolean;
  }[];
}