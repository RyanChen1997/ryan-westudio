// Astryx editor workspace, styled to the user's wechat-paiban reference.
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent } from '@tiptap/react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Section } from '@astryxdesign/core/Section';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text, Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  ArrowLeftRight, Bold, ChevronDown, Clipboard,
  FileText, ImagePlus, Italic, List, ListOrdered, LockKeyhole, Minus, Monitor, Moon,
  Pencil, Plus, Quote, Redo2, RotateCcw, Save, Send, Smartphone, Sun, Type, Undo2,
} from 'lucide-react';
import { MAX_PAGE_MARGIN } from '../core/schema.mjs';
import { editorCSS, getPageMargin, renderArticle } from '../render/article.mjs';
import { liveImage } from '../render/paiban-design.mjs';
import { NightReading } from './ReadingViews.jsx';
import { TemplateGallery } from './TemplateGallery.jsx';
import { BlockControls } from './BlockControls.jsx';
import { ArticleOutline } from './ArticleOutline.jsx';
import { appearanceCSS } from './appearance.mjs';
import { connectEditor } from './bridge.mjs';
import { ProPromotion, ProPromotionTab } from './ProPromotion.jsx';

function ToolButton({ label, icon, active, ...props }) {
  return <IconButton className="ui-icon-button" label={label} tooltip={label} variant="ghost" size="sm"
    icon={icon} aria-pressed={active} onMouseDown={event => event.preventDefault()} {...props} />;
}

function TitleField({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(value);
  const composing = useRef(false);
  useEffect(() => {
    if (disabled) composing.current = false;
    if (!composing.current) setDraft(value);
  }, [value, disabled]);
  function finish(event) {
    if (!composing.current) return;
    composing.current = false;
    onCommit(event.currentTarget.value);
  }
  return <TextInput label="文章标题" isLabelHidden containerClassName="editor-title-field" width="100%"
    value={disabled ? value : draft} isDisabled={disabled} startIcon={<Pencil size={14} />} placeholder="给这篇文章起个标题"
    onChange={(text, event) => {
      setDraft(text);
      if (!composing.current && !event.nativeEvent.isComposing) onCommit(text);
    }}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={finish} onBlur={finish} />;
}

function PreviewChoices({ device, night, onDeviceChange, onNightChange }) {
  const choices = (items, current, onChange) => items.map(([value, label, Icon]) =>
    <Button key={label} label={label} title={label} className="preview-choice" variant="ghost" size="sm"
      icon={<Icon size={18} />} aria-pressed={current === value} onClick={() => onChange(value)}>
      <Text className="preview-choice-label">{label}</Text>
    </Button>);
  return <Section padding={0} className="preview-controls" aria-label="预览设置">
    <Section padding={0} className="preview-group" role="group" aria-label="预览设备">
      {choices([['desktop', '电脑版', Monitor], ['mobile', '手机版', Smartphone]], device, onDeviceChange)}
    </Section>
    <Section padding={0} className="preview-group preview-theme" role="group" aria-label="预览明暗模式">
      {choices([[false, '白天模式', Sun], [true, '夜间模式', Moon]], night, onNightChange)}
    </Section>
  </Section>;
}

export default function EditorFrame() {
  const [api, setApi] = useState(null), [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('正在连接本地会话…'), [error, setError] = useState('');
  const [copying, setCopying] = useState(false), [layoutLocked, setLayoutLocked] = useState(false);
  const [night, setNight] = useState(false), [device, setDevice] = useState('desktop');
  const [panel, setPanel] = useState('templates');
  const [templateCategory, setTemplateCategory] = useState(null);
  const [promotionOpen, setPromotionOpen] = useState(false);
  const uploadRef = useRef(null), fontRef = useRef(null), uploadTarget = useRef(null), toolsRef = useRef(null);
  const uploadGenerations = useRef(new Map()), uploadEpoch = useRef(0), alive = useRef(true);
  const panelId = useId(), proLabelId = useId(), layoutNoticeId = useId();
  const ready = !!snapshot && !!api;
  useLayoutEffect(() => {
    if (!ready) return;
    const tools = toolsRef.current, studio = tools.closest('.studio');
    // The toolbar can wrap. Reserve its measured height for chapter jumps.
    const measure = () => studio.style.setProperty('--editor-tools-height', `${tools.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    measure(); observer.observe(tools, { box: 'border-box' });
    return () => observer.disconnect();
  }, [ready]);
  useEffect(() => {
    const dismiss = event => {
      for (const ref of [fontRef]) if (ref.current && !ref.current.contains(event.target)) ref.current.removeAttribute('open');
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  useEffect(() => {
    let cleanup, cancelled = false;
    alive.current = true;
    connectEditor({ onReady: setApi, onState: setSnapshot, onStatus: setStatus, onLayoutLock: locked => {
      if (cancelled) return;
      if (locked) {
        uploadEpoch.current++;
        fontRef.current?.removeAttribute('open');
        setPromotionOpen(false);
      }
      setLayoutLocked(locked);
    } })
      .then(dispose => { cleanup = dispose; if (cancelled) dispose(); })
      .catch(e => setError(e.message));
    return () => { cancelled = true; alive.current = false; uploadGenerations.current.clear(); cleanup?.(); };
  }, []);
  const nightHTML = useMemo(() => night && snapshot ? renderArticle(snapshot.doc, liveImage) : null, [snapshot?.revision, night]);
  async function action(callback) {
    setError('');
    try { return await callback(); } catch (e) { setError(e.message); }
  }
  function execute(operation) {
    return action(() => api.session.execute({ expectedRevision: api.session.revision, operations: [operation] }));
  }
  async function copy() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('当前浏览器不支持富文本复制，请使用 Chrome 或 Edge');
    setCopying(true);
    try {
      // Start the clipboard write within the click gesture; its blobs resolve from the latest state.
      const output = api.exportCurrent();
      const writing = navigator.clipboard.write([new ClipboardItem({
        'text/html': output.then(result => new Blob([result.html], { type: 'text/html' })),
        'text/plain': output.then(result => new Blob([result.text], { type: 'text/plain' })),
      })]);
      const [result] = await Promise.all([output, writing]);
      setStatus(`已复制 r${result.revision}，请在公众号编辑器粘贴，补标题与封面后由你发布。`);
    } finally { setCopying(false); }
  }
  function chooseImage() {
    action(() => {
      uploadTarget.current = { session: api.session, epoch: uploadEpoch.current, nodeId: image?.id, afterId: selected?.id,
        imageVersion: image ? api.session.imageVersion(image.id) : undefined };
      uploadRef.current.click();
    });
  }
  async function upload(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    const captured = uploadTarget.current; uploadTarget.current = null;
    const epoch = uploadEpoch.current;
    if (!file || (captured && captured.epoch !== epoch)) return;
    setError('');
    const session = api.session, target = captured?.session === session ? captured : { nodeId: image?.id, afterId: selected?.id };
    const { nodeId, afterId } = target;
    let imageVersion, generation;
    try {
      imageVersion = nodeId ? target.imageVersion ?? session.imageVersion(nodeId) : undefined;
      if (nodeId) { generation = (uploadGenerations.current.get(nodeId) || 0) + 1; uploadGenerations.current.set(nodeId, generation); }
    } catch (error) { if (alive.current) setError(error.message); return; }
    const current = () => {
      if (!alive.current || epoch !== uploadEpoch.current || !session.editor.isEditable) return false;
      if (!nodeId) return true;
      try { return uploadGenerations.current.get(nodeId) === generation && session.imageVersion(nodeId) === imageVersion; }
      catch { return false; }
    };
    if (!current()) return;
    try {
      const asset = await api.upload(file);
      if (!current()) return;
      session.execute({ expectedRevision: session.revision, operations: [nodeId ?
        { type: 'replaceImage', nodeId, assetId: asset.id, expectedImageVersion: imageVersion } :
        { type: 'insertBlock', block: 'image', assetId: asset.id, afterId, alt: file.name }] });
    } catch (error) { if (current()) setError(error.message); }
  }
  function changePanel(value) { setPanel(value); }
  const shell = content => <><style>{appearanceCSS}</style><AppShell height="fill" variant="section"><Section padding={0} className="studio">{content}</Section></AppShell></>;
  if (!ready) return shell(<Section className="editor-loading"><Heading level={1}>公众号文章编辑器</Heading><Text role="status">{status}</Text>{error && <Text role="alert">{error}</Text>}</Section>);

  const editor = api.session.editor;
  const selected = snapshot.nodes.filter(node => node.position <= snapshot.selection.from && node.position + node.size >= snapshot.selection.to).at(-1);
  const image = snapshot.nodes.find(node => node.type === 'image' && node.position === snapshot.selection.from);
  const margin = getPageMargin(snapshot.doc);
  const tabs = [['templates', '模板选择'], ['adjustments', '样式调整']];

  return shell(<>
    <style>{editorCSS(snapshot.doc)}</style>
    <header className="editor-header">
      <Section padding={0} className="editor-header-start">
        <Text className="document-mark" aria-hidden="true"><FileText size={20} /></Text>
        <TitleField value={snapshot.doc.attrs.title} disabled={layoutLocked} onCommit={text => execute({ type: 'title', text })} />
      </Section>
      <PreviewChoices device={device} night={night} onDeviceChange={setDevice} onNightChange={setNight} />
      <Section padding={0} className="editor-actions" role="toolbar" aria-label="编辑操作">
        <Section padding={0} className="history-actions">
          <ToolButton label="撤销" icon={<Undo2 size={17} />} isDisabled={layoutLocked || !editor.can().undo()} onClick={() => execute({ type: 'undo' })} />
          <ToolButton label="重做" icon={<Redo2 size={17} />} isDisabled={layoutLocked || !editor.can().redo()} onClick={() => execute({ type: 'redo' })} />
        </Section>
        <Button label="保存项目" variant="primary" icon={<Save size={15} />} isDisabled={layoutLocked} onClick={() => action(api.save)}>保存</Button>
      </Section>
    </header>

    <Section padding={0} className="editor-layout">
      <section className="editor-column">
        <Section padding={0} className="editor-stage" data-layout-locked={layoutLocked} aria-label="文章阅读区"
          aria-describedby={layoutLocked ? layoutNoticeId : undefined}>
        <Section padding={0} className="studio-paper" data-device={device} data-night={night}>
          <Section ref={toolsRef} padding={0} className="editor-tools" role="toolbar" aria-label="文字与段落工具">
            <ToolButton label="加粗" icon={<Bold size={17} />} isDisabled={layoutLocked} active={editor.isActive('bold')} onClick={() => execute({ type: 'mark', mark: 'bold' })} />
            <ToolButton label="斜体" icon={<Italic size={17} />} isDisabled={layoutLocked} active={editor.isActive('italic')} onClick={() => execute({ type: 'mark', mark: 'italic' })} />
            <details className="insert-menu font-menu" inert={layoutLocked} ref={fontRef} onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.removeAttribute('open'); event.currentTarget.querySelector('summary').focus(); } }}>
              <summary aria-label="局部字号" title="调整选中文字或当前段落"><Type size={16} /><ChevronDown size={12} /></summary>
              <Section padding={0} className="insert-menu-content font-options">
                {Array.from({ length: 29 }, (_, index) => index + 12).map(size => <Button key={size} label={String(size)} variant="ghost" size="sm"
                  onMouseDown={event => event.preventDefault()} onClick={() => {
                    fontRef.current.removeAttribute('open');
                    execute({ type: 'style', range: snapshot.selection.from !== snapshot.selection.to, style: { fontSize: size } });
                  }} />)}
              </Section>
            </details>
            <Text className="tool-separator" aria-hidden="true" />
            {['paragraph', 'h1', 'h2', 'h3', 'h4'].map(block => <Button key={block} label={block === 'paragraph' ? '正文' : block.toUpperCase()} variant="ghost" size="sm"
              isDisabled={layoutLocked} aria-pressed={editor.isActive(block === 'paragraph' ? 'paragraph' : 'heading', block === 'paragraph' ? {} : { level: Number(block[1]) })}
              onMouseDown={event => event.preventDefault()} onClick={() => execute({ type: 'setBlock', block })} />)}
            <Text className="tool-separator" aria-hidden="true" />
            <ToolButton label="引用" icon={<Quote size={16} />} isDisabled={layoutLocked} onClick={() => execute({ type: 'toggleQuote' })} />
            <ToolButton label="无序列表" icon={<List size={17} />} isDisabled={layoutLocked} onClick={() => execute({ type: 'toggleList', kind: 'bullet' })} />
            <ToolButton label="有序列表" icon={<ListOrdered size={17} />} isDisabled={layoutLocked} onClick={() => execute({ type: 'toggleList', kind: 'ordered' })} />
            <ToolButton label={image ? '替换选中图片' : '插入本地图片'} icon={<ImagePlus size={17} />} isDisabled={layoutLocked} onClick={chooseImage} />
            {layoutLocked && <Text id={layoutNoticeId} className="layout-lock-notice" role="status">
              <LockKeyhole size={14} aria-hidden="true" />AI 正在排版，暂时不能编辑或复制。
            </Text>}
          </Section>
          <Section padding={0} className={night ? 'editor-body editor-hidden' : 'editor-body'}><EditorContent editor={editor} /></Section>
          {night && <NightReading html={nightHTML} night />}
        </Section>
        </Section>
        <ProPromotionTab disabled={layoutLocked} onClick={() => setPromotionOpen(true)} />
      </section>

      <Section padding={0} className="inspector" role="complementary" aria-label="排版面板">
        <Section padding={0} className="inspector-tabs" role="tablist" aria-label="右侧面板" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'templates' : event.key === 'End' ? 'adjustments' : panel === 'templates' ? 'adjustments' : 'templates';
          changePanel(next); event.currentTarget.querySelector(`[data-panel="${next}"]`).focus();
        }}>
          {tabs.map(([value, label]) => <Button key={value} label={label} role="tab" data-panel={value} id={`${panelId}-${value}`} variant="ghost"
            tabIndex={panel === value ? 0 : -1} aria-selected={panel === value} aria-controls={`${panelId}-content`} onClick={() => changePanel(value)} />)}
        </Section>
        <Section padding={0} className="inspector-content" role="tabpanel" id={`${panelId}-content`} aria-labelledby={`${panelId}-${panel}`}>
          {panel === 'templates' ? <TemplateGallery selected={snapshot.doc.attrs.templateId}
            category={templateCategory} onCategoryChange={setTemplateCategory} disabled={layoutLocked}
            onSelect={templateId => execute({ type: 'template', templateId })} /> : <>
            <Heading level={2} className="inspector-title">样式调整</Heading>
            <Heading level={3} className="adjustment-heading">格式参数</Heading>
            <Section padding={0} className="format-parameter">
              <Text className="parameter-label"><ArrowLeftRight size={16} />页边距</Text>
              <Section padding={0} className="parameter-stepper">
                <ToolButton label="页边距减小" icon={<Minus size={15} />} isDisabled={layoutLocked || margin <= 0} onClick={() => execute({ type: 'pageMargin', value: margin - 1 })} />
                <output aria-label="当前页边距">{margin}<Text as="small" className="parameter-unit">px</Text></output>
                <ToolButton label="页边距增大" icon={<Plus size={15} />} isDisabled={layoutLocked || margin >= MAX_PAGE_MARGIN} onClick={() => execute({ type: 'pageMargin', value: margin + 1 })} />
              </Section>
            </Section>
            <Button className="margin-reset" label="恢复模板页边距" variant="ghost" icon={<RotateCcw size={13} />}
              isDisabled={layoutLocked || snapshot.doc.attrs.pageMargin === null} onClick={() => execute({ type: 'pageMargin', value: null })} />
          </>}
        </Section>
        <Section padding={0} className="inspector-footer">
          {image && <TextInput label="图注" isDisabled={layoutLocked} value={image.attrs.caption || ''} onChange={caption => execute({ type: 'replaceImage', nodeId: image.id, assetId: image.attrs.src.slice(6), caption })} width="100%" />}
          {error && <Text role="alert" className="editor-alert">{error}</Text>}
          <Text role="status" aria-live="polite" className="status-message" data-failed={status.includes('失败') || status.includes('断开')}>
            {status}
          </Text>
          <Section padding={0} className="output-actions" role="group" aria-label="公众号输出">
            <Button label="复制到公众号" className="output-action" width="100%" variant="primary" icon={<Clipboard size={15} />} isLoading={copying} isDisabled={layoutLocked} onClick={() => action(copy)} />
            <Section padding={0} className="pro-output">
              <Button label="推送到草稿箱" aria-describedby={proLabelId} className="output-action" width="100%" icon={<Send size={15} />} variant="secondary" aria-haspopup="dialog" isDisabled={layoutLocked || copying} onClick={() => setPromotionOpen(true)} />
              <Text id={proLabelId} className="pro-ribbon">Pro</Text>
            </Section>
          </Section>
        </Section>
      </Section>
    </Section>
    <ProPromotion open={promotionOpen && !layoutLocked} onOpenChange={setPromotionOpen} />
    <BlockControls api={api} snapshot={snapshot} disabled={layoutLocked || night || !editor.isEditable} onError={setError} />
    <ArticleOutline api={api} snapshot={snapshot} night={night} />
    <input ref={uploadRef} className="editor-hidden" aria-label="上传图片" type="file" disabled={layoutLocked} accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} onCancel={() => { uploadTarget.current = null; }} />
  </>);
}
