/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

import { BentleyStatus, Id64Array } from "@itwin/core-bentley";
import { ColorDef, FeatureAppearance, GeometryContainmentRequestProps } from "@itwin/core-common";
import { EmphasizeElements, IModelApp, IModelConnection, ScreenViewport, ViewClipClearTool, ViewClipDecorationProvider, ViewClipTool} from "@itwin/core-frontend";
import { ClipMaskXYZRangePlanes, ClipPlaneContainment, ClipShape, ClipUtilities, ClipVector, Range3d } from "@itwin/core-geometry";
import { InstanceKey } from "@itwin/presentation-common";
import { PresentationLabelsProvider } from "@itwin/presentation-components";


/* Going to color elements from three different sections of volume box */
export enum SectionOfColoring {
  InsideTheBox = "Inside",
  OutsideTheBox = "Outside",
  Overlap = "Overlap",
}

/* Going to query and show elements only from two different sections of volume box */
export enum ElementPosition {
  InsideTheBox = "Inside",
  Overlap = "Overlap",
}

export interface SpatialElement extends Record<string, string | undefined>, InstanceKey {
  name: string | undefined;
}

export class VolumeQueryApi {

  /* Method for clearing all clips in the viewport */
  public static clearClips(vp: ScreenViewport) {
    // Run the ViewClipClearTool and hide the decorators
    void IModelApp.tools.run(ViewClipClearTool.toolId);
    void ViewClipDecorationProvider.create().toggleDecoration(vp);
  }

  /* Method for adding a new box range around the model's extents */
  public static addBoxRange = (vp: ScreenViewport, range?: Range3d, isClippingOn?: boolean) => {
    // Get the range of the model contents.
    if (range === undefined) {
      range = vp.view.computeFitRange();
      // Remove the top half of the z-range so we have smaller box
      range.high.z = (range.high.z + range.low.z) / 2.0;
    }
    // Create a box for the ClipVector.
    const block: ClipShape = ClipShape.createBlock(range, range.isAlmostZeroZ ? ClipMaskXYZRangePlanes.XAndY : ClipMaskXYZRangePlanes.All, false, false);
    // Create the ClipVector
    const clip: ClipVector = ClipVector.createEmpty();
    // Add the box to the ClipVector and set it in the ScreenViewport.
    clip.appendReference(block);
    // Call enableClipVolume to ensure all clip flags are properly set
    ViewClipTool.enableClipVolume(vp);
    // Turning off the clipping feature.
    vp.view.viewFlags = vp.view.viewFlags.with("clipVolume", isClippingOn === undefined ? false : isClippingOn);
    vp.view.setViewClip(clip);
    VolumeQueryApi.addDecorators(vp);
  };

  /* Method for adding decorators to the viewport */
  public static addDecorators(vp: ScreenViewport) {
    // Create a clip decorator. Selecting the clip decoration to immediately show the handles is the default.
    const decorationProvider: ViewClipDecorationProvider = ViewClipDecorationProvider.create();
    // Default behavior is to hide the decorators on deselect. We want to keep the decorators showing in this example.
    decorationProvider.clearDecorationOnDeselect = false;
    decorationProvider.showDecoration(vp);
    // The decorators require the SelectTool being active.
    void IModelApp.toolAdmin.startDefaultTool();
  }

  /* Clear color from colored elements */
  public static clearColorOverrides(vp: ScreenViewport) {
    EmphasizeElements.getOrCreate(vp).clearOverriddenElements(vp);
  }

  /* Getting elements names */
  public static async getSpatialElementsWithName(vp: ScreenViewport, elements: SpatialElement[]): Promise<SpatialElement[]> {
    const presentationProvider = new PresentationLabelsProvider({ imodel: vp.iModel });
    const elementsNames: string[] = await presentationProvider.getLabels(elements);
    for (let i = 0; i < elements.length; i++)
      elements[i].name = elementsNames[i];

    return elements;
  }

  /* Getting elements that are inside or overlapping the given range*/
  public static async getSpatialElements(conn: IModelConnection, range: Range3d): Promise<SpatialElement[]> {
    const query = `SELECT e.ECInstanceId,  ec_classname(e.ECClassId, 's:c')  FROM bis.SpatialElement e JOIN bis.SpatialIndex i ON e.ECInstanceId=i.ECInstanceId WHERE i.MinX<=${range.xHigh} AND i.MinY<=${range.yHigh} AND i.MinZ<=${range.zHigh} AND i.MaxX >= ${range.xLow} AND i.MaxY >= ${range.yLow} AND i.MaxZ >= ${range.zLow}`;
    const elementsAsync = conn.query(query);
    const elements: SpatialElement[] = [];
    for await (const element of elementsAsync) {
      elements.push({ id: element[0], className: element[1], name: undefined });
    }

    return elements;
  }

  /* Classify given elements - inside and overlapping. What is left are going to be outside the box*/
  public static async getClassifiedElements(vp: ScreenViewport, conn: IModelConnection, candidates: SpatialElement[]): Promise<Record<ElementPosition, SpatialElement[]> | undefined> {
    const clip = vp.view.getViewClip();
    if (clip === undefined)
      return;

    const candidatesId = candidates.map((candidate) => candidate.id) as Id64Array;

    const classifiedElements = {
      [ElementPosition.InsideTheBox]: [] as SpatialElement[],
      [ElementPosition.Overlap]: [] as SpatialElement[],
    };

    const requestProps: GeometryContainmentRequestProps = {
      candidates: candidatesId,
      clip: clip.toJSON(),
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

  /* Getting range of the clip */
  public static computeClipRange(viewport: ScreenViewport): Range3d {
    const range = viewport.computeViewRange();
    const clip = viewport.view.getViewClip();
    if (undefined !== clip) {
      const clipRange = ClipUtilities.rangeOfClipperIntersectionWithRange(clip, range);
      if (!clipRange.isNull)
        range.setFrom(clipRange);
    }

    return range;
  }

  public static async colorClassifiedElements(vp: ScreenViewport, classifiedElements: Record<ElementPosition, SpatialElement[]>, colors: Record<SectionOfColoring, ColorDef>) {
    EmphasizeElements.getOrCreate(vp).overrideElements(classifiedElements[SectionOfColoring.InsideTheBox].map((x) => x.id), vp, colors[SectionOfColoring.InsideTheBox]);
    EmphasizeElements.getOrCreate(vp).overrideElements(classifiedElements[SectionOfColoring.Overlap].map((x) => x.id), vp, colors[SectionOfColoring.Overlap]);
    /* All elements that are not overridden are outside the box by default. So to color them we don't need to have elements ids.
    This is done so we would not need to query large amount of elements that are outside the box */
    EmphasizeElements.getOrCreate(vp).defaultAppearance = FeatureAppearance.fromRgb(colors[SectionOfColoring.OutsideTheBox]);
  }

}
