import React, { useState, useEffect } from 'react';
import { StepIndicator } from './components/StepIndicator';
import { AssetUploader } from './components/AssetUploader';
import { GeminiService } from './services/geminiService';
import { FalService } from './services/falService';
import { WorkflowState, ProcessedClip } from './types';
import { fileToBase64 } from './utils';

// Icons
const VideoIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>;
const PackageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22v-9"/></svg>;
const KeyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>;
const WandIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h0"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg>;
const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const CheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const AlertIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;

const getEnvApiKey = () => {
  // Vite statically replaces 'process.env.GEMINI_API_KEY' with the actual string value at build time.
  // We do NOT check for 'process' existence because 'process' is not available in the browser.
  // @ts-ignore
  return process.env.GEMINI_API_KEY || '';
};

const App: React.FC = () => {
  const [state, setState] = useState<WorkflowState>({
    step: 'upload',
    originalVideo: null,
    avatarImage: null,
    productImage: null,
    geminiKey: getEnvApiKey(),
    falKey: 'SERVER_MANAGED', 
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
      alert('Analysis failed. Check console for details.');
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
            if (!state.originalVideo) throw new Error("Original Video Required");

            // 1. CUT THE VIDEO FIRST
            // This sends the full video + timestamps to server, gets back a Fal URL
            const cutVideoUrl = await falService.cutAndUploadVideo(
                state.originalVideo, 
                clip.startTime, 
                clip.endTime
            );

            const sourceImageBase64 = await fileToBase64(state.avatarImage);
            
            // 2. GENERATE USING THE CUT CLIP
            const videoUrl = await falService.generateVideoFromImage(
                sourceImageBase64, 
                clip.description,
                cutVideoUrl // Pass the cut video
            );
            
            updateClipStatus(clip.id, 'completed', videoUrl);

        } catch (e: any) {
            console.error(`Clip ${clip.id} failed:`, e);
            updateClipStatus(clip.id, 'failed');
        }
    }
  };

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
                disabled={!state.originalVideo}
                className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-3 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Gemini Analysis
              </button>
            </div>
          </div>
        )}
        
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