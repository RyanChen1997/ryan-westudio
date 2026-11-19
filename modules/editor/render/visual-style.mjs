export function visualCSS(attrs = {}) {
  return [attrs.fontSize && `font-size:${attrs.fontSize}px`, attrs.color && `color:${attrs.color}`, attrs.borderColor && `border-color:${attrs.borderColor}`, attrs.borderWidth != null && `border-width:${attrs.borderWidth}px;border-style:solid`].filter(Boolean).join(';');
}
export const decorationImageStyle = 'width:64px;height:auto;display:inline-block;vertical-align:baseline;';
export const codeBlockInnerStyle = 'font:inherit;color:inherit;background:transparent;padding:0;border:0;';
export const joinCSS = (...declarations) => declarations.filter(Boolean).join(';');
