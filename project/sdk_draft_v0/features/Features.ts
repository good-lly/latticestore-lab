export type FeatureType = {
  featureName: string;
  featureClass: FeatureClass;
  featureKey: string;
  featureEtag: string;
};

export type FeatureClass = 'VFS' | 'KEYVALUE' | 'LIST' | 'CRDTLIST';

export class Feature implements FeatureType {
  featureName: string;
  featureClass: FeatureClass;
  featureKey: string;
  featureEtag: string;

  constructor(featureName: string, featureClass: FeatureClass, featureKey: string = '', featureEtag: string = '') {
    this.featureName = featureName;
    this.featureClass = featureClass;
    this.featureKey = featureKey;
    this.featureEtag = featureEtag;
  }

  // async init(): Promise<boolean> {}
}
