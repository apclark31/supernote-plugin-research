/**
 * Temp Link Navigation -- cross-note navigation via temporary insertTextLink.
 *
 * Creates a tappable link on the current page (top-center)
 * pointing to a target note. On next plugin open, cleans up via deleteElements.
 *
 * NOTE: This is a workaround until Ratta exposes a direct note-open API.
 * TODO: Replace with direct navigation API when available.
 */

import {
  PluginNoteAPI,
  PluginFileAPI,
  PluginCommAPI,
} from 'sn-plugin-lib';
import RNFS from 'react-native-fs';
import {log, logError} from './debug';

const REGISTRY_DIR = '/storage/emulated/0/MyStyle/SuperTask';
const PENDING_FILE = REGISTRY_DIR + '/pending-temp-link.json';

// Marker prefix so we can identify our temp links when scanning elements
const TEMP_LINK_MARKER = '[ST-NAV]';

/**
 * Save pending temp link info to disk for cleanup later.
 */
async function savePending(info) {
  try {
    const dirExists = await RNFS.exists(REGISTRY_DIR);
    if (!dirExists) await RNFS.mkdir(REGISTRY_DIR);
    await RNFS.writeFile(PENDING_FILE, JSON.stringify(info), 'utf8');
    log('TempLink', `Saved pending: ${JSON.stringify(info)}`);
  } catch (e) {
    logError('TempLink', e);
  }
}

/**
 * Read pending temp link info (does not delete the file).
 */
async function readPending() {
  try {
    const exists = await RNFS.exists(PENDING_FILE);
    if (!exists) return null;
    const raw = await RNFS.readFile(PENDING_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    log('TempLink', `No pending link or read error: ${e.message}`);
    return null;
  }
}

/**
 * Clear the pending file after successful cleanup.
 */
async function clearPending() {
  try {
    const exists = await RNFS.exists(PENDING_FILE);
    if (exists) await RNFS.unlink(PENDING_FILE);
  } catch (e) {
    // non-fatal
  }
}

/**
 * Create a temp navigation link on the current page.
 * Placed at 85% from top, horizontally centered.
 *
 * @param {string} targetPath - Full path to the target .note file
 * @param {number} targetPage - Page number in target note (0-indexed)
 * @param {string} [taskName] - Task name to display in the link text
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function createTempLink(targetPath, targetPage = 0, taskName) {
  try {
    // Get current context
    const [fpResult, pageResult] = await Promise.all([
      PluginCommAPI.getCurrentFilePath(),
      PluginCommAPI.getCurrentPageNum(),
    ]);

    const sourcePath = fpResult?.result;
    const sourcePage = pageResult?.result;

    if (!sourcePath) {
      return {success: false, error: 'Could not get current file path'};
    }

    log('TempLink', `Creating temp link: ${sourcePath} p.${sourcePage} -> ${targetPath} p.${targetPage}`);

    // Save current note to ensure consistent state before inserting
    await PluginNoteAPI.saveCurrentNote();

    // Get page size for proportional placement
    let pageWidth = 1404;
    let pageHeight = 1872;
    try {
      const sizeResult = await PluginFileAPI.getPageSize(sourcePath, sourcePage);
      if (sizeResult?.success && sizeResult.result) {
        pageWidth = sizeResult.result.width || pageWidth;
        pageHeight = sizeResult.result.height || pageHeight;
      }
    } catch (e) {
      log('TempLink', `getPageSize failed, using defaults: ${e.message}`);
    }

    // Place at top of page, horizontally centered
    const linkWidth = 600;
    const linkHeight = 50;
    const linkLeft = Math.round((pageWidth - linkWidth) / 2);
    const linkTop = Math.round(pageHeight * 0.03);

    const showText = taskName
      ? `Tap to open: ${taskName}`
      : `Tap to open: ${targetPath.split('/').pop().replace('.note', '')}`;

    const textLink = {
      destPath: targetPath,
      destPage: targetPage,
      linkType: 1,        // 1 = jump to note file
      style: 1,           // 1 = solid border (visible)
      rect: {
        left: linkLeft,
        top: linkTop,
        right: linkLeft + linkWidth,
        bottom: linkTop + linkHeight,
      },
      fontSize: 24,
      fullText: `${TEMP_LINK_MARKER} ${showText}`,
      showText: showText,
      isItalic: 0,
    };

    const insertResult = await PluginNoteAPI.insertTextLink(textLink);
    log('TempLink', `insertTextLink result: ${JSON.stringify(insertResult)}`);

    if (!insertResult?.success) {
      return {
        success: false,
        error: `insertTextLink failed: ${insertResult?.error?.message || 'unknown'}`,
      };
    }

    // Save to persist the new link element to the file
    await PluginNoteAPI.saveCurrentNote();

    // Find the numInPage of the element we just inserted
    let numInPage = null;
    try {
      const elemsResult = await PluginFileAPI.getElements(sourcePage, sourcePath);
      if (elemsResult?.success && elemsResult.result) {
        for (const el of elemsResult.result) {
          if (el.type === 600 && el.link?.fullText?.includes(TEMP_LINK_MARKER)) {
            numInPage = el.numInPage;
          }
        }
      }
    } catch (scanErr) {
      log('TempLink', `Element scan failed (non-fatal): ${scanErr.message}`);
    }

    // Save pending info for cleanup
    await savePending({
      sourcePath,
      sourcePage,
      numInPage,
      markerText: TEMP_LINK_MARKER,
      targetPath,
      createdAt: new Date().toISOString(),
    });

    log('TempLink', `Temp link created. numInPage=${numInPage}.`);
    return {success: true, numInPage};

  } catch (e) {
    logError('TempLink', e);
    return {success: false, error: e.message};
  }
}

/**
 * Clean up any pending temp link. Call on every plugin open.
 *
 * Attempts deleteElements on the source page. If the element was already
 * removed (user deleted it, page cleared, etc.), fails silently.
 */
export async function cleanupTempLink() {
  const pending = await readPending();
  if (!pending) return;

  const {sourcePath, sourcePage, numInPage, markerText} = pending;
  log('TempLink', `Cleaning up temp link: ${sourcePath} p.${sourcePage} numInPage=${numInPage}`);

  try {
    if (numInPage != null) {
      // Fast path: we know the exact element index
      const result = await PluginFileAPI.deleteElements(sourcePath, sourcePage, [numInPage]);
      log('TempLink', `deleteElements result: ${JSON.stringify(result)}`);

      if (result?.success) {
        await clearPending();
        log('TempLink', 'Cleanup complete (by numInPage)');
        return;
      }
      // If deleteElements failed, fall through to scan
      log('TempLink', `deleteElements by numInPage failed, trying scan`);
    }

    // Slow path: scan elements and find by marker text
    const elemsResult = await PluginFileAPI.getElements(sourcePage, sourcePath);
    if (!elemsResult?.success || !elemsResult.result) {
      log('TempLink', 'Cleanup: getElements failed, clearing pending');
      await clearPending();
      return;
    }

    const toDelete = [];
    for (const el of elemsResult.result) {
      const text = el.link?.fullText || el.textBox?.textContentFull || '';
      if (text.includes(markerText)) {
        toDelete.push(el.numInPage);
      }
    }

    if (toDelete.length === 0) {
      log('TempLink', 'Cleanup: no matching elements found (already removed?)');
      await clearPending();
      return;
    }

    const result = await PluginFileAPI.deleteElements(sourcePath, sourcePage, toDelete);
    log('TempLink', `deleteElements(scan) result: ${JSON.stringify(result)}`);
    await clearPending();

    log('TempLink', `Cleanup complete (removed ${toDelete.length} elements)`);
  } catch (e) {
    // Non-fatal -- link may already be gone
    log('TempLink', `Cleanup error (non-fatal): ${e.message}`);
    await clearPending();
  }
}

