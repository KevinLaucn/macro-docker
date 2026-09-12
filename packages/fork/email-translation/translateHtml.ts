import {
  planAndTranslateHtml,
  planAndTranslateHtmlDetailed,
} from './translationPlanner';

export async function translateHtml(html: string): Promise<string> {
  return await planAndTranslateHtml(html);
}

export async function translateHtmlDetailed(html: string) {
  return await planAndTranslateHtmlDetailed(html);
}
