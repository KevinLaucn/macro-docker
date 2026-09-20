import { toast } from '@core/component/Toast/Toast';
import { t } from '@fork/i18n';
import type { Result } from '../types';

/**
 * Common error messages for consistency
 * Organized by category: properties, options, validation
 */
export const ERROR_MESSAGES = {
  // Property operations
  get PROPERTY_FETCH() {
    return t('Unable to load properties');
  },
  get PROPERTY_SAVE() {
    return t('Unable to save property');
  },
  get PROPERTY_DELETE() {
    return t('Unable to delete property');
  },
  get PROPERTY_ADD() {
    return t('Unable to add property');
  },
  get PROPERTY_CREATE() {
    return t('Unable to create property');
  },

  // Option operations
  get OPTION_FETCH() {
    return t('Unable to load options');
  },
  get OPTION_ADD() {
    return t('Unable to add option');
  },
  get OPTION_CREATE() {
    return t('Unable to create option');
  },

  // Validation
  get VALIDATION_REQUIRED() {
    return t('This field is required');
  },
  get VALIDATION_DUPLICATE() {
    return t('Duplicate values not allowed');
  },
  get VALIDATION_MIN_OPTIONS() {
    return t('At least one option required');
  },
} as const;

/**
 * Handles property operation errors consistently
 * - Logs error to console
 * - Shows toast notification to user
 * - Returns boolean indicating success/failure
 *
 * @param result - Result from property operation
 * @param errorMessage - User-friendly error message
 * @param context - Context for error logging (e.g., function name)
 * @returns true if operation succeeded, false otherwise
 */
function _handlePropertyError(
  result: Result<unknown>,
  errorMessage: string,
  context: string
): boolean {
  if (result.ok) {
    return true;
  }

  console.error(`${context}:`, result.error, errorMessage);
  toast.failure(errorMessage);
  return false;
}
