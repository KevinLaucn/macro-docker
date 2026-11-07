import {
  planAndTranslateText,
  planAndTranslateTextDetailed,
  type TextTranslationOptions,
} from './textPlanner';

export async function translateText(
  text: string,
  options?: TextTranslationOptions
): Promise<string> {
  return await planAndTranslateText(text, options);
}

export async function translateTextDetailed(
  text: string,
  options?: TextTranslationOptions
) {
  return await planAndTranslateTextDetailed(text, options);
}
