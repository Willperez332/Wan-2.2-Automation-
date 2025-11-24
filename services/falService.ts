import { ModelType } from "../types";
import { fileToBase64 } from "../utils";
// FIX: Import the 'fal' object specifically
import { fal } from "@fal-ai/client"; 

export class FalService {
  
  // Initialize Fal with key from server to allow direct client-side uploads
  private async initFal() {
    try {
        const res = await fetch('/api/auth/key');
        const { key } = await res.json();
        // FIX: Use fal.config
        if (key) fal.config({ credentials: key });
    } catch (e) {
        console.error("Failed to fetch Fal key", e);
    }
  }

  async cutAndUploadVideo(videoFile: File, startTime: number, endTime: number): Promise<string> {
    await this.initFal();

    // FIX: Lower threshold to 1MB. 
    // This forces almost ALL uploads to go to Fal directly, ensuring we never hit 
    // the Proxy 413 limit on the server.
    const isLargeFile = videoFile.size > 1 * 1024 * 1024; 

    if (isLargeFile) {
        console.log(`📂 File is ${(videoFile.size / 1024 / 1024).toFixed(2)}MB. Uploading directly to Fal...`);
        
        try {
            // Direct upload to bypass Proxy
            const fullVideoUrl = await fal.storage.upload(videoFile);
            console.log("✅ Full video uploaded:", fullVideoUrl);

            // Send JSON (URL) to server
            // FIX: Corrected variable name and spacing here
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
                 // FIX: Corrected spacing here
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
        // ... (keep existing small file logic)
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
        const response = await fetch(`/api/status/${requestId}`);
        const status = await response.json();

        if (status.status === 'COMPLETED') {
            if (status.video?.url) return status.video.url;
            if (status.images?.[0]?.url) return status.images[0].url;
            throw new Error("Completed but no media found");
        }
        
        if (status.status === 'FAILED') {
            throw new Error(status.error || "Generation Failed");
        }
        await delay(2000);
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

    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: ModelType.WAN,
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
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