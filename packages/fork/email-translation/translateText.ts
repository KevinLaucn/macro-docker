import {
  planAndTranslateText,
  planAndTranslateTextDetailed,
} from './textPlanner';

export async function translateText(text: string): Promise<string> {
  return await planAndTranslateText(text);
}

export async function translateTextDetailed(text: string) {
  return await planAndTranslateTextDetailed(text);
}
