/**
 * OCR utility -- shared recognition logic for Capture and QuickAdd.
 *
 * Both screens need the same pipeline: get page context, filter elements,
 * call recognizeElements. This module unifies that logic and adds diagnostic
 * logging to help debug error 117 ("Recognition failed").
 */

import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {log} from './debug';

const TAG = 'OCR';

// Timeout wrapper -- SDK calls can hang on device
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Recycle elements returned by getLassoElements()/getElements() to free
 * native-side memory. Safe to call with anything; ignores failures.
 * Callers own recycling -- this module never recycles the arrays it is
 * passed, since the caller may still need the elements afterwards.
 */
export function recycleElements(elements) {
  if (!Array.isArray(elements)) return;
  try {
    elements.forEach(el => {
      if (el && typeof el.recycle === 'function') el.recycle();
    });
  } catch {}
}

/**
 * Log detailed diagnostic info about elements for debugging recognition failures.
 */
function logElementDiagnostics(elements, label) {
  const typeCounts = {};
  let totalElements = elements.length;

  for (const el of elements) {
    const t = el.type ?? 'undefined';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  log(TAG, `${label}: ${totalElements} elements, types: ${JSON.stringify(typeCounts)}`);

  // Log stroke details for the first few strokes
  const strokes = elements.filter(el => el.type === 0);
  for (let i = 0; i < Math.min(strokes.length, 3); i++) {
    const el = strokes[i];
    const s = el.stroke;
    const keys = Object.keys(el).sort().join(',');
    log(TAG, `  stroke[${i}] keys: ${keys}`);
    log(TAG, `  stroke[${i}] numInPage=${el.numInPage} maxX=${el.maxX} maxY=${el.maxY} thickness=${el.thickness} status=${el.status}`);
    if (s) {
      const sKeys = Object.keys(s).sort().join(',');
      log(TAG, `  stroke[${i}].stroke keys: ${sKeys}`);
      log(TAG, `  stroke[${i}].stroke penColor=${s.penColor} penType=${s.penType}`);

      // Check point arrays -- these are the critical data for recognition
      const pointInfo = [];
      if (s.points) pointInfo.push(`points=${Array.isArray(s.points) ? s.points.length : typeof s.points}`);
      if (s.pressures) pointInfo.push(`pressures=${Array.isArray(s.pressures) ? s.pressures.length : typeof s.pressures}`);
      if (s.recognPoints) pointInfo.push(`recognPoints=${Array.isArray(s.recognPoints) ? s.recognPoints.length : typeof s.recognPoints}`);
      if (s.eraseLineTrailNums) pointInfo.push(`eraseLineTrailNums=${Array.isArray(s.eraseLineTrailNums) ? s.eraseLineTrailNums.length : typeof s.eraseLineTrailNums}`);
      if (s.flagDraw) pointInfo.push(`flagDraw=${Array.isArray(s.flagDraw) ? s.flagDraw.length : typeof s.flagDraw}`);
      if (s.markPenDirection) pointInfo.push(`markPenDirection=${Array.isArray(s.markPenDirection) ? s.markPenDirection.length : typeof s.markPenDirection}`);
      log(TAG, `  stroke[${i}].stroke data: ${pointInfo.length ? pointInfo.join(', ') : '(no point arrays found)'}`);

      // If points exist and are arrays, log first few for coordinate reference
      if (Array.isArray(s.points) && s.points.length > 0) {
        const first = s.points[0];
        const last = s.points[s.points.length - 1];
        log(TAG, `  stroke[${i}] points[0]=${JSON.stringify(first)} points[${s.points.length - 1}]=${JSON.stringify(last)}`);
      }
      if (Array.isArray(s.recognPoints) && s.recognPoints.length > 0) {
        const first = s.recognPoints[0];
        log(TAG, `  stroke[${i}] recognPoints[0]=${JSON.stringify(first)}`);
      }
    } else {
      log(TAG, `  stroke[${i}].stroke = null/undefined`);
    }
  }

  // Log summary of non-stroke elements
  const nonStrokes = elements.filter(el => el.type !== 0);
  for (let i = 0; i < Math.min(nonStrokes.length, 3); i++) {
    const el = nonStrokes[i];
    log(TAG, `  non-stroke[${i}] type=${el.type} numInPage=${el.numInPage} keys=${Object.keys(el).sort().join(',')}`);
  }
}

/**
 * Get page context (file path, page number, page size).
 * Returns defaults if any call fails -- recognition can still be attempted.
 */
async function getPageContext(logFn) {
  let filePath = '';
  let pageNum = 0;
  let pageSize = {width: 1404, height: 1872}; // A5X default
  let deviceType = null;
  let fileMachineType = null;

  // Batch 1: independent fetches in parallel
  const [fpResult, pnResult, dtResult] = await Promise.all([
    withTimeout(PluginCommAPI.getCurrentFilePath(), 3000, 'getCurrentFilePath').catch(e => {
      logFn(`getCurrentFilePath failed: ${e.message}`);
      return null;
    }),
    withTimeout(PluginCommAPI.getCurrentPageNum(), 3000, 'getCurrentPageNum').catch(e => {
      logFn(`getCurrentPageNum failed: ${e.message}`);
      return null;
    }),
    withTimeout(PluginManager.getDeviceType(), 3000, 'getDeviceType').catch(e => {
      logFn(`getDeviceType failed: ${e.message}`);
      return null;
    }),
  ]);

  filePath = fpResult?.result || '';
  pageNum = pnResult?.result ?? 0;
  deviceType = dtResult;
  logFn(`filePath: ${filePath}`);
  logFn(`pageNum: ${pageNum}`);
  logFn(`getDeviceType: ${JSON.stringify(deviceType)}`);

  // Batch 2: fetches that depend on filePath/pageNum
  if (filePath) {
    const [psResult, fmtResult] = await Promise.all([
      withTimeout(PluginFileAPI.getPageSize(filePath, pageNum), 5000, 'getPageSize').catch(e => {
        logFn(`getPageSize failed, using default: ${e.message}`);
        return null;
      }),
      withTimeout(PluginFileAPI.getFileMachineType(filePath), 3000, 'getFileMachineType').catch(e => {
        logFn(`getFileMachineType failed: ${e.message}`);
        return null;
      }),
    ]);

    if (psResult) {
      logFn(`getPageSize raw: ${JSON.stringify(psResult)}`);
      if (psResult?.result) pageSize = psResult.result;
      else if (psResult?.width && psResult?.height) pageSize = psResult;
    }
    fileMachineType = fmtResult;
    logFn(`getFileMachineType: ${JSON.stringify(fileMachineType)}`);
  }

  logFn(`pageSize: ${pageSize.width}x${pageSize.height}`);

  return {filePath, pageNum, pageSize, deviceType, fileMachineType};
}

/**
 * Run OCR on lasso elements.
 *
 * @param {Array} allElements - raw elements from getLassoElements().result
 * @param {Function} logFn - logging callback (writes to screen trace + debug log)
 * @returns {{success: boolean, text: string|null, error: object|null, pageContext: object}}
 */
export async function recognizeLassoElements(allElements, logFn) {
  const _log = logFn || (msg => log(TAG, msg));

  // 1. Get page context
  _log('Getting page context...');
  const {filePath, pageNum, pageSize, deviceType, fileMachineType} = await getPageContext(_log);

  // 2. Log full element diagnostics
  logElementDiagnostics(allElements, 'all lasso elements');

  // 3. Filter to supported types (strokes=0, text boxes=500)
  // SDK docs: recognizeElements "currently supports only strokes and text boxes"
  const supported = allElements.filter(el => el.type === 0 || el.type === 500);
  const strokes = supported.filter(el => el.type === 0);
  const textBoxes = supported.filter(el => el.type === 500);
  const filtered = allElements.length - supported.length;

  _log(`Filtered: ${strokes.length} strokes + ${textBoxes.length} textBoxes = ${supported.length} supported (${filtered} filtered out)`);

  if (supported.length === 0) {
    _log('ERROR: no supported elements after filtering');
    return {success: false, text: null, error: {code: -1, message: 'No strokes or text boxes in selection'}, pageContext: {filePath, pageNum, pageSize}};
  }

  // 4. Detect actual EMR range from element data and compute recognition size.
  // The SDK's recognizeElements uses the size param to map EMR coords to a pixel
  // canvas. If the device's actual EMR range exceeds what the reported page size
  // implies, strokes in the lower page region get clipped (error 117).
  // Documented A5X EMR max: 15819x11864 (for 1404x1872 page).
  // Documented Manta EMR max: 21632x16224 (for 1920x2560 page).
  // Some A5X units report EMR values in Manta range -- detect and compensate.
  let emrMaxX = 0, emrMaxY = 0;
  for (const el of strokes) {
    if (el.maxX !== undefined && el.maxX > emrMaxX) emrMaxX = el.maxX;
    if (el.maxY !== undefined && el.maxY > emrMaxY) emrMaxY = el.maxY;
  }

  // Known EMR max for standard page sizes (from Supernote coordinate system docs)
  const A5X_EMR_MAX_X = 15819;
  const A5X_EMR_MAX_Y = 11864;
  const MANTA_PAGE_SIZE = {width: 1920, height: 2560};

  let recognitionSize = pageSize;
  if (emrMaxX > A5X_EMR_MAX_X || emrMaxY > A5X_EMR_MAX_Y) {
    const isPortrait = pageSize.width <= pageSize.height;
    recognitionSize = isPortrait
      ? MANTA_PAGE_SIZE
      : {width: MANTA_PAGE_SIZE.height, height: MANTA_PAGE_SIZE.width};
    _log(`EMR range from strokes: maxX=${emrMaxX} maxY=${emrMaxY} -- exceeds A5X range (${A5X_EMR_MAX_X}/${A5X_EMR_MAX_Y}), using Manta page size ${recognitionSize.width}x${recognitionSize.height}`);
  } else {
    _log(`EMR range from strokes: maxX=${emrMaxX} maxY=${emrMaxY} -- within A5X range, using reported ${pageSize.width}x${pageSize.height}`);
  }
  _log(`Device info: deviceType=${JSON.stringify(deviceType)} fileMachineType=${JSON.stringify(fileMachineType)}`);

  // 5. Call recognizeElements
  _log(`recognizeElements: ${supported.length} elements, size=${recognitionSize.width}x${recognitionSize.height}`);
  const recognized = await withTimeout(
    PluginCommAPI.recognizeElements(supported, recognitionSize),
    30000,
    'recognizeElements',
  );

  // 5. Log full response for diagnosis
  const rawStr = JSON.stringify(recognized);
  _log(`recognizeElements response (${rawStr.length} chars): ${rawStr.slice(0, 300)}`);
  if (rawStr.length > 300) {
    _log(`  ...continued: ${rawStr.slice(300, 600)}`);
  }

  if (recognized?.success && recognized?.result) {
    _log(`OCR success: "${recognized.result.slice(0, 80)}"`);
    return {
      success: true,
      text: recognized.result.trim(),
      error: null,
      pageContext: {filePath, pageNum, pageSize},
    };
  }

  // Failed -- log error details
  const errCode = recognized?.error?.code ?? 'none';
  const errMsg = recognized?.error?.message ?? 'none';
  _log(`OCR failed: code=${errCode} message="${errMsg}"`);
  _log(`  success=${recognized?.success} result=${recognized?.result} resultType=${typeof recognized?.result}`);

  return {
    success: false,
    text: null,
    error: recognized?.error || {code: -1, message: 'Unknown recognition failure'},
    pageContext: {filePath, pageNum, pageSize},
  };
}
