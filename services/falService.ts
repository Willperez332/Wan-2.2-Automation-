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

    console.log("🔍 STARTING UPLOAD CHECK");
    console.log(`🔍 File Size: ${videoFile.size} bytes`);

    // FIX: Set threshold to 100 bytes to FORCE the large file path for EVERY video
    const isLargeFile = videoFile.size > 100; 
    console.log(`🔍 Taking Direct Upload Path? ${isLargeFile}`);

    if (isLargeFile) {
        console.log("🚀 PATH A: Direct Upload to Fal (Bypassing Proxy)");
        
        try {
            // 1. Upload to Fal directly
            const fullVideoUrl = await fal.storage.upload(videoFile);
            console.log("✅ Fal Upload Success:", fullVideoUrl);

            // 2. Send just the URL to your server
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
                 throw new Error(`Server Cut Error: ${response.status} ${errText}`);
            }
            
            const data = await response.json();
            return data.url;
        } catch (e: any) {
            console.error("❌ Direct Path Failed:", e);
            throw e;
        }

    } else {
        console.log("🐢 PATH B: Multipart Upload (Should not happen for videos)");
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

  // ... (Keep the rest of your methods: uploadImage, pollForVideo, generateVideoFromImage)
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
        if (status.status === 'FAILED') throw new Error(status.error || "Generation Failed");
        await delay(2000);
    }
  }

  async generateVideoFromImage(sourceImageBase64: string, prompt: string, videoGuidanceUrl: string): Promise<string> {
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