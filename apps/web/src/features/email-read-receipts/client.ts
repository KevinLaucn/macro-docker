import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';

const emailHost: string = SERVER_HOSTS['email-service'];
const EMAIL_LINK_ID_HEADER = 'X-Email-Link-Id';

function emailLinkHeaders(linkId?: string): Record<string, string> | undefined {
  return linkId ? { [EMAIL_LINK_ID_HEADER]: linkId } : undefined;
}

export type ReadReceiptStatusData = {
  message_id: string;
  first_opened_at: string | null;
  last_opened_at: string | null;
  open_count: number;
};

export type ReadReceiptStatusesResponse = {
  statuses: ReadReceiptStatusData[];
};

export type ReadReceiptsPreferenceResponse = {
  read_receipts_enabled: boolean;
};

export type GlobalExtensionSettingsResponse = {
  email_open_tracking_enabled: boolean;
  email_tracking_pixel_blocking_enabled: boolean;
};

export const readReceiptsClient = {
  getStatuses(messageIds: string[]) {
    return fetchWithToken<ReadReceiptStatusesResponse>(
      `${emailHost}/email/messages/tracking`,
      {
        method: 'POST',
        body: JSON.stringify(messageIds),
      }
    );
  },

  getPreference(linkId?: string) {
    return fetchWithToken<ReadReceiptsPreferenceResponse>(
      `${emailHost}/email/settings/read-receipts`,
      {
        method: 'GET',
        headers: emailLinkHeaders(linkId),
      }
    );
  },

  setPreference(readReceiptsEnabled: boolean, linkId?: string) {
    return fetchWithToken<ReadReceiptsPreferenceResponse>(
      `${emailHost}/email/settings/read-receipts`,
      {
        method: 'PATCH',
        headers: emailLinkHeaders(linkId),
        body: JSON.stringify({
          read_receipts_enabled: readReceiptsEnabled,
        }),
      }
    );
  },

  getGlobalSettings(linkId?: string) {
    return fetchWithToken<GlobalExtensionSettingsResponse>(
      `${emailHost}/email/settings/extensions`,
      {
        method: 'GET',
        headers: emailLinkHeaders(linkId),
      }
    );
  },

  setGlobalOpenTracking(enabled: boolean, linkId?: string) {
    return fetchWithToken<GlobalExtensionSettingsResponse>(
      `${emailHost}/email/settings/extensions/open-tracking`,
      {
        method: 'PATCH',
        headers: emailLinkHeaders(linkId),
        body: JSON.stringify({
          email_open_tracking_enabled: enabled,
        }),
      }
    );
  },

  setGlobalPixelBlocking(enabled: boolean, linkId?: string) {
    return fetchWithToken<GlobalExtensionSettingsResponse>(
      `${emailHost}/email/settings/extensions/pixel-blocking`,
      {
        method: 'PATCH',
        headers: emailLinkHeaders(linkId),
        body: JSON.stringify({
          email_tracking_pixel_blocking_enabled: enabled,
        }),
      }
    );
  },
};
