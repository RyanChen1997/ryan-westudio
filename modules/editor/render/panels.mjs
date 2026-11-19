// Panels are layout containers, not article sections: Markdown and AI node IDs are transparent to them.
export function topLevelBlocks(content = []) {
  return content.flatMap(node => node.type === 'designPanel' ? node.content : [node]);
}

export function panelRanges(nodes, layout) {
  if (!layout?.panel) return [];
  const ranges = [];
  let start = -1, active = layout.panel.beforeHeading;
  const flush = end => { if (start !== -1) ranges.push([start, end]); start = -1; };
  nodes.forEach((node, index) => {
    if (node.type === 'heading' && node.attrs.level === 1 && !layout.panel.entire) {
      flush(index);
      active = true;
      if (layout.panel.includeHeading) start = index;
    } else if (active) {
      if (node.type === 'heading' && node.attrs.level === 2 && layout.panel.splitH2) flush(index);
      if (start === -1) start = index;
    }
  });
  flush(nodes.length);
  return ranges;
}

export function arrangePanels(doc, layout) {
  const content = topLevelBlocks(doc.content);
  const ends = new Map(panelRanges(content, layout));
  const result = [];
  for (let index = 0; index < content.length;) {
    const end = ends.get(index);
    if (end === undefined) result.push(content[index++]);
    else { result.push({ type: 'designPanel', content: content.slice(index, end) }); index = end; }
  }
  return { ...doc, content: result };
}
