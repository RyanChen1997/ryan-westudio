import React from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { themes, defaultThemeSlug } from './astryx-themes.mjs';
import EditorFrame from './EditorFrame.jsx';
createRoot(document.getElementById('root')).render(<Theme theme={themes[defaultThemeSlug]} mode="light"><EditorFrame /></Theme>);
