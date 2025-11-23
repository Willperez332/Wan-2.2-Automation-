import React, { useState, useEffect } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { AssetUploader } from './components/AssetUploader';
import { GeminiService } from './services/geminiService';
import { FalService } from './services/falService';
import { WorkflowState, ProcessedClip } from './types';
import { fileToBase64 } from './utils';

// ... (Keep your Icons here: VideoIcon, UserIcon, etc.) ...
// For brevity, assuming standard icons remain from previous file
const VideoIcon = () => <span>🎥</span>;
const UserIcon = () => <span>👤</span>;
const PackageIcon = () => <span>📦</span>;
const KeyIcon = () => <span>🔑</span>;
const WandIcon = () => <span>jh</span>;
const CheckIcon = () => <span>✅</span>;
const AlertIcon = () => <span>⚠️</span>;
const PlayIcon = () => <span>▶️</span>;

const getEnvApiKey = () => {
  try {
    // FIX: Look for GEMINI_API_KEY, not API_KEY
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
        // @ts-ignore
        return process.env.GEMINI_API_KEY;
    }
    return '';
  } catch (e) {
    return '';
  }
};

const App: React.FC = () => {
  const [state, setState] = useState<WorkflowState>({
    step: 'upload',
    originalVideo: null,
    avatarImage: null,
    productImage: null,
    geminiKey: getEnvApiKey(),
    falKey: 'SERVER_MANAGED', // FIX: Dummy value enables the button
    clips: [],
    isAnalyzing: false,
    analysisProgress: '',
  });

  const [geminiService, setGeminiService] = useState<GeminiService | null>(null);
  
  useEffect(() => {
    if (state.geminiKey) {
      setGeminiService(new GeminiService(state.geminiKey));
    }
  }, [state.geminiKey]);

  const handleAnalyze = async () => {
    if (!state.originalVideo || !geminiService) return;

    setState(prev => ({ ...prev, isAnalyzing: true, step: 'analyze', analysisProgress: 'Uploading to Gemini...' }));

    try {
      const result = await geminiService.analyzeVideoForClips(state.originalVideo);
      const newClips: ProcessedClip[] = result.segments.map((seg, idx) => ({
        id: `clip-${idx}`,
        startTime: seg.start_time_seconds,
        endTime: seg.end_time_seconds,
        description: seg.description,
        containsProduct: seg.product_visible,
        status: 'pending'
      }));

      setState(prev => ({ ...prev, clips: newClips, isAnalyzing: false, step: 'review' }));
    } catch (error) {
      console.error(error);
      alert('Analysis failed.');
      setState(prev => ({ ...prev, isAnalyzing: false, step: 'upload' }));
    }
  };

  const updateClipStatus = (id: string, status: ProcessedClip['status'], url?: string) => {
      setState(prev => ({
          ...prev,
          clips: prev.clips.map(c => c.id === id ? { ...c, status, generatedVideoUrl: url } : c)
      }));
  };

  const handleGenerate = async () => {
    // Initialize without keys (Server handles it)
    const falService = new FalService();
    setState(prev => ({ ...prev, step: 'generate' }));
    
    // @ts-ignore
    setState(prev => ({ ...prev, clips: prev.clips.map(c => ({...c, status: 'pending'})) }));

    const clipsToProcess = [...state.clips];

    for (let i = 0; i < clipsToProcess.length; i++) {
        const clip = clipsToProcess[i];
        updateClipStatus(clip.id, 'generating');

        try {
            if (!state.avatarImage) throw new Error("Avatar Required");
            
            const sourceImageBase64 = await fileToBase64(state.avatarImage);
            
            // SIMPLIFIED: Skip composite, just animate the avatar based on the clip description
            const videoUrl = await falService.generateVideoFromImage(
                sourceImageBase64, 
                clip.description
            );
            
            updateClipStatus(clip.id, 'completed', videoUrl);

        } catch (e: any) {
            console.error(`Clip ${clip.id} failed:`, e);
            updateClipStatus(clip.id, 'failed');
        }
    }
  };

  // ... Render logic remains the same, just update the button check ...
  // Ensure the button below uses state.geminiKey correctly

  return (
    <div className="min-h-screen bg-[#11111b] text-gray-200 font-sans">
      <header className="border-b border-gray-800 bg-[#11111b]/80 p-4">
          <div className="flex justify-between max-w-5xl mx-auto">
            <h1 className="font-bold text-xl">WANimate Automation</h1>
            <div className="text-green-500 text-sm border border-green-900 bg-green-900/20 px-3 py-1 rounded-full">
                System Ready
            </div>
          </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20 pt-10">
        <StepIndicator currentStep={state.step} />

        {state.step === 'upload' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <AssetUploader label="Video" subLabel="MP4" accept="video/*" file={state.originalVideo} onUpload={(f) => setState(p => ({...p, originalVideo: f}))} icon={<VideoIcon />} />
              <AssetUploader label="Avatar" subLabel="JPG" accept="image/*" file={state.avatarImage} onUpload={(f) => setState(p => ({...p, avatarImage: f}))} icon={<UserIcon />} />
              <AssetUploader label="Product" subLabel="PNG" accept="image/*" file={state.productImage} onUpload={(f) => setState(p => ({...p, productImage: f}))} icon={<PackageIcon />} />
            </div>
            <div className="flex justify-center">
              <button 
                onClick={handleAnalyze}
                // FIX: Check if geminiKey exists (it should from .env)
                disabled={!state.originalVideo || !state.geminiKey}
                className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Gemini Analysis
              </button>
            </div>
          </div>
        )}
        
        {/* ... (Analyze and Review steps remain standard) ... */}
        
        {state.step === 'analyze' && (
            <div className="text-center py-20">Analyzing... {state.analysisProgress}</div>
        )}

        {(state.step === 'review' || state.step === 'generate') && (
            <div>
                <div className="flex justify-between mb-4">
                    <h2 className="text-xl font-bold">Review Clips</h2>
                    {state.step === 'review' && (
                        <button onClick={handleGenerate} className="bg-teal-600 px-4 py-2 rounded text-white">
                            Generate All
                        </button>
                    )}
                </div>
                <div className="space-y-2">
                    {state.clips.map(clip => (
                        <div key={clip.id} className="bg-gray-800 p-4 rounded flex justify-between items-center">
                            <div>
                                <span className="text-teal-400 font-mono mr-4">{clip.startTime}s - {clip.endTime}s</span>
                                <span className="text-sm">{clip.description}</span>
                            </div>
                            <div className="text-xs">
                                {clip.status === 'completed' ? (
                                    <a href={clip.generatedVideoUrl} target="_blank" className="text-green-400 underline">View Video</a>
                                ) : (
                                    <span className={clip.status === 'failed' ? 'text-red-400' : 'text-gray-400'}>{clip.status}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;