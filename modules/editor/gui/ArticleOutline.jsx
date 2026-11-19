import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { X } from 'lucide-react';
import { articleViewportTop } from './appearance.mjs';

/** Reading-only UI. Hover, focus and chapter jumps never dispatch document transactions. */
export function ArticleOutline({ api, snapshot, night }) {
  const headings = useMemo(() => snapshot.nodes.filter(node => node.type === 'heading').map(node => ({ ...node, title: node.text.trim() || '未填写标题' })), [snapshot.revision]);
  const [open, setOpen] = useState(false), [position, setPosition] = useState(null), [reading, setReading] = useState(null);
  const trigger = useRef(null), host = useRef(null), suppressHover = useRef(false);
  const current = useRef({ api, headings, night }); current.current = { api, headings, night };
  function headingDOM(item, index) {
    return current.current.night ? document.querySelector('.night-reading')?.shadowRoot?.querySelectorAll('h1,h2,h3,h4,[role="heading"]')[index] : current.current.api.session.editor.view.nodeDOM(item.position);
  }
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const stage = api.session.editor.view.dom.closest('.editor-stage'), paper = stage?.querySelector('.studio-paper');
      if (!stage || !paper || !current.current.headings.length) { setPosition(null); return; }
      const rect = paper.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
      const top = articleViewportTop(stage) + 18, bottom = Math.min(bounds.bottom, innerHeight);
      if (rect.bottom <= top || rect.top >= bottom) { setPosition(null); return; }
      const y = Math.min(Math.max(top, rect.top + 22), bottom - 50);
      const x = Math.max(4, Math.min(rect.right + 7, bounds.right - 25, innerWidth - 29));
      setPosition(old => old?.x === x && old?.y === y ? old : { x, y });
      let active = current.current.headings[0].id;
      current.current.headings.forEach((item, index) => { if ((headingDOM(item, index)?.getBoundingClientRect().top ?? Infinity) <= top + 32) active = item.id; });
      setReading(active);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule), root = api.session.editor.view.dom;
    observer.observe(root);
    const paper = root.closest('.editor-stage')?.querySelector('.studio-paper'); if (paper) observer.observe(paper);
    schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); };
  }, [api, snapshot.revision, night]);
  useEffect(() => { if (!headings.length || !position) { setOpen(false); setReading(null); } }, [headings.length, !!position]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!host.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useLayoutEffect(() => {
    const panel = host.current?.querySelector('.outline-popover');
    if (!open || !position || !panel) return;
    panel.style.maxHeight = `${Math.max(120, innerHeight - 16)}px`;
    const top = Math.max(8, Math.min(position.y - 9, innerHeight - panel.offsetHeight - 8));
    panel.style.top = `${top - position.y}px`;
    panel.querySelector('.outline-hover-bridge').style.height = `${Math.max(panel.offsetHeight, position.y - top + 40)}px`;
  }, [open, position, headings]);
  function close(focus = false) {
    suppressHover.current = true; setOpen(false);
    if (focus) trigger.current?.focus();
  }
  if (!headings.length || !position) return null;
  const active = headings.some(item => item.id === reading) ? reading : headings[0].id;
  const activeIndex = headings.findIndex(item => item.id === active);
  const rail = Array.from({ length: Math.min(16, headings.length) }, (_, index) => {
    const sourceIndex = headings.length <= 16 ? index : Math.round(index * (headings.length - 1) / 15);
    return { item: headings[sourceIndex], sourceIndex };
  });
  const activeMarker = rail.reduce((best, row) => Math.abs(row.sourceIndex - activeIndex) < Math.abs(best.sourceIndex - activeIndex) ? row : best).sourceIndex;
  return createPortal(<nav ref={host} className="article-outline" aria-label="文章目录" data-outline-ui style={{ left: position.x, top: position.y }}
    onPointerEnter={event => { if (event.pointerType !== 'touch' && !suppressHover.current) setOpen(true); }}
    onPointerLeave={event => {
      if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
      suppressHover.current = false;
      if (!event.currentTarget.contains(document.activeElement)) setOpen(false);
    }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); } }}>
    <button ref={trigger} type="button" className="outline-trigger" aria-label="展开文章目录" aria-expanded={open} aria-controls="article-outline-panel"
      onClick={() => { suppressHover.current = false; setOpen(true); }} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); setOpen(true);
          requestAnimationFrame(() => host.current?.querySelector('.outline-items button')?.focus());
        }
      }}>
      <Text className="outline-rail" aria-hidden="true">{rail.map(({ item, sourceIndex }) => <i key={item.id} style={{ width: 18 - (item.attrs.level - 1) * 3 }} data-current={activeMarker === sourceIndex} />)}</Text>
    </button>
    {open && <section id="article-outline-panel" className="outline-popover" aria-label="目录">
      <Text className="outline-hover-bridge" aria-hidden="true" />
      <header className="outline-heading"><Text as="strong">目录</Text><Button label="收起文章目录" isIconOnly icon={<X size={13} />} variant="ghost" size="sm" onClick={() => close(true)} /></header>
      <section className="outline-items" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = [...event.currentTarget.querySelectorAll('button')], at = items.indexOf(document.activeElement);
        event.preventDefault();
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }}>{headings.map((item, index) => <Button key={item.id} label={item.title} title={item.title} variant="ghost"
        aria-current={active === item.id ? 'location' : undefined} data-heading-id={item.id} style={{ paddingInlineStart: 6 + (item.attrs.level - 1) * 13 }}
        onClick={() => {
          setReading(item.id);
          headingDOM(item, index)?.scrollIntoView({ block: 'start', behavior: 'auto' });
        }} />)}</section>
    </section>}
  </nav>, document.body);
}
