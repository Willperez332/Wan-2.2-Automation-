import { ModelType } from "../types";
import { fileToBase64 } from "../utils";

export class FalService {
  
  async cutAndUploadVideo(videoFile: File, startTime: number, endTime: number): Promise<string> {
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

  // POLLING HELPER
  private async pollForVideo(requestId: string): Promise<string> {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    
    while (true) {
        const response = await fetch(`/api/status/${requestId}`);
        const status = await response.json();

        if (status.status === 'COMPLETED') {
            if (status.video?.url) return status.video.url; // For Wan
            if (status.images?.[0]?.url) return status.images[0].url; // For Flux
            throw new Error("Completed but no media found");
        }
        
        if (status.status === 'FAILED') {
            throw new Error(status.error || "Generation Failed");
        }

        // Wait 2 seconds before checking again
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

    // 1. Submit Job
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
    
    // 2. Poll for Result
    return await this.pollForVideo(request_id);
  }
}