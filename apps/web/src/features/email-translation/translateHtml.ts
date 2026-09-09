import { planAndTranslateHtml } from './translationPlanner';

export async function translateHtml(html: string): Promise<string> {
  return await planAndTranslateHtml(html);
}
