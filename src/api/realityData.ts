import { Id64String } from "@itwin/core-bentley";
import { RealityDataFormat, RealityDataSourceKey } from "@itwin/core-common";
import { IModelConnection, RealityDataSource, SpatialModelState } from "@itwin/core-frontend";

export interface IRealityDataModelInfo {
  key: RealityDataSourceKey;
  // The id of the reality data model in the iModel
  modelId: Id64String;
  // The realityData model url on ContextShare
  attachmentUrl: string;
  // The realityData model url on ContextShare
  blobFilename?: string;
  // The name of the reality data in the model name
  attachmentName: string;
}

export class RealityDataManager {
  public async getAttachedRealityDataModelInfoSet(iModel: IModelConnection): Promise<Set<IRealityDataModelInfo> > {
    // Get set of RealityDataModelInfo that are directly attached to the model.
    const modelRealityDataInfos = new Set<IRealityDataModelInfo>();
    if (iModel) {
      const query = { from: SpatialModelState.classFullName, wantPrivate: false };
      const iModelProps = await iModel.models.queryProps(query);
      console.log(`Found ${iModelProps.length} reality attachments`)
      for (const prop of iModelProps) {
        if (prop.jsonProperties !== undefined && (prop.jsonProperties.tilesetUrl || prop.jsonProperties.orbitGtBlob) && prop.id !== undefined && prop.name) {
          const attachmentUrl = this.getAttachmentURLFromModelProps(prop.jsonProperties);
          if (attachmentUrl !== undefined && attachmentUrl.rdsUrl !== undefined) {
            let fileFormat = RealityDataFormat.ThreeDTile;
            if (prop.jsonProperties.orbitGtBlob)
              fileFormat = RealityDataFormat.OPC;
            const key = RealityDataSource.createKeyFromUrl(attachmentUrl.rdsUrl, undefined, fileFormat);
            modelRealityDataInfos.add({key, modelId: prop.id, attachmentUrl: attachmentUrl.rdsUrl, attachmentName: prop.name});
          }
        } else if (prop.jsonProperties !== undefined && prop.jsonProperties.rdSourceKey !== undefined && prop.id !== undefined && prop.name) {
          const key: RealityDataSourceKey = prop.jsonProperties.rdSourceKey;
          const rdDataSource = await RealityDataSource.fromKey(key, iModel.iTwinId);
          const attachmentUrl = await rdDataSource?.getServiceUrl(iModel.iTwinId);
          if (attachmentUrl)
            modelRealityDataInfos.add({key, modelId: prop.id, attachmentUrl, attachmentName: prop.name});
        }
      }
    }
    return modelRealityDataInfos;
  }
  private getAttachmentURLFromModelProps(modelProps: any): {rdsUrl: string | undefined} {
    // Special case for OPC file
    if (modelProps.tilesetUrl !== undefined && modelProps.tilesetUrl.orbitGtBlob !== undefined ) {
      return {rdsUrl: modelProps.tilesetUrl.orbitGtBlob.rdsUrl};
    } else if (modelProps.orbitGtBlob !== undefined && modelProps.orbitGtBlob.rdsUrl ) {
      return {rdsUrl: modelProps.orbitGtBlob.rdsUrl};
    }
    return {rdsUrl: modelProps.tilesetUrl};
  }
}

export {}