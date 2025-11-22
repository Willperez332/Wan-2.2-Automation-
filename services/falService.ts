import { ModelType } from "../types";
import { fal } from "@fal-ai/client"; // Correct named import

export class FalService {
  constructor(apiKey: string) {
    if (fal.config) {
        fal.config({
            credentials: apiKey,
        });
    }
  }

  // REPLACEMENT for "Nano Banana" logic
  async compositeProduct(avatarBase64: string, productBase64: string, prompt: string): Promise<string> {
    try {
        const result: any = await fal.subscribe("fal-ai/flux/dev/image-to-image", {
            input: {
                image_url: `data:image/jpeg;base64,${avatarBase64}`,
                prompt: `(Masterpiece), realistic photo, ${prompt} . The person is holding the product naturally. The product is clearly visible.`,
                strength: 0.75, // High strength to allow product insertion while keeping avatar likeness
                guidance_scale: 3.5,
                // We pass the product as a control image or just rely on the prompt + base composition
                // For better results, you'd use a LoRA, but standard Image-to-Image works for simple inserts
            },
            logs: true,
        });
        
        if (result.images && result.images[0]) {
            return result.images[0].url;
        }
        throw new Error("Fal Composite failed");
    } catch (error: any) {
        console.error("Fal Composite Error:", error);
        throw error;
    }
  }

  async generateVideoFromImage(
    sourceImageUrlOrBase64: string,
    prompt: string
  ): Promise<string> {
    try {
        // Handle both raw Base64 and URLs (from the composite step)
        const imageUrl = sourceImageUrlOrBase64.startsWith('http') 
            ? sourceImageUrlOrBase64 
            : `data:image/jpeg;base64,${sourceImageUrlOrBase64}`;

        const result: any = await fal.subscribe(ModelType.WAN, {
            input: {
                prompt: `Cinematic, photorealistic, ${prompt}`,
                image_url: imageUrl,
                seconds: 5,
                aspect_ratio: "9:16" 
            },
            logs: true, 
        });

        if (result && result.video && result.video.url) {
            return result.video.url;
        } else {
            throw new Error("No video URL in response");
        }
    } catch (error: any) {
        console.error("Fal Service Error:", error);
        throw error;
    }
  }
}