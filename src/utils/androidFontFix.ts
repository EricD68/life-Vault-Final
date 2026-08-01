import { Platform } from 'react-native';

/**
 * Fixes a documented class of Android bugs where certain OEM font
 * substitutions cause bold button text to be measured narrower than it's
 * actually rendered, clipping the last character(s). Different manufacturers
 * need different explicit font names to force consistent measure/render:
 *
 *   - OnePlus: needs 'Slate' (OnePlus's own bundled font name)
 *   - Oppo / LG: needs 'Roboto' (forces AOSP's original font instead of
 *     the OEM skin's substitute)
 *   - Everything else (Pixel, Samsung, Sony, etc.): leave the system
 *     default font alone - forcing a name here isn't needed and could
 *     introduce its own mismatch on devices that don't have this bug.
 *
 * Samsung's related truncation bug (certain exact character counts get
 * clipped) is a *different* mechanism - not a font substitution issue -
 * so it isn't fixed here. It's addressed separately via `letterSpacing`
 * on the same text styles, which is the documented workaround for that
 * specific bug.
 *
 * Uses Platform.constants, which is built into React Native's core Android
 * module - no extra native dependency required.
 */
export function androidButtonFontFamily(): string | undefined {
  if (Platform.OS !== 'android') return undefined;

  const manufacturer = (Platform.constants as any)?.Manufacturer?.toLowerCase?.() ?? '';

  if (manufacturer.includes('oneplus')) return 'Slate';
  if (manufacturer.includes('oppo') || manufacturer.includes('lge')) return 'Roboto';

  return undefined;
}
