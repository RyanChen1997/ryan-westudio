import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popover } from '@astryxdesign/core/Popover';
import { Button } from '@astryxdesign/core/Button';
import { Section } from '@astryxdesign/core/Section';
import { Slider } from '@astryxdesign/core/Slider';
import { Text } from '@astryxdesign/core/Text';
import { ArrowDown, ArrowUp, Check, GripVertical, ImagePlus, Info, Minus, Pilcrow, Quote, Scaling, Trash2 } from 'lucide-react';
import { IMAGE_SCALE_MIN, IMAGE_SCALE_MAX, IMAGE_SCALE_STEP } from '../core/image-scale.mjs';
import { articleViewportTop } from './appearance.mjs';

const HANDLE_SIZE = 28;
const RESIZE_LABEL = '调整图片大小';
const scaleLabel = value => `${value}%`;
const SCALE_MARKS = Array.from({ length: (IMAGE_SCALE_MAX - IMAGE_SCALE_MIN) / IMAGE_SCALE_STEP + 1 }, (_, i) => {
  const value = IMAGE_SCALE_MIN + i * IMAGE_SCALE_STEP;
  return { value, label: [IMAGE_SCALE_MIN, IMAGE_SCALE_MAX].includes(value) ? scaleLabel(value) : undefined };
});
const isRule = el => el.matches('hr,[data-article-node="horizontalRule"]');
const STYLES = [
  ['paragraph', '普通段落', Pilcrow], ['quote', '引用块', Quote],
  ['card', '提示块', Info], ['image', '图片', ImagePlus], ['horizontalRule', '装饰条', Minus],
];
function elementFor(api, snapshot, id) {
  const node = snapshot.nodes.find(item => item.id === id);
  const dom = node && api.session.editor.view.nodeDOM(node.position);
  return dom instanceof HTMLElement ? dom : null;
}
// Virtual interaction geometry does not add padding, wrappers or other published content.
function interactionRect(element) {
  const rect = element.getBoundingClientRect();
  if (!isRule(element) || rect.height >= HANDLE_SIZE) return rect;
  const center = rect.top + rect.height / 2;
  return { left: rect.left, right: rect.right, top: center - HANDLE_SIZE / 2, bottom: center + HANDLE_SIZE / 2 };
}
function blockAt(editor, target, x, y) {
  const root = editor.view.dom;
  if (!(target instanceof Element) || !root.contains(target)) return null;
  let block = target.closest('[data-node-id]');
  if (block?.matches('[data-article-node="image"]')) return block;
  const list = block?.closest('li,[data-article-node="listItem"]')?.closest('ul[data-node-id],ol[data-node-id],[data-article-node="bulletList"],[data-article-node="orderedList"]');
  if (list) block = list;
  if (block?.closest('table[data-node-id]')) block = block.closest('table[data-node-id]');
  // A horizontal rule's painted border is only 1–2px tall. Its surrounding empty
  // margin must also be hoverable, without stealing a neighbouring text block.
  if (!list && Number.isFinite(x) && Number.isFinite(y)) {
    for (const rule of root.querySelectorAll('hr[data-node-id],[data-article-node="horizontalRule"]')) {
      const rect = interactionRect(rule);
      if (x >= rect.left - 6 && x <= rect.right + 6 && y >= rect.top && y <= rect.bottom && (!block || block.contains(rule))) return rule;
    }
  }
  return block?.dataset.nodeId ? block : null;
}
function menuItems(menu) {
  return [...(menu?.querySelectorAll('[role="menuitem"]') || [])].filter(item => !item.disabled && item.getAttribute('aria-disabled') !== 'true');
}
function navigateMenu(event, menu = event.currentTarget) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = menuItems(menu);
  if (!items.length) return;
  event.preventDefault();
  const at = Math.max(0, items.indexOf(document.activeElement));
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next].focus({ preventScroll: true });
}

function ImageSizeControl({ scale, onResize }) {
  const [draft, setDraft] = useState(null);
  return <Slider label={RESIZE_LABEL} isLabelHidden min={IMAGE_SCALE_MIN} max={IMAGE_SCALE_MAX} step={IMAGE_SCALE_STEP}
    marks={SCALE_MARKS} formatValue={scaleLabel} valueDisplay="text" value={draft ?? scale ?? IMAGE_SCALE_MAX}
    onChange={setDraft} onChangeEnd={value => { setDraft(null); onResize(value); }} />;
}

export function BlockControls({ api, snapshot, disabled, onError }) {
  const [target, setTarget] = useState(null), [phase, setPhase] = useState(null), [uploading, setUploading] = useState(false);
  const handle = useRef(null), menu = useRef(null), fileInput = useRef(null);
  const targetRef = useRef(null), phaseRef = useRef(null), uploadEpoch = useRef(0), keyboardMode = useRef(false);
  const live = useRef({ api, snapshot, disabled, onError }); live.current = { api, snapshot, disabled, onError };
  function changePhase(value) { phaseRef.current = value; setPhase(value); }
  function measure(id) {
    const { api, snapshot, disabled } = live.current, editor = api.session.editor;
    const block = !disabled && elementFor(api, snapshot, id), stage = editor.view.dom.closest('.editor-stage');
    if (!block || !stage || !editor.isEditable) { targetRef.current = null; setTarget(null); return; }
    const rect = interactionRect(block), bounds = stage.getBoundingClientRect();
    const top = articleViewportTop(stage) + 2;
    const bottom = Math.min(bounds.bottom, innerHeight - 4);
    const hx = Math.max(rect.left, bounds.left, 0), hy = Math.max(rect.top, top);
    const hw = Math.max(0, Math.min(rect.right, bounds.right, innerWidth) - hx), hh = Math.max(0, Math.min(rect.bottom, bottom) - hy);
    const next = { id, x: Math.max(4, rect.left - 34), y: Math.max(top, Math.min(rect.top + (isRule(block) ? 0 : 2), bottom - HANDLE_SIZE)), visible: hw > 0 && hh > 0, hx, hy, hw, hh };
    targetRef.current = next;
    setTarget(old => old && Object.keys(next).every(key => old[key] === next[key]) ? old : next);
  }
  function focusTarget(id) {
    const { api } = live.current, editor = api.session.editor;
    if (!editor.isEditable) return;
    const snapshot = api.session.snapshot(), block = snapshot.nodes.find(item => item.id === id);
    if (!block) return;
    const text = ['paragraph', 'heading', 'codeBlock'].includes(block.type) ? block : snapshot.nodes.find(item => ['paragraph', 'tableHeader', 'tableCell'].includes(item.type) && item.position > block.position && item.position < block.position + block.size);
    try {
      api.session.execute({ expectedRevision: api.session.revision, operations: [{ type: 'select', nodeId: (text || block).id, ...(text ? { from: 0, to: 0 } : { node: true }) }] });
      editor.view.focus();
    } catch (error) { live.current.onError(error.message); }
  }
  function close(focus = false) {
    const id = targetRef.current?.id;
    uploadEpoch.current++; setUploading(false); changePhase(null);
    if (focus && id) queueMicrotask(() => focusTarget(id));
  }
  function run(operation) {
    const session = live.current.api.session; live.current.onError('');
    return session.execute({ expectedRevision: session.revision, operations: [operation] });
  }
  function insert(where) {
    const anchor = targetRef.current?.id;
    if (!anchor) return;
    try {
      const before = new Set(live.current.snapshot.nodes.map(node => node.id));
      const result = run({ type: 'insertBlock', block: 'paragraph', [where === 'before' ? 'beforeId' : 'afterId']: anchor, focus: true });
      const added = result.nodes.find(node => node.type === 'paragraph' && !before.has(node.id));
      if (!added) throw new Error('未找到新增段落');
      live.current.snapshot = result; measure(added.id); changePhase('styles');
    } catch (error) { live.current.onError(error.message); }
  }
  function choose(block) {
    if (block === 'image') { fileInput.current.click(); return; }
    try { run({ type: 'convertBlock', nodeId: targetRef.current.id, block, focus: true }); close(true); }
    catch (error) { live.current.onError(error.message); close(); }
  }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) { close(true); return; }
    const id = targetRef.current?.id, epoch = ++uploadEpoch.current; setUploading(true);
    try {
      const asset = await live.current.api.upload(file);
      if (epoch !== uploadEpoch.current || !live.current.api.session.editor.isEditable) return;
      run({ type: 'convertBlock', nodeId: id, block: 'image', assetId: asset.id, alt: file.name, focus: true }); close(true);
    } catch (error) { if (epoch === uploadEpoch.current) { live.current.onError(error.message); close(); } }
  }
  // Popover may mount/position its content after our phase changes. Focus the
  // actual visible phase, cancel obsolete callbacks, and never autofocus for a mouse click.
  useEffect(() => {
    if (!phase || disabled || !keyboardMode.current) return;
    let frame, cancelled = false, attempts = 0;
    const focusReady = () => {
      if (cancelled || phaseRef.current !== phase) return;
      const first = phase === 'resize' ? menu.current?.querySelector('[role="slider"]') : menuItems(menu.current)[0];
      if (menu.current?.contains(document.activeElement) && document.activeElement.getAttribute('role') === (phase === 'resize' ? 'slider' : 'menuitem')) return;
      if (first?.getBoundingClientRect().width > 0 && getComputedStyle(first).visibility !== 'hidden') {
        first.focus({ preventScroll: true });
        if (document.activeElement === first) return;
      }
      if (++attempts < 60) frame = requestAnimationFrame(focusReady);
    };
    frame = requestAnimationFrame(focusReady);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [phase, disabled]);
  useEffect(() => {
    if (disabled) { close(); targetRef.current = null; setTarget(null); return; }
    const editor = api.session.editor, root = editor.view.dom;
    let frame = 0;
    const position = () => { frame = 0; if (targetRef.current) measure(targetRef.current.id); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
    const move = event => {
      if (phaseRef.current || event.target instanceof Element && event.target.closest('[data-block-ui]')) return;
      const block = blockAt(editor, event.target, event.clientX, event.clientY), current = targetRef.current;
      if (current) {
        const old = elementFor(live.current.api, live.current.snapshot, current.id), rect = old && interactionRect(old);
        const corridor = rect && event.clientX >= current.x - 4 && event.clientX <= rect.left + 8 && event.clientY >= rect.top - 6 && event.clientY <= Math.max(rect.bottom, rect.top + HANDLE_SIZE) + 6;
        if (corridor && (!block || block.contains(old))) return;
      }
      if (block) measure(block.dataset.nodeId);
      else { targetRef.current = null; setTarget(null); }
    };
    const focus = event => {
      if (!phaseRef.current) { const block = blockAt(editor, event.target, event.clientX, event.clientY); if (block) measure(block.dataset.nodeId); }
    };
    const shortcut = event => {
      if (event.altKey && event.shiftKey && event.key === 'Enter' && !editor.view.composing) {
        event.preventDefault();
        const at = editor.view.domAtPos(editor.state.selection.from).node;
        let block = blockAt(editor, at instanceof Element ? at : at.parentElement);
        if (!block) {
          const selected = live.current.snapshot.nodes.find(node => node.position === editor.state.selection.from);
          block = selected && elementFor(api, live.current.snapshot, selected.id);
        }
        if (block) { keyboardMode.current = true; measure(block.dataset.nodeId); changePhase('actions'); }
      }
    };
    const keys = event => {
      if (!phaseRef.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const owned = event.target === document.body || event.target === handle.current || root.contains(event.target);
      if (!owned || !['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key) || editor.view.composing) return;
      const first = menuItems(menu.current)[0];
      if (!first) return;
      event.preventDefault(); event.stopPropagation(); keyboardMode.current = true;
      first.focus({ preventScroll: true });
      if (['Enter', ' '].includes(event.key)) first.click(); else navigateMenu(event, menu.current);
    };
    document.addEventListener('keydown', keys, true); document.addEventListener('pointermove', move);
    root.addEventListener('pointerdown', focus); root.addEventListener('focusin', focus); root.addEventListener('keydown', shortcut);
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule); observer.observe(root);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('keydown', keys, true); document.removeEventListener('pointermove', move);
      root.removeEventListener('pointerdown', focus); root.removeEventListener('focusin', focus); root.removeEventListener('keydown', shortcut);
      window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule);
    };
  }, [api, disabled]);
  useLayoutEffect(() => {
    if (!targetRef.current) return;
    if (!snapshot.nodes.some(node => node.id === targetRef.current.id)) { close(); targetRef.current = null; setTarget(null); }
    else measure(targetRef.current.id);
  }, [snapshot.revision]);
  useEffect(() => () => { uploadEpoch.current++; }, []);
  if (disabled || !target) return null;
  const node = snapshot.nodes.find(item => item.id === target.id);
  const label = phase === 'resize' ? RESIZE_LABEL : phase === 'styles' ? '新增区块样式' : '块操作';
  const content = <Section ref={menu} padding={0} className="block-ui" data-block-ui data-block-menu={phase}
    role={phase === 'resize' ? 'group' : 'menu'} aria-label={label}
    onMouseDown={phase === 'resize' ? undefined : event => event.preventDefault()} onKeyDown={event => {
      if (phase !== 'resize') navigateMenu(event);
    }}>
    {phase === 'resize' && node?.type === 'image' ?
      <ImageSizeControl key={node.id} scale={node.attrs.scale} onResize={scale => {
        if (phaseRef.current !== 'resize' || targetRef.current?.id !== node.id) return;
        try { run({ type: 'resizeImage', nodeId: node.id, scale }); }
        catch (error) { live.current.onError(error.message); }
      }} /> : phase === 'styles' ? <>
      <Text className="block-menu-caption">选择区块样式</Text>
      {STYLES.map(([block, label, Icon]) => <Button key={block} label={label} role="menuitem" variant="ghost" className={`block-menu-item${block === 'paragraph' ? ' is-default' : ''}`}
        isDisabled={uploading} icon={<Icon size={16} />} onClick={() => choose(block)}>
        <Text className="block-menu-label">{label}{block === 'paragraph' && <Check size={13} />}</Text>
      </Button>)}
      {uploading && <Text role="status" className="block-menu-caption">正在插入本地图片…</Text>}
    </> : <>
      <Button label="删除此块" role="menuitem" variant="ghost" className="block-menu-item block-menu-delete" icon={<Trash2 size={15} />} onClick={() => {
        try { run({ type: 'deleteNode', nodeId: targetRef.current.id }); close(); targetRef.current = null; setTarget(null); } catch (error) { live.current.onError(error.message); }
      }}><Text className="block-menu-label">删除此块</Text></Button>
      <Button label="在上方插入块" role="menuitem" variant="ghost" className="block-menu-item" icon={<ArrowUp size={15} />} onClick={() => insert('before')}><Text className="block-menu-label">在上方插入块</Text></Button>
      <Button label="在下方插入块" role="menuitem" variant="ghost" className="block-menu-item" icon={<ArrowDown size={15} />} onClick={() => insert('after')}><Text className="block-menu-label">在下方插入块</Text></Button>
      {node?.type === 'image' && <Button label={RESIZE_LABEL} role="menuitem" variant="ghost" className="block-menu-item" icon={<Scaling size={15} />}
        onClick={() => changePhase('resize')}><Text className="block-menu-label">{RESIZE_LABEL}</Text></Button>}
    </>}
  </Section>;
  return <>
    {createPortal(<>
      {phase && target.visible && <section className="block-highlight" data-block-ui data-block-highlight={target.id} aria-hidden="true" style={{ left: target.hx, top: target.hy, width: target.hw, height: target.hh }} />}
      <button ref={handle} type="button" data-block-ui data-block-id={target.id} className="block-handle" aria-label="区块操作菜单" aria-keyshortcuts="Alt+Shift+Enter"
        aria-haspopup="menu" aria-expanded={!!phase} style={{ left: target.x, top: target.y, visibility: target.visible ? 'visible' : 'hidden' }}
        onMouseDown={event => { keyboardMode.current = false; event.preventDefault(); }} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) keyboardMode.current = true; }}><GripVertical size={17} /></button>
    </>, document.body)}
    <Popover anchorRef={handle} isOpen={!!phase} onOpenChange={open => { if (!open) close(); else if (!phaseRef.current) changePhase('actions'); }}
      placement="end" alignment="start" width={phase === 'resize' ? 252 : 216} padding={2} role="none" label={label} hasCloseButton={false}
      hasAutoFocus={false} hasEscapeDismiss={false} presentation="popover" content={content} />
    <input ref={fileInput} type="file" className="editor-hidden" aria-label="插入块图片" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} onCancel={() => close(true)} />
  </>;
}
