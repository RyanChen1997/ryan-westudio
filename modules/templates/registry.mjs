import apricotNotes from './presets/apricot-notes/index.mjs';
import bciWeekly from './presets/bci-weekly/index.mjs';
import beijingArtCalendar from './presets/beijing-art-calendar/index.mjs';
import blueSequence from './presets/blue-sequence/index.mjs';
import ceramicExhibition from './presets/ceramic-exhibition/index.mjs';
import cinnabarChapters from './presets/cinnabar-chapters/index.mjs';
import coffeeDialogue from './presets/coffee-dialogue/index.mjs';
import cosmosStory from './presets/cosmos-story/index.mjs';
import cyanReport from './presets/cyan-report/index.mjs';
import moonlitCopybook from './presets/moonlit-copybook/index.mjs';
import palaceGuide from './presets/palace-guide/index.mjs';
import pingshanBlueGold from './presets/pingshan-blue-gold/index.mjs';
import sakuraCampus from './presets/sakura-campus/index.mjs';
import springArtGuide from './presets/spring-art-guide/index.mjs';
import wycombePicnic from './presets/wycombe-picnic/index.mjs';
import xiaomiKeynote from './presets/xiaomi-keynote/index.mjs';
import lilacNotes from './presets/seneasy-lilac-notes/index.mjs';
import blueRule from './presets/seneasy-blue-rule/index.mjs';
import violetFieldNotes from './presets/violet-field-notes/index.mjs';

export const templates = Object.freeze([
  apricotNotes, bciWeekly, beijingArtCalendar, blueSequence, ceramicExhibition, cinnabarChapters,
  coffeeDialogue, cosmosStory, cyanReport, moonlitCopybook, palaceGuide, pingshanBlueGold,
  sakuraCampus, springArtGuide, wycombePicnic, xiaomiKeynote, lilacNotes, blueRule, violetFieldNotes,
]);
const byId = new Map(templates.map(template => [template.id, template]));
if (byId.size !== templates.length) throw new Error('模板 ID 重复');
export const DEFAULT_TEMPLATE_ID = blueRule.id;
export const TECH_TEMPLATE_ID = blueSequence.id;

export function getTemplate(id) {
  const template = byId.get(id);
  if (!template) throw new Error(`未知模板: ${id}`);
  return template;
}

// Fallback applies to saved projects, never to explicit template selection.
export function replacementTemplateId(id) {
  if (byId.has(id)) return undefined;
  if (id === 'user-violet-field-notes') return violetFieldNotes.id;
  return id === 'wechat-blue-yellow' ? TECH_TEMPLATE_ID : DEFAULT_TEMPLATE_ID;
}

export function recommendTemplate(markdown) {
  return /科技|商业|商务|人工智能|\bAI\b/i.test(markdown) ? TECH_TEMPLATE_ID : DEFAULT_TEMPLATE_ID;
}
