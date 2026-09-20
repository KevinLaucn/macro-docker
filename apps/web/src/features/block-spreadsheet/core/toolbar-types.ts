import { t } from '@macro/i18n';
import type { SpreadsheetCell } from './spreadsheet-document';

export type SpreadsheetCommand =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'paste-values'
  | 'clear-values'
  | 'clear-formatting'
  | 'fill-down'
  | 'fill-right'
  | 'select-all'
  | 'find'
  | 'export-csv'
  | 'export-xlsx'
  | 'import'
  | 'add-rows'
  | 'toggle-gridlines'
  | 'toggle-formula-bar'
  | 'toggle-formulas'
  | 'sort-asc'
  | 'sort-desc'
  | 'trim-whitespace'
  | 'border-all'
  | 'border-outer'
  | 'border-none'
  | 'insert-sum'
  | 'insert-average'
  | 'insert-count'
  | 'insert-min'
  | 'insert-max';

export type SpreadsheetToolbarProps = {
  readonly: boolean;
  onComment?: () => void;
  canComment?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  cell: SpreadsheetCell | undefined;
  zoom: number;
  showGridlines: boolean;
  showFormulaBar: boolean;
  showFormulas: boolean;
  onStyle: (patch: Partial<Omit<SpreadsheetCell, 'value'>>) => void;
  onZoom: (percent: number) => void;
  onRestoreFocus?: () => void;
  onCommand: (command: SpreadsheetCommand) => void;
};

export const SPREADSHEET_ZOOM_LEVELS = [50, 75, 90, 100, 125, 150, 200];

export const SPREADSHEET_FUNCTIONS = [
  { name: 'SUM', command: 'insert-sum' as const, description: t('Add values') },
  {
    name: 'AVERAGE',
    command: 'insert-average' as const,
    description: t('Mean of values'),
  },
  {
    name: 'COUNT',
    command: 'insert-count' as const,
    description: t('Count numbers'),
  },
  {
    name: 'MIN',
    command: 'insert-min' as const,
    description: t('Smallest value'),
  },
  {
    name: 'MAX',
    command: 'insert-max' as const,
    description: t('Largest value'),
  },
];

export const SPREADSHEET_NUMBER_FORMATS = [
  { value: 'general' as const, label: t('Automatic'), example: '1,234.5' },
  { value: 'number' as const, label: t('Number'), example: '1,234.00' },
  { value: 'currency' as const, label: t('Currency'), example: '$1,234.00' },
  { value: 'percent' as const, label: t('Percent'), example: '12.50%' },
  { value: 'date' as const, label: t('Date'), example: '9/17/2026' },
  { value: 'time' as const, label: t('Time'), example: '12:30 PM' },
  { value: 'scientific' as const, label: t('Scientific'), example: '1.23E+03' },
  { value: 'text' as const, label: t('Plain text'), example: '1234' },
];
