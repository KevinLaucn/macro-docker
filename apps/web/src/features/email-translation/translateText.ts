import { planAndTranslateText } from './textPlanner';

export async function translateText(text: string): Promise<string> {
  return await planAndTranslateText(text);
}
