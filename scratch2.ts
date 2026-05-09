import { CARD_XP_TABLE } from "./Frontend-PWA/src/features/laboratory/logic/Registry";

let maxXPPerCard = 0;
for (let i = 2; i <= 16; i++) {
  if (CARD_XP_TABLE[i]) maxXPPerCard += Number(CARD_XP_TABLE[i]);
}
console.log("Max XP per card from level 1 to 16:", maxXPPerCard);
console.log("115 cards max XP:", maxXPPerCard * 115);
console.log("XP needed for Level 80:", 10938770);
