export type FeatureType = {
  featureName: string;
  featureClass: FeatureClass;
  featureKey: string;
  featureEtag: string;
  enabled: boolean;
};

type FeatureClass = 'VFS' | 'KEYVALUE' | 'LIST' | 'CRDTLIST';
