import { storageServiceClient } from '@service-storage/client';

export function createCollabSurfaceToken(surfaceId: string) {
  return storageServiceClient.collabSurfaces.createToken({ id: surfaceId });
}
