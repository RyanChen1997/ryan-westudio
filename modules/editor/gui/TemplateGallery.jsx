import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/Stack';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { Check } from 'lucide-react';
import { templates } from '../../templates/registry.mjs';
import categories from '../../templates/gallery-categories.json';
import { parseMarkdown } from '../core/markdown.mjs';
import { renderArticle } from '../render/article.mjs';
import { liveImage } from '../render/paiban-design.mjs';
import { TemplateThumbnail } from './ReadingViews.jsx';

// Use the same short sample for every design, independent of the user's live edits.
const example = parseMarkdown('# 把日常写成文章\n\n好看的排版，让读者更容易找到重点，也给文字留一点呼吸的空间。\n\n## 从一个小节开始\n\n> 记下那些值得回看的细节。\n\n- 梳理文章脉络和重点\n- 让每个段落自然衔接\n\n---\n');
const thumbnails = presets => presets.map(({ id, name }) => ({
  id, name, html: renderArticle({ ...example, attrs: { ...example.attrs, templateId: id } }, liveImage),
}));
const builtins = thumbnails(templates);
const categoryButtons = Object.entries(categories.labels);

export function TemplateGallery({ selected, category, onCategoryChange, onSelect, disabled }) {
  const active = category ?? categories.assignments[selected];
  const designs = builtins.filter(({ id }) => categories.assignments[id] === active);
  return <Section padding={0} className="template-gallery">
    <HStack role="group" aria-label="模板分类" gap={1} wrap="wrap">
      {categoryButtons.map(([id, label]) => <Button key={id} label={label} variant="ghost" size="sm"
        className="template-category" aria-pressed={active === id} onClick={() => onCategoryChange(id)} />)}
    </HStack>
    <Section key={active} padding={0} className="template-gallery-scroll" role="group" aria-label="排版模板卡片">
      <Grid columns={{ minWidth: 108, max: 2 }} gap={3} width="100%">
        {designs.map(({ id, name, html }) => <Section key={id} padding={0} className="template-card" data-selected={selected === id}>
          <TemplateThumbnail name={name} html={html} />
          <Text as="span" className="template-card-tint" aria-hidden="true" />
          <Text as="span" className="template-card-check" aria-hidden="true"><Check size={13} strokeWidth={2.5} /></Text>
          <Button label={name} variant="ghost" className="template-select" isDisabled={disabled} aria-pressed={selected === id}
            onClick={() => { if (selected !== id) onSelect(id); }} />
        </Section>)}
      </Grid>
    </Section>
  </Section>;
}
