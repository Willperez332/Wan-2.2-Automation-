import { ModelType } from "../types";
import * as falModule from "@fal-ai/client";
import { base64ToBlob } from "../utils";

// 1. UNWRAP THE MODULE
const fal = (falModule as any).fal || (falModule as any).default || falModule;

// The proxy endpoint
const FAL_PROXY_URL = "/api/fal";

export class FalService {
  
  constructor() {
    // 2. CONFIGURE THE CLIENT
    if (fal && fal.config) {
        fal.config({
            // CHANGE THIS: Use 'proxyUrl' to force ALL traffic (including storage) through your server
            proxyUrl: FAL_PROXY_URL, 
            credentials: 'PROXY_USER', 
        });
    } else {
        console.error("Fal Client methods missing. Check imports.");
    }
  }

  private async uploadImage(base64: string): Promise<string> {
    try {
        const blob = base64ToBlob(base64);
        
        // 3. USE THE UNWRAPPED 'fal' OBJECT
        const url = await fal.storage.upload(blob);
        return url;
    } catch (e: any) {
        console.error("Fal Storage Upload Failed:", e);
        throw new Error(`Failed to upload image: ${e.message || JSON.stringify(e)}`);
    }
  }

  async compositeProduct(avatarBase64: string, productBase64: string, prompt: string): Promise<string> {
    try {
        const avatarUrl = await this.uploadImage(avatarBase64);
        
        const result: any = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
            input: {
                image_url: avatarUrl,
                prompt: `(Masterpiece), realistic photo, ${prompt} . The person is holding the product naturally. The product is clearly visible.`,
                strength: 0.75,
                guidance_scale: 3.5,
            },
            logs: true,
        });
        
        if (result.images && result.images[0]) {
            return result.images[0].url;
        }
        throw new Error("Fal Composite returned no images");
    } catch (error: any) {
        throw new Error(`Fal Composite Error: ${error.message || JSON.stringify(error)}`);
    }
  }

  async generateVideoFromImage(
    sourceImageUrlOrBase64: string,
    prompt: string
  ): Promise<string> {
    try {
        let imageUrl = sourceImageUrlOrBase64;

        if (!sourceImageUrlOrBase64.startsWith('http')) {
            imageUrl = await this.uploadImage(sourceImageUrlOrBase64);
        }
        
        const result: any = await fal.subscribe(ModelType.WAN, {
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: imageUrl,
                seconds: 5,
                aspect_ratio: "9:16" 
            },
            logs: true, 
        });

        if (result.video?.url) return result.video.url;
        throw new Error("No video URL in response");
    } catch (error: any) {
        throw new Error(`Fal Service Error: ${error.message || JSON.stringify(error)}`);
    }
  }
}