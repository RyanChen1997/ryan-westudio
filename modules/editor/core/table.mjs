import { Extension, Node } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

export const tableNames = ['table', 'tableRow', 'tableHeader', 'tableCell'];
const alignments = new Set(['left', 'center', 'right']);
const cell = (name, tag) => Node.create({
  name, content: 'text*', isolating: true, defining: true,
  addAttributes: () => ({ align: { default: null, rendered: false, parseHTML: element => alignments.has(element.style.textAlign) ? element.style.textAlign : null } }),
  parseHTML: () => [{ tag }],
  renderHTML: ({ node, HTMLAttributes }) => [tag, { ...HTMLAttributes, ...(tag === 'th' ? { scope: 'col' } : {}), style: `${HTMLAttributes.style || ''};${cellAlignment(node.attrs.align)}` }, 0],
});

export const tableExtensions = [
  Node.create({
    name: 'table', group: 'block', content: 'tableRow+', isolating: true,
    parseHTML: () => [{ tag: 'table' }],
    renderHTML: ({ HTMLAttributes }) => ['table', HTMLAttributes, ['tbody', 0]],
  }),
  Node.create({ name: 'tableRow', content: '(tableHeader | tableCell)+', parseHTML: () => [{ tag: 'tr' }], renderHTML: ({ HTMLAttributes }) => ['tr', HTMLAttributes, 0] }),
  cell('tableHeader', 'th'), cell('tableCell', 'td'),
  Extension.create({
    name: 'tableEditing',
    addKeyboardShortcuts() {
      const stepCell = (direction, keepFocus = false) => {
        const { state, view } = this.editor;
        const { $head } = state.selection;
        if (!isCell($head.parent)) return false;
        const tableDepth = $head.depth - 2, tablePos = $head.start(tableDepth);
        const cells = [];
        $head.node(tableDepth).descendants((node, position) => {
          if (isCell(node)) cells.push(tablePos + position + 1);
        });
        const target = cells[cells.indexOf($head.start()) + direction];
        if (target === undefined) return keepFocus;
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, target)).scrollIntoView());
        return true;
      };
      return { Tab: () => stepCell(1), 'Shift-Tab': () => stepCell(-1), Enter: () => stepCell(1, true) };
    },
    addProseMirrorPlugins() {
      return [new Plugin({ filterTransaction(tr) {
        if (!tr.docChanged) return true;
        try { validateTables(tr.doc); return true; } catch { return false; }
      } })];
    },
  }),
];
const isCell = node => node.type.name === 'tableHeader' || node.type.name === 'tableCell';
export function validateTables(doc) { doc.descendants(node => { if (node.type.name === 'table') validateTable(node); }); }

export const cellAlignment = align => alignments.has(align) ? `text-align:${align};` : '';

export function validateTable(table) {
  const headers = table.firstChild;
  table.forEach((row, _offset, rowIndex) => {
    if (row.childCount !== headers.childCount) throw new Error('表格各行的列数必须一致');
    row.forEach((cell, _offset, column) => {
      if (cell.type.name !== (rowIndex === 0 ? 'tableHeader' : 'tableCell')) throw new Error('表格第一行应为唯一表头');
      const { align } = cell.attrs;
      if ((align !== null && !alignments.has(align)) || align !== headers.child(column).attrs.align) throw new Error('表格列的对齐方式无效或不一致');
      if (/[\r\n]/.test(cell.textContent)) throw new Error('Markdown 表格单元格不支持段内换行');
    });
  });
}

export const tableStyles = {
  table: 'width:100%;table-layout:fixed;border-collapse:collapse;margin:18px 0;white-space:normal;',
  cell: 'border:1px solid #c4ccd2;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;',
  header: 'font-weight:700;background-color:var(--weui-BG-2,#f2f5f7);',
};
