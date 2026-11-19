import React, { useEffect, useRef } from 'react';
import { Section } from '@astryxdesign/core/Section';
import darkMode from '../render/mp-darkmode.cjs';

// Night appearance only; daytime always shows the live editor. No separate publication preview.
export function NightReading({ html, night }) {
  const ref = useRef(null);
  useEffect(() => {
    const host = ref.current;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>:host{display:block;width:100%}img{max-width:100%}h1,h2,h3,h4,[role="heading"]{scroll-margin-top:var(--reading-scroll-margin,16px)}</style>${night ? darkMode.simulateDark(html) : html}`;
  }, [html, night]);
  return <Section ref={ref} padding={0} className="night-reading" aria-label="夜间阅读显示" />;
}

export const TemplateThumbnail = React.memo(function TemplateThumbnail({ html, name }) {
  const ref = useRef(null);
  useEffect(() => {
    const frame = ref.current;
    const resize = () => frame.style.setProperty('--thumbnail-scale', String(frame.parentElement.clientWidth / 390));
    const observer = new ResizeObserver(resize);
    observer.observe(frame.parentElement);
    resize();
    return () => observer.disconnect();
  }, []);
  return <figure className="template-cover" aria-hidden="true">
    <iframe ref={ref} title={`${name}模板缩略图`} tabIndex={-1} loading="lazy" sandbox="allow-same-origin" srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;width:390px">${html}</body></html>`} />
  </figure>;
});
