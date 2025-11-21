export type FeatureType = {
  featureName: string;
  featureTypes: FeatureTypes;
  featureKey: string;
  featureEtag: string;
};

export type FeatureTypes = 'VFS' | 'KEYVALUE' | 'LIST' | 'CRDTLIST';

export class Feature implements FeatureType {
  featureName: string;
  featureTypes: FeatureTypes;
  featureKey: string;
  featureEtag: string;

  constructor(featureName: string, featureTypes: FeatureTypes, featureKey: string = '', featureEtag: string = '') {
    this.featureName = featureName;
    this.featureTypes = featureTypes;
    this.featureKey = featureKey;
    this.featureEtag = featureEtag;
  }

  // async init(): Promise<boolean> {}
}
