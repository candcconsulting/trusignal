import { BentleyStatus, Id64Array } from "@itwin/core-bentley";
import { GeometryContainmentRequestProps } from "@itwin/core-common";
import { IModelConnection, ScreenViewport, ViewClipTool } from "@itwin/core-frontend";
import { ClipMaskXYZRangePlanes, ClipPlaneContainment, ClipShape, ClipVector, Range3d } from "@itwin/core-geometry";
import { InstanceKey } from "@itwin/presentation-common";

export interface SpatialElement extends Record<string, string | undefined>, InstanceKey {
  name: string | undefined;
}

export enum SectionOfColoring {
  InsideTheBox = "Inside",
  OutsideTheBox = "Outside",
  Overlap = "Overlap",
}

export enum ElementPosition {
  InsideTheBox = "Inside",
  Overlap = "Overlap",
}

/* Getting elements that are inside or overlapping the given range*/
  export async function getSpatialElements(conn: IModelConnection, range: Range3d): Promise<SpatialElement[]> {
    const query = `SELECT e.ECInstanceId,  ec_classname(e.ECClassId, 's:c')  FROM bis.SpatialElement e JOIN bis.SpatialIndex i ON e.ECInstanceId=i.ECInstanceId WHERE i.MinX<=${range.xHigh} AND i.MinY<=${range.yHigh} AND i.MinZ<=${range.zHigh} AND i.MaxX >= ${range.xLow} AND i.MaxY >= ${range.yLow} AND i.MaxZ >= ${range.zLow}`;
    const elementsAsync = conn.query(query);
    const elements: SpatialElement[] = [];
    for await (const element of elementsAsync) {
      elements.push({ id: element[0], className: element[1], name: undefined });
    }

    return elements;
  }

  export async function getClassifiedElements(vp: ScreenViewport, conn: IModelConnection, candidates: SpatialElement[], range : Range3d ): Promise<Record<ElementPosition, SpatialElement[]> | undefined>{
    let vpclip = vp.view.getViewClip();
    if (vpclip === undefined) {
      const block: ClipShape = ClipShape.createBlock(range, range.isAlmostZeroZ ? ClipMaskXYZRangePlanes.XAndY : ClipMaskXYZRangePlanes.All, false, false);
    // Create the ClipVector
      const clip: ClipVector = ClipVector.createEmpty();
    // Add the box to the ClipVector and set it in the ScreenViewport.
      clip.appendReference(block);
    // Call enableClipVolume to ensure all clip flags are properly set
      ViewClipTool.enableClipVolume(vp);
    // Turning off the clipping feature.
      vp.view.viewFlags = vp.view.viewFlags.with("clipVolume", false);
      vp.view.setViewClip(clip);
      vpclip = vp.view.getViewClip();
    }      
    if (vpclip  === undefined)
      return;
    const candidatesId = candidates.map((candidate) => candidate.id) as Id64Array;

    const classifiedElements = {
      [ElementPosition.InsideTheBox]: [] as SpatialElement[],
      [ElementPosition.Overlap]: [] as SpatialElement[],
    };

    const requestProps: GeometryContainmentRequestProps = {
      candidates: candidatesId,
      clip: vpclip.toJSON(),
      allowOverlaps: true,
      viewFlags: vp.viewFlags.toJSON(),
    };

    const result = await conn.getGeometryContainment(requestProps);
    if (BentleyStatus.SUCCESS !== result.status || undefined === result.candidatesContainment)
      return;

    result.candidatesContainment.forEach((val: ClipPlaneContainment, index: number) => {
      switch (val) {
        case ClipPlaneContainment.StronglyInside:
          classifiedElements[ElementPosition.InsideTheBox].push(candidates[index]);
          break;
        case ClipPlaneContainment.Ambiguous:
          classifiedElements[ElementPosition.Overlap].push(candidates[index]);
          break;
      }
    });

    return classifiedElements;
  }
