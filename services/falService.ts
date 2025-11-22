import { ModelType } from "../types";
import * as falClient from "@fal-ai/client";

// Handle potential ESM/CJS interop issues from CDN
const fal = (falClient as any).default || falClient;

export class FalService {
  private key: string;

  constructor(apiKey: string) {
    this.key = apiKey;
    // Configure the fal client with the key
    if (fal.config) {
        fal.config({
            credentials: apiKey,
        });
    }
  }

  async generateVideoFromImage(
    sourceImageBase64: string,
    prompt: string
  ): Promise<string> {
    if (!this.key) throw new Error("Fal.ai API Key missing");

    try {
        // Use the fal SDK subscribe method which handles queueing and polling
        // Ensure we access subscribe correctly
        const subscribeFn = fal.subscribe;
        
        if (!subscribeFn) {
            throw new Error("Fal Client SDK not loaded correctly");
        }

        const result: any = await subscribeFn(ModelType.WAN, {
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: `data:image/jpeg;base64,${sourceImageBase64}`,
                seconds: 5,
                aspect_ratio: "9:16" 
            },
            logs: true, 
            onQueueUpdate: (update: any) => {
                if (update.status === 'IN_PROGRESS') {
                    console.log("Fal Generation Progress:", update.logs);
                }
            }
        });

        if (result && result.video && result.video.url) {
            return result.video.url;
        } else {
            throw new Error("No video URL in response");
        }
    } catch (error: any) {
        console.error("Fal Service Error:", error);
        if (error.message && error.message.includes("Failed to fetch")) {
             throw new Error("Network Error: Could not connect to Fal.ai. Check your connection.");
        }
        throw error;
    }
  }
}