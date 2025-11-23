import { ModelType } from "../types";
import { fileToBase64 } from "../utils";

export class FalService {
  
  // Helper to call our new cutter endpoint
  async cutAndUploadVideo(videoFile: File, startTime: number, endTime: number): Promise<string> {
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('startTime', startTime.toString());
    formData.append('endTime', endTime.toString());

    const response = await fetch('/api/cut-and-upload', {
        method: 'POST',
        body: formData, // No JSON here, we are sending a raw file
    });

    if (!response.ok) throw new Error("Video cut failed");
    const data = await response.json();
    return data.url;
  }

  // ... existing compositeProduct / uploadImage functions ...
  private async uploadImage(base64: string): Promise<string> {
     // ... (Keep your existing uploadImage logic here) ...
     const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data: base64 })
     });
     if (!response.ok) throw new Error('Upload failed');
     const data = await response.json();
     return data.url;
  }

  async compositeProduct(avatarBase64: string, productBase64: string, prompt: string): Promise<string> {
     // ... (Keep your existing composite logic here) ...
     const avatarUrl = await this.uploadImage(`data:image/jpeg;base64,${avatarBase64}`);
     const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "fal-ai/flux/dev/image-to-image",
            input: { image_url: avatarUrl, prompt: prompt, strength: 0.75, guidance_scale: 3.5 }
        })
     });
     if (!response.ok) throw new Error("Composite generation failed");
     const result = await response.json();
     if (result.images && result.images[0]) return result.images[0].url;
     throw new Error("No composite image returned");
  }

  // UPDATED GENERATION FUNCTION
  async generateVideoFromImage(
    sourceImageBase64: string,
    prompt: string,
    videoGuidanceUrl: string // NEW PARAMETER
  ): Promise<string> {
    
    let imageUrl = sourceImageBase64;
    if (!sourceImageBase64.startsWith('http')) {
        imageUrl = await this.uploadImage(`data:image/jpeg;base64,${sourceImageBase64}`);
    }

    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: ModelType.WAN, // This is now the 'animate/move' model
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: imageUrl, 
                video_url: videoGuidanceUrl, // SEND THE CUT CLIP HERE
                // Optional parameters for better results:
                video_quality: "high",
                video_write_mode: "balanced"
            }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Video generation failed");
    }

    const result = await response.json();
    if (result.video?.url) return result.video.url;
    throw new Error("No video URL returned");
  }
}