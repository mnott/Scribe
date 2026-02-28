import type { ContentProvider } from "./types.ts";

class ProviderRegistry {
  private providers: ContentProvider[] = [];

  register(provider: ContentProvider): void {
    this.providers.push(provider);
  }

  resolve(input: string): ContentProvider | null {
    for (const provider of this.providers) {
      if (provider.canHandle(input)) {
        return provider;
      }
    }
    return null;
  }

  list(): { name: string; description: string; capabilities: ReturnType<ContentProvider["capabilities"]> }[] {
    return this.providers.map((p) => ({
      name: p.name,
      description: p.description,
      capabilities: p.capabilities(),
    }));
  }
}

export const registry = new ProviderRegistry();
