import { ModelType } from "../types";
import { fileToBase64 } from "../utils";
import { fal } from "@fal-ai/client"; 

export class FalService {
  
  private async initFal() {
    try {
        const res = await fetch('/api/auth/key');
        const { key } = await res.json();
        if (key) fal.config({ credentials: key });
    } catch (e) {
        console.error("Failed to fetch Fal key", e);
    }
  }

  async cutAndUploadVideo(videoFile: File, startTime: number, endTime: number): Promise<string> {
    await this.initFal();

    // 1MB Threshold to force direct upload bypass
    const isLargeFile = videoFile.size > 1 * 1024 * 1024; 

    if (isLargeFile) {
        console.log(`📂 Large File (${(videoFile.size / 1024 / 1024).toFixed(2)}MB). Uploading directly to Fal...`);
        
        try {
            const fullVideoUrl = await fal.storage.upload(videoFile);
            console.log("✅ Fal Upload Success:", fullVideoUrl);

            const response = await fetch('/api/cut-and-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    videoUrl: fullVideoUrl,
                    startTime,
                    endTime
                })
            });

            if (!response.ok) {
                 const errText = await response.text();
                 throw new Error(`Server video cut failed: ${response.status} ${errText}`);
            }
            
            const data = await response.json();
            return data.url;
        } catch (e: any) {
            console.error("Direct Upload Flow Failed:", e);
            throw e;
        }

    } else {
        const formData = new FormData();
        formData.append('video', videoFile);
        formData.append('startTime', startTime.toString());
        formData.append('endTime', endTime.toString());

        const response = await fetch('/api/cut-and-upload', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error("Video cut failed");
        const data = await response.json();
        return data.url;
    }
  }

  private async uploadImage(base64: string): Promise<string> {
     const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data: base64 })
     });
     if (!response.ok) throw new Error('Upload failed');
     const data = await response.json();
     return data.url;
  }

  private async pollForVideo(requestId: string): Promise<string> {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    
    while (true) {
        // Include model param for the server
        const response = await fetch(`/api/status/${requestId}?model=${encodeURIComponent(ModelType.WAN)}`);
        
        if (!response.ok) {
            console.warn("Polling Server Error (Retrying...):", response.statusText);
            await delay(5000);
            continue;
        }

        const status = await response.json();

        if (status.status === 'COMPLETED') {
            // Server now fetches result for us, so video.url should be here
            if (status.video?.url) return status.video.url;
            if (status.output?.video?.url) return status.output.video.url; // Fallback check
            
            console.error("Full Response:", status);
            throw new Error("Completed but no video URL found in response");
        }
        
        if (status.status === 'FAILED') {
            throw new Error(status.error || "Generation Failed");
        }
        
        // Wait 5 seconds (Reduced polling frequency)
        await delay(5000);
    }
  }

  async generateVideoFromImage(
    sourceImageBase64: string,
    prompt: string, 
    videoGuidanceUrl: string
  ): Promise<string> {
    let imageUrl = sourceImageBase64;
    if (!sourceImageBase64.startsWith('http')) {
        imageUrl = await this.uploadImage(`data:image/jpeg;base64,${sourceImageBase64}`);
    }

    // FIX: Added 'prompt' back to satisfy 422 Validation Error
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: ModelType.WAN,
            input: {
                prompt: prompt || "A cinematic shot", // Fallback prompt
                image_url: imageUrl, 
                video_url: videoGuidanceUrl,
                video_quality: "high",
                video_write_mode: "balanced"
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Video generation failed");
    }

    const { request_id } = await response.json();
    return await this.pollForVideo(request_id);
  }
}