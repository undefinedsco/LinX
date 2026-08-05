import LinXLogoImage from '@/assets/linx-logo.png'
import OpenAIImage from '@/assets/images/providers/openai.png'
import GoogleImage from '@/assets/images/providers/google.png'
import DeepSeekImage from '@/assets/images/providers/deepseek.png'
import OllamaImage from '@/assets/images/providers/ollama.png'
import MistralImage from '@/assets/images/providers/mistral.png'
import GroqImage from '@/assets/images/providers/groq.png'
import MoonshotImage from '@/assets/images/providers/moonshot.png'
import ZhiPuImage from '@/assets/images/providers/zhipu.png'

const providerAvatars: Record<string, string> = {
  undefineds: LinXLogoImage,
  openai: OpenAIImage,
  anthropic: 'https://console.anthropic.com/static/favicon-32x32.png',
  google: GoogleImage,
  deepseek: DeepSeekImage,
  ollama: OllamaImage,
  mistral: MistralImage,
  groq: GroqImage,
  moonshot: MoonshotImage,
  zhipu: ZhiPuImage,
}

export function getModelProviderAvatar(providerId: string): string | undefined {
  return providerAvatars[providerId]
}
