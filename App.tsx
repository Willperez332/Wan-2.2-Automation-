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

// Safely get environment variable
const getEnvApiKey = () => {
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        // @ts-ignore
        return process.env.API_KEY;
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
    falKey: '',
    clips: [],
    isAnalyzing: false,
    analysisProgress: '',
  });

  const [geminiService, setGeminiService] = useState<GeminiService | null>(null);
  
  // Initialize services when keys change
  useEffect(() => {
    if (state.geminiKey) {
      setGeminiService(new GeminiService(state.geminiKey));
    }
  }, [state.geminiKey]);

  // Handle Analysis Step
  const handleAnalyze = async () => {
    if (!state.originalVideo || !geminiService) return;

    setState(prev => ({ ...prev, isAnalyzing: true, step: 'analyze', analysisProgress: 'Uploading video to Gemini Context...' }));

    try {
      // 1. Send Video to Gemini for Multimodal Analysis
      setState(prev => ({ ...prev, analysisProgress: 'Gemini is watching and segmenting video...' }));
      const result = await geminiService.analyzeVideoForClips(state.originalVideo);

      // 2. Map result to clips
      const newClips: ProcessedClip[] = result.segments.map((seg, idx) => ({
        id: `clip-${idx}`,
        startTime: seg.start_time_seconds,
        endTime: seg.end_time_seconds,
        description: seg.description,
        containsProduct: seg.product_visible,
        status: 'pending'
      }));

      setState(prev => ({ 
        ...prev, 
        clips: newClips, 
        isAnalyzing: false, 
        step: 'review' 
      }));

    } catch (error) {
      console.error(error);
      alert('Analysis failed. Check API Keys and console.');
      setState(prev => ({ ...prev, isAnalyzing: false, step: 'upload' }));
    }
  };

  const updateClipStatus = (id: string, status: ProcessedClip['status'], url?: string) => {
      setState(prev => ({
          ...prev,
          clips: prev.clips.map(c => c.id === id ? { ...c, status, generatedVideoUrl: url } : c)
      }));
  };

  // Handle Generation Trigger
  const handleGenerate = async () => {
    if (!state.falKey) {
        alert("Please provide a Fal.ai API Key in the menu top right.");
        return;
    }
    const falService = new FalService(state.falKey);

    setState(prev => ({ ...prev, step: 'generate' }));
    
    // Reset statuses for generation run
    // @ts-ignore
    setState(prev => ({ ...prev, clips: prev.clips.map(c => ({...c, status: 'pending'})) }));

    // Loop through clips
    const clipsToProcess = [...state.clips];

    for (let i = 0; i < clipsToProcess.length; i++) {
        const clip = clipsToProcess[i];
        updateClipStatus(clip.id, 'generating');

        try {
            let sourceImageBase64 = '';
            let finalPrompt = clip.description;

            // LOGIC A: Clip contains product (Transition/Nano Banana Step)
            if (clip.containsProduct && state.productImage && state.avatarImage && geminiService) {
                 // 1. Get base assets
                 const avatarB64 = await fileToBase64(state.avatarImage);
                 const productB64 = await fileToBase64(state.productImage);
                 
                 // 2. Nano Banana Composition (Gemini)
                 try {
                     const compositeImage = await geminiService.compositeProductIntoFrame(avatarB64, productB64);
                     sourceImageBase64 = compositeImage;
                 } catch (geminiError: any) {
                     // FALLBACK: If Gemini 3 Pro (Nano Banana) fails - likely due to permission/tier
                     console.warn(`Nano Banana Composite failed for ${clip.id}, falling back to Avatar + Text Prompt.`, geminiError);
                     
                     // Use original avatar
                     sourceImageBase64 = avatarB64;
                     
                     // Modify prompt to include product
                     const productName = state.productImage.name.split('.')[0];
                     finalPrompt = `${clip.description}, holding a ${productName} product`;
                 }
            } 
            // LOGIC B: Standard Clip (Just Avatar)
            else if (state.avatarImage) {
                 sourceImageBase64 = await fileToBase64(state.avatarImage);
            } else {
                throw new Error("Avatar image is required for generation.");
            }

            // 3. Call Fal.ai (Wan 2.2)
            const videoUrl = await falService.generateVideoFromImage(sourceImageBase64, finalPrompt);
            
            updateClipStatus(clip.id, 'completed', videoUrl);

        } catch (e: any) {
            console.error(`Clip ${clip.id} failed:`, e);
            updateClipStatus(clip.id, 'failed');
        }
    }
  };

  return (
    <div className="min-h-screen bg-[#11111b] text-gray-200 font-sans selection:bg-brand-500/30">
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#11111b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold">W</div>
            <h1 className="font-bold text-xl tracking-tight">WANimate <span className="text-gray-500 font-normal">Automation</span></h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="relative group">
               <button className={`flex items-center gap-2 text-sm transition-colors border border-gray-700 rounded-full px-3 py-1 ${state.falKey ? 'text-brand-400 border-brand-500/50' : 'text-gray-400'}`}>
                 <KeyIcon />
                 <span>{state.falKey ? 'Keys Set' : 'Set Keys'}</span>
               </button>
               {/* Dropdown for keys */}
               <div className="absolute right-0 top-full mt-2 w-72 bg-dark-800 border border-gray-700 rounded-lg shadow-xl p-4 hidden group-hover:block z-50 animate-fade-in">
                 <div className="space-y-3">
                   <div>
                     <label className="text-xs text-gray-500 block mb-1">Gemini API Key</label>
                     <input 
                        type="password" 
                        value={state.geminiKey} 
                        onChange={e => setState(p => ({...p, geminiKey: e.target.value}))}
                        className="w-full bg-black/20 border border-gray-700 rounded px-2 py-1 text-sm focus:border-brand-500 outline-none text-white"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-gray-500 block mb-1">Fal.ai API Key</label>
                     <input 
                        type="password" 
                        value={state.falKey} 
                        onChange={e => setState(p => ({...p, falKey: e.target.value}))}
                        placeholder="fal_..."
                        className="w-full bg-black/20 border border-gray-700 rounded px-2 py-1 text-sm focus:border-brand-500 outline-none text-white"
                     />
                   </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20">
        
        <StepIndicator currentStep={state.step} />

        {/* STEP 1: UPLOAD */}
        {state.step === 'upload' && (
          <div className="space-y-8 animate-fade-in">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-3xl font-bold text-white">Project Assets</h2>
              <p className="text-gray-400 max-w-lg mx-auto">Upload the original UGC video, the AI avatar you want to insert, and the product image for Nano Banana composition.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <AssetUploader 
                label="Original Video" 
                subLabel="MP4 (1080x1920 preferred)" 
                accept="video/*" 
                file={state.originalVideo}
                onUpload={(f) => setState(p => ({...p, originalVideo: f}))}
                icon={<VideoIcon />}
              />
              <AssetUploader 
                label="AI Avatar" 
                subLabel="JPG Reference" 
                accept="image/*" 
                file={state.avatarImage}
                onUpload={(f) => setState(p => ({...p, avatarImage: f}))}
                icon={<UserIcon />}
              />
              <AssetUploader 
                label="Product Image" 
                subLabel="Transparent PNG" 
                accept="image/*" 
                file={state.productImage}
                onUpload={(f) => setState(p => ({...p, productImage: f}))}
                icon={<PackageIcon />}
              />
            </div>

            <div className="flex justify-center mt-10">
              <button 
                onClick={handleAnalyze}
                disabled={!state.originalVideo || !state.geminiKey}
                className="bg-brand-600 hover:bg-brand-500 text-white font-medium px-8 py-3 rounded-full shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <WandIcon />
                Start Gemini Analysis
              </button>
            </div>
            {!state.geminiKey && (
               <p className="text-center text-red-400 text-sm mt-2">Please enter Gemini API Key in the top right menu.</p>
            )}
          </div>
        )}

        {/* STEP 2: ANALYZE LOADING */}
        {state.step === 'analyze' && (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-brand-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                 <span className="text-2xl">🧠</span>
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Analyzing Footage</h3>
            <p className="text-gray-400">{state.analysisProgress}</p>
            <div className="mt-8 max-w-md text-center text-sm text-gray-500 bg-dark-800 p-4 rounded-lg border border-gray-700">
               <span className="text-brand-400 font-bold">Logic:</span> Gemini Flash 2.5 is watching the video to identify natural cuts and product placement to optimize the Wan 2.2 generation prompts.
            </div>
          </div>
        )}

        {/* STEP 3 & 4: REVIEW & GENERATE */}
        {(state.step === 'review' || state.step === 'generate') && (
          <div className="animate-fade-in">
             <div className="flex items-center justify-between mb-6">
               <h2 className="text-2xl font-bold text-white">Analysis Results</h2>
               {state.step === 'review' && (
                 <button 
                   onClick={handleGenerate}
                   className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold px-6 py-2 rounded-lg flex items-center gap-2 shadow-lg hover:shadow-brand-500/20 transition-all"
                 >
                   <span>Generate All Clips (Wan 2.2)</span>
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                 </button>
               )}
             </div>

             <div className="bg-dark-800 rounded-2xl border border-gray-700 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-700 bg-dark-900/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  <div className="col-span-1">ID</div>
                  <div className="col-span-2">Time</div>
                  <div className="col-span-4">Scene Description</div>
                  <div className="col-span-1">Product?</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2">Result</div>
                </div>

                <div className="divide-y divide-gray-800">
                  {state.clips.map((clip) => (
                    <div key={clip.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                      <div className="col-span-1 font-mono text-gray-500 text-sm">#{clip.id.split('-')[1]}</div>
                      <div className="col-span-2 font-mono text-brand-400 text-sm">
                        {clip.startTime}s - {clip.endTime}s
                      </div>
                      <div className="col-span-4 text-sm text-gray-300">
                        {clip.description}
                      </div>
                      <div className="col-span-1">
                         {clip.containsProduct ? (
                           <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-900/30 text-green-400 text-xs border border-green-900">
                             Visible
                           </span>
                         ) : (
                           <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-gray-800 text-gray-500 text-xs border border-gray-700">
                             None
                           </span>
                         )}
                      </div>
                      <div className="col-span-2">
                        {clip.status === 'generating' && (
                          <div className="flex items-center gap-2">
                             <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-500 animate-pulse w-2/3"></div>
                             </div>
                             <span className="text-xs text-brand-400">Wan 2.1...</span>
                          </div>
                        )}
                        {clip.status === 'pending' && <span className="text-xs text-gray-500">Waiting</span>}
                        {clip.status === 'completed' && (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckIcon /> Done
                            </span>
                        )}
                        {clip.status === 'failed' && (
                            <span className="flex items-center gap-1 text-xs text-red-400">
                                <AlertIcon /> Failed
                            </span>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                          {clip.generatedVideoUrl && (
                              <a 
                                href={clip.generatedVideoUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded transition-colors"
                              >
                                  <PlayIcon /> View
                              </a>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
             </div>

             {/* Logic Explanation Box */}
             <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                      <WandIcon />
                   </div>
                   <h4 className="text-brand-400 font-bold mb-2 text-sm uppercase tracking-wide">Avatar Replacement (Wan 2.1)</h4>
                   <p className="text-sm text-gray-400 leading-relaxed">
                     Clips without the product will be sent to Fal.ai (Wan). The prompt will instruct the model to replace the original actor with your uploaded <span className="text-white font-semibold">Avatar</span> while maintaining the motion described by Gemini.
                   </p>
                </div>
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-10">
                      <PackageIcon />
                   </div>
                   <h4 className="text-brand-400 font-bold mb-2 text-sm uppercase tracking-wide">Nano Banana Product Insert</h4>
                   <p className="text-sm text-gray-400 leading-relaxed">
                     For clips marked "Visible", we use <span className="text-white font-semibold">Gemini 3 Pro</span> to composite the Product Image into the Avatar reference before generating the video. If Gemini fails (permission/access), we gracefully fallback to a text-based prompt instruction.
                   </p>
                </div>
             </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default App;