import type { Brand, MemberId, Timestamp } from '../Consts.js';
export type FeatureId = Brand<string, 'FeatureId'>;
export type FeatureType = 'VFS' | 'KEYVALUE' | 'LIST' | 'CRDTLIST';

export type Feature = {
  featureId: FeatureId;
  featureType: FeatureType;
  featureName: string;
  featureEpoch: number;
  featureCreatedAt: Timestamp;
  featureCreatedById: MemberId | null;
  featureModifiedAt: Timestamp;
  featureModifiedById: MemberId | null;
  featureArchived: boolean;
  featureArchivedAt: Timestamp | null;
  featureToDelete: boolean;
};
