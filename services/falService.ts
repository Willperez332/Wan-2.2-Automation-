import { ModelType } from "../types";
import * as falModule from "@fal-ai/client";
import { base64ToBlob } from "../utils";

// 1. Helper to unwrap the library based on your error logs
const getClient = () => {
    const mod = falModule as any;
    // The logs showed the methods are inside the 'fal' property
    if (mod.fal) return mod.fal;
    if (mod.default && mod.default.fal) return mod.default.fal;
    return mod;
};

// 2. Proxy URL (matches vite.config.ts)
const FAL_PROXY_URL = "/api/fal";

export class FalService {
  private client: any;

  constructor() {
    this.client = getClient();
    
    if (this.client && typeof this.client.config === 'function') {
        try {
            this.client.config({
                host: FAL_PROXY_URL,
                credentials: null // Safe because the Proxy adds the key
            });
            console.log("Fal Client configured successfully");
        } catch (e) {
            console.error("Fal Client config failed:", e);
        }
    } else {
        console.error("CRITICAL: Fal Client not found. Keys found:", Object.keys(falModule));
    }
  }

  private async uploadImage(base64: string): Promise<string> {
    try {
        const blob = base64ToBlob(base64);
        // Ensure we are using the unwrapped client
        if (!this.client || !this.client.storage) throw new Error("Fal Client not loaded");
        
        const url = await this.client.storage.upload(blob);
        return url;
    } catch (e: any) {
        console.error("Fal Upload Error:", e);
        throw new Error(`Upload failed: ${e.message || JSON.stringify(e)}`);
    }
  }

  async compositeProduct(avatarBase64: string, productBase64: string, prompt: string): Promise<string> {
    try {
        const avatarUrl = await this.uploadImage(avatarBase64);
        
        const result: any = await this.client.subscribe("fal-ai/flux/dev/image-to-image", {
            input: {
                image_url: avatarUrl,
                prompt: `(Masterpiece), realistic photo, ${prompt} . The person is holding the product naturally. The product is clearly visible.`,
                strength: 0.75,
                guidance_scale: 3.5,
            },
            logs: true,
        });
        
        if (result.images && result.images[0]) return result.images[0].url;
        throw new Error("No image returned");
    } catch (error: any) {
        throw new Error(`Fal Composite Error: ${error.message || JSON.stringify(error)}`);
    }
  }

  async generateVideoFromImage(source: string, prompt: string): Promise<string> {
    try {
        // If it's base64 (raw avatar), upload it. If it's http (composite url), use it.
        const imageUrl = source.startsWith('http') ? source : await this.uploadImage(source);

        const result: any = await this.client.subscribe(ModelType.WAN, {
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: imageUrl,
                seconds: 5,
                aspect_ratio: "9:16" 
            },
            logs: true, 
        });

        if (result.video?.url) return result.video.url;
        throw new Error("No video URL returned");
    } catch (error: any) {
        throw new Error(`Fal Service Error: ${error.message || JSON.stringify(error)}`);
    }
  }
}