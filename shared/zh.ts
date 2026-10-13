import type { ItemKind } from './types';

/**
 * Simplified Chinese names for every built-in and shipped item kind. Kept
 * apart from the catalog so the data files stay readable; `withZh` fills in
 * `ItemKind.zh` when a kind has none (agent-made and Object Studio kinds can
 * carry their own). Used by the word cards, the word book and the offline
 * glossary of the Chinese lifeline.
 */
export const ZH: Record<string, string> = {
  rocket: '火箭',
  teddy: '泰迪熊/玩具熊/小熊',
  cupcake: '纸杯蛋糕/杯子蛋糕',
  sneaker: '运动鞋/球鞋',
  controller: '游戏手柄/手柄',
  mug: '马克杯/杯子',
  camera: '相机/照相机',
  alarm: '闹钟',
  headphones: '耳机',
  glasses: '眼镜',
  watch: '手表',
  cap: '帽子/棒球帽',
  key: '钥匙',
  phone: '手机',
  backpack: '书包/背包',
  coffee: '咖啡',
  soda: '汽水/可乐/饮料',
  doughnut: '甜甜圈',
  croissant: '牛角包/可颂',
  pizza: '披萨',
  burger: '汉堡',
  sandwich: '三明治',
  cake: '蛋糕',
  icecream: '冰淇淋/甜筒',
  // agent-made levels
  'fruit-market--apple': '苹果',
  'fruit-market--banana': '香蕉',
  'fruit-market--pear': '梨',
  'fruit-market--peach': '桃子/桃',
  'fruit-market--lemon': '柠檬',
  'fruit-market--strawberry': '草莓',
  'fruit-market--tomato': '西红柿/番茄',
  'fruit-market--carrot': '胡萝卜',
  'fruit-market--mushroom': '蘑菇',
  'fruit-market--avocado': '牛油果',
  'fruit-market--watermelon': '西瓜',
  'fruit-market--pineapple': '菠萝',
  'music-room--guitar': '吉他',
  'music-room--trumpet': '小号',
  'music-room--drum': '鼓',
  'music-room--violin': '小提琴',
  'music-room--saxophone': '萨克斯',
  'music-room--maracas': '沙锤',
  'music-room--microphone': '麦克风/话筒',
  'music-room--accordion': '手风琴',
};

export function withZh(k: ItemKind): ItemKind {
  return k.zh || !ZH[k.id] ? k : { ...k, zh: ZH[k.id] };
}

/** The first (most common) Chinese name, for display. */
export const zhName = (k: Pick<ItemKind, 'zh'> | undefined) => k?.zh?.split('/')[0] ?? '';
