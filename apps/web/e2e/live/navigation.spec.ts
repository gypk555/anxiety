import { answerDifficulty, answerItems, expect, expectAccountHome, resultHeading, signUp, test } from './support';

test('back and forward walk through the check-in, keeping answers', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start the check-in' }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
  await expect(page).toHaveURL(/\/check-in\/1$/);
  await answerItems(page, [1, 2, 3]);
  await expect(page).toHaveURL(/\/check-in\/4$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await expect(page.getByRole('button', { name: 'Nearly every day' })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/check-in\/2$/);
  await expect(page.getByRole('button', { name: 'More than half the days' })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page).toHaveURL(/\/check-in\/3$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/check-in\/4$/);

  // The on-screen back does the same as the browser's.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/check-in\/3$/);

  // Change an answer on the way back through: the new one counts.
  await page.getByRole('button', { name: 'Not at all' }).click();
  await expect(page).toHaveURL(/\/check-in\/4$/);
  await answerItems(page, [1, 2, 0, 1, 1, 1, 1], 3);
  await answerDifficulty(page, 0);
  await expect(page).toHaveURL(/\/result$/);
  await expect(resultHeading(page)).toContainText('7 out of 21');

  // Back from the result: the check-in has finished, so it does not reopen half-way.
  await page.goBack();
  await expect(page).toHaveURL(/\/check-in/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Your check-in result is still here/ })).toBeVisible();
});

test('skipping ahead by URL lands on the first unanswered question', async ({ page }) => {
  await page.goto('/check-in');
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerItems(page, [1]);
  await page.goto('/check-in/6');
  await expect(page).toHaveURL(/\/check-in\/2$/);
  await page.goto('/check-in/difficulty');
  await expect(page).toHaveURL(/\/check-in\/2$/);
});

test('back and forward walk through the tabs', async ({ page }) => {
  await signUp(page, 'tabs');
  const tabs = page.getByRole('navigation', { name: 'Main' });
  await tabs.getByRole('link', { name: 'Tools' }).click();
  await expect(page).toHaveURL(/\/tools$/);
  await tabs.getByRole('link', { name: 'Journal' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Your thought records' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Trends' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('over time');
  await tabs.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('over time');
  await page.goBack();
  await expect(page).toHaveURL(/\/journal$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/tools$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expectAccountHome(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/tools$/);
});

test('back from Home after signing in does not return to the code screen', async ({ page }) => {
  await signUp(page, 'nocode');
  await page.goBack();
  await expect(page).not.toHaveURL(/\/sign-in\/code/);
  await expect(page).not.toHaveURL(/\/consent/);
});

test('a guest opening a tab that needs an account can come straight back', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Journal' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fjournal$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How have the last two weeks been?' })).toBeVisible();
});
