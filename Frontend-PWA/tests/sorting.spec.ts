import { test, expect } from '@playwright/test';

test('Leaderboard sorting test', async ({ page }) => {
  await page.goto('http://localhost:3000/Clash-Manager/#/');
  
  // Set synthetic mode
  await page.evaluate(() => {
    localStorage.setItem('clash_manager_synthetic_mode', 'true');
    localStorage.setItem('clash_manager_blueprint_mode', 'true');
    location.reload();
  });
  
  await page.waitForSelector('.player-name');

  // Helper to get names
  const getNames = async () => {
    return await page.$$eval('.player-name', (els) => els.map(el => el.textContent.trim()));
  };

  const namesInitial = await getNames();
  console.log('Initial names:', namesInitial.slice(0, 5));

  // Change sort to Name
  await page.selectOption('select[aria-label="Sort by"]', 'name');
  
  // Wait for potential animation/re-render
  await page.waitForTimeout(1000);

  const namesSortedByName = await getNames();
  console.log('Sorted by Name:', namesSortedByName.slice(0, 5));

  // Check if it's actually sorted
  const expectedSorted = [...namesSortedByName].sort((a, b) => a.localeCompare(b));
  expect(namesSortedByName).toEqual(expectedSorted);
  
  console.log('Alphabetical sort verified!');
  
  // Change sort to Trophies
  await page.selectOption('select[aria-label="Sort by"]', 'trophies');
  await page.waitForTimeout(1000);
  
  const namesSortedByTrophies = await getNames();
  console.log('Sorted by Trophies:', namesSortedByTrophies.slice(0, 5));
  
  expect(namesSortedByTrophies).not.toEqual(namesSortedByName);
});
