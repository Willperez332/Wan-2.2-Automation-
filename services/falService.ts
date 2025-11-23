import { ModelType } from "../types";
import { fileToBase64 } from "../utils";

export class FalService {
  
  // No constructor or config needed on frontend anymore!

  /**
   * Sends base64 data to our own server to handle the Fal upload.
   */
  private async uploadImage(base64: string): Promise<string> {
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ base64Data: base64 })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Upload failed');
        }

        const data = await response.json();
        return data.url;
    } catch (e: any) {
        console.error("Fal Service Upload Error:", e);
        throw e;
    }
  }

  async compositeProduct(avatarBase64: string, productBase64: string, prompt: string): Promise<string> {
    // 1. Upload the avatar first
    const avatarUrl = await this.uploadImage(`data:image/jpeg;base64,${avatarBase64}`);
    
    // 2. Ask server to run Flux
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: "fal-ai/flux/dev/image-to-image",
            input: {
                image_url: avatarUrl,
                prompt: `(Masterpiece), realistic photo, ${prompt}`,
                strength: 0.75,
                guidance_scale: 3.5,
            }
        })
    });

    if (!response.ok) throw new Error("Composite generation failed");
    
    const result = await response.json();
    if (result.images && result.images[0]) return result.images[0].url;
    throw new Error("No composite image returned");
  }

  async generateVideoFromImage(
    sourceImageUrlOrBase64: string,
    prompt: string
  ): Promise<string> {
    let imageUrl = sourceImageUrlOrBase64;

    // If it's raw base64, upload it first to get a URL
    if (!sourceImageUrlOrBase64.startsWith('http')) {
        imageUrl = await this.uploadImage(`data:image/jpeg;base64,${sourceImageUrlOrBase64}`);
    }

    // NOTE: Wan 2.2 Animate usually requires a 'video_url' or an image to animate.
    // Based on your request, we are just animating the avatar image for now.
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: ModelType.WAN,
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: imageUrl, 
                // video_url: "..." // TODO: In the future, pass the cut video clip URL here
                seconds: 5,
                aspect_ratio: "9:16" 
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