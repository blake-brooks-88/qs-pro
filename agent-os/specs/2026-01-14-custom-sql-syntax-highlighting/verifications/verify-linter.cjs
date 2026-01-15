/**
 * SQL Linter AST Integration Verification Script
 *
 * This script verifies the SQL linter behavior in the QS Pro web app using Playwright.
 * It tests 5 scenarios:
 * 1. Basic Editor Loading
 * 2. Warning does NOT block execution
 * 3. Error DOES block execution
 * 4. Empty query (prereq) blocks execution
 * 5. Valid query allows execution
 */

const { chromium } = require('playwright');
const { join } = require('path');
const { writeFileSync, existsSync, mkdirSync } = require('fs');

const screenshotsDir = join(__dirname, 'screenshots');

// Ensure screenshots directory exists
if (!existsSync(screenshotsDir)) {
  mkdirSync(screenshotsDir, { recursive: true });
}

const APP_URL = 'http://localhost:5173';

async function verifyLinter() {
  const results = {
    scenario1: { name: 'Basic Editor Loading', passed: false, notes: '' },
    scenario2: { name: 'Warning Does NOT Block Execution', passed: false, notes: '' },
    scenario3: { name: 'Error DOES Block Execution', passed: false, notes: '' },
    scenario4: { name: 'Empty Query (Prereq) Blocks Execution', passed: false, notes: '' },
    scenario5: { name: 'Valid Query Allows Execution', passed: false, notes: '' },
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    console.log('Starting SQL Linter Verification...\n');

    // Scenario 1: Basic Editor Loading
    console.log('Scenario 1: Basic Editor Loading');
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for Monaco editor to be visible
    await page.waitForSelector('.monaco-editor', { timeout: 30000 });
    await page.waitForTimeout(2000); // Additional wait for Monaco to initialize

    // Check if Monaco editor loaded
    const monacoEditor = await page.locator('.monaco-editor').first();
    const editorExists = await monacoEditor.isVisible();

    if (editorExists) {
      results.scenario1.passed = true;
      results.scenario1.notes = 'Monaco editor loaded successfully';
    } else {
      results.scenario1.notes = 'Monaco editor not found';
    }

    await page.screenshot({ path: join(screenshotsDir, '1-initial-state.png'), fullPage: false });
    console.log(`  Result: ${results.scenario1.passed ? 'PASSED' : 'FAILED'} - ${results.scenario1.notes}\n`);

    // Helper function to type into Monaco editor and dismiss autocomplete
    async function typeInEditor(sql) {
      // Click on Monaco's view lines area to focus
      await page.locator('.monaco-editor .view-lines').click({ force: true });
      await page.waitForTimeout(100);
      // Select all and replace
      await page.keyboard.press('Control+A');
      await page.waitForTimeout(50);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(50);
      // Type the new SQL character by character
      for (const char of sql) {
        await page.keyboard.type(char, { delay: 5 });
      }
      // Dismiss any autocomplete dropdown by pressing Escape multiple times
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      // Wait for diagnostics to process (debounce is 200ms, but we also need time for worker response)
      await page.waitForTimeout(2500);
    }

    // Helper function to check if RUN button is disabled via multiple methods
    async function checkRunButtonState() {
      // Find the button by its structure: look for the button that contains RUN text and is in the toolbar
      const runButton = page.locator('button').filter({ hasText: 'RUN' }).first();

      // Get computed style via JS evaluation
      const buttonState = await runButton.evaluate((btn) => {
        const style = window.getComputedStyle(btn);
        return {
          className: btn.className,
          disabled: btn.disabled,
          opacity: style.opacity,
          cursor: style.cursor,
          innerText: btn.innerText,
        };
      });

      console.log(`    Debug: innerText = "${buttonState.innerText}"`);
      console.log(`    Debug: disabled attr = ${buttonState.disabled}`);
      console.log(`    Debug: opacity = ${buttonState.opacity}`);
      console.log(`    Debug: cursor = ${buttonState.cursor}`);
      console.log(`    Debug: class = "${buttonState.className}"`);

      // Check if button is disabled
      // The button is considered disabled if:
      // 1. The disabled property is true
      // 2. The class contains opacity-60 or cursor-not-allowed
      // 3. The computed opacity is 0.6 or the cursor is not-allowed
      const isDisabledByAttr = buttonState.disabled === true;
      const isDisabledByClass = buttonState.className.includes('opacity-60') ||
                                buttonState.className.includes('cursor-not-allowed');
      const isDisabledByStyle = parseFloat(buttonState.opacity) < 0.8 ||
                                buttonState.cursor === 'not-allowed';

      console.log(`    Debug: isDisabledByAttr=${isDisabledByAttr}, isDisabledByClass=${isDisabledByClass}, isDisabledByStyle=${isDisabledByStyle}`);

      return isDisabledByAttr || isDisabledByClass || isDisabledByStyle;
    }

    // Scenario 2: Warning Does NOT Block Execution
    console.log('Scenario 2: Warning Does NOT Block Execution');
    // Type SQL that triggers a warning but should NOT block
    const warningSQL = "SELECT * FROM [Subscribers]";
    await typeInEditor(warningSQL);

    // Take screenshot before checking
    await page.screenshot({ path: join(screenshotsDir, '2-warning-not-blocking.png'), fullPage: false });

    // Check RUN button state
    const isDisabled2 = await checkRunButtonState();

    if (!isDisabled2) {
      results.scenario2.passed = true;
      results.scenario2.notes = 'RUN button is ENABLED (warning does not block)';
    } else {
      results.scenario2.notes = 'RUN button is DISABLED (warning is incorrectly blocking)';
    }

    console.log(`  Result: ${results.scenario2.passed ? 'PASSED' : 'FAILED'} - ${results.scenario2.notes}\n`);

    // Scenario 3: Error DOES Block Execution
    console.log('Scenario 3: Error DOES Block Execution');
    // Type SQL that triggers an error
    const errorSQL = "INSERT INTO [Test] VALUES (1)";
    await typeInEditor(errorSQL);

    // Take screenshot before checking
    await page.screenshot({ path: join(screenshotsDir, '3-error-blocking.png'), fullPage: false });

    // Check RUN button state
    const isDisabled3 = await checkRunButtonState();

    if (isDisabled3) {
      results.scenario3.passed = true;
      results.scenario3.notes = 'RUN button is DISABLED (error correctly blocks)';
    } else {
      results.scenario3.notes = 'RUN button is ENABLED (error is NOT blocking - BUG!)';
    }

    console.log(`  Result: ${results.scenario3.passed ? 'PASSED' : 'FAILED'} - ${results.scenario3.notes}\n`);

    // Scenario 4: Empty Query (Prereq) Blocks Execution
    console.log('Scenario 4: Empty Query (Prereq) Blocks Execution');
    // Clear the editor
    await page.locator('.monaco-editor .view-lines').click({ force: true });
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2500);

    // Take screenshot before checking
    await page.screenshot({ path: join(screenshotsDir, '4-empty-query-blocking.png'), fullPage: false });

    // Check RUN button state
    const isDisabled4 = await checkRunButtonState();

    if (isDisabled4) {
      results.scenario4.passed = true;
      results.scenario4.notes = 'RUN button is DISABLED (empty query correctly blocks)';
    } else {
      results.scenario4.notes = 'RUN button is ENABLED (empty query is NOT blocking - BUG!)';
    }

    console.log(`  Result: ${results.scenario4.passed ? 'PASSED' : 'FAILED'} - ${results.scenario4.notes}\n`);

    // Scenario 5: Valid Query Allows Execution
    console.log('Scenario 5: Valid Query Allows Execution');
    // Type valid SQL
    const validSQL = "SELECT SubscriberKey, EmailAddress FROM [Subscribers] WHERE Status = 'Active'";
    await typeInEditor(validSQL);

    // Take screenshot before checking
    await page.screenshot({ path: join(screenshotsDir, '5-valid-query-enabled.png'), fullPage: false });

    // Check RUN button state
    const isDisabled5 = await checkRunButtonState();

    if (!isDisabled5) {
      results.scenario5.passed = true;
      results.scenario5.notes = 'RUN button is ENABLED (valid query allows execution)';
    } else {
      results.scenario5.notes = 'RUN button is DISABLED (valid query is incorrectly blocked)';
    }

    console.log(`  Result: ${results.scenario5.passed ? 'PASSED' : 'FAILED'} - ${results.scenario5.notes}\n`);

  } catch (error) {
    console.error('Error during verification:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }

  // Generate summary
  const allPassed = Object.values(results).every(r => r.passed);
  const passedCount = Object.values(results).filter(r => r.passed).length;
  const totalCount = Object.values(results).length;

  console.log('='.repeat(60));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Overall: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${passedCount}/${totalCount})`);
  console.log('');
  Object.entries(results).forEach(([key, result]) => {
    const status = result.passed ? '[PASS]' : '[FAIL]';
    console.log(`${status} ${result.name}: ${result.notes}`);
  });
  console.log('');
  console.log(`Screenshots saved to: ${screenshotsDir}`);

  // Write results to JSON file
  writeFileSync(
    join(screenshotsDir, 'verification-results.json'),
    JSON.stringify({ results, summary: { allPassed, passedCount, totalCount } }, null, 2)
  );

  return { results, allPassed };
}

verifyLinter().catch(console.error);
