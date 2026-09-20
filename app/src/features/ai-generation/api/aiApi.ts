import type { ChatCompletionResponse } from '@/shared/types';
import { chatCompletions as clovaChatCompletions } from './clovaApi';
import { chatCompletions as openaiChatCompletions } from './openaiApi';

const provider = import.meta.env.VITE_AI_PROVIDER ?? 'openai';

export async function chatCompletions(text: string, options?: { lang?: 'ko' | 'en' }): Promise<ChatCompletionResponse> {
  if (provider === 'clova') {
    return clovaChatCompletions(text, options);
  }
  return openaiChatCompletions(text, options);
}
