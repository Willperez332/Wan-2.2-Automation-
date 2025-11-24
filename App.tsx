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
const UserProductIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/><rect x="14" y="14" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2"/></svg>;
const PackageIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22v-9"/></svg>;

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
    standardAvatar: null, // Default avatar (standing still)
    productAvatar: null,  // Avatar holding product
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
    
    // Validation: Ensure we have the necessary assets
    if (!state.standardAvatar || !state.productAvatar) {
        alert("Please upload both the Standard Avatar and the Avatar with Product.");
        return;
    }
    if (!state.originalVideo) {
        alert("Original Video is missing.");
        return;
    }

    setState(prev => ({ ...prev, step: 'generate' }));
    // @ts-ignore
    setState(prev => ({ ...prev, clips: prev.clips.map(c => ({...c, status: 'pending'})) }));

    const clipsToProcess = [...state.clips];

    for (let i = 0; i < clipsToProcess.length; i++) {
        const clip = clipsToProcess[i];
        updateClipStatus(clip.id, 'generating');

        try {
            // 1. CONTEXT-AWARE AVATAR SWITCHING
            // If Gemini detected a product in this segment, use the product-holding avatar.
            // Otherwise, use the standard avatar.
            const avatarToUse = clip.containsProduct ? state.productAvatar : state.standardAvatar;
            
            // 2. CUT THE VIDEO FIRST
            // This sends the full video + timestamps to server, gets back a Fal URL
            const cutVideoUrl = await falService.cutAndUploadVideo(
                state.originalVideo!, 
                clip.startTime, 
                clip.endTime
            );

            const sourceImageBase64 = await fileToBase64(avatarToUse!);
            
            // 3. GENERATE USING THE CUT CLIP AND SELECTED AVATAR
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
          <div className="flex justify-between max-w-6xl mx-auto">
            <h1 className="font-bold text-xl">WANimate Automation</h1>
            <div className="text-green-500 text-sm border border-green-900 bg-green-900/20 px-3 py-1 rounded-full">
                System Ready
            </div>
          </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pb-20 pt-10">
        <StepIndicator currentStep={state.step} />

        {state.step === 'upload' && (
          <div className="space-y-8">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <AssetUploader 
                label="Source Video" 
                subLabel="MP4 (Motion Reference)" 
                accept="video/*" 
                file={state.originalVideo} 
                onUpload={(f) => setState(p => ({...p, originalVideo: f}))} 
                icon={<VideoIcon />} 
              />
              <AssetUploader 
                label="Standard Avatar" 
                subLabel="Standing Still (JPG)" 
                accept="image/*" 
                file={state.standardAvatar} 
                onUpload={(f) => setState(p => ({...p, standardAvatar: f}))} 
                icon={<UserIcon />} 
              />
              <AssetUploader 
                label="Avatar w/ Product" 
                subLabel="Holding Product (JPG)" 
                accept="image/*" 
                file={state.productAvatar} 
                onUpload={(f) => setState(p => ({...p, productAvatar: f}))} 
                icon={<UserProductIcon />} 
              />
              <AssetUploader 
                label="Product Only" 
                subLabel="Reference (PNG)" 
                accept="image/*" 
                file={state.productImage} 
                onUpload={(f) => setState(p => ({...p, productImage: f}))} 
                icon={<PackageIcon />} 
              />
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
                            <div className="flex flex-col">
                                <div className="flex items-center gap-3">
                                    <span className="text-teal-400 font-mono">{clip.startTime}s - {clip.endTime}s</span>
                                    {clip.containsProduct && (
                                        <span className="bg-purple-900/50 text-purple-300 text-xs px-2 py-0.5 rounded border border-purple-800">
                                            Product Detected
                                        </span>
                                    )}
                                </div>
                                <span className="text-sm text-gray-300 mt-1">{clip.description}</span>
                                <span className="text-xs text-gray-500 mt-1">
                                    Using: {clip.containsProduct ? "Avatar w/ Product" : "Standard Avatar"}
                                </span>
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
