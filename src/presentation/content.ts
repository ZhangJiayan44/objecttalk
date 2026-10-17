export const slides = [
  { id: "hello", title: "ObjectTalk: English practice, played together" },
  { id: "why", title: "More exposure. Too little conversation." },
  { id: "how", title: "You see the goal. I make the move." },
  { id: "demo", title: "Product demo" },
  { id: "difference", title: "The task takes two people." },
  { id: "people", title: "After class, keep playing at home." },
  { id: "harness", title: "We built a pipeline for new scenes." },
  { id: "content", title: "Everyday English, across four scenes." },
  { id: "business", title: "Free to try. Subscribe for new scenes." },
  { id: "future", title: "Thank you." },
] as const;

export function slideFromHash(hash: string) {
  const value = Number(hash.replace(/^#/, ''));
  return Number.isInteger(value) && value >= 1 && value <= slides.length ? value - 1 : 0;
}
