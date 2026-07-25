/**
 * React hook for the accessibility text scale (F-031).
 * Returns the current multiplier and re-renders on change.
 */

import {useState, useEffect} from 'react';
import {getFontScale, subscribeFontScale} from './fontScale';

export function useFontScale(): number {
  const [scale, setScale] = useState<number>(getFontScale());
  useEffect(() => subscribeFontScale(setScale) as () => void, []);
  return scale;
}
