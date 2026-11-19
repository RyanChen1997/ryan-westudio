import React from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ArrowUpRight, ChevronUp, Sparkles } from 'lucide-react';

const website = 'https://westudio.airyanchen.cc/';
const benefits = [
  ['复刻喜欢的排版', '给一篇公众号文章的链接，把它的排版做成可复用的专属模板。'],
  ['一键推送到草稿箱', '确认后，将排好的文章送到公众号草稿箱。'],
  ['更多风格的内置模板'],
  ['享受永久更新'],
];

export function ProPromotionTab({ onClick }) {
  return <aside className="pro-dock" aria-label="Pro 版介绍">
    <Button label="WeStudio Pro · 查看更多功能" variant="secondary" className="pro-dock-button"
      icon={<Sparkles size={14} aria-hidden="true" />} aria-haspopup="dialog" onClick={onClick}>
      <Text as="span" className="pro-dock-title">WeStudio Pro · 查看更多功能 <ChevronUp size={14} aria-hidden="true" /></Text>
    </Button>
  </aside>;
}

export function ProPromotion({ open, onOpenChange }) {
  const close = () => onOpenChange(false);
  return <Dialog isOpen={open} onOpenChange={onOpenChange} width="30rem" purpose="info" className="pro-promotion">
    <Layout
      header={<DialogHeader title="升级到 Ryan-WeStudio-Pro" onOpenChange={onOpenChange} />}
      content={<LayoutContent>
        <VStack gap={3}>
          <Text type="body" as="p">Pro 版专属功能：</Text>
          <ul className="pro-benefits">
            {benefits.map(([title, detail]) => <li key={title}>
              <Text type="body" as="strong">{title}</Text>{detail && <Text type="body" color="secondary" as="span">：{detail}</Text>}
            </li>)}
          </ul>
        </VStack>
      </LayoutContent>}
      footer={<LayoutFooter>
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button label="继续编辑" variant="ghost" onClick={close} />
          <Button label="前往官网购买 Pro" variant="primary" href={website} target="_blank" rel="noopener noreferrer"
            icon={<ArrowUpRight size={15} aria-hidden="true" />} />
        </HStack>
      </LayoutFooter>}
    />
  </Dialog>;
}
