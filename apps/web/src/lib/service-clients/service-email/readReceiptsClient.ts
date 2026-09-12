import type { ReadReceiptStatusData } from '@macro/fork-read-receipts/client';

export type {
  GlobalExtensionSettingsResponse,
  ReadReceiptStatusData,
  ReadReceiptStatusesResponse,
  ReadReceiptsPreferenceResponse,
} from '@macro/fork-read-receipts/client';
export { readReceiptsClient } from '@macro/fork-read-receipts/client';

export type ReadReceiptStatus = ReadReceiptStatusData;
